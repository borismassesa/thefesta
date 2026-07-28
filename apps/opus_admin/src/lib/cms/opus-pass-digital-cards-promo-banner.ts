import type { MaybeLocalized } from '@/lib/cms/localized'

export type OpusPassDigitalCardsPromoBannerContent = {
  /** Bold uppercase label on the left, e.g. "40% off". */
  eyebrow: MaybeLocalized
  /** Body copy after the eyebrow, e.g. "wedding paper with code". */
  body: MaybeLocalized
  /** Highlighted promo code at the end. Set to "" to hide. */
  promo_code: string
  /** Banner background colour (hex). */
  background_color: string
}

export type OpusPassDigitalCardsPromoBannerRow = {
  id: string
  page_key: string
  section_key: string
  content: OpusPassDigitalCardsPromoBannerContent
  draft_content: OpusPassDigitalCardsPromoBannerContent | null
  is_published: boolean
  updated_at: string
}

export const OPUS_PASS_DIGITAL_CARDS_PROMO_BANNER_FALLBACK: OpusPassDigitalCardsPromoBannerContent = {
  eyebrow: '40% off',
  body: 'wedding paper with code',
  promo_code: 'KARIBU40',
  background_color: '#FCE9C2',
}
