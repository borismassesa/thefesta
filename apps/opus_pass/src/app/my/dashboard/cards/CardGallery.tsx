'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Download,
  ImageIcon,
  Loader2,
  Maximize2,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react'
import type { CardStatus, GalleryCard } from '@/lib/dashboard/released-cards'
import { CARD_STATUS_ORDER, cardStatusMeta, isReleased } from '@/lib/cards/card-status'
import { downloadReleasedCard } from '@/lib/card-download'
import { cn } from '@/lib/utils'
import CardLightbox from './CardLightbox'

/**
 * Every card the couple owns.
 *
 * The gallery is the top level and stays a list at any size: one card or
 * twenty, the answer to "which one am I looking at?" is always a click away
 * rather than a layout the page has to switch between.
 *
 * Search, filter and sort run in the browser. A couple owns a handful of cards,
 * not a catalogue, so a round trip per keystroke would buy nothing.
 */

type Sort = 'recent' | 'updated' | 'name'

const SORTS: { value: Sort; label: string }[] = [
  { value: 'recent', label: 'Recently purchased' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'name', label: 'Alphabetical' },
]

export default function CardGallery({ cards }: { cards: GalleryCard[] }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<CardStatus | 'all'>('all')
  const [sort, setSort] = useState<Sort>('recent')
  const [downloading, setDownloading] = useState<string | null>(null)
  const [zoomed, setZoomed] = useState<GalleryCard | null>(null)

  // Only offer the statuses this couple actually has. A filter row listing
  // states none of their cards are in is noise.
  const presentStatuses = useMemo(
    () => CARD_STATUS_ORDER.filter((s) => cards.some((c) => c.status === s)),
    [cards],
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = cards.filter((card) => {
      if (status !== 'all' && card.status !== status) return false
      if (!needle) return true
      return (
        card.cardName.toLowerCase().includes(needle) ||
        card.orderRef.toLowerCase().includes(needle) ||
        (card.category ?? '').toLowerCase().includes(needle)
      )
    })
    const time = (value: string | null) => (value ? new Date(value).getTime() : 0)
    return [...filtered].sort((a, b) => {
      if (sort === 'name') return a.cardName.localeCompare(b.cardName)
      if (sort === 'updated') return time(b.updatedAt) - time(a.updatedAt)
      return time(b.purchasedAt) - time(a.purchasedAt)
    })
  }, [cards, query, status, sort])

  async function download(card: GalleryCard) {
    setDownloading(card.designId)
    try {
      await downloadReleasedCard(card.designId, card.cardName)
    } finally {
      setDownloading(null)
    }
  }

  if (cards.length === 0) return <EmptyState />

  return (
    <div>
      {/* One row on a wide screen. On a phone the search takes its own row and
          the sort and the buy button share the next, rather than three
          full-width controls stacked before the cards. */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1A1A]/35" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your cards"
            aria-label="Search your cards"
            className="w-full rounded-xl border border-black/[0.08] bg-white py-2.5 pl-9 pr-3 text-sm text-[#1A1A1A] outline-none placeholder:text-[#1A1A1A]/35 focus:border-[#7E5896]"
          />
        </div>
        <label className="sr-only" htmlFor="card-sort">
          Sort cards
        </label>
        <div className="flex gap-3">
          <select
            id="card-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="min-w-0 flex-1 rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm font-medium text-[#1A1A1A] outline-none focus:border-[#7E5896] sm:flex-none"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {/* Buying the next card is an action on this list, so it lives on the
              list's own toolbar rather than up in the page header. */}
          <Link
            href="/digital-cards"
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#7E5896] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(126,88,150,0.9)] transition-colors hover:bg-[#6b4a80]"
          >
            <Plus className="h-4 w-4" />
            Buy another card
          </Link>
        </div>
      </div>

      {presentStatuses.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          <FilterPill active={status === 'all'} onClick={() => setStatus('all')}>
            All ({cards.length})
          </FilterPill>
          {presentStatuses.map((s) => (
            <FilterPill key={s} active={status === s} onClick={() => setStatus(s)}>
              {cardStatusMeta(s).label} ({cards.filter((c) => c.status === s).length})
            </FilterPill>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-black/[0.06] bg-white px-5 py-10 text-center text-sm text-[#1A1A1A]/55">
          No cards match that search.
        </p>
      ) : (
        // auto-fill, not a fixed column count: a couple with one card gets one
        // normal-sized tile and empty tracks beside it, rather than a single
        // tile stretched across the whole page.
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] sm:gap-5">
          {visible.map((card) => (
            <Tile
              key={card.designId}
              card={card}
              downloading={downloading === card.designId}
              onDownload={() => download(card)}
              onZoom={() => setZoomed(card)}
            />
          ))}
        </div>
      )}

      {zoomed && (
        <CardLightbox
          designId={zoomed.designId}
          cardName={zoomed.cardName}
          onClose={() => setZoomed(null)}
          onDownload={() => download(zoomed)}
          downloading={downloading === zoomed.designId}
        />
      )}
    </div>
  )
}

function Tile({
  card,
  downloading,
  onDownload,
  onZoom,
}: {
  card: GalleryCard
  downloading: boolean
  onDownload: () => void
  onZoom: () => void
}) {
  const meta = cardStatusMeta(card.status)
  const href = `/my/dashboard/cards/${card.designId}`
  const released = isReleased(card.status) && card.hasArtefact

  const counts = [
    card.digitalQty > 0 && `${card.digitalQty.toLocaleString('en-US')} guests`,
    card.printQty > 0 && `${card.printQty.toLocaleString('en-US')} printed`,
  ].filter(Boolean) as string[]

  return (
    // One portrait object with its name written on it, rather than a picture
    // with a paragraph of fields stacked underneath. The card is the thing the
    // couple recognises, so nothing competes with it for the tile.
    <article className="group relative aspect-[5/7] overflow-hidden rounded-2xl bg-gradient-to-b from-[#F7F2FA] to-[#FBF8F4] shadow-[0_2px_10px_-4px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.06] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-20px_rgba(26,26,26,0.45)]">
      {/* Released cards show the frozen artwork through the ownership-checked
          route. Everything earlier shows the catalogue hero, which is what
          the couple chose in the shop. */}
      {released || card.cardImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={released ? `/api/my/card/${card.designId}` : (card.cardImage as string)}
          alt={card.cardName}
          className={cn(
            'h-full w-full transition-transform duration-500 group-hover:scale-[1.04]',
            released ? 'object-contain' : 'object-cover',
          )}
          loading="lazy"
        />
      ) : (
        <span className="flex h-full items-center justify-center">
          <ImageIcon className="h-7 w-7 text-[#1A1A1A]/20" />
        </span>
      )}

      {/* Scrim only under the caption, so the artwork above it stays clean. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#1A1A1A]/85 via-[#1A1A1A]/35 to-transparent"
      />

      <span
        className={cn(
          'absolute left-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm',
          meta.className,
        )}
      >
        {meta.label}
      </span>

      <div className="absolute inset-x-0 bottom-0 p-3">
        <h2 className="truncate text-[15px] font-semibold leading-tight text-white">
          {card.cardName}
        </h2>
        <p className="mt-0.5 truncate text-[11px] text-white/70">
          {/* Counts first: on a narrow tile the tail is what gets cut, and the
              guest number is worth more to the couple than the category. */}
          {[...counts, card.category].filter(Boolean).join(' · ')}
        </p>
      </div>

      {/* The whole tile is the way in. The buttons sit above the link rather
          than inside it, so they are real buttons and not links within a link. */}
      <Link
        href={href}
        className="absolute inset-0 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7E5896]"
        aria-label={
          card.status === 'awaiting_info'
            ? `Add your details for ${card.cardName}`
            : `Open ${card.cardName}`
        }
      />

      <div className="absolute right-3 top-3 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {released && (
          <>
            <HoverAction label="View full size" onClick={onZoom}>
              <Maximize2 className="h-3.5 w-3.5" />
            </HoverAction>
            <HoverAction label="Download" onClick={onDownload} busy={downloading}>
              {downloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
            </HoverAction>
          </>
        )}
      </div>

      <span
        aria-hidden
        className="absolute bottom-3 right-3 flex h-7 w-7 translate-x-1 items-center justify-center rounded-full bg-white/95 text-[#1A1A1A] opacity-0 shadow-sm transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100"
      >
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </article>
  )
}

function HoverAction({
  label,
  onClick,
  busy,
  children,
}: {
  label: string
  onClick: () => void
  busy?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={label}
      aria-label={label}
      className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#1A1A1A]/70 text-white shadow-sm backdrop-blur transition-colors hover:bg-[#1A1A1A] disabled:opacity-60"
    >
      {children}
    </button>
  )
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
        active
          ? 'border-[#7E5896] bg-[#7E5896] text-white'
          : 'border-black/[0.08] bg-white text-[#1A1A1A]/70 hover:border-black/20',
      )}
    >
      {children}
    </button>
  )
}

function EmptyState() {
  return (
    <div className="rounded-[28px] border border-black/[0.06] bg-gradient-to-b from-[#F7F2FA] to-white px-6 py-16 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
        <Sparkles className="h-6 w-6 text-[#C9A0DC]" />
      </span>
      <h2 className="mt-5 text-xl font-bold text-[#1A1A1A]">No cards yet</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-[#1A1A1A]/60">
        Every card you buy appears here, from the moment you order it through to the finished
        artwork our team has checked.
      </p>
      <Link
        href="/digital-cards"
        className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-[#7E5896] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#6b4a80]"
      >
        <Plus className="h-4 w-4" />
        Browse cards
      </Link>
    </div>
  )
}
