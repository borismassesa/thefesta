import { Sparkles, Gift, Gem, type LucideIcon } from 'lucide-react'

// Vendor verticals — the very first fork in onboarding.
//
// A vendor's vertical decides three things at once: which business categories
// they can pick, which onboarding steps they're asked to complete, and which
// public surface their profile ends up on. It mirrors `vendors.vertical` /
// `vendor_categories.vertical` in the database (migration
// 20260725000001_vendor_verticals), which is the source of truth — this module
// only carries the vendor-facing presentation of the same three values.
//
// Bilingual copy lives inline (the same pattern as CATEGORY_SW in
// ./categories) rather than in the Site UI CMS bundle, so the chooser can ship
// without a CMS key migration. Localise with `pick(locale, en, sw)`.

export const VENDOR_VERTICALS = ['service', 'gift_shop', 'attire_rings'] as const

export type VendorVertical = (typeof VENDOR_VERTICALS)[number]

export type VerticalOption = {
  id: VendorVertical
  icon: LucideIcon
  label: string
  labelSw: string
  description: string
  descriptionSw: string
  /** Concrete businesses, so a vendor recognises themselves without guessing. */
  examples: string[]
  examplesSw: string[]
  /** Where this vendor's profile is published once approved. */
  surface: string
  surfaceSw: string
}

export const VERTICAL_OPTIONS: VerticalOption[] = [
  {
    id: 'service',
    icon: Sparkles,
    label: 'I offer a wedding service',
    labelSw: 'Ninatoa huduma ya harusi',
    description:
      'Couples book your time. You set packages, quote enquiries and manage your calendar.',
    descriptionSw:
      'Wanandoa wanaweka nafasi ya muda wako. Unaweka vifurushi, unajibu maombi na kusimamia kalenda yako.',
    examples: ['MC', 'Caterer', 'Venue', 'Photographer', 'Planner', 'Florist', 'DJ'],
    examplesSw: ['MC', 'Mpishi', 'Ukumbi', 'Mpiga picha', 'Mpangaji', 'Mwuza maua', 'DJ'],
    surface: 'Listed in the OpusFesta wedding vendor directory',
    surfaceSw: 'Utaorodheshwa kwenye orodha ya watoa huduma za harusi ya OpusFesta',
  },
  {
    id: 'gift_shop',
    icon: Gift,
    label: 'I sell gifts and home products',
    labelSw: 'Ninauza zawadi na bidhaa za nyumbani',
    // Deliberately no payout cadence here. Earnings are settled by the finance
    // team from the payouts screen; there is no automatic weekly disbursement
    // to promise, and onboarding copy is a bad place to invent one.
    description:
      'Guests buy your products from couples’ gift registries. You list stock, we collect payment and pay out your earnings.',
    descriptionSw:
      'Wageni wananunua bidhaa zako kutoka kwenye orodha za zawadi za wanandoa. Wewe unaweka bidhaa, sisi tunakusanya malipo na kukulipa mapato yako.',
    examples: ['Home & kitchen', 'Décor & gifts', 'Linens & textiles', 'Tableware'],
    examplesSw: ['Nyumbani na jikoni', 'Mapambo na zawadi', 'Shuka na nguo', 'Vyombo vya mezani'],
    surface: 'Your shop appears in the gift registry, not the vendor directory',
    surfaceSw: 'Duka lako litaonekana kwenye orodha ya zawadi, si kwenye orodha ya watoa huduma',
  },
  {
    id: 'attire_rings',
    icon: Gem,
    label: 'I sell attire, jewellery or rings',
    labelSw: 'Ninauza mavazi, vito au pete',
    description:
      'Couples shop your gowns, suits and rings. You list pieces and prices, we handle checkout.',
    descriptionSw:
      'Wanandoa wananunua nguo, suti na pete zako. Wewe unaweka bidhaa na bei, sisi tunashughulikia malipo.',
    examples: ['Bridal wear', 'Suits & menswear', 'Wedding rings', 'Jewellery'],
    examplesSw: ['Nguo za bibi harusi', 'Suti za wanaume', 'Pete za harusi', 'Vito'],
    surface: 'Your pieces appear on the Attire & Rings pages',
    surfaceSw: 'Bidhaa zako zitaonekana kwenye kurasa za Mavazi na Pete',
  },
]

export function findVertical(id: string | null | undefined): VerticalOption | undefined {
  return VERTICAL_OPTIONS.find((v) => v.id === id)
}

export function isVendorVertical(value: unknown): value is VendorVertical {
  return typeof value === 'string' && (VENDOR_VERTICALS as readonly string[]).includes(value)
}

/**
 * Product vendors (gift shops, attire & rings) sell goods rather than booked
 * time. The wizard skips the service-only steps for them — services, style,
 * personality, packages and booking policies — and the portal hides the
 * booking-shaped tabs. Everything else (identity, KYC, agreements, payout) is
 * identical, which is the whole point of keeping them ordinary vendors.
 */
export function sellsProducts(vertical: VendorVertical | null | undefined): boolean {
  return vertical === 'gift_shop' || vertical === 'attire_rings'
}
