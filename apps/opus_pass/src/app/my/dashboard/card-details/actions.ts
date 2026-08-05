'use server'

import { revalidatePath } from 'next/cache'
import { requestCardChange, submitCardDetails } from '@/lib/dashboard/card-details'

export async function saveCardDetails(
  target: { orderId: string; lineIndex: number },
  answers: Record<string, string>,
): Promise<{ ok: true; filled: number } | { ok: false; error: string }> {
  // Ownership, the paid-purchase check and the allowed-field check all live in
  // submitCardDetails, so this stays a thin boundary rather than a second place
  // to keep in sync.
  const result = await submitCardDetails(target.orderId, target.lineIndex, answers)
  if (result.ok) {
    revalidatePath('/my/dashboard/card-details')
    // The Send invites waiting state counts cards with something still blank.
    revalidatePath('/my/dashboard/invitations')
  }
  return result
}

/**
 * Ask the design team to change a card that has already been released.
 *
 * Thin, for the same reason as above: ownership, the locked-only rule and the
 * "do not touch the release" guarantee all live in requestCardChange.
 */
export async function askForCardChange(
  target: { orderId: string; lineIndex: number },
  message: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await requestCardChange(target.orderId, target.lineIndex, message)
  if (result.ok) revalidatePath('/my/dashboard/card-details')
  return result
}
