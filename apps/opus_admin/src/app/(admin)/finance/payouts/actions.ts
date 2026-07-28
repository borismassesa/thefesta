'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getCallerEmail, requirePermission } from '@/lib/admin-auth'

function clean(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Settle a vendor's pending earnings — marks the given earning rows paid_out
 * after finance has actually sent the money (via the vendor's payout method).
 * The earning ids come from the row's pending set (see getVendorPayouts).
 */
export async function markEarningsPaid(formData: FormData): Promise<void> {
  await requirePermission('finance.write')

  const ids = clean(formData.get('ids'))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (ids.length === 0) throw new Error('No earnings selected.')
  const reference = clean(formData.get('reference'))
  const note = clean(formData.get('note'))
  const paidBy = (await getCallerEmail()) ?? 'admin'

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('vendor_earnings')
    .update({
      status: 'paid_out',
      paid_out_at: new Date().toISOString(),
      paid_out_by: paidBy,
      payout_reference: reference || null,
      payout_note: note || null,
    })
    .in('id', ids)
    .eq('status', 'pending')
  if (error) throw new Error(error.message)

  revalidatePath('/finance/payouts')
}
