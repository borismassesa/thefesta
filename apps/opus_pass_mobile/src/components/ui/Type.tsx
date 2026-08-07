import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { DisplayType, MaxFontScale, Typography } from '@/theme/tokens';

type Variant = keyof typeof Typography | keyof typeof DisplayType;

/**
 * How far the system font setting may stretch each variant.
 *
 * Text must grow when the reader turns their font size up; the cap only stops
 * a 32pt hero at 310% from pushing the button under it off the screen. Bigger
 * type gets a smaller cap because it starts with more room already spent.
 */
const SCALE_CAP: Record<Variant, number> = {
  display: MaxFontScale.display,
  hero: MaxFontScale.display,
  heroSmall: MaxFontScale.display,
  screenTitle: MaxFontScale.title,
  sectionTitle: MaxFontScale.title,
  cardTitle: MaxFontScale.title,
  body: MaxFontScale.body,
  bodySmall: MaxFontScale.body,
  button: MaxFontScale.control,
  navigation: MaxFontScale.control,
  caption: MaxFontScale.body,
  label: MaxFontScale.body,
};

function styleFor(variant: Variant): TextStyle {
  return variant in DisplayType
    ? DisplayType[variant as keyof typeof DisplayType]
    : Typography[variant as keyof typeof Typography];
}

export interface TypeProps extends TextProps {
  /** Which step of the scale. Operational screens use the Typography names;
   *  `hero` and `heroSmall` are the celebratory Playfair variants and belong
   *  only on premium or celebratory surfaces. */
  variant?: Variant;
}

/**
 * Text, at one of the app's defined sizes.
 *
 * Exists so a size, its weight, its line height and its letter spacing cannot
 * drift apart: they are one decision and arrive as one object. It also carries
 * the font-scale cap, which is the part everyone forgets and which only shows
 * up on a reviewer's phone with large text turned on.
 *
 * Colour is deliberately NOT a prop. Text colour comes from the theme through
 * className, so this component never has an opinion about light and dark.
 */
export function Type({ variant = 'body', style, ...props }: TypeProps) {
  return (
    <RNText
      maxFontSizeMultiplier={SCALE_CAP[variant]}
      style={[styleFor(variant), style]}
      {...props}
    />
  );
}
