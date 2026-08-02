'use client'

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import { useBodyLock } from '@/hooks/useBodyLock'
import { InvitationVisual } from '@/components/guests/InvitationVisual'
import {
  MessageCircle,
  Smartphone,
  Copy,
  ArrowRight,
  BellRing,
  Eye,
  X,
  RotateCcw,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Check,
  Ticket,
  ImagePlus,
  Send,
  CheckCheck,
  CalendarHeart,
  CalendarCheck,
  ClipboardCheck,
  ListChecks,
  Download,
  ExternalLink,
  HeartHandshake,
  Mail,
  Share2,
  CalendarDays,
  MapPin,
  Users,
} from 'lucide-react'
import {
  enableInviteSharing,
  applySaveDateTemplate,
  removeSaveDateTemplate,
  sendWhatsAppInvites,
  sendWhatsAppTestInvite,
  sendEntrancePasses,
  saveInviteSendSettings,
  updateEventTicketDetails,
  assignOrderToEvent,
  updateGuestPhone,
  updateGuestBasics,
  createGuest,
  deleteGuest,
  deleteGuests,
  recordSend,
  type WhatsAppSendSummary,
  type WhatsAppSendResult,
} from '@/lib/dashboard/actions'
import {
  whatsappShareUrl,
  smsShareUrl,
  emailShareUrl,
  inviteMessage,
  reminderMessage,
  firstNameOf,
  fullNameOf,
  saveDateUrl,
} from '@/lib/dashboard/share'
import { INVITE_TEMPLATE, ENTRANCE_PASS_TEMPLATE } from '@/lib/whatsapp/types'
import { EVENT_TYPE_LABELS, EVENT_TYPE_LABELS_SW } from '@/lib/dashboard/types'
import type { EventType, TicketLanguage } from '@/lib/dashboard/types'
import type { SendInvitesData, SendGuestRow } from '@/lib/dashboard/queries'
import type { RsvpsDashboardCopy } from '@/lib/cms/dashboard-copy'
import type { DashboardSendStrings, DashboardEventScopeStrings } from '@/lib/cms/ui-strings-fallback'
import { setActiveEventCookie, EventPicker } from '@/components/dashboard/EventScope'
import { ALL_EVENTS } from '@/lib/dashboard/event-scope-constants'
import RsvpSetupPanel from '../rsvps/RsvpSetupPanel'
import RsvpTracker from '../rsvps/RsvpTracker'
import { createCheckinRealtimeClient } from '@/lib/checkin/realtimeClient'
import { checkinChannelName, type CheckinBroadcastPayload } from '@/lib/checkin/shared'
import type { CheckinReportData } from '@/lib/checkin-report-pdf'

/** Short stable digest of the ticket's visible fields — appended to the
 *  preview image URL so a save produces a new URL, and the browser can
 *  never serve a stale thumbnail of the previous details. */
function fieldsDigest(parts: (string | null | undefined)[]): string {
  let h = 5381
  const joined = parts.join('|')
  for (let i = 0; i < joined.length; i++) h = ((h << 5) + h + joined.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

const STATUS_CLASS: Record<SendGuestRow['status'], string> = {
  none: 's-none',
  sent: 's-sent',
  viewed: 's-view',
  attending: 's-yes',
  declined: 's-no',
  maybe: 's-maybe',
}

/** Substitute `{var}` placeholders in a CMS template with runtime values. */
const fmt = (t: string, v: Record<string, string | number>) =>
  t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m))

/** Render WhatsApp-flavoured text: *bold* spans and newlines. */
function waText(text: string) {
  return text.split('\n').map((line, i) => (
    <Fragment key={i}>
      {i > 0 ? <br /> : null}
      {line.split(/(\*[^*]+\*)/g).map((part, j) =>
        part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
          <b key={j}>{part.slice(1, -1)}</b>
        ) : (
          <Fragment key={j}>{part}</Fragment>
        ),
      )}
    </Fragment>
  ))
}

/** The known Swahili event categories, in template-friendly form. */
const CATEGORY_OPTIONS = [...new Set(Object.values(EVENT_TYPE_LABELS_SW))]

/** Display form of a category: menu shows "Harusi", the message keeps the
 *  grammatically-correct lowercase noun mid-sentence ("kuhudhuria harusi ya"). */
const capitalize = (v: string) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : v)

/** Event-category picker: preset Swahili nouns plus an "other, type it" mode.
 *  The select can never render blank: an empty value shows a placeholder row
 *  and a saved custom value opens directly in other-mode. */
function CategoryField({
  value,
  onChange,
  label,
  otherLabel,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  otherLabel: string
}) {
  const isPreset = CATEGORY_OPTIONS.includes(value)
  const [otherPicked, setOtherPicked] = useState(() => Boolean(value) && !isPreset)
  const otherMode = otherPicked || (Boolean(value) && !isPreset)
  return (
    <label className="vfield">
      <span>{label}</span>
      <select
        value={otherMode ? '__other' : value}
        onChange={(e) => {
          if (e.target.value === '__other') {
            setOtherPicked(true)
          } else {
            setOtherPicked(false)
            onChange(e.target.value)
          }
        }}
      >
        {!value && !otherMode ? <option value="" disabled>{label}</option> : null}
        {CATEGORY_OPTIONS.map((o) => (
          <option key={o} value={o}>{capitalize(o)}</option>
        ))}
        <option value="__other">{otherLabel}</option>
      </select>
      {otherMode ? (
        <input value={value} onChange={(e) => onChange(e.target.value)} maxLength={40} placeholder={otherLabel} autoFocus />
      ) : null}
    </label>
  )
}

/** Short wall-clock for an arrival timestamp (e.g. "18:42"). */
function formatClock(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** A door scan received live over the broadcast channel, newest-first. */
interface LiveArrival {
  name: string
  door: string
  at: string
  duplicate: boolean
}

/** A queued bulk send awaiting the couple's confirmation. */
interface PendingSend {
  ids?: string[]
  reminder: boolean
  recipients: number
  credits: number
}

type SendTab = 'saveDates' | 'cards' | 'responses' | 'followups' | 'ticket' | 'checkins'

/** How far a production order is through its promised turnaround. Built on the
 *  server so the day number is identical either side of hydration. */
export type ProductionEta = {
  /** 1-based day within the window, clamped to `total`. */
  day: number
  total: number
  pct: number
  dueLabel: string
  late: boolean
}
const SEND_TABS: SendTab[] = ['saveDates', 'cards', 'responses', 'followups', 'ticket', 'checkins']
type SaveDateTemplate = {
  id: string
  name: string
  imageUrl: string
}

export default function SendInvitesView({
  data,
  strings,
  scopeStrings,
  rsvpsCopy,
  saveDateTemplates = [],
  initialTab,
  pendingCardDetails = 0,
  productionEta = null,
}: {
  data: SendInvitesData
  strings: DashboardSendStrings
  scopeStrings: DashboardEventScopeStrings
  rsvpsCopy: RsvpsDashboardCopy
  saveDateTemplates?: SaveDateTemplate[]
  initialTab?: string
  /** Design jobs still waiting on details from this couple. */
  pendingCardDetails?: number
  /** Position inside the promised turnaround. Null when we cannot say. */
  productionEta?: ProductionEta | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { event, funnel, quota, entranceQuota, whatsappLive, guests, events, selectedEventId, unassignedOrders } = data
  const eventId = selectedEventId ?? undefined
  const thankYouHref = selectedEventId
    ? `/my/dashboard/thank-you?event=${encodeURIComponent(selectedEventId)}`
    : '/my/dashboard/thank-you'

  const [pending, startTransition] = useTransition()
  const [filter, setFilter] = useState<'all' | 'notsent' | 'awaiting' | 'attending'>('all')
  // Sub-filter within the (always-attending) Pass Ticket tab — separate from
  // `filter` above so switching tabs never leaks one tab's filter state into
  // the other.
  const [ticketFilter, setTicketFilter] = useState<'all' | 'notsent' | 'sent'>('all')
  const [sendTab, setSendTab] = useState<SendTab>(
    SEND_TABS.includes(initialTab as SendTab) ? (initialTab as SendTab) : 'saveDates',
  )
  // Live Check-ins tab sub-filter (attended roster is always scoped to
  // "attending"), kept separate so switching tabs never leaks filter state.
  const [checkinFilter, setCheckinFilter] = useState<'all' | 'arrived' | 'pending'>('all')
  // Door scans received live over the broadcast channel while this tab is open.
  // The authoritative roster still comes from the server (each guest's
  // checked_in_at), refreshed by the poll below and nudged after each scan;
  // this feed is instant visual feedback layered on top.
  const [liveArrivals, setLiveArrivals] = useState<LiveArrival[]>([])
  const [checkinConnected, setCheckinConnected] = useState(false)
  const [reportBusy, setReportBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sendingRow, setSendingRow] = useState<string | null>(null)
  /** Optimistic overlay on the server's per-guest ticket status — marks a row
   *  "Sent" the instant its send succeeds, before router.refresh() re-queries
   *  the persisted whatsapp_messages ledger. */
  const [entranceSentIds, setEntranceSentIds] = useState<Set<string>>(new Set())
  const ticketSent = (g: SendGuestRow) => g.entrancePassSent || entranceSentIds.has(g.id)
  const [confirmSend, setConfirmSend] = useState<PendingSend | null>(null)
  const [report, setReport] = useState<WhatsAppSendSummary | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [testPhone, setTestPhone] = useState(data.testPhone ?? '')
  const [testSending, setTestSending] = useState(false)
  const [phoneEdit, setPhoneEdit] = useState<{ id: string; value: string } | null>(null)
  const [confirmEntranceSend, setConfirmEntranceSend] = useState<{ ids?: string[]; recipients: number } | null>(null)
  const [entrancePreviewOpen, setEntrancePreviewOpen] = useState(false)
  // Per-guest channel override for the Digital Cards tab (WhatsApp/SMS only —
  // entrance passes are image attachments, so tickets stay WhatsApp-only with
  // no picker). Same custom-dropdown pattern as the pledges guest table: a
  // native <select> can't render icon components inside its options.
  const [channelChoice, setChannelChoice] = useState<Record<string, 'whatsapp' | 'sms'>>({})
  const [channelMenuOpenId, setChannelMenuOpenId] = useState<string | null>(null)
  useEffect(() => {
    if (!channelMenuOpenId) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-channel-menu]')) setChannelMenuOpenId(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [channelMenuOpenId])
  // Inline guest-list editing: one row at a time, plus an add-guest row.
  const [rowEdit, setRowEdit] = useState<{ id: string; name: string; phone: string; askDelete: boolean } | null>(null)
  const [newGuest, setNewGuest] = useState<{ name: string; phone: string } | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  // Any full-screen overlay open — freeze the page behind it so scrolling
  // over the (fixed-position) dim backdrop doesn't also scroll the page.
  useBodyLock(Boolean(confirmSend || report || previewOpen || confirmEntranceSend || entrancePreviewOpen || confirmBulkDelete))
  // The template's {{2}}/{{3}}, editable everywhere they're shown and REQUIRED
  // before any send. {{1}} (guest name) is per-guest from the roster; the
  // sample here only drives the preview bubble and the test message.
  const [hostName, setHostName] = useState(data.sendSettings.hostName)
  const [eventCat, setEventCat] = useState(data.sendSettings.eventCategory)
  const [sampleGuest, setSampleGuest] = useState(firstNameOf(guests[0]?.name ?? 'Amina'))
  const settingsValid = hostName.trim().length > 0 && eventCat.trim().length > 0
  // The details card is a form only while unconfirmed or explicitly editing;
  // once saved it collapses into a confirmed summary.
  const [editingSettings, setEditingSettings] = useState(!data.sendSettings.confirmed)
  const isCardSendTab = sendTab === 'saveDates' || sendTab === 'cards'
  const cardDesignHref = '/digital-cards/catalog'
  const [saveDateSelection, setSaveDateSelection] = useState<SaveDateTemplate | null>(() =>
    event.saveDateTemplateImageUrl
      ? {
          id: event.saveDateTemplateId ?? 'selected-save-date',
          name: event.saveDateTemplateName ?? strings.save_dates_card_badge,
          imageUrl: event.saveDateTemplateImageUrl,
        }
      : null,
  )
  const [applyingSaveDateId, setApplyingSaveDateId] = useState<string | null>(null)
  useEffect(() => {
    setSaveDateSelection(
      event.saveDateTemplateImageUrl
        ? {
            id: event.saveDateTemplateId ?? 'selected-save-date',
            name: event.saveDateTemplateName ?? strings.save_dates_card_badge,
            imageUrl: event.saveDateTemplateImageUrl,
          }
        : null,
    )
  }, [
    event.saveDateTemplateId,
    event.saveDateTemplateImageUrl,
    event.saveDateTemplateName,
    selectedEventId,
    strings.save_dates_card_badge,
  ])
  const selectedSaveDateTemplate = saveDateSelection
  const hasSelectedSaveDate = Boolean(selectedSaveDateTemplate)
  const selectedSaveDateEditHref = selectedSaveDateTemplate
    ? `/digital-cards/p/${selectedSaveDateTemplate.id}/customise${
        selectedEventId ? `?event=${encodeURIComponent(selectedEventId)}` : ''
      }`
    : null
  const saveDateShareLink =
    hasSelectedSaveDate && data.publicLink.enabled && data.publicLink.slug && data.publicLink.url
      ? saveDateUrl(new URL(data.publicLink.url).origin, data.publicLink.slug)
      : null
  const saveDateShareMessage = saveDateShareLink
    ? `Save the date for ${event.coupleName}. Please open this link for the details: ${saveDateShareLink}`
    : ''
  const saveDateWaUrl = whatsappShareUrl({ full_name: '', phone: null, whatsapp_phone: null }, saveDateShareMessage)
  const saveDateSmsUrl = smsShareUrl({ phone: null, whatsapp_phone: null }, saveDateShareMessage)
  const saveDateEmailUrl = emailShareUrl(
    { email: null },
    `Save the date - ${event.eventName ?? event.coupleName}`,
    saveDateShareMessage,
  )
  const [saveDateQrDataUrl, setSaveDateQrDataUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!saveDateShareLink) {
      setSaveDateQrDataUrl(null)
      return
    }
    let cancelled = false
    QRCode.toDataURL(saveDateShareLink, {
      margin: 1,
      width: 200,
      color: { dark: '#1A1A1A', light: '#00000000' },
    })
      .then((url) => {
        if (!cancelled) setSaveDateQrDataUrl(url)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [saveDateShareLink])

  // The Pass Ticket tab's thumbnail: this event's real ticket art. Falls
  // back to the packaged sample only when there's no event to render yet.
  const tf = data.event.ticketFields
  const ticketPreviewSrc =
    eventId && tf
      ? `/entrance-pass/preview?event=${eventId}&v=${fieldsDigest([
          tf.eventType,
          tf.partner1Name,
          tf.partner2Name,
          tf.startDate,
          tf.venueName,
          tf.city,
          tf.ticketLanguage,
        ])}`
      : '/entrance-pass/ticket-preview.png'

  // Pass Ticket tab's Ticket Details editor — edits the real wedding_events
  // row (category, partner names, date, venue, ticket language). Seeded from
  // the server snapshot each time it OPENS, so switching events (same mounted
  // component, fresh props) can never leak another event's values in.
  const [ticketForm, setTicketForm] = useState<NonNullable<SendInvitesData['event']['ticketFields']> | null>(null)
  // Close the editor whenever the selected event changes (dropdown switch,
  // browser back/forward) — this component stays mounted across those
  // client navigations, so without this a stale open form could be saved
  // against the newly selected event's id.
  useEffect(() => {
    setTicketForm(null)
  }, [selectedEventId])
  function openTicketEditor() {
    if (data.event.ticketFields) setTicketForm({ ...data.event.ticketFields })
  }
  function saveTicketDetails() {
    if (!ticketForm || !eventId) return
    startTransition(async () => {
      try {
        await updateEventTicketDetails(eventId, {
          event_type: ticketForm.eventType,
          partner1_name: ticketForm.partner1Name || null,
          partner2_name: ticketForm.partner2Name || null,
          start_date: ticketForm.startDate,
          venue_name: ticketForm.venueName || null,
          city: ticketForm.city || null,
          ticket_language: ticketForm.ticketLanguage,
        })
        toast.success(strings.toast_ticket_saved)
        setTicketForm(null)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : strings.toast_ticket_saved)
      }
    })
  }

  // "Awaiting" = invited but not yet replied (delivered or seen, no RSVP).
  const isAwaiting = (s: SendGuestRow['status']) => s === 'sent' || s === 'viewed'
  const hasPhone = (g: SendGuestRow) => Boolean(g.whatsappPhone || g.phone)

  const notSentCount = useMemo(() => guests.filter((g) => g.status === 'none').length, [guests])
  const awaitingCount = useMemo(() => guests.filter((g) => isAwaiting(g.status)).length, [guests])
  const attendingCount = useMemo(() => guests.filter((g) => g.status === 'attending').length, [guests])
  // Ticket-sent status is already tracked (entrancePassSent / entranceSentIds
  // — same real ledger the row badges already read from), just not yet
  // exposed as filter tabs the way invite status is.
  const ticketNotSentCount = useMemo(
    () => guests.filter((g) => g.status === 'attending' && !(g.entrancePassSent || entranceSentIds.has(g.id))).length,
    [guests, entranceSentIds],
  )
  const ticketSentCount = useMemo(
    () => guests.filter((g) => g.status === 'attending' && (g.entrancePassSent || entranceSentIds.has(g.id))).length,
    [guests, entranceSentIds],
  )

  // Live Check-ins tab: the attending roster with each guest's door check-in
  // (server-side, from guest_invitations.checked_in_at).
  const attendingGuests = useMemo(() => guests.filter((g) => g.status === 'attending'), [guests])
  const arrivedCount = useMemo(() => attendingGuests.filter((g) => g.checkedInAt).length, [attendingGuests])
  const checkinPct = attendingCount > 0 ? Math.round((arrivedCount / attendingCount) * 100) : 0
  const visibleCheckins = useMemo(() => {
    const q = search.trim().toLowerCase()
    return attendingGuests
      .filter((g) => {
        if (checkinFilter === 'arrived' && !g.checkedInAt) return false
        if (checkinFilter === 'pending' && g.checkedInAt) return false
        if (q && !`${g.name} ${g.phone ?? ''} ${g.whatsappPhone ?? ''}`.toLowerCase().includes(q)) return false
        return true
      })
      // Arrived first, most recent scan on top; the not-yet-arrived trail after.
      .sort((a, b) => {
        if (a.checkedInAt && b.checkedInAt) return b.checkedInAt.localeCompare(a.checkedInAt)
        if (a.checkedInAt) return -1
        if (b.checkedInAt) return 1
        return a.name.localeCompare(b.name)
      })
  }, [attendingGuests, checkinFilter, search])

  // Pass Ticket tab only ever sends to confirmed guests — the guest list
  // beneath it is always scoped to "attending", regardless of whatever
  // filter was last picked on the Digital Cards tab.
  const effectiveFilter = sendTab === 'ticket' ? 'attending' : filter

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return guests.filter((g) => {
      if (effectiveFilter === 'notsent' && g.status !== 'none') return false
      if (effectiveFilter === 'awaiting' && !isAwaiting(g.status)) return false
      if (effectiveFilter === 'attending' && g.status !== 'attending') return false
      if (sendTab === 'ticket') {
        const sent = g.entrancePassSent || entranceSentIds.has(g.id)
        if (ticketFilter === 'notsent' && sent) return false
        if (ticketFilter === 'sent' && !sent) return false
      }
      if (q && !`${g.name} ${g.phone ?? ''} ${g.whatsappPhone ?? ''}`.toLowerCase().includes(q)) {
        return false
      }
      return true
    })
  }, [guests, effectiveFilter, search, sendTab, ticketFilter, entranceSentIds])
  const pct = quota.purchased > 0 ? Math.min(100, Math.round((quota.used / quota.purchased) * 100)) : 0
  const epct = entranceQuota.purchased > 0 ? Math.min(100, Math.round((entranceQuota.used / entranceQuota.purchased) * 100)) : 0

  // The webhook flips statuses (delivered, viewed, RSVP taps) server-side;
  // refetch periodically so the table reflects them without a manual reload.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && !pending && !sendingRow) router.refresh()
    }, 25_000)
    return () => clearInterval(t)
  }, [router, pending, sendingRow])

  // Coalesce the roster re-fetches a burst of scans would otherwise trigger:
  // one refresh ~1.2s after the last scan pulls the fresh check-ins (door +
  // time per guest) without hammering the server during a rush at the gate.
  const checkinRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (checkinRefreshTimer.current) clearTimeout(checkinRefreshTimer.current)
  }, [])

  // Live door feed — only subscribed while the Check-ins tab is actually open,
  // so no socket is held for couples who never look at it. The broadcast is a
  // UI enhancement (see broadcast.ts); the roster below is the source of truth.
  useEffect(() => {
    if (sendTab !== 'checkins' || !eventId) return
    let client: ReturnType<typeof createCheckinRealtimeClient>
    try {
      client = createCheckinRealtimeClient()
    } catch {
      return
    }
    const channel = client
      .channel(checkinChannelName(eventId))
      .on('broadcast', { event: 'scan' }, ({ payload }) => {
        const p = payload as CheckinBroadcastPayload
        setLiveArrivals((prev) =>
          [
            { name: p.guestName, door: p.doorLabel, at: p.at, duplicate: p.status === 'duplicate' },
            ...prev,
          ].slice(0, 8),
        )
        // A fresh arrival changes the roster (checked_in_at); pull it in shortly
        // so the guest's row flips to "Arrived" with the real door + time.
        if (p.status === 'success') {
          if (checkinRefreshTimer.current) clearTimeout(checkinRefreshTimer.current)
          checkinRefreshTimer.current = setTimeout(() => router.refresh(), 1200)
        }
      })
      .subscribe((status) => setCheckinConnected(status === 'SUBSCRIBED'))
    return () => {
      setCheckinConnected(false)
      client.removeChannel(channel)
    }
  }, [sendTab, eventId, router])

  // Heading name comes from the event itself (falls back to the couple profile
  // only when no events exist). The event type renders separately as a pill
  // (in the package facts row when paid, alongside date/venue otherwise) —
  // skip it entirely when it's redundant with the heading itself.
  const headingName = event.eventName ?? event.coupleName
  const showCategoryPill = Boolean(
    event.eventTypeLabel && event.eventTypeLabel.toLowerCase() !== headingName.toLowerCase(),
  )
  const productionOrder = event.productionOrder
  const canSendDigitalCards = event.hasPaidOrder
  const showCardProductionLock = sendTab === 'cards' && !canSendDigitalCards && Boolean(productionOrder)
  const isDesigningNow = productionOrder?.fulfillmentStatus === 'in_progress'
  const productionStatusLabel = isDesigningNow
    ? strings.card_status_designing
    : strings.card_status_confirmed
  const displayCardImageUrl = showCardProductionLock ? (productionOrder?.cardImageUrl ?? null) : event.cardImageUrl
  const displayCardTreatment = showCardProductionLock ? (productionOrder?.cardTreatment ?? null) : event.cardTreatment

  const previewBody = INVITE_TEMPLATE.body
    .replace('{{1}}', sampleGuest.trim() || 'Amina')
    .replace('{{2}}', hostName.trim() || event.coupleName)
    .replace('{{3}}', eventCat.trim() || event.eventCategorySw)

  // Real attending guest to preview the entrance pass with — the ticket
  // image route 404s for anyone not yet confirmed attending, so this must
  // be an actual guest, not a made-up sample name.
  const entrancePreviewGuest = guests.find((g) => g.status === 'attending') ?? null
  const entrancePreviewBody = ENTRANCE_PASS_TEMPLATE.body
    .replace('{{1}}', entrancePreviewGuest ? fullNameOf(entrancePreviewGuest.name) : 'Amina')
    .replace('{{2}}', event.eventCategorySw)
    .replace('{{3}}', event.entranceCoupleName)
    .replace('{{4}}', event.entranceDateLabel)
    .replace('{{5}}', event.entranceTimeLabel)
    .replace('{{6}}', event.entranceVenue)

  /** Switch which event this page is scoped to — a fresh server fetch of the
   *  design/quota/guest-statuses for that event (not client-side filtering,
   *  since entitlement itself is scoped server-side). */
  function switchEvent(id: string) {
    setActiveEventCookie(id)
    const qs = new URLSearchParams()
    qs.set('event', id)
    qs.set('tab', sendTab)
    router.push(`${pathname}?${qs.toString()}`)
  }

  function enableSaveDateLink() {
    if (!selectedEventId) return
    startTransition(async () => {
      try {
        await enableInviteSharing(selectedEventId)
        toast.success(strings.save_dates_link_enabled)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : strings.toast_sharing_error)
      }
    })
  }

  function useSaveDateTemplate(template: SaveDateTemplate) {
    if (!selectedEventId) return
    setApplyingSaveDateId(template.id)
    setSaveDateSelection(template)
    startTransition(async () => {
      try {
        await applySaveDateTemplate(selectedEventId, template)
        toast.success(strings.save_dates_template_applied)
        router.refresh()
      } catch (err) {
        setSaveDateSelection(null)
        toast.error(err instanceof Error ? err.message : strings.toast_send_failed)
      } finally {
        setApplyingSaveDateId(null)
      }
    })
  }

  function clearSaveDateTemplate() {
    if (!selectedEventId || !selectedSaveDateTemplate) return
    const previous = selectedSaveDateTemplate
    setApplyingSaveDateId(previous.id)
    setSaveDateSelection(null)
    startTransition(async () => {
      try {
        await removeSaveDateTemplate(selectedEventId)
        toast.success('Save the date template removed')
        router.refresh()
      } catch (err) {
        setSaveDateSelection(previous)
        toast.error(err instanceof Error ? err.message : strings.toast_send_failed)
      } finally {
        setApplyingSaveDateId(null)
      }
    })
  }

  async function copySaveDateLink() {
    if (!saveDateShareLink) return
    try {
      await navigator.clipboard.writeText(saveDateShareLink)
      toast.success(strings.toast_link_copied)
    } catch {
      toast.error(strings.toast_sharing_error)
    }
  }

  // ── Downloadable / shareable check-in report ───────────────────────────────
  /** Ticket label a guest is admitted on (Single/Double), from the headcount
   *  actually let in when known, else what they RSVP'd for. */
  const ticketLabelOf = (g: SendGuestRow) =>
    (g.checkedInPartySize ?? g.rsvpPartySize ?? g.assignedPartySize) >= 2
      ? strings.party_double
      : strings.party_single

  function buildReportData(): CheckinReportData {
    const rows = attendingGuests.map((g) => ({
      name: g.name,
      ticket: ticketLabelOf(g),
      table: g.tableName,
      door: g.checkedInAt ? g.checkedInDoor : null,
      attendant: g.checkedInAt ? g.checkedInBy : null,
      arrivedAt: g.checkedInAt ? formatClock(g.checkedInAt) : null,
    }))
    return {
      eventName: headingName,
      eventDate: event.dateLabel ?? null,
      venue: event.venue ?? null,
      generatedAt: new Date().toLocaleString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      totalAttending: attendingCount,
      totalArrived: arrivedCount,
      rows,
    }
  }

  /** Plain-text fallback for share targets that can't take a file attachment
   *  (older browsers) — pasteable straight into WhatsApp. */
  function buildReportText(): string {
    const lines = [
      fmt(strings.checkin_report_title, { event: headingName }),
      `${arrivedCount} / ${attendingCount} ${strings.checkin_arrived_suffix}`,
      '',
    ]
    for (const g of attendingGuests) {
      const mark = g.checkedInAt
        ? `✓ ${formatClock(g.checkedInAt)}${g.checkedInBy ? ` · ${g.checkedInBy}` : ''}`
        : strings.checkin_not_arrived
      const seat = g.tableName ? ` [${g.tableName}]` : ''
      lines.push(`${g.name}${seat} — ${mark}`)
    }
    return lines.join('\n')
  }

  async function fetchReportBlob(): Promise<Blob> {
    const res = await fetch('/api/checkin-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildReportData()),
    })
    if (!res.ok) throw new Error('Report request failed')
    return res.blob()
  }

  const reportFilename = `${headingName.replace(/[^A-Za-z0-9 _-]/g, '').trim() || 'OpusPass'}-Checkin-Report.pdf`

  async function downloadReport() {
    setReportBusy(true)
    try {
      const blob = await fetchReportBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = reportFilename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error(strings.checkin_toast_report_failed)
    } finally {
      setReportBusy(false)
    }
  }

  /** Native share sheet with the PDF attached (WhatsApp, Files, email, …) where
   *  supported; otherwise copies a text summary so there's always something to
   *  send. Mirrors the seating-plan share flow. */
  async function shareReport() {
    setReportBusy(true)
    try {
      const blob = await fetchReportBlob()
      const file = new File([blob], reportFilename, { type: 'application/pdf' })
      const canShareFile = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
      if (canShareFile && navigator.share) {
        await navigator.share({ files: [file], title: fmt(strings.checkin_report_title, { event: headingName }) })
        return
      }
      await navigator.clipboard.writeText(buildReportText())
      toast.success(strings.checkin_toast_report_copied)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return // user cancelled the share sheet
      try {
        await navigator.clipboard.writeText(buildReportText())
        toast.success(strings.checkin_toast_report_copied)
      } catch {
        toast.error(strings.checkin_toast_report_failed)
      }
    } finally {
      setReportBusy(false)
    }
  }

  function assignUnassignedOrder(orderId: string) {
    if (!selectedEventId) return
    startTransition(async () => {
      try {
        await assignOrderToEvent(orderId, selectedEventId)
        toast.success(strings.toast_order_assigned)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : strings.toast_send_failed)
      }
    })
  }

  /** Stage a bulk send: show recipients + credit cost, send on confirm. */
  function stageBulkSend(ids?: string[], { reminder = false }: { reminder?: boolean } = {}) {
    const pool = ids ? guests.filter((g) => ids.includes(g.id)) : guests
    const eligible = pool.filter(hasPhone)
    if (eligible.length === 0) {
      toast.error(strings.toast_nothing_sent)
      return
    }
    const credits = eligible.filter((g) => g.status === 'none').length
    setConfirmSend({ ids, reminder, recipients: eligible.length, credits })
  }

  function runBulkSend(ids?: string[], reminder = false) {
    setConfirmSend(null)
    startTransition(async () => {
      // The confirmed {{2}}/{{3}} values are part of every send — persist them
      // first so the server action reads what the couple just approved.
      try {
        await saveInviteSendSettings(hostName, eventCat)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : strings.toast_nothing_sent)
        return
      }
      const res = await sendWhatsAppInvites(ids, eventId)
      if (!res.hasPaidOrder) {
        toast.error(strings.toast_no_package)
        return
      }
      // Every guest fell through (unconfirmed, or the account has no card
      // image) — a "0 sent" success toast would hide the real problem.
      if (res.sent === 0 && res.failed === 0 && res.blocked === 0 && res.skipped === 0) {
        toast.error(strings.toast_nothing_sent)
        setSelected(new Set())
        return
      }
      const verb = res.dryRun
        ? strings.send_verb_dryrun
        : reminder
          ? strings.send_verb_reminded
          : strings.send_verb_sent
      const parts = [`${res.sent} ${verb}`]
      if (res.failed > 0) parts.push(fmt(strings.send_failed_n, { n: res.failed }))
      if (res.blocked > 0) parts.push(fmt(strings.send_over_quota, { n: res.blocked }))
      if (res.skipped > 0) parts.push(fmt(strings.send_no_phone, { n: res.skipped }))
      const summaryLine = parts.join(' · ')
      if (res.sent > 0) toast.success(summaryLine)
      else toast.error(summaryLine)
      setReport(res)
      setSelected(new Set())
      router.refresh()
    })
  }

  /** Stage sending the entrance-pass ticket to attending guests — a separate,
   *  simpler confirm flow from the invite send: no {{2}}/{{3}} to approve
   *  (the ticket's copy is generated server-side). Draws from its own credit
   *  pool, same size as the invite quota — first ticket per guest consumes a
   *  credit, re-sends are free. */
  function stageEntranceSend(ids?: string[]) {
    // Guard against a stale selection from another tab (e.g. checked on
    // "All", then switched to "Attending" and clicked send) — only guests
    // who have actually confirmed attending can ever receive a ticket, both
    // here and (redundantly, server-side) in sendEntrancePasses itself.
    const pool = (ids ? guests.filter((g) => ids.includes(g.id)) : guests).filter((g) => g.status === 'attending')
    const eligible = pool.filter(hasPhone)
    if (eligible.length === 0) {
      toast.error(strings.toast_nothing_sent)
      return
    }
    if (ids && eligible.length < ids.length) {
      toast(fmt(strings.toast_entrance_excluded_notattending, { n: ids.length - eligible.length }))
    }
    setEntrancePreviewOpen(false)
    setConfirmEntranceSend({ ids: eligible.map((g) => g.id), recipients: eligible.length })
  }

  function runEntranceSend() {
    const ids = confirmEntranceSend?.ids
    setConfirmEntranceSend(null)
    setEntrancePreviewOpen(false)
    startTransition(async () => {
      const res = await sendEntrancePasses(ids, eventId)
      if (res.sent === 0 && res.failed === 0 && res.skipped === 0 && res.blocked === 0) {
        toast.error(strings.toast_nothing_sent)
        setSelected(new Set())
        return
      }
      if (res.sent > 0) {
        setEntranceSentIds((prev) => {
          const next = new Set(prev)
          for (const r of res.results) if (r.outcome === 'sent') next.add(r.id)
          return next
        })
      }
      const parts = [`${res.sent} ${res.dryRun ? strings.send_verb_dryrun : strings.send_verb_sent}`]
      if (res.failed > 0) parts.push(fmt(strings.send_failed_n, { n: res.failed }))
      if (res.blocked > 0) parts.push(fmt(strings.send_over_quota, { n: res.blocked }))
      if (res.skipped > 0) parts.push(fmt(strings.send_no_phone, { n: res.skipped }))
      const summaryLine = parts.join(' · ')
      if (res.sent > 0) toast.success(summaryLine)
      else toast.error(summaryLine)
      setReport(res)
      setSelected(new Set())
      router.refresh()
    })
  }

  /** Nudge everyone who was invited but hasn't replied (re-sends are free). */
  function remindAwaiting() {
    const ids = guests.filter((g) => isAwaiting(g.status)).map((g) => g.id)
    if (ids.length === 0) {
      toast(strings.toast_no_awaiting)
      return
    }
    stageBulkSend(ids, { reminder: true })
  }

  function retryFailed() {
    const ids = (report?.results ?? []).filter((r) => r.outcome === 'failed').map((r) => r.id)
    if (ids.length === 0) return
    runBulkSend(ids)
  }

  /** The channel to actually send this guest's invite on (Digital Cards tab
   *  only): their dropdown override if it's still usable, else the
   *  server-computed default. */
  function effectiveChannel(g: SendGuestRow): 'whatsapp' | 'sms' {
    const chosen = channelChoice[g.id]
    if (chosen === 'whatsapp' && (g.whatsappPhone || g.phone)) return 'whatsapp'
    if (chosen === 'sms' && (g.phone || g.whatsappPhone)) return 'sms'
    return g.channel
  }

  /** Per-row send on the Pass Ticket tab — the guest's entrance-pass ticket,
   *  NOT the invite template the same button position sends on invite tabs. */
  function sendPassRow(g: SendGuestRow) {
    const first = firstNameOf(g.name)
    setSendingRow(g.id)
    startTransition(async () => {
      try {
        const res = await sendEntrancePasses([g.id], eventId)
        if (res.sent > 0) setEntranceSentIds((prev) => new Set(prev).add(g.id))
        if (res.sent > 0 && res.dryRun) toast.success(`1 ${strings.send_verb_dryrun}`)
        else if (res.sent > 0) toast.success(fmt(strings.toast_pass_sent, { name: first }))
        else if (res.blocked > 0) toast.error(fmt(strings.send_over_quota, { n: res.blocked }))
        else if (res.skipped > 0) toast.error(fmt(strings.send_no_phone, { n: res.skipped }))
        else {
          const detail = res.results[0]?.error
          toast.error(
            detail
              ? `${fmt(strings.toast_send_failed, { name: first })} (${detail})`
              : fmt(strings.toast_send_failed, { name: first }),
          )
        }
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : fmt(strings.toast_send_failed, { name: first }))
      } finally {
        setSendingRow(null)
      }
    })
  }

  function rowShare(g: SendGuestRow, channel: 'whatsapp' | 'sms' | 'copy') {
    if (channel === 'copy') {
      navigator.clipboard.writeText(g.rsvpUrl)
      toast.success(strings.toast_personal_copied)
      return
    }
    // With WhatsApp Business live, the row button sends the real approved
    // template (same pipeline as bulk send) — not a wa.me prefill.
    if (channel === 'whatsapp' && whatsappLive) {
      // First send ever? The couple must confirm the invitation details
      // ({{2}}/{{3}}) — route through the confirm dialog which saves them.
      if (!data.sendSettings.confirmed) {
        stageBulkSend([g.id], { reminder: isAwaiting(g.status) })
        return
      }
      const first = firstNameOf(g.name)
      const remindingLive = isAwaiting(g.status)
      setSendingRow(g.id)
      startTransition(async () => {
        try {
          const res = await sendWhatsAppInvites([g.id], eventId)
          if (!res.hasPaidOrder) toast.error(strings.toast_no_package)
          else if (res.sent > 0 && res.dryRun) toast.success(`1 ${strings.send_verb_dryrun}`)
          else if (res.sent > 0)
            toast.success(fmt(remindingLive ? strings.toast_reminded_one : strings.toast_sent_one, { name: first }))
          else if (res.blocked > 0) toast.error(fmt(strings.send_over_quota, { n: res.blocked }))
          else if (res.skipped > 0) toast.error(fmt(strings.send_no_phone, { n: res.skipped }))
          else {
            const detail = res.results[0]?.error
            toast.error(detail ? `${fmt(strings.toast_send_failed, { name: first })} (${detail})` : fmt(strings.toast_send_failed, { name: first }))
          }
          router.refresh()
        } finally {
          setSendingRow(null)
        }
      })
      return
    }
    // Already invited but no reply yet → send a gentle reminder, not a fresh invite.
    const reminding = isAwaiting(g.status)
    const msg = reminding
      ? reminderMessage(event.coupleName, g.name, g.rsvpUrl)
      : inviteMessage(event.coupleName, g.name, g.rsvpUrl)
    const guestLike = { full_name: g.name, phone: g.phone, whatsapp_phone: g.whatsappPhone }
    const url = channel === 'whatsapp' ? whatsappShareUrl(guestLike, msg) : smsShareUrl(guestLike, msg)
    window.open(url, '_blank', 'noopener,noreferrer')
    recordSend(g.id, channel, eventId).catch(() => {})
    if (reminding)
      toast.success(fmt(strings.toast_reminder_ready, { name: firstNameOf(g.name) }))
  }

  function sendTest() {
    if (!testPhone.trim() || testSending) return
    setTestSending(true)
    startTransition(async () => {
      try {
        const res = await sendWhatsAppTestInvite(
          testPhone,
          { guestName: sampleGuest, coupleName: hostName, eventCategory: eventCat },
          eventId,
        )
        if (res.ok && res.dryRun) toast.success(`1 ${strings.send_verb_dryrun}`)
        else if (res.ok) toast.success(strings.test_sent)
        else toast.error(res.error ? `${strings.test_failed}: ${res.error}` : strings.test_failed)
      } finally {
        setTestSending(false)
      }
    })
  }

  function saveSettings() {
    if (!settingsValid) return
    startTransition(async () => {
      try {
        await saveInviteSendSettings(hostName, eventCat)
        toast.success(strings.toast_settings_saved)
        setEditingSettings(false)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : strings.toast_settings_saved)
      }
    })
  }

  function saveRowEdit() {
    if (!rowEdit) return
    const { id, name, phone } = rowEdit
    startTransition(async () => {
      try {
        await updateGuestBasics(id, name, phone)
        toast.success(strings.toast_guest_saved)
        setRowEdit(null)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : strings.toast_send_failed)
      }
    })
  }

  function removeGuest() {
    if (!rowEdit) return
    const { id } = rowEdit
    startTransition(async () => {
      try {
        await deleteGuest(id)
        toast.success(strings.toast_guest_removed)
        setRowEdit(null)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : strings.toast_send_failed)
      }
    })
  }

  function runBulkDelete() {
    const ids = [...selected]
    if (ids.length === 0) return
    startTransition(async () => {
      try {
        const n = await deleteGuests(ids)
        toast.success(fmt(strings.toast_guests_removed, { n }))
        setSelected(new Set())
        setConfirmBulkDelete(false)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : strings.toast_send_failed)
      }
    })
  }

  function addGuest() {
    if (!newGuest || !newGuest.name.trim()) return
    const { name, phone } = newGuest
    startTransition(async () => {
      try {
        const res = await createGuest({
          full_name: name.replace(/\s+/g, ' ').trim(),
          phone: phone.trim() || null,
          whatsapp_phone: phone.trim() || null,
        })
        if (!res.ok) {
          toast.error(res.error ?? strings.toast_send_failed)
          return
        }
        toast.success(strings.toast_guest_saved)
        setNewGuest(null)
        router.refresh()
      } catch (err) {
        // Safety net for failures createGuest still throws (auth, invitation
        // sync) rather than returns — the duplicate-phone/insert-failure
        // cases above are the only ones it returns a message for.
        toast.error(err instanceof Error ? err.message : strings.toast_send_failed)
      }
    })
  }

  function savePhone() {
    if (!phoneEdit) return
    const { id, value } = phoneEdit
    startTransition(async () => {
      try {
        await updateGuestPhone(id, value)
        setPhoneEdit(null)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : strings.toast_send_failed)
      }
    })
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleSelectAll(on: boolean) {
    setSelected(on ? new Set(visible.map((g) => g.id)) : new Set())
  }

  const reportGroups: { label: string; outcome: WhatsAppSendResult['outcome'] }[] = [
    { label: strings.results_failed, outcome: 'failed' },
    { label: strings.results_blocked, outcome: 'blocked' },
    { label: strings.results_skipped, outcome: 'skipped' },
    { label: strings.results_sent, outcome: 'sent' },
  ]

  const responseEventFilter = selectedEventId ?? ALL_EVENTS

  return (
    <div className="si">
      <style>{css}</style>

      <div className="head dash-header-safe">
        <div className="headcopy">
          <h1>
            {sendTab === 'checkins'
              ? strings.checkin_title
              : sendTab === 'ticket'
                ? strings.entrance_title
                : sendTab === 'followups'
                  ? strings.followups_title
                  : sendTab === 'responses'
                    ? strings.responses_title
                    : sendTab === 'saveDates'
                      ? strings.save_dates_title
                      : strings.heading}
          </h1>
          <div className="subrow">
            <p className="sub">
              {sendTab === 'checkins'
                ? strings.checkin_desc
                : sendTab === 'ticket'
                  ? strings.entrance_desc
                  : sendTab === 'followups'
                    ? strings.followups_desc
                    : sendTab === 'responses'
                      ? strings.responses_desc
                      : sendTab === 'saveDates'
                        ? hasSelectedSaveDate
                          ? strings.save_dates_desc
                          : strings.save_dates_no_design_desc
                      : event.hasPaidOrder
                        ? strings.subheading
                        : event.productionOrder
                          ? strings.card_locked_body
                        : strings.no_design_subheading}
            </p>
            {events.length > 1 ? (
              <EventPicker
                events={events}
                selectedId={selectedEventId ?? ''}
                strings={scopeStrings}
                disabled={pending}
                onSelect={switchEvent}
                className="headpicker"
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* The guest communication pipeline: from first card to final thank-you. */}
      <div className="sendtabs" role="tablist">
        <button
          role="tab"
          aria-selected={sendTab === 'saveDates'}
          className={`stb ${sendTab === 'saveDates' ? 'on' : ''}`}
          onClick={() => { setSendTab('saveDates'); setSelected(new Set()) }}
        >
          <CalendarHeart size={14} /> {strings.tab_save_the_dates}
        </button>
        <button
          role="tab"
          aria-selected={sendTab === 'cards'}
          className={`stb ${sendTab === 'cards' ? 'on' : ''}`}
          onClick={() => { setSendTab('cards'); setSelected(new Set()) }}
        >
          <MessageCircle size={14} /> {strings.tab_digital_cards}
        </button>
        <button
          role="tab"
          aria-selected={sendTab === 'responses'}
          className={`stb ${sendTab === 'responses' ? 'on' : ''}`}
          onClick={() => { setSendTab('responses'); setSelected(new Set()) }}
        >
          <ClipboardCheck size={14} /> {strings.tab_guest_responses}
          {funnel.rsvpd > 0 ? <span className="stbcnt">{funnel.rsvpd}</span> : null}
        </button>
        <button
          role="tab"
          aria-selected={sendTab === 'followups'}
          className={`stb ${sendTab === 'followups' ? 'on' : ''}`}
          onClick={() => { setSendTab('followups'); setSelected(new Set()) }}
        >
          <ListChecks size={14} /> {strings.tab_follow_up_questions}
        </button>
        <button
          role="tab"
          aria-selected={sendTab === 'ticket'}
          className={`stb ${sendTab === 'ticket' ? 'on' : ''}`}
          onClick={() => { setSendTab('ticket'); setSelected(new Set()) }}
        >
          <Ticket size={14} /> {strings.tab_pass_ticket}
          {attendingCount > 0 ? <span className="stbcnt">{attendingCount}</span> : null}
        </button>
        <button
          role="tab"
          aria-selected={sendTab === 'checkins'}
          className={`stb ${sendTab === 'checkins' ? 'on' : ''}`}
          onClick={() => { setSendTab('checkins'); setSelected(new Set()) }}
        >
          <CalendarCheck size={14} /> {strings.tab_checkins}
          {arrivedCount > 0 ? <span className="stbcnt">{arrivedCount}</span> : null}
        </button>
        <Link role="tab" aria-selected={false} className="stb" href={thankYouHref}>
          <HeartHandshake size={14} /> {strings.tab_thank_you}
        </Link>
      </div>

      {/* Paid designs bought before this event existed, or before the couple
          had picked which event they're for — nudge them to assign one. */}
      {unassignedOrders.length > 0 ? (
        <div className="unassigned" id="unassigned-orders">
          <div className="uhead">
            <span className="dp">{strings.unassigned_pill}</span>
            <span>{fmt(strings.unassigned_note, { n: unassignedOrders.length })}</span>
          </div>
          <div className="ulist">
            {unassignedOrders.map((o) => (
              <div key={o.id} className="urow">
                {o.cardImageUrl ? (
                  <span className="uimg"><Image src={o.cardImageUrl} alt="" fill sizes="36px" className="object-cover" unoptimized /></span>
                ) : o.cardTreatment ? (
                  <span className="uimg"><InvitationVisual treatment={o.cardTreatment} /></span>
                ) : null}
                <span className="uname">{o.cardName ?? strings.card_fallback_label}</span>
                <span className="uguests">{fmt(strings.unassigned_guests, { n: o.purchasedGuests })}</span>
                {selectedEventId ? (
                  <button className="btn ghost" disabled={pending} onClick={() => assignUnassignedOrder(o.id)}>
                    {fmt(strings.unassigned_assign, { event: event.eventName ?? event.coupleName })}
                  </button>
                ) : (
                  <Link href="/my/dashboard/events" className="btn ghost">{strings.manage_events}</Link>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {sendTab === 'responses' ? (
        <div className="pipelinepanel">
          <RsvpTracker
            guests={data.responseGuests}
            events={data.responseEvents}
            eventFilter={responseEventFilter}
            lastSend={data.responseLastSend}
            copy={rsvpsCopy}
            sendRows={guests}
            sendStrings={strings}
          />
        </div>
      ) : null}

      {sendTab === 'followups' ? (
        <div className="pipelinepanel">
          <RsvpSetupPanel
            events={data.responseEvents}
            selectedEventId={selectedEventId}
            questions={data.responseQuestions}
            summaries={data.responseSummaries}
            answerSummaries={data.responseAnswerSummaries}
            mode="followups"
            followupShareGuests={guests}
            followupPreview={{ coupleName: event.coupleName, cardImageUrl: event.cardImageUrl }}
            onShareFollowups={() => setSendTab('responses')}
          />
        </div>
      ) : null}

      {sendTab === 'saveDates' ? (
        <>
        {saveDateTemplates.length > 0 ? (
          <div className="sdtemplates">
            <div>
              <h3>{strings.save_dates_templates_title}</h3>
              <p>{strings.save_dates_templates_desc}</p>
            </div>
            <div className="sdtrail" aria-label={strings.save_dates_templates_title}>
              {saveDateTemplates.slice(0, 6).map((template) => {
                const applied = selectedSaveDateTemplate?.imageUrl === template.imageUrl
                const applying = applyingSaveDateId === template.id && pending
                return (
                  <div key={template.id} className={`sdtile${applied ? ' applied' : ''}`}>
                    <div className="sdthumb">
                      <Image
                        src={template.imageUrl}
                        alt={template.name}
                        fill
                        sizes="210px"
                        quality={85}
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    {applied ? (
                      <span className="sdcheck" aria-hidden="true">
                        <Check size={13} />
                      </span>
                    ) : null}
                    <div className="sdname">{template.name}</div>
                    {applied ? (
                      <button
                        type="button"
                        className="templatebtn applied"
                        disabled={pending}
                        onClick={clearSaveDateTemplate}
                        title="Remove selected template"
                      >
                        {applying ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
                        {strings.save_dates_template_applied}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="templatebtn"
                        disabled={pending || !selectedEventId}
                        onClick={() => useSaveDateTemplate(template)}
                      >
                        {applying ? <Loader2 size={12} className="spin" /> : null}
                        {strings.save_dates_template_use}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        {hasSelectedSaveDate ? (
        <div className="sdshare">
          <div className="sdmedia">
            {selectedSaveDateTemplate ? (
              <Image
                src={selectedSaveDateTemplate.imageUrl}
                alt={`${selectedSaveDateTemplate.name} save the date card`}
                fill
                sizes="220px"
                quality={90}
                className="object-cover"
                unoptimized
              />
            ) : null}
              <span className="sdbadge">
                <Check size={12} /> {strings.save_dates_card_badge}
              </span>
          </div>

          <div className="sdmain">
            <div className="sdtop">
              <div>
                <h3>{strings.save_dates_share_title}</h3>
                <p>{strings.save_dates_share_description}</p>
              </div>
              <div className="sdactions">
                {selectedSaveDateEditHref ? (
                  <Link href={selectedSaveDateEditHref} className="btn ghost">
                    <Pencil size={14} /> Edit card
                  </Link>
                ) : null}
                <button
                  type="button"
                  className="btn ghost"
                  disabled={pending}
                  onClick={clearSaveDateTemplate}
                >
                  <X size={14} /> Remove
                </button>
                {saveDateShareLink ? (
                  <a href={saveDateShareLink} target="_blank" rel="noopener noreferrer" className="btn ghost">
                    <ExternalLink size={14} /> {strings.save_dates_preview_guest}
                  </a>
                ) : (
                  <button className="btn solid" disabled={pending || !selectedEventId} onClick={enableSaveDateLink}>
                    {pending ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
                    {strings.save_dates_enable_cta}
                  </button>
                )}
              </div>
            </div>

            <div className="sdlinkrow">
              <div className="sdlink">
                {saveDateShareLink
                  ? saveDateShareLink.replace(/^https?:\/\//, '')
                  : strings.link_off_placeholder}
              </div>
              <button className="btn ghost" disabled={!saveDateShareLink} onClick={copySaveDateLink}>
                <Copy size={14} /> {strings.copy}
              </button>
            </div>

            {saveDateShareLink ? (
              <div className="sdsharetools">
                <a href={saveDateWaUrl} target="_blank" rel="noopener noreferrer" className="btn send">
                  <MessageCircle size={15} /> {strings.chip_whatsapp}
                </a>
                <a href={saveDateSmsUrl} className="btn ghost">
                  <Smartphone size={15} /> {strings.chip_sms}
                </a>
                <a href={saveDateEmailUrl} className="btn ghost">
                  <Mail size={15} /> Email
                </a>
                {saveDateQrDataUrl ? (
                  <div className="sdqr">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={saveDateQrDataUrl} alt="QR code for the save the date link" />
                    <span>{strings.save_dates_scan_label}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        ) : null}
        </>
      ) : null}

      {/* Event context — cards/ticket only; the Check-ins tab has its own
          live summary card below. */}
      {sendTab !== 'checkins' && sendTab !== 'saveDates' && sendTab !== 'responses' && sendTab !== 'followups' ? (
      <div className={`ctx${showCardProductionLock ? ' production' : ''}`}>
        <div className="ctxbody">
          {sendTab === 'ticket' ? (
            <div className="ccard ticket">
              {/* This event's own ticket, rendered from its saved details —
                  not a generic sample — so the card always shows what the
                  next send will actually look like. */}
              <Image
                src={ticketPreviewSrc}
                alt={strings.entrance_tag}
                fill
                sizes="112px"
                className="object-cover"
                unoptimized
              />
            </div>
          ) : (
            <div className={`ccard${displayCardImageUrl || displayCardTreatment ? '' : ' noDesign'}`}>
              {displayCardImageUrl ? (
                <>
                  <Image
                    src={displayCardImageUrl}
                    alt={
                      showCardProductionLock
                        ? `${productionOrder?.cardName ?? ''} ${strings.card_sample_badge}`.trim()
                        : `${event.coupleName} invitation card`
                    }
                    fill
                    sizes="92px"
                    quality={90}
                    className="object-cover"
                  />
                  {/* Before release this is the CATALOGUE shot, carrying the
                      sample couple's names and date. Unlabelled it sits where
                      the finished card will later sit, so it reads as "my card
                      is done and the names are wrong". Say what it is. */}
                  {showCardProductionLock ? (
                    <span className="samplestrip">{strings.card_sample_badge}</span>
                  ) : null}
                </>
              ) : displayCardTreatment ? (
                <InvitationVisual treatment={displayCardTreatment} />
              ) : showCardProductionLock ? (
                /* Icon only: the tracker right below already says the card is
                   in production, so repeating it here just doubles up. */
                <div className="ci noDesign passive" aria-label={strings.card_in_production}>
                  <ImagePlus size={20} />
                </div>
              ) : (
                <a href={unassignedOrders.length > 0 ? '#unassigned-orders' : cardDesignHref} className="ci noDesign">
                  <ImagePlus size={20} />
                  <b>{unassignedOrders.length > 0 ? strings.no_design_pick_cta : strings.no_design_cta}</b>
                </a>
              )}
            </div>
          )}
          <div className="cinfo">
            <div className="cinfo-head">
              <h3>{headingName}</h3>
              {isCardSendTab && event.hasPaidOrder && !editingSettings ? (
                <div className="ctxhead">
                  <button className="btn ghost" disabled={pending} onClick={() => setEditingSettings(true)}>
                    <Pencil size={13} /> {strings.settings_edit}
                  </button>
                  <button className="btn ghost" onClick={() => setPreviewOpen(true)}>
                    <Eye size={15} /> {strings.preview_button}
                  </button>
                </div>
              ) : sendTab === 'ticket' ? (
                <div className="ctxhead">
                  {data.event.ticketFields && !ticketForm ? (
                    <button className="btn ghost" disabled={pending} onClick={openTicketEditor}>
                      <Pencil size={13} /> {strings.settings_edit}
                    </button>
                  ) : null}
                  <button
                    className="btn ghost"
                    disabled={!entrancePreviewGuest}
                    onClick={() => setEntrancePreviewOpen(true)}
                  >
                    <Eye size={15} /> {strings.entrance_preview_button}
                  </button>
                </div>
              ) : null}
            </div>
            <div className="row">
              {event.dateLabel ? (
                <span className="mi"><CalendarDays size={14} /> {event.dateLabel}</span>
              ) : null}
              {event.venue ? (
                <span className="mi"><MapPin size={14} /> {event.venue}</span>
              ) : null}
              {sendTab === 'ticket' ? (
                entranceQuota.purchased > 0 ? (
                  <span className="badge">✓ {strings.entrance_purchased}</span>
                ) : null
              ) : (
                <>
                  {/* In production the phase is told once, by the tracker below,
                      so the header carries identity only. */}
                  {!event.hasPaidOrder && showCategoryPill ? (
                    <span className="catpill">{event.eventTypeLabel}</span>
                  ) : null}
                  {event.hasPaidOrder ? (
                    <span className="badge">✓ {strings.card_purchased}</span>
                  ) : null}
                </>
              )}
            </div>

            {/* Pass Ticket tab — the ticket art is portrait, so the info
                column carries the working numbers: clickable sent/not-sent
                stats (they drive the same ticketFilter as the toolbar
                segmented control) and the pass quota, instead of a lonely
                full-width quota box under the card. */}
            {sendTab === 'ticket' ? (
              <>
                <div className="tstats" role="group" aria-label={strings.filter_aria}>
                  <button type="button" className={`tstat${ticketFilter === 'all' ? ' on' : ''}`} aria-pressed={ticketFilter === 'all'} onClick={() => setTicketFilter('all')}>
                    <b>{attendingCount}</b><span>{strings.filter_attending}</span>
                  </button>
                  <button type="button" className={`tstat${ticketFilter === 'sent' ? ' on' : ''}`} aria-pressed={ticketFilter === 'sent'} onClick={() => setTicketFilter('sent')}>
                    <b>{ticketSentCount}</b><span>{strings.entrance_status_sent}</span>
                  </button>
                  <button type="button" className={`tstat${ticketFilter === 'notsent' ? ' on' : ''}`} aria-pressed={ticketFilter === 'notsent'} onClick={() => setTicketFilter('notsent')}>
                    <b>{ticketNotSentCount}</b><span>{strings.entrance_status_notsent}</span>
                  </button>
                </div>
                {entranceQuota.purchased > 0 ? (
                  <div className="equota">
                    <div className="top">
                      <span>{strings.entrance_quota_label}</span>
                      <span>
                        <b>{entranceQuota.used}</b> {fmt(strings.quota_used_suffix, { m: entranceQuota.purchased })} · {fmt(strings.quota_remaining, { n: entranceQuota.remaining })}
                      </span>
                    </div>
                    <div className="bar"><i style={{ width: `${epct}%` }} /></div>
                  </div>
                ) : null}
                {attendingCount === 0 ? (
                  <div className="empty">{strings.empty_attending}</div>
                ) : null}
              </>
            ) : null}

            {isCardSendTab && event.hasPaidOrder ? (
              <>
                <div className="pmeta">
                  {showCategoryPill ? (
                    <span className="catpill">{event.eventTypeLabel}</span>
                  ) : null}
                  {event.cardTier ? (
                    <span className="fact"><i>{strings.fact_package}</i>{event.cardTier}</span>
                  ) : null}
                  {event.cardName ? (
                    <span className="fact"><i>{strings.fact_design}</i>{event.cardName}</span>
                  ) : null}
                  <span className="fact">
                    <i>{strings.fact_invites_paid}</i>
                    {fmt(strings.fact_to_share, { n: quota.purchased })}
                  </span>
                </div>

                {event.addOns.length > 0 ? (
                  <div className="addons">
                    <span className="al">{strings.addons_label}</span>
                    {event.addOns.map((a) => (
                      <span key={a} className="ao">{a}</span>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
            {showCardProductionLock && productionOrder ? (
              <>
                <div className="pmeta">
                  {productionOrder.cardTier ? (
                    <span className="fact"><i>{strings.fact_package}</i>{productionOrder.cardTier}</span>
                  ) : null}
                  {productionOrder.cardName ? (
                    <span className="fact"><i>{strings.fact_design}</i>{productionOrder.cardName}</span>
                  ) : null}
                  {productionOrder.purchasedGuests > 0 ? (
                    <span className="fact">
                      <i>{strings.fact_invites_paid}</i>
                      {fmt(strings.fact_to_share, { n: productionOrder.purchasedGuests })}
                    </span>
                  ) : null}
                </div>
                {productionOrder.addOns.length > 0 ? (
                  <div className="addons">
                    <span className="al">{strings.addons_label}</span>
                    {productionOrder.addOns.map((a) => (
                      <span key={a} className="ao">{a}</span>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          {/* Production tracker — a full-bleed band under the identity block,
              not a second rounded card inside this one. The left column tells
              the couple where the order has got to; the right answers the two
              questions the tracker itself can't ("when do I hear?", "what can
              I do now?") instead of leaving that width empty. */}
          {showCardProductionLock && productionOrder ? (
            <div className="prodlock">
              <div className="prodpanel">
                <div className="prodmain">
                  {/* .prodmain is the two-column grid, so it must have exactly
                      two children: this column, and the aside. Leaving the head,
                      copy and tracker as loose children deals them alternately
                      across both columns. */}
                  <div className="prodcol">
                    <div className="prodpanel-head">
                      <span className="dp"><em />{strings.card_in_production}</span>
                      <b>{strings.card_locked_title}</b>
                    </div>
                    <p>{strings.card_locked_body}</p>
                    {productionOrder.cardImageUrl ? (
                      <p className="note">{strings.card_sample_note}</p>
                    ) : null}
                    <ol className="prodsteps" aria-label={`${strings.card_in_production}: ${productionStatusLabel}`}>
                      {/* State words only where they carry information: the step
                          that is done, the one running, and the single one that
                          comes next. Labelling every future step "Next" told the
                          couple nothing about which was imminent. */}
                      <li className="step done">
                        <span className="mark"><Check size={12} strokeWidth={3.4} /></span>
                        <span className="txt">
                          <b>{strings.card_status_confirmed}</b>
                          <i>{strings.card_step_state_done}</i>
                        </span>
                      </li>
                      <li className={`step ${isDesigningNow ? 'active' : 'locked'}`}>
                        <span className="mark" />
                        <span className="txt">
                          <b>{strings.card_status_designing}</b>
                          <i>{isDesigningNow ? strings.card_step_state_now : strings.card_step_state_next}</i>
                        </span>
                      </li>
                      <li className="step locked">
                        <span className="mark" />
                        <span className="txt">
                          <b>{strings.card_status_released}</b>
                          {isDesigningNow ? <i>{strings.card_step_state_next}</i> : null}
                        </span>
                      </li>
                    </ol>
                  </div>

                  {/* One sentence, one heading, the actions. Two labelled blocks
                      made a short waiting message feel like a form. */}
                  <aside className="prodaside">
                    {/* The clock, kept visibly separate from the phase tracker:
                        this is how far into the promised window we are, not how
                        much of the work is done. */}
                    {productionEta ? (
                      <div className="peta">
                        <span className="pnl">{strings.card_eta_label}</span>
                        <div className={`bar${productionEta.late ? ' late' : ''}`}>
                          <i style={{ width: `${productionEta.pct}%` }} />
                        </div>
                        <span className="etacap">
                          {productionEta.late
                            ? fmt(strings.card_eta_late, { m: productionEta.total })
                            : fmt(strings.card_eta_caption, {
                                n: productionEta.day,
                                m: productionEta.total,
                                date: productionEta.dueLabel,
                              })}
                        </span>
                      </div>
                    ) : null}
                    <p className="reassure">
                      {pendingCardDetails > 0
                        ? strings.card_locked_details_note
                        : strings.card_locked_hear_body}
                    </p>
                    <span className="pnl">{strings.card_locked_meanwhile}</span>
                    <div className="pacts">
                      {/* The couple's own outstanding details are what the
                          designer is actually waiting on, so that outranks the
                          things they could do anyway. */}
                      {pendingCardDetails > 0 ? (
                        <Link href="/my/dashboard/card-details" className="btn pri">
                          <ClipboardCheck size={14} /> {strings.card_locked_details_cta}
                        </Link>
                      ) : null}
                      <Link
                        href="/my/dashboard/guests"
                        className={`btn ${pendingCardDetails > 0 ? 'ghost' : 'pri'}`}
                      >
                        <Users size={14} /> {strings.card_locked_guests_cta}
                      </Link>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => { setSendTab('saveDates'); setSelected(new Set()) }}
                      >
                        <CalendarHeart size={14} /> {strings.card_locked_savedates_cta}
                      </button>
                    </div>
                  </aside>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {isCardSendTab && event.hasPaidOrder ? (
          <div className="ctxsend">
            {editingSettings ? (
              <div className="vars">
                <div className="vlegend">{strings.settings_legend}</div>
                <div className="vgrid two">
                  <label className="vfield">
                    <span>{strings.field_host_label}</span>
                    <input value={hostName} onChange={(e) => setHostName(e.target.value)} maxLength={60} />
                  </label>
                  <CategoryField
                    value={eventCat}
                    onChange={setEventCat}
                    label={strings.field_category_label}
                    otherLabel={strings.field_category_other}
                  />
                </div>
                <div className="vsave">
                  <p className="mutedp">{strings.settings_required_note}</p>
                  <div className="vbtns">
                    {data.sendSettings.confirmed ? (
                      <button
                        className="btn ghost"
                        disabled={pending}
                        title={strings.preview_close}
                        onClick={() => {
                          setHostName(data.sendSettings.hostName)
                          setEventCat(data.sendSettings.eventCategory)
                          setEditingSettings(false)
                        }}
                      ><X size={14} /></button>
                    ) : null}
                    <button className="btn solid" disabled={pending || !settingsValid} onClick={saveSettings}>
                      <Check size={14} /> {strings.save_number}
                    </button>
                  </div>
                </div>
              </div>
            ) : awaitingCount > 0 ? (
              <div className="chips">
                <button className="chip remind" disabled={pending} onClick={remindAwaiting}>
                  <BellRing size={15} />{fmt(strings.remind_awaiting, { n: awaitingCount })}
                </button>
              </div>
            ) : null}
            {!whatsappLive ? (
              <div className="connect">
                <span className="dp">{strings.dryrun_pill}</span>
                <span>{strings.dryrun_note}</span>
              </div>
            ) : null}
          </div>
        ) : sendTab === 'ticket' && ticketForm ? (
          <div className="ctxsend">
            <div className="vars">
              <div className="vlegend">{strings.ticket_legend}</div>
              <div className="vgrid two">
                <label className="vfield">
                  <span>{strings.ticket_field_category}</span>
                  <select
                    value={ticketForm.eventType}
                    onChange={(e) => setTicketForm({ ...ticketForm, eventType: e.target.value })}
                  >
                    {/* A custom free-text type (the "other" flow) isn't in the
                        known map — keep it selectable so opening the editor
                        never silently rewrites it. */}
                    {!(ticketForm.eventType in EVENT_TYPE_LABELS) ? (
                      <option value={ticketForm.eventType}>{ticketForm.eventType}</option>
                    ) : null}
                    {(Object.keys(EVENT_TYPE_LABELS) as EventType[]).map((t) => (
                      <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </label>
                <label className="vfield">
                  <span>{strings.ticket_field_language}</span>
                  <select
                    value={ticketForm.ticketLanguage}
                    onChange={(e) => setTicketForm({ ...ticketForm, ticketLanguage: e.target.value as TicketLanguage })}
                  >
                    <option value="en">{strings.ticket_lang_en}</option>
                    <option value="sw">{strings.ticket_lang_sw}</option>
                  </select>
                </label>
                <label className="vfield">
                  <span>{strings.ticket_field_partner1}</span>
                  <input
                    value={ticketForm.partner1Name}
                    maxLength={60}
                    onChange={(e) => setTicketForm({ ...ticketForm, partner1Name: e.target.value })}
                  />
                </label>
                <label className="vfield">
                  <span>{strings.ticket_field_partner2}</span>
                  <input
                    value={ticketForm.partner2Name}
                    maxLength={60}
                    onChange={(e) => setTicketForm({ ...ticketForm, partner2Name: e.target.value })}
                  />
                </label>
                <label className="vfield">
                  <span>{strings.ticket_field_date}</span>
                  <input
                    type="date"
                    value={ticketForm.startDate}
                    onChange={(e) => setTicketForm({ ...ticketForm, startDate: e.target.value })}
                  />
                </label>
                <label className="vfield">
                  <span>{strings.ticket_field_venue}</span>
                  <input
                    value={ticketForm.venueName}
                    maxLength={80}
                    onChange={(e) => setTicketForm({ ...ticketForm, venueName: e.target.value })}
                  />
                </label>
                <label className="vfield">
                  <span>{strings.ticket_field_city}</span>
                  <input
                    value={ticketForm.city}
                    maxLength={40}
                    onChange={(e) => setTicketForm({ ...ticketForm, city: e.target.value })}
                  />
                </label>
              </div>
              <div className="vsave">
                <p className="mutedp">{strings.ticket_note}</p>
                <div className="vbtns">
                  <button className="btn ghost" title={strings.preview_close} onClick={() => setTicketForm(null)}>
                    <X size={14} />
                  </button>
                  <button className="btn solid" disabled={pending} onClick={saveTicketDetails}>
                    <Check size={14} /> {strings.save_number}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      ) : null}

      {/* Funnel + quota — Digital Cards only; Entrance Pass has its own
       *  quota bar in the event context card above. */}
      {sendTab === 'cards' && event.hasPaidOrder ? (
        <div className="funnel">
          <div className="fc"><div className="fcicon"><Send size={13} /></div><div className="n">{funnel.invited}</div><div className="l">{strings.funnel_invited}</div></div>
          <div className="fc"><div className="fcicon"><CheckCheck size={13} /></div><div className="n">{funnel.delivered}</div><div className="l"><span className="ar">→</span> {strings.funnel_delivered}</div></div>
          <div className="fc"><div className="fcicon"><Eye size={13} /></div><div className="n">{funnel.viewed}</div><div className="l"><span className="ar">→</span> {strings.funnel_viewed}</div></div>
          <div className="fc"><div className="fcicon"><CalendarCheck size={13} /></div><div className="n">{funnel.rsvpd}</div><div className="l"><span className="ar">→</span> {strings.funnel_rsvpd}</div></div>
          <div className="fc quota">
            <div className="top"><span>{strings.quota_label}</span><span><b>{quota.used}</b> {fmt(strings.quota_used_suffix, { m: quota.purchased })}</span></div>
            <div className="bar"><i style={{ width: `${pct}%` }} /></div>
            <div className="ft">{fmt(strings.quota_remaining, { n: quota.remaining })} · <Link href={cardDesignHref}>{strings.quota_topup}</Link></div>
          </div>
        </div>
      ) : null}

      {/* Live Check-ins — a live door summary plus the attending roster, each
          guest flipping to "Arrived" the moment an attendant scans their pass. */}
      {sendTab === 'checkins' ? (
        <div className="checkins">
          <div className="livesum">
            <div className="livetop">
              <div className="livehead">
                <span className={`livedot${checkinConnected ? ' on' : ''}`} />
                <span>{checkinConnected ? strings.checkin_live : strings.checkin_offline}</span>
              </div>
              <div className="livebtns">
                <button className="btn ghost" disabled={reportBusy || attendingCount === 0} onClick={downloadReport}>
                  {reportBusy ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                  {strings.checkin_report_download}
                </button>
                <button className="btn ghost" disabled={reportBusy || attendingCount === 0} onClick={shareReport}>
                  <Share2 size={14} /> {strings.checkin_report_share}
                </button>
              </div>
            </div>
            <div className="livebig">
              {arrivedCount}
              <span> / {attendingCount} {strings.checkin_arrived_suffix}</span>
            </div>
            <div className="bar"><i style={{ width: `${checkinPct}%` }} /></div>
            {liveArrivals.length > 0 ? (
              <div className="livefeed">
                <div className="lfhead">{strings.checkin_just_arrived}</div>
                {liveArrivals.map((a, i) => (
                  <div key={`${a.at}-${i}`} className="lf">
                    <span className="lfname">{fullNameOf(a.name)}</span>
                    <span className="lfmeta">
                      {a.duplicate ? `${strings.checkin_duplicate} · ` : ''}
                      {a.door} · {formatClock(a.at)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="gt">
            <div className="gth">
              <h2>{strings.checkin_roster_title}</h2>
              <input
                className="gsearch"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={strings.search_placeholder}
                aria-label={strings.search_aria}
              />
              <div className="acts">
                <div className="seg" role="tablist" aria-label={strings.filter_aria}>
                  <button className={`sg ${checkinFilter === 'all' ? 'on' : ''}`} onClick={() => setCheckinFilter('all')}>
                    {strings.filter_all}{attendingCount ? ` ${attendingCount}` : ''}
                  </button>
                  <button className={`sg ${checkinFilter === 'arrived' ? 'on' : ''}`} onClick={() => setCheckinFilter('arrived')}>
                    <CalendarCheck size={12} /> {strings.checkin_filter_arrived}{arrivedCount ? ` ${arrivedCount}` : ''}
                  </button>
                  <button className={`sg ${checkinFilter === 'pending' ? 'on' : ''}`} onClick={() => setCheckinFilter('pending')}>
                    {strings.checkin_filter_pending}{attendingCount - arrivedCount ? ` ${attendingCount - arrivedCount}` : ''}
                  </button>
                </div>
              </div>
            </div>
            {visibleCheckins.length === 0 ? (
              <div className="empty">
                {attendingCount === 0
                  ? strings.checkin_empty_none
                  : search.trim()
                    ? strings.empty_search
                    : checkinFilter === 'arrived'
                      ? strings.checkin_empty_arrived
                      : checkinFilter === 'pending'
                        ? strings.checkin_empty_pending
                        : strings.checkin_empty_arrived}
              </div>
            ) : (
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{strings.th_guest}</th>
                      <th>{strings.th_ticket}</th>
                      <th>{strings.checkin_th_table}</th>
                      <th>{strings.checkin_th_door}</th>
                      <th>{strings.checkin_th_attendant}</th>
                      <th style={{ textAlign: 'right' }}>{strings.checkin_th_arrived}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCheckins.map((g) => {
                      const seats = g.checkedInPartySize ?? g.rsvpPartySize ?? g.assignedPartySize
                      return (
                        <tr key={g.id} className={g.checkedInAt ? 'arrived' : ''}>
                          <td className="who">{g.name}</td>
                          <td>
                            <span className="ppill">{seats >= 2 ? strings.party_double : strings.party_single}</span>
                          </td>
                          <td>
                            {g.tableName ? (
                              <span className="seatpill">{g.tableName}</span>
                            ) : (
                              <span className="noseat">{strings.checkin_no_table}</span>
                            )}
                          </td>
                          <td className="contact">{g.checkedInAt ? (g.checkedInDoor ?? '—') : '—'}</td>
                          <td className="contact">{g.checkedInAt ? (g.checkedInBy ?? '—') : '—'}</td>
                          <td style={{ textAlign: 'right' }}>
                            {g.checkedInAt ? (
                              <span className="status s-yes"><Check size={12} /> {formatClock(g.checkedInAt)}</span>
                            ) : (
                              <span className="status s-none">{strings.checkin_not_arrived}</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Guest table — save-the-dates/cards/ticket only. */}
      {sendTab !== 'checkins' && sendTab !== 'responses' && sendTab !== 'followups' && (sendTab !== 'saveDates' || hasSelectedSaveDate) && (sendTab !== 'cards' || event.hasPaidOrder) ? (
      <div className="gt">
        {sendTab === 'saveDates' ? (
          <div className="sdguesthead">
            <h3>{strings.save_dates_send_title}</h3>
            <p>{strings.save_dates_send_desc}</p>
          </div>
        ) : null}
        <div className="gth">
          <input
            type="checkbox"
            className="ck"
            checked={visible.length > 0 && selected.size === visible.length}
            onChange={(e) => toggleSelectAll(e.target.checked)}
          />
          <h2>{strings.guest_list}</h2>
          <input
            className="gsearch"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={strings.search_placeholder}
            aria-label={strings.search_aria}
          />
          <div className="acts">
            {isCardSendTab ? (
              <div className="seg" role="tablist" aria-label={strings.filter_aria}>
                <button className={`sg ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
                  {strings.filter_all}
                </button>
                <button className={`sg ${filter === 'notsent' ? 'on' : ''}`} onClick={() => setFilter('notsent')}>
                  {strings.filter_notsent}{notSentCount ? ` ${notSentCount}` : ''}
                </button>
                <button className={`sg ${filter === 'awaiting' ? 'on' : ''}`} onClick={() => setFilter('awaiting')}>
                  {strings.filter_awaiting}{awaitingCount ? ` ${awaitingCount}` : ''}
                </button>
              </div>
            ) : (
              <div className="seg" role="tablist" aria-label={strings.filter_aria}>
                <button className={`sg ${ticketFilter === 'all' ? 'on' : ''}`} onClick={() => setTicketFilter('all')}>
                  <Ticket size={12} /> {strings.filter_attending}{attendingCount ? ` ${attendingCount}` : ''}
                </button>
                <button className={`sg ${ticketFilter === 'notsent' ? 'on' : ''}`} onClick={() => setTicketFilter('notsent')}>
                  {strings.filter_notsent}{ticketNotSentCount ? ` ${ticketNotSentCount}` : ''}
                </button>
                <button className={`sg ${ticketFilter === 'sent' ? 'on' : ''}`} onClick={() => setTicketFilter('sent')}>
                  {strings.entrance_status_sent}{ticketSentCount ? ` ${ticketSentCount}` : ''}
                </button>
              </div>
            )}
            {selected.size > 0 ? <span className="selcnt">{fmt(strings.selected_count, { n: selected.size })}</span> : null}
            {selected.size > 0 ? (
              <button className="btn ghost danger" disabled={pending} onClick={() => setConfirmBulkDelete(true)}>
                <Trash2 size={14} /> {strings.bulk_delete}
              </button>
            ) : null}
            <button className="btn ghost" disabled={pending} onClick={() => setNewGuest({ name: '', phone: '' })}>
              <Plus size={14} /> {strings.add_guest}
            </button>
            <button
              className="btn send"
              disabled={pending || selected.size === 0}
              onClick={() => (effectiveFilter === 'attending' ? stageEntranceSend([...selected]) : stageBulkSend([...selected]))}
            >
              {effectiveFilter === 'attending' ? strings.send_entrance_to_selected : strings.send_to_selected} <ArrowRight size={15} />
            </button>
          </div>
        </div>
        {visible.length === 0 && !newGuest ? (
          <div className="empty">
            {search.trim()
              ? strings.empty_search
              : effectiveFilter === 'notsent'
                ? strings.empty_notsent
                : effectiveFilter === 'awaiting'
                  ? strings.empty_awaiting
                  : effectiveFilter === 'attending'
                    ? strings.empty_attending
                    : strings.empty_none}
          </div>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 30 }}></th><th>{strings.th_guest}</th><th>{strings.th_contact}</th>
                  {sendTab !== 'saveDates' ? <th>{strings.th_ticket}</th> : null}
                  <th>{strings.th_channel}</th><th>{strings.th_status}</th><th style={{ textAlign: 'right' }}>{strings.th_send}</th>
                </tr>
              </thead>
              <tbody>
                {newGuest ? (
                  <tr>
                    <td></td>
                    <td className="who">
                      <input
                        className="einp"
                        autoFocus
                        placeholder={strings.th_guest}
                        value={newGuest.name}
                        onChange={(e) => setNewGuest({ ...newGuest, name: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') addGuest(); if (e.key === 'Escape') setNewGuest(null) }}
                      />
                    </td>
                    <td className="contact">
                      <input
                        className="einp"
                        placeholder={strings.test_placeholder}
                        value={newGuest.phone}
                        onChange={(e) => setNewGuest({ ...newGuest, phone: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') addGuest(); if (e.key === 'Escape') setNewGuest(null) }}
                        inputMode="tel"
                      />
                    </td>
                    <td colSpan={sendTab === 'saveDates' ? 2 : 3}></td>
                    <td>
                      <div className="ra">
                        <button className="ia send" disabled={pending || !newGuest.name.trim()} onClick={addGuest}>
                          <Check size={14} /> {strings.save_number}
                        </button>
                        <button className="ia" disabled={pending} onClick={() => setNewGuest(null)} title={strings.preview_close}><X size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ) : null}
                {visible.map((g) =>
                  rowEdit?.id === g.id ? (
                    <tr key={g.id}>
                      <td></td>
                      <td className="who">
                        <input
                          className="einp"
                          autoFocus
                          value={rowEdit.name}
                          onChange={(e) => setRowEdit({ ...rowEdit, name: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveRowEdit(); if (e.key === 'Escape') setRowEdit(null) }}
                        />
                      </td>
                      <td className="contact">
                        <input
                          className="einp"
                          placeholder={strings.test_placeholder}
                          value={rowEdit.phone}
                          onChange={(e) => setRowEdit({ ...rowEdit, phone: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveRowEdit(); if (e.key === 'Escape') setRowEdit(null) }}
                          inputMode="tel"
                        />
                      </td>
                      <td colSpan={sendTab === 'saveDates' ? 2 : 3}></td>
                      <td>
                        <div className="ra">
                          <button className="ia send" disabled={pending} onClick={saveRowEdit}>
                            <Check size={14} /> {strings.save_number}
                          </button>
                          <button
                            className="ia danger"
                            disabled={pending}
                            title={strings.row_delete}
                            onClick={() => (rowEdit.askDelete ? removeGuest() : setRowEdit({ ...rowEdit, askDelete: true }))}
                          >
                            <Trash2 size={14} />
                            {rowEdit.askDelete ? strings.row_delete_confirm : null}
                          </button>
                          <button className="ia" disabled={pending} onClick={() => setRowEdit(null)} title={strings.preview_close}><X size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                  <tr key={g.id}>
                    <td><input type="checkbox" className="ck" checked={selected.has(g.id)} onChange={() => toggleSelect(g.id)} /></td>
                    <td className="who">{g.name}</td>
                    <td className="contact">
                      {g.phone ?? g.whatsappPhone ?? (
                        phoneEdit?.id === g.id ? (
                          <span className="pedit">
                            <input
                              autoFocus
                              value={phoneEdit.value}
                              onChange={(e) => setPhoneEdit({ id: g.id, value: e.target.value })}
                              onKeyDown={(e) => { if (e.key === 'Enter') savePhone(); if (e.key === 'Escape') setPhoneEdit(null) }}
                              placeholder={strings.test_placeholder}
                            />
                            <button className="mini-btn" disabled={pending} onClick={savePhone}>{strings.save_number}</button>
                            <button className="mini-btn ghost" onClick={() => setPhoneEdit(null)} aria-label={strings.preview_close}><X size={12} /></button>
                          </span>
                        ) : (
                          <button className="addnum" onClick={() => setPhoneEdit({ id: g.id, value: '' })}>
                            <Plus size={12} /> {strings.add_number}
                          </button>
                        )
                      )}
                    </td>
                    {sendTab !== 'saveDates' ? (
                      <td>
                        <span className="ppill">
                          {(sendTab === 'ticket' ? (g.rsvpPartySize ?? g.assignedPartySize) : g.assignedPartySize) >= 2
                            ? strings.party_double
                            : strings.party_single}
                        </span>
                      </td>
                    ) : null}
                    <td style={{ position: 'relative' }}>
                      {(() => {
                          const channel = effectiveChannel(g)
                          return (
                            <div data-channel-menu style={{ position: 'relative', display: 'inline-block' }}>
                              <button
                                type="button"
                                className={`pillselect pill-${channel}`}
                                onClick={() => setChannelMenuOpenId((id) => (id === g.id ? null : g.id))}
                                aria-haspopup="listbox"
                                aria-expanded={channelMenuOpenId === g.id}
                                aria-label={`${strings.row_whatsapp} / ${strings.row_sms}`}
                              >
                                {channel === 'whatsapp' ? <MessageCircle size={13} /> : <Smartphone size={13} />}
                                {channel === 'whatsapp' ? strings.channel_whatsapp : strings.channel_sms}
                              </button>
                              {channelMenuOpenId === g.id ? (
                                <div className="chmenu" role="listbox">
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected={channel === 'whatsapp'}
                                    disabled={!hasPhone(g)}
                                    className={`chmenu-item ${channel === 'whatsapp' ? 'active' : ''}`}
                                    onClick={() => {
                                      setChannelChoice((prev) => ({ ...prev, [g.id]: 'whatsapp' }))
                                      setChannelMenuOpenId(null)
                                    }}
                                  >
                                    <MessageCircle size={13} /> {strings.channel_whatsapp}
                                  </button>
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected={channel === 'sms'}
                                    disabled={!hasPhone(g)}
                                    className={`chmenu-item ${channel === 'sms' ? 'active' : ''}`}
                                    onClick={() => {
                                      setChannelChoice((prev) => ({ ...prev, [g.id]: 'sms' }))
                                      setChannelMenuOpenId(null)
                                    }}
                                  >
                                    <Smartphone size={13} /> {strings.channel_sms}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          )
                      })()}
                    </td>
                    <td>
                      {sendTab === 'ticket' ? (
                        <span className={`status ${ticketSent(g) ? 's-yes' : 's-none'}`}>
                          {ticketSent(g) ? strings.entrance_status_sent : strings.entrance_status_notsent}
                        </span>
                      ) : (
                        <span className={`status ${STATUS_CLASS[g.status]}`}>{g.statusLabel}</span>
                      )}
                    </td>
                    <td>
                      <div className="ra">
                        {effectiveFilter === 'attending' ? (() => {
                          // Entrance passes are WhatsApp-only (template + QR
                          // image) — there is no SMS equivalent. If the
                          // guest's resolved channel isn't WhatsApp, don't
                          // silently fall through to the generic SMS
                          // reminder flow (rowShare): that opens an unrelated
                          // compose window and never sends a ticket, with no
                          // feedback since these guests are already
                          // 'attending' (isAwaiting is false).
                          const passUnavailable = effectiveChannel(g) !== 'whatsapp'
                          return (
                            <button
                              className="ia send pass"
                              disabled={pending || !hasPhone(g) || passUnavailable}
                              title={passUnavailable ? strings.entrance_needs_whatsapp : strings.row_send_pass}
                              onClick={() => {
                                if (passUnavailable) {
                                  toast.error(strings.entrance_needs_whatsapp)
                                  return
                                }
                                sendPassRow(g)
                              }}
                            >
                              {sendingRow === g.id ? (
                                <Loader2 size={14} className="spin" />
                              ) : (
                                <Ticket size={14} />
                              )}
                              {strings.row_send_pass}
                            </button>
                          )
                        })() : (
                          <button
                            className="ia send"
                            disabled={pending || !hasPhone(g)}
                            title={effectiveChannel(g) === 'whatsapp' ? strings.row_whatsapp : strings.row_sms}
                            onClick={() => rowShare(g, effectiveChannel(g))}
                          >
                            {sendingRow === g.id ? (
                              <Loader2 size={14} className="spin" />
                            ) : g.status === 'none' ? (
                              <Send size={13} />
                            ) : (
                              <RotateCcw size={13} />
                            )}
                            {g.status === 'none' ? strings.row_send : strings.row_resend}
                          </button>
                        )}
                        <button className="ia" disabled={pending} title={strings.row_copy} onClick={() => rowShare(g, 'copy')}><Copy size={15} /></button>
                        <button
                          className="ia"
                          disabled={pending}
                          title={strings.row_edit}
                          onClick={() => setRowEdit({ id: g.id, name: g.name, phone: g.phone ?? g.whatsappPhone ?? '', askDelete: false })}
                        ><Pencil size={14} /></button>
                      </div>
                    </td>
                  </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      ) : null}

      {/* Bulk-send confirm — the couple must approve {{2}}/{{3}} to send */}
      {confirmSend ? (
        <div className="ovl" onClick={() => setConfirmSend(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{strings.confirm_title}</h3>
            <p className="big">{fmt(strings.confirm_recipients, { n: confirmSend.recipients })}</p>
            {confirmSend.credits > 0 ? (
              <p className="mutedp">{fmt(strings.confirm_credits, { n: confirmSend.credits, m: quota.remaining })}</p>
            ) : null}
            <div className="vars">
              <div className="vlegend">{strings.settings_legend}</div>
              <label className="vfield">
                <span>{strings.field_host_label}</span>
                <input value={hostName} onChange={(e) => setHostName(e.target.value)} maxLength={60} />
              </label>
              <CategoryField
                value={eventCat}
                onChange={setEventCat}
                label={strings.field_category_label}
                otherLabel={strings.field_category_other}
              />
              <p className="mutedp">{strings.settings_required_note}</p>
            </div>
            <div className="mrow">
              <button className="btn ghost" onClick={() => setConfirmSend(null)}>{strings.confirm_cancel}</button>
              <button
                className="btn send"
                disabled={pending || !settingsValid}
                onClick={() => runBulkSend(confirmSend.ids, confirmSend.reminder)}
              >
                <MessageCircle size={15} /> {strings.confirm_confirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Entrance-pass confirm — simpler than the invite dialog: the ticket's
          copy is generated server-side, nothing to approve, no credit cost. */}
      {confirmEntranceSend && !entrancePreviewOpen ? (
        <div className="ovl" onClick={() => setConfirmEntranceSend(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{strings.confirm_entrance_title}</h3>
            <p className="big">{fmt(strings.confirm_entrance_body, { n: confirmEntranceSend.recipients })}</p>
            <div className="mrow">
              <button className="btn ghost" onClick={() => setConfirmEntranceSend(null)}>{strings.confirm_cancel}</button>
              {entrancePreviewGuest ? (
                <button className="btn ghost" onClick={() => setEntrancePreviewOpen(true)}>
                  <Eye size={14} /> {strings.entrance_preview_button}
                </button>
              ) : null}
              <button className="btn send" disabled={pending} onClick={runEntranceSend}>
                <Ticket size={15} /> {strings.confirm_confirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Entrance-pass ticket + message preview — a real attending guest's
          actual ticket image (with their real check-in QR) and the exact
          WhatsApp text, so the couple can verify before sending in bulk. */}
      {entrancePreviewOpen && entrancePreviewGuest ? (
        <div className="ovl" onClick={() => setEntrancePreviewOpen(false)}>
          <div className="modal wide" data-lenis-prevent onClick={(e) => e.stopPropagation()}>
            <div className="mhead">
              <h3>{strings.entrance_preview_title}</h3>
              <button className="xbtn" onClick={() => setEntrancePreviewOpen(false)} aria-label={strings.preview_close}><X size={16} /></button>
            </div>
            <p className="mutedp">{strings.entrance_preview_note}</p>
            <div className="wawrap">
              <div className="wabubble">
                <Image
                  src={entrancePreviewGuest.entrancePassUrl}
                  alt=""
                  width={650}
                  height={940}
                  className="waimgfull"
                  unoptimized
                />
                <div className="wabody">{waText(entrancePreviewBody)}</div>
                <div className="wafoot">{ENTRANCE_PASS_TEMPLATE.footer}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Bulk-delete confirm */}
      {confirmBulkDelete ? (
        <div className="ovl" onClick={() => setConfirmBulkDelete(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{strings.bulk_delete_title}</h3>
            <p className="big">{fmt(strings.bulk_delete_body, { n: selected.size })}</p>
            <div className="mrow">
              <button className="btn ghost" onClick={() => setConfirmBulkDelete(false)}>{strings.confirm_cancel}</button>
              <button className="btn dangerfill" disabled={pending} onClick={runBulkDelete}>
                <Trash2 size={14} /> {strings.bulk_delete_confirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Invite preview + test send */}
      {previewOpen ? (
        <div className="ovl" onClick={() => setPreviewOpen(false)}>
          <div className="modal wide" data-lenis-prevent onClick={(e) => e.stopPropagation()}>
            <div className="mhead">
              <h3>{strings.preview_title}</h3>
              <button className="xbtn" onClick={() => setPreviewOpen(false)} aria-label={strings.preview_close}><X size={16} /></button>
            </div>
            <p className="mutedp">{strings.preview_note}</p>
            <div className="pgrid">
              <div>
                <div className="vars">
                  <div className="vlegend">{strings.settings_legend}</div>
                  <div className="vgrid">
                    <label className="vfield">
                      <span>{strings.field_guest_label}</span>
                      <input value={sampleGuest} onChange={(e) => setSampleGuest(e.target.value)} maxLength={40} />
                    </label>
                    <label className="vfield">
                      <span>{strings.field_host_label}</span>
                      <input value={hostName} onChange={(e) => setHostName(e.target.value)} maxLength={60} />
                    </label>
                    <CategoryField
                      value={eventCat}
                      onChange={setEventCat}
                      label={strings.field_category_label}
                      otherLabel={strings.field_category_other}
                    />
                  </div>
                  <p className="mutedp">{strings.settings_required_note}</p>
                </div>
                <div className="testrow">
                  <label htmlFor="si-test-phone">{strings.test_label}</label>
                  <div className="trow">
                    <input
                      id="si-test-phone"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      placeholder={strings.test_placeholder}
                      inputMode="tel"
                    />
                    <button className="btn solid" disabled={testSending || !testPhone.trim() || !event.hasPaidOrder} onClick={sendTest}>
                      {testSending ? <Loader2 size={14} className="spin" /> : <MessageCircle size={14} />} {strings.test_send}
                    </button>
                  </div>
                </div>
              </div>
              <div className="wawrap">
                <div className="wabubble">
                  {event.cardImageUrl ? (
                    <Image
                      src={event.cardImageUrl}
                      alt=""
                      width={760}
                      height={1064}
                      className="waimgfull"
                      unoptimized
                    />
                  ) : (
                    <div className="waimg">
                      <div className="waimg-ph"><b>{event.coupleName}</b></div>
                    </div>
                  )}
                  <div className="wabody">{waText(previewBody)}</div>
                  <div className="wafoot">{INVITE_TEMPLATE.footer}</div>
                  {INVITE_TEMPLATE.buttons.map((b) => (
                    <div key={b.index} className="wabtn">↩ {b.label}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Send report drawer */}
      {report ? (
        <div className="ovl right" onClick={() => setReport(null)}>
          <div className="drawer" data-lenis-prevent onClick={(e) => e.stopPropagation()}>
            <div className="mhead">
              <h3>{strings.results_title}</h3>
              <button className="xbtn" onClick={() => setReport(null)} aria-label={strings.results_close}><X size={16} /></button>
            </div>
            <div className="dsum">
              <span className="ds ok">{report.sent} {strings.results_sent}</span>
              {report.failed > 0 ? <span className="ds bad">{report.failed} {strings.results_failed}</span> : null}
              {report.skipped > 0 ? <span className="ds warn">{report.skipped} {strings.results_skipped}</span> : null}
              {report.blocked > 0 ? <span className="ds warn">{report.blocked} {strings.results_blocked}</span> : null}
            </div>
            <div className="dlist">
              {reportGroups.map(({ label, outcome }) => {
                const rows = report.results.filter((r) => r.outcome === outcome)
                if (rows.length === 0) return null
                return (
                  <div key={outcome} className="dgroup">
                    <div className={`dglabel ${outcome}`}>{label}</div>
                    {rows.map((r) => (
                      <div key={r.id} className="drow">
                        <span className="dname">{r.name}</span>
                        {r.outcome === 'sent' && r.resend ? <span className="dtag">{strings.results_resend_tag}</span> : null}
                        {r.error ? <span className="derr">{r.error}</span> : null}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
            <div className="mrow">
              {report.failed > 0 ? (
                <button className="btn ghost" disabled={pending} onClick={retryFailed}>
                  <RotateCcw size={14} /> {strings.results_retry}
                </button>
              ) : null}
              <button className="btn pri" onClick={() => setReport(null)}>{strings.results_close}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const css = `
.si{ --purple:#6B3FA0; --purple-d:#4A2870; --lav:#D7BDE8; --lav-btn:#DCC3EC; --lav-soft:#F6EEFB;
  --ink:#1c1b1f; --muted:#8b8790; --faint:#b6b2ba; --line:#ededf0; --hover:#faf8fc;
  --wa:#25D366; --sms:#3478F6; --amber-bg:#FFFBEB; --amber-bd:#FBE8B0; --amber-tx:#8a6d1a;
  --ok-bg:#EAF6EF; --ok-tx:#2E7D55; --bad-bg:#fcecec; --bad-tx:#c0392b;
  --green:#9FE870; --green-tx:#3f6b1f;
  --radius:16px; --soft:0 1px 2px rgba(20,18,30,.05);
  color:var(--ink); }
/* Headings use the dashboard's default sans (like Overview, Guests, Pledges),
   not this view's own Cormorant serif — keep the send console consistent with
   the rest of the dashboard. The .serif class stays for any deliberate accent. */
.si .serif{ font-family:var(--font-cormorant),Georgia,serif; }
.si h1{ font-weight:700; font-size:30px; letter-spacing:-.3px; }
.si .head{ display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; }
.si .headcopy{ min-width:0; flex:1; }
.si .subrow{ display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-top:6px; }
.si .subrow .sub{ min-width:240px; flex:1; margin-top:0; }
.si .headpicker{ margin-left:auto; }
@media (min-width:1024px){
  .si .subrow{ width:calc(100% + 15rem); }
}
.si .evswitch{ display:flex; align-items:center; gap:8px; margin-left:auto; font-size:12px; font-weight:600; color:var(--muted); }
.si .selwrap{ position:relative; display:inline-flex; align-items:center; }
.si .evswitch select{ appearance:none; border:1px solid var(--line); border-radius:10px; padding:8px 34px 8px 12px;
  font-size:13px; font-weight:600; color:var(--ink); background:#fff; max-width:240px; }
.si .evswitch select:focus{ outline:none; border-color:var(--lav); }
.si .selchev{ position:absolute; right:12px; top:50%; transform:translateY(-50%); color:var(--faint); pointer-events:none; }
.si .unassigned{ margin-top:18px; padding:14px 16px; border:1px solid var(--amber-bd); background:var(--amber-bg);
  border-radius:var(--radius); }
.si .uhead{ display:flex; align-items:center; gap:10px; font-size:12.5px; color:var(--amber-tx); flex-wrap:wrap; }
.si .uhead .dp{ background:var(--amber-bd); color:var(--amber-tx); font-size:10.5px; font-weight:700; padding:3px 9px; border-radius:999px; flex:none; }
.si .ulist{ display:flex; flex-direction:column; gap:8px; margin-top:12px; }
.si .urow{ display:flex; align-items:center; gap:10px; background:#fff; border:1px solid var(--amber-bd);
  border-radius:12px; padding:8px 10px; flex-wrap:wrap; }
.si .uimg{ position:relative; width:36px; height:48px; flex:none; border-radius:6px; overflow:hidden; }
.si .uname{ font-weight:600; font-size:13px; color:var(--ink); }
.si .uguests{ font-size:12px; color:var(--muted); }
.si .urow .btn{ margin-left:auto; }
.si .sub{ color:var(--muted); font-size:14px; margin-top:6px; max-width:640px; line-height:1.5; }
.si .btn{ border:none; border-radius:999px; font-weight:600; font-size:13.5px; padding:9px 16px; cursor:pointer;
  display:inline-flex; align-items:center; gap:7px; transition:filter .12s, transform .08s; }
.si .btn:hover{ filter:brightness(.97); transform:translateY(-1px); }
.si .btn:disabled{ opacity:.5; cursor:not-allowed; transform:none; }
.si .btn.pri{ background:var(--lav-btn); color:var(--purple-d); box-shadow:var(--soft); }
.si .btn.lg{ padding:11px 20px; font-size:14px; background:var(--purple); color:#fff; }
/* Every actual "send now" button — invites, entrance passes, confirm-modal
   sends — uses this one consistent green, regardless of which tab/context
   it's in, instead of tab-colored. */
.si .btn.send{ background:var(--wa); color:#fff; box-shadow:var(--soft); }
.si .btn.send:hover{ filter:brightness(1.06); background:var(--wa); }
.si .btn.ghost{ background:#fff; color:var(--ink); border:1px solid var(--line); }
.si .btn.solid{ background:var(--purple); color:#fff; box-shadow:var(--soft); }
.si .btn.ghost.danger{ color:var(--bad-tx); border-color:#f2c9c9; }
.si .btn.ghost.danger:hover{ background:var(--bad-bg); }
.si .btn.dangerfill{ background:var(--bad-tx); color:#fff; }
.si .spin{ animation:si-spin .8s linear infinite; }
@keyframes si-spin{ to{ transform:rotate(360deg); } }
.si .ctx{ position:relative; background:#fff; border:1px solid var(--line); border-radius:20px;
  padding:22px; margin:22px 0 18px; box-shadow:var(--soft); }
.si .ctx.production{ padding:24px 26px; }
.si .ctxhead{ display:flex; gap:8px; flex-wrap:wrap; }
.si .ctxbody{ display:flex; gap:20px; align-items:center; flex-wrap:wrap; }
/* Production state: the art and the identity sit side by side at the top,
   the tracker spans both columns underneath. Top-aligned, so a short info
   column never leaves the card art floating in the middle of dead space. */
.si .ctx.production .ctxbody{ display:grid; grid-template-columns:132px minmax(0,1fr);
  align-items:start; gap:20px 26px; }
.si .cinfo-head{ display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.si .ccard{ width:92px; height:122px; flex:none; border-radius:14px; position:relative; overflow:hidden;
  background:linear-gradient(155deg,var(--purple),var(--lav)); box-shadow:0 4px 14px rgba(107,63,160,.22); }
/* 5:7 — the canonical card proportion, so the art is shown as designed. */
.si .ctx.production .ccard{ width:132px; height:185px; border-radius:14px; box-shadow:0 8px 22px rgba(28,27,31,.16); }
.si .ccard.noDesign{ background:linear-gradient(155deg,var(--lav-soft),#fff); border:1.5px dashed var(--lav); box-shadow:none; }
.si .ccard.ticket{ width:112px; height:162px; border-radius:8px; background:transparent; box-shadow:0 4px 14px rgba(92,45,141,.25); }
.si .ccard .ci{ position:absolute; inset:0; display:flex; flex-direction:column; align-items:center;
  justify-content:center; gap:5px; text-align:center; color:#fff; padding:8px; }
.si .ccard .ci b{ font-size:13px; line-height:1.25; }
.si .ccard .ci span{ font-size:7px; letter-spacing:1.2px; opacity:.85; }
.si .ccard .ci.noDesign{ text-decoration:none; cursor:pointer; color:var(--purple-d); gap:7px; }
.si .ccard .ci.noDesign.passive{ cursor:default; text-decoration:none; }
.si .ccard .ci.noDesign svg{ width:20px; height:20px; opacity:.7; }
.si .ccard .ci.noDesign span{ opacity:.7; }
.si .ccard .ci.noDesign b{ font-size:11.5px; line-height:1.3; text-decoration:underline; }
.si .ccard .ci.noDesign.passive b{ text-decoration:none; }
.si .ctx h3{ font-size:19px; font-weight:600; }
.si .ctx .row{ display:flex; gap:8px 14px; color:var(--muted); font-size:13px; margin-top:7px; flex-wrap:wrap; align-items:center; }
.si .ctx .row .mi{ display:inline-flex; align-items:center; gap:6px; }
.si .ctx .row .mi svg{ color:var(--faint); flex:none; }
.si .sdtemplates{ margin:22px 0 18px; padding:18px 20px; background:#fff; border:1px solid var(--line);
  border-radius:20px; box-shadow:var(--soft); }
.si .sdtemplates h3{ font-size:16px; font-weight:700; color:var(--ink); }
.si .sdtemplates p{ margin-top:5px; color:var(--muted); font-size:13px; line-height:1.45; }
.si .sdtrail{ display:flex; gap:10px; margin-top:14px; padding-bottom:4px; overflow-x:auto; }
.si .sdtile{ position:relative; width:210px; flex:0 0 210px; padding:8px; border:1px solid var(--line);
  border-radius:14px; background:#fff; transition:border-color .14s ease, background .14s ease; }
.si .sdtile.applied{ border-color:var(--green); background:#F2FFE8; }
.si .sdthumb{ position:relative; aspect-ratio:5/7; overflow:hidden; border-radius:9px; background:var(--lav-soft); }
.si .sdcheck{ position:absolute; top:10px; right:10px; width:24px; height:24px; border-radius:999px; display:grid; place-items:center;
  background:var(--green); color:var(--green-tx); box-shadow:0 2px 8px rgba(35,50,20,.12); }
.si .sdname{ margin-top:7px; min-height:30px; color:var(--ink); font-size:11.5px; font-weight:700; line-height:1.25; }
.si .templatebtn{ margin-top:7px; min-height:28px; width:100%; display:inline-flex; align-items:center; justify-content:center; gap:5px;
  border:none; border-radius:999px; background:var(--lav-btn); color:var(--ink); font-size:11px; font-weight:700; text-decoration:none; cursor:pointer; }
.si .templatebtn.applied{ background:#E8FCDC; color:var(--green-tx); cursor:default; }
.si .sdshare{ display:flex; margin:22px 0 24px; overflow:hidden; background:#fff; border:1px solid var(--line);
  border-radius:20px; box-shadow:var(--soft); }
.si .sdmedia{ position:relative; width:220px; min-height:308px; flex:none; overflow:hidden; background:linear-gradient(155deg,var(--purple),var(--lav)); }
.si .sdmedia.noDesign{ background:linear-gradient(155deg,var(--lav-soft),#fff); border-right:1px dashed var(--lav); }
.si .sdempty{ position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px;
  padding:18px; text-align:center; color:var(--purple-d); text-decoration:none; }
.si .sdempty b{ font-size:13px; line-height:1.3; text-decoration:underline; }
.si .sdbadge{ position:absolute; left:10px; top:10px; display:inline-flex; align-items:center; gap:5px; border-radius:999px;
  background:rgba(255,255,255,.95); padding:4px 9px; color:var(--green-tx); font-size:10.5px; font-weight:700; box-shadow:var(--soft); }
.si .sdmain{ min-width:0; flex:1; padding:22px; display:flex; flex-direction:column; gap:16px; }
.si .sdtop{ display:flex; align-items:flex-start; justify-content:space-between; gap:14px; flex-wrap:wrap; }
.si .sdtop h3{ font-size:19px; font-weight:600; color:var(--ink); }
.si .sdtop p{ margin-top:5px; max-width:620px; color:var(--muted); font-size:13.5px; line-height:1.5; }
.si .sdactions{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.si .sdlinkrow{ display:flex; align-items:center; gap:9px; }
.si .sdlink{ min-width:0; flex:1; border:1px solid var(--line); border-radius:12px; background:#fff; padding:10px 12px;
  color:var(--muted); font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.si .sdsharetools{ display:flex; align-items:center; gap:9px; flex-wrap:wrap; }
.si .sdqr{ margin-left:auto; display:flex; align-items:center; gap:10px; border:1px solid var(--line); border-radius:14px;
  background:var(--hover); padding:10px; color:var(--ink); font-size:12px; font-weight:600; }
.si .sdqr img{ width:64px; height:64px; flex:none; }
.si .badge, .si .catpill{ display:inline-flex; align-items:center; gap:5px; background:var(--green); color:var(--green-tx);
  font-size:11.5px; font-weight:700; padding:4px 11px; border-radius:999px; }
.si .badge.pending{ background:var(--amber-bg); color:var(--amber-tx); border:1px solid var(--amber-bd); }
.si .cinfo{ min-width:0; flex:1; }
.si .pmeta{ display:flex; flex-wrap:wrap; align-items:center; gap:9px 24px; margin-top:12px; }
/* Even columns under a hairline, so the order facts read as one spec strip
   the full width of the card rather than three pills huddled on the left. */
.si .ctx.production .pmeta{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
  align-items:start; gap:14px 24px; margin-top:16px; padding-top:14px; border-top:1px solid var(--line); }
.si .pmeta .fact{ display:inline-flex; flex-direction:column; gap:2px; font-size:13.5px; font-weight:600; color:var(--ink); }
.si .pmeta .fact i{ font-style:normal; font-size:9.5px; font-weight:600; letter-spacing:.6px; text-transform:uppercase; color:var(--faint); }
.si .addons{ display:flex; flex-wrap:wrap; align-items:center; gap:7px; margin-top:12px; }
.si .addons .al{ font-size:9.5px; font-weight:600; letter-spacing:.6px; text-transform:uppercase; color:var(--faint); }
.si .addons .ao{ display:inline-flex; align-items:center; background:var(--lav-soft); color:var(--purple-d);
  font-size:11.5px; font-weight:600; padding:4px 11px; border-radius:999px; }
/* The waiting state is news, not an alarm: a warm wash rather than a solid
   amber block competing with the card art. Full-bleed to the card's edges —
   a bordered panel inside a bordered card gave two competing outlines 20px
   apart — so it reads as a section of this card, not a card within it. */
.si .prodlock{ grid-column:1/-1; margin:6px -26px -24px; }
.si .prodpanel{ border-top:1px solid #f0e6d2; border-radius:0 0 19px 19px; padding:18px 26px 20px;
  background:linear-gradient(180deg,#FFFCF3 0%,#FFFDF8 100%); }
/* Exactly two children: the column of status, and the aside. */
.si .prodmain{ display:grid; grid-template-columns:minmax(0,1fr) minmax(230px,290px); gap:20px 30px; }
.si .prodcol{ min-width:0; }
.si .prodaside{ min-width:0; padding-left:30px; border-left:1px solid #f2eadb; }
.si .prodaside .pnl{ display:block; margin-top:16px; font-size:9.5px; font-weight:700; letter-spacing:.6px;
  text-transform:uppercase; color:var(--faint); }
.si .prodaside .reassure{ margin:0; font-size:12px; line-height:1.5; color:#6b6670; }
.si .prodaside > :first-child{ margin-top:0; }
/* Reuses the dashboard's .bar, warmed to the panel and kept away from the
   tracker's green so time can't be misread as work completed. */
.si .peta .bar{ margin-top:8px; background:#F3EADA; }
.si .peta .bar i{ background:linear-gradient(90deg,#c99318,#e3b445); }
.si .etacap{ display:block; margin-top:7px; font-size:11.5px; font-weight:600; color:#8a6d1a; }
.si .peta + .reassure{ margin-top:12px; }
.si .peta .bar.late i{ background:#c99318; }
.si .pacts{ display:flex; flex-direction:column; align-items:flex-start; gap:8px; margin-top:9px; }
.si .pacts .btn{ font-size:13px; padding:8px 14px; text-decoration:none; }
.si .prodpanel-head{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.si .prodpanel .dp{ display:inline-flex; align-items:center; gap:6px; background:#FBF0CF; color:#7d5d08;
  font-size:10.5px; font-weight:800; letter-spacing:.3px; padding:5px 11px; border-radius:999px; flex:none; }
.si .prodpanel .dp em{ width:6px; height:6px; border-radius:999px; background:#c99318; flex:none;
  animation:si-prodpulse 1.8s ease-in-out infinite; }
@keyframes si-prodpulse{ 0%,100%{ opacity:1; transform:scale(1); } 50%{ opacity:.45; transform:scale(.8); } }
.si .prodpanel b{ color:var(--ink); font-size:14px; font-weight:700; }
/* Hierarchy by weight, not by heat: the primary explanation is the darkest
   text, the thumbnail footnote steps down. Colouring the footnote amber made
   the least important line the loudest one in the panel. */
.si .prodpanel p{ margin-top:7px; max-width:62ch; font-size:12.5px; line-height:1.5; color:#5f5a66; }
.si .prodpanel p.note{ margin-top:6px; font-size:11.5px; color:#7a7580; }
/* Scrim caption over the thumbnail: the art stays legible, but it can never be
   mistaken for the couple's finished card. */
.si .ctx.production .ccard .samplestrip{ position:absolute; left:0; right:0; bottom:0; padding:16px 8px 6px;
  text-align:center; font-size:9px; font-weight:800; letter-spacing:1px; text-transform:uppercase; color:#fff;
  background:linear-gradient(180deg,rgba(20,18,30,0) 0%,rgba(20,18,30,.74) 62%); }
/* Horizontal tracker: the rail is drawn per step, from its own marker to the
   next one, so it fills green exactly as far as the couple has actually got. */
.si .prodsteps{ list-style:none; padding:0; margin:18px 0 0; display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr)); }
.si .prodsteps .step{ position:relative; padding-right:18px; }
.si .prodsteps .step::before{ content:''; position:absolute; left:11px; right:0; top:10px; height:2px;
  background:var(--line); border-radius:2px; }
.si .prodsteps .step:last-child{ padding-right:0; }
.si .prodsteps .step:last-child::before{ display:none; }
.si .prodsteps .step.done::before{ background:var(--green); }
/* All three markers are the same object in different states. Numbering two of
   them and ticking the third implied these were steps the couple takes; they
   are all things done to the order. */
.si .prodsteps .mark{ position:relative; z-index:1; width:22px; height:22px; border-radius:999px;
  display:grid; place-items:center; background:#fff; border:2px solid var(--line); color:var(--green-tx); }
.si .prodsteps .step.done .mark{ background:var(--green); border-color:var(--green); }
.si .prodsteps .step.active .mark{ border-color:#c99318; box-shadow:0 0 0 4px rgba(201,147,24,.15); }
.si .prodsteps .step.active .mark::after{ content:''; width:8px; height:8px; border-radius:999px; background:#c99318; }
.si .prodsteps .txt{ display:block; margin-top:10px; padding-right:14px; }
.si .prodsteps .txt b{ display:block; font-size:12.5px; font-weight:700; color:var(--ink); }
.si .prodsteps .txt i{ display:block; margin-top:2px; font-style:normal; font-size:11px; font-weight:600; color:var(--muted); }
.si .prodsteps .step.done .txt i{ color:var(--green-tx); }
.si .prodsteps .step.active .txt i{ color:#a37a12; }
.si .prodsteps .step.locked .txt b, .si .prodsteps .step.locked .txt i{ color:var(--faint); }
/* Motion here marks a state that changes over days, so it earns nothing for
   anyone who has asked the OS to keep still. Covers the live check-in dot and
   the arrivals feed too, which never had a guard. */
@media (prefers-reduced-motion: reduce){
  /* The busy spinner stays: it is the only signal that a send is in flight. */
  .si .prodpanel .dp em, .si .livedot.on, .si .lf{ animation:none; }
  .si .btn:hover{ transform:none; } }
.si .funnel{ display:grid; grid-template-columns:repeat(4,1fr) 1.5fr; gap:12px; }
.si .fc{ position:relative; background:#fff; border:1px solid var(--line); border-radius:14px; padding:16px 18px; box-shadow:var(--soft); }
.si .fcicon{ position:absolute; top:14px; right:14px; width:26px; height:26px; border-radius:50%;
  display:flex; align-items:center; justify-content:center; background:#F3F3F5; color:var(--purple); }
.si .fc .n{ font-size:27px; line-height:1; font-weight:600; }
.si .fc .l{ font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.8px; margin-top:8px; }
.si .fc .l .ar{ color:var(--lav); font-weight:700; }
.si .quota .top{ display:flex; justify-content:space-between; font-size:12px; color:var(--muted); margin-bottom:9px; }
.si .quota .top b{ color:var(--ink); }
.si .bar{ height:7px; background:var(--lav-soft); border-radius:999px; overflow:hidden; }
.si .bar i{ display:block; height:100%; background:linear-gradient(90deg,var(--purple),var(--lav)); }
.si .quota .ft{ font-size:11px; color:var(--muted); margin-top:9px; }
.si .quota .ft a{ color:var(--purple); font-weight:600; text-decoration:none; }
.si .tstats{ display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; }
.si .tstat{ display:inline-flex; align-items:baseline; gap:7px; padding:8px 14px; border-radius:12px;
  border:1px solid var(--line); background:#fff; cursor:pointer; transition:border-color .15s ease, background .15s ease; }
.si .tstat b{ font-size:17px; font-weight:700; color:var(--purple-d); }
.si .tstat span{ font-size:12px; font-weight:600; color:var(--muted); }
.si .tstat:hover:not(.on){ border-color:var(--lav); }
.si .tstat.on{ background:var(--lav-soft); border-color:var(--lav); }
.si .tstat.on b, .si .tstat.on span{ color:var(--purple-d); }
.si .equota{ margin-top:12px; padding:10px 12px; max-width:520px; border:1px solid var(--line); border-radius:12px; background:#fff; }
.si .equota .top{ display:flex; justify-content:space-between; font-size:12px; color:var(--muted); margin-bottom:7px; }
.si .equota .top b{ color:var(--ink); }
.si .sendtabs{ display:flex; flex-wrap:wrap; align-items:center; gap:10px 18px; margin-top:22px;
  padding-bottom:8px; border-bottom:1px solid var(--line); }
.si .stb{ display:inline-flex; align-items:center; gap:7px; margin-bottom:-9px; background:none; border:none;
  border-bottom:2px solid transparent; padding:0 0 10px; font-size:14px; font-weight:500; color:var(--muted);
  cursor:pointer; transition:color .12s, border-color .12s; }
.si .stb:hover{ color:var(--ink); }
.si .stb.on{ border-bottom-color:var(--ink); color:var(--ink); font-weight:600; }
.si .stbcnt{ display:inline-flex; align-items:center; justify-content:center; min-width:20px; height:20px;
  padding:0 6px; background:rgba(0,0,0,.06); color:var(--muted); font-size:10.5px; font-weight:700; border-radius:999px; }
.si .stb.on .stbcnt{ background:var(--ink); color:#fff; }
.si .pipelinepanel{ margin-top:18px; }
.si .ctxsend{ margin-top:18px; }
.si .ctxsend .chips{ margin-top:0; }
.si .chips{ display:flex; gap:9px; margin-top:16px; flex-wrap:wrap; align-items:center; }
.si .chip{ display:inline-flex; align-items:center; gap:8px; border:1px solid var(--line); background:#fff;
  border-radius:11px; padding:9px 13px; font-size:13px; font-weight:600; cursor:pointer; color:var(--ink);
  transition:border-color .12s, background .12s; }
.si .chip:hover{ background:var(--hover); border-color:var(--lav); }
.si .chip:disabled{ opacity:.5; cursor:not-allowed; }
.si .chip.remind svg{ color:#E0A458; }
.si .connect{ display:flex; align-items:center; gap:10px; margin-top:16px; padding:11px 14px; border-radius:12px;
  background:var(--amber-bg); border:1px solid var(--amber-bd); font-size:12.5px; color:var(--amber-tx); line-height:1.4; }
.si .connect .dp{ background:var(--amber-bd); color:var(--amber-tx); font-size:10.5px; font-weight:700; padding:3px 9px; border-radius:999px; flex:none; }
.si .gt{ background:#fff; border:1px solid var(--line); border-radius:var(--radius); margin-top:24px; box-shadow:var(--soft); overflow:hidden; }
.si .sdguesthead{ padding:22px 20px 0; }
.si .sdguesthead h3{ font-size:17px; font-weight:700; color:var(--ink); }
.si .sdguesthead p{ margin-top:6px; color:var(--muted); font-size:13.5px; line-height:1.45; }
.si .sdguesthead + .gth{ border-top:none; }
.si .gth{ display:flex; align-items:center; gap:14px; padding:18px 20px; border-bottom:1px solid var(--line); flex-wrap:wrap; }
.si .gth h2{ font-size:18px; font-weight:600; }
.si .gth .gsearch{ flex:0 1 240px; min-width:150px; border:1px solid var(--line); border-radius:10px;
  padding:8px 12px; font-size:13px; color:var(--ink); background:#fff; }
.si .gth .gsearch:focus{ outline:none; border-color:var(--lav); }
.si .gth .acts{ margin-left:auto; display:flex; gap:9px; align-items:center; flex-wrap:wrap; }
.si .selcnt{ font-size:12px; font-weight:600; color:var(--purple-d); background:var(--lav-soft); padding:5px 11px; border-radius:999px; }
.si .seg{ display:inline-flex; border:1px solid var(--line); border-radius:10px; overflow:hidden; }
.si .seg .sg{ display:inline-flex; align-items:center; gap:4px; background:#fff; border:none; padding:8px 12px; font-size:12.5px; font-weight:600; color:var(--muted); cursor:pointer; }
.si .seg .sg + .sg{ border-left:1px solid var(--line); }
.si .seg .sg.on{ background:var(--lav-soft); color:var(--purple-d); }
.si .seg .sg:hover:not(.on){ background:var(--hover); }
.si .empty{ padding:40px 20px; text-align:center; color:var(--muted); font-size:14px; }
.si .scroll{ overflow-x:auto; }
.si table{ width:100%; border-collapse:collapse; font-size:13.5px; min-width:720px; }
.si th{ text-align:left; font-size:10.5px; letter-spacing:.6px; text-transform:uppercase; color:var(--faint);
  padding:12px 20px; border-bottom:1px solid var(--line); font-weight:600; position:sticky; top:0; background:#fff; z-index:1; }
.si td{ padding:14px 20px; border-bottom:1px solid var(--line); }
.si tr:last-child td{ border-bottom:none; }
.si tbody tr:hover td{ background:var(--hover); }
.si .who{ font-weight:600; } .si .contact{ color:var(--muted); font-size:12px; }
.si .addnum{ display:inline-flex; align-items:center; gap:5px; border:1px dashed var(--lav); background:var(--lav-soft);
  color:var(--purple-d); font-size:11.5px; font-weight:600; padding:5px 10px; border-radius:999px; cursor:pointer; }
.si .pedit{ display:inline-flex; align-items:center; gap:6px; }
.si .pedit input{ width:130px; border:1px solid var(--lav); border-radius:8px; padding:5px 8px; font-size:12px; }
.si .pedit input:focus{ outline:none; border-color:var(--purple); }
.si .mini-btn{ border:none; background:var(--purple); color:#fff; font-size:11px; font-weight:600; padding:5px 10px;
  border-radius:999px; cursor:pointer; display:inline-flex; align-items:center; }
.si .mini-btn.ghost{ background:#fff; color:var(--muted); border:1px solid var(--line); }
.si .mini-btn:disabled{ opacity:.5; }
.si .pillselect{ display:inline-flex; align-items:center; gap:5px; border-radius:999px; padding:4px 10px; font-size:11.5px;
  font-weight:600; border:1px solid var(--line); color:var(--ink); white-space:nowrap; cursor:pointer; background:#fff; }
.si .pillselect::after{ content:''; width:6px; height:6px; margin-left:2px; border-right:1.6px solid currentColor; border-bottom:1.6px solid currentColor;
  opacity:.55; transform:translateY(-2px) rotate(45deg); }
.si .pillselect:hover{ filter:brightness(0.97); }
.si .pillselect.pill-whatsapp{ color:#1a8a4a; border-color:#bfe8d2; background-color:#eefaf3; }
.si .pillselect.pill-sms{ color:var(--purple-d); border-color:var(--lav); background-color:#faf6fd; }
.si .chmenu{ position:absolute; z-index:5; top:calc(100% + 4px); left:0; min-width:150px; background:#fff;
  border:1px solid var(--line); border-radius:12px; box-shadow:0 8px 24px rgba(20,18,30,.12); padding:4px; }
.si .chmenu-item{ display:flex; width:100%; align-items:center; gap:7px; border:none; background:transparent; border-radius:8px;
  padding:7px 9px; font-size:12.5px; font-weight:600; color:var(--ink); cursor:pointer; text-align:left; }
.si .chmenu-item:hover:not(:disabled){ background:var(--hover); }
.si .chmenu-item.active{ background:var(--hover); }
.si .chmenu-item:disabled{ opacity:.4; cursor:not-allowed; }
.si .status{ display:inline-flex; align-items:center; font-size:11.5px; font-weight:600; padding:4px 11px; border-radius:999px; }
.si .s-none{ background:#f3f2f5; color:var(--muted); }
.si .s-sent{ background:var(--lav-soft); color:var(--purple); }
.si .s-view{ background:#eef3ff; color:var(--sms); }
.si .s-yes{ background:var(--ok-bg); color:var(--ok-tx); }
.si .s-no{ background:var(--bad-bg); color:var(--bad-tx); }
.si .s-maybe{ background:#fff5e6; color:#b9791a; }
.si .ra{ display:flex; gap:7px; justify-content:flex-end; align-items:center; }
.si .ia{ height:32px; min-width:32px; padding:0 8px; border-radius:9px; border:1px solid var(--line); background:#fff; cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center; gap:6px; font-size:12px; font-weight:600; color:var(--ink); }
.si .ia:hover{ background:var(--hover); border-color:var(--lav); }
.si .ia:disabled{ opacity:.45; cursor:not-allowed; }
.si .ia.send{ background:var(--wa); border-color:var(--wa); color:#fff; padding:0 12px; font-size:12.5px; }
.si .ia.send:hover{ filter:brightness(1.06); background:var(--wa); }
.si .ia.send.pass{ background:var(--wa); border-color:var(--wa); color:#fff; }
.si .ia.send.pass:hover{ filter:brightness(1.06); background:var(--wa); }
.si .ia.danger{ color:var(--bad-tx); }
.si .ia.danger:hover{ border-color:var(--bad-tx); background:var(--bad-bg); }
.si .einp{ width:100%; max-width:220px; border:1px solid var(--lav); border-radius:8px; padding:6px 9px; font-size:13px; background:#fff; }
.si .einp:focus{ outline:none; border-color:var(--purple); }
.si .ck{ width:15px; height:15px; accent-color:var(--purple); }

/* Overlays: confirm modal, preview modal, report drawer */
.si .ovl{ position:fixed; inset:0; background:rgba(28,27,31,.42); z-index:60; display:flex; align-items:center; justify-content:center; padding:18px; }
.si .ovl.right{ justify-content:flex-end; padding:0; }
.si .modal{ background:#fff; border-radius:18px; padding:24px; width:min(440px,100%); box-shadow:0 18px 50px rgba(20,18,30,.25); }
.si .modal.wide{ width:min(960px,96vw); max-height:92vh; overflow-y:auto; overscroll-behavior:contain; }
.si .pgrid{ display:grid; grid-template-columns:1fr 1.1fr; gap:20px; margin-top:16px; align-items:start; }
.si .pgrid .vars{ margin-top:0; }
.si .pgrid .vgrid{ grid-template-columns:1fr; }
.si .pgrid .wawrap{ margin-top:0; display:flex; align-items:center; justify-content:center; min-height:100%; }
@media(max-width:760px){ .si .pgrid{ grid-template-columns:1fr; } }
.si .modal h3{ font-size:21px; font-weight:600; }
.si .modal .big{ font-size:14.5px; margin-top:12px; line-height:1.5; }
.si .mutedp{ color:var(--muted); font-size:12.5px; margin-top:8px; line-height:1.5; }
.si .mrow{ display:flex; justify-content:flex-end; gap:10px; margin-top:20px; }
.si .mhead{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
.si .xbtn{ border:none; background:#f3f2f5; color:var(--muted); width:30px; height:30px; border-radius:50%; cursor:pointer;
  display:grid; place-items:center; }
.si .wawrap{ margin-top:16px; background:#F3F3F5; border-radius:14px; padding:18px; }
.si .wabubble{ background:#fff; border-radius:10px; padding:6px; width:min(380px,100%); margin:0 auto;
  box-shadow:0 1px 1px rgba(0,0,0,.08); font-size:13.5px; line-height:1.45; }
.si .waimg{ position:relative; width:100%; aspect-ratio:4/3; border-radius:7px; overflow:hidden; background:linear-gradient(155deg,var(--purple),var(--lav)); }
.si .waimgfull{ display:block; width:100%; height:auto; border-radius:7px; }
.si .waimg-ph{ position:absolute; inset:0; display:grid; place-items:center; color:#fff; font-family:var(--font-cormorant),Georgia,serif; font-size:18px; }
.si .wabody{ padding:9px 6px 4px; color:#111; white-space:normal; }
.si .wafoot{ padding:0 6px 8px; color:#8a8a8a; font-size:11px; }
.si .wabtn{ border-top:1px solid #f0f0f0; text-align:center; color:#34B7F1; font-weight:600; font-size:13px; padding:9px 4px; }
.si .vars{ margin-top:16px; padding:14px; border:1px solid var(--line); border-radius:12px; background:var(--hover); }
.si .vlegend{ font-size:10.5px; font-weight:700; letter-spacing:.8px; text-transform:uppercase; color:var(--purple); margin-bottom:10px; }
.si .vgrid{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
.si .vgrid.two{ grid-template-columns:1fr 1fr; }
.si .vsave{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:4px; }
.si .vsave .mutedp{ margin-top:0; }
.si .vbtns{ display:flex; gap:8px; flex:none; }
.si .vfield{ display:flex; flex-direction:column; gap:5px; }
.si .vfield + .vfield{ margin-top:10px; }
.si .vgrid .vfield + .vfield{ margin-top:0; }
.si .vfield span{ font-size:11px; font-weight:600; color:var(--muted); }
.si .vfield input, .si .vfield select{ width:100%; border:1px solid var(--line); border-radius:9px; padding:8px 10px; font-size:13px; background:#fff; color:var(--ink); }
.si .vfield input:focus, .si .vfield select:focus{ outline:none; border-color:var(--lav); }
@media(max-width:640px){ .si .vgrid{ grid-template-columns:1fr; } }
.si .testrow{ margin-top:18px; }
.si .testrow label{ font-size:12px; font-weight:600; color:var(--muted); }
.si .trow{ display:flex; gap:9px; margin-top:8px; }
.si .trow input{ flex:1; border:1px solid var(--line); border-radius:10px; padding:9px 12px; font-size:13px; }
.si .trow input:focus{ outline:none; border-color:var(--lav); }
.si .drawer{ background:#fff; width:min(420px,94vw); height:100%; padding:22px; overflow-y:auto; display:flex; flex-direction:column;
  box-shadow:-16px 0 40px rgba(20,18,30,.18); animation:si-slide .18s ease-out; }
@keyframes si-slide{ from{ transform:translateX(24px); opacity:.4 } to{ transform:none; opacity:1 } }
.si .drawer h3{ font-size:20px; font-weight:600; }
.si .dsum{ display:flex; gap:8px; flex-wrap:wrap; margin-top:14px; }
.si .ds{ font-size:12px; font-weight:600; padding:5px 11px; border-radius:999px; }
.si .ds.ok{ background:var(--ok-bg); color:var(--ok-tx); }
.si .ds.bad{ background:var(--bad-bg); color:var(--bad-tx); }
.si .ds.warn{ background:var(--amber-bg); color:var(--amber-tx); border:1px solid var(--amber-bd); }
.si .dlist{ margin-top:16px; flex:1; }
.si .dgroup{ margin-bottom:16px; }
.si .dglabel{ font-size:10.5px; font-weight:700; letter-spacing:.8px; text-transform:uppercase; color:var(--faint); padding-bottom:6px; }
.si .dglabel.failed{ color:var(--bad-tx); } .si .dglabel.blocked, .si .dglabel.skipped{ color:var(--amber-tx); }
.si .drow{ display:flex; align-items:baseline; gap:8px; padding:7px 0; border-bottom:1px solid var(--line); font-size:13px; flex-wrap:wrap; }
.si .dname{ font-weight:600; }
.si .ppill{ display:inline-flex; align-items:center; padding:2px 9px; border-radius:999px;
  background:var(--green); color:var(--green-tx); font-size:10.5px; font-weight:700; letter-spacing:.3px; }
.si .dtag{ font-size:10.5px; font-weight:600; color:var(--purple-d); background:var(--lav-soft); padding:2px 8px; border-radius:999px; }
.si .derr{ font-size:11.5px; color:var(--bad-tx); }

/* Live Check-ins tab — live door summary + attending roster */
.si .checkins{ margin-top:22px; }
.si .livesum{ background:#fff; border:1px solid var(--line); border-radius:20px; padding:22px; box-shadow:var(--soft); }
.si .livetop{ display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.si .livebtns{ display:flex; gap:8px; flex-wrap:wrap; }
.si .livehead{ display:inline-flex; align-items:center; gap:8px; font-size:12px; font-weight:600; color:var(--muted); }
.si .livedot{ width:8px; height:8px; border-radius:50%; background:var(--faint); flex:none; }
.si .livedot.on{ background:var(--wa); box-shadow:0 0 0 4px rgba(37,211,102,.16); animation:si-pulse 1.6s ease-in-out infinite; }
@keyframes si-pulse{ 0%,100%{ opacity:1 } 50%{ opacity:.5 } }
.si .livebig{ margin-top:10px; font-size:38px; font-weight:700; letter-spacing:-.5px; color:var(--purple-d); line-height:1; }
.si .livebig span{ font-size:16px; font-weight:600; color:var(--muted); letter-spacing:0; }
.si .livesum .bar{ margin-top:14px; max-width:520px; }
.si .livefeed{ margin-top:16px; border-top:1px solid var(--line); padding-top:14px; max-width:520px; }
.si .lfhead{ font-size:10.5px; font-weight:700; letter-spacing:.8px; text-transform:uppercase; color:var(--faint); margin-bottom:8px; }
.si .lf{ display:flex; align-items:baseline; justify-content:space-between; gap:12px; padding:5px 0; font-size:13px; animation:si-fade .35s ease; }
.si .lf .lfname{ font-weight:600; color:var(--ink); }
.si .lf .lfmeta{ font-size:11.5px; color:var(--muted); white-space:nowrap; }
@keyframes si-fade{ from{ opacity:0; transform:translateY(-3px) } to{ opacity:1; transform:none } }
.si .checkins .gt{ margin-top:18px; }
.si .status.s-yes svg{ margin-right:3px; }
.si .seatpill{ display:inline-flex; align-items:center; padding:3px 10px; border-radius:999px; background:var(--lav-soft);
  color:var(--purple-d); font-size:11.5px; font-weight:600; white-space:nowrap; }
.si .noseat{ font-size:12px; color:var(--faint); }

@media(max-width:900px){ .si .funnel{ grid-template-columns:repeat(2,1fr); }
  .si .funnel .quota{ grid-column:span 2; }
  .si .ctx.production .ctxbody{ grid-template-columns:104px minmax(0,1fr); gap:16px 18px; }
  .si .ctx.production .ccard{ width:104px; height:146px; }
  /* Too narrow to sit two columns side by side: the aside drops below the
     tracker and its rule moves to the top edge. */
  .si .prodmain{ grid-template-columns:minmax(0,1fr); gap:16px; }
  .si .prodaside{ padding-left:0; padding-top:16px; border-left:none; border-top:1px solid #f2eadb; }
  .si .pacts{ flex-direction:row; flex-wrap:wrap; align-items:center; } }
@media(max-width:760px){ .si .sdshare{ flex-direction:column; }
  .si .sdmedia{ width:100%; min-height:0; aspect-ratio:5/7; }
  .si .sdlinkrow{ align-items:stretch; flex-direction:column; }
  .si .sdlinkrow .btn{ justify-content:center; }
  .si .sdqr{ margin-left:0; width:100%; justify-content:flex-start; } }
@media(max-width:640px){ .si .gth .acts{ margin-left:0; width:100%; justify-content:flex-start; }
  .si .ctx.production{ padding:18px; }
  .si .prodlock{ margin:6px -18px -18px; }
  .si .prodpanel{ padding:16px 18px 18px; }
  /* Phone: the art takes its own row so the name, facts and tracker each get
     the full width instead of wrapping a word per line beside it. */
  .si .ctx.production .ctxbody{ grid-template-columns:minmax(0,1fr); gap:14px; }
  .si .ctx.production .ccard{ width:110px; height:154px; }
  .si .ctx.production .pmeta{ grid-template-columns:repeat(2,minmax(0,1fr)); }
  .si .prodpanel-head{ align-items:flex-start; flex-direction:column; }
  /* Narrow screens turn the tracker upright: the rail runs down the markers. */
  .si .prodsteps{ grid-template-columns:1fr; gap:14px; }
  .si .prodsteps .step{ display:grid; grid-template-columns:22px minmax(0,1fr); align-items:center;
    gap:10px; padding-right:0; }
  .si .prodsteps .step::before{ left:10px; right:auto; top:22px; bottom:-14px; width:2px; height:auto; }
  .si .prodsteps .txt{ margin-top:0; padding-right:0; } }
`
