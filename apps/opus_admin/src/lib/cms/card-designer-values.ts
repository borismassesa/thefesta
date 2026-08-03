import { CARD_FIELD_ROLE_KEYS } from '@opusfesta/lib'

export type MergeCardDesignerValuesResult =
  | { ok: true; values: Record<string, string> }
  | { ok: false; error: string }

/**
 * Merge a designer edit into the stored card values.
 *
 * Kept outside the server action so saving a draft and publishing an updated
 * release cannot drift into subtly different validation rules.
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
