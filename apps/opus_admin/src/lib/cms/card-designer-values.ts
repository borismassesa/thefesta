import { CARD_FIELD_ROLE_KEYS } from '@opusfesta/lib'

export type MergeCardDesignerValuesResult =
  | { ok: true; values: Record<string, string> }
  | { ok: false; error: string }

/**
 * Merge a designer edit into the stored card values.
 *
 * Shared by the two admin write paths (saveDesignFieldValues and
 * saveAndPublishReleasedDesign) so the role-key check and the
 * blank-means-delete rule stay identical between saving and publishing.
 *
 * It does NOT make this column's rules uniform everywhere. The couple-side
 * writers in opus_pass (lib/dashboard/card-details.ts) deliberately differ:
 * they validate against requested_fields rather than every known role, and a
 * blank submission there means "skip", not "delete".
 */
export function mergeCardDesignerValues(
  current: Record<string, string> | null,
  updates: Record<string, string>,
): MergeCardDesignerValuesResult {
  const merged = { ...(current ?? {}) }
  for (const [role, value] of Object.entries(updates)) {
    if (!CARD_FIELD_ROLE_KEYS.includes(role)) {
      return { ok: false, error: `"${role}" is not a known card field.` }
    }
    const trimmed = String(value ?? '').trim()
    // An emptied field is a removal, not a stored empty string — otherwise
    // "answered" counts would include blanks.
    if (trimmed) merged[role] = trimmed
    else delete merged[role]
  }
  return { ok: true, values: merged }
}
