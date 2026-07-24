import type { Ionicons } from '@expo/vector-icons';

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * Presentation helpers for the vendor detail screen. These mirror the web
 * storefront (apps/opus_website/src/components/vendors/VendorDetailPage.tsx) so
 * a vendor's profile reads the same on the app as it does on the web, mapping
 * the web's lucide iconography onto Ionicons.
 */

/** Word label + colour for a numeric rating, matching the web rating badge. */
export function ratingLabel(rating: number): { text: string; color: string } {
  if (rating >= 5.0) return { text: 'Fantastic', color: '#059669' };
  if (rating >= 4.5) return { text: 'Excellent', color: '#10b981' };
  if (rating >= 4.0) return { text: 'Great', color: '#22c55e' };
  if (rating >= 3.5) return { text: 'Good', color: '#eab308' };
  if (rating >= 3.0) return { text: 'Average', color: '#fb923c' };
  return { text: 'Mixed', color: '#9ca3af' };
}

/** Deterministic avatar colour for a review author (web authorColor palette). */
export function authorColor(name: string): string {
  const palette = ['#f59e0b', '#2D6A4F', '#5B2D8E', '#ea580c', '#0ea5e9'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * "March 2026" from an ISO timestamp; empty string when unparseable. Formatted
 * manually rather than via `toLocaleDateString` options, which Hermes does not
 * reliably honour without full Intl.
 */
export function formatReviewDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Full human names for the ISO-ish language codes a vendor may store. */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  sw: 'Swahili',
  fr: 'French',
  ar: 'Arabic',
  it: 'Italian',
  pt: 'Portuguese',
  es: 'Spanish',
  de: 'German',
  zh: 'Chinese',
  hi: 'Hindi',
};

export function formatLanguages(langs: string[]): string {
  return langs
    .map((l) => {
      const key = l.trim().toLowerCase();
      return LANGUAGE_NAMES[key] ?? l.trim().charAt(0).toUpperCase() + l.trim().slice(1);
    })
    .join(', ');
}

/** Parse a pre-formatted package price string ("1,500,000") into a number. */
export function parsePackagePrice(value: string | null | undefined): number {
  if (!value) return 0;
  const m = value.match(/([\d.]+)\s*M/i);
  if (m) return parseFloat(m[1]) * 1_000_000;
  return parseFloat(value.replace(/[^\d.]/g, '')) || 0;
}

/** Package highlight badge palette — mirrors the storefront editor registry. */
export const PKG_BADGE_TONES: Record<string, { bg: string; fg: string }> = {
  lavender: { bg: '#F0DFF6', fg: '#7E5896' },
  gold: { bg: '#FCE9C2', fg: '#8a5a14' },
  emerald: { bg: '#ECFDF5', fg: '#047857' },
  rose: { bg: '#FFF1F2', fg: '#BE123C' },
  dark: { bg: '#111827', fg: '#FFFFFF' },
};

export const PKG_BADGE_ICONS: Record<string, IoniconName> = {
  star: 'star',
  crown: 'ribbon',
  gem: 'diamond',
  sparkles: 'sparkles',
  award: 'medal',
  trophy: 'trophy',
  flame: 'flame',
  heart: 'heart',
  'badge-check': 'checkmark-circle',
  zap: 'flash',
};

/** Ionicons equivalent of the web getServiceIcon() lucide resolver. */
export function getServiceIcon(service: string): IoniconName {
  const s = service.toLowerCase();
  if (/photo|shoot|portrait|engagement|bridal prep|gallery|print|digital file/.test(s))
    return 'camera-outline';
  if (/video|drone|film|reel|cinemat/.test(s)) return 'videocam-outline';
  if (/cater|food|meal|menu|dinner|dining|bar|drink|waiter/.test(s)) return 'restaurant-outline';
  if (/venue|hall|space|accommodation|room|villa|chapel|pavilion/.test(s)) return 'business-outline';
  if (/floral|flower|bloom|bouquet|decor|arrangement|styling/.test(s)) return 'flower-outline';
  if (/music|dj|band|live|song|sound|mc|vocalist|perform/.test(s)) return 'musical-notes-outline';
  if (/cake|dessert|pastry|sweet/.test(s)) return 'ice-cream-outline';
  if (/makeup|beauty|hair|groom|spa|glam|sparkl/.test(s)) return 'sparkles-outline';
  if (/dress|attire|suit|fashion|shirt|outfit|wear/.test(s)) return 'shirt-outline';
  if (/transfer|transport|car|shuttle|limo|driver/.test(s)) return 'car-outline';
  if (/ring|jewel|gem|diamond/.test(s)) return 'diamond-outline';
  if (/coordinat|planner|manag|organis|day-of|logistics/.test(s)) return 'clipboard-outline';
  if (/invite|print|stationer|mail|card/.test(s)) return 'mail-outline';
  if (/officiant|ceremony|vow|celebrant|blessing/.test(s)) return 'book-outline';
  if (/light|illum|candle|glow/.test(s)) return 'bulb-outline';
  if (/tent|marquee|canopy/.test(s)) return 'home-outline';
  if (/price|rate|cost|fee|budget/.test(s)) return 'cash-outline';
  if (/setup|breakdown|teardown/.test(s)) return 'construct-outline';
  return 'ellipse-outline';
}

/** Rich description for a service, matching the web getServiceDescription(). */
export function getServiceDescription(service: string, vendorName: string): string {
  const s = service.toLowerCase();
  const d = (() => {
    if (/full.day.coverage|full day/.test(s))
      return 'Complete wedding day documentation from bridal preparations through to the last dance — nothing is missed.';
    if (/engagement|pre.wedding session/.test(s))
      return 'A relaxed session before the wedding to get comfortable in front of the camera and build chemistry with your photographer.';
    if (/second shooter/.test(s))
      return 'An additional photographer who covers different angles and moments simultaneously, ensuring broader and more complete coverage.';
    if (/drone/.test(s))
      return 'Aerial footage and photography captured by a licensed drone operator, adding a cinematic perspective to your wedding visuals.';
    if (/online gallery|digital galler/.test(s))
      return 'A private, password-protected online gallery where you can view, download, and share your edited images with family and friends.';
    if (/print.ready|digital file/.test(s))
      return 'High-resolution files delivered in formats suitable for professional printing at any size, from wallet cards to wall art.';
    if (/bridal prep/.test(s))
      return 'Coverage of the getting-ready moments — hair, makeup, dressing, and the quiet time before the ceremony begins.';
    if (/destination/.test(s))
      return 'Available to travel for weddings held outside the local area, including international destinations. Travel costs are discussed separately.';
    if (/photo|shoot|portrait/.test(s))
      return 'Professional photography capturing the key moments, emotions, and details of your wedding day using high-end equipment.';
    if (/video|film|cinemat/.test(s))
      return 'Cinematic wedding film capturing the atmosphere, vows, speeches, and highlights of your day, delivered as a polished edit.';
    if (/reel|highlight/.test(s))
      return 'A short, shareable highlight film — typically 3–5 minutes — distilling the best moments of your wedding into one cinematic sequence.';
    if (/full.venue buyout|exclusive venue/.test(s))
      return 'Sole use of the entire venue for your celebration — no other events run simultaneously, giving you complete privacy and flexibility.';
    if (/venue|hall|space|pavilion/.test(s))
      return 'Dedicated use of the event space, including setup and breakdown time, for your ceremony, reception, or both.';
    if (/accommodation|villa|room|overnight/.test(s))
      return 'On-site or nearby lodging for the couple and guests, making it easy for everyone to celebrate without worrying about travel.';
    if (/in.house cater|catering/.test(s))
      return 'Food and beverage service managed directly by the venue or vendor — menus are often customisable and include a tasting session.';
    if (/seated dinner|reception dinner/.test(s))
      return 'A formal plated dinner service with dedicated waitstaff, customisable menus, and full table décor included.';
    if (/waiter|waitstaff/.test(s))
      return 'Professional service staff who manage table service, drinks, and guest needs throughout the reception.';
    if (/menu|tasting/.test(s))
      return 'A pre-wedding tasting session where you select and approve the dishes that will be served on your wedding day.';
    if (/bar service|drink/.test(s))
      return 'Managed bar service providing soft drinks, juices, or an optional alcohol package for your guests throughout the event.';
    if (/floral|flower|bouquet|bloom/.test(s))
      return 'Fresh floral arrangements — bouquets, centrepieces, ceremony arches, and decorative accents — designed to your colour palette and style.';
    if (/decor|styling|setup|teardown/.test(s))
      return 'Full decoration setup and post-event breakdown, covering furniture arrangement, table styling, lighting, and all decorative elements.';
    if (/transfer|transport|shuttle|car|limo/.test(s))
      return 'Organised guest or couple transportation — from hotel pick-ups and venue transfers to the bridal car and send-off.';
    if (/coordinat|day.of|manag|organis/.test(s))
      return 'A dedicated professional who manages the full flow of your wedding day — liaising with suppliers, keeping timings on track, and handling any issues so you can focus on enjoying every moment.';
    if (/planner/.test(s))
      return 'End-to-end wedding planning support, from initial concept and supplier sourcing through to full day-of management.';
    if (/mc|master of ceremon/.test(s))
      return 'A charismatic emcee who guides guests through the programme, introduces speeches, and keeps the energy flowing throughout the reception.';
    if (/dj/.test(s))
      return 'A professional DJ providing curated music sets, seamless transitions, and crowd-reading skills to keep the dance floor alive all night.';
    if (/live band|band set/.test(s))
      return 'A live band performance — typically covering popular genres like Afrobeats, Bongo Flava, and international hits — creating an electric atmosphere.';
    if (/sound system|pa system/.test(s))
      return 'Professional audio equipment including speakers, microphones, and mixing gear, ensuring crystal-clear sound across the entire venue.';
    if (/acoustic/.test(s))
      return 'A live acoustic performance — typically guitar and vocals — creating an intimate and elegant atmosphere for the ceremony or cocktail hour.';
    if (/stage light|lighting rig/.test(s))
      return 'Professional stage and dance floor lighting that transforms the venue atmosphere as the evening progresses.';
    if (/cake|dessert/.test(s))
      return 'A custom-designed wedding cake or dessert display, crafted to your flavour preferences and visual style.';
    if (/makeup|beauty|hair|glam/.test(s))
      return 'Professional bridal hair and makeup services, ensuring you look and feel your best from ceremony through to the last dance.';
    if (/ring|jewel|gem/.test(s))
      return 'Bespoke or curated jewellery and ring services, from custom design to expert fitting and engraving.';
    if (/invite|stationer|print|card/.test(s))
      return 'Professionally designed and printed wedding stationery — invitations, RSVP cards, menus, seating charts, and signage.';
    if (/officiant|celebrant|vow|blessing/.test(s))
      return 'A licensed officiant or celebrant who leads your ceremony, helping craft and deliver personalised vows and readings.';
    if (/light|illum|candle/.test(s))
      return 'Ambient and decorative lighting design — fairy lights, uplighting, candles, and feature installations that set the mood for your celebration.';
    if (/tent|marquee|canopy/.test(s))
      return 'A professionally installed tent or marquee structure, providing a beautiful sheltered space for outdoor ceremonies or receptions.';
    return `Ask ${vendorName} about this service for full details on what is covered and how it fits into your wedding package.`;
  })();
  return d;
}
