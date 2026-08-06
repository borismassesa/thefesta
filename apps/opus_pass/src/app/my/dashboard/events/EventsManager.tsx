'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Image from 'next/image'
import {
  ArrowRight,
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Clock,
  Globe2,
  ImageOff,
  Link2,
  Unlink,
} from 'lucide-react'
import { Card } from '@/components/dashboard/primitives'
import { Button, ConfirmDialog, Field, inputClass } from '@/components/dashboard/controls'
import { cn } from '@/lib/utils'
import { eatDateParts } from '@/lib/dashboard/share'
import {
  createEvent,
  updateEvent,
  deleteEvent,
  assignOrderToEvent,
  unassignOrderFromEvent,
  type EventInput,
} from '@/lib/dashboard/actions'
import {
  EVENT_TYPE_LABELS,
  eventTypeLabel,
  type EventType,
  type WeddingEvent,
} from '@/lib/dashboard/types'
import type { EventOrderLinks, PaidOrderSummary } from '@/lib/dashboard/queries'
import type { DashboardEventsStrings } from '@/lib/cms/ui-strings-fallback'

// Substitute {var} placeholders in a CMS template with runtime values.
const fmt = (t: string, v: Record<string, string | number>) =>
  t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m))

const EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS) as EventType[]
const NAME_MAX = 100

// ----------------------------------------------------------------------- types

type FormState = {
  name: string
  event_type: EventType
  /** Free-text label used when event_type is 'other'. */
  custom_type: string
  /** Celebrants' names — printed (as first names) on the Entrance Pass
   *  Ticket. Second is optional: a kitchen party or birthday has one
   *  celebrant. */
  partner1_name: string
  partner2_name: string
  startDate: string
  venue_name: string
  address: string
  city: string
  is_public: boolean
  allow_rsvp: boolean
  // Not editable in this form (no UI control), but carried through unchanged
  // on save so an existing event's time-of-day / end / attire / note aren't
  // silently wiped out — see git history of this file for why that matters.
  _startTime: string
  _endsAt: string | null
  _dressCode: string | null
  _description: string | null
}

const EMPTY_FORM: FormState = {
  name: '',
  event_type: 'wedding',
  custom_type: '',
  partner1_name: '',
  partner2_name: '',
  startDate: '',
  venue_name: '',
  address: '',
  city: '',
  is_public: true,
  allow_rsvp: false,
  _startTime: '00:00',
  _endsAt: null,
  _dressCode: null,
  _description: null,
}

// ------------------------------------------------------------------- helpers

/**
 * Event times are East Africa Time, always — never the editor's own timezone.
 *
 * These used to read and write in whatever timezone the browser happened to be
 * in. Every consumer of starts_at disagrees: formatSwahiliTime and the
 * entrance-pass vars read it through eatDateParts, and updateEventTicketDetails
 * writes it anchored to +03:00. So the pair was consistent only while the
 * person editing sat in EAT. Edit the same wedding from Toronto and "18:00"
 * was stored as 18:00 EDT, which is 01:00 the next morning in Dar es Salaam —
 * and that wrong hour is what goes out on the guest's entrance pass.
 *
 * The venue's clock is the only one that means anything to a guest standing at
 * the gate, so both directions are pinned to it.
 */
function splitLocal(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '', time: '' }
  const { year, month, day, hour, minute } = eatDateParts(d)
  const pad = (n: number) => String(n).padStart(2, '0')
  return { date: `${year}-${pad(month)}-${pad(day)}`, time: `${pad(hour)}:${pad(minute)}` }
}

function combineLocal(date: string, time: string): string | null {
  if (!date) return null
  const t = time || '00:00'
  const eat = new Date(`${date}T${t}:00+03:00`)
  if (Number.isNaN(eat.getTime())) return null
  return eat.toISOString()
}

function fromEvent(e: WeddingEvent): FormState {
  const start = splitLocal(e.starts_at)
  const known = e.event_type in EVENT_TYPE_LABELS
  return {
    name: e.name,
    event_type: known ? e.event_type : 'other',
    custom_type: known ? '' : e.event_type,
    partner1_name: e.partner1_name ?? '',
    partner2_name: e.partner2_name ?? '',
    startDate: start.date,
    venue_name: e.venue_name ?? '',
    address: e.address ?? '',
    city: e.city ?? '',
    is_public: e.is_public,
    allow_rsvp: e.allow_rsvp,
    _startTime: start.time || '00:00',
    _endsAt: e.ends_at,
    _dressCode: e.dress_code,
    _description: e.description,
  }
}

function toPayload(f: FormState): EventInput {
  const event_type =
    f.event_type === 'other' && f.custom_type.trim()
      ? (f.custom_type.trim() as EventType)
      : f.event_type
  return {
    name: f.name.trim(),
    event_type,
    description: f._description,
    partner1_name: f.partner1_name.trim() || null,
    partner2_name: f.partner2_name.trim() || null,
    venue_name: f.venue_name.trim() || null,
    address: f.address.trim() || null,
    city: f.city.trim() || null,
    starts_at: combineLocal(f.startDate, f._startTime),
    ends_at: f._endsAt,
    dress_code: f._dressCode,
    is_public: f.is_public,
    allow_rsvp: f.allow_rsvp,
  }
}

function formatStartsAt(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatWhen(date: string, time: string): string | null {
  const iso = combineLocal(date, time)
  if (!iso) return null
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ------------------------------------------------------------------ component

type SelectedId = string | 'new'

export default function EventsManager({
  initialEvents,
  orderLinks,
  strings,
}: {
  initialEvents: WeddingEvent[]
  orderLinks: EventOrderLinks
  strings: DashboardEventsStrings
}) {
  const router = useRouter()
  // Top-level view: the list of events, or the create/edit form.
  const [view, setView] = useState<'list' | 'form'>(
    initialEvents.length ? 'list' : 'form',
  )
  const [selectedId, setSelectedId] = useState<SelectedId>('new')
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [original, setOriginal] = useState<FormState>(EMPTY_FORM)
  const [pendingDelete, setPendingDelete] = useState<WeddingEvent | null>(null)
  const [pending, startTransition] = useTransition()

  const editing = useMemo(
    () => (selectedId === 'new' ? null : initialEvents.find((e) => e.id === selectedId) ?? null),
    [initialEvents, selectedId],
  )

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(original), [form, original])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // Block navigation away from a form with unsaved edits.
  function guardDirty() {
    return view !== 'form' || !dirty || confirm(strings.unsaved_confirm)
  }

  function openList() {
    if (!guardDirty()) return
    setView('list')
  }

  function openNew() {
    if (!guardDirty()) return
    setSelectedId('new')
    setForm(EMPTY_FORM)
    setOriginal(EMPTY_FORM)
    setView('form')
  }

  function openEvent(id: string) {
    if (!guardDirty()) return
    const event = initialEvents.find((e) => e.id === id)
    if (!event) return
    const next = fromEvent(event)
    setSelectedId(id)
    setForm(next)
    setOriginal(next)
    setView('form')
  }

  function resetAddress() {
    setForm((prev) => ({ ...prev, address: '', city: '' }))
  }

  function save() {
    if (!form.name.trim()) {
      toast.error(strings.toast_name_required)
      return
    }
    const payload = toPayload(form)
    startTransition(async () => {
      try {
        if (editing) {
          await updateEvent(editing.id, payload)
          toast.success(strings.toast_updated)
        } else {
          await createEvent(payload)
          toast.success(strings.toast_added)
          setSelectedId('new')
          setForm(EMPTY_FORM)
          setOriginal(EMPTY_FORM)
        }
        // Drop back to the list so the saved event is visible right away.
        setView('list')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : strings.toast_error_generic)
      }
    })
  }

  function confirmRemove() {
    const target = pendingDelete
    if (!target) return
    startTransition(async () => {
      try {
        await deleteEvent(target.id)
        toast.success(strings.toast_deleted)
        setPendingDelete(null)
        // If the deleted event was open in the form, return to the list.
        if (selectedId === target.id) {
          setSelectedId('new')
          setForm(EMPTY_FORM)
          setOriginal(EMPTY_FORM)
          setView('list')
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : strings.toast_delete_error)
      }
    })
  }

  // -------------------------------------------------------------------- render

  return (
    <div className="space-y-6">
      <header className="dash-header-safe border-b border-black/[0.06] pb-6">
        <h1 className="text-2xl font-bold tracking-tight text-[#1A1A1A] sm:text-3xl">
          {strings.page_title}
        </h1>
        <p className="mt-2 text-sm text-[#1A1A1A]/65 sm:text-base">
          {strings.page_description}
        </p>
      </header>

      <ViewTabs
        view={view}
        isNew={selectedId === 'new'}
        count={initialEvents.length}
        onList={openList}
        onCreate={openNew}
        strings={strings}
      />

      {view === 'list' ? (
        <EventList
          events={initialEvents}
          onEdit={openEvent}
          onCreate={openNew}
          onDelete={(e) => setPendingDelete(e)}
          strings={strings}
        />
      ) : (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_28rem]">
        {/* ──────────────────────── Left: editor ──────────────────────── */}
        <div className="min-w-0 space-y-6">
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={openList}
              className="mb-1 inline-flex items-center gap-1.5 text-sm font-medium text-[#1A1A1A]/55 transition-colors hover:text-[#1A1A1A]"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> {strings.back_all_events}
            </button>
            <h2 className="text-xl font-semibold text-[#1A1A1A]">
              {editing ? editing.name || strings.untitled_event : strings.heading_new_event}
            </h2>
            <p className="text-sm text-[#1A1A1A]/60">
              {strings.editor_subtitle}
            </p>
          </div>

          {/* Event type + name */}
          <div className="space-y-4">
            <Field label={strings.field_event_type} required>
              <div className="relative">
                <select
                  className={cn(inputClass, 'appearance-none pr-10')}
                  value={form.event_type}
                  onChange={(e) => set('event_type', e.target.value as EventType)}
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {EVENT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1A1A]/45" />
              </div>
              {form.event_type === 'other' ? (
                <input
                  className={cn(inputClass, 'mt-2')}
                  value={form.custom_type}
                  onChange={(e) => set('custom_type', e.target.value)}
                  maxLength={NAME_MAX}
                  placeholder={strings.placeholder_custom_type}
                />
              ) : null}
            </Field>

            <Field label={strings.field_event_name} required>
              <input
                className={inputClass}
                value={form.name}
                maxLength={NAME_MAX}
                onChange={(e) => set('name', e.target.value)}
                placeholder={strings.placeholder_event_name}
              />
              <CounterRow value={form.name.length} max={NAME_MAX} hint={strings.hint_max_100} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={strings.field_partner1}>
                <input
                  className={inputClass}
                  value={form.partner1_name}
                  maxLength={NAME_MAX}
                  onChange={(e) => set('partner1_name', e.target.value)}
                  placeholder={strings.placeholder_partner1}
                />
              </Field>
              <Field label={strings.field_partner2}>
                <input
                  className={inputClass}
                  value={form.partner2_name}
                  maxLength={NAME_MAX}
                  onChange={(e) => set('partner2_name', e.target.value)}
                  placeholder={strings.placeholder_partner2}
                />
              </Field>
            </div>
            <p className="text-xs text-[#1A1A1A]/55">{strings.hint_partner_names}</p>

            <Field label={strings.field_start_date}>
              <input
                type="date"
                className={inputClass}
                value={form.startDate}
                onChange={(e) => set('startDate', e.target.value)}
              />
            </Field>
          </div>

          {/* Event location */}
          <Section title={strings.section_location}>
            <Field
              label={strings.field_venue_name}
              hintInline={
                form.address || form.city ? (
                  <button
                    type="button"
                    onClick={resetAddress}
                    className="text-xs font-medium text-[#7E5896] hover:text-[#5d3a78]"
                  >
                    {strings.reset_address}
                  </button>
                ) : null
              }
            >
              <input
                className={inputClass}
                value={form.venue_name}
                onChange={(e) => set('venue_name', e.target.value)}
                placeholder={strings.placeholder_venue_name}
              />
            </Field>
            <Field label={strings.field_street_address}>
              <input
                className={inputClass}
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
              />
            </Field>
            <Field label={strings.field_city}>
              <input
                className={inputClass}
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
                placeholder={strings.placeholder_city}
              />
            </Field>
          </Section>

          {/* Website settings */}
          <Section title={strings.section_website_settings}>
            <Toggle
              label={strings.toggle_public}
              checked={form.is_public}
              onChange={(v) => set('is_public', v)}
            />
            <Toggle
              label={strings.toggle_allow_rsvp}
              checked={form.allow_rsvp}
              onChange={(v) => set('allow_rsvp', v)}
            />
          </Section>

          {/* Footer */}
          <div className="flex items-center gap-3 border-t border-black/[0.06] pt-5">
            {editing ? (
              <button
                type="button"
                onClick={() => setPendingDelete(editing)}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition-colors hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {strings.delete_event}
              </button>
            ) : null}
            <Button onClick={save} disabled={pending || !dirty || !form.name.trim()}>
              {pending ? strings.btn_saving : editing ? strings.btn_save_changes : strings.btn_add_event}
            </Button>
          </div>
        </div>

        {/* ──────────────────────── Right: preview ──────────────────────── */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <PreviewCard form={form} editing={editing} strings={strings} />
          <LinkedOrderCard
            key={editing ? editing.id : 'new'}
            editing={editing}
            orderLinks={orderLinks}
            strings={strings}
            onLinked={() => router.refresh()}
          />
          <PromoCard strings={strings} />
        </aside>
      </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmRemove}
        title={pendingDelete ? fmt(strings.delete_dialog_title, { name: pendingDelete.name }) : ''}
        description={strings.delete_dialog_description}
        confirmLabel={strings.delete_event}
        pending={pending}
      />
    </div>
  )
}

// ---------------------------------------------------------------- subcomponents

function ViewTabs({
  view,
  isNew,
  count,
  onList,
  onCreate,
  strings,
}: {
  view: 'list' | 'form'
  isNew: boolean
  count: number
  onList: () => void
  onCreate: () => void
  strings: DashboardEventsStrings
}) {
  const tabs = [
    {
      id: 'list',
      label: strings.tab_event_list,
      icon: CalendarDays,
      badge: count,
      active: view === 'list',
      onClick: onList,
    },
    {
      id: 'create',
      label: strings.tab_create_event,
      icon: Plus,
      badge: 0,
      active: view === 'form' && isNew,
      onClick: onCreate,
    },
  ]
  return (
    <nav
      role="tablist"
      aria-label={strings.tabs_aria}
      className="-mx-4 flex flex-wrap items-center gap-x-6 gap-y-2 overflow-x-auto overflow-y-hidden border-b border-black/[0.06] px-4 pb-2 sm:mx-0 sm:px-0"
    >
      {tabs.map(({ id, label, icon: Icon, badge, active, onClick }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={onClick}
          className={cn(
            '-mb-[9px] inline-flex items-center gap-2 border-b-2 pb-2.5 text-sm transition-colors',
            active
              ? 'border-[#1A1A1A] font-semibold text-[#1A1A1A]'
              : 'border-transparent font-medium text-[#1A1A1A]/55 hover:text-[#1A1A1A]',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
          {badge ? (
            <span
              className={cn(
                'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
                active ? 'bg-[#1A1A1A] text-white' : 'bg-black/[0.06] text-[#1A1A1A]/70',
              )}
            >
              {badge}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  )
}

function EventList({
  events,
  onEdit,
  onCreate,
  onDelete,
  strings,
}: {
  events: WeddingEvent[]
  onEdit: (id: string) => void
  onCreate: () => void
  onDelete: (e: WeddingEvent) => void
  strings: DashboardEventsStrings
}) {
  if (!events.length) {
    return (
      <div className="rounded-2xl border border-dashed border-black/[0.14] bg-black/[0.015] px-6 py-14 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F0DFF6] text-[#5d3a78]">
          <CalendarDays className="h-5 w-5" />
        </span>
        <h3 className="mt-4 text-base font-semibold text-[#1A1A1A]">{strings.empty_title}</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-[#1A1A1A]/60">
          {strings.empty_body}
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-[#1A1A1A] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black"
        >
          <Plus className="h-4 w-4" /> {strings.empty_cta}
        </button>
      </div>
    )
  }
  return (
    <div className="space-y-2.5">
      {events.map((e) => {
        const when = formatStartsAt(e.starts_at)
        const meta = [eventTypeLabel(e.event_type), when, e.venue_name].filter(Boolean)
        return (
          <div
            key={e.id}
            className="group flex items-center gap-3 rounded-2xl border border-black/[0.08] bg-white p-3.5 transition-colors hover:border-black/[0.16]"
          >
            <button
              type="button"
              onClick={() => onEdit(e.id)}
              className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F0DFF6] text-[#5d3a78]">
                <CalendarDays className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold text-[#1A1A1A]">
                    {e.name || strings.untitled_event}
                  </span>
                  {e.is_public ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-medium text-[#1A1A1A]/70">
                      <Globe2 className="h-3 w-3" /> {strings.badge_public}
                    </span>
                  ) : (
                    <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-medium text-[#1A1A1A]/55">
                      {strings.badge_hidden}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-xs text-[#1A1A1A]/55">
                  {meta.join(' · ')}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onEdit(e.id)}
              aria-label={strings.aria_edit_event}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#1A1A1A]/55 transition-colors hover:bg-black/[0.04] hover:text-[#1A1A1A] sm:inline-flex"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(e)}
              aria-label={strings.aria_delete_event}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#1A1A1A]/55 transition-colors hover:bg-rose-50 hover:text-rose-600 sm:inline-flex"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <ChevronRight className="h-4 w-4 shrink-0 text-[#1A1A1A]/30 sm:hidden" />
          </div>
        )
      })}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 border-t border-black/[0.06] pt-5">
      <h3 className="text-base font-semibold text-[#1A1A1A]">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function CounterRow({ value, max, hint }: { value: number; max: number; hint?: string }) {
  return (
    <div className="mt-1 flex items-center justify-between text-[11px] text-[#1A1A1A]/45">
      <span>{hint ?? ''}</span>
      <span>
        {value}/{max}
      </span>
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 text-sm text-[#1A1A1A]">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors',
          checked ? 'bg-[#1A1A1A]' : 'bg-black/[0.15]',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </label>
  )
}

function PreviewCard({
  form,
  editing,
  strings,
}: {
  form: FormState
  editing: WeddingEvent | null
  strings: DashboardEventsStrings
}) {
  const when = formatWhen(form.startDate, form._startTime)
  const whereParts = [form.venue_name, form.city].filter(Boolean)
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-black/[0.06] px-5 py-3 text-xs font-medium uppercase tracking-wide text-[#1A1A1A]/55">
        {strings.preview_label}
      </div>
      <div className="space-y-4 p-5">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[#1A1A1A]/55">
          {form.event_type === 'other' && form.custom_type.trim()
            ? form.custom_type.trim()
            : EVENT_TYPE_LABELS[form.event_type]}
          {form.is_public ? (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-[#1A1A1A]/70">
              <Globe2 className="h-3 w-3" /> {strings.preview_visible}
            </span>
          ) : (
            <span className="ml-auto rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-[#1A1A1A]/55">
              {strings.badge_hidden}
            </span>
          )}
        </div>
        <div>
          <h3 className="text-xl font-semibold tracking-tight text-[#1A1A1A]">
            {form.name || (editing ? editing.name : strings.preview_name_placeholder)}
          </h3>
          <div className="mt-3 space-y-1.5 text-sm text-[#1A1A1A]/70">
            {when ? (
              <p className="flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0 text-[#1A1A1A]/40" /> {when}
              </p>
            ) : (
              <p className="flex items-center gap-2 text-[#1A1A1A]/45">
                <Clock className="h-4 w-4 shrink-0" /> {strings.preview_add_date}
              </p>
            )}
            {whereParts.length ? (
              <p className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-[#1A1A1A]/40" />{' '}
                {whereParts.join(', ')}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  )
}

const FALLBACK_ORDER_NAME = 'Invitation design'

function orderLabel(order: PaidOrderSummary, strings: DashboardEventsStrings): string {
  return `${order.cardName ?? FALLBACK_ORDER_NAME} · ${fmt(strings.linked_order_guests, { count: order.purchasedGuests })}`
}

function OrderRow({
  order,
  strings,
  onUnlink,
  unlinking,
}: {
  order: PaidOrderSummary
  strings: DashboardEventsStrings
  onUnlink: () => void
  unlinking: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-black/[0.08] bg-black/[0.015] p-2.5">
      <span className="relative flex h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-black/[0.06]">
        {order.cardImageUrl ? (
          <Image src={order.cardImageUrl} alt="" fill sizes="44px" className="object-cover" unoptimized />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[#1A1A1A]/30">
            <ImageOff className="h-4 w-4" />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#1A1A1A]">{order.cardName ?? FALLBACK_ORDER_NAME}</p>
        <p className="text-xs text-[#1A1A1A]/55">{fmt(strings.linked_order_guests, { count: order.purchasedGuests })}</p>
      </div>
      <button
        type="button"
        onClick={onUnlink}
        disabled={unlinking}
        aria-label={fmt(strings.unlink_aria, { name: order.cardName ?? FALLBACK_ORDER_NAME })}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[#1A1A1A]/45 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Unlink className="h-4 w-4" />
      </button>
    </div>
  )
}

function LinkedOrderCard({
  editing,
  orderLinks,
  strings,
  onLinked,
}: {
  editing: WeddingEvent | null
  orderLinks: EventOrderLinks
  strings: DashboardEventsStrings
  onLinked: () => void
}) {
  const [picked, setPicked] = useState('')
  const [pending, startTransition] = useTransition()

  const linked = editing ? orderLinks.byEvent[editing.id] ?? [] : []
  const unassigned = orderLinks.unassigned
  const hasAnyOrders = linked.length > 0 || unassigned.length > 0

  function link() {
    if (!editing || !picked) return
    startTransition(async () => {
      try {
        await assignOrderToEvent(picked, editing.id)
        toast.success(strings.toast_order_linked)
        setPicked('')
        onLinked()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : strings.toast_order_link_error)
      }
    })
  }

  function unlink(orderId: string) {
    startTransition(async () => {
      try {
        await unassignOrderFromEvent(orderId)
        toast.success(strings.toast_order_unlinked)
        onLinked()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : strings.toast_order_unlink_error)
      }
    })
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-2.5 border-b border-black/[0.06] px-5 py-3">
        <Link2 className="h-3.5 w-3.5 text-[#1A1A1A]/55" />
        <span className="text-xs font-medium uppercase tracking-wide text-[#1A1A1A]/55">
          {strings.linked_order_label}
        </span>
      </div>
      <div className="space-y-4 p-5">
        {!editing ? (
          <p className="text-sm text-[#1A1A1A]/55">{strings.linked_order_empty_new}</p>
        ) : !hasAnyOrders ? (
          <p className="text-sm text-[#1A1A1A]/55">{strings.linked_order_none_available}</p>
        ) : (
          <>
            {linked.length ? (
              <div className="space-y-2.5">
                {linked.map((o) => (
                  <OrderRow
                    key={o.id}
                    order={o}
                    strings={strings}
                    unlinking={pending}
                    onUnlink={() => unlink(o.id)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#1A1A1A]/55">{strings.linked_order_none}</p>
            )}

            {unassigned.length ? (
              <div className="space-y-2 border-t border-black/[0.06] pt-4">
                <p className="text-xs font-medium text-[#1A1A1A]/70">{strings.linked_order_pick_label}</p>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <select
                      className={cn(inputClass, 'appearance-none pr-9 text-sm')}
                      value={picked}
                      disabled={pending}
                      onChange={(e) => setPicked(e.target.value)}
                    >
                      <option value="" disabled>
                        {strings.linked_order_pick_placeholder}
                      </option>
                      {unassigned.map((o) => (
                        <option key={o.id} value={o.id}>
                          {orderLabel(o, strings)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#1A1A1A]/45" />
                  </div>
                  <button
                    type="button"
                    onClick={link}
                    disabled={!picked || pending}
                    className="inline-flex shrink-0 items-center rounded-xl bg-[#1A1A1A] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {strings.linked_order_pick_cta}
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Card>
  )
}

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.825 9.825 0 001.516 5.26l-.999 3.648 3.74-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" />
    </svg>
  )
}

function PromoCard({ strings }: { strings: DashboardEventsStrings }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-2.5 border-b border-black/[0.06] px-5 py-3">
        <WhatsAppGlyph className="h-4 w-4 text-[#25D366]" />
        <span className="text-xs font-medium uppercase tracking-wide text-[#1A1A1A]/55">
          {strings.promo_label}
        </span>
      </div>
      <div className="p-5">
        <p className="text-sm leading-relaxed text-[#1A1A1A]/75">
          {strings.promo_body}
        </p>
        <a
          href="/my/dashboard/guests"
          className="group mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#5d3a78]"
        >
          {strings.promo_cta}
          <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
        </a>
      </div>
    </Card>
  )
}
