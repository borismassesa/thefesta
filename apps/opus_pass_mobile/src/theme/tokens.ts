/**
 * OpusPass design tokens.
 *
 * The single place any screen asks "how big, how bold, how far apart". Before
 * this, every screen invented its own answer: 186 hardcoded font sizes and six
 * loaded font families across 72 files, so two screens built a week apart
 * disagreed about what a card title was. A token is not a shortcut for a
 * literal — it is the decision itself, made once.
 *
 * Rules that hold across the whole app:
 *
 *   Inter is the interface. Every functional surface — check-in, the scanner,
 *   guest lists, forms, navigation, buttons, dialogs, settings, dashboards —
 *   is Inter, because those are read fast, often one-handed, sometimes in bad
 *   light at a door.
 *
 *   Playfair Display is the celebration. It appears only on hero and display
 *   type for premium or celebratory surfaces: the couple's names, an
 *   onboarding hero, editorial content. It never labels a control.
 *
 * Type is exposed as plain style objects rather than Tailwind classes so that
 * a size, a weight, a line height and its letter spacing can never drift apart
 * — they are one decision, and one object.
 */

import { PixelRatio, type TextStyle } from 'react-native';
import {
  DISPLAY_SCALE,
  DURATION,
  FONT_FAMILY,
  ICON_SIZE,
  MAX_FONT_SCALE,
  RADIUS,
  SPACING,
  TYPE_SCALE,
  type TypeStep,
} from '@/theme/designTokens';

/** One scale step as a React Native text style. */
function textStyle(step: TypeStep): TextStyle {
  return {
    fontFamily: step.family,
    fontSize: step.size,
    lineHeight: step.lineHeight,
    letterSpacing: step.letterSpacing,
  };
}

function toTextStyles<T extends Record<string, TypeStep>>(scale: T): Record<keyof T, TextStyle> {
  return Object.fromEntries(
    Object.entries(scale).map(([name, step]) => [name, textStyle(step)])
  ) as Record<keyof T, TextStyle>;
}

/**
 * Font family names as registered with expo-font in app/_layout.tsx.
 *
 * React Native on Android resolves weights by FILE, not by fontWeight, so each
 * weight has to be its own family name. Setting fontWeight alongside these
 * would let iOS synthesise a bolder face than the file provides and the two
 * platforms would stop matching, so the tokens below never set fontWeight.
 */
export const FontFamily = FONT_FAMILY;

/**
 * The type scale.
 *
 * Line heights are absolute rather than multipliers because React Native takes
 * lineHeight in points; the percentages they came from are noted so the
 * relationship survives the next size change. Letter spacing tightens as type
 * grows, which is what stops large text looking loose and small text cramped.
 */
export const Typography = toTextStyles(TYPE_SCALE);

/**
 * Celebratory display type, in Playfair.
 *
 * Deliberately a separate object rather than a variant flag: reaching for it
 * has to be a decision, or it creeps back onto operational screens one commit
 * at a time, which is exactly how the app ended up with 47 serif screen
 * titles nobody chose.
 */
export const DisplayType = toTextStyles(DISPLAY_SCALE);

/**
 * 8-point spacing.
 *
 * 4 exists for the gap between a label and the thing it labels, where 8 reads
 * as a separation rather than a pairing. Everything else steps in eights.
 */
export const Spacing = SPACING;

/** Corner radii. `full` is a pill, and relies on being larger than any height. */
export const Radius = RADIUS;

/**
 * Icon sizes, tied to the type they sit beside.
 *
 * An icon next to caption text at 20pt shouts over it; naming them after the
 * text they accompany is what keeps a row looking like one thought.
 */
export const IconSize = ICON_SIZE;

/**
 * Elevation. Shadow on iOS, elevation on Android, expressed once so a card
 * does not read as flat on one platform and floating on the other.
 */
export const Elevation = {
  none: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  /** A card lifted off the background. */
  card: {
    shadowColor: '#1A1A1A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  /** A sheet or dialog over content. */
  sheet: {
    shadowColor: '#1A1A1A',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;

/**
 * Animation durations.
 *
 * `instant` is for feedback that must feel like a direct consequence of a
 * touch; anything slower reads as lag rather than animation.
 */
export const Duration = DURATION;

/**
 * Cap on how far the system font scale may stretch a given piece of text.
 *
 * Text must grow with the reader's setting — that is not optional — but a
 * headline at 310% pushes the control below it off the screen. Larger type
 * has less room to grow because it starts with more, which is why this is a
 * function of the token rather than one number for the whole app.
 *
 * Pass to a Text as `maxFontSizeMultiplier`.
 */
export const MaxFontScale = MAX_FONT_SCALE;

/** True when the reader has turned the system font size well up. Use it to
 *  drop a row to a column rather than to shrink the text back down. */
export function isLargeTextScale(): boolean {
  return PixelRatio.getFontScale() >= 1.3;
}
