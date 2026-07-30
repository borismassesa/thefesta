'use server'

import { revalidatePath } from 'next/cache'
import { submitCardDetails } from '@/lib/dashboard/card-details'

export async function saveCardDetails(
  designId: string,
  answers: Record<string, string>,
): Promise<{ ok: true; remaining: number } | { ok: false; error: string }> {
  // Ownership and the allowed-role check both live in submitCardDetails, so
  // this stays a thin boundary rather than a second place to keep in sync.
  const result = await submitCardDetails(designId, answers)
  if (result.ok) revalidatePath('/my/dashboard/card-details')
  return result
}
