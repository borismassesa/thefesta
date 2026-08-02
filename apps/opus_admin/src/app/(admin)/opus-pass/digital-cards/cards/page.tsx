import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ExternalLink, Plus } from 'lucide-react'
import { HeaderActionsSlot } from '@/components/HeaderPortals'
import { hasPermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { resolveOpusPassAssetUrl } from '@/lib/cms/opus-pass-asset-url'
import { assessBindings, type CardFieldBinding } from '@/lib/cms/card-field-roles'
import {
  DEFAULT_PRODUCT_SORT,
  NO_BADGE,
  PRODUCT_BADGES,
  PRODUCT_BADGE_LABELS,
  PRODUCT_CATEGORIES,
  isProductSort,
  type DigitalCardProductRecord,
  type ProductBadge,
  type ProductSort,
} from '@/lib/cms/opus-pass-digital-cards-products'
import DigitalCardsNavTabs from '../DigitalCardsNavTabs'
import SetDigitalCardsHeading from '../SetDigitalCardsHeading'
import ProductsToolbar, { type FilterOption } from './ProductsToolbar'
import ProductRowActions from './ProductRowActions'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20
const BASE = '/opus-pass/digital-cards/cards'

type ListRow = Pick<
  DigitalCardProductRecord,
  'id' | 'slug' | 'name' | 'category' | 'badge' |
  'treatment' | 'image_url' | 'artwork_svg_url' | 'designs' | 'published' | 'updated_at'
> & {
  /**
   * The nightly job's suggestion. Not on DigitalCardProductRecord because the
   * editor must never write it (see READ_ONLY_PRODUCT_COLUMNS), but the list
   * needs it to tell a staff pick apart from a computed one. The DB CHECK
   * narrows it to most_popular/trending.
   */
  badge_auto: ProductBadge | null
  /**
   * The card's layer mapping, so the list can say which cards can take an
   * order. Read-only here; it is edited on the card's Artwork tab.
   */
  field_bindings: CardFieldBinding[] | null
}

/** One row of public.website_invitations_product_sales, keyed by card id. */
type SalesRow = {
  product_id: string
  paid_units_all_time: number
  paid_units_30d: number
  last_paid_at: string | null
}

type SearchParams = {
  q?: string
  category?: string
  badge?: string
  sort?: string
  page?: string
}

/** The columns each sort maps to. Every sort breaks ties on name for stability. */
const SORT_COLUMNS: Record<ProductSort, { column: string; ascending: boolean }[]> = {
  curated: [{ column: 'sort_order', ascending: true }],
  newest: [{ column: 'created_at', ascending: false }],
  updated: [{ column: 'updated_at', ascending: false }],
  name: [],
}

/** The one row shape the facet counts are computed from. */
type FacetRow = {
  name: string | null
  designer: string | null
  category: string | null
  /** The effective badge (staff pick, else the nightly job's) — see the badge_effective column. */
  badge_effective: string | null
}

type ActiveFilters = { q: string; category: string; badge: string }

function matchesQ(row: FacetRow, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  return (
    (row.name ?? '').toLowerCase().includes(needle) ||
    (row.designer ?? '').toLowerCase().includes(needle)
  )
}

function matchesCategory(row: FacetRow, category: string): boolean {
  return !category || (row.category ?? '').trim() === category
}

function matchesBadge(row: FacetRow, badge: string): boolean {
  if (!badge) return true
  return badge === NO_BADGE ? row.badge_effective === null : row.badge_effective === badge
}

/**
 * Faceted counts: each dropdown counts rows that pass every filter EXCEPT its
 * own, which is what makes the numbers answer "how many would I get if I
 * picked this?" rather than "how many exist in total".
 *
 * Every option always renders, count included — a category or badge nobody has
 * used yet reads "(0)" instead of vanishing. That's the fix for the drift that
 * broke this filter once: an option can be empty, but it can never be missing
 * or silently wrong.
 *
 * All facets come off one small select over the whole catalogue (a few hundred
 * short rows) rather than a query per facet. If the catalogue ever outgrows
 * PostgREST's max-rows ceiling these counts would start under-reporting, at
 * which point they belong in a SQL view.
 */
function buildFacets(rows: FacetRow[], active: ActiveFilters) {
  const countBy = (
    keyOf: (row: FacetRow) => string | null,
    skip: keyof ActiveFilters,
  ): Map<string, number> => {
    const counts = new Map<string, number>()
    for (const row of rows) {
      if (skip !== 'q' && !matchesQ(row, active.q)) continue
      if (skip !== 'category' && !matchesCategory(row, active.category)) continue
      if (skip !== 'badge' && !matchesBadge(row, active.badge)) continue
      const key = keyOf(row)
      if (key !== null) counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }

  // ── Categories: canonical order, then any off-taxonomy value in the data ──
  const categoryCounts = countBy((r) => (r.category ?? '').trim() || null, 'category')
  const canonical = PRODUCT_CATEGORIES as readonly string[]
  const extraCategories = [...categoryCounts.keys()].filter((c) => !canonical.includes(c)).sort()
  // A URL can name a category that is neither canonical nor in the data; keep
  // it so the dropdown never displays a value other than the one filtering.
  if (
    active.category &&
    !canonical.includes(active.category) &&
    !extraCategories.includes(active.category)
  ) {
    extraCategories.push(active.category)
  }
  const categories: FilterOption[] = [...canonical, ...extraCategories].map((value) => ({
    value,
    label: value,
    count: categoryCounts.get(value) ?? 0,
    flagged: !canonical.includes(value) ? 'off-taxonomy' : undefined,
  }))

  // ── Badges: the promotional pills, plus an explicit "no badge" bucket ──
  const badgeCounts = countBy((r) => r.badge_effective ?? NO_BADGE, 'badge')
  const badges: FilterOption[] = [
    ...PRODUCT_BADGES.map((value) => ({
      value,
      label: PRODUCT_BADGE_LABELS[value],
      count: badgeCounts.get(value) ?? 0,
    })),
    { value: NO_BADGE, label: 'No badge', count: badgeCounts.get(NO_BADGE) ?? 0 },
  ]

  return { categories, badges }
}

export default async function DigitalCardProductsListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  if (!(await hasPermission('cms.read'))) redirect('/')

  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  const category = (sp.category ?? '').trim()
  // Unrecognised badge/sort values fall back to "no filter" / the default
  // order rather than 500ing on a hand-edited URL.
  const badgeParam = (sp.badge ?? '').trim()
  const badge =
    badgeParam === NO_BADGE || (PRODUCT_BADGES as readonly string[]).includes(badgeParam)
      ? badgeParam
      : ''
  const sortParam = (sp.sort ?? '').trim()
  const sort: ProductSort = isProductSort(sortParam) ? sortParam : DEFAULT_PRODUCT_SORT
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const supabase = createSupabaseAdminClient()

  let query = supabase
    .from('website_invitations_products')
    .select(
      'id, slug, name, category, badge, badge_auto, treatment, image_url, artwork_svg_url, designs, published, updated_at, field_bindings',
      { count: 'exact' },
    )

  for (const { column, ascending } of SORT_COLUMNS[sort]) {
    query = query.order(column, { ascending })
  }
  // Name is the final tiebreak on every sort, so equal sort_orders / prices /
  // identical timestamps still paginate deterministically instead of letting
  // rows drift between pages.
  query = query.order('name', { ascending: true })

  if (q) query = query.or(`name.ilike.%${q}%,designer.ilike.%${q}%`)
  if (category) query = query.eq('category', category)
  // Filter on badge_effective, not badge: a card badged by the nightly job has
  // badge IS NULL but a badge_effective set, and must still be findable here.
  if (badge)
    query = badge === NO_BADGE ? query.is('badge_effective', null) : query.eq('badge_effective', badge)

  // Facets are counted across the whole catalogue, not the current page, so
  // they need their own select.
  const [
    { data, count, error },
    { data: facetRows, error: facetError },
  ] = await Promise.all([
    query.range(offset, offset + PAGE_SIZE - 1),
    supabase
      .from('website_invitations_products')
      .select('name, designer, category, badge_effective'),
  ])
  if (error) throw error
  if (facetError) throw facetError

  const products = (data ?? []) as ListRow[]

  // Sales come from a view keyed by card id, which PostgREST can't join to the
  // products table (no foreign key between them), so they're fetched for the
  // visible page only. That keeps server-side pagination on the products table
  // exactly as it was, and the extra round trip is 20 short rows.
  const { data: salesRows, error: salesError } = products.length
    ? await supabase
        .from('website_invitations_product_sales')
        .select('product_id, paid_units_all_time, paid_units_30d, last_paid_at')
        .in('product_id', products.map((p) => p.id))
    : { data: [] as SalesRow[], error: null }
  if (salesError) throw salesError
  const salesById = new Map(((salesRows ?? []) as SalesRow[]).map((s) => [s.product_id, s]))

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const facets = buildFacets((facetRows ?? []) as FacetRow[], { q, category, badge })

  const opusPassUrl = process.env.NEXT_PUBLIC_OPUS_PASS_URL ?? 'http://localhost:3008'

  return (
    <>
      <SetDigitalCardsHeading />
      <HeaderActionsSlot>
        <a
          href={`${opusPassUrl}/digital-cards`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          View live site
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </HeaderActionsSlot>
      <DigitalCardsNavTabs />

      <div className="px-8 pt-6 pb-6">
      <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
        <Suspense fallback={<div className="p-4 text-sm text-gray-400">Loading filters…</div>}>
          <ProductsToolbar
            initialQ={q}
            initialCategory={category}
            initialBadge={badge}
            initialSort={sort}
            categoryOptions={facets.categories}
            badgeOptions={facets.badges}
            actions={
              <Link
                href={`${BASE}/new`}
                className="flex items-center gap-2 text-sm font-semibold text-white bg-[#7E5896] hover:bg-[#6b4a80] px-4 py-2 rounded-lg shadow-sm transition-colors shrink-0"
              >
                <Plus className="w-4 h-4" />
                New card
              </Link>
            }
          />
        </Suspense>

        {products.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">
            {q || category || badge
              ? 'No cards match your filters.'
              : 'No cards yet — create your first one.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/50 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3">Card</th>
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-left px-4 py-3">Badge</th>
                  {/* Sold is right-aligned and Status is left-aligned, so their
                      contents meet in the middle. Explicit pl/pr (not px + an
                      override) widens that one gutter so the figure doesn't read
                      as part of the status pill. */}
                  <th className="text-right pl-4 pr-8 py-3">Sold</th>
                  <th className="text-left pl-6 pr-4 py-3">Status</th>
                  <th className="text-right px-4 py-3 w-px">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((p) => (
                  <tr key={p.id} className="group hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`${BASE}/${p.id}`} className="flex items-center gap-3 group">
                        <div className="w-10 h-12 rounded-md overflow-hidden bg-gray-100 shrink-0 ring-1 ring-gray-200">
                          {(() => {
                            const thumb = p.image_url || (Array.isArray(p.designs) ? p.designs.find(Boolean) : '')
                            return thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={resolveOpusPassAssetUrl(thumb)}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-[8px] font-medium uppercase tracking-wide text-gray-400">
                                CSS
                              </span>
                            )
                          })()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 group-hover:text-[#7E5896] truncate">
                            {p.name}
                          </p>
                          <p className="text-xs text-gray-400 truncate">{p.treatment}</p>
                          <CardSetupBadge
                            artworkUrl={p.artwork_svg_url}
                            bindings={p.field_bindings}
                            category={p.category}
                          />
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.category}</td>
                    <td className="px-4 py-3">
                      <BadgeCell badge={p.badge} badgeAuto={p.badge_auto} />
                    </td>
                    <td className="pl-4 pr-8 py-3 text-right">
                      <SoldCell sales={salesById.get(p.id)} />
                    </td>
                    <td className="pl-6 pr-4 py-3">
                      {p.published ? (
                        <span className="inline-flex items-center rounded-full bg-[#9FE870]/25 px-2 py-0.5 text-[11px] font-semibold text-[#3d6b1f]">
                          Live
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
                          Hidden
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ProductRowActions id={p.id} name={p.name} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
            <p>
              Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <PageLink params={{ q, category, badge, sort }} page={page - 1} disabled={page === 1}>
                ← Prev
              </PageLink>
              <span className="tabular-nums">
                Page {page} / {totalPages}
              </span>
              <PageLink params={{ q, category, badge, sort }} page={page + 1} disabled={page >= totalPages}>
                Next →
              </PageLink>
            </div>
          </div>
        )}
      </div>
      </div>
    </>
  )
}

/**
 * The badge a customer actually sees, and where it came from.
 *
 * `badge` is the staff pick and always wins; `badge_auto` is the nightly job's
 * suggestion, showing through only where nobody has decided. Marking the
 * computed ones matters: without it, staff see a pill they never set and can't
 * tell whether editing the card would remove it.
 */
function BadgeCell({
  badge,
  badgeAuto,
}: {
  badge: ProductBadge | null
  badgeAuto: ProductBadge | null
}) {
  const effective = badge ?? badgeAuto
  // No badge is the common case across the catalogue, so it stays blank rather
  // than adding a row of placeholder text to read past.
  if (!effective) return null
  const isAuto = badge === null
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={
          isAuto
            ? 'inline-flex shrink-0 items-center rounded-full bg-[#9FE870]/15 ring-1 ring-inset ring-[#9FE870]/40 px-2 py-0.5 text-[11px] font-semibold text-gray-700'
            : 'inline-flex shrink-0 items-center rounded-full bg-[#9FE870]/30 px-2 py-0.5 text-[11px] font-semibold text-gray-900'
        }
      >
        {PRODUCT_BADGE_LABELS[effective]}
      </span>
      {isAuto && (
        <span
          className="text-[9px] font-bold uppercase tracking-wider text-gray-400"
          title="Set by the nightly sales job. Pick a badge on the card to override it."
        >
          auto
        </span>
      )}
    </span>
  )
}

/**
 * Paid units for a card. All-time is the headline; the 30-day figure sits under
 * it because that's the one that answers "is this selling now?".
 *
 * A card with no orders reads 0 rather than blank, so an empty cell always means
 * "the sales lookup failed", never "nothing sold".
 */
function SoldCell({ sales }: { sales?: SalesRow }) {
  const allTime = sales?.paid_units_all_time ?? 0
  const last30 = sales?.paid_units_30d ?? 0
  if (allTime === 0) {
    return <span className="tabular-nums text-gray-300">0</span>
  }
  return (
    <span
      // nowrap on the sub-line: the column is sized by its short header, so
      // "1 in 30 days" would otherwise break across two lines.
      className="flex flex-col items-end whitespace-nowrap leading-tight"
      title={sales?.last_paid_at ? `Last sold ${formatSoldDate(sales.last_paid_at)}` : undefined}
    >
      <span className="font-semibold tabular-nums text-gray-900">{allTime}</span>
      <span className="text-[11px] tabular-nums text-gray-400">
        {last30} in 30 days
      </span>
    </span>
  )
}

function formatSoldDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function PageLink({
  params: active, page, disabled, children,
}: {
  /** Every active filter/sort, so paging never silently drops one. */
  params: { q: string; category: string; badge: string; sort: ProductSort }
  page: number
  disabled: boolean
  children: React.ReactNode
}) {
  if (disabled) {
    return (
      <span className="px-3 py-1 rounded-lg border border-gray-200 text-gray-400 cursor-not-allowed select-none">
        {children}
      </span>
    )
  }
  const params = new URLSearchParams()
  if (active.q) params.set('q', active.q)
  if (active.category) params.set('category', active.category)
  if (active.badge) params.set('badge', active.badge)
  if (active.sort !== DEFAULT_PRODUCT_SORT) params.set('sort', active.sort)
  if (page > 1) params.set('page', String(page))
  const href = BASE + (params.toString() ? `?${params}` : '')
  return (
    <Link
      href={href}
      className="px-3 py-1 rounded-lg border border-gray-300 font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
    >
      {children}
    </Link>
  )
}

/**
 * Whether a card's artwork is set up well enough to take an order.
 *
 * This is the one thing the old Templates list showed that the catalogue did
 * not, and it is the reason that list existed. Surfacing it here means the
 * question "which of our cards actually work?" is answered without a second
 * tab over the same table.
 */
function CardSetupBadge({
  artworkUrl,
  bindings,
  category,
}: {
  artworkUrl: string | null
  bindings: CardFieldBinding[] | null
  category: string
}) {
  // Only SVG artwork carries layers, so nothing else can be mapped at all.
  const isSvg = /\.svg(\?|#|$)/i.test((artworkUrl ?? '').trim())
  if (!isSvg) return null

  const mapping = bindings ?? []
  if (mapping.length === 0) {
    return (
      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
        Artwork not mapped
      </span>
    )
  }
  const readiness = assessBindings(mapping, category)
  return readiness.canFulfilOrders ? (
    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#9FE870] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#14361f]">
      Ready for orders
    </span>
  ) : (
    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
      {readiness.blocked.length + readiness.unbound.length} field
      {readiness.blocked.length + readiness.unbound.length === 1 ? '' : 's'} to map
    </span>
  )
}
