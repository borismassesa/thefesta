import { Suspense } from 'react'
import Link from 'next/link'
import { Plus, Star } from 'lucide-react'
import { createSupabaseAdminClient } from '@/lib/supabase'
import type { VendorCategory, VendorRecord } from '@/lib/cms/vendors'
import VendorsToolbar from './VendorsToolbar'
import VendorRowActions from './VendorRowActions'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

function resolveMediaUrl(url: string): string {
  if (!url) return ''
  if (/^https?:\/\//.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url
  if (url.startsWith('/')) {
    const base = process.env.NEXT_PUBLIC_WEBSITE_URL ?? ''
    return base ? `${base}${url}` : url
  }
  return url
}

type SearchParams = {
  q?: string
  category?: string
  page?: string
}

export default async function VendorsListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  const category = (sp.category ?? '').trim()
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const supabase = createSupabaseAdminClient()

  const catsRes = await supabase
    .from('website_vendor_categories')
    .select('*')
    .order('display_order', { ascending: true })
  const categories = (catsRes.data ?? []) as VendorCategory[]

  let query = supabase
    .from('website_vendors')
    .select('id, slug, name, category, category_id, city, price_range, rating, review_count, badge, featured, published, hero_media, updated_at', { count: 'exact' })
    .order('featured', { ascending: false })
    .order('rating', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true })

  if (q) {
    query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%,excerpt.ilike.%${q}%`)
  }
  if (category) {
    query = query.eq('category_id', category)
  }

  const { data, count, error } = await query.range(offset, offset + PAGE_SIZE - 1)
  if (error) throw error

  const vendors = (data ?? []) as Array<Pick<VendorRecord,
    'id' | 'slug' | 'name' | 'category' | 'category_id' | 'city' | 'price_range' | 'rating' |
    'review_count' | 'badge' | 'featured' | 'published' | 'hero_media' | 'updated_at'
  >>
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="px-8 py-2">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Vendors</h2>
          <p className="text-sm text-gray-500 mt-2">
            Manage vendor records displayed on the public /vendors page. {total} total.
          </p>
        </div>
        <Link
          href="/cms/vendors/new"
          className="flex items-center gap-2 text-sm font-semibold text-white bg-[#C9A0DC] hover:bg-[#b97fd0] px-4 py-2 rounded-lg transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          New vendor
        </Link>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
        <Suspense fallback={<div className="p-4 text-sm text-gray-400">Loading filters…</div>}>
          <VendorsToolbar initialQ={q} initialCategory={category} categories={categories} />
        </Suspense>

        {vendors.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">
            {q || category ? 'No vendors match your filters.' : 'No vendors yet — create your first one.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="opus-table w-full text-sm">
              <thead className="bg-gray-50/50 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-left px-4 py-3">City</th>
                  <th className="text-left px-4 py-3">Price</th>
                  <th className="text-left px-4 py-3">Rating</th>
                  <th className="text-left px-4 py-3">Badge</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3 w-px">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {vendors.map((v) => (
                  <tr key={v.id} className="group hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/cms/vendors/${v.id}`} className="flex items-center gap-3 group">
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                          {v.hero_media?.src ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={resolveMediaUrl(v.hero_media.src)}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 group-hover:text-[#7E5896] truncate">
                            {v.name}
                          </p>
                          <p className="text-xs text-gray-400 truncate">{v.slug}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{v.category}</td>
                    <td className="px-4 py-3 text-gray-600">{v.city}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs tabular-nums whitespace-nowrap">
                      {v.price_range}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs text-gray-700">
                        <Star className="w-3 h-3 text-[#F5A623]" fill="#F5A623" />
                        <span className="font-semibold tabular-nums">{v.rating?.toFixed(1)}</span>
                        <span className="text-gray-400">({v.review_count})</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {v.badge && <BadgePill kind={v.badge} />}
                        {v.featured && <BadgePill kind="Featured" />}
                        {!v.badge && !v.featured && (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {v.published ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Live
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                          Hidden
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <VendorRowActions id={v.id} slug={v.slug} name={v.name} />
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
              <PageLink q={q} category={category} page={page - 1} disabled={page === 1}>
                ← Prev
              </PageLink>
              <span className="tabular-nums">
                Page {page} / {totalPages}
              </span>
              <PageLink q={q} category={category} page={page + 1} disabled={page >= totalPages}>
                Next →
              </PageLink>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

type BadgeKind = 'Top Rated' | 'Verified' | 'New' | 'Featured'

function BadgePill({ kind }: { kind: BadgeKind | string }) {
  const styles: Record<string, string> = {
    'Top Rated': 'bg-amber-50 text-amber-700',
    Verified: 'bg-sky-50 text-sky-700',
    New: 'bg-emerald-50 text-emerald-700',
    Featured: 'bg-[#F0DFF6] text-[#7E5896]',
  }
  const cls = styles[kind] ?? 'bg-gray-100 text-gray-600'
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}
    >
      {kind}
    </span>
  )
}

function PageLink({
  q, category, page, disabled, children,
}: {
  q: string
  category: string
  page: number
  disabled: boolean
  children: React.ReactNode
}) {
  if (disabled) {
    return <span className="px-3 py-1 rounded-lg border border-gray-100 text-gray-300">{children}</span>
  }
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (category) params.set('category', category)
  if (page > 1) params.set('page', String(page))
  const href = '/cms/vendors' + (params.toString() ? `?${params}` : '')
  return (
    <Link href={href} className="px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
      {children}
    </Link>
  )
}
