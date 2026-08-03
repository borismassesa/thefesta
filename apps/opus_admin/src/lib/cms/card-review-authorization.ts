import type { createSupabaseAdminClient } from '@/lib/supabase'

/**
 * Whether the caller is the person a card design is assigned to.
 *
 * Three outcomes, not two. The old two-outcome version collapsed "the read
 * failed" into "not the assignee", which meant a timeout, an RLS denial or a
 * schema-cache hiccup silently OPENED the two-eyes gate: the one moment we
 * could not establish who owns the card was the moment we stopped enforcing
 * that someone else approves it. A gate whose failure mode is "allow" is not a
 * gate.
 *
 * A missing row stays permissive on purpose and is a different fact: the read
 * succeeded and returned nothing, so the staff member was deleted from the
 * directory. Refusing there would strand the card with nobody able to release
 * it. The distinction only exists because we now look at `error`.
 */
export type SelfReviewCheck =
  | { ok: true; isSelf: boolean }
  | { ok: false; error: string }

type EmployeeRow = { email: string | null }

export async function checkSelfReview(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  assignedTo: string | null,
  callerEmail: string,
): Promise<SelfReviewCheck> {
  const caller = callerEmail.trim().toLowerCase()
  if (!caller) {
    // Callers resolve the author before reaching here, so this is unreachable
    // through the UI. It still fails closed rather than trusting that.
    return {
      ok: false,
      error: 'We could not tell who you are signed in as, so this card was not approved.',
    }
  }
  // Unassigned is a real answer, not a missing one: nobody owns the card, so
  // nobody is reviewing their own work.
  if (!assignedTo) return { ok: true, isSelf: false }

  const { data, error } = await supabase
    .from('workforce_employees')
    .select('email')
    .eq('id', assignedTo)
    .maybeSingle<EmployeeRow>()
  if (error) {
    return {
      ok: false,
      error: `We could not check who this card is assigned to, so it was not approved. Try again in a moment. (${error.message})`,
    }
  }

  const assigneeEmail = (data?.email ?? '').trim().toLowerCase()
  return { ok: true, isSelf: Boolean(assigneeEmail) && assigneeEmail === caller }
}
