'use client'

import { useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { toast } from 'sonner'
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Copy,
  ExternalLink,
  Gift,
  ImagePlus,
  Lightbulb,
  Link2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Star,
  Store,
  Tag,
  Trash2,
  UploadCloud,
  Users,
  Video as VideoIcon,
  Wallet,
  X,
} from 'lucide-react'
import {
  addProductToRegistry,
  createGiftRegistryItem,
  deleteGiftRegistryClaim,
  deleteGiftRegistryItem,
  enableGiftRegistrySharing,
  markGiftRegistryItemReceived,
  removeGiftRegistryBannerImage,
  removeGiftRegistryCoverImage,
  unclaimGiftRegistryItem,
  updateGiftRegistryClaim,
  updateGiftRegistryHeader,
  updateGiftRegistryItem,
  updateGiftRegistryWelcomeMessage,
  uploadGiftRegistryBannerImage,
  uploadGiftRegistryCoverImage,
  uploadGiftRegistryImage,
  uploadGiftRegistryVideo,
  type GiftRegistryClaimTarget,
  type GiftRegistryInput,
} from '@/lib/dashboard/actions'
import { formatGiftPrice, formatLongDate, giftRegistryPath } from '@/lib/dashboard/share'
import type { GiftRegistryClaimRow, GiftRegistryHero, GiftRegistryItemWithClaims } from '@/lib/dashboard/queries'
import { GIFT_REGISTRY_CATEGORIES, type GiftRegistryItem } from '@/lib/dashboard/types'
import { Card, EmptyState, SectionTitle, StatCard } from '@/components/dashboard/primitives'
import { Button, ConfirmDialog, Field, Slideover, inputClass } from '@/components/dashboard/controls'
import { EventPicker } from '@/components/dashboard/EventScope'
import type { DashboardEventScopeStrings } from '@/lib/cms/ui-strings-fallback'
import ImagePickerModal from '@/components/dashboard/ImagePickerModal'
import CatalogGiftCard from '@/components/dashboard/CatalogGiftCard'
import { type CatalogGift } from '@/lib/dashboard/gift-catalog'
import { cn } from '@/lib/utils'

/** Days remaining until an ISO date (DATE column), or null if unset/past. Mirrors PledgesManager's daysUntil. */
// hero.eventDate is a wedding_events.starts_at timestamptz (not a plain DATE
// like the couple-level wedding_date used to be), so both helpers below read
// the calendar date in East Africa Time rather than the browser's local zone
// — otherwise a couple viewing from outside EAT could see an off-by-one day.
const EAT_TIME_ZONE = 'Africa/Dar_es_Salaam'

/** Midnight-UTC timestamp for `d`'s EAT calendar date, for clean whole-day subtraction. */
function eatDateOnly(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EAT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return Date.UTC(get('year'), get('month') - 1, get('day'))
}

function daysUntil(value: string | null): number | null {
  if (!value) return null
  const due = new Date(value)
  if (Number.isNaN(due.getTime())) return null
  const days = Math.round((eatDateOnly(due) - eatDateOnly(new Date())) / 86_400_000)
  return days >= 0 ? days : null
}

/** "February 24, 2027" — matches Zola's registry-hero date format (distinct from formatLongDate's "24 February 2027"). */
function formatHeroDate(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: EAT_TIME_ZONE })
}

const emptyForm: GiftRegistryInput & { id?: string } = {
  id: undefined,
  title: '',
  description: '',
  image_urls: [],
  video_url: '',
  price_label: '',
  product_link: '',
  shop_name: '',
  shop_location: '',
  shop_contact: '',
  category: null,
  quantity_requested: 1,
  most_wanted: false,
  group_gift: false,
  is_cash_fund: false,
  event_id: null,
}

type FormState = typeof emptyForm

/** Best-effort numeric read of a free-text price label (e.g. "TZS 250,000" → 250000), for sorting only. */
function parsePriceNumber(label: string | null): number | null {
  if (!label) return null
  const digits = label.replace(/[^\d]/g, '')
  return digits ? parseInt(digits, 10) : null
}

type Availability = 'all' | 'available' | 'purchased'
type SortKey = 'newest' | 'most_wanted' | 'price_low' | 'price_high'

const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest',
  most_wanted: 'Most wanted first',
  price_low: 'Price: low to high',
  price_high: 'Price: high to low',
}

type MediaSlide = { kind: 'photo'; url: string } | { kind: 'video'; url: string }

function mediaSlides(item: Pick<GiftRegistryItem, 'image_urls' | 'video_url'>): MediaSlide[] {
  const slides: MediaSlide[] = item.image_urls.map((url) => ({ kind: 'photo' as const, url }))
  if (item.video_url) slides.push({ kind: 'video', url: item.video_url })
  return slides
}

/** Small self-contained carousel (hover arrows + dot indicators + swipe) —
 *  same pattern as opus_website's vendor listing-card CardImageCarousel. */
function GiftMediaCarousel({ item }: { item: GiftRegistryItem }) {
  const slides = mediaSlides(item)
  const [idx, setIdx] = useState(0)
  const dragStart = useRef<number | null>(null)

  const prev = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIdx((i) => (i - 1 + slides.length) % slides.length)
  }
  const next = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIdx((i) => (i + 1) % slides.length)
  }
  const onTouchStart = (e: React.TouchEvent) => {
    dragStart.current = e.touches[0].clientX
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (dragStart.current === null) return
    const diff = dragStart.current - e.changedTouches[0].clientX
    if (diff > 40) setIdx((i) => (i + 1) % slides.length)
    else if (diff < -40) setIdx((i) => (i - 1 + slides.length) % slides.length)
    dragStart.current = null
  }

  if (slides.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[#1A1A1A]/25">
        <Gift className="h-8 w-8" />
      </div>
    )
  }

  const slide = slides[idx]

  return (
    <div className="group/carousel relative h-full w-full" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {slide.kind === 'video' ? (
        <video src={slide.url} className="h-full w-full object-cover bg-black" muted loop playsInline autoPlay preload="metadata" />
      ) : (
        <Image
          src={slide.url}
          alt={item.title}
          fill
          sizes="(min-width: 1024px) 420px, (min-width: 640px) 45vw, 100vw"
          className="object-cover"
        />
      )}

      {slides.length > 1 ? (
        <>
          <button data-opus-button="control"
            onClick={prev}
            aria-label="Previous media"
            className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 opacity-0 shadow-sm transition-opacity hover:bg-white group-hover/carousel:opacity-100"
          >
            <ChevronLeft className="h-3.5 w-3.5 text-[#1A1A1A]" />
          </button>
          <button data-opus-button="control"
            onClick={next}
            aria-label="Next media"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 opacity-0 shadow-sm transition-opacity hover:bg-white group-hover/carousel:opacity-100"
          >
            <ChevronRight className="h-3.5 w-3.5 text-[#1A1A1A]" />
          </button>
          <div className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-1">
            {slides.map((_, i) => (
              <button data-opus-button="control"
                key={i}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setIdx(i)
                }}
                aria-label={`Go to media ${i + 1}`}
                className={cn('h-1.5 rounded-full transition-all', i === idx ? 'w-3.5 bg-white' : 'w-1.5 bg-white/60')}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

export default function GiftRegistryManager({
  initial,
  shareSlug,
  shareEnabled,
  hero,
  guestCount,
  initialClaims,
  events,
  selectedEventId,
  scopeStrings,
  catalog,
}: {
  initial: GiftRegistryItemWithClaims[]
  shareSlug: string | null
  shareEnabled: boolean
  hero: GiftRegistryHero
  guestCount: number
  initialClaims: GiftRegistryClaimRow[]
  events: { id: string; name: string }[]
  selectedEventId: string | null
  scopeStrings: DashboardEventScopeStrings
  /** Live vendor products the couple can add to their registry, from the shop. */
  catalog: CatalogGift[]
}) {
  const [items, setItems] = useState(initial)
  // Adding/editing a gift calls a server action that revalidates this route,
  // which re-runs the server page and gives us a fresh `initial` prop — but
  // `useState(initial)` only seeds state on mount, so without this the new
  // gift silently never showed up until something else (e.g. a full reload)
  // remounted the component. Re-sync whenever the server sends fresh data —
  // adjusted during render (React's documented pattern for this) rather than
  // in an effect, so it lands in the same render pass instead of a second one.
  const [prevInitial, setPrevInitial] = useState(initial)
  if (initial !== prevInitial) {
    setPrevInitial(initial)
    setItems(initial)
  }
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  // The item currently being edited (null while adding a new gift) — lets
  // the "mark as received" checkbox know the guest-claim state it's not
  // itself part of `form`, and lets save() know what to optimistically patch.
  const [editingItem, setEditingItem] = useState<GiftRegistryItem | null>(null)
  const [markedReceived, setMarkedReceived] = useState(false)
  // Number of photo uploads currently in flight — drives the "Uploading…"
  // button state without blocking picking more files while some finish.
  const [photoUploads, setPhotoUploads] = useState(0)
  const [videoUploading, setVideoUploading] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const [pendingDelete, setPendingDelete] = useState<GiftRegistryItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const [claims, setClaims] = useState(initialClaims)
  // Same staleness fix as `items` above — switching events re-navigates with
  // a fresh `initialClaims` prop that a plain useState would only read once.
  const [prevInitialClaims, setPrevInitialClaims] = useState(initialClaims)
  if (initialClaims !== prevInitialClaims) {
    setPrevInitialClaims(initialClaims)
    setClaims(initialClaims)
  }
  const [claimSearch, setClaimSearch] = useState('')
  const [claimEditing, setClaimEditing] = useState<GiftRegistryClaimRow | null>(null)
  const [claimForm, setClaimForm] = useState({ guestName: '', guestPhone: '', guestEmail: '' })
  const [pendingDeleteClaim, setPendingDeleteClaim] = useState<GiftRegistryClaimRow | null>(null)
  const [claimBusyKey, setClaimBusyKey] = useState<string | null>(null)
  const [claimPending, startClaimTransition] = useTransition()

  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterAvailability, setFilterAvailability] = useState<Availability>('all')
  const [sortKey, setSortKey] = useState<SortKey>('newest')
  const [activeTab, setActiveTab] = useState<'gifts' | 'claims'>('gifts')
  const [catalogBusyId, setCatalogBusyId] = useState<string | null>(null)

  const [heroBannerUrl, setHeroBannerUrl] = useState(hero.registryBannerImageUrl)
  const [heroCoverUrl, setHeroCoverUrl] = useState(hero.registryCoverImageUrl)
  const [heroHeader, setHeroHeader] = useState(hero.registryHeader)
  const [heroMessage, setHeroMessage] = useState(hero.registryWelcomeMessage)
  // Same staleness issue as `initial` above: switching events re-navigates
  // with a fresh `hero` prop, but these were only ever seeded from it on
  // mount, so the banner/header/message stayed frozen on whatever loaded
  // first instead of following the selected event. Re-sync on prop change.
  const [prevHero, setPrevHero] = useState(hero)
  if (hero !== prevHero) {
    setPrevHero(hero)
    setHeroBannerUrl(hero.registryBannerImageUrl)
    setHeroCoverUrl(hero.registryCoverImageUrl)
    setHeroHeader(hero.registryHeader)
    setHeroMessage(hero.registryWelcomeMessage)
  }
  const [heroOpen, setHeroOpen] = useState(false)
  const [heroHeaderDraft, setHeroHeaderDraft] = useState(hero.registryHeader ?? hero.coupleName)
  const [heroDraft, setHeroDraft] = useState(hero.registryWelcomeMessage ?? '')
  const [bannerPickerOpen, setBannerPickerOpen] = useState(false)
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false)
  const [bannerUploading, setBannerUploading] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [heroSaving, setHeroSaving] = useState(false)
  // hero.eventDate comes from the selected event (see page.tsx) — read-only
  // here, since editing it would silently clobber the event's time-of-day;
  // change it on the Events page instead. No local state needed: switching
  // events re-navigates with ?event=, which re-runs page.tsx with fresh data.
  const daysLeft = daysUntil(hero.eventDate)
  const heroDate = formatHeroDate(hero.eventDate)
  const displayedHeader = heroHeader || hero.coupleName

  function openHeroEditor() {
    setHeroHeaderDraft(heroHeader ?? hero.coupleName)
    setHeroDraft(heroMessage ?? '')
    setHeroOpen(true)
  }

  /** Clicking the cover: opens the editor if there's already a banner, otherwise prompts to add one. */
  function onClickCover() {
    if (heroBannerUrl) openHeroEditor()
    else setBannerPickerOpen(true)
  }

  async function onConfirmBannerImage(blob: Blob) {
    if (!selectedEventId) return
    setBannerUploading(true)
    try {
      const formData = new FormData()
      formData.set('file', new File([blob], 'banner.jpg', { type: 'image/jpeg' }))
      const url = await uploadGiftRegistryBannerImage(selectedEventId, formData)
      setHeroBannerUrl(url)
      toast.success('Banner updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not upload banner')
    } finally {
      setBannerUploading(false)
    }
  }

  function removeHeroBanner() {
    if (!selectedEventId) return
    setBannerUploading(true)
    startTransition(async () => {
      try {
        await removeGiftRegistryBannerImage(selectedEventId)
        setHeroBannerUrl(null)
        toast.success('Banner removed')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not remove banner')
      } finally {
        setBannerUploading(false)
      }
    })
  }

  async function onConfirmPhotoImage(blob: Blob) {
    if (!selectedEventId) return
    setPhotoUploading(true)
    try {
      const formData = new FormData()
      formData.set('file', new File([blob], 'photo.jpg', { type: 'image/jpeg' }))
      const url = await uploadGiftRegistryCoverImage(selectedEventId, formData)
      setHeroCoverUrl(url)
      toast.success('Photo updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not upload photo')
    } finally {
      setPhotoUploading(false)
    }
  }

  function removeHeroPhoto() {
    if (!selectedEventId) return
    setPhotoUploading(true)
    startTransition(async () => {
      try {
        await removeGiftRegistryCoverImage(selectedEventId)
        setHeroCoverUrl(null)
        toast.success('Photo removed')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not remove photo')
      } finally {
        setPhotoUploading(false)
      }
    })
  }

  function saveHero() {
    if (!heroHeaderDraft.trim()) {
      toast.error('Give your registry a header')
      return
    }
    if (!selectedEventId) {
      toast.error('Add an event first')
      return
    }
    setHeroSaving(true)
    startTransition(async () => {
      try {
        const nextHeader = heroHeaderDraft.trim()
        const nextMessage = heroDraft.trim() || null
        await Promise.all([
          nextHeader !== (heroHeader ?? hero.coupleName)
            ? updateGiftRegistryHeader(selectedEventId, nextHeader)
            : Promise.resolve(),
          updateGiftRegistryWelcomeMessage(selectedEventId, nextMessage),
        ])
        setHeroHeader(nextHeader === hero.coupleName ? null : nextHeader)
        setHeroMessage(nextMessage)
        setHeroOpen(false)
        toast.success('Registry updated')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setHeroSaving(false)
      }
    })
  }

  const claimedCount = items.filter((i) => i.claimed_by_name).length
  const cashFundsCount = items.filter((i) => i.is_cash_fund).length
  const giftsCount = items.length - cashFundsCount
  // The full fixed list, not just categories currently tagged on a gift —
  // otherwise the filter looks empty/broken until items happen to use it.

  const visibleItems = items
    .filter((i) => {
      const q = search.trim().toLowerCase()
      if (!q) return true
      return i.title.toLowerCase().includes(q) || (i.description ?? '').toLowerCase().includes(q)
    })
    .filter((i) => filterCategory === 'all' || i.category === filterCategory)
    .filter((i) => {
      if (filterAvailability === 'available') return !i.claimed_by_name
      if (filterAvailability === 'purchased') return Boolean(i.claimed_by_name)
      return true
    })
    .slice()
    .sort((a, b) => {
      if (sortKey === 'most_wanted') return Number(b.most_wanted) - Number(a.most_wanted)
      if (sortKey === 'price_low' || sortKey === 'price_high') {
        const pa = parsePriceNumber(a.price_label)
        const pb = parsePriceNumber(b.price_label)
        if (pa === null && pb === null) return 0
        if (pa === null) return 1
        if (pb === null) return -1
        return sortKey === 'price_low' ? pa - pb : pb - pa
      }
      return 0 // 'newest' — keep the server's sort_order/created_at order
    })

  // Shop-catalog gifts shown in the same grid as the couple's own — same search and
  // category filters, hidden once added (deduped by title against owned items) and
  // under the "purchased" availability filter (catalog gifts are never purchased).
  const ownedProductIds = new Set(items.map((i) => i.product_id).filter(Boolean) as string[])
  const ownedTitles = new Set(items.map((i) => i.title.trim().toLowerCase()))
  const visibleCatalog =
    filterAvailability === 'purchased'
      ? []
      : catalog.filter((g) => {
          if (g.productId && ownedProductIds.has(g.productId)) return false
          if (ownedTitles.has(g.title.trim().toLowerCase())) return false
          if (filterCategory !== 'all' && g.category !== filterCategory) return false
          const q = search.trim().toLowerCase()
          if (!q) return true
          return (
            g.title.toLowerCase().includes(q) ||
            g.shopName.toLowerCase().includes(q) ||
            g.description.toLowerCase().includes(q)
          )
        })

  function openCreate() {
    setForm({ ...emptyForm, event_id: selectedEventId })
    setEditingItem(null)
    setMarkedReceived(false)
    setOpen(true)
  }

  function openEdit(item: GiftRegistryItem) {
    setForm({
      id: item.id,
      title: item.title,
      description: item.description ?? '',
      image_urls: item.image_urls,
      video_url: item.video_url ?? '',
      price_label: item.price_label ?? '',
      product_link: item.product_link ?? '',
      shop_name: item.shop_name ?? '',
      shop_location: item.shop_location ?? '',
      shop_contact: item.shop_contact ?? '',
      category: item.category,
      quantity_requested: item.quantity_requested,
      most_wanted: item.most_wanted,
      group_gift: item.group_gift,
      is_cash_fund: item.is_cash_fund,
      event_id: item.event_id,
    })
    setEditingItem(item)
    setMarkedReceived(item.claimed_by_name === 'You')
    setOpen(true)
  }

  // Uploads multiple photos concurrently (capped at 3 in flight at once,
  // same concurrency the vendor storefront editor uses) and appends each as
  // it finishes, so the picker never blocks on the slowest file.
  const PHOTO_UPLOAD_CONCURRENCY = 3
  async function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (photoInputRef.current) photoInputRef.current.value = ''
    if (files.length === 0) return
    setPhotoUploads((n) => n + files.length)
    let queueIndex = 0
    const worker = async () => {
      while (queueIndex < files.length) {
        const file = files[queueIndex++]
        try {
          const formData = new FormData()
          formData.set('file', file)
          const url = await uploadGiftRegistryImage(formData)
          setForm((f) => ({ ...f, image_urls: [...(f.image_urls ?? []), url] }))
        } catch (err) {
          toast.error(err instanceof Error ? err.message : `Could not upload ${file.name}`)
        } finally {
          setPhotoUploads((n) => n - 1)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(PHOTO_UPLOAD_CONCURRENCY, files.length) }, worker))
  }

  function removePhoto(url: string) {
    setForm((f) => ({ ...f, image_urls: (f.image_urls ?? []).filter((u) => u !== url) }))
  }

  async function onPickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (videoInputRef.current) videoInputRef.current.value = ''
    if (!file) return
    setVideoUploading(true)
    try {
      const formData = new FormData()
      formData.set('file', file)
      const url = await uploadGiftRegistryVideo(formData)
      setForm((f) => ({ ...f, video_url: url }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not upload video')
    } finally {
      setVideoUploading(false)
    }
  }

  function save() {
    if (!form.title.trim()) {
      toast.error('Give the gift a name')
      return
    }
    const input: GiftRegistryInput = {
      title: form.title,
      description: form.description || null,
      image_urls: form.image_urls ?? [],
      video_url: form.video_url || null,
      price_label: form.price_label || null,
      product_link: form.product_link || null,
      shop_name: form.shop_name || null,
      shop_location: form.shop_location || null,
      shop_contact: form.shop_contact || null,
      category: form.category || null,
      quantity_requested: form.quantity_requested,
      most_wanted: form.most_wanted,
      group_gift: form.group_gift,
      is_cash_fund: form.is_cash_fund,
      event_id: form.event_id,
    }
    // Only apply the "mark as received" checkbox when it's actually offered
    // (never overrides a real guest claim — see the checkbox's own guard).
    const canToggleReceived = !editingItem || !editingItem.claimed_by_name || editingItem.claimed_by_name === 'You'
    const receivedChanged = canToggleReceived && markedReceived !== (editingItem?.claimed_by_name === 'You')

    startTransition(async () => {
      try {
        if (form.id) {
          await updateGiftRegistryItem(form.id, input)
          if (receivedChanged) {
            if (markedReceived) await markGiftRegistryItemReceived(form.id)
            else await unclaimGiftRegistryItem(form.id)
          }
          setItems((prev) =>
            prev.map((i) =>
              i.id === form.id
                ? {
                    ...i,
                    title: input.title.trim(),
                    description: input.description ?? null,
                    image_urls: input.image_urls ?? [],
                    video_url: input.video_url ?? null,
                    price_label: input.price_label ?? null,
                    product_link: input.product_link ?? null,
                    shop_name: input.shop_name ?? null,
                    shop_location: input.shop_location ?? null,
                    shop_contact: input.shop_contact ?? null,
                    category: input.category ?? null,
                    quantity_requested: input.quantity_requested ?? 1,
                    most_wanted: input.most_wanted ?? false,
                    group_gift: input.group_gift ?? false,
                    is_cash_fund: input.is_cash_fund ?? false,
                    event_id: input.event_id ?? null,
                    ...(receivedChanged
                      ? { claimed_by_name: markedReceived ? 'You' : null, claimed_at: markedReceived ? new Date().toISOString() : null }
                      : {}),
                  }
                : i,
            ),
          )
          toast.success('Gift updated')
        } else {
          const id = await createGiftRegistryItem(input)
          setItems((prev) => [
            ...prev,
            {
              id,
              title: input.title.trim(),
              description: input.description ?? null,
              image_urls: input.image_urls ?? [],
              video_url: input.video_url ?? null,
              price_label: input.price_label ?? null,
              product_link: input.product_link ?? null,
              shop_name: input.shop_name ?? null,
              shop_location: input.shop_location ?? null,
              shop_contact: input.shop_contact ?? null,
              category: input.category ?? null,
              quantity_requested: input.quantity_requested ?? 1,
              most_wanted: input.most_wanted ?? false,
              group_gift: input.group_gift ?? false,
              is_cash_fund: input.is_cash_fund ?? false,
              event_id: input.event_id ?? null,
              product_id: null,
              price_tzs: null,
              claimed_by_name: null,
              claimed_by_phone: null,
              claimed_by_email: null,
              claimed_at: null,
              claimedCount: 0,
              claimants: [],
              sort_order: prev.length,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ])
          toast.success('Gift added')
        }
        setOpen(false)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  /** Opens the full add form pre-filled from a shop-catalog gift, so the couple can
   *  tweak quantity / most-wanted / group-gift / note before saving (create mode). */
  function openCatalogEdit(gift: CatalogGift) {
    const isCashFund = gift.priceLabel.trim().toLowerCase() === 'any amount'
    setForm({
      id: undefined,
      title: gift.title,
      description: gift.description,
      image_urls: [gift.image],
      video_url: '',
      price_label: gift.priceLabel,
      product_link: '',
      shop_name: gift.shopName,
      shop_location: gift.shopLocation,
      shop_contact: '',
      category: gift.category,
      quantity_requested: 1,
      most_wanted: false,
      group_gift: false,
      is_cash_fund: isCashFund,
      event_id: selectedEventId,
    })
    setEditingItem(null)
    setMarkedReceived(false)
    setOpen(true)
  }

  /** One-tap add of a shop-catalog gift — creates a real registry item pre-filled
   *  from the catalog entry, then optimistically appends it (mirrors save()'s create branch). */
  async function addCatalogGift(gift: CatalogGift) {
    if (catalogBusyId) return
    setCatalogBusyId(gift.id)

    // Real vendor product — add it product-linked (dedupes by product id, keeps
    // a numeric price so guests can buy it) via the dedicated action.
    const productId = gift.productId
    if (productId) {
      try {
        const res = await addProductToRegistry(productId, selectedEventId)
        if (!res.alreadyAdded) {
          const now = new Date().toISOString()
          setItems((prev) => [
            ...prev,
            {
              id: res.id,
              title: gift.title,
              description: gift.description || null,
              image_urls: [gift.image],
              video_url: null,
              price_label: gift.priceLabel,
              product_link: null,
              shop_name: gift.shopName,
              shop_location: gift.shopLocation,
              shop_contact: null,
              category: null,
              quantity_requested: 1,
              most_wanted: false,
              group_gift: false,
              is_cash_fund: false,
              event_id: selectedEventId,
              product_id: productId,
              price_tzs: gift.priceTzs ?? null,
              claimed_by_name: null,
              claimed_by_phone: null,
              claimed_by_email: null,
              claimed_at: null,
              claimedCount: 0,
              claimants: [],
              sort_order: prev.length,
              created_at: now,
              updated_at: now,
            },
          ])
        }
        toast.success(
          res.alreadyAdded ? `"${gift.title}" is already on your registry` : `Added "${gift.title}" to your registry`,
        )
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not add gift')
      } finally {
        setCatalogBusyId(null)
      }
      return
    }

    const isCashFund = gift.priceLabel.trim().toLowerCase() === 'any amount'
    const input: GiftRegistryInput = {
      title: gift.title,
      description: gift.description,
      image_urls: [gift.image],
      video_url: null,
      price_label: gift.priceLabel,
      product_link: null,
      shop_name: gift.shopName,
      shop_location: gift.shopLocation,
      shop_contact: null,
      category: gift.category,
      quantity_requested: 1,
      most_wanted: false,
      group_gift: false,
      is_cash_fund: isCashFund,
      event_id: selectedEventId,
    }
    try {
      const id = await createGiftRegistryItem(input)
      setItems((prev) => [
        ...prev,
        {
          id,
          title: input.title.trim(),
          description: input.description ?? null,
          image_urls: input.image_urls ?? [],
          video_url: null,
          price_label: input.price_label ?? null,
          product_link: null,
          shop_name: input.shop_name ?? null,
          shop_location: input.shop_location ?? null,
          shop_contact: null,
          category: input.category ?? null,
          quantity_requested: 1,
          most_wanted: false,
          group_gift: false,
          is_cash_fund: input.is_cash_fund ?? false,
          event_id: input.event_id ?? null,
          product_id: null,
          price_tzs: null,
          claimed_by_name: null,
          claimed_by_phone: null,
          claimed_by_email: null,
          claimed_at: null,
          claimedCount: 0,
          claimants: [],
          sort_order: prev.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      toast.success(`Added "${gift.title}" to your registry`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add gift')
    } finally {
      setCatalogBusyId(null)
    }
  }

  function confirmRemove() {
    const target = pendingDelete
    if (!target) return
    startTransition(async () => {
      try {
        await deleteGiftRegistryItem(target.id)
        setItems((prev) => prev.filter((i) => i.id !== target.id))
        toast.success('Gift removed')
        setPendingDelete(null)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not remove')
      }
    })
  }

  function reopen(item: GiftRegistryItem) {
    setBusyId(item.id)
    startTransition(async () => {
      try {
        await unclaimGiftRegistryItem(item.id)
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, claimed_by_name: null, claimed_at: null } : i)),
        )
        toast.success('Gift is available again')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not update')
      } finally {
        setBusyId(null)
      }
    })
  }

  function claimRowKey(claim: GiftRegistryClaimRow): string {
    return `${claim.kind}:${claim.claimId}`
  }

  function claimTarget(claim: GiftRegistryClaimRow): GiftRegistryClaimTarget {
    return { kind: claim.kind, claimId: claim.claimId, itemId: claim.itemId }
  }

  function openClaimEdit(claim: GiftRegistryClaimRow) {
    setClaimEditing(claim)
    setClaimForm({ guestName: claim.guestName, guestPhone: claim.guestPhone ?? '', guestEmail: claim.guestEmail ?? '' })
  }

  function saveClaim() {
    if (!claimEditing) return
    const guestName = claimForm.guestName.trim()
    if (!guestName) return toast.error('Guest name is required')
    const key = claimRowKey(claimEditing)
    setClaimBusyKey(key)
    startClaimTransition(async () => {
      try {
        const input = { guestName, guestPhone: claimForm.guestPhone.trim() || null, guestEmail: claimForm.guestEmail.trim() || null }
        await updateGiftRegistryClaim(claimTarget(claimEditing), input)
        setClaims((prev) => prev.map((c) => (claimRowKey(c) === key ? { ...c, ...input } : c)))
        toast.success('Claim updated')
        setClaimEditing(null)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not update claim')
      } finally {
        setClaimBusyKey(null)
      }
    })
  }

  function confirmRemoveClaim() {
    const claim = pendingDeleteClaim
    if (!claim) return
    const key = claimRowKey(claim)
    setClaimBusyKey(key)
    startClaimTransition(async () => {
      try {
        await deleteGiftRegistryClaim(claimTarget(claim))
        setClaims((prev) => prev.filter((c) => claimRowKey(c) !== key))
        toast.success('Claim removed — the gift is available again')
        setPendingDeleteClaim(null)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not remove claim')
      } finally {
        setClaimBusyKey(null)
      }
    })
  }

  const filteredClaims = claimSearch.trim()
    ? claims.filter((c) => {
        const q = claimSearch.trim().toLowerCase()
        return c.guestName.toLowerCase().includes(q) || c.itemTitle.toLowerCase().includes(q)
      })
    : claims

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#1A1A1A] sm:text-3xl">Gift registry</h1>
        {/* Event picker rides the right end of the subtitle row; Settings /
            Add gifts sit on their own toolbar just above the hero below. */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 text-sm text-[#1A1A1A]/65 sm:text-base">
            Add gifts you&apos;d love to receive — guests reserve one from your public link so nobody doubles up.
          </p>
          <EventPicker events={events} selectedId={selectedEventId ?? ''} strings={scopeStrings} />
        </div>
      </div>

      {/* All four controls hold one row on a phone. They only fit because each
          steps down a size below sm (max-sm:*) — at full size the segmented
          control plus the two buttons come to ~443px against ~351px of room.
          max-sm rather than plain overrides: cn() here is a bare string join,
          not tailwind-merge, so same-property utilities would collide. */}
      <div className="no-scrollbar flex flex-nowrap items-center justify-between gap-2 overflow-x-auto max-sm:gap-1.5">
        <div className="inline-flex shrink-0 rounded-full bg-black/[0.05] p-1">
          <button data-opus-button="control"
            type="button"
            onClick={() => setActiveTab('gifts')}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-semibold transition-colors max-sm:px-2 max-sm:text-xs',
              activeTab === 'gifts' ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-[#1A1A1A]/55 hover:text-[#1A1A1A]',
            )}
          >
            Gifts
          </button>
          <button data-opus-button="control"
            type="button"
            onClick={() => setActiveTab('claims')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors max-sm:px-2 max-sm:text-xs',
              activeTab === 'claims' ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-[#1A1A1A]/55 hover:text-[#1A1A1A]',
            )}
          >
            Claims
            {claims.length > 0 ? (
              <span className="rounded-full bg-[#C9A0DC]/25 px-1.5 text-[11px] font-bold text-[#6b3f82]">
                {claims.length}
              </span>
            ) : null}
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2 max-sm:gap-1.5">
          <Button
            variant="secondary"
            onClick={openHeroEditor}
            className="max-sm:gap-1 max-sm:px-2 max-sm:py-2 max-sm:text-xs"
          >
            <Settings className="h-4 w-4 shrink-0" /> Settings
          </Button>
          <Button onClick={openCreate} className="max-sm:gap-1 max-sm:px-2 max-sm:py-2 max-sm:text-xs">
            <Gift className="h-4 w-4 shrink-0" /> Add gifts
          </Button>
        </div>
      </div>

      <div className="relative mt-2 overflow-hidden rounded-3xl bg-black/[0.04]">
        {/* Cover — full-bleed photo with the header/date overlaid once one is set; a plain background before that.
            A div (not a button) so the avatar below can be a real nested <button> — a button can't
            legally contain another button, and the browser silently breaks that nesting. */}
        <div
          role="button"
          tabIndex={0}
          onClick={onClickCover}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onClickCover()
            }
          }}
          aria-disabled={bannerUploading}
          className={cn(
            'group relative flex h-56 w-full cursor-pointer flex-col items-center justify-center px-6 text-center sm:h-64',
            bannerUploading && 'pointer-events-none opacity-60',
          )}
        >
          {heroBannerUrl ? (
            <div className="absolute inset-0 overflow-hidden rounded-t-3xl">
              <Image src={heroBannerUrl} alt="" fill sizes="(min-width: 1024px) 1200px, 100vw" className="object-cover" priority />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(rgba(0,0,0,0.15), rgba(0,0,0,0.35))' }} />
            </div>
          ) : null}

          <button data-opus-button="neutral" data-opus-button-size="medium"
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              openHeroEditor()
            }}
            className="absolute right-5 top-5 z-10 inline-flex items-center gap-1.5 rounded-full border border-black/[0.12] bg-white px-4 py-2 text-sm font-semibold text-[#1A1A1A] opacity-0 shadow-sm transition-opacity duration-150 hover:bg-black/[0.03] group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <Pencil className="h-3.5 w-3.5" /> Customize
          </button>

          <h2 className={cn('relative text-3xl font-bold tracking-tight sm:text-4xl', heroBannerUrl ? 'text-white' : 'text-[#1A1A1A]')}>
            {displayedHeader}
          </h2>
          {heroDate ? (
            <p className={cn('relative mt-2 text-sm font-semibold', heroBannerUrl ? 'text-white/85' : 'text-[#1A1A1A]/70')}>
              {heroDate}
              {daysLeft !== null ? ` (${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left)` : ''}
            </p>
          ) : null}

          {/* Bottom-center of the cover, straddling its edge — absolute + bottom/left/translate, not a margin hack. */}
          <button data-opus-button="neutral" data-opus-button-size="medium"
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setPhotoPickerOpen(true)
            }}
            disabled={photoUploading}
            aria-label={heroCoverUrl ? 'Replace registry photo' : 'Add a registry photo'}
            className="group/avatar absolute -bottom-10 left-1/2 z-10 flex h-20 w-20 -translate-x-1/2 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-white text-[#1A1A1A]/45 shadow-md hover:text-[#1A1A1A]/70 disabled:opacity-50"
          >
            {heroCoverUrl ? (
              <>
                <Image src={heroCoverUrl} alt="" fill sizes="80px" className="object-cover" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover/avatar:bg-black/30 group-hover/avatar:opacity-100">
                  <Camera className="h-5 w-5 text-white" />
                </span>
              </>
            ) : (
              <Camera className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Message — below the cover, padded to clear the avatar overhanging from above. */}
        <div className="rounded-b-3xl bg-white px-6 pb-8 pt-16 text-center">
          <button data-opus-button="control" type="button" onClick={openHeroEditor} className="mx-auto block max-w-md text-sm text-[#1A1A1A]/55 hover:text-[#1A1A1A]/75">
            {heroMessage || 'Welcome guests to your registry with a short message!'}
          </button>
        </div>
      </div>

      <ImagePickerModal
        open={bannerPickerOpen}
        onClose={() => setBannerPickerOpen(false)}
        aspect={16 / 9}
        title="Choose a banner photo"
        onConfirm={onConfirmBannerImage}
      />
      <ImagePickerModal
        open={photoPickerOpen}
        onClose={() => setPhotoPickerOpen(false)}
        aspect={1}
        circular
        title="Choose a photo"
        onConfirm={onConfirmPhotoImage}
      />

      {activeTab === 'gifts' && (
      <>
      {/* Two columns on a phone so the pair of count tiles sit side by side;
          the intro panel above them spans both. Back to 2fr/1fr/1fr on lg. */}
      <div className="grid grid-cols-2 gap-3 [&>*:first-child]:col-span-2 lg:grid-cols-[2fr_1fr_1fr] lg:[&>*:first-child]:col-span-1">
        <div className="rounded-2xl bg-black/[0.04] p-6">
          <h3 className="text-lg font-semibold text-[#1A1A1A]">Add gifts to your registry</h3>
          {/* The guest-count line stays on ONE row on a phone: at 14px it
              measures 319px against 303px of panel, so it broke "Manage
              guests" onto its own row. 12px brings it to 279px, leaving slack
              for a guest count a few digits longer. */}
          {guestCount > 0 ? (
            <p className="mt-1.5 text-sm text-[#1A1A1A]/60 max-sm:text-xs">
              You have <span className="font-semibold text-[#1A1A1A]">{guestCount}</span> guests on your list.{' '}
              <a href="/my/dashboard/guests" className="font-semibold text-[#1A1A1A] underline underline-offset-2">
                Manage guests
              </a>
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-[#1A1A1A]/60">
              How many gifts should you include? Add your guest count and come back here to track your progress.{' '}
              <a href="/my/dashboard/guests" className="font-semibold text-[#1A1A1A] underline underline-offset-2">
                Add your guest count
              </a>
            </p>
          )}
        </div>
        <FlatTile value={giftsCount} label="Gifts added" />
        <FlatTile value={cashFundsCount} label="Cash funds added" />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Purchased" value={claimedCount} icon={<Check className="h-5 w-5" />} />
          <StatCard label="Available" value={items.length - claimedCount} icon={<Tag className="h-5 w-5" />} />
        </div>
        <ShareLinkCard shareSlug={shareSlug} shareEnabled={shareEnabled} eventId={selectedEventId} />
      </div>
      </>
      )}

      <Slideover
        open={heroOpen}
        onClose={() => setHeroOpen(false)}
        title="Customize"
        footer={
          <>
            <Button variant="secondary" onClick={() => setHeroOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveHero} disabled={heroSaving}>
              {heroSaving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Field
            label="Header"
            required
            hintInline={<span className="text-[#1A1A1A]/35">{heroHeaderDraft.length}/40</span>}
          >
            <input
              className={inputClass}
              maxLength={40}
              placeholder={hero.coupleName}
              value={heroHeaderDraft}
              onChange={(e) => setHeroHeaderDraft(e.target.value)}
            />
          </Field>

          <Field label="Event date" hint="The countdown under your header follows the event you're viewing">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-black/[0.12] bg-black/[0.02] px-3.5 py-2.5 text-sm">
              <span className="text-[#1A1A1A]">{heroDate ?? 'No date set'}</span>
              <a href="/my/dashboard/events" className="shrink-0 font-semibold text-[#5d3a78] hover:underline">
                Change in Events
              </a>
            </div>
          </Field>

          <Field label="Banner">
            {heroBannerUrl ? (
              <div className="relative overflow-hidden rounded-2xl">
                <div className="relative aspect-[16/9] w-full bg-black/[0.05]">
                  <Image src={heroBannerUrl} alt="" fill sizes="480px" className="object-cover" />
                </div>
                <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
                  <button data-opus-button="control"
                    type="button"
                    onClick={() => setBannerPickerOpen(true)}
                    disabled={bannerUploading}
                    aria-label="Replace banner"
                    title="Replace banner"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-[#1A1A1A] shadow-sm hover:bg-white disabled:opacity-50"
                  >
                    <UploadCloud className="h-4 w-4" />
                  </button>
                  <button data-opus-button="control"
                    type="button"
                    onClick={removeHeroBanner}
                    disabled={bannerUploading}
                    aria-label="Remove banner"
                    title="Remove banner"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-rose-600 shadow-sm hover:bg-white disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-dashed border-black/[0.15] bg-black/[0.02] p-4">
                <Lightbulb className="h-4 w-4 shrink-0 text-[#1A1A1A]/40" />
                <p className="flex-1 text-sm leading-snug text-[#1A1A1A]/60">
                  This big photo grabs attention! Eye-catching horizontal shots often work best.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setBannerPickerOpen(true)}
                  disabled={bannerUploading}
                  className="shrink-0 rounded-full"
                >
                  {bannerUploading ? 'Uploading…' : 'Upload'}
                </Button>
              </div>
            )}
          </Field>

          <Field label="Photo">
            {heroCoverUrl ? (
              <div className="flex items-center gap-4">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full">
                  <Image src={heroCoverUrl} alt="" fill sizes="64px" className="object-cover" />
                </div>
                <div className="flex flex-col items-start gap-1.5">
                  <button data-opus-button="control"
                    type="button"
                    onClick={() => setPhotoPickerOpen(true)}
                    disabled={photoUploading}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1A1A1A]/70 hover:text-[#1A1A1A] disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Swap
                  </button>
                  <button data-opus-button="control"
                    type="button"
                    onClick={removeHeroPhoto}
                    disabled={photoUploading}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-dashed border-black/[0.15] bg-black/[0.02] p-4">
                <Lightbulb className="h-4 w-4 shrink-0 text-[#1A1A1A]/40" />
                <p className="flex-1 text-sm leading-snug text-[#1A1A1A]/60">
                  Since this is small and circular, you might want to choose a close-up shot.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setPhotoPickerOpen(true)}
                  disabled={photoUploading}
                  className="shrink-0 rounded-full"
                >
                  {photoUploading ? 'Uploading…' : 'Upload'}
                </Button>
              </div>
            )}
          </Field>

          <Field
            label="Welcome message"
            hint="A short note guests see above your gifts (optional)"
            hintInline={<span className="text-[#1A1A1A]/35">{heroDraft.length}/300</span>}
          >
            <textarea
              className={inputClass}
              rows={3}
              maxLength={300}
              placeholder="Welcome guests to your registry with a short message!"
              value={heroDraft}
              onChange={(e) => setHeroDraft(e.target.value)}
            />
          </Field>
        </div>
      </Slideover>

      {activeTab === 'gifts' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#1A1A1A]/35" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search gifts…"
                className="w-full rounded-full border border-black/[0.12] bg-white py-2 pl-9 pr-3.5 text-xs font-medium text-[#1A1A1A] outline-none placeholder:text-[#1A1A1A]/35 focus:border-[#C9A0DC]"
              />
            </div>
            <FilterSelect value={filterCategory} onChange={setFilterCategory}>
              <option value="all">All categories</option>
              {GIFT_REGISTRY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect value={filterAvailability} onChange={(v) => setFilterAvailability(v as Availability)}>
              <option value="all">All gifts</option>
              <option value="available">Still available</option>
              <option value="purchased">Purchased</option>
            </FilterSelect>
            <FilterSelect value={sortKey} onChange={(v) => setSortKey(v as SortKey)}>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </FilterSelect>
          </div>

          {visibleItems.length === 0 && visibleCatalog.length === 0 ? (
            <EmptyState
              icon={<Gift className="h-7 w-7" />}
              title="No gifts match these filters"
              description="Try a different category or availability filter."
            />
          ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <button data-opus-button="primary" data-opus-button-size="medium"
            type="button"
            onClick={openCreate}
            className="group flex h-full min-h-[280px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-black/[0.15] bg-black/[0.02] p-4 text-center transition hover:border-black/30 hover:bg-black/[0.04]"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1A1A1A] text-white transition-transform group-hover:scale-105">
              <Plus className="h-5 w-5" />
            </span>
            <span className="text-sm font-bold text-[#1A1A1A]">Add your own gift</span>
            <span className="text-xs text-[#1A1A1A]/50">It joins the shop below for guests to claim</span>
          </button>
          {visibleItems.map((item) => (
            <div key={item.id} className="flex h-full flex-col overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
              <div className="relative aspect-square w-full shrink-0 bg-black/[0.04]">
                <GiftMediaCarousel item={item} />
                {item.most_wanted ? (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-0.5 rounded-full bg-[#9FE870] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[#3f6b1f] shadow-sm">
                    <Star className="h-2 w-2 fill-current" /> Most wanted
                  </span>
                ) : (
                  <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#1A1A1A]/60 shadow-sm">
                    On registry
                  </span>
                )}
                {item.claimed_by_name ? (
                  <span className="absolute right-2 top-2 rounded-full bg-[#9FE870] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[#3f6b1f] shadow-sm">
                    Purchased
                  </span>
                ) : null}
              </div>
              <div className="flex flex-1 flex-col p-4">
                <h3 className="line-clamp-2 font-semibold leading-snug text-[#1A1A1A]">{item.title}</h3>
                {item.price_label ? (
                  <p className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-[#1A1A1A]">
                    <Tag className="h-3.5 w-3.5 shrink-0 text-[#1A1A1A]/40" />
                    {formatGiftPrice(item.price_label)}
                  </p>
                ) : null}
                <div className="mt-1.5 flex flex-col gap-0.5 text-[11px] text-[#1A1A1A]/50">
                  {item.category ? (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <Tag className="h-3 w-3 shrink-0" />
                      <span className="truncate">{item.category}</span>
                    </span>
                  ) : null}
                  {item.is_cash_fund ? (
                    <span className="inline-flex items-center gap-1">
                      <Wallet className="h-3 w-3 shrink-0" /> Cash fund
                    </span>
                  ) : null}
                  {item.shop_name ? (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <Store className="h-3 w-3 shrink-0" />
                      <span className="truncate">{item.shop_name}</span>
                    </span>
                  ) : null}
                  {item.shop_location ? (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{item.shop_location}</span>
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1">
                    <Gift className="h-3 w-3 shrink-0" />
                    Asking for {item.quantity_requested}
                    {item.claimedCount > 0 ? ` · ${item.claimedCount} purchased` : ''}
                  </span>
                </div>
                {/* Pushes the action row to the bottom of the card, so Edit/Reopen/Delete line up across a
                    grid row regardless of how much content (category pill, purchased pill, ...) sits above. */}
                <div className="flex-1" />
                <div className="mt-3 flex items-center gap-1.5">
                  <button data-opus-button="primary" data-opus-button-size="small"
                    onClick={() => openEdit(item)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.12] px-2.5 text-xs font-semibold text-[#1A1A1A]/70 hover:bg-black/[0.04]"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  {item.claimed_by_name ? (
                    <button data-opus-button="primary" data-opus-button-size="small"
                      onClick={() => reopen(item)}
                      disabled={busyId === item.id}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.12] px-2.5 text-xs font-semibold text-[#1A1A1A]/70 hover:bg-black/[0.04] disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Reopen
                    </button>
                  ) : null}
                  <button data-opus-button="control"
                    onClick={() => setPendingDelete(item)}
                    aria-label="Remove"
                    className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {visibleCatalog.map((gift) => (
            <CatalogGiftCard
              key={gift.id}
              gift={gift}
              onAdd={addCatalogGift}
              onEdit={openCatalogEdit}
              busy={catalogBusyId === gift.id}
            />
          ))}
          </div>
          )}
        </>
      )}

      {activeTab === 'claims' && (
      <>
      <div id="claims" className="scroll-mt-24">
        <SectionTitle
          title="Claims"
          subtitle="Everyone who's claimed a gift — fix a typo, or free up one a guest backed out of."
        />
      </div>
      {claims.length === 0 ? (
        <EmptyState
          icon={<Users className="h-7 w-7" />}
          title="No claims yet"
          description="Once a guest claims a gift from your public registry link, they'll show up here."
        />
      ) : (
        <>
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#1A1A1A]/35" />
            <input
              type="search"
              value={claimSearch}
              onChange={(e) => setClaimSearch(e.target.value)}
              placeholder="Search by guest or gift…"
              className="w-full rounded-full border border-black/[0.12] bg-white py-2 pl-9 pr-3.5 text-xs font-medium text-[#1A1A1A] outline-none placeholder:text-[#1A1A1A]/35 focus:border-[#C9A0DC]"
            />
          </div>

          {filteredClaims.length === 0 ? (
            <EmptyState icon={<Search className="h-6 w-6" />} title="No claims match that search" />
          ) : (
            <Card className="overflow-x-auto">
              <table className="opus-table w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-black/[0.06] align-bottom">
                    <th scope="col" className="py-3 pl-4 pr-4">
                      <span className="text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/55">Guest</span>
                    </th>
                    <th scope="col" className="py-3 pr-4">
                      <span className="text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/55">Contact</span>
                    </th>
                    <th scope="col" className="py-3 pr-4">
                      <span className="text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/55">Gift</span>
                    </th>
                    <th scope="col" className="py-3 pr-4">
                      <span className="text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/55">Claimed on</span>
                    </th>
                    <th scope="col" className="w-1 py-3 pr-4">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05]">
                  {filteredClaims.map((c) => {
                    const key = claimRowKey(c)
                    const busy = claimBusyKey === key
                    return (
                      <tr key={key} className="align-middle hover:bg-black/[0.02]">
                        <td className="py-3.5 pl-4 pr-4">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-xs font-semibold text-[#1A1A1A]/70">
                              {c.guestName.charAt(0).toUpperCase()}
                            </span>
                            <p className="min-w-0 truncate font-medium text-[#1A1A1A]">{c.guestName}</p>
                          </div>
                        </td>
                        <td className="py-3.5 pr-4">
                          <div className="space-y-0.5 text-xs text-[#1A1A1A]/70">
                            {c.guestPhone ? (
                              <p className="flex items-center gap-1.5 truncate">
                                <Phone className="h-3 w-3 shrink-0 text-[#1A1A1A]/40" /> {c.guestPhone}
                              </p>
                            ) : null}
                            {c.guestEmail ? (
                              <p className="flex items-center gap-1.5 truncate">
                                <Mail className="h-3 w-3 shrink-0 text-[#1A1A1A]/40" /> {c.guestEmail}
                              </p>
                            ) : null}
                            {!c.guestPhone && !c.guestEmail ? <p className="text-[#1A1A1A]/35">—</p> : null}
                          </div>
                        </td>
                        <td className="py-3.5 pr-4">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-black/[0.05]">
                              {c.itemImageUrl ? (
                                <Image src={c.itemImageUrl} alt="" fill sizes="36px" className="object-cover" />
                              ) : (
                                <Gift className="absolute inset-0 m-auto h-4 w-4 text-[#1A1A1A]/30" />
                              )}
                            </span>
                            <p className="min-w-0 max-w-[220px] truncate text-[#1A1A1A]/85">{c.itemTitle}</p>
                          </div>
                        </td>
                        <td className="py-3.5 pr-4">
                          <span className="text-xs text-[#1A1A1A]/60">{formatLongDate(c.claimedAt)}</span>
                        </td>
                        <td className="py-3.5 pr-4 text-right">
                          <div className="inline-flex gap-1">
                            <button data-opus-button="control"
                              onClick={() => openClaimEdit(c)}
                              disabled={busy}
                              aria-label={`Edit ${c.guestName}'s claim`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#1A1A1A]/60 hover:bg-black/[0.05] hover:text-[#1A1A1A] disabled:opacity-40"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button data-opus-button="control"
                              onClick={() => setPendingDeleteClaim(c)}
                              disabled={busy}
                              aria-label={`Remove ${c.guestName}'s claim`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50 disabled:opacity-40"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
      </>
      )}

      <Slideover
        open={claimEditing !== null}
        onClose={() => setClaimEditing(null)}
        title="Edit claim"
        footer={
          <>
            <Button variant="secondary" onClick={() => setClaimEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveClaim} disabled={claimPending}>
              {claimPending ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        }
      >
        {claimEditing ? (
          <div className="space-y-4">
            <p className="text-sm text-[#1A1A1A]/55">
              Claimed <span className="font-medium text-[#1A1A1A]/80">{claimEditing.itemTitle}</span>
            </p>
            <Field label="Guest name" required>
              <input
                className={inputClass}
                value={claimForm.guestName}
                onChange={(e) => setClaimForm((f) => ({ ...f, guestName: e.target.value }))}
              />
            </Field>
            <Field label="Phone">
              <input
                className={inputClass}
                value={claimForm.guestPhone}
                onChange={(e) => setClaimForm((f) => ({ ...f, guestPhone: e.target.value }))}
                placeholder="e.g. 0712 345 678"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                className={inputClass}
                value={claimForm.guestEmail}
                onChange={(e) => setClaimForm((f) => ({ ...f, guestEmail: e.target.value }))}
              />
            </Field>
          </div>
        ) : null}
      </Slideover>

      <ConfirmDialog
        open={pendingDeleteClaim !== null}
        onClose={() => setPendingDeleteClaim(null)}
        onConfirm={confirmRemoveClaim}
        pending={claimPending}
        title="Remove this claim?"
        description={
          pendingDeleteClaim ? (
            <>
              This frees up <span className="font-medium">{pendingDeleteClaim.itemTitle}</span> so another guest can
              claim it. {pendingDeleteClaim.guestName} won&apos;t be notified.
            </>
          ) : undefined
        }
        confirmLabel="Remove claim"
      />

      <Slideover
        open={open}
        onClose={() => setOpen(false)}
        title={form.id ? 'Edit gift' : 'Add a gift'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? 'Saving…' : form.id ? 'Save changes' : 'Add gift'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Photos" hint="Add a few angles — guests can browse through them">
            <div className="flex flex-wrap gap-2">
              {(form.image_urls ?? []).map((url) => (
                <div key={url} className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-black/[0.05]">
                  <Image src={url} alt="" fill sizes="64px" className="object-cover" />
                  <button data-opus-button="control"
                    type="button"
                    onClick={() => removePhoto(url)}
                    aria-label="Remove photo"
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={onPickPhotos}
              />
              <button data-opus-button="control"
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={photoUploads > 0}
                className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-black/[0.15] text-[#1A1A1A]/45 hover:border-black/25 hover:text-[#1A1A1A]/70 disabled:opacity-50"
              >
                <ImagePlus className="h-4 w-4" />
                <span className="text-[9px] font-semibold">{photoUploads > 0 ? `${photoUploads}…` : 'Add'}</span>
              </button>
            </div>
          </Field>
          <Field label="Video" hint="Optional — a short clip of the gift">
            <div className="flex items-center gap-3">
              {form.video_url ? (
                <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-black">
                  <video src={form.video_url} className="h-full w-full object-cover" muted preload="metadata" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <Play className="h-5 w-5 text-white" />
                  </span>
                  <button data-opus-button="control"
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, video_url: '' }))}
                    aria-label="Remove video"
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-xl bg-black/[0.05] text-[#1A1A1A]/35">
                  <VideoIcon className="h-5 w-5" />
                </div>
              )}
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={onPickVideo}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => videoInputRef.current?.click()}
                disabled={videoUploading}
              >
                {videoUploading ? 'Uploading…' : form.video_url ? 'Replace video' : 'Upload video'}
              </Button>
            </div>
          </Field>
          <Field label="Gift name" required>
            <input
              className={inputClass}
              placeholder="e.g. Espresso machine"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" hint="Optional — powers the filter on your registry">
              <select
                className={inputClass}
                value={form.category ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value || null }))}
              >
                <option value="">No category</option>
                {GIFT_REGISTRY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Quantity" hint="Asking for how many">
              <input
                type="number"
                min={1}
                className={inputClass}
                value={form.quantity_requested ?? 1}
                onChange={(e) =>
                  setForm((f) => ({ ...f, quantity_requested: Math.max(1, Math.trunc(Number(e.target.value) || 1)) }))
                }
              />
            </Field>
          </div>
          <Field
            label="Note to guests"
            hint="A short line about why you'd love this one"
            hintInline={<span className="text-[#1A1A1A]/35">{(form.description ?? '').length}/500</span>}
          >
            <textarea
              className={inputClass}
              rows={3}
              maxLength={500}
              placeholder="For our early morning starts and weekend coffees."
              value={form.description ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </Field>
          <Field label="Price" hint={'Just the number — we add "TZS" automatically. Or type "Any amount" for open gifts.'}>
            <div className="flex items-center overflow-hidden rounded-xl border border-black/[0.12] bg-white focus-within:border-[#C9A0DC] focus-within:ring-2 focus-within:ring-[#C9A0DC]/30">
              <span className="shrink-0 border-r border-black/[0.12] bg-black/[0.03] px-3 py-2.5 text-sm font-semibold text-[#1A1A1A]/55">
                TZS
              </span>
              <input
                className="w-full min-w-0 px-3.5 py-2.5 text-sm text-[#1A1A1A] outline-none placeholder:text-[#1A1A1A]/35"
                placeholder="250,000"
                value={form.price_label ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, price_label: e.target.value }))}
              />
            </div>
          </Field>
          <Field label="Product link" hint="Optional — where a guest could buy this exact item online">
            <input
              className={inputClass}
              placeholder="https://…"
              value={form.product_link ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, product_link: e.target.value }))}
            />
          </Field>

          <div className="space-y-3 rounded-2xl border border-dashed border-black/[0.15] bg-black/[0.02] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/50">
              Where to buy it (optional)
            </p>
            <Field label="Shop name">
              <input
                className={inputClass}
                placeholder="e.g. Mlimani City Mall — Home Store"
                value={form.shop_name ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, shop_name: e.target.value }))}
              />
            </Field>
            <Field label="Location">
              <input
                className={inputClass}
                placeholder="e.g. Kariakoo, Uhuru Street"
                value={form.shop_location ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, shop_location: e.target.value }))}
              />
            </Field>
            <Field label="Shop contact" hint="Phone or WhatsApp number">
              <input
                className={inputClass}
                placeholder="0712 345 678"
                value={form.shop_contact ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, shop_contact: e.target.value }))}
              />
            </Field>
          </div>

          <div className="space-y-2">
            <CheckboxRow
              checked={form.is_cash_fund ?? false}
              onChange={(v) => setForm((f) => ({ ...f, is_cash_fund: v }))}
              title="Cash fund"
              description="A honeymoon, house deposit, or other fund guests give cash toward, instead of a physical gift."
            />
            <CheckboxRow
              checked={form.most_wanted ?? false}
              onChange={(v) => setForm((f) => ({ ...f, most_wanted: v }))}
              title="Most wanted"
              description="Need to have it? Highlight it on your registry so guests are more likely to give it."
            />
            <CheckboxRow
              checked={form.group_gift ?? false}
              onChange={(v) => setForm((f) => ({ ...f, group_gift: v }))}
              title="Group gift"
              description="Let a few guests know they can go in on this together."
            />
            {!editingItem || !editingItem.claimed_by_name || editingItem.claimed_by_name === 'You' ? (
              <CheckboxRow
                checked={markedReceived}
                onChange={setMarkedReceived}
                title="Already have this"
                description="Mark it as received so guests don't see it as available — no guest claim needed."
              />
            ) : null}
          </div>
        </div>
      </Slideover>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmRemove}
        title={pendingDelete ? `Remove "${pendingDelete.title}"?` : ''}
        description="This can't be undone. If a guest already claimed it, they'll no longer see it as reserved."
        confirmLabel="Remove gift"
        pending={pending}
      />
    </div>
  )
}

/** Flat, centered number tile — Zola's "Gifts added" / "Cash funds added"
 *  style, distinct from the shared StatCard's icon-and-label layout used
 *  elsewhere in the dashboard. */
function FlatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-black/[0.04] p-6 text-center">
      <span className="text-3xl font-bold tracking-tight text-[#1A1A1A]">{value}</span>
      <span className="mt-1 text-sm text-[#1A1A1A]/60">{label}</span>
    </div>
  )
}

/** Pill-styled select with a custom chevron (native selects render their own
 *  arrow flush against the edge — appearance-none + this icon gives it the
 *  same breathing room as the rest of the filter bar's controls). */
function FilterSelect({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (v: string) => void
  children: ReactNode
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-full border border-black/[0.12] bg-white py-2 pl-3.5 pr-8 text-xs font-semibold text-[#1A1A1A] outline-none focus:border-[#C9A0DC]"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#1A1A1A]/45" />
    </div>
  )
}

/** A bordered checkbox row (label + description) — mirrors Zola's "Most wanted" / "Group gift" editor rows. */
function CheckboxRow({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  title: string
  description: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-black/[0.12] px-3.5 py-3 hover:bg-black/[0.02]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-black/[0.25] text-[#C9A0DC] focus:ring-[#C9A0DC]/30"
      />
      <span>
        <span className="block text-sm font-medium text-[#1A1A1A]">{title}</span>
        <span className="mt-0.5 block text-xs text-[#1A1A1A]/55">{description}</span>
      </span>
    </label>
  )
}

/** window.location.origin never changes for a loaded page, so this is a static
 *  read, not a real subscription — subscribe is a no-op. useSyncExternalStore
 *  (rather than useState+useEffect) gives an SSR-safe '' snapshot on the
 *  server and the real origin on the client with no extra post-mount render. */
function subscribeToNothing() {
  return () => {}
}
function getOrigin() {
  return window.location.origin
}
function getServerOrigin() {
  return ''
}

function ShareLinkCard({
  shareSlug,
  shareEnabled,
  eventId,
}: {
  shareSlug: string | null
  shareEnabled: boolean
  eventId: string | null
}) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()
  // Built from window.location.origin (not a server-computed origin) so the
  // link — and the "Preview" tab — resolve to localhost while developing
  // instead of always pointing at the production domain.
  const origin = useSyncExternalStore(subscribeToNothing, getOrigin, getServerOrigin)

  const shareLink = shareSlug && origin ? `${origin}${giftRegistryPath(shareSlug)}` : null

  function onEnable() {
    if (!eventId) return
    startTransition(async () => {
      await enableGiftRegistrySharing(eventId)
      router.refresh()
    })
  }

  async function onCopy() {
    if (!shareLink) return
    await navigator.clipboard.writeText(shareLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    // Tighter side padding on phones: it buys the 8px that keeps "No link
    // yet, generate one to start sharing your registry." on one line, which
    // at 12px measures 309px against a 309px column.
    <Card className="px-5 py-4 max-sm:px-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* Stacked on phones, same as the guestbook share card: side by side
            the button's width won the row and squeezed the text column to a
            few characters, wrapping the label across three lines. */}
        <div className="flex min-w-0 flex-1 flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-[#1A1A1A]/65">
              <Link2 className="h-3.5 w-3.5 shrink-0" />
              <span>Your gift registry link</span>
            </div>
            {shareEnabled && shareLink ? (
              <div className="mt-1 truncate rounded-lg border border-black/[0.12] bg-white px-3 py-2 text-xs text-[#1A1A1A]/80">
                {shareLink.replace(/^https?:\/\//, '')}
              </div>
            ) : (
              <div className="mt-1 text-xs text-[#1A1A1A]/55">No link yet, generate one to start sharing your registry.</div>
            )}
          </div>
          {shareEnabled && shareLink ? (
            <div className="flex shrink-0 items-center gap-2 max-sm:gap-1.5">
              <a
                href={shareLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#C9A0DC] px-4 py-2 text-sm font-semibold text-[#1A1A1A] hover:bg-[#b97fd0] sm:flex-none"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Preview
              </a>
              <button data-opus-button="neutral" data-opus-button-size="medium"
                type="button"
                onClick={onCopy}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-black/[0.18] bg-white px-4 py-2 text-sm font-semibold text-[#1A1A1A] hover:bg-black/[0.03] sm:flex-none"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
          ) : (
            <button data-opus-button="primary" data-opus-button-size="medium"
              type="button"
              onClick={onEnable}
              disabled={pending || !eventId}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#C9A0DC] px-4 py-2 text-sm font-semibold text-[#1A1A1A] hover:bg-[#b97fd0] disabled:opacity-50"
            >
              <Link2 className="h-3.5 w-3.5 shrink-0" /> {pending ? 'Generating…' : 'Get my registry link'}
            </button>
          )}
        </div>
      </div>
    </Card>
  )
}
