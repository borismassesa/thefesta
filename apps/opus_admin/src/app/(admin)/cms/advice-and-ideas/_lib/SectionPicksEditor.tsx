// Shared drag-to-reorder picks editor for the "Loved by Couples" and
// "Our Favorites" sections on /advice-and-ideas. Same UX pattern as
// the Front Page Picks editor (Editor Picks), but reads/writes the
// advice_ideas_section_picks side table instead of advice_ideas_posts.
//
// Two preview layouts are supported via the `previewLayout` prop:
//
//   - 'grid'        : 4 equal cards (Loved by Couples)
//   - 'hero+stack'  : 1 large card + 3 smaller stacked (Our Favorites)
//
// Each instance is parameterized — section_key, max slots, copy, and
// preview layout — so adding a third section in the future is a
// matter of new props, not new code.

'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Eye,
  GripVertical,
  Plus,
  Search,
  Star,
  X,
} from 'lucide-react'
import ArticleThumbnail from '@/app/(admin)/operations/articles/_articles/ArticleThumbnail'
import {
  reorderSectionPicks,
  type SectionPickKey,
} from './section-picks-actions'

export type SectionArticle = {
  id: string
  slug: string
  title: string
  category: string
  authorName: string | null
  publishedAt: string
  heroSrc: string | null
  heroAlt: string | null
  heroType: 'image' | 'video'
}

export type PreviewLayout = 'grid' | 'hero+stack'

type Props = {
  sectionKey: SectionPickKey
  sectionLabel: string
  maxSlots: number
  previewLayout: PreviewLayout
  // The articles that are currently picked, in slot order.
  pickedArticles: SectionArticle[]
  // Every other published article the editor can pick from.
  availableArticles: SectionArticle[]
}

export default function SectionPicksEditor({
  sectionKey,
  sectionLabel,
  maxSlots,
  previewLayout,
  pickedArticles,
  availableArticles: initialAvailable,
}: Props) {
  const [picked, setPicked] = useState<SectionArticle[]>(pickedArticles)
  const [available, setAvailable] =
    useState<SectionArticle[]>(initialAvailable)
  const [query, setQuery] = useState('')
  const [pending, startTransition] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)
  const dragIndexRef = useRef<number | null>(null)

  const slotsFull = picked.length >= maxSlots

  const filteredAvailable = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return available
    return available.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.slug.toLowerCase().includes(q) ||
        (a.authorName?.toLowerCase().includes(q) ?? false) ||
        a.category.toLowerCase().includes(q),
    )
  }, [available, query])

  // Same simulate-then-persist pattern as FrontPageEditor.
  function persist(next: SectionArticle[]) {
    setSaveError(null)
    startTransition(async () => {
      try {
        await reorderSectionPicks(sectionKey, next.map((a) => a.id))
      } catch (err) {
        setSaveError(
          err instanceof Error
            ? err.message
            : 'Could not save the new order. Try again.',
        )
      }
    })
  }

  function move(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= picked.length) return
    const next = [...picked]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    setPicked(next)
    persist(next)
  }

  function unpick(id: string) {
    const article = picked.find((a) => a.id === id)
    if (!article) return
    const next = picked.filter((a) => a.id !== id)
    setPicked(next)
    setAvailable([article, ...available])
    persist(next)
  }

  function add(article: SectionArticle) {
    if (slotsFull) return
    const next = [...picked, article]
    setPicked(next)
    setAvailable(available.filter((a) => a.id !== article.id))
    persist(next)
  }

  // Native HTML5 drag handlers — same approach as FrontPageEditor.
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

  // Pad picked → maxSlots with `null` for the preview render so empty
  // slots show a placeholder card.
  const previewSlots: (SectionArticle | null)[] = [
    ...picked,
    ...Array(Math.max(0, maxSlots - picked.length)).fill(null),
  ].slice(0, maxSlots)

  return (
    <div className="space-y-6">
      {saveError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {saveError}
        </div>
      )}

      {/* ── PUBLIC PREVIEW ──────────────────────────────────────────── */}
      <section className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <header className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900">
            Public preview
          </h2>
        </header>
        <div className="p-5">
          {previewLayout === 'hero+stack' ? (
            <HeroStackPreview slots={previewSlots} />
          ) : (
            <GridPreview slots={previewSlots} />
          )}
        </div>
      </section>

      {/* ── PICKED SLOTS ────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <header className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900">
            {sectionLabel}
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {picked.length} of {maxSlots} slots filled, drag to reorder
          </p>
        </header>
        {picked.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <Star className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-3 text-sm font-medium text-gray-700">
              No articles picked yet
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Pick an article from the list below to fill this section.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {picked.map((article, idx) => (
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
                  {idx < picked.length - 1 && (
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
                    onClick={() => unpick(article.id)}
                    disabled={pending}
                    title="Remove from this section"
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
                {available.length} available
                {slotsFull && ', all slots full, remove one to free space'}
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
        {filteredAvailable.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">
            {query
              ? 'No articles match. Try a different search.'
              : 'No more articles available. Every published article is already in this section.'}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filteredAvailable.map((article) => (
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
                  <Link
                    href={`/operations/articles/${article.id}`}
                    className="block min-w-0 truncate text-sm font-semibold text-gray-900 hover:text-[#7E5896]"
                  >
                    {article.title || 'Untitled'}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {article.category}
                    {article.authorName ? ` · by ${article.authorName}` : ''}
                  </p>
                </div>
                <button data-opus-button="primary" data-opus-button-size="small"
                  type="button"
                  onClick={() => add(article)}
                  disabled={pending || slotsFull}
                  title={
                    slotsFull
                      ? 'All slots full. Remove one first.'
                      : `Add to ${sectionLabel}`
                  }
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#C9A0DC] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#b97fd0] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// 4 equal cards in a 2x2 grid (Loved by Couples).
function GridPreview({ slots }: { slots: (SectionArticle | null)[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {slots.map((slot, i) => (
        <PreviewCard key={i} slot={slot} index={i + 1} />
      ))}
    </div>
  )
}

// 1 big hero card on the left + 3 stacked on the right (Our Favorites).
function HeroStackPreview({
  slots,
}: {
  slots: (SectionArticle | null)[]
}) {
  const hero = slots[0]
  const stack = slots.slice(1, 4)
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.6fr_1fr]">
      <PreviewHero slot={hero} />
      <div className="grid grid-cols-1 gap-3">
        {stack.map((slot, i) => (
          <PreviewStack key={i} slot={slot} index={i + 2} />
        ))}
      </div>
    </div>
  )
}

function PreviewCard({
  slot,
  index,
}: {
  slot: SectionArticle | null
  index: number
}) {
  if (!slot) {
    return (
      <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-3 text-center text-xs text-gray-400">
        <Eye className="h-5 w-5" />
        <p className="mt-2 font-medium">Slot {index} empty</p>
        <p className="mt-0.5 text-[10px]">
          Auto-fills with the next recent article
        </p>
      </div>
    )
  }
  return (
    <article className="relative aspect-[4/3] overflow-hidden rounded-xl bg-gray-900">
      {slot.heroSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={slot.heroSrc}
          alt={slot.heroAlt ?? ''}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-900" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <span className="absolute left-3 top-3 rounded-full bg-amber-100/90 px-2 py-0.5 text-[10px] font-bold text-amber-800">
        #{index}
      </span>
      <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
        <p className="text-[9px] font-bold uppercase tracking-wider opacity-80">
          {slot.category}
        </p>
        <h3 className="mt-0.5 line-clamp-2 text-xs font-bold leading-tight">
          {slot.title || 'Untitled'}
        </h3>
      </div>
    </article>
  )
}

function PreviewHero({ slot }: { slot: SectionArticle | null | undefined }) {
  if (!slot) {
    return (
      <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-center text-xs text-gray-400">
        <Eye className="h-6 w-6" />
        <p className="mt-2 font-medium">Slot 1 empty</p>
        <p className="mt-0.5 text-[10px]">Auto-fills with a recent article</p>
      </div>
    )
  }
  return (
    <article className="relative aspect-[4/3] overflow-hidden rounded-xl bg-gray-900">
      {slot.heroSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={slot.heroSrc}
          alt={slot.heroAlt ?? ''}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-900" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <span className="absolute left-3 top-3 rounded-full bg-amber-100/90 px-2 py-0.5 text-[10px] font-bold text-amber-800">
        #1 Hero
      </span>
      <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
        <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">
          {slot.category}
        </p>
        <h3 className="mt-1 line-clamp-2 text-base font-bold leading-tight">
          {slot.title || 'Untitled'}
        </h3>
      </div>
    </article>
  )
}

function PreviewStack({
  slot,
  index,
}: {
  slot: SectionArticle | null
  index: number
}) {
  if (!slot) {
    return (
      <div className="flex h-full min-h-[88px] items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 px-3 text-center text-[11px] text-gray-400">
        <div>
          <p className="font-medium">Slot {index} empty</p>
          <p className="mt-0.5">Auto-fills with a recent article</p>
        </div>
      </div>
    )
  }
  return (
    <article className="flex gap-2.5 rounded-lg border border-gray-100 bg-white p-2.5">
      <div className="relative aspect-square w-16 shrink-0 overflow-hidden rounded-md bg-gray-100">
        {slot.heroSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slot.heroSrc}
            alt={slot.heroAlt ?? ''}
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <span className="inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
          #{index}
        </span>
        <p className="mt-1 line-clamp-2 text-xs font-semibold leading-tight text-gray-900">
          {slot.title || 'Untitled'}
        </p>
        <p className="mt-0.5 truncate text-[10px] text-gray-500">
          {slot.category}
        </p>
      </div>
    </article>
  )
}
