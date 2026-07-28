/** A card design pulled from the invitation catalog, offered as a
 *  ready-made pledge-page cover (see `pledgeCardCatalog` in pledges/page.tsx,
 *  built from `loadDigitalCardProducts()`). */
export interface PledgeCardCatalogItem {
  id: string
  name: string
  imageUrl: string
}

/** Package tiers (ids from packages.ts) that browse the catalog for free. */
export const PLEDGE_TEMPLATE_FREE_TIER_IDS = ['elegant', 'signature']

/** Flat per-design price (TZS) Classic/Essential couples pay to unlock a single
 *  card template — charged through the same Selcom/M-Pesa checkout the
 *  invitation product uses (see /api/payments/initiate). Shared by both the
 *  pledge-card and thank-you-card pickers. */
export const TEMPLATE_CARD_PRICE = 1200

export type TemplateCardType = 'pledge_card' | 'thank_you_card'

/** The `InitiateItem.id` a template purchase is recorded under in
 *  invitation_orders — parsed back by getPurchasedTemplateIds() to know which
 *  template ids a couple already owns. */
export function templateCardItemId(type: TemplateCardType, templateId: string): string {
  return `template:${type}:${templateId}`
}

const TEMPLATE_ITEM_ID_RE = /^template:(pledge_card|thank_you_card):(.+)$/

/** Parse a template purchase back out of an order line's id, if it is one. */
export function parseTemplateCardItemId(
  itemId: string,
): { type: TemplateCardType; templateId: string } | null {
  const m = TEMPLATE_ITEM_ID_RE.exec(itemId)
  return m ? { type: m[1] as TemplateCardType, templateId: m[2] } : null
}
