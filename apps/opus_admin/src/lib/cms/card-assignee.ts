import type { createSupabaseAdminClient } from '@/lib/supabase'

/**
 * Whether a card may be handed to this person, and what to call them.
 *
 * Lives here rather than in the designer's actions.ts, and that placement is
 * load-bearing. actions.ts is guarded by a test asserting it never queries
 * workforce_employees directly, because the two-eyes gate needs exactly ONE way
 * to ask "who is this card assigned to" — checkSelfReview — and a second,
 * unchecked lookup next to it is how that gate stops being fail-closed.
 *
 * This asks a genuinely different question ("is this a valid person to assign
 * TO"), but the guard cannot tell the two apart by reading the file, and a
 * guard that has to be loosened to accommodate each new caller stops guarding
 * anything. Keeping this module separate leaves the invariant exactly as strict
 * as it was.
 *
 * Fails closed on a failed read, for the same reason checkSelfReview does: a
 * lookup that could not run is not a lookup that said yes.
 */
export type AssigneeCheck =
  | { ok: true; name: string }
  | { ok: false; error: string }

export async function resolveAssignableEmployee(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  employeeId: string,
): Promise<AssigneeCheck> {
  const { data, error } = await supabase
    .from('workforce_employees')
    .select('full_name, dashboard_access')
    .eq('id', employeeId)
    .maybeSingle<{ full_name: string | null; dashboard_access: boolean }>()

  if (error) {
    return { ok: false, error: 'Could not check who that is. Try again in a moment.' }
  }
  if (!data) {
    return { ok: false, error: 'That person is not in the employee directory.' }
  }
  // Someone without dashboard access cannot open the job, so assigning it to
  // them would park the card with a person unable to touch it — while still
  // barring them from approving it, which is the one thing they could not do
  // anyway. Both halves of that are bad, so refuse rather than warn.
  if (!data.dashboard_access) {
    return {
      ok: false,
      error: 'That person has no admin access, so they could not open this card. Grant access first.',
    }
  }
  return { ok: true, name: data.full_name?.trim() || 'an unnamed employee' }
}
