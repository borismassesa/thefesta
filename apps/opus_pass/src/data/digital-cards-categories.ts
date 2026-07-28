// Shared category data for /digital-cards and /digital-cards/[category].
// Each entry maps a URL slug → category label + thumbnail + product-matching keywords.
// The `productMatchers` array is a list of substrings that will be matched
// (case-insensitive) against each product's `category` field on the catalog
// page to decide which products belong to this slug.

export type DigitalCardCategory = {
  slug: string
  label: string
  img: string
  alt: string
  /** Subtitle shown beneath the category title on the category page. */
  subtitle: string
  /** Substrings to match against `product.category` (case-insensitive). */
  productMatchers: string[]
}

export const DIGITAL_CARD_CATEGORIES: DigitalCardCategory[] = [
  {
    slug: 'wedding',
    label: 'Wedding',
    img: '/assets/images/churchcouples.jpg',
    alt: 'Wedding ceremony',
    subtitle: 'The main event invite — bilingual, fully customisable, and designed for Tanzanian celebrations from Bagamoyo to Mwanza.',
    productMatchers: ['Wedding Invitations', 'All-in-One Wedding', 'Wedding'],
  },
  {
    slug: 'send-off',
    label: 'Sendoff',
    img: '/assets/images/couples_together.jpg',
    alt: 'Sendoff',
    subtitle: 'Honour the Kuaga tradition with a card that reflects the moment. From the bride’s family to every guest invited to bless the journey.',
    productMatchers: ['Send-Off', 'Sendoff'],
  },
  {
    slug: 'kitchen-party',
    label: 'Kitchen party',
    img: '/assets/images/flowers_pinky.jpg',
    alt: 'Kitchen party — bridal shower florals',
    subtitle: 'Set the tone for the bridal shower. Playful designs the wadada will save, share, and screenshot — without losing the family elegance.',
    productMatchers: ['Bridal Shower', 'Kitchen Party'],
  },
  {
    slug: 'save-the-date',
    label: 'Save the date',
    img: '/assets/images/beautiful_bride.jpg',
    alt: 'Save the date',
    subtitle: 'Announce your date in style. Sent by WhatsApp or SMS, opened by every guest before the formal invite arrives.',
    productMatchers: ['Save the Date'],
  },
  {
    slug: 'kadi-za-michango',
    label: 'Kadi za michango',
    img: '/assets/images/coupleswithpiano.jpg',
    alt: 'Kadi za michango',
    subtitle: 'Coordinate contributions and family meetings with formal, dignified designs. Built for the planning the rest of the world never sees.',
    productMatchers: ['Michango', 'Vikao'],
  },
  {
    slug: 'anniversary',
    label: 'Anniversary',
    img: '/assets/images/ring_piano.jpg',
    alt: 'Anniversary',
    subtitle: 'Mark the years together with an invite as enduring as the milestone. From a quiet dinner to a full vow renewal.',
    productMatchers: ['Anniversary'],
  },
  {
    slug: 'communio',
    label: 'Communio',
    img: '/assets/images/bridering.jpg',
    alt: 'Communio',
    subtitle: 'Celebrate First Communion and other sacraments with reverent, family-centred designs in Swahili or English.',
    productMatchers: ['Communion', 'Communio'],
  },
  {
    slug: 'birthday',
    label: 'Birthday',
    img: '/assets/images/cutesy_couple.jpg',
    alt: 'Birthday',
    subtitle: 'From a child’s first party to a milestone year, invites that set the mood and reach every guest by WhatsApp or SMS.',
    productMatchers: ['Birthday'],
  },
  {
    slug: 'gala-dinner',
    label: 'Gala Dinner',
    img: '/assets/images/authentic_couple.jpg',
    alt: 'Gala Dinner',
    subtitle: 'Formal digital cards for fundraisers, awards nights, and corporate galas — with RSVP and live guest list included.',
    productMatchers: ['Gala'],
  },
  {
    slug: 'muslim-wedding',
    label: 'Muslim Wedding',
    img: '/assets/images/bride_umbrella.jpg',
    alt: 'Muslim Wedding',
    subtitle: 'Nikah and walima invites that honour the occasion — bilingual designs crafted for Tanzanian Muslim celebrations.',
    productMatchers: ['Muslim Wedding', 'Nikah', 'Walima'],
  },
]

export function findCategory(
  categories: DigitalCardCategory[],
  slug: string,
): DigitalCardCategory | undefined {
  return categories.find((c) => c.slug === slug)
}

/**
 * Returns the subset of products whose `category` field matches any of the
 * given category's `productMatchers` (case-insensitive substring match).
 */
export function filterProductsByCategory<T extends { category: string }>(
  categories: DigitalCardCategory[],
  products: T[],
  slug: string,
): T[] {
  const cat = findCategory(categories, slug)
  if (!cat) return []
  return products.filter((p) =>
    cat.productMatchers.some((m) => p.category.toLowerCase().includes(m.toLowerCase())),
  )
}
