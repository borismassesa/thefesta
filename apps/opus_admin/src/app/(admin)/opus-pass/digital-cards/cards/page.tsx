import { Suspense } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { resolveOpusPassAssetUrl } from '@/lib/cms/opus-pass-asset-url'
import type { DigitalCardProductRecord } from '@/lib/cms/opus-pass-digital-cards-products'
import ProductsToolbar from './ProductsToolbar'
import ProductRowActions from './ProductRowActions'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20
const BASE = '/cms/opus-pass/digital-cards/products'

type ListRow = Pick<
  DigitalCardProductRecord,
  'id' | 'slug' | 'name' | 'designer' | 'category' |
  'treatment' | 'image_url' | 'designs' | 'published' | 'updated_at'
>

type SearchParams = { q?: string; category?: string; page?: string }

export default async function DigitalCardProductsListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  const category = (sp.category ?? '').trim()
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const supabase = createSupabaseAdminClient()

  let query = supabase
    .from('website_invitations_products')
    .select(
      'id, slug, name, designer, category, treatment, image_url, designs, published, updated_at',
      { count: 'exact' },
    )
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (q) query = query.or(`name.ilike.%${q}%,designer.ilike.%${q}%`)
  if (category) query = query.eq('category', category)

  const { data, count, error } = await query.range(offset, offset + PAGE_SIZE - 1)
  if (error) throw error

  const products = (data ?? []) as ListRow[]
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="py-2">
      <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
        <Suspense fallback={<div className="p-4 text-sm text-gray-400">Loading filters…</div>}>
          <ProductsToolbar
            initialQ={q}
            initialCategory={category}
            actions={
              <Link
                href={`${BASE}/new`}
                className="flex items-center gap-2 text-sm font-semibold text-white bg-[#C9A0DC] hover:bg-[#b97fd0] px-4 py-2 rounded-lg transition-colors shrink-0"
              >
                <Plus className="w-4 h-4" />
                New card
              </Link>
            }
          />
        </Suspense>

        {products.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">
            {q || category ? 'No cards match your filters.' : 'No cards yet — create your first one.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/50 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3">Card</th>
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-left px-4 py-3">Designer</th>
                  <th className="text-left px-4 py-3">Status</th>
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
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.category}</td>
                    <td className="px-4 py-3 text-gray-600">{p.designer}</td>
                    <td className="px-4 py-3">
                      {p.published ? (
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
    return (
      <span className="px-3 py-1 rounded-lg border border-gray-200 text-gray-400 cursor-not-allowed select-none">
        {children}
      </span>
    )
  }
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (category) params.set('category', category)
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
