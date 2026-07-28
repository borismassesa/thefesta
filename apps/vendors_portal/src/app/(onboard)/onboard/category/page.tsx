import { createSupabasePublicClient } from '@/lib/supabase'
import { VENDOR_CATEGORIES, OTHER_CATEGORY, FALLBACK_ICON_NAMES } from '@/lib/onboarding/categories'
import type { VendorCategoryRow } from '@/lib/onboarding/categories'
import CategoryPageClient, { type ClientCategory } from './CategoryPageClient'

// Every category is fetched, tagged with its vertical, and filtered on the
// client — the chosen vertical lives in the localStorage draft, so the server
// can't know it at render time. The list is small (under 20 rows) so shipping
// all of them and filtering in the browser costs nothing and keeps this page
// statically cacheable.
async function fetchCategories(): Promise<ClientCategory[]> {
  try {
    const supabase = createSupabasePublicClient()
    const { data, error } = await supabase
      .from('vendor_categories')
      .select('slug, label, profile_label, db_value, icon, sort_order, vertical')
      .eq('active', true)
      .neq('slug', 'other')
      .order('sort_order', { ascending: true })
      .returns<VendorCategoryRow[]>()

    if (error) throw error
    if (!data?.length) throw new Error('vendor_categories returned no rows')
    return data.map((row) => ({
      id: row.slug,
      label: row.label,
      iconName: row.icon,
      vertical: row.vertical,
      hint: undefined,
    }))
  } catch (err) {
    // Loud on the server: falling back silently hides the product verticals
    // entirely (the fallback has none), which looks like an empty state rather
    // than the misconfiguration it is.
    console.error('[onboard/category] falling back to static categories:', err)
    // Fallback list is service-only (see VENDOR_CATEGORIES) — a product vendor
    // reaching this branch gets the empty state rather than a stale category
    // that would fail the vendors.category foreign key on submit.
    return VENDOR_CATEGORIES.map((cat) => ({
      id: cat.id,
      label: cat.label,
      iconName: FALLBACK_ICON_NAMES[cat.id] ?? 'Tag',
      vertical: 'service' as const,
      hint: cat.hint,
    }))
  }
}

export default async function CategoryPage() {
  const categories = await fetchCategories()
  const otherCategory: ClientCategory = {
    id: OTHER_CATEGORY.id,
    label: OTHER_CATEGORY.label,
    iconName: 'HelpCircle',
    vertical: 'service',
  }
  return <CategoryPageClient categories={categories} otherCategory={otherCategory} />
}
