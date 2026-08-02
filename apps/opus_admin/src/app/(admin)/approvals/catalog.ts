// Lookups over the request-type catalog.
//
// Every helper takes the list explicitly. The catalog used to be a module-level
// constant, which made `findCategory(key)` a one-argument call — convenient,
// but it cannot survive the catalog becoming per-request data: module state is
// shared across requests in Next.js, so caching it would let one request's view
// leak into another's.

import type { ApprovalCategory, ApprovalCategoryKey, ApprovalGroupKey } from './types'

/**
 * Resolve a key, or null when it names a type that no longer exists.
 *
 * Deliberately does NOT throw. A request created against a type that was later
 * deleted must still render — losing the label is acceptable, taking down the
 * whole list is not.
 */
export function findCategory(
  categories: ApprovalCategory[],
  key: ApprovalCategoryKey,
): ApprovalCategory | null {
  return categories.find((c) => c.key === key) ?? null
}

/** The label, falling back to the raw key so a row is never blank. */
export function categoryLabel(
  categories: ApprovalCategory[],
  key: ApprovalCategoryKey,
): string {
  return findCategory(categories, key)?.label ?? key
}

export function categoriesInGroup(
  categories: ApprovalCategory[],
  group: ApprovalGroupKey,
): ApprovalCategory[] {
  return categories.filter((c) => c.group === group)
}
