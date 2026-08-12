// Front-page curation editor. Two sections:
//
//  1. Pinned slots — the up-to-5 articles on the public front, in order.
//     Drag rows to reorder. Click ✕ to unpin (article stays in featured
//     pool, just loses its specific slot).
//
//  2. All articles — every published article in the library, searchable.
//     Each row shows current state and the right action:
//       · Pinned to slot #N → "Pinned" badge, no action (it's already up
//         in the slots list — manage from there)
//       · In featured pool (featured=true, no rank) → "In pool" badge +
//         "Pin to slot" action. Pinning moves it to the slots list.
//       · Not featured → "Add to front" action. One click features +
//         pins to the next available slot.
//     If all slots are full, action buttons disable with an explanation.
//
// Reorder/pin/unpin all funnel through the same bulk `reorderFrontPage`
// server action so there's no partial-update path to drift out of sync.

'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Eye,
  GripVertical,
  Plus,
  Search,
  Star,
  TrendingUp,
  X,
} from 'lucide-react'
import {
  reorderFrontPage,
  togglePostFeatured,
} from '@/app/(admin)/operations/articles/actions'
import ArticleThumbnail from '@/app/(admin)/operations/articles/_articles/ArticleThumbnail'

export type FrontPageArticle = {
  id: string
  slug: string
  title: string
  category: string
  authorName: string | null
  publishedAt: string
  featured: boolean
  featuredRank: number | null
  heroSrc: string | null
  heroAlt: string | null
  heroType: 'image' | 'video'
}

type Props = {
  articles: FrontPageArticle[]
  maxSlots: number
}

type Status = 'pinned' | 'pool' | 'available'

function statusOf(a: FrontPageArticle): Status {
  if (a.featured && a.featuredRank != null) return 'pinned'
  if (a.featured) return 'pool'
  return 'available'
}

// Mirror of the public-site logic in apps/opus_website/src/app/
// advice-and-ideas/page.tsx — featured-pool first (pinned by rank, then
// unranked-but-featured by date), padded by non-featured articles until
// we have 5 slots. Keep this in sync if the public-side query order
// ever changes. Each slot includes a `source` so the preview can
// distinguish a deliberate pick from an auto-filled placeholder.
type PreviewSlot =
  | { article: FrontPageArticle; source: 'pinned' | 'pool' | 'fallback' }
  | { article: null; source: 'empty' }

function computeEffectiveSlots(
  items: FrontPageArticle[],
  maxSlots: number
): PreviewSlot[] {
  const pinned = items
    .filter((a) => statusOf(a) === 'pinned')
    .sort((a, b) => (a.featuredRank ?? 0) - (b.featuredRank ?? 0))
  // Newest first inside the pool — same ordering as the public site
  // after its `.reverse()` + stable sort by rank.
  const byPublishedDesc = (a: FrontPageArticle, b: FrontPageArticle) =>
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  const pool = items
    .filter((a) => statusOf(a) === 'pool')
    .sort(byPublishedDesc)
  const available = items
    .filter((a) => statusOf(a) === 'available')
    .sort(byPublishedDesc)

  const filled: PreviewSlot[] = [
    ...pinned.map((article) => ({ article, source: 'pinned' as const })),
    ...pool.map((article) => ({ article, source: 'pool' as const })),
  ]
  let i = 0
  while (filled.length < maxSlots && i < available.length) {
    filled.push({ article: available[i], source: 'fallback' as const })
    i++
  }
  while (filled.length < maxSlots) {
    filled.push({ article: null, source: 'empty' as const })
  }
  return filled.slice(0, maxSlots)
}

export default function FrontPageEditor({ articles, maxSlots }: Props) {
  // Local mirror of the server state so the UI stays responsive while
  // server actions are in flight. We use this single source of truth
  // for all derived views (pinned slots, available list).
  const [items, setItems] = useState<FrontPageArticle[]>(() => articles)
  const [query, setQuery] = useState('')
  const [pending, startTransition] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)
  const dragIndexRef = useRef<number | null>(null)

  // Pinned slots — ordered by rank.
  const pinned = useMemo(
    () =>
      items
        .filter((a) => statusOf(a) === 'pinned')
        .sort((a, b) => (a.featuredRank ?? 0) - (b.featuredRank ?? 0)),
    [items]
  )
  const slotsFull = pinned.length >= maxSlots

  // Everything not currently pinned — pool first (they're "warm",
  // already in the featured set), then plain available articles.
  // Stable sort by status so visually featured-pool items group at the
  // top of the list.
  const browseable = useMemo(() => {
    const rest = items.filter((a) => statusOf(a) !== 'pinned')
    return rest.sort((a, b) => {
      const sa = statusOf(a)
      const sb = statusOf(b)
      if (sa !== sb) return sa === 'pool' ? -1 : 1
      // Within a status group keep newest first.
      return (
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      )
    })
  }, [items])

  const filteredBrowseable = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return browseable
    return browseable.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.slug.toLowerCase().includes(q) ||
        (a.authorName?.toLowerCase().includes(q) ?? false) ||
        a.category.toLowerCase().includes(q)
    )
  }, [browseable, query])

  // ── Mutations ──────────────────────────────────────────────────────
  //
  // Each mutation updates `items` optimistically and then fires the
  // server action. On failure we surface the error and let the user
  // retry; the parent revalidatePath will re-render with server truth
  // on the next navigation.

  function applyRanks(nextItems: FrontPageArticle[]) {
    // Recompute ranks from the order of pinned items in nextItems.
    const pinnedOrder = nextItems
      .filter((a) => statusOf(a) === 'pinned')
      .sort((a, b) => (a.featuredRank ?? 0) - (b.featuredRank ?? 0))
    const ids = pinnedOrder.map((a) => a.id)
    setSaveError(null)
    startTransition(async () => {
      try {
        await reorderFrontPage(ids)
      } catch (err) {
        setSaveError(
          err instanceof Error
            ? err.message
            : 'Could not save the new order. Try again.'
        )
      }
    })
  }

  function move(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= pinned.length) return
    const reordered = [...pinned]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)
    const newRanks = new Map(reordered.map((a, i) => [a.id, i + 1]))
    setItems((prev) =>
      prev.map((a) => {
        const nextRank = newRanks.get(a.id)
        return nextRank != null
          ? { ...a, featured: true, featuredRank: nextRank }
          : a
      })
    )
    applyRanks(
      items.map((a) => {
        const nextRank = newRanks.get(a.id)
        return nextRank != null
          ? { ...a, featured: true, featuredRank: nextRank }
          : a
      })
    )
  }

  function unpin(id: string) {
    setItems((prev) => {
      const next = prev.map((a) =>
        a.id === id ? { ...a, featuredRank: null } : a
      )
      // Recompact remaining pinned ranks to 1..N.
      const stillPinned = next
        .filter((a) => statusOf(a) === 'pinned')
        .sort((a, b) => (a.featuredRank ?? 0) - (b.featuredRank ?? 0))
      const recompacted = new Map(stillPinned.map((a, i) => [a.id, i + 1]))
      return next.map((a) => {
        const r = recompacted.get(a.id)
        return r != null ? { ...a, featuredRank: r } : a
      })
    })
    // Optimistic UI updated above; bulk-save the new pinned order.
    setSaveError(null)
    startTransition(async () => {
      try {
        const remaining = pinned.filter((a) => a.id !== id).map((a) => a.id)
        await reorderFrontPage(remaining)
      } catch (err) {
        setSaveError(
          err instanceof Error
            ? err.message
            : 'Could not unpin. Try again.'
        )
      }
    })
  }

  function pinArticle(article: FrontPageArticle) {
    if (slotsFull) return
    const nextRank = pinned.length + 1
    const wasFeaturedAlready = statusOf(article) === 'pool'
    setItems((prev) =>
      prev.map((a) =>
        a.id === article.id
          ? { ...a, featured: true, featuredRank: nextRank }
          : a
      )
    )
    setSaveError(null)
    startTransition(async () => {
      try {
        // If the article wasn't in the featured pool yet, set
        // featured=true first so the bucket count is right; then
        // reorder. Pool articles only need the reorder.
        if (!wasFeaturedAlready) {
          await togglePostFeatured(article.id, true)
        }
        const nextIds = [...pinned.map((a) => a.id), article.id]
        await reorderFrontPage(nextIds)
      } catch (err) {
        setSaveError(
          err instanceof Error
            ? err.message
            : 'Could not pin the article. Try again.'
        )
      }
    })
  }

  function unfeature(id: string) {
    // Drop from the featured pool entirely. If it was pinned, drop
    // the rank too.
    setItems((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, featured: false, featuredRank: null } : a
      )
    )
    setSaveError(null)
    startTransition(async () => {
      try {
        await togglePostFeatured(id, false)
      } catch (err) {
        setSaveError(
          err instanceof Error
            ? err.message
            : 'Could not remove from featured. Try again.'
        )
      }
    })
  }

  // Native HTML5 drag handlers — small list (5 items max) so we don't
  // need react-dnd or framer for this.
  function onDragStart(index: number) {
    dragIndexRef.current = index
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }
  function onDrop(targetIndex: number) {
    const source = dragIndexRef.current
    dragIndexRef.current = null
    if (source == null) return
    move(source, targetIndex)
  }

  const previewSlots = useMemo(
    () => computeEffectiveSlots(items, maxSlots),
    [items, maxSlots]
  )

  return (
    <div className="space-y-6">
      {saveError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {saveError}
        </div>
      )}

      {/* ── PUBLIC PREVIEW ──────────────────────────────────────────── */}
      <PublicPreview slots={previewSlots} />

      {/* ── PINNED SLOTS ────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <header className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900">Pinned slots</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {pinned.length} of {maxSlots} slots filled · drag to reorder
          </p>
        </header>

        {pinned.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <Star className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-3 text-sm font-medium text-gray-700">
              No pinned slots yet
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Pick an article from the list below to put it on the front.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {pinned.map((article, idx) => (
              <li
                key={article.id}
                draggable={!pending}
                onDragStart={() => onDragStart(idx)}
                onDragOver={onDragOver}
                onDrop={() => onDrop(idx)}
                className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-gray-50/60"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
                  {idx + 1}
                </span>
                {idx === 0 && (
                  <span
                    title="Hero spot in the Trending section on /advice-and-ideas"
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-700 ring-1 ring-purple-200"
                  >
                    <TrendingUp className="h-3 w-3" />
                    Hero
                  </span>
                )}
                <GripVertical className="h-4 w-4 shrink-0 text-gray-300" />
                <ArticleThumbnail
                  category={article.category}
                  heroSrc={article.heroSrc}
                  heroAlt={article.heroAlt}
                  heroType={article.heroType}
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/operations/articles/${article.id}`}
                    className="block truncate text-sm font-semibold text-gray-900 hover:text-[#7E5896]"
                  >
                    {article.title || 'Untitled'}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {article.category}
                    {article.authorName ? ` · by ${article.authorName}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {idx > 0 && (
                    <button data-opus-button="control"
                      type="button"
                      onClick={() => move(idx, idx - 1)}
                      disabled={pending}
                      title="Move up"
                      className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
                    >
                      ↑
                    </button>
                  )}
                  {idx < pinned.length - 1 && (
                    <button data-opus-button="control"
                      type="button"
                      onClick={() => move(idx, idx + 1)}
                      disabled={pending}
                      title="Move down"
                      className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
                    >
                      ↓
                    </button>
                  )}
                  <button data-opus-button="control"
                    type="button"
                    onClick={() => unpin(article.id)}
                    disabled={pending}
                    title="Unpin (keeps it in the featured pool)"
                    className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-amber-50 hover:text-amber-700 disabled:opacity-40"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── ALL ARTICLES ────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <header className="border-b border-gray-100 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                All articles
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {browseable.length} published{' '}
                {browseable.length === 1 ? 'article' : 'articles'} available
                {slotsFull && ' · all slots full, unpin one to free space'}
              </p>
            </div>
            <div className="relative w-full max-w-[280px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, author, or category"
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
              />
            </div>
          </div>
        </header>
        {filteredBrowseable.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">
            {query
              ? 'No articles match. Try a different search.'
              : 'No more articles available. Every published article is already on the front.'}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filteredBrowseable.map((article) => {
              const status = statusOf(article)
              return (
                <li
                  key={article.id}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-gray-50/60"
                >
                  <ArticleThumbnail
                    category={article.category}
                    heroSrc={article.heroSrc}
                    heroAlt={article.heroAlt}
                    heroType={article.heroType}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/operations/articles/${article.id}`}
                        className="block min-w-0 truncate text-sm font-semibold text-gray-900 hover:text-[#7E5896]"
                      >
                        {article.title || 'Untitled'}
                      </Link>
                      {status === 'pool' && (
                        <span
                          title="Featured but not pinned to a specific slot. Pin it to lock its position."
                          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-amber-200"
                        >
                          <Eye className="h-3 w-3" />
                          In pool
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {article.category}
                      {article.authorName
                        ? ` · by ${article.authorName}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button data-opus-button="warning" data-opus-button-size="small"
                      type="button"
                      onClick={() => pinArticle(article)}
                      disabled={pending || slotsFull}
                      title={
                        slotsFull
                          ? 'All slots full. Unpin one first.'
                          : status === 'pool'
                            ? 'Pin to a specific slot'
                            : 'Add to the front page'
                      }
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        status === 'pool'
                          ? 'text-amber-700 hover:bg-amber-50'
                          : 'bg-[#C9A0DC] text-white hover:bg-[#b97fd0] disabled:bg-gray-200 disabled:text-gray-400'
                      }`}
                    >
                      {status === 'pool' ? (
                        <Star className="h-3.5 w-3.5" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      {status === 'pool' ? 'Pin to slot' : 'Add to front'}
                    </button>
                    {status === 'pool' && (
                      <button data-opus-button="control"
                        type="button"
                        onClick={() => unfeature(article.id)}
                        disabled={pending}
                        title="Remove from featured pool entirely"
                        className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

    </div>
  )
}

// Mini layout that mirrors the public Editor Picks row: 1 large hero
// card (slot 1) on the left + 4 stacked cards (slots 2–5) on the right.
// Updates live as the editor pins/unpins/reorders because it's driven
// by the same `items` state through `computeEffectiveSlots`.
//
// We render this above the controls so the cause-and-effect is visible
// in one glance. The "View live page" external link in the panel header
// duplicates the one in the CMS layout, but having it here puts it
// next to the thing it previews.
function PublicPreview({ slots }: { slots: PreviewSlot[] }) {
  const hero = slots[0]
  const stack = slots.slice(1, 5)
  return (
    <section className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <header className="border-b border-gray-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-900">
          Public preview
        </h2>
      </header>
      <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-[1.6fr_1fr]">
        <PreviewHeroCard slot={hero} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
          {stack.map((slot, i) => (
            <PreviewStackCard key={i} slot={slot} index={i + 2} />
          ))}
        </div>
      </div>
    </section>
  )
}

function PreviewHeroCard({ slot }: { slot: PreviewSlot | undefined }) {
  if (!slot || slot.source === 'empty') {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-center text-xs text-gray-400">
        <div>
          <Star className="mx-auto h-6 w-6 text-gray-300" />
          <p className="mt-2 font-medium">Slot 1 empty</p>
          <p className="mt-0.5">
            Pin an article to use this spot as the Trending hero
          </p>
        </div>
      </div>
    )
  }
  const { article, source } = slot
  return (
    <article className="relative overflow-hidden rounded-xl bg-gray-900 aspect-[4/3]">
      {article.heroSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.heroSrc}
          alt={article.heroAlt ?? ''}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-900" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <div className="absolute left-0 right-0 top-0 flex items-center justify-between p-3">
        <span className="rounded-full bg-purple-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          <TrendingUp className="mr-0.5 inline h-3 w-3" />
          Trending · Slot 1
        </span>
        <SourceBadge source={source} />
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
        <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">
          {article.category}
        </p>
        <h3 className="mt-1 line-clamp-2 text-base font-bold leading-tight">
          {article.title || 'Untitled'}
        </h3>
        {article.authorName && (
          <p className="mt-1 text-xs opacity-80">by {article.authorName}</p>
        )}
      </div>
    </article>
  )
}

function PreviewStackCard({
  slot,
  index,
}: {
  slot: PreviewSlot | undefined
  index: number
}) {
  if (!slot || slot.source === 'empty') {
    return (
      <div className="flex h-full min-h-[88px] items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-center text-[11px] text-gray-400">
        <div>
          <p className="font-medium">Slot {index} empty</p>
          <p className="mt-0.5">Auto-fills with the next recent article</p>
        </div>
      </div>
    )
  }
  const { article, source } = slot
  return (
    <article className="flex gap-2.5 rounded-lg border border-gray-100 bg-white p-2.5">
      <div className="relative aspect-square w-16 shrink-0 overflow-hidden rounded-md bg-gray-100">
        {article.heroSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.heroSrc}
            alt={article.heroAlt ?? ''}
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
            #{index}
          </span>
          <SourceBadge source={source} compact />
        </div>
        <p className="mt-1 line-clamp-2 text-xs font-semibold leading-tight text-gray-900">
          {article.title || 'Untitled'}
        </p>
        <p className="mt-0.5 truncate text-[10px] text-gray-500">
          {article.category}
        </p>
      </div>
    </article>
  )
}

// Tells the editor whether a slot is from a deliberate pick (pinned),
// a soft default (pool), or auto-filled from the most-recent fallback.
function SourceBadge({
  source,
  compact,
}: {
  source: PreviewSlot['source']
  compact?: boolean
}) {
  if (source === 'empty') return null
  const label =
    source === 'pinned'
      ? 'Pinned'
      : source === 'pool'
        ? 'From pool'
        : 'Auto-fill'
  const tone =
    source === 'pinned'
      ? 'bg-white/90 text-amber-700'
      : source === 'pool'
        ? 'bg-white/90 text-gray-700'
        : 'bg-white/80 text-gray-500'
  return (
    <span
      title={
        source === 'pinned'
          ? 'You pinned this article to this slot'
          : source === 'pool'
            ? 'In the featured pool. Pin it to lock this slot.'
            : 'Auto-filling from the most recent published article. Pin one to override.'
      }
      className={`inline-flex shrink-0 items-center rounded-full ${compact ? 'px-1 py-0' : 'px-2 py-0.5'} text-[9px] font-bold uppercase tracking-wider ${tone}`}
    >
      {label}
    </span>
  )
}
