import type { ImageSourcePropType } from 'react-native';

export interface DigitalCardCategoryDef {
  slug: string;
  label: string;
  subtitle: string;
  image: ImageSourcePropType;
  productMatchers: string[];
}

/** Raw CMS shape — `label`/`alt`/`subtitle` are inconsistently localized in the live row (some plain strings, some `{en, sw}`). */
export type LocalizedText = string | { en?: string; sw?: string } | undefined;

export interface RawDigitalCardCategory {
  slug: string;
  label: LocalizedText;
  alt?: LocalizedText;
  subtitle?: LocalizedText;
  img: string;
  product_matchers?: string[];
}
