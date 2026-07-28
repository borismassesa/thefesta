import type { SupabaseClient } from '@supabase/supabase-js';
import type { PackageBullet, PackagesContent } from '@/types/packages';

let bulletSeq = 0;
const bullet = (label: string, note = ''): PackageBullet => ({
  id: `b${++bulletSeq}`,
  label,
  note,
});

const common = (): PackageBullet[] => [
  bullet('1 template digital card with QR code'),
  bullet('Sent via WhatsApp (SMS fallback)'),
  bullet('WhatsApp RSVP', 'guests reply yes / no'),
  bullet('Opus scanner QR code check-in on the day (self-scan app)'),
];

const classicExtras = (): PackageBullet[] => [
  bullet('Custom card', 'your colours & photo'),
  bullet('The OpusPass dashboard', 'build your guest list & track RSVPs in one place'),
  bullet('Invite guests to pledge', 'by SMS, WhatsApp or email from your dashboard'),
  bullet('Reminders & delivery confirmations'),
  bullet('RSVP report'),
];

const elegantExtras = (): PackageBullet[] => [
  bullet('Bespoke card designed from scratch'),
  bullet('We send your invites & chase non-responders', 'by message & call'),
  bullet('We build your guest list from the details you give us'),
  bullet('We run your pledge campaign', 'invitations, reminders & follow-up on unpaid pledges'),
  bullet('Confirmed-headcount report before the day'),
  bullet('On-site scanning attendant on the day'),
  bullet('One Save-the-Date send'),
  bullet('Thank-you message to all guests'),
];

/**
 * Mirrors apps/opus_pass/src/lib/cms/packages.ts's `PACKAGES_FALLBACK` (English
 * fields only — mobile doesn't have a locale toggle for this content yet).
 * Used whenever the CMS row is missing, exactly like the web loader, so this
 * screen never silently renders empty just because nobody's created the row.
 */
const PACKAGES_FALLBACK: PackagesContent = {
  heading: 'Choose your package',
  subheading: 'Pay per guest — everything scales with your headcount.',
  note: 'Events above 600 guests get a capped, discounted per-guest rate.',
  perGuestLabel: 'per guest',
  fromLabel: 'From',
  cardsCountLabel: 'Number of digital cards & OpusPass tickets',
  minGuestsTemplate: 'Minimum {count} guests',
  includesSuffixLabel: 'Package includes',
  tiers: [
    {
      id: 'lite',
      name: 'Essential',
      featured: false,
      price_per_guest: 1200,
      best_for: 'Just the card — you do it',
      badge_label: 'Basic',
      badge_icon: 'sparkles',
      badge_tone: 'slate',
      includes: common(),
    },
    {
      id: 'classic',
      name: 'Classic',
      featured: true,
      price_per_guest: 1700,
      best_for: 'Everything in Essential, plus the dashboard — you do it',
      badge_label: 'Most popular',
      badge_icon: 'star',
      badge_tone: 'accent',
      includes: [...common(), ...classicExtras()],
    },
    {
      id: 'elegant',
      name: 'Elegant',
      featured: false,
      price_per_guest: 2500,
      best_for: 'Everything in Classic, plus — we run it for you',
      badge_label: 'Premium',
      badge_icon: 'gem',
      badge_tone: 'gold',
      includes: [...common(), ...classicExtras(), ...elegantExtras()],
    },
    {
      id: 'signature',
      name: 'Signature',
      featured: false,
      price_per_guest: 3000,
      best_for: 'Everything in Elegant, plus — fully handled',
      badge_label: 'Luxury',
      badge_icon: 'crown',
      badge_tone: 'gold',
      includes: [
        ...common(),
        ...classicExtras(),
        bullet('Bespoke card designed from scratch'),
        bullet('We send your invites & chase non-responders', 'by message & call'),
        bullet('We build your guest list from the details you give us'),
        bullet(
          'We run your pledge campaign',
          'invitations, reminders & follow-up on unpaid pledges'
        ),
        bullet('Confirmed-headcount report before the day'),
        bullet('On-site scanning attendant on the day'),
        bullet('Thank-you message to all guests'),
        bullet('Dedicated coordinator who owns your guest experience end to end'),
        bullet('Wedding website built & set up for you'),
        bullet(
          'Digital guestbook',
          'messages & memories your guests leave, yours to keep'
        ),
        bullet('Save-the-Date', 'two announcement sends'),
        bullet('Gifts Registry'),
      ],
    },
  ],
};

/**
 * Global (not per-product) package-tier pricing config — the same
 * admin-editable source every apps/opus_pass digital card product detail page
 * renders (see apps/opus_pass/src/lib/cms/packages.ts), read here directly
 * from Supabase so mobile stays in sync as admins edit tiers/pricing.
 *
 * Row key: page_key='opus-pass-packages', section_key='wedding-tiers'.
 * Falls back to PACKAGES_FALLBACK when the row doesn't exist yet, matching
 * the web loader's behavior — this section should never silently vanish.
 */
export async function getPackagesContent(
  client: SupabaseClient
): Promise<PackagesContent> {
  const { data, error } = await client
    .from('website_page_sections')
    .select('content')
    .eq('page_key', 'opus-pass-packages')
    .eq('section_key', 'wedding-tiers')
    .maybeSingle();
  if (error) throw error;

  const stored = data?.content as Partial<PackagesContent> | undefined;
  if (!stored) return PACKAGES_FALLBACK;

  return {
    ...PACKAGES_FALLBACK,
    ...stored,
    tiers:
      Array.isArray(stored.tiers) && stored.tiers.length > 0
        ? stored.tiers
        : PACKAGES_FALLBACK.tiers,
  };
}
