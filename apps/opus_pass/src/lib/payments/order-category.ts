// Payment category — the *product family* an order belongs to, orthogonal to
// `kind` (the billing rail: 'invitation' quota vs 'product' stock+earnings).
// This is what the admin Payments console segments by, and what customer-facing
// copy keys off. Derived deterministically from what was bought so there is a
// single source of truth; set once at order creation and never recomputed.

export type OrderCategory =
  | 'digital_card'
  | 'thank_you_card'
  | 'pledge_card'
  | 'gift_registry'
  | 'attire_rings'

export const ORDER_CATEGORIES: readonly OrderCategory[] = [
  'digital_card',
  'thank_you_card',
  'pledge_card',
  'gift_registry',
  'attire_rings',
]

/** Human label for a category — shared shape used by admin + receipts. */
export const ORDER_CATEGORY_LABEL: Record<OrderCategory, string> = {
  digital_card: 'Digital Card',
  thank_you_card: 'Thank You Card',
  pledge_card: 'Pledge Card',
  gift_registry: 'Gift Registry',
  attire_rings: 'Attire & Rings',
}

/**
 * Derive an order's category from its rail + line items. Template purchases
 * encode their type in the item id (`template:thank_you_card:…` /
 * `template:pledge_card:…`, see pledge-card-templates.ts). Product orders are
 * registry-shop purchases today; the future attire/rings flow sets its own
 * category explicitly rather than being inferred here.
 */
export function deriveOrderCategory(
  kind: string,
  items: { id?: string | null }[],
): OrderCategory {
  if (kind === 'product') return 'gift_registry'
  const ids = items.map((i) => i.id ?? '')
  if (ids.some((id) => id.startsWith('template:thank_you_card:'))) return 'thank_you_card'
  if (ids.some((id) => id.startsWith('template:pledge_card:'))) return 'pledge_card'
  return 'digital_card'
}
