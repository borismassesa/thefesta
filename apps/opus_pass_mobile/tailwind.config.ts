import type { Config } from 'tailwindcss';
import {
  FONT_FAMILY,
  RADIUS,
  SPACING,
  TYPE_SCALE,
} from './src/theme/designTokens';

/** The type scale as Tailwind fontSize entries, so `text-body` carries its
 *  line height and tracking with it and cannot be half-applied. */
const fontSize = Object.fromEntries(
  Object.values(TYPE_SCALE).map((step) => [
    step.utility,
    [`${step.size}px`, { lineHeight: `${step.lineHeight}px`, letterSpacing: `${step.letterSpacing}px` }],
  ])
) as Record<string, [string, { lineHeight: string; letterSpacing: string }]>;

const spacing = Object.fromEntries(
  Object.entries(SPACING).map(([name, value]) => [name, `${value}px`])
);

/**
 * Radii are exposed under a `token-` prefix on purpose.
 *
 * Tailwind already ships `rounded-sm|md|lg|xl` at 2/6/8/12px. Emitting our own
 * sm/md/lg/xl into `extend` OVERRIDES those rather than adding to them, which
 * silently resized 36 existing call sites the first time this was written —
 * a typography change quietly doubling the corner radius of the sign-in
 * inputs. Prefixing keeps both scales addressable and makes reaching for the
 * design-system value explicit.
 */
const borderRadius = Object.fromEntries(
  Object.entries(RADIUS).map(([name, value]) => [
    `token-${name}`,
    value >= 999 ? '9999px' : `${value}px`,
  ])
);

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  // Class-based dark mode: the active scheme is driven by NativeWind's
  // `colorScheme` (set from ColorSchemeProvider), which flips the `of-*` CSS
  // variables declared in global.css (:root = light, .dark:root = dark).
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Backed by CSS custom properties so a single class works in both
        // schemes. Values live in global.css / src/constants/palette.ts (ofVars),
        // kept in sync by src/theme/palette.sync.test.ts. `of-surface` is the
        // themed card background that replaces raw `bg-white`.
        of: {
          primary: 'var(--of-primary)',
          medium: 'var(--of-medium)',
          light: 'var(--of-light)',
          pale: 'var(--of-pale)',
          cream: 'var(--of-cream)',
          surface: 'var(--of-surface)',
          white: 'var(--of-white)',
          dark: 'var(--of-dark)',
          text: 'var(--of-text)',
          muted: 'var(--of-muted)',
          border: 'var(--of-border)',
          green: 'var(--of-green)',
          gold: 'var(--of-gold)',
          coral: 'var(--of-coral)',
          ink: 'var(--of-ink)',
          line: 'var(--of-line)',
          danger: 'var(--of-danger)',
          accent: 'var(--of-accent)',
          placeholder: 'var(--of-placeholder)',
        },
        // Editorial Romance tokens, backed by CSS custom properties (global.css
        // / palette.ts ofVars, guarded by palette.sync.test.ts). Mirrors the JS
        // `editorial` object: `useTheme().editorial.onSurface` ↔ `text-ed-on-surface`.
        ed: {
          'bg': 'var(--ed-bg)',
          'surface': 'var(--ed-surface)',
          'surface-container-lowest': 'var(--ed-surface-container-lowest)',
          'surface-container-low': 'var(--ed-surface-container-low)',
          'surface-container': 'var(--ed-surface-container)',
          'surface-container-high': 'var(--ed-surface-container-high)',
          'surface-container-highest': 'var(--ed-surface-container-highest)',
          'on-surface': 'var(--ed-on-surface)',
          'on-surface-variant': 'var(--ed-on-surface-variant)',
          'primary-container': 'var(--ed-primary-container)',
          'on-primary': 'var(--ed-on-primary)',
          'on-primary-container': 'var(--ed-on-primary-container)',
          'primary-fixed': 'var(--ed-primary-fixed)',
          'surface-tint': 'var(--ed-surface-tint)',
          'secondary': 'var(--ed-secondary)',
          'secondary-container': 'var(--ed-secondary-container)',
          'on-secondary-container': 'var(--ed-on-secondary-container)',
          'tertiary-container': 'var(--ed-tertiary-container)',
          'tertiary-fixed': 'var(--ed-tertiary-fixed)',
          'on-tertiary-fixed': 'var(--ed-on-tertiary-fixed)',
          'on-tertiary-container': 'var(--ed-on-tertiary-container)',
          'outline': 'var(--ed-outline)',
          'outline-variant': 'var(--ed-outline-variant)',
          'error': 'var(--ed-error)',
          'header-tint': 'var(--ed-header-tint)',
        },
      },
      // Inter is the interface;
      // Playfair Bold is celebratory display type only and must not label a
      // control. A weight per family name because Android resolves a face by
      // file rather than by fontWeight.
      fontFamily: {
        inter: [FONT_FAMILY.regular],
        'inter-medium': [FONT_FAMILY.medium],
        'inter-semibold': [FONT_FAMILY.semibold],
        'inter-bold': [FONT_FAMILY.bold],
        'playfair-bold': [FONT_FAMILY.display],
      },
      fontSize,
      spacing,
      borderRadius: {
        ...borderRadius,
        card: '24px',
        button: '9999px',
        pill: '9999px',
        chip: '20px',
        input: '14px',
      },
    },
  },
  plugins: [],
};

export default config;
