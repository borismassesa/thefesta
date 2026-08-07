/**
 * The design tokens themselves: plain data, no React Native imports.
 *
 * Kept free of runtime dependencies on purpose. tailwind.config.ts runs in
 * Node during the build and cannot import anything that pulls in react-native,
 * so if these values lived only in the RN-facing module the Tailwind utilities
 * would have to repeat them — and a scale that is written down twice is a
 * scale that disagrees with itself within a release. Both sides import this.
 *
 * src/theme/tokens.ts wraps these for use in RN style objects.
 * tailwind.config.ts turns them into `text-body`, `p-md`, `rounded-lg`.
 * src/theme/tokens.sync.test.ts imports the built Tailwind config and fails if
 * the utilities it generates stop matching these values.
 */

/** Font family names as registered with expo-font in app/_layout.tsx. */
export const FONT_FAMILY = {
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semibold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
  /** Celebratory display only. Never for controls or operational screens. */
  display: 'PlayfairDisplay-Bold',
} as const;

export interface TypeStep {
  family: string;
  size: number;
  lineHeight: number;
  letterSpacing: number;
  /**
   * The Tailwind utility this step is exposed as, e.g. `text-card-title`.
   *
   * Only the operational scale has one. Celebratory display type is reached
   * through the `Type` component's RN styles, never a className, so giving
   * those steps a utility name would name a class that does not exist.
   */
  utility?: string;
}

/**
 * The type scale.
 *
 * Line heights are absolute because React Native takes points, not
 * percentages; the ratio each came from is in the comment so the relationship
 * survives the next change. Tracking tightens as type grows, which is what
 * keeps large text from looking loose and small text from looking cramped.
 */
export const TYPE_SCALE = {
  /** 32/120% — the largest thing on a screen. Hero moments only. */
  display: { family: FONT_FAMILY.bold, size: 32, lineHeight: 38, letterSpacing: -0.5, utility: 'display' },
  /** 28/120% — the screen's own name. Operational, so Inter. */
  screenTitle: { family: FONT_FAMILY.bold, size: 28, lineHeight: 34, letterSpacing: -0.25, utility: 'screen-title' },
  /** 20/120% — divides a screen into parts. */
  sectionTitle: { family: FONT_FAMILY.semibold, size: 20, lineHeight: 24, letterSpacing: -0.25, utility: 'section-title' },
  /** 18/120% — names the thing a card is about. */
  cardTitle: { family: FONT_FAMILY.semibold, size: 18, lineHeight: 22, letterSpacing: -0.25, utility: 'card-title' },
  /** 16/150% — prose. The loosest leading in the scale, because this is the
   *  only step anyone reads more than one line of. */
  body: { family: FONT_FAMILY.regular, size: 16, lineHeight: 24, letterSpacing: 0, utility: 'body' },
  /** 14/150% — secondary prose. An addition to the original spec, whose only
   *  14 is Navigation: that step is Medium with 0.2 tracking because it labels
   *  chrome, and running sentences need neither. */
  bodySmall: { family: FONT_FAMILY.regular, size: 14, lineHeight: 21, letterSpacing: 0, utility: 'body-sm' },
  /** 16/120% — the words on a control. Positive tracking because button text
   *  is short, often uppercase, and needs the air. */
  button: { family: FONT_FAMILY.semibold, size: 16, lineHeight: 19, letterSpacing: 0.15, utility: 'button' },
  /** 14/120% — tab bars and headers. */
  navigation: { family: FONT_FAMILY.medium, size: 14, lineHeight: 17, letterSpacing: 0.2, utility: 'navigation' },
  /** 12/140% — supporting detail under something else. */
  caption: { family: FONT_FAMILY.medium, size: 12, lineHeight: 17, letterSpacing: 0, utility: 'caption' },
  /** 11/140% — the smallest text that ships. Pills, badges, overlines. */
  label: { family: FONT_FAMILY.medium, size: 11, lineHeight: 15, letterSpacing: 0, utility: 'label' },
} as const satisfies Record<string, TypeStep>;

/**
 * Celebratory display type, in Playfair.
 *
 * Separate from the scale rather than a flag on it: reaching for the serif has
 * to be a decision, or it creeps back onto operational screens one commit at a
 * time. That is how this app came to have 47 serif screen titles nobody chose.
 */
export const DISPLAY_SCALE = {
  hero: { family: FONT_FAMILY.display, size: 32, lineHeight: 38, letterSpacing: -0.5 },
  heroSmall: { family: FONT_FAMILY.display, size: 28, lineHeight: 34, letterSpacing: -0.25 },
} as const satisfies Record<string, TypeStep>;

/**
 * 8-point spacing. 4 exists for a label and the thing it labels, where 8
 * already reads as a separation rather than a pairing.
 */
export const SPACING = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 48,
  massive: 64,
} as const;

/** Corner radii. `full` is a pill and relies on exceeding any height it meets. */
export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

/**
 * Icon sizes, named after the text they sit beside.
 *
 * A 20pt icon next to caption text shouts over it. Naming them for their
 * companion text is what keeps a row reading as one thought.
 */
export const ICON_SIZE = {
  xs: 13,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const;

/**
 * Animation durations. `instant` is for feedback that must feel like a direct
 * consequence of a touch; slower than that reads as lag, not animation.
 */
export const DURATION = {
  instant: 120,
  fast: 200,
  normal: 300,
  slow: 450,
} as const;

/**
 * Caps on system font scaling.
 *
 * Text must grow with the reader's setting. The cap only stops a 32pt hero at
 * 310% from pushing the control beneath it off the screen, so larger type gets
 * a tighter cap: it starts with more of the screen already spent.
 */
export const MAX_FONT_SCALE = {
  display: 1.4,
  title: 1.5,
  body: 2,
  control: 1.6,
} as const;
