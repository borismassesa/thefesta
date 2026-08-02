// Admin-side types + fallback for the OpusPass product detail page's "Optional
// add-ons" cards and FAQ accordion.
//
// Mirrors apps/opus_pass/src/lib/cms/product-addons-faq.ts (the public
// loader), same `_sw` sibling-field convention as ./opus-pass-packages.ts (its
// neighbour on the same page).
//
// Add-ons are an open-ended admin-editable list (not fixed slots). Each one
// picks a pricing mode: 'flat' (one fee per event), 'per_unit' (priced with a
// quantity stepper), or 'quote' (no fixed price — shows a "contact us" CTA,
// priced on a call, never added to the order total). An add-on can also be
// bundled free into specific package tiers (`includedInTierIds`, matching the
// stable tier ids in ./opus-pass-packages.ts — lite/classic/elegant/signature).
//
// Stored as one CMS config: page_key 'opus-pass-product-detail', section_key
// 'addons-faq' in website_page_sections.

export type AddOnPricingMode = 'flat' | 'per_unit' | 'quote'

export type AddOn = {
  id: string
  title: string
  title_sw: string
  description: string
  description_sw: string
  pricingMode: AddOnPricingMode

  flatFee: number
  flatFeeLabel: string
  flatFeeLabel_sw: string

  unitPrice: number
  unitLabel: string
  unitLabel_sw: string
  minQty: number
  qtyStep: number
  defaultQty: number

  quoteLabel: string
  quoteLabel_sw: string
  quoteCtaLabel: string
  quoteCtaLabel_sw: string

  includedInTierIds: string[]
  includedTitle: string
  includedTitle_sw: string
  includedDescription: string
  includedDescription_sw: string

  showGuestTicketPreview: boolean
}

export type FaqItem = {
  id: string
  title: string
  title_sw: string
  body: string
  body_sw: string
  link_label: string
  link_label_sw: string
  link_href: string
}

export type ProductAddonsFaqContent = {
  addonsHeading: string
  addonsHeading_sw: string
  includedPillLabel: string
  includedPillLabel_sw: string
  priceFromLabel: string
  priceFromLabel_sw: string
  howManyLabel: string
  howManyLabel_sw: string
  // Phone number every 'quote' add-on's CTA dials — shared across all of
  // them (not per-add-on, not translatable).
  quotePhoneNumber: string
  descriptionLabel: string
  descriptionLabel_sw: string
  readMoreLabel: string
  readMoreLabel_sw: string
  readLessLabel: string
  readLessLabel_sw: string
  similarDesignsHeading: string
  similarDesignsHeading_sw: string
  addons: AddOn[]
  faq: FaqItem[]
}

export type ProductAddonsFaqRow = {
  page_key: string
  section_key: string
  content: ProductAddonsFaqContent | null
  draft_content: ProductAddonsFaqContent | null
  is_published: boolean | null
}

// Every tier id an add-on could be bundled into, paired with its display name
// for the editor's checklist. Matches the stable ids in ./opus-pass-packages.ts.
export const ADDON_TIER_OPTIONS: { id: string; label: string }[] = [
  { id: 'lite', label: 'Essential' },
  { id: 'classic', label: 'Classic' },
  { id: 'elegant', label: 'Elegant' },
  { id: 'signature', label: 'Signature' },
]

const addOnDefaults = (): Omit<AddOn, 'id' | 'title' | 'title_sw' | 'description' | 'description_sw' | 'pricingMode'> => ({
  flatFee: 0,
  flatFeeLabel: 'flat fee per event',
  flatFeeLabel_sw: 'ada moja kwa moja kwa tukio',
  unitPrice: 0,
  unitLabel: 'per unit',
  unitLabel_sw: 'kwa kila kimoja',
  minQty: 1,
  qtyStep: 1,
  defaultQty: 1,
  quoteLabel: 'Price upon consultation call',
  quoteLabel_sw: 'Bei baada ya simu ya ushauri',
  quoteCtaLabel: 'Call us',
  quoteCtaLabel_sw: 'Tupigie',
  includedInTierIds: [],
  includedTitle: '',
  includedTitle_sw: '',
  includedDescription: '',
  includedDescription_sw: '',
  showGuestTicketPreview: false,
})

// Keep in sync with apps/opus_pass PRODUCT_ADDONS_FAQ_FALLBACK so the editor
// opens on the real content when no CMS row has been saved yet.
export const OPUS_PASS_PRODUCT_ADDONS_FAQ_FALLBACK: ProductAddonsFaqContent = {
  addonsHeading: 'Available Optional add-ons',
  addonsHeading_sw: 'Nyongeza za hiari zinazopatikana',
  includedPillLabel: 'Included',
  includedPillLabel_sw: 'Imejumuishwa',
  priceFromLabel: 'From',
  priceFromLabel_sw: 'Kuanzia',
  howManyLabel: 'How many?',
  howManyLabel_sw: 'Ngapi?',
  quotePhoneNumber: '+255 799 202 171',
  descriptionLabel: 'Description',
  descriptionLabel_sw: 'Maelezo',
  readMoreLabel: 'Read More',
  readMoreLabel_sw: 'Soma Zaidi',
  readLessLabel: 'Read Less',
  readLessLabel_sw: 'Soma Kidogo',
  similarDesignsHeading: 'Explore similar designs',
  similarDesignsHeading_sw: 'Angalia miundo mingine kama hii',
  addons: [
    {
      ...addOnDefaults(),
      id: 'paper-prints',
      title: 'Premium printed cards',
      title_sw: 'Kadi za kuchapishwa za hali ya juu',
      description:
        "Premium printed cards for elders, the head table, and anyone who'd love a physical keepsake — designed in Bagamoyo, delivered across Tanzania.",
      description_sw:
        'Kadi za kuchapishwa za hali ya juu kwa wazee, meza kuu, na yeyote anayependa kumbukumbu halisi — zimebuniwa Bagamoyo, zinapelekwa kote Tanzania.',
      pricingMode: 'per_unit',
      unitPrice: 2000,
      unitLabel: 'per print',
      unitLabel_sw: 'kwa kila chapa',
      minQty: 10,
      qtyStep: 5,
      defaultQty: 25,
    },
    {
      ...addOnDefaults(),
      id: 'door-scan',
      title: 'On-site scanning attendant',
      title_sw: 'Mhudumu wa kukagua mlangoni',
      description:
        "Every package includes barcode check-in — this add-on sends a trained OpusFesta attendant to your venue to do it for you. They scan each guest's ticket QR at the entrance and tick them off your live guest list in real time, so you don't need to assign your own staff.",
      description_sw:
        'Kila kifurushi kinajumuisha ukaguzi wa barcode — nyongeza hii inatuma mhudumu aliyefunzwa wa OpusFesta kwenye eneo lako ili kufanya hivyo kwa niaba yako. Anachanganua QR ya tiketi ya kila mgeni mlangoni na kumwondoa kwenye orodha yako ya wageni ya moja kwa moja, ili usihitaji kuweka wafanyakazi wako mwenyewe.',
      pricingMode: 'flat',
      flatFee: 50000,
      flatFeeLabel: 'flat fee per event',
      flatFeeLabel_sw: 'ada moja kwa moja kwa tukio',
      includedInTierIds: ['elegant', 'signature'],
      includedTitle: 'On-site scanning attendant',
      includedTitle_sw: 'Mhudumu wa kukagua mlangoni',
      includedDescription:
        "A trained OpusFesta attendant comes to your venue and scans each guest's ticket QR at the door, ticking them off your live guest list in real time — no extra cost, no need to assign your own staff.",
      includedDescription_sw:
        'Mhudumu aliyefunzwa wa OpusFesta anakuja eneo lako na kuchanganua QR ya tiketi ya kila mgeni mlangoni, akimwondoa kwenye orodha yako ya wageni ya moja kwa moja — bila gharama ya ziada, bila kuhitaji kuweka wafanyakazi wako mwenyewe.',
      showGuestTicketPreview: true,
    },
    {
      ...addOnDefaults(),
      id: 'wedding-website',
      title: 'Wedding website',
      title_sw: 'Tovuti ya harusi',
      description:
        'A personal wedding website — your story, schedule, venue map, photos, and a built-in bilingual RSVP your guests can visit anytime.',
      description_sw:
        'Tovuti yako binafsi ya harusi — hadithi yako, ratiba, ramani ya eneo, picha, na RSVP ya lugha mbili iliyojengwa ndani ambayo wageni wako wanaweza kutembelea wakati wowote.',
      pricingMode: 'quote',
      includedInTierIds: ['signature'],
      includedTitle: 'Wedding website',
      includedTitle_sw: 'Tovuti ya harusi',
      includedDescription: 'Included with your Signature package.',
      includedDescription_sw: 'Imejumuishwa na kifurushi chako cha Signature.',
    },
    {
      ...addOnDefaults(),
      id: 'human-follow-up-calling',
      title: 'Human follow-up calling',
      title_sw: 'Kupiga simu za ufuatiliaji',
      description:
        "A real person calls your invited guests who haven't RSVP'd yet to gently follow up and record their response for you.",
      description_sw:
        'Mtu halisi anapiga simu wageni wako walioalikwa ambao bado hawajajibu RSVP, kufuatilia kwa upole na kurekodi jibu lao kwa niaba yako.',
      pricingMode: 'quote',
      includedInTierIds: ['signature'],
      includedTitle: 'Human follow-up calling',
      includedTitle_sw: 'Kupiga simu za ufuatiliaji',
      includedDescription:
        "A real person calls your invited guests who haven't RSVP'd yet to gently follow up and record their response for you — included with your Signature package.",
      includedDescription_sw:
        'Mtu halisi anapiga simu wageni wako walioalikwa ambao bado hawajajibu RSVP, kufuatilia kwa upole na kurekodi jibu lao kwa niaba yako — imejumuishwa na kifurushi chako cha Signature.',
    },
    {
      ...addOnDefaults(),
      id: 'gifts-registry',
      title: 'Gifts registry',
      title_sw: 'Orodha ya zawadi',
      description:
        'A shareable gift registry so your guests know exactly what to bring or contribute toward.',
      description_sw:
        'Orodha ya zawadi inayoweza kushirikiwa ili wageni wako wajue hasa cha kuleta au kuchangia.',
      pricingMode: 'quote',
      includedInTierIds: ['signature'],
      includedTitle: 'Gifts registry',
      includedTitle_sw: 'Orodha ya zawadi',
      includedDescription:
        'A shareable gift registry so your guests know exactly what to bring or contribute toward — included with your Signature package.',
      includedDescription_sw:
        'Orodha ya zawadi inayoweza kushirikiwa ili wageni wako wajue hasa cha kuleta au kuchangia — imejumuishwa na kifurushi chako cha Signature.',
    },
  ],
  faq: [
    {
      id: 'guest-rsvp-dashboard',
      title: 'Guest list & RSVP dashboard',
      title_sw: 'Orodha ya wageni na dashibodi ya RSVP',
      body:
        'Every package includes a dashboard to run your event end to end — create the event, build and organise your guest list, and send invites from one place. Watch RSVPs land in real time with live headcounts and meal choices. Classic and up add live check-ins, pledge collection and a thank-you blast; Elegant and Signature add save-the-dates, schedule or menu design and richer reporting.',
      body_sw:
        'Kila kifurushi kinajumuisha dashibodi ya kuendesha tukio lako mwanzo hadi mwisho — tengeneza tukio, jenga na panga orodha yako ya wageni, na tuma mialiko kutoka sehemu moja. Angalia RSVP zikiingia moja kwa moja pamoja na idadi ya wageni na chaguo za chakula. Classic na zaidi zinaongeza ukaguzi wa moja kwa moja, ukusanyaji wa michango na ujumbe wa shukrani; Elegant na Signature zinaongeza save-the-date, ratiba au muundo wa menyu na ripoti za kina zaidi.',
      link_label: '',
      link_label_sw: '',
      link_href: '',
    },
    {
      id: 'door-scan-how-it-works',
      title: 'How the door-scan attendant works',
      title_sw: 'Jinsi mhudumu wa ukaguzi mlangoni anavyofanya kazi',
      body:
        'When you add the attendant to your order, a trained OpusFesta attendant arrives at your venue 30 minutes before the event with a scanner. Every digital invite includes a unique QR code — the attendant scans each guest at the door and ticks them off your live guest list, so you know exactly who arrived in real time. Travel costs included within Dar es Salaam, Arusha, Mwanza, Bagamoyo, and Zanzibar.',
      body_sw:
        'Unapoongeza mhudumu kwenye oda yako, mhudumu aliyefunzwa wa OpusFesta atafika eneo lako dakika 30 kabla ya tukio akiwa na kifaa cha kuchanganua. Kila mwaliko wa kidijitali una msimbo wa kipekee wa QR — mhudumu anachanganua kila mgeni mlangoni na kumwondoa kwenye orodha yako ya wageni ya moja kwa moja, ili ujue hasa nani amefika kwa wakati halisi. Gharama za usafiri zimejumuishwa ndani ya Dar es Salaam, Arusha, Mwanza, Bagamoyo, na Zanzibar.',
      link_label: '',
      link_label_sw: '',
      link_href: '',
    },
    {
      id: 'payment',
      title: 'Payment',
      title_sw: 'Malipo',
      body:
        "Pay securely with M-Pesa, Airtel Money, Mixx by Yas, Selcom Pesa, Visa, or Mastercard — all in Tanzanian shillings. Checkout is encrypted end to end, and you'll get an instant confirmation by SMS and email the moment your payment clears, so your order starts right away.",
      body_sw:
        'Lipa kwa usalama kwa M-Pesa, Airtel Money, Mixx by Yas, Selcom Pesa, Visa, au Mastercard — zote kwa shilingi za Tanzania. Malipo yamesimbwa kwa usalama mwanzo hadi mwisho, na utapata uthibitisho wa papo hapo kwa SMS na barua pepe mara malipo yako yatakapokamilika, ili oda yako ianze mara moja.',
      link_label: '',
      link_label_sw: '',
      link_href: '',
    },
    {
      id: 'cancellation-policy',
      title: 'Cancellation policy',
      title_sw: 'Sera ya kughairi',
      body:
        'Cancel for a full refund any time before your invitations are sent. Once invites have gone out, the package is non-refundable — the cards and tickets are already live to your guests. The on-site attendant add-on can be cancelled up to 7 days before your event for a full refund. Read the full {link}.',
      body_sw:
        'Ghairi kwa marejesho kamili wakati wowote kabla ya mialiko yako kutumwa. Mialiko ikishatumwa, kifurushi hakirejeshwi — kadi na tiketi tayari ziko hai kwa wageni wako. Nyongeza ya mhudumu wa eneo la tukio inaweza kughairiwa hadi siku 7 kabla ya tukio lako kwa marejesho kamili. Soma {link} kamili.',
      // Points at the package policy, not /cancellation — that URL now carries
      // OP-CCS-POL-001, which covers custom design commissions only.
      link_label: 'Cancellation & Refund Policy',
      link_label_sw: 'Sera ya Kughairi na Marejesho',
      link_href: '/cancellation/digital-cards',
    },
  ],
}

export function productAddonsFaqRandomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

export function newAddOn(): AddOn {
  return {
    ...addOnDefaults(),
    id: productAddonsFaqRandomId('addon'),
    title: 'New add-on',
    title_sw: '',
    description: '',
    description_sw: '',
    pricingMode: 'flat',
  }
}
