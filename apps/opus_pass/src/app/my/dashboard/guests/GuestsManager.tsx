'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Users,
  Plus,
  Search,
  SlidersHorizontal,
  Check,
  Pencil,
  Trash2,
  Upload,
  MessageCircle,
  X,
  ClipboardSignature,
  ArrowUp,
  CalendarHeart,
  ChevronDown,
} from 'lucide-react'
import { Card, EmptyState, StatusPill } from '@/components/dashboard/primitives'
import { Button, ConfirmDialog, Slideover, Tabs, Field, inputClass } from '@/components/dashboard/controls'
import { cn } from '@/lib/utils'
import { DashboardHero } from '@/components/dashboard/DashboardHero'
import {
  createGuest,
  updateGuest,
  deleteGuest,
  bulkImportGuests,
  sendWhatsAppCollectorRequests,
  sendWhatsAppRsvpReminders,
  type GuestInput,
} from '@/lib/dashboard/actions'
import {
  fileToImportResult,
  SpreadsheetError,
  type SpreadsheetImportResult,
} from '@/lib/dashboard/import-spreadsheet'
import { parseGuestImportRows } from '@/lib/dashboard/guest-import-rows'
import type { DashboardHeroContent } from '@/lib/cms/dashboard-hero'
import type { GuestsDashboardCopy } from '@/lib/cms/dashboard-copy'
import type { DashboardEventScopeStrings } from '@/lib/cms/ui-strings-fallback'
import { EventPicker } from '@/components/dashboard/EventScope'
import type {
  ChildEntry,
  GuestInvitation,
  GuestWithInvitations,
  RsvpStatus,
  WeddingEvent,
} from '@/lib/dashboard/types'
import { RSVP_STATUS_LABELS } from '@/lib/dashboard/types'

type FormTab = 'info' | 'address' | 'rsvps'
type GuestView = 'manage' | 'invite' | 'address'

function guestHasFullAddress(g: GuestWithInvitations): boolean {
  return Boolean(g.address_line1 && g.address_city)
}

function formatAddress(g: GuestWithInvitations): string {
  return [
    g.address_line1,
    g.address_apt,
    [g.address_city, g.address_region].filter(Boolean).join(', '),
    g.address_postal_code,
    g.address_country,
  ]
    .filter(Boolean)
    .join(' · ')
}

const emptyForm: GuestInput = {
  title: '',
  first_name: '',
  last_name: '',
  suffix: '',
  plus_one_title: '',
  plus_one_first_name: '',
  plus_one_last_name: '',
  plus_one_suffix: '',
  plus_one_name_unknown: false,
  children: [],
  email: '',
  phone: '',
  whatsapp_phone: '',
  group_tag: '',
  max_party_size: 1,
  notes: '',
  name_on_envelope: '',
  address_country: '',
  address_line1: '',
  address_apt: '',
  address_city: '',
  address_region: '',
  address_postal_code: '',
  eventIds: [],
}

function hasPlusOne(form: GuestInput): boolean {
  return (
    Boolean(form.plus_one_name_unknown) ||
    Boolean(form.plus_one_first_name?.trim()) ||
    Boolean(form.plus_one_last_name?.trim())
  )
}

/** Narrow a guest's invitations to the currently selected event scope. */
function scopedInvitations(g: GuestWithInvitations, eventFilter: string): GuestInvitation[] {
  return eventFilter === 'all' ? g.invitations : g.invitations.filter((i) => i.event_id === eventFilter)
}

/** Whether a guest's invite has been sent for the given event scope.
 *  Prefers per-event send logs (event_id tagged in guest_message_log);
 *  falls back to the guest-level invite_count/last_invited_at for sends that
 *  predate event-scoping. A legacy send can only have targeted an event the
 *  guest was already invited to at send time — comparing last_invited_at
 *  against each invitation's created_at keeps that signal even after the
 *  guest is later added to a second event (invitations.length alone can't
 *  tell those cases apart, and would otherwise wrongly revert to "not sent"). */
function wasSentForScope(
  g: GuestWithInvitations,
  eventFilter: string,
  sentEventIds: Record<string, string[]>,
): boolean {
  if (eventFilter === 'all') return g.invite_count > 0
  const tagged = sentEventIds[g.id] ?? []
  if (tagged.includes(eventFilter)) return true
  if (tagged.length > 0) return false
  if (g.invite_count === 0 || !g.last_invited_at) return false
  const invitation = g.invitations.find((i) => i.event_id === eventFilter)
  if (!invitation) return false
  return new Date(invitation.created_at).getTime() <= new Date(g.last_invited_at).getTime()
}

export default function GuestsManager({
  initialGuests,
  sentEventIds,
  events,
  eventFilter,
  scopeStrings,
  hero,
  collectorToken,
  copy,
}: {
  initialGuests: GuestWithInvitations[]
  /** Which event(s) each guest has a logged send for, keyed by guest id. */
  sentEventIds: Record<string, string[]>
  events: WeddingEvent[]
  /** Event id the roster view is scoped to, or 'all' for the full roster. */
  eventFilter: string
  scopeStrings: DashboardEventScopeStrings
  coupleName: string
  hero: DashboardHeroContent
  collectorToken: string | null
  copy: GuestsDashboardCopy
  whatsappLive: boolean
}) {
  const [query, setQuery] = useState('')
  const [rsvpFilter, setRsvpFilter] = useState<Set<RsvpStatus>>(new Set())
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<FormTab>('info')
  const [importOpen, setImportOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<GuestWithInvitations | null>(null)
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [view, setView] = useState<GuestView>('manage')
  const [importText, setImportText] = useState('')
  const [importSummary, setImportSummary] = useState<SpreadsheetImportResult | null>(null)
  const [importEventIds, setImportEventIds] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState<GuestWithInvitations | null>(null)
  const [form, setForm] = useState<GuestInput>(emptyForm)
  const [pending, startTransition] = useTransition()

  // Guests belonging to the selected event scope, before any search/view/
  // rsvp refinement. This is the stable base for the stat cards and
  // sub-nav badges, so those numbers track the event switcher but don't
  // fluctuate as the user types a search query or flips sub-nav tabs.
  const eventScopedGuests = useMemo(
    () =>
      eventFilter === 'all'
        ? initialGuests
        : initialGuests.filter((g) => g.invitations.some((i) => i.event_id === eventFilter)),
    [initialGuests, eventFilter],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matched = eventScopedGuests.filter((g) => {
      if (view === 'invite' && wasSentForScope(g, eventFilter, sentEventIds)) return false
      if (view === 'address' && guestHasFullAddress(g)) return false
      if (rsvpFilter.size > 0) {
        // Match if ANY invitation on this guest has a selected status. A
        // guest with no invitations is treated as 'pending' for filter UX.
        const statuses = g.invitations.length
          ? g.invitations.map((i) => i.rsvp_status)
          : (['pending'] as RsvpStatus[])
        if (!statuses.some((s) => rsvpFilter.has(s))) return false
      }
      if (!q) return true
      return (
        g.full_name.toLowerCase().includes(q) ||
        (g.email ?? '').toLowerCase().includes(q) ||
        (g.whatsapp_phone ?? g.phone ?? '').toLowerCase().includes(q) ||
        (g.group_tag ?? '').toLowerCase().includes(q)
      )
    })
    return matched.sort((a, b) =>
      sortDir === 'asc'
        ? a.full_name.localeCompare(b.full_name)
        : b.full_name.localeCompare(a.full_name),
    )
  }, [eventScopedGuests, query, sortDir, view, rsvpFilter, eventFilter, sentEventIds])

  // Close the Filter popover when the user clicks outside it.
  useEffect(() => {
    if (!filterOpen) return
    const onDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [filterOpen])

  function toggleRsvpFilter(status: RsvpStatus) {
    setRsvpFilter((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  // Counts for the sub-nav badges — computed from the event-scoped guest
  // list so the numbers stay stable regardless of the currently-active
  // view's filter, but still track the event switcher.
  const viewCounts = useMemo(() => {
    const notInvited = eventScopedGuests.filter((g) => !wasSentForScope(g, eventFilter, sentEventIds)).length
    const missingAddress = eventScopedGuests.filter((g) => !guestHasFullAddress(g)).length
    return { notInvited, missingAddress }
  }, [eventScopedGuests, eventFilter, sentEventIds])

  // Headcounts shown in the stats card row above the toolbar. Adults = each
  // primary guest + a plus-one when any plus-one field is present. Children
  // = sum of attached children entries across all guests. Scoped to the
  // selected event so the numbers never include guests invited to a
  // different event.
  const headCounts = useMemo(() => {
    let adults = eventScopedGuests.length
    let children = 0
    for (const g of eventScopedGuests) {
      const hasPlusOne =
        Boolean(g.plus_one_first_name?.trim()) ||
        Boolean(g.plus_one_last_name?.trim()) ||
        g.plus_one_name_unknown
      if (hasPlusOne) adults += 1
      children += g.children.length
    }
    return { adults, children }
  }, [eventScopedGuests])

  const counts = useMemo(() => {
    const missingEmail = filtered.filter((g) => !g.email).length
    const missingPhone = filtered.filter((g) => !g.phone && !g.whatsapp_phone).length
    const invited = filtered.filter((g) => wasSentForScope(g, eventFilter, sentEventIds)).length
    let replied = 0
    let totalInvites = 0
    for (const g of filtered) {
      for (const inv of scopedInvitations(g, eventFilter)) {
        totalInvites += 1
        if (inv.rsvp_status !== 'pending') replied += 1
      }
    }
    // Entrance passes are a Single/Double product — a guest allocated 2+
    // seats is a Double (max_party_size is clamped to 2 on write).
    const doubles = filtered.filter((g) => g.max_party_size >= 2).length
    return { missingEmail, missingPhone, invited, replied, totalInvites, doubles }
  }, [filtered, eventFilter, sentEventIds])

  // One rule per line in the CMS field, same shape as the website benefits list.
  const importRules = useMemo(
    () =>
      copy.import_rules_items
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    [copy.import_rules_items]
  )

  const allSelected = filtered.length > 0 && filtered.every((g) => selected.has(g.id))
  const someSelected = !allSelected && filtered.some((g) => selected.has(g.id))

  function toggleSort() {
    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(filtered.map((g) => g.id)))
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelected(new Set())
  }

  function bulkRemove() {
    if (selected.size === 0) return
    const ids = [...selected]
    startTransition(async () => {
      try {
        for (const id of ids) {
          await deleteGuest(id)
        }
        toast.success(`${ids.length} guest${ids.length === 1 ? '' : 's'} removed`)
        clearSelection()
        setPendingBulkDelete(false)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Bulk remove failed')
      }
    })
  }

  function bulkSendCollectorLink() {
    if (selected.size === 0) return
    const ids = [...selected]
    startTransition(async () => {
      try {
        const r = await sendWhatsAppCollectorRequests(ids)
        toast.success(
          r.dryRun
            ? `Dry run: would send Collector link to ${r.sent} contact${r.sent === 1 ? '' : 's'}`
            : `Collector link sent to ${r.sent} contact${r.sent === 1 ? '' : 's'}${r.failed ? `, ${r.failed} failed` : ''}`,
        )
        clearSelection()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Send failed')
      }
    })
  }

  function bulkSendRsvpReminder() {
    if (selected.size === 0) return
    const ids = [...selected]
    startTransition(async () => {
      try {
        const r = await sendWhatsAppRsvpReminders(ids)
        toast.success(
          r.dryRun
            ? `Dry run: would remind ${r.sent} guest${r.sent === 1 ? '' : 's'}`
            : `RSVP reminder sent to ${r.sent} guest${r.sent === 1 ? '' : 's'}${r.failed ? `, ${r.failed} failed` : ''}`,
        )
        clearSelection()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Send failed')
      }
    })
  }

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setTab('info')
    setOpen(true)
  }

  function openEdit(g: GuestWithInvitations) {
    setEditing(g)
    setForm({
      title: g.title ?? '',
      first_name: g.first_name ?? g.full_name.split(' ')[0] ?? '',
      last_name: g.last_name ?? g.full_name.split(' ').slice(1).join(' '),
      suffix: g.suffix ?? '',
      plus_one_title: g.plus_one_title ?? '',
      plus_one_first_name: g.plus_one_first_name ?? '',
      plus_one_last_name: g.plus_one_last_name ?? '',
      plus_one_suffix: g.plus_one_suffix ?? '',
      plus_one_name_unknown: g.plus_one_name_unknown ?? false,
      children: g.children ?? [],
      email: g.email ?? '',
      phone: g.phone ?? '',
      whatsapp_phone: g.whatsapp_phone ?? '',
      group_tag: g.group_tag ?? '',
      max_party_size: g.max_party_size > 1 ? 2 : 1,
      notes: g.notes ?? '',
      name_on_envelope: g.name_on_envelope ?? '',
      address_country: g.address_country ?? '',
      address_line1: g.address_line1 ?? '',
      address_apt: g.address_apt ?? '',
      address_city: g.address_city ?? '',
      address_region: g.address_region ?? '',
      address_postal_code: g.address_postal_code ?? '',
      eventIds: g.invitations.map((i) => i.event_id),
    })
    setTab('info')
    setOpen(true)
  }

  function toggleEvent(id: string) {
    setForm((f) => {
      const set = new Set(f.eventIds ?? [])
      if (set.has(id)) set.delete(id)
      else set.add(id)
      return { ...f, eventIds: [...set] }
    })
  }

  function addPlusOne() {
    setForm((f) => ({
      ...f,
      plus_one_title: f.plus_one_title ?? '',
      plus_one_first_name: f.plus_one_first_name ?? '',
      plus_one_last_name: f.plus_one_last_name ?? '',
      plus_one_suffix: f.plus_one_suffix ?? '',
      plus_one_name_unknown: f.plus_one_name_unknown ?? false,
      max_party_size: 2,
    }))
  }

  function removePlusOne() {
    setForm((f) => ({
      ...f,
      plus_one_title: '',
      plus_one_first_name: '',
      plus_one_last_name: '',
      plus_one_suffix: '',
      plus_one_name_unknown: false,
    }))
  }

  function addChild() {
    setForm((f) => ({
      ...f,
      children: [...(f.children ?? []), { first_name: '', last_name: '' }],
      max_party_size: 2,
    }))
  }

  function updateChild(idx: number, patch: Partial<ChildEntry>) {
    setForm((f) => {
      const next = [...(f.children ?? [])]
      next[idx] = { ...next[idx], ...patch }
      return { ...f, children: next }
    })
  }

  function removeChild(idx: number) {
    setForm((f) => ({
      ...f,
      children: (f.children ?? []).filter((_, i) => i !== idx),
    }))
  }

  function save() {
    const first = (form.first_name ?? '').trim()
    const last = (form.last_name ?? '').trim()
    if (!first && !last) {
      toast.error("Enter the guest's name")
      setTab('info')
      return
    }
    startTransition(async () => {
      try {
        if (editing) {
          await updateGuest(editing.id, form)
          toast.success(copy.toast_updated)
        } else {
          const res = await createGuest(form)
          if (!res.ok) {
            toast.error(res.error ?? 'Something went wrong')
            return
          }
          toast.success(copy.toast_added)
        }
        setOpen(false)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  function confirmRemove() {
    const target = pendingDelete
    if (!target) return
    startTransition(async () => {
      try {
        await deleteGuest(target.id)
        toast.success(copy.toast_removed)
        setPendingDelete(null)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not remove')
      }
    })
  }

  function pickImportFile() {
    fileInputRef.current?.click()
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await fileToImportResult(file)
      if (!result.lines.trim()) {
        toast.error('No guests found in that file')
        return
      }
      setImportText(result.lines)
      setImportSummary(result)
    } catch (err) {
      toast.error(err instanceof SpreadsheetError ? err.message : 'Could not read file')
    } finally {
      e.target.value = '' // allow re-selecting the same file
    }
  }

  function runImport() {
    if (!importText.trim()) {
      toast.error('Paste at least one name')
      return
    }
    // Read the editable text as CSV here so a name containing a comma stays
    // one field, then send structured rows rather than a delimited string.
    const { rows, unrecognizedTickets } = parseGuestImportRows(importText)
    if (rows.length === 0) {
      toast.error('Paste at least one name')
      return
    }
    startTransition(async () => {
      try {
        const n = await bulkImportGuests(rows, importEventIds)
        toast.success(`${n} guest${n === 1 ? '' : 's'} added`)
        if (unrecognizedTickets.length > 0) {
          // Don't let an unreadable ticket value quietly become a Single.
          toast.warning(
            `Imported as Single: unrecognized ticket ${unrecognizedTickets.length === 1 ? 'type' : 'types'} ${unrecognizedTickets.join(', ')}. Use Single or Double.`,
          )
        }
        setImportOpen(false)
        setImportText('')
        setImportSummary(null)
        setImportEventIds([])
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Import failed')
      }
    })
  }

  const eventName = (id: string) => events.find((e) => e.id === id)?.name ?? 'Event'

  // Reflect the event picked in the EventSwitcher (tab row) in the page
  // title, so it's obvious at a glance which event's guest list is showing.
  const selectedEventName = events.length > 1 && eventFilter !== 'all' ? eventName(eventFilter) : undefined

  // Mailing address has its own workflow. Keep it out of the core Manage table
  // and show it only when the couple deliberately opens the Address view.
  const showAddressCol = view === 'address'

  return (
    <div className="space-y-6">
      <DashboardHero
        content={hero}
        titleBadge={
          selectedEventName ? (
            <span className="inline-flex items-center rounded-full bg-[#9FE870]/25 px-3 py-1 text-sm font-semibold text-[#3f6b1f]">
              {selectedEventName}
            </span>
          ) : undefined
        }
      />

      <GuestSubNav
        view={view}
        onChange={setView}
        copy={copy}
        events={events}
        eventFilter={eventFilter}
        scopeStrings={scopeStrings}
        pending={pending}
      />

      {initialGuests.length > 0 ? (
        <Card className="px-5 py-4">
          <div className="grid grid-cols-3 divide-x divide-black/[0.12] text-center">
            <Stat value={eventScopedGuests.length} label={copy.stat_guests_label} />
            <Stat value={headCounts.adults} label={copy.stat_adults_label} />
            <Stat value={headCounts.children} label={copy.stat_children_label} />
          </div>
        </Card>
      ) : null}

      {view !== 'manage' ? (
        <ViewBanner
          view={view}
          notInvited={viewCounts.notInvited}
          missingAddress={viewCounts.missingAddress}
          onClear={() => setView('manage')}
        />
      ) : null}

      {initialGuests.length > 0 ? (
        <div className="flex flex-nowrap items-center gap-3">
          <div className="relative shrink-0" ref={filterRef}>
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              aria-expanded={filterOpen}
              aria-haspopup="true"
              className={cn(
                'inline-flex items-center gap-2 rounded-xl border border-black/[0.12] bg-white px-3.5 py-2.5 text-sm text-[#1A1A1A] transition-colors hover:bg-black/[0.03]',
                rsvpFilter.size > 0 && 'border-[#C9A0DC] bg-[#F0DFF6] text-[#5d3a78]',
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>{copy.filter_label}</span>
              {rsvpFilter.size > 0 ? (
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#C9A0DC] px-1.5 text-[11px] font-semibold text-[#1A1A1A]">
                  {rsvpFilter.size}
                </span>
              ) : null}
            </button>
            {filterOpen ? (
              <div
                role="menu"
                className="absolute left-0 top-[calc(100%+6px)] z-20 w-64 rounded-xl border border-black/[0.08] bg-white p-3 shadow-lg ring-1 ring-black/[0.04]"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/60">
                    RSVP status
                  </span>
                  {rsvpFilter.size > 0 ? (
                    <button
                      type="button"
                      onClick={() => setRsvpFilter(new Set())}
                      className="text-xs font-medium text-[#7E5896] hover:text-[#5d3a78]"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
                <ul className="space-y-1">
                  {(Object.keys(RSVP_STATUS_LABELS) as RsvpStatus[]).map((status) => {
                    const checked = rsvpFilter.has(status)
                    return (
                      <li key={status}>
                        <button
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={checked}
                          onClick={() => toggleRsvpFilter(status)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-[#1A1A1A] hover:bg-black/[0.04]"
                        >
                          <span>{RSVP_STATUS_LABELS[status]}</span>
                          <span
                            className={cn(
                              'flex h-4 w-4 items-center justify-center rounded border',
                              checked
                                ? 'border-[#C9A0DC] bg-[#C9A0DC] text-[#1A1A1A]'
                                : 'border-black/[0.2] bg-white',
                            )}
                          >
                            {checked ? <Check className="h-3 w-3" /> : null}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
          </div>
          <div className="relative flex-1 min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1A1A]/35" />
            <input
              className={`${inputClass} pl-9`}
              placeholder={copy.search_placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-black/[0.12] bg-white px-3.5 py-2.5 text-sm font-medium text-[#1A1A1A] transition-colors hover:bg-black/[0.03]"
          >
            <Upload className="h-4 w-4" />
            <span>{copy.upload_spreadsheet_cta}</span>
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#C9A0DC] px-4 py-2.5 text-sm font-semibold text-[#1A1A1A] hover:bg-[#b97fd0]"
          >
            <Plus className="h-4 w-4" /> {copy.add_guests_cta}
          </button>
        </div>
      ) : null}

      {initialGuests.length === 0 ? (
        <EmptyState
          icon={<Users className="h-7 w-7" />}
          title={copy.empty_title}
          description={copy.empty_description}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" /> {copy.empty_add_cta}
              </Button>
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> {copy.empty_upload_cta}
              </Button>
              {collectorToken ? (
                <Link
                  href="/my/dashboard/guests/customize"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#1A1A1A] ring-1 ring-inset ring-black/[0.12] transition-colors hover:bg-black/[0.03]"
                >
                  <ClipboardSignature className="h-4 w-4" /> {copy.empty_collect_cta}
                </Link>
              ) : null}
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Search className="h-6 w-6" />} title={copy.no_match_title} />
      ) : (
        <>
          {selected.size > 0 ? (
            <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#1A1A1A] px-4 py-2.5 text-sm text-white shadow-lg">
              <span className="font-medium">
                {selected.size} {selected.size === 1 ? 'guest' : 'guests'} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-md px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={bulkSendCollectorLink}
                  className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/20"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp: Collector link
                </button>
                <button
                  type="button"
                  onClick={bulkSendRsvpReminder}
                  className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/20"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp: RSVP reminder
                </button>
                <button
                  type="button"
                  onClick={() => setPendingBulkDelete(true)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-rose-500/90 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-500"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove selected
                </button>
              </div>
            </div>
          ) : null}

          <Card className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-black/[0.06] align-bottom">
                  <th scope="col" className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={allSelected ? 'Deselect all' : 'Select all'}
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected
                      }}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-black/30 accent-[#1A1A1A]"
                    />
                  </th>
                  <th scope="col" className="py-3 pr-4">
                    <button
                      type="button"
                      onClick={toggleSort}
                      aria-label={`Sort by name, currently ${sortDir === 'asc' ? 'ascending' : 'descending'}`}
                      className="text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/55 hover:text-[#1A1A1A]"
                    >
                      Name
                    </button>
                  </th>
                  <th scope="col" className="py-3 pr-4">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/55">
                      Phone number
                    </span>
                    {counts.missingPhone > 0 ? (
                      <p className="mt-0.5 text-[11px] font-normal normal-case tracking-normal text-rose-600">
                        {counts.missingPhone} missing
                      </p>
                    ) : null}
                  </th>
                  <th scope="col" className="py-3 pr-4">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/55">
                      Email
                    </span>
                    {counts.missingEmail > 0 ? (
                      <p className="mt-0.5 text-[11px] font-normal normal-case tracking-normal text-rose-600">
                        {counts.missingEmail} missing
                      </p>
                    ) : null}
                  </th>
                  {showAddressCol ? (
                    <th scope="col" className="py-3 pr-4">
                      <span className="text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/55">
                        Address
                      </span>
                      {viewCounts.missingAddress > 0 ? (
                        <p className="mt-0.5 text-[11px] font-normal normal-case tracking-normal text-rose-600">
                          {viewCounts.missingAddress} missing
                        </p>
                      ) : null}
                    </th>
                  ) : null}
                  <th scope="col" className="py-3 pr-4">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/55">
                      Ticket type
                    </span>
                    {counts.doubles > 0 ? (
                      <p className="mt-0.5 text-[11px] font-normal normal-case tracking-normal text-[#1A1A1A]/45">
                        {counts.doubles} double{counts.doubles === 1 ? '' : 's'}
                      </p>
                    ) : null}
                  </th>
                  <th scope="col" className="w-1 py-3 pr-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.05]">
                {filtered.map((g) => {
                  const isSelected = selected.has(g.id)
                  return (
                    <tr
                      key={g.id}
                      className={cn('align-middle hover:bg-black/[0.02]', isSelected && 'bg-black/[0.03]')}
                    >
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          aria-label={`Select ${g.full_name}`}
                          checked={isSelected}
                          onChange={() => toggleOne(g.id)}
                          className="h-4 w-4 rounded border-black/30 accent-[#1A1A1A]"
                        />
                      </td>
                      <td className="py-3.5 pr-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-xs font-semibold text-[#1A1A1A]/70">
                            {g.full_name.charAt(0).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-[#1A1A1A]">{g.full_name}</p>
                            {g.group_tag ? (
                              <p className="truncate text-xs text-[#1A1A1A]/50">{g.group_tag}</p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 pr-4">
                        {g.whatsapp_phone || g.phone ? (
                          <p className="truncate text-xs text-[#1A1A1A]/70">{g.whatsapp_phone ?? g.phone}</p>
                        ) : (
                          <p className="text-xs text-rose-600">Missing phone</p>
                        )}
                      </td>
                      <td className="py-3.5 pr-4">
                        {g.email ? (
                          <p className="truncate text-xs text-[#1A1A1A]/70">{g.email}</p>
                        ) : (
                          <p className="text-xs text-rose-600">Missing email</p>
                        )}
                      </td>
                      {showAddressCol ? (
                        <td className="py-3.5 pr-4">
                          {guestHasFullAddress(g) ? (
                            <p className="max-w-[260px] truncate text-xs text-[#1A1A1A]/70" title={formatAddress(g)}>
                              {formatAddress(g)}
                            </p>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                openEdit(g)
                                setTab('address')
                              }}
                              className="text-xs font-medium text-rose-600 underline-offset-2 hover:underline"
                            >
                              Add address
                            </button>
                          )}
                        </td>
                      ) : null}
                      <td className="py-3.5 pr-4">
                        <span className="inline-flex items-center rounded-full bg-[#9FE870]/25 px-2.5 py-1 text-xs font-medium text-[#3f6b1f]">
                          {g.max_party_size >= 2 ? 'Double' : 'Single'}
                        </span>
                      </td>
                      <td className="py-3.5 pr-3 text-right">
                        {/* Sends happen in the Send Invites console; this
                            table is for managing the roster, so it keeps only
                            edit + remove. */}
                        <div className="inline-flex gap-1">
                          <button
                            onClick={() => openEdit(g)}
                            aria-label="Edit"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#1A1A1A]/50 hover:bg-black/[0.05]"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setPendingDelete(g)}
                            aria-label="Remove"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50"
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
        </>
      )}

      {/* Add / edit guest — slideover */}
      <Slideover
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit guest' : 'Add guests'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? 'Saving…' : editing ? 'Save changes' : 'Add to list'}
            </Button>
          </>
        }
      >
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'info', label: 'Guest info' },
            { id: 'address', label: 'Mailing address' },
            { id: 'rsvps', label: 'RSVPs' },
          ]}
        />

        {tab === 'info' ? (
          <GuestInfoTab
            form={form}
            setForm={setForm}
            addPlusOne={addPlusOne}
            removePlusOne={removePlusOne}
            addChild={addChild}
            updateChild={updateChild}
            removeChild={removeChild}
          />
        ) : tab === 'address' ? (
          <MailingAddressTab form={form} setForm={setForm} />
        ) : (
          <RsvpsTab
            form={form}
            events={events}
            invitations={editing?.invitations ?? []}
            toggleEvent={toggleEvent}
          />
        )}
      </Slideover>

      {/* Bulk import — slideover with file or paste */}
      <Slideover
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title={copy.import_title}
        footer={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={runImport} disabled={pending}>
              {pending ? 'Importing…' : 'Import'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-dashed border-black/[0.15] bg-black/[0.02] p-4">
            <p className="text-sm font-medium text-[#1A1A1A]">{copy.import_upload_title}</p>
            <p className="mt-1 text-xs text-[#1A1A1A]/55">{copy.import_upload_hint}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={pickImportFile}>
                <Upload className="h-4 w-4" /> Choose file
              </Button>
              {importText ? (
                <button
                  type="button"
                  onClick={() => {
                    setImportText('')
                    setImportSummary(null)
                  }}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[#1A1A1A]/55 hover:bg-black/[0.05]"
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              ) : null}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={onImportFile}
            />
            {importSummary ? (
              <div className="mt-3 rounded-lg border border-[#9FE870]/50 bg-[#9FE870]/10 px-3 py-2 text-xs leading-relaxed text-[#1A1A1A]/75">
                <b className="font-semibold text-[#1A1A1A]">
                  {importSummary.guestCount} guest {importSummary.guestCount === 1 ? 'row' : 'rows'} found
                </b>
                {' from '}{importSummary.importedSheets.join(', ')}.
                {importSummary.skippedSheets.length > 0 ? (
                  <> Skipped non-guest {importSummary.skippedSheets.length === 1 ? 'sheet' : 'sheets'}: {importSummary.skippedSheets.join(', ')}.</>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-black/[0.1] bg-white p-4">
            <h4 className="text-sm font-semibold text-[#1A1A1A]">Columns we read</h4>
            <dl className="mt-3 grid grid-cols-[minmax(110px,0.8fr)_1.4fr_auto] gap-x-3 gap-y-2 text-xs leading-relaxed">
              <dt className="font-medium text-[#1A1A1A]">Name / Jina</dt>
              <dd className="text-[#1A1A1A]/60">Guest or couple name</dd>
              <dd className="font-medium text-rose-600">Required</dd>
              <dt className="font-medium text-[#1A1A1A]">Phone number</dt>
              <dd className="text-[#1A1A1A]/60">Phone, Mobile, WhatsApp or Namba ya Simu</dd>
              <dd className="text-[#1A1A1A]/45">Optional</dd>
              <dt className="font-medium text-[#1A1A1A]">Email</dt>
              <dd className="text-[#1A1A1A]/60">Email or Barua Pepe</dd>
              <dd className="text-[#1A1A1A]/45">Optional</dd>
              <dt className="font-medium text-[#1A1A1A]">Ticket Type</dt>
              <dd className="text-[#1A1A1A]/60">Single or Double</dd>
              <dd className="text-[#1A1A1A]/45">Optional</dd>
            </dl>
            <p className="mt-3 border-t border-black/[0.06] pt-3 text-xs leading-relaxed text-[#1A1A1A]/60">
              More than one sheet? We import every sheet with a recognized Name / Jina header and skip sheets such as Review, Summary and Instructions. Extra columns are ignored.
            </p>
          </div>

          <details className="group rounded-xl border border-black/[0.1] bg-white/60 p-4 open:bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-[#1A1A1A]">
              {copy.import_rules_title}
              <ChevronDown className="h-4 w-4 shrink-0 text-[#1A1A1A]/40 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="mt-3 space-y-2">
              {importRules.map((rule) => (
                <li key={rule} className="flex gap-2 text-xs leading-relaxed text-[#1A1A1A]/70">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9FE870]" />
                  {rule}
                </li>
              ))}
            </ul>
            {copy.import_rules_note ? (
              <p className="mt-3 border-t border-black/[0.06] pt-3 text-xs text-[#1A1A1A]/55">
                {copy.import_rules_note}
              </p>
            ) : null}
          </details>

          <Field label="Or paste names" hint="One per line. Optionally: Name, email, phone, ticket type">
            <textarea
              className={inputClass}
              rows={8}
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value)
                setImportSummary(null)
              }}
              placeholder={'Asha Mussa, asha@email.com, 0712345678, Single\nMr & Mrs Juma, , 0755000850, Double\nGrace Mollel, grace@email.com'}
            />
          </Field>

          {events.length > 0 ? (
            <Field label="Invite all to">
              <div className="space-y-2 rounded-xl border border-black/[0.1] p-3">
                {events.map((ev) => (
                  <label key={ev.id} className="flex items-center gap-2 text-sm text-[#1A1A1A]/80">
                    <input
                      type="checkbox"
                      checked={importEventIds.includes(ev.id)}
                      onChange={() =>
                        setImportEventIds((ids) =>
                          ids.includes(ev.id) ? ids.filter((x) => x !== ev.id) : [...ids, ev.id]
                        )
                      }
                      className="h-4 w-4 rounded border-black/20 accent-[#C9A0DC]"
                    />
                    {ev.name}
                  </label>
                ))}
              </div>
            </Field>
          ) : null}
        </div>
      </Slideover>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmRemove}
        title={pendingDelete ? `Remove ${pendingDelete.full_name}?` : ''}
        description="Their RSVP responses and personal invite link will be deleted too. This can't be undone."
        confirmLabel="Remove guest"
        pending={pending}
      />

      <ConfirmDialog
        open={pendingBulkDelete}
        onClose={() => setPendingBulkDelete(false)}
        onConfirm={bulkRemove}
        title={`Remove ${selected.size} ${selected.size === 1 ? 'guest' : 'guests'}?`}
        description="Their RSVP responses and personal invite links will be deleted. This can't be undone."
        confirmLabel={`Remove ${selected.size}`}
        pending={pending}
      />
    </div>
  )
}

// ──────────────────────── page sub-nav ────────────────────────

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold leading-none tracking-tight text-[#1A1A1A]">
        {value}
      </div>
      <div className="mt-1 text-xs font-medium text-[#1A1A1A]/55">{label}</div>
    </div>
  )
}

function GuestSubNav({
  view,
  onChange,
  copy,
  events,
  eventFilter,
  scopeStrings,
  pending,
}: {
  view: GuestView
  onChange: (v: GuestView) => void
  copy: GuestsDashboardCopy
  events: { id: string; name: string }[]
  eventFilter: string
  scopeStrings: DashboardEventScopeStrings
  pending: boolean
}) {
  const items: { id: GuestView; label: string; badge?: number }[] = [
    { id: 'manage', label: copy.nav_manage },
  ]
  return (
    <nav
      role="tablist"
      aria-label="Guest list views"
      className="-mx-4 flex flex-wrap items-center gap-x-6 gap-y-2 overflow-x-auto overflow-y-hidden border-b border-black/[0.06] px-4 pb-2 sm:mx-0 sm:px-0"
    >
      {items.map((item) => {
        const active = item.id === view
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              '-mb-[9px] inline-flex items-center gap-2 border-b-2 pb-2.5 text-sm transition-colors',
              active
                ? 'border-[#1A1A1A] font-semibold text-[#1A1A1A]'
                : 'border-transparent font-medium text-[#1A1A1A]/55 hover:text-[#1A1A1A]',
            )}
          >
            {item.label}
            {item.badge ? (
              <span
                className={cn(
                  'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
                  active ? 'bg-[#1A1A1A] text-white' : 'bg-black/[0.06] text-[#1A1A1A]/65',
                )}
              >
                {item.badge}
              </span>
            ) : null}
          </button>
        )
      })}
      <Link
        href="/my/dashboard/guests/customize"
        className="-mb-[9px] inline-flex items-center gap-2 border-b-2 border-transparent pb-2.5 text-sm font-medium text-[#1A1A1A]/55 transition-colors hover:text-[#1A1A1A]"
      >
        <ClipboardSignature className="h-3.5 w-3.5" />
        {copy.nav_collector}
      </Link>
      <Link
        href="/my/dashboard/pledges"
        className="-mb-[9px] inline-flex items-center gap-1.5 border-b-2 border-transparent pb-2.5 text-sm font-medium text-[#1A1A1A]/55 hover:text-[#1A1A1A]"
      >
        {copy.nav_pledges} <ArrowUp className="h-3 w-3 rotate-45" aria-hidden="true" />
      </Link>
      <Link
        href="/my/dashboard/rsvps"
        className="-mb-[9px] inline-flex items-center gap-1.5 border-b-2 border-transparent pb-2.5 text-sm font-medium text-[#1A1A1A]/55 hover:text-[#1A1A1A]"
      >
        {copy.nav_rsvps} <ArrowUp className="h-3 w-3 rotate-45" aria-hidden="true" />
      </Link>
      {events.length > 1 ? (
        <EventPicker
          events={events}
          selectedId={eventFilter}
          strings={scopeStrings}
          allowAll
          disabled={pending}
          className="ml-auto"
        />
      ) : null}
    </nav>
  )
}

function ViewBanner({
  view,
  notInvited,
  missingAddress,
  onClear,
}: {
  view: GuestView
  notInvited: number
  missingAddress: number
  onClear: () => void
}) {
  const copy =
    view === 'invite'
      ? notInvited > 0
        ? `Showing ${notInvited} ${notInvited === 1 ? 'guest who hasn’t' : 'guests who haven’t'} been invited to anything yet. Tick events on the RSVPs tab of each guest to invite them.`
        : 'Every guest has been invited at least once. Switch back to Manage guest list to see them all.'
      : missingAddress > 0
        ? `Showing ${missingAddress} ${missingAddress === 1 ? 'guest' : 'guests'} missing a mailing address. Tap “Add address” on any row to fill it in.`
        : 'Every guest has a mailing address. Switch back to Manage guest list to see them all.'
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.06] bg-[#FBFAF8] px-4 py-2.5 text-xs text-[#1A1A1A]/70">
      <p className="leading-snug">{copy}</p>
      <button
        type="button"
        onClick={onClear}
        className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-[#1A1A1A]/70 hover:bg-black/[0.05] hover:text-[#1A1A1A]"
      >
        Clear view
      </button>
    </div>
  )
}

// ──────────────────────── slideover sub-tabs ────────────────────────

const TITLE_OPTIONS = ['Mr', 'Mrs', 'Ms', 'Mx', 'Dr']

function NameRow({
  title,
  first,
  last,
  suffix,
  onChange,
  required = false,
}: {
  title: string
  first: string
  last: string
  suffix: string
  onChange: (patch: { title?: string; first?: string; last?: string; suffix?: string }) => void
  required?: boolean
}) {
  return (
    <div className="grid grid-cols-[80px_1fr_1fr_80px] gap-2">
      <Field label="Title">
        <select
          className={inputClass}
          value={title}
          onChange={(e) => onChange({ title: e.target.value })}
        >
          <option value=""></option>
          {TITLE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>
      <Field label={required ? 'First name *' : 'First name'}>
        <input
          className={inputClass}
          value={first}
          onChange={(e) => onChange({ first: e.target.value })}
        />
      </Field>
      <Field label={required ? 'Last name *' : 'Last name'}>
        <input
          className={inputClass}
          value={last}
          onChange={(e) => onChange({ last: e.target.value })}
        />
      </Field>
      <Field label="Suffix">
        <input
          className={inputClass}
          value={suffix}
          placeholder="Jr."
          onChange={(e) => onChange({ suffix: e.target.value })}
        />
      </Field>
    </div>
  )
}

function GuestInfoTab({
  form,
  setForm,
  addPlusOne,
  removePlusOne,
  addChild,
  updateChild,
  removeChild,
}: {
  form: GuestInput
  setForm: React.Dispatch<React.SetStateAction<GuestInput>>
  addPlusOne: () => void
  removePlusOne: () => void
  addChild: () => void
  updateChild: (idx: number, patch: Partial<ChildEntry>) => void
  removeChild: (idx: number) => void
}) {
  const plusOneShown = hasPlusOne(form) || (form.plus_one_first_name ?? '') !== '' || (form.plus_one_last_name ?? '') !== ''
  const children = form.children ?? []

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-[#1A1A1A]">Primary guest</h4>
        <NameRow
          required
          title={form.title ?? ''}
          first={form.first_name ?? ''}
          last={form.last_name ?? ''}
          suffix={form.suffix ?? ''}
          onChange={(patch) =>
            setForm((f) => ({
              ...f,
              title: patch.title ?? f.title,
              first_name: patch.first ?? f.first_name,
              last_name: patch.last ?? f.last_name,
              suffix: patch.suffix ?? f.suffix,
            }))
          }
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Email">
            <input
              type="email"
              className={inputClass}
              value={form.email ?? ''}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com"
            />
          </Field>
          <Field label="Mobile" hint="Include the country code for guests outside Tanzania">
            <input
              className={inputClass}
              value={form.phone ?? ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+255 7XX XXX XXX"
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="WhatsApp" hint="If different from mobile — include the country code">
            <input
              className={inputClass}
              value={form.whatsapp_phone ?? ''}
              onChange={(e) => setForm({ ...form, whatsapp_phone: e.target.value })}
              placeholder="+255 7XX XXX XXX"
            />
          </Field>
          <Field label="Group">
            <input
              className={inputClass}
              value={form.group_tag ?? ''}
              onChange={(e) => setForm({ ...form, group_tag: e.target.value })}
              placeholder="e.g. Family"
            />
          </Field>
        </div>
        <Field label="Notes" hint="Optional — meal preferences, accessibility, anything to remember">
          <textarea
            rows={3}
            className={inputClass}
            value={form.notes ?? ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Vegetarian, requires wheelchair access…"
          />
        </Field>
        <Field label="Ticket type">
          <div className="grid grid-cols-2 gap-2">
            {([1, 2] as const).map((size) => {
              const active = (form.max_party_size ?? 1) === size
              return (
                <button
                  key={size}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setForm({ ...form, max_party_size: size })}
                  className={cn(
                    'rounded-full border px-3 py-2 text-sm font-semibold transition-colors',
                    active
                      ? 'border-[#C9A0DC] bg-[#F0DFF6] text-[#5d3a78]'
                      : 'border-black/[0.12] text-[#1A1A1A]/70 hover:bg-black/[0.04]',
                  )}
                >
                  {size === 2 ? 'Double' : 'Single'}
                </button>
              )
            })}
          </div>
        </Field>
      </section>

      {plusOneShown ? (
        <section className="space-y-3 border-t border-black/[0.06] pt-5">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[#1A1A1A]">Plus one</h4>
            <button
              type="button"
              onClick={removePlusOne}
              aria-label="Remove plus one"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-[#1A1A1A]/75">
            <input
              type="checkbox"
              checked={form.plus_one_name_unknown === true}
              onChange={(e) =>
                setForm({ ...form, plus_one_name_unknown: e.target.checked })
              }
              className="h-4 w-4 rounded border-black/20 accent-[#1A1A1A]"
            />
            Name unknown for now
          </label>
          {!form.plus_one_name_unknown ? (
            <NameRow
              title={form.plus_one_title ?? ''}
              first={form.plus_one_first_name ?? ''}
              last={form.plus_one_last_name ?? ''}
              suffix={form.plus_one_suffix ?? ''}
              onChange={(patch) =>
                setForm((f) => ({
                  ...f,
                  plus_one_title: patch.title ?? f.plus_one_title,
                  plus_one_first_name: patch.first ?? f.plus_one_first_name,
                  plus_one_last_name: patch.last ?? f.plus_one_last_name,
                  plus_one_suffix: patch.suffix ?? f.plus_one_suffix,
                }))
              }
            />
          ) : null}
        </section>
      ) : null}

      {children.length > 0 ? (
        <section className="space-y-3 border-t border-black/[0.06] pt-5">
          <h4 className="text-sm font-semibold text-[#1A1A1A]">Children</h4>
          <div className="space-y-3">
            {children.map((child, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <Field label={idx === 0 ? 'First name' : ''}>
                  <input
                    className={inputClass}
                    value={child.first_name}
                    onChange={(e) => updateChild(idx, { first_name: e.target.value })}
                  />
                </Field>
                <Field label={idx === 0 ? 'Last name' : ''}>
                  <input
                    className={inputClass}
                    value={child.last_name}
                    onChange={(e) => updateChild(idx, { last_name: e.target.value })}
                  />
                </Field>
                <button
                  type="button"
                  onClick={() => removeChild(idx)}
                  aria-label="Remove child"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-wrap gap-2 border-t border-black/[0.06] pt-5">
        {!plusOneShown ? (
          <button
            type="button"
            onClick={addPlusOne}
            className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.12] px-3 py-1.5 text-xs font-semibold text-[#1A1A1A] hover:bg-black/[0.04]"
          >
            <Plus className="h-3.5 w-3.5" /> Add plus one
          </button>
        ) : null}
        <button
          type="button"
          onClick={addChild}
          className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.12] px-3 py-1.5 text-xs font-semibold text-[#1A1A1A] hover:bg-black/[0.04]"
        >
          <Plus className="h-3.5 w-3.5" /> Add child
        </button>
      </section>
    </div>
  )
}

function MailingAddressTab({
  form,
  setForm,
}: {
  form: GuestInput
  setForm: React.Dispatch<React.SetStateAction<GuestInput>>
}) {
  const composed = [
    `${form.title ?? ''} ${form.first_name ?? ''} ${form.last_name ?? ''} ${form.suffix ?? ''}`
      .trim()
      .replace(/\s+/g, ' '),
    !form.plus_one_name_unknown && (form.plus_one_first_name || form.plus_one_last_name)
      ? `${form.plus_one_title ?? ''} ${form.plus_one_first_name ?? ''} ${form.plus_one_last_name ?? ''} ${form.plus_one_suffix ?? ''}`
          .trim()
          .replace(/\s+/g, ' ')
      : null,
  ]
    .filter(Boolean)
    .join(' and ')

  return (
    <div className="space-y-4">
      <Field
        label="Name on envelope"
        hint={composed ? `Suggested: ${composed}` : 'How the guest should be addressed'}
      >
        <input
          className={inputClass}
          value={form.name_on_envelope ?? ''}
          onChange={(e) => setForm({ ...form, name_on_envelope: e.target.value })}
          placeholder={composed || 'Boris Massesa and Inviolatha Mbuya'}
        />
      </Field>

      <Field label="Country">
        <input
          className={inputClass}
          value={form.address_country ?? ''}
          onChange={(e) => setForm({ ...form, address_country: e.target.value })}
          placeholder="Tanzania"
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
        <Field label="Street address">
          <input
            className={inputClass}
            value={form.address_line1 ?? ''}
            onChange={(e) => setForm({ ...form, address_line1: e.target.value })}
            placeholder="e.g. Mlimani Drive"
          />
        </Field>
        <Field label="Apt / floor">
          <input
            className={inputClass}
            value={form.address_apt ?? ''}
            onChange={(e) => setForm({ ...form, address_apt: e.target.value })}
            placeholder="Apt 4B"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_120px]">
        <Field label="City">
          <input
            className={inputClass}
            value={form.address_city ?? ''}
            onChange={(e) => setForm({ ...form, address_city: e.target.value })}
            placeholder="Dar es Salaam"
          />
        </Field>
        <Field label="Region / state">
          <input
            className={inputClass}
            value={form.address_region ?? ''}
            onChange={(e) => setForm({ ...form, address_region: e.target.value })}
          />
        </Field>
        <Field label="Postal code">
          <input
            className={inputClass}
            value={form.address_postal_code ?? ''}
            onChange={(e) => setForm({ ...form, address_postal_code: e.target.value })}
          />
        </Field>
      </div>

      <p className="text-xs text-[#1A1A1A]/55">
        Mailing addresses are optional — OpusPass is digital-first. Only fill this in if you&apos;re
        planning printed save-the-dates or wedding invitations.
      </p>
    </div>
  )
}

function RsvpsTab({
  form,
  events,
  invitations,
  toggleEvent,
}: {
  form: GuestInput
  events: WeddingEvent[]
  invitations: GuestWithInvitations['invitations']
  toggleEvent: (id: string) => void
}) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-black/[0.05] text-[#1A1A1A]/45">
          <CalendarHeart className="h-6 w-6" aria-hidden="true" />
        </span>
        <h4 className="text-base font-semibold text-[#1A1A1A]">
          You haven&apos;t added any events yet
        </h4>
        <p className="mt-1 max-w-sm text-sm text-[#1A1A1A]/55">
          Add a ceremony, reception, or any gathering on the Events tab. You&apos;ll be able to
          invite this guest and see their RSVPs here.
        </p>
      </div>
    )
  }

  const statusByEvent = new Map(invitations.map((inv) => [inv.event_id, inv]))

  return (
    <div className="space-y-3">
      <p className="text-sm text-[#1A1A1A]/60">
        Pick the events this guest is invited to. They&apos;ll only see ticked events on their RSVP
        page.
      </p>
      <div className="divide-y divide-black/[0.05] rounded-xl border border-black/[0.08]">
        {events.map((ev) => {
          const invited = (form.eventIds ?? []).includes(ev.id)
          const inv = statusByEvent.get(ev.id)
          return (
            <label key={ev.id} className="flex items-center gap-3 px-3 py-3">
              <input
                type="checkbox"
                checked={invited}
                onChange={() => toggleEvent(ev.id)}
                className="h-4 w-4 rounded border-black/20 accent-[#1A1A1A]"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#1A1A1A]">{ev.name}</p>
                {ev.starts_at ? (
                  <p className="text-xs text-[#1A1A1A]/55">
                    {new Date(ev.starts_at).toLocaleDateString('en-GB', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>
                ) : null}
              </div>
              {invited && inv ? (
                <StatusPill status={inv.rsvp_status} />
              ) : invited ? (
                <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-xs text-[#1A1A1A]/55">
                  {RSVP_STATUS_LABELS.pending}
                </span>
              ) : null}
            </label>
          )
        })}
      </div>
    </div>
  )
}
