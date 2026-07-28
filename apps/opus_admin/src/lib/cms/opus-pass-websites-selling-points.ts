import type { MaybeLocalized } from '@/lib/cms/localized'

export type OpusPassWebsitesSellingPointItem = {
  id: string
  // Translatable text.
  headline: MaybeLocalized
  body: MaybeLocalized
  cta_label: MaybeLocalized
  // Non-translatable config.
  cta_href: string
  image: string
}

export type OpusPassWebsitesSellingPointsContent = {
  heading: MaybeLocalized
  description: MaybeLocalized
  items: OpusPassWebsitesSellingPointItem[]
}

export type OpusPassWebsitesSellingPointsRow = {
  id: string
  page_key: string
  section_key: string
  content: OpusPassWebsitesSellingPointsContent
  draft_content: OpusPassWebsitesSellingPointsContent | null
  is_published: boolean
  updated_at: string
}

export const OPUS_PASS_WEBSITES_SELLING_POINTS_FALLBACK: OpusPassWebsitesSellingPointsContent = {
  heading: 'Built to fit your wedding',
  description:
    'Everything you need for a seamless wedding experience, from beautifully designed websites, invitations, RSVPs, guest updates, registries, and every meaningful moment leading up to your big day.',
  items: [
    {
      id: 'designer-templates',
      headline: 'Designer templates, no tech skills needed',
      body: 'A wide range of designs, ready for you to customize and share.',
      cta_label: 'Explore designs',
      cta_href: '#designs',
      image: '/assets/images/coupleswithpiano.jpg',
    },
    {
      id: 'guests-love',
      headline: 'Websites loved by couples and guests',
      body: "It's the easiest way to keep guests updated and for them to RSVP and shop your registry.",
      cta_label: 'Start website',
      cta_href: '/sign-up',
      image: '/assets/images/mauzo_crew.jpg',
    },
    {
      id: 'match-invitations',
      headline: 'Match your wedding digital cards and save the dates',
      body: 'Whatever your style, our websites are made to match your cards and more.',
      cta_label: 'Explore digital cards',
      cta_href: '/digital-cards',
      image: '/assets/images/flowers_pinky.jpg',
    },
  ],
}
