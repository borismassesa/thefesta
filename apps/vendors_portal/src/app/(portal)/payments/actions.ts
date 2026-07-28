'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { ensureLiveVendor } from '../storefront/sections/actions'

// Vendor earnings — the read side of product commerce for the vendor. Same
// trust model as the storefront actions: ensureLiveVendor() proves the caller
// owns the vendor, then the service-role client reads scoped to that vendor id
// (vendor_earnings + product_order_lines both also carry vendor RLS). Money is
// collected by OpusFesta; each earning row is the vendor's 88% net after the
// platform fee, sitting 'pending' until finance settles it in the weekly batch.

export type EarningLine = { name: string; quantity: number; lineTotalTzs: number }

export type VendorEarning = {
  id: string
  orderId: string
  grossTzs: number
  commissionPct: number
  commissionTzs: number
  netTzs: number
  status: 'pending' | 'paid_out'
  paidOutAt: string | null
  payoutReference: string | null
  createdAt: string
  lines: EarningLine[]
}

export type PayoutMethod = {
  methodType: string
  provider: string | null
  accountNumber: string
  accountHolderName: string
  status: string
}

export type EarningsData = {
  earnings: VendorEarning[]
  /** Vendor 88% net still awaiting payout — the "available / in transit" balance. */
  pendingNetTzs: number
  /** Vendor 88% net already paid out, all time. */
  paidOutNetTzs: number
  /** Lifetime gross the vendor's products have transacted. */
  lifetimeGrossTzs: number
  /** Platform fee OpusFesta has kept, all time (the 12%). */
  platformFeeTzs: number
  payoutMethod: PayoutMethod | null
  /** Set when the vendor has already requested a payout of the current pending
   *  balance — the earliest request stamp among their pending earnings. */
  payoutRequestedAt: string | null
}

const EMPTY: EarningsData = {
  earnings: [],
  pendingNetTzs: 0,
  paidOutNetTzs: 0,
  lifetimeGrossTzs: 0,
  platformFeeTzs: 0,
  payoutMethod: null,
  payoutRequestedAt: null,
}

type EarningRow = {
  id: string
  order_id: string
  gross_tzs: string | number
  commission_pct: string | number
  commission_tzs: string | number
  net_tzs: string | number
  status: 'pending' | 'paid_out'
  paid_out_at: string | null
  payout_reference: string | null
  payout_requested_at: string | null
  created_at: string
}

type LineRow = {
  order_id: string
  quantity: number
  line_total_tzs: number
  product_snapshot: { name?: string } | null
}

export async function loadVendorEarnings(): Promise<EarningsData> {
  const guard = await ensureLiveVendor()
  if (!guard.ok) return EMPTY
  const admin = createSupabaseAdminClient()

  const [{ data: earningRows }, { data: lineRows }, { data: methodRow }] = await Promise.all([
    admin
      .from('vendor_earnings')
      .select('id, order_id, gross_tzs, commission_pct, commission_tzs, net_tzs, status, paid_out_at, payout_reference, payout_requested_at, created_at')
      .eq('vendor_id', guard.vendorId)
      .order('created_at', { ascending: false })
      .returns<EarningRow[]>(),
    admin
      .from('product_order_lines')
      .select('order_id, quantity, line_total_tzs, product_snapshot')
      .eq('vendor_id', guard.vendorId)
      .returns<LineRow[]>(),
    admin
      .from('vendor_payout_methods')
      .select('method_type, provider, account_number, account_holder_name, status, is_default')
      .eq('vendor_id', guard.vendorId)
      .order('is_default', { ascending: false })
      .limit(1)
      .maybeSingle<{
        method_type: string
        provider: string | null
        account_number: string
        account_holder_name: string
        status: string
        is_default: boolean
      }>(),
  ])

  const linesByOrder = new Map<string, EarningLine[]>()
  for (const l of lineRows ?? []) {
    const list = linesByOrder.get(l.order_id) ?? []
    list.push({
      name: l.product_snapshot?.name ?? 'Product',
      quantity: l.quantity,
      lineTotalTzs: Number(l.line_total_tzs) || 0,
    })
    linesByOrder.set(l.order_id, list)
  }

  const earnings: VendorEarning[] = (earningRows ?? []).map((e) => ({
    id: e.id,
    orderId: e.order_id,
    grossTzs: Number(e.gross_tzs) || 0,
    commissionPct: Number(e.commission_pct) || 0,
    commissionTzs: Number(e.commission_tzs) || 0,
    netTzs: Number(e.net_tzs) || 0,
    status: e.status,
    paidOutAt: e.paid_out_at,
    payoutReference: e.payout_reference,
    createdAt: e.created_at,
    lines: linesByOrder.get(e.order_id) ?? [],
  }))

  const pendingRows = (earningRows ?? []).filter((e) => e.status === 'pending')
  const pendingNetTzs = earnings.filter((e) => e.status === 'pending').reduce((s, e) => s + e.netTzs, 0)
  const paidOutNetTzs = earnings.filter((e) => e.status === 'paid_out').reduce((s, e) => s + e.netTzs, 0)
  const lifetimeGrossTzs = earnings.reduce((s, e) => s + e.grossTzs, 0)
  const platformFeeTzs = earnings.reduce((s, e) => s + e.commissionTzs, 0)

  // Requested when EVERY pending earning carries a request stamp (a fresh sale
  // after a request is un-requested until the vendor asks again). Earliest
  // stamp is the request time shown to the vendor.
  const requestedStamps = pendingRows.map((e) => e.payout_requested_at).filter(Boolean) as string[]
  const payoutRequestedAt =
    pendingRows.length > 0 && requestedStamps.length === pendingRows.length
      ? requestedStamps.sort()[0]
      : null

  return {
    earnings,
    pendingNetTzs,
    paidOutNetTzs,
    lifetimeGrossTzs,
    platformFeeTzs,
    payoutRequestedAt,
    payoutMethod: methodRow
      ? {
          methodType: methodRow.method_type,
          provider: methodRow.provider,
          accountNumber: methodRow.account_number,
          accountHolderName: methodRow.account_holder_name,
          status: methodRow.status,
        }
      : null,
  }
}

export type RequestPayoutResult =
  | { ok: true }
  | { ok: false; error: string; reason: 'unauth' | 'no_method' | 'nothing' | 'unknown' }

/**
 * Vendor requests a payout of their available (pending) balance — stamps every
 * un-requested pending earning so finance settles it in the next weekly batch.
 * A payout method must be on file first (finance needs somewhere to send it).
 * This does NOT move money; settlement stays manual until a disbursement rail
 * is wired.
 */
export async function requestPayout(): Promise<RequestPayoutResult> {
  const guard = await ensureLiveVendor()
  if (!guard.ok) return { ok: false, error: 'Not signed in.', reason: 'unauth' }
  const admin = createSupabaseAdminClient()

  const { data: method } = await admin
    .from('vendor_payout_methods')
    .select('id')
    .eq('vendor_id', guard.vendorId)
    .limit(1)
    .maybeSingle<{ id: string }>()
  if (!method) {
    return { ok: false, error: 'Add a payout method before requesting a payout.', reason: 'no_method' }
  }

  const { data: updated, error } = await admin
    .from('vendor_earnings')
    .update({ payout_requested_at: new Date().toISOString() })
    .eq('vendor_id', guard.vendorId)
    .eq('status', 'pending')
    .is('payout_requested_at', null)
    .select('id')
  if (error) return { ok: false, error: 'Could not request the payout. Try again.', reason: 'unknown' }
  if (!updated || updated.length === 0) {
    return { ok: false, error: 'Nothing new to request right now.', reason: 'nothing' }
  }

  revalidatePath('/payments')
  return { ok: true }
}

// ── Payout method management ────────────────────────────────────────────────

export const PAYOUT_METHOD_TYPES = ['mpesa', 'airtel', 'tigo', 'lipa_namba', 'bank'] as const
export type PayoutMethodType = (typeof PAYOUT_METHOD_TYPES)[number]

export type SavePayoutMethodResult =
  | { ok: true }
  | { ok: false; error: string }

function clean(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * Add or update the vendor's default payout method (where OpusFesta sends the
 * weekly payout). One default per vendor (idx_vpm_vendor_default), so this
 * updates the existing default in place or inserts the first one. Saving resets
 * status to 'pending' — finance re-verifies the account name before paying.
 */
export async function savePayoutMethod(formData: FormData): Promise<SavePayoutMethodResult> {
  const guard = await ensureLiveVendor()
  if (!guard.ok) return { ok: false, error: 'Not signed in.' }

  const methodType = clean(formData.get('method_type'))
  const accountNumber = clean(formData.get('account_number'))
  const accountHolderName = clean(formData.get('account_holder_name'))
  const provider = clean(formData.get('provider')) || null

  if (!PAYOUT_METHOD_TYPES.includes(methodType as PayoutMethodType)) {
    return { ok: false, error: 'Choose a payout method.' }
  }
  if (accountNumber.length < 3) return { ok: false, error: 'Enter the account or number.' }
  if (accountHolderName.length < 2) return { ok: false, error: 'Enter the account holder name.' }

  const admin = createSupabaseAdminClient()
  const { data: existing } = await admin
    .from('vendor_payout_methods')
    .select('id')
    .eq('vendor_id', guard.vendorId)
    .eq('is_default', true)
    .maybeSingle<{ id: string }>()

  const values = {
    method_type: methodType,
    provider,
    account_number: accountNumber,
    account_holder_name: accountHolderName,
    status: 'pending' as const,
    updated_at: new Date().toISOString(),
  }

  const { error } = existing
    ? await admin.from('vendor_payout_methods').update(values).eq('id', existing.id)
    : await admin
        .from('vendor_payout_methods')
        .insert({ ...values, vendor_id: guard.vendorId, is_default: true })
  if (error) return { ok: false, error: 'Could not save the payout method. Try again.' }

  revalidatePath('/payments')
  return { ok: true }
}
