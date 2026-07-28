import type { SupabaseClient } from '@supabase/supabase-js';
import type { AddOn, FaqItem, ProductAddonsFaqContent } from '@/types/product-addons-faq';

const addOnDefaults = (): Omit<
  AddOn,
  'id' | 'title' | 'description' | 'pricingMode'
> => ({
  flatFee: 0,
  flatFeeLabel: 'flat fee per event',
  unitPrice: 0,
  unitLabel: 'per unit',
  minQty: 1,
  qtyStep: 1,
  defaultQty: 1,
  quoteLabel: 'Price upon consultation call',
  quoteCtaLabel: 'Call us',
  includedInTierIds: [],
  includedTitle: '',
  includedDescription: '',
  showGuestTicketPreview: false,
});

/**
 * Mirrors apps/opus_pass/src/lib/cms/product-addons-faq.ts's
 * `PRODUCT_ADDONS_FAQ_FALLBACK` (English fields only — mobile doesn't have a
 * locale toggle for this content yet). Used whenever the CMS row is missing,
 * exactly like the web loader, so this section never silently renders empty
 * just because nobody's created the row.
 */
const PRODUCT_ADDONS_FAQ_FALLBACK: ProductAddonsFaqContent = {
  addonsHeading: 'Available Optional add-ons',
  includedPillLabel: 'Included',
  priceFromLabel: 'From',
  howManyLabel: 'How many?',
  quotePhoneNumber: '+255 799 202 171',
  descriptionLabel: 'Description',
  readMoreLabel: 'Read More',
  readLessLabel: 'Read Less',
  similarDesignsHeading: 'Explore similar designs',
  addons: [
    {
      ...addOnDefaults(),
      id: 'paper-prints',
      title: 'Premium printed cards',
      description:
        "Premium printed cards for elders, the head table, and anyone who'd love a physical keepsake — designed in Bagamoyo, delivered across Tanzania.",
      pricingMode: 'per_unit',
      unitPrice: 2000,
      unitLabel: 'per print',
      minQty: 10,
      qtyStep: 5,
      defaultQty: 25,
    },
    {
      ...addOnDefaults(),
      id: 'door-scan',
      title: 'On-site scanning attendant',
      description:
        "Every package includes barcode check-in — this add-on sends a trained OpusFesta attendant to your venue to do it for you. They scan each guest's ticket QR at the entrance and tick them off your live guest list in real time, so you don't need to assign your own staff.",
      pricingMode: 'flat',
      flatFee: 50000,
      flatFeeLabel: 'flat fee per event',
      includedInTierIds: ['elegant', 'signature'],
      includedTitle: 'On-site scanning attendant',
      includedDescription:
        "A trained OpusFesta attendant comes to your venue and scans each guest's ticket QR at the door, ticking them off your live guest list in real time — no extra cost, no need to assign your own staff.",
      showGuestTicketPreview: true,
    },
    {
      ...addOnDefaults(),
      id: 'human-follow-up-calling',
      title: 'Human follow-up calling',
      description:
        "A real person calls your invited guests who haven't RSVP'd yet to gently follow up and record their response for you.",
      pricingMode: 'quote',
      includedInTierIds: ['elegant', 'signature'],
      includedTitle: 'Human follow-up calling',
      includedDescription:
        "A real person calls your invited guests who haven't RSVP'd yet to gently follow up and record their response for you — included with your Elegant and Signature packages.",
    },
    {
      ...addOnDefaults(),
      id: 'wedding-website',
      title: 'Wedding website',
      description:
        'A personal wedding website — your story, schedule, venue map, photos, and a built-in bilingual RSVP your guests can visit anytime.',
      pricingMode: 'quote',
      includedInTierIds: ['signature'],
      includedTitle: 'Wedding website',
      includedDescription: 'Included with your Signature package.',
    },
    {
      ...addOnDefaults(),
      id: 'gifts-registry',
      title: 'Gifts registry',
      description:
        'A shareable gift registry so your guests know exactly what to bring or contribute toward.',
      pricingMode: 'quote',
      includedInTierIds: ['signature'],
      includedTitle: 'Gifts registry',
      includedDescription:
        'A shareable gift registry so your guests know exactly what to bring or contribute toward — included with your Signature package.',
    },
  ],
  faq: [
    {
      id: 'guest-rsvp-dashboard',
      title: 'Guest list & RSVP dashboard',
      body: 'Every package includes a dashboard to run your event end to end — create the event, build and organise your guest list, and send invites from one place. Watch RSVPs land in real time with live headcounts and meal choices. Classic and up add live check-ins, pledge collection and a thank-you blast; Elegant and Signature add save-the-dates, schedule or menu design and richer reporting.',
      link_label: '',
      link_href: '',
    },
    {
      id: 'door-scan-how-it-works',
      title: 'How the door-scan attendant works',
      body: 'When you add the attendant to your order, a trained OpusFesta attendant arrives at your venue 30 minutes before the event with a scanner. Every digital invite includes a unique QR code — the attendant scans each guest at the door and ticks them off your live guest list, so you know exactly who arrived in real time. Travel costs included within Dar es Salaam, Arusha, Mwanza, Bagamoyo, and Zanzibar.',
      link_label: '',
      link_href: '',
    },
    {
      id: 'payment',
      title: 'Payment',
      body: "Pay securely with M-Pesa, Airtel Money, Mixx by Yas, Selcom Pesa, Visa, or Mastercard — all in Tanzanian shillings. Checkout is encrypted end to end, and you'll get an instant confirmation by SMS and email the moment your payment clears, so your order starts right away.",
      link_label: '',
      link_href: '',
    },
    {
      id: 'cancellation-policy',
      title: 'Cancellation policy',
      body: 'Cancel for a full refund any time before your digital cards are sent. Once invites have gone out, the package is non-refundable — the cards and tickets are already live to your guests. The on-site attendant add-on can be cancelled up to 7 days before your event for a full refund. Read the full {link}.',
      link_label: 'Cancellation & Refund Policy',
      link_href: '/cancellation',
    },
  ],
};

/**
 * Global (not per-product) add-ons + FAQ config shown on every
 * apps/opus_pass digital card product detail page (see
 * apps/opus_pass/src/lib/cms/product-addons-faq.ts), read here directly
 * from Supabase so mobile stays in sync as admins edit add-ons/FAQ copy.
 *
 * Row key: page_key='opus-pass-product-detail', section_key='addons-faq'.
 * Falls back to PRODUCT_ADDONS_FAQ_FALLBACK when the row doesn't exist yet,
 * matching the web loader's behavior — this section should never silently
 * vanish just because nobody's created the row.
 */
export async function getProductAddonsFaqContent(
  client: SupabaseClient
): Promise<ProductAddonsFaqContent> {
  const { data, error } = await client
    .from('website_page_sections')
    .select('content')
    .eq('page_key', 'opus-pass-product-detail')
    .eq('section_key', 'addons-faq')
    .maybeSingle();
  if (error) throw error;

  const stored = data?.content as Partial<ProductAddonsFaqContent> | undefined;
  if (!stored) return PRODUCT_ADDONS_FAQ_FALLBACK;

  return {
    ...PRODUCT_ADDONS_FAQ_FALLBACK,
    ...stored,
    addons: Array.isArray(stored.addons)
      ? (stored.addons as AddOn[])
      : PRODUCT_ADDONS_FAQ_FALLBACK.addons,
    faq: Array.isArray(stored.faq)
      ? (stored.faq as FaqItem[])
      : PRODUCT_ADDONS_FAQ_FALLBACK.faq,
  };
}
