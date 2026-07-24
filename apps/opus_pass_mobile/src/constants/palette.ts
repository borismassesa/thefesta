/**
 * Single source of truth for every OpusFesta color, in both light and dark.
 *
 * Two consumers derive from this file:
 *   1. JS token objects (`editorial`, `colors`) read at render time through the
 *      `useTheme()` hook — see src/theme/useTheme.ts. These flip because the hook
 *      returns `light` or `dark` based on the active color scheme.
 *   2. NativeWind `of-*` utility classes, backed by CSS custom properties. The
 *      variables are hand-declared in global.css (:root = light, .dark:root = dark)
 *      and guarded by src/theme/palette.sync.test.ts, which asserts global.css
 *      matches `ofVars` below so the two files can never silently drift.
 *
 * `editorial` is mirrored into the `ed-*` NativeWind namespace (CSS variables in
 * global.css, `ofVars` below) so screens can style with classes; `colors` backs
 * the flat `of-*` namespace. Both are guarded by palette.sync.test.ts.
 *
 * Light strategy: neutral black/white/gray with a single lavender accent
 * (#C9A0DC), matching apps/opus_pass's monochrome look — deliberately NOT the
 * deep-purple-as-primary treatment dark mode still uses (see below). The
 * decorative `purpleTints` scale in theme.ts (welcome hero, category tinting)
 * is intentionally untouched by this and keeps the fuller purple romance look.
 *
 * Dark strategy (Editorial Romance → dark): the surface scale inverts direction —
 * base surfaces become a near-black charcoal with only a whisper of purple, and
 * elevation gets *lighter* as it rises (Material dark convention), the opposite
 * of light mode. The surface scale is deliberately low-saturation (~12-14%) so
 * full-screen backgrounds and cards read as neutral dark, not eggplant purple;
 * the purple identity still lives in the primary/secondary/tertiary containers.
 * Foreground tokens invert toward light lavender-greys, and the primary purple is
 * lightened so text/icons stay legible on dark. Auth-only neutrals
 * (ink/line/accent/placeholder) do NOT flip — auth screens are light-only for v1.
 */

const lightEditorial = {
  /* Backgrounds — neutral white/gray, matching apps/opus_pass's monochrome look */
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#F9FAFB',
  surfaceContainer: '#F3F4F6',
  surfaceContainerHigh: '#E5E7EB',
  surfaceContainerHighest: '#D1D5DB',

  /* Text */
  onSurface: '#1A1A1A',
  onSurfaceVariant: '#6B7280',

  /* Primary – near-black, matching apps/opus_pass's CTA/text color */
  primaryContainer: '#1A1A1A',
  onPrimary: '#ffffff',
  onPrimaryContainer: '#C9A0DC',
  primaryFixed: '#F3F4F6',

  /* Accent / surface tint — apps/opus_pass's secondary purple */
  surfaceTint: '#7E5896',

  /* Secondary */
  secondary: '#7E5896',
  secondaryContainer: '#F3F4F6',
  onSecondaryContainer: '#1A1A1A',

  /* Tertiary */
  tertiaryContainer: '#7E5896',
  tertiaryFixed: '#F3F4F6',
  onTertiaryFixed: '#1A1A1A',
  onTertiaryContainer: '#C9A0DC',

  /* Outline / borders */
  outline: '#9CA3AF',
  outlineVariant: '#E5E7EB',

  /* Status */
  error: '#ba1a1a',

  /* Home screen header zone — warm peach tint behind the couple/stats block */
  headerTint: '#FCEEE6',
} as const;

export type EditorialTokens = Record<keyof typeof lightEditorial, string>;
export type ColorTokens = Record<keyof typeof lightColors, string>;

const darkEditorial: EditorialTokens = {
  /* Backgrounds — near-black charcoal with a whisper of purple; elevation gets lighter as it rises */
  bg: '#131016',
  surface: '#131016',
  surfaceContainerLowest: '#0E0C10',
  surfaceContainerLow: '#1B181F',
  surfaceContainer: '#211E26',
  surfaceContainerHigh: '#2B2631',
  surfaceContainerHighest: '#332D3B',

  /* Text — light lavender-greys */
  onSurface: '#ECE0F5',
  onSurfaceVariant: '#C9B8D6',

  /* Primary – lightened purple so white text / icons stay legible on dark */
  primaryContainer: '#7B4FA2',
  onPrimary: '#ffffff',
  onPrimaryContainer: '#E0C9F0',
  primaryFixed: '#2E1A45',

  /* Accent / surface tint */
  surfaceTint: '#9B73B8',

  /* Secondary */
  secondary: '#C9A0DC',
  secondaryContainer: '#3D2A52',
  onSecondaryContainer: '#EAD9F5',

  /* Tertiary */
  tertiaryContainer: '#9B73B8',
  tertiaryFixed: '#241533',
  onTertiaryFixed: '#F3EBF9',
  onTertiaryContainer: '#E0C9F0',

  /* Outline / borders */
  outline: '#9885A8',
  outlineVariant: '#393341',

  /* Status — Material dark uses a lighter error red */
  error: '#FFB4AB',

  /* Home screen header zone — warm muted rose, dark-mode equivalent of the light peach tint */
  headerTint: '#2B1D2A',
};

const lightColors = {
  // Neutral black/white/gray + single lavender accent, matching apps/opus_pass.
  primary: '#1A1A1A',
  medium: '#7E5896',
  light: '#C9A0DC',
  pale: '#F3F4F6',
  cream: '#FFFFFF',
  surface: '#FFFFFF',
  white: '#FFFFFF',
  dark: '#1A1A1A',
  text: '#1A1A1A',
  muted: '#6B7280',
  border: 'rgba(0,0,0,0.12)',
  green: '#2D8E5B',
  gold: '#C4920A',
  coral: '#D85A30',
} as const;

const darkColors: ColorTokens = {
  primary: '#9B73B8', // lightened: white text still passes, legible as an icon on dark
  medium: '#B98FD6',
  light: '#C9A0DC',
  pale: '#241533',
  cream: '#131016', // page background
  surface: '#211E26', // elevated card surface (was #fff in light)
  white: '#FFFFFF', // true white — foreground on purple, must not flip
  dark: '#2A1245',
  text: '#ECE0F5',
  muted: '#C9B8D6',
  border: 'rgba(201,160,220,0.16)',
  green: '#5FBF8A',
  gold: '#E5B23A',
  coral: '#F07A50',
};

export const light = { editorial: lightEditorial, colors: lightColors } as const;
export const dark = { editorial: darkEditorial, colors: darkColors } as const;

export type ThemeTokens = { editorial: EditorialTokens; colors: ColorTokens };

export const themes = { light, dark } as const;
export type ColorScheme = keyof typeof themes;

/**
 * CSS custom properties consumed by NativeWind `of-*` utility classes.
 * Derived from `colors` above (single source) plus auth/neutral extras that are
 * light-only for v1. global.css must mirror this map exactly — the sync test
 * (src/theme/palette.sync.test.ts) enforces it. A `dark` value of `undefined`
 * means the token keeps its light value in dark mode (NativeWind falls back).
 */
export const ofVars: Record<string, { light: string; dark?: string }> = {
  '--of-primary': { light: lightColors.primary, dark: darkColors.primary },
  '--of-medium': { light: lightColors.medium, dark: darkColors.medium },
  '--of-light': { light: lightColors.light },
  '--of-pale': { light: lightColors.pale, dark: darkColors.pale },
  '--of-cream': { light: lightColors.cream, dark: darkColors.cream },
  '--of-surface': { light: lightColors.surface, dark: darkColors.surface },
  '--of-white': { light: lightColors.white },
  '--of-dark': { light: lightColors.dark },
  '--of-text': { light: lightColors.text, dark: darkColors.text },
  '--of-muted': { light: lightColors.muted, dark: darkColors.muted },
  '--of-border': { light: lightColors.border, dark: darkColors.border },
  '--of-green': { light: lightColors.green, dark: darkColors.green },
  '--of-gold': { light: lightColors.gold, dark: darkColors.gold },
  '--of-coral': { light: lightColors.coral, dark: darkColors.coral },
  // Auth / neutral extras — light-only for v1 (auth stays light).
  '--of-ink': { light: '#1A1A1A' },
  '--of-line': { light: '#D1D5DB' },
  '--of-danger': { light: '#DC2626', dark: '#F87171' },
  '--of-accent': { light: '#7E5896' },
  '--of-placeholder': { light: '#9CA3AF' },
  // Editorial Romance tokens — the `ed-*` NativeWind namespace, mirroring the
  // JS `editorial` object above so screens can style with classes instead of
  // inline `useTheme().editorial.*`. Derived from lightEditorial/darkEditorial.
  '--ed-bg': { light: '#FFFFFF', dark: '#131016' },
  '--ed-surface': { light: '#FFFFFF', dark: '#131016' },
  '--ed-surface-container-lowest': { light: '#ffffff', dark: '#0E0C10' },
  '--ed-surface-container-low': { light: '#F9FAFB', dark: '#1B181F' },
  '--ed-surface-container': { light: '#F3F4F6', dark: '#211E26' },
  '--ed-surface-container-high': { light: '#E5E7EB', dark: '#2B2631' },
  '--ed-surface-container-highest': { light: '#D1D5DB', dark: '#332D3B' },
  '--ed-on-surface': { light: '#1A1A1A', dark: '#ECE0F5' },
  '--ed-on-surface-variant': { light: '#6B7280', dark: '#C9B8D6' },
  '--ed-primary-container': { light: '#1A1A1A', dark: '#7B4FA2' },
  '--ed-on-primary': { light: '#ffffff' },
  '--ed-on-primary-container': { light: '#C9A0DC', dark: '#E0C9F0' },
  '--ed-primary-fixed': { light: '#F3F4F6', dark: '#2E1A45' },
  '--ed-surface-tint': { light: '#7E5896', dark: '#9B73B8' },
  '--ed-secondary': { light: '#7E5896', dark: '#C9A0DC' },
  '--ed-secondary-container': { light: '#F3F4F6', dark: '#3D2A52' },
  '--ed-on-secondary-container': { light: '#1A1A1A', dark: '#EAD9F5' },
  '--ed-tertiary-container': { light: '#7E5896', dark: '#9B73B8' },
  '--ed-tertiary-fixed': { light: '#F3F4F6', dark: '#241533' },
  '--ed-on-tertiary-fixed': { light: '#1A1A1A', dark: '#F3EBF9' },
  '--ed-on-tertiary-container': { light: '#C9A0DC', dark: '#E0C9F0' },
  '--ed-outline': { light: '#9CA3AF', dark: '#9885A8' },
  '--ed-outline-variant': { light: '#E5E7EB', dark: '#393341' },
  '--ed-error': { light: '#ba1a1a', dark: '#FFB4AB' },
  '--ed-header-tint': { light: '#FCEEE6', dark: '#2B1D2A' },
};
