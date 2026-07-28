import { createSupabaseAdminClient } from '@/lib/supabase'

// Vendor payouts — what OpusFesta owes each product vendor. Earnings rows are
// created by finalize_product_order (order total minus commission) and sit
// 'pending' until finance pays the vendor manually and marks them 'paid_out'.

export type VendorPayout = {
  vendorId: string
  vendorName: string
  /** Pending vendor net (what OpusFesta owes) — gross minus the platform fee. */
  pendingTzs: number
  /** Pending gross (order value) and the platform fee kept from it, so the
   *  12%/88% split is visible and reconcilable on the payout row. */
  pendingGrossTzs: number
  pendingFeeTzs: number
  pendingCount: number
  paidOutTzs: number
  /** Pending earning ids — the set markEarningsPaid settles in one go. */
  pendingIds: string[]
  payoutMethod: { type: string; account: string; holder: string } | null
  /** Earliest time the vendor asked to be paid (null = they haven't). Finance
   *  sorts requested vendors first. */
  requestedAt: string | null
}

type EarningRow = {
  id: string
  vendor_id: string
  gross_tzs: string | number
  commission_tzs: string | number
  net_tzs: string | number
  status: 'pending' | 'paid_out'
  payout_requested_at: string | null
  vendor: { business_name: string | null } | null
}

type PayoutMethodRow = {
  vendor_id: string
  method_type: string
  account_number: string | null
  account_holder_name: string | null
}

export async function getVendorPayouts(): Promise<VendorPayout[]> {
  const supabase = createSupabaseAdminClient()
  const { data: earnings } = await supabase
    .from('vendor_earnings')
    .select('id, vendor_id, gross_tzs, commission_tzs, net_tzs, status, payout_requested_at, vendor:vendors(business_name)')
    .order('created_at', { ascending: false })
    .returns<EarningRow[]>()
  if (!earnings || earnings.length === 0) return []

  const byVendor = new Map<string, VendorPayout>()
  for (const e of earnings) {
    const net = Number(e.net_tzs) || 0
    const gross = Number(e.gross_tzs) || 0
    const fee = Number(e.commission_tzs) || 0
    const existing =
      byVendor.get(e.vendor_id) ??
      {
        vendorId: e.vendor_id,
        vendorName: e.vendor?.business_name ?? 'Vendor',
        pendingTzs: 0,
        pendingGrossTzs: 0,
        pendingFeeTzs: 0,
        pendingCount: 0,
        paidOutTzs: 0,
        pendingIds: [],
        payoutMethod: null,
        requestedAt: null,
      }
    if (e.status === 'pending') {
      existing.pendingTzs += net
      existing.pendingGrossTzs += gross
      existing.pendingFeeTzs += fee
      existing.pendingCount += 1
      existing.pendingIds.push(e.id)
      // Track the earliest request stamp among this vendor's pending earnings.
      if (e.payout_requested_at && (!existing.requestedAt || e.payout_requested_at < existing.requestedAt)) {
        existing.requestedAt = e.payout_requested_at
      }
    } else {
      existing.paidOutTzs += net
    }
    byVendor.set(e.vendor_id, existing)
  }

  // Attach each vendor's default (or first) payout method.
  const vendorIds = [...byVendor.keys()]
  const { data: methods } = await supabase
    .from('vendor_payout_methods')
    .select('vendor_id, method_type, account_number, account_holder_name, is_default')
    .in('vendor_id', vendorIds)
    .order('is_default', { ascending: false })
    .returns<(PayoutMethodRow & { is_default: boolean })[]>()
  for (const m of methods ?? []) {
    const v = byVendor.get(m.vendor_id)
    if (v && !v.payoutMethod) {
      v.payoutMethod = {
        type: m.method_type,
        account: m.account_number ?? '',
        holder: m.account_holder_name ?? '',
      }
    }
  }

  // Vendors who asked to be paid first, then any owed, then by pending amount.
  return [...byVendor.values()].sort(
    (a, b) =>
      Number(Boolean(b.requestedAt)) - Number(Boolean(a.requestedAt)) ||
      Number(b.pendingCount > 0) - Number(a.pendingCount > 0) ||
      b.pendingTzs - a.pendingTzs,
  )
}

export async function getPayoutsSummary(): Promise<{
  pendingTzs: number
  vendorsOwed: number
  paidOutTzs: number
  /** OpusFesta's cut on the pending orders (the platform commission kept). */
  platformFeeTzs: number
}> {
  const payouts = await getVendorPayouts()
  return {
    pendingTzs: payouts.reduce((s, p) => s + p.pendingTzs, 0),
    vendorsOwed: payouts.filter((p) => p.pendingCount > 0).length,
    paidOutTzs: payouts.reduce((s, p) => s + p.paidOutTzs, 0),
    platformFeeTzs: payouts.reduce((s, p) => s + p.pendingFeeTzs, 0),
  }
}
