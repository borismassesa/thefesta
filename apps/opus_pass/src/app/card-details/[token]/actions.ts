'use server'

import { revalidatePath } from 'next/cache'
import { submitCardDetailsByToken } from '@/lib/dashboard/card-details'

/**
 * Bound to a token by the page (`saveByToken.bind(null, token)`), so the
 * browser never supplies which design it is writing to — the token in the URL
 * decides, and it is re-resolved server-side on every call.
 */
export async function saveByToken(
  token: string,
  _target: { orderId: string; lineIndex: number },
  answers: Record<string, string>,
): Promise<{ ok: true; filled: number } | { ok: false; error: string }> {
  const result = await submitCardDetailsByToken(token, answers)
  if (result.ok) revalidatePath(`/card-details/${token}`)
  return result
}
