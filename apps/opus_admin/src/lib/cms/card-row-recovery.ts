// Finding a mapping row again after assigning it moved it to another group.
//
// Grouping made the mapper scannable and introduced a cost: picking a role
// takes the row out from under the pointer and files it somewhere else. With a
// mouse that reads as the list reorganising. With a keyboard it is the row
// vanishing mid-interaction, and whatever focus lands on next is whatever the
// DOM happened to leave there.
//
// So the move is handled deliberately rather than left to React's incidental
// focus preservation. Everything here is pure: the component supplies the
// geometry and the refs, this decides what should happen.

import { CARD_FIELD_ROLES } from '@opusfesta/lib'
import { UNASSIGNED, type LayerGroupKey } from './card-layer-groups'

const ROLE_GROUP = new Map(CARD_FIELD_ROLES.map((role) => [role.key, role.group]))

/** The group a role files a layer under. Unknown and empty both mean nothing. */
export function groupForRole(roleKey: string | undefined): LayerGroupKey {
  if (!roleKey) return UNASSIGNED
  return ROLE_GROUP.get(roleKey) ?? UNASSIGNED
}

export type RowRecovery = {
  layerId: string
  /** Group the row has landed in, which may need expanding to show it. */
  destination: LayerGroupKey
  /**
   * Monotonic. Two assignments in quick succession must not fight over focus,
   * and the newer one is always the one the admin is looking at.
   */
  revision: number
}

/**
 * Whether this assignment moved the row, and where to.
 *
 * Returns null when nothing moved, which is the common case and must stay
 * silent: re-picking the same role, or picking a different role in the SAME
 * group (Ceremony venue to Reception venue, both Venue), leaves the row exactly
 * where it is. Scrolling and re-focusing it then would be unprompted movement.
 */
export function resolveRowRecovery(input: {
  layerId: string
  previousRole: string | undefined
  nextRole: string
  revision: number
}): RowRecovery | null {
  const from = groupForRole(input.previousRole)
  const to = groupForRole(input.nextRole)
  if (from === to) return null
  return { layerId: input.layerId, destination: to, revision: input.revision }
}

/** Later revision wins, so a second assignment supersedes a pending recovery. */
export function latestRecovery(
  current: RowRecovery | null,
  next: RowRecovery | null,
): RowRecovery | null {
  if (!next) return current
  if (!current) return next
  return next.revision >= current.revision ? next : current
}

export type Bounds = { top: number; bottom: number }

/**
 * Sub-pixel slack when comparing a row against the edge of its scroller.
 *
 * Layout produces fractional coordinates, so a row scrolled flush to the top of
 * the container lands at something like 29.83 against a container top of 30. An
 * exact comparison reads that as off-screen and scrolls again, every time,
 * without ever converging.
 */
const EDGE_TOLERANCE = 1

/**
 * Whether the row has to be scrolled to, as opposed to already being in view.
 *
 * Scrolling unconditionally is the thing to avoid. A mouse user who picks a
 * role from a row sitting in the middle of the screen has no reason to have the
 * page yanked, and `scrollIntoView` with no arguments will do exactly that.
 */
export function needsScroll(row: Bounds, viewport: Bounds): boolean {
  return row.top < viewport.top - EDGE_TOLERANCE || row.bottom > viewport.bottom + EDGE_TOLERANCE
}

/**
 * What the row is, said once, for whatever focus lands on it.
 *
 * The layer's own text leads because that is what the admin recognises; the
 * role and group say where it went. Falls back to the layer id when the layer
 * has no text of its own, which is every colour and image layer.
 */
export function describeRow(sample: string, layerId: string, roleKey: string | undefined): string {
  const name = sample.trim() || layerId
  const role = CARD_FIELD_ROLES.find((r) => r.key === roleKey)
  return role ? `${name}, mapped to ${role.label}, in ${role.group}.` : `${name}, not mapped.`
}

/** The live-region sentence. Says what moved and where, once per assignment. */
export function announceAssignment(
  sample: string,
  layerId: string,
  roleKey: string,
  moved: boolean,
): string {
  const name = sample.trim() || layerId
  const role = CARD_FIELD_ROLES.find((r) => r.key === roleKey)
  if (!role) return `${name} is no longer mapped and moved to ${UNASSIGNED}.`
  return moved
    ? `${name} mapped to ${role.label} and moved to ${role.group}.`
    : `${name} mapped to ${role.label}.`
}
