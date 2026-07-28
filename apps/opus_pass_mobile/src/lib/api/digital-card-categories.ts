import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DigitalCardCategoryDef,
  LocalizedText,
  RawDigitalCardCategory,
} from '@/types/digital-card-categories';
import type { DigitalCardProduct } from '@/types/digital-cards';

/**
 * CMS-managed "shop by category" content — same admin-editable source the
 * apps/opus_pass web storefront renders (see
 * apps/opus_pass/src/lib/cms/invitations-categories.ts), read here directly
 * from Supabase rather than a snapshot, so mobile stays in sync as admins
 * update images/copy.
 *
 * Row key: page_key='opus-pass-invitations', section_key='categories'.
 * `content.categories[].img` is normally a hosted Supabase Storage URL, but
 * at least one category (`kadi-za-michango`, as of writing) still points at
 * a local web-app asset path the mobile bundle can't reach — those fall back
 * to a locally bundled copy of the same image.
 */
const LOCAL_IMAGE_FALLBACKS: Record<string, number> = {
  'kadi-za-michango': require('../../../assets/images/categories/coupleswithpiano.jpg'),
};

function resolveLocalized(value: LocalizedText): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.en ?? value.sw ?? '';
}

export async function getDigitalCardCategories(
  client: SupabaseClient
): Promise<DigitalCardCategoryDef[]> {
  const { data, error } = await client
    .from('website_page_sections')
    .select('content')
    .eq('page_key', 'opus-pass-invitations')
    .eq('section_key', 'categories')
    .maybeSingle();
  if (error) throw error;

  const rawCategories =
    (data?.content as { categories?: RawDigitalCardCategory[] } | null)
      ?.categories ?? [];

  return rawCategories.map((raw) => ({
    slug: raw.slug,
    label: resolveLocalized(raw.label),
    subtitle: resolveLocalized(raw.subtitle),
    image: raw.img?.startsWith('http')
      ? { uri: raw.img }
      : (LOCAL_IMAGE_FALLBACKS[raw.slug] ?? { uri: raw.img }),
    productMatchers: raw.product_matchers ?? [],
  }));
}

export function matchesCategory(
  product: DigitalCardProduct,
  category: DigitalCardCategoryDef
): boolean {
  const productCategory = product.category?.toLowerCase() ?? '';
  return category.productMatchers.some((matcher) =>
    productCategory.includes(matcher.toLowerCase())
  );
}
