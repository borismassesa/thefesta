// Presentation-only helpers for the artwork mapping screen.
//
// Two jobs, both pure and both derived from state that already exists:
//
//   groupLayerRows  — sorts the layer rows into the same sections the couple's
//                     form uses, so a 24-row wall reads as six short lists.
//   isLightColour   — decides whether a swatch needs a darker outline to stay
//                     visible against a white page.
//
// Nothing here is persisted. The saved mapping is still a flat list of
// role→layer bindings built in LayerMapper; grouping changes how those rows are
// DISPLAYED and nothing else.

import { CARD_FIELD_ROLES, type CardFieldRole } from '@opusfesta/lib'

/**
 * A layer with no role yet.
 *
 * Deliberately its own bucket rather than a guess. The mapper offers content
 * inferences ("Looks like Couple name 1") but never applies them on its own,
 * and filing an unconfirmed layer under 'Couple' would present that inference
 * as a decision the admin had already taken. See the suggestion/auto-apply
 * split in card-field-roles.ts.
 */
export const UNASSIGNED = 'Unassigned'

export type LayerGroupKey = CardFieldRole['group'] | typeof UNASSIGNED

/** Reading order of the card, matching CARD_FIELD_ROLES. */
export const LAYER_GROUP_ORDER: CardFieldRole['group'][] = [
  'Hosts',
  'Couple',
  'Date',
  'Venue',
  'Contacts',
  'Design',
]

export type LayerRow = {
  id: string
  sample: string
  /** Neutral secondary detail, shown beside the layer id. */
  meta?: string | null
  /** Something the admin should notice, shown in amber. */
  note: string | null
  /** Hex fill for a colour layer, so the row can show a swatch. */
  swatch?: string | null
}

export type LayerGroup<Row extends LayerRow = LayerRow> = {
  key: LayerGroupKey
  rows: Row[]
  /**
   * How much of this group's schema the card covers, or null for Unassigned,
   * which has no canonical roles to be a fraction of.
   *
   * Counted across the WHOLE mapping rather than the rows in this section: the
   * question an admin is asking is "is the Date section of this card complete",
   * and the answer does not change depending on whether the month happens to
   * have been exported as text or as a bitmap.
   */
  coverage: { mapped: number; total: number } | null
}

/** How many canonical roles each group defines. Fixed by the schema. */
const GROUP_TOTALS: Record<string, number> = CARD_FIELD_ROLES.reduce<Record<string, number>>(
  (totals, role) => {
    totals[role.group] = (totals[role.group] ?? 0) + 1
    return totals
  },
  {},
)

const ROLE_GROUP: Record<string, CardFieldRole['group']> = Object.fromEntries(
  CARD_FIELD_ROLES.map((role) => [role.key, role.group]),
)

/**
 * Sort layer rows into their assigned role's group.
 *
 * `assignment` is layerId→roleKey, the same live map the selects edit, so a row
 * moves the moment an admin picks a role. That move is the confirmation being
 * reflected, not a surprise: nothing moves on its own.
 *
 * Row order inside a group is the order they were passed in, which is document
 * order in the artwork. Groups are returned in card reading order with
 * Unassigned last, and a group with no rows is omitted entirely.
 */
export function groupLayerRows<Row extends LayerRow>(
  rows: Row[],
  assignment: Record<string, string>,
): LayerGroup<Row>[] {
  const buckets = new Map<LayerGroupKey, Row[]>()

  for (const row of rows) {
    const role = assignment[row.id]
    // An unknown role key is treated as unassigned rather than dropped: a
    // binding left over from a renamed role must stay visible to be fixed.
    const key: LayerGroupKey = (role && ROLE_GROUP[role]) || UNASSIGNED
    const bucket = buckets.get(key)
    if (bucket) bucket.push(row)
    else buckets.set(key, [row])
  }

  const mappedRoles = new Set(Object.values(assignment).filter(Boolean))
  const coverageFor = (group: CardFieldRole['group']) => ({
    mapped: CARD_FIELD_ROLES.filter((r) => r.group === group && mappedRoles.has(r.key)).length,
    total: GROUP_TOTALS[group] ?? 0,
  })

  const groups: LayerGroup<Row>[] = []
  for (const group of LAYER_GROUP_ORDER) {
    const bucketRows = buckets.get(group)
    if (bucketRows?.length) {
      groups.push({ key: group, rows: bucketRows, coverage: coverageFor(group) })
    }
  }

  const unassigned = buckets.get(UNASSIGNED)
  if (unassigned?.length) {
    groups.push({ key: UNASSIGNED, rows: unassigned, coverage: null })
  }

  return groups
}

/** A group an admin still has work in, so it must not open collapsed. */
export function groupNeedsAttention(group: LayerGroup): boolean {
  if (group.key === UNASSIGNED) return true
  return group.coverage !== null && group.coverage.mapped < group.coverage.total
}

// ── Colour swatches ──

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export function parseHexColour(value: string): { r: number; g: number; b: number } | null {
  const trimmed = value.trim()
  if (!HEX.test(trimmed)) return null
  const body = trimmed.slice(1)
  const full =
    body.length === 3
      ? body
          .split('')
          .map((c) => c + c)
          .join('')
      : body
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(value: string): number | null {
  const rgb = parseHexColour(value)
  if (!rgb) return null
  const channel = (raw: number) => {
    const c = raw / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
}

/**
 * Whether a swatch would vanish against the white page and needs a darker ring.
 *
 * The catalogue is full of ivories and blush tones (#F5EFE3, #F5DCE2), which is
 * exactly the case a plain filled square gets wrong: the admin sees an empty
 * box and cannot tell it from "no fill set".
 *
 * Non-hex input counts as light, so anything we cannot measure still gets the
 * stronger outline.
 */
export function isLightColour(value: string): boolean {
  const luminance = relativeLuminance(value)
  if (luminance === null) return true
  return luminance >= 0.7
}
