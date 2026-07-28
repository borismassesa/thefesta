/**
 * Fixed brand values shared by the digital cards flow (card detail, cart).
 * These deliberately sit outside the app's light/dark theme tokens: they must
 * match the web exactly so a design priced in the app looks the same as on
 * opuspass.opusfesta.com.
 */

/** Exact --accent / --on-accent from apps/opus_pass/src/app/globals.css — the one CTA colour that must match the web brand purple regardless of app theme. */
export const ACCENT = '#C9A0DC';
export const ON_ACCENT = '#1A1A1A';

/** Mirrors ProductDetailClient.tsx's TIER_PILL — per-tier card palette, keyed by stable tier id. */
export const TIER_PILL: Record<
  string,
  { bg: string; activeBorder: string; idleBorder: string; text: string }
> = {
  lite: { bg: '#E1E8F0', activeBorder: '#475569', idleBorder: '#D3DBE5', text: '#3F4C5C' },
  classic: { bg: '#ECDDF7', activeBorder: '#B98FD6', idleBorder: '#E3D2F2', text: '#6B4E8C' },
  elegant: { bg: '#F4E3EC', activeBorder: '#C98BA8', idleBorder: '#ECD3DF', text: '#8C4E6B' },
  signature: { bg: '#F5E7BF', activeBorder: '#C9A84C', idleBorder: '#EBDCAE', text: '#8A6B1E' },
};

export const TIER_PILL_DEFAULT = TIER_PILL.lite;
