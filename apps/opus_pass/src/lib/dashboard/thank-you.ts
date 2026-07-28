import { EVENTLESS_COVER_KEY } from './pledge-page'

/** Sending a thank-you message is available to every package tier — only the
 *  card TEMPLATE picker (the WhatsApp header image) is paygated, mirroring
 *  the Pledges card-template picker exactly: free for these tiers, everyone
 *  else buys individual designs (see TEMPLATE_CARD_PRICE). */
export const THANK_YOU_FREE_TIER_IDS = ['elegant', 'signature']

/** The couple_profiles.thank_you_config JSONB shape — a card design (from the
 *  invitation catalog) applied as the WhatsApp message's header image,
 *  scoped per event. Mirrors PledgePageConfig.eventCovers. */
export interface ThankYouCardConfig {
  eventCovers?: Record<
    string,
    {
      coverImageUrl: string | null
      coverIsFullTemplate: boolean
      templateId?: string | null
      templateName?: string | null
    }
  >
}

/** Resolve the card cover for a specific event from the couple's raw stored
 *  thank_you_config. Mirrors resolveEventCover() in pledge-page.ts. */
export function resolveThankYouCover(
  stored: ThankYouCardConfig | null | undefined,
  eventId: string | null,
): { coverImageUrl: string | null; coverIsFullTemplate: boolean; templateId: string | null; templateName: string | null } {
  const key = eventId ?? EVENTLESS_COVER_KEY
  const cover = stored?.eventCovers?.[key]
  return {
    coverImageUrl: cover?.coverImageUrl ?? null,
    coverIsFullTemplate: cover?.coverIsFullTemplate ?? false,
    templateId: cover?.templateId ?? null,
    templateName: cover?.templateName ?? null,
  }
}
