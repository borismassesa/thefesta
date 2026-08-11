'use client'

// Event chooser + compact switcher for the event-scoped dashboard pages.
// When a couple has 2+ events and hasn't picked one, the page renders
// <EventChooser> instead of its content; afterwards <EventSwitcher> sits in
// the page header so they can hop between events. Selection is written to
// the `?event=` search param (server components re-query on navigation) and
// mirrored into a cookie so the choice follows the couple across sections.

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, ChevronDown, ChevronRight, Layers, Settings2 } from 'lucide-react'
import { Card } from '@/components/dashboard/primitives'
import { inputClass } from '@/components/dashboard/controls'
import { cn } from '@/lib/utils'
import { formatLongDate } from '@/lib/dashboard/share'
import { eventTypeLabel, type WeddingEvent } from '@/lib/dashboard/types'
import { ACTIVE_EVENT_COOKIE } from '@/lib/dashboard/event-scope-constants'
import type { DashboardEventScopeStrings } from '@/lib/cms/ui-strings-fallback'

const YEAR = 60 * 60 * 24 * 365

export function setActiveEventCookie(id: string) {
  document.cookie = `${ACTIVE_EVENT_COOKIE}=${encodeURIComponent(id)};path=/;max-age=${YEAR};samesite=lax`
}

/**
 * Full-page prompt shown when a multi-event couple opens an event-scoped
 * section without a selection: pick the event you're working on first.
 */
export function EventChooser({
  events,
  strings,
  allowAll = false,
}: {
  events: WeddingEvent[]
  strings: DashboardEventScopeStrings
  allowAll?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()

  function choose(id: string) {
    setActiveEventCookie(id)
    router.push(`${pathname}?event=${id}`)
  }

  return (
    <Card className="w-full p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F0DFF6] text-[#5d3a78]">
          <CalendarDays className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[#1A1A1A]">
            {strings.chooser_title}
          </h2>
          <p className="mt-0.5 text-sm text-[#1A1A1A]/60">{strings.chooser_description}</p>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {events.map((event) => {
          const meta = [
            event.starts_at ? formatLongDate(event.starts_at) : strings.chooser_no_date,
            event.venue_name,
          ]
            .filter(Boolean)
            .join(' · ')
          return (
            <button data-opus-button="neutral" data-opus-button-size="medium"
              key={event.id}
              type="button"
              onClick={() => choose(event.id)}
              className="group flex w-full items-center gap-4 rounded-2xl border border-black/[0.08] bg-white p-4 text-left transition hover:border-[#C9A0DC] hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F0DFF6] text-[#5d3a78]">
                <CalendarDays className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold text-[#1A1A1A]">{event.name}</span>
                  <span className="rounded-full bg-[#9FE870] px-2 py-0.5 text-[11px] font-semibold text-[#1A1A1A]">
                    {eventTypeLabel(event.event_type)}
                  </span>
                </span>
                {meta ? <span className="mt-0.5 block truncate text-sm text-[#1A1A1A]/55">{meta}</span> : null}
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-[#1A1A1A]/30 transition group-hover:translate-x-0.5 group-hover:text-[#5d3a78]" />
            </button>
          )
        })}

        {allowAll ? (
          <button data-opus-button="neutral" data-opus-button-size="medium"
            type="button"
            onClick={() => choose('all')}
            className="group flex w-full items-center gap-4 rounded-2xl border border-dashed border-black/[0.12] bg-black/[0.015] p-4 text-left transition hover:border-[#C9A0DC]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/[0.05] text-[#1A1A1A]/60">
              <Layers className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-[#1A1A1A]">{strings.chooser_all_option}</span>
              <span className="mt-0.5 block text-sm text-[#1A1A1A]/55">{strings.chooser_all_hint}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-[#1A1A1A]/30 transition group-hover:translate-x-0.5 group-hover:text-[#5d3a78]" />
          </button>
        ) : null}
      </div>

      <div className="mt-6 border-t border-black/[0.06] pt-4">
        <Link
          href="/my/dashboard/events"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#5d3a78] hover:underline"
        >
          <Settings2 className="h-4 w-4" /> {strings.chooser_manage}
        </Link>
      </div>
    </Card>
  )
}

/**
 * Compact header control for switching events after one is chosen. Pushes
 * `?event=` (server pages re-query) and refreshes the cross-page cookie.
 */
export function EventSwitcher({
  events,
  selectedId,
  strings,
  allowAll = false,
  disabled = false,
  className,
}: {
  events: Pick<WeddingEvent, 'id' | 'name'>[]
  /** Currently selected event id, or 'all' when the all-events view is active. */
  selectedId: string
  strings: DashboardEventScopeStrings
  allowAll?: boolean
  disabled?: boolean
  className?: string
}) {
  const router = useRouter()
  const pathname = usePathname()

  if (events.length < 2) return null

  function switchTo(id: string) {
    setActiveEventCookie(id)
    router.push(`${pathname}?event=${id}`)
  }

  return (
    <label className={cn('flex items-center gap-2', className)}>
      <span className="text-sm font-medium text-[#1A1A1A]/60">{strings.switcher_label}</span>
      <span className="relative inline-flex items-center">
        <select
          className={cn(inputClass, 'w-auto appearance-none pr-9')}
          value={selectedId}
          onChange={(e) => switchTo(e.target.value)}
          disabled={disabled}
        >
          {allowAll ? <option value="all">{strings.switcher_all}</option> : null}
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#1A1A1A]/45" />
      </span>
    </label>
  )
}

/**
 * The bordered "EVENT ｜ Name ⌄" event picker shared across the simple
 * header pages (seating, guestbook, gift registry, thank you, RSVPs). The
 * label rides inside the control on the left with a short divider — inset
 * top and bottom so it doesn't run edge to edge — before the selected name.
 *
 * Selecting an event navigates the current route to `?event=<id>` (and pins
 * the active-event cookie) by default; pass `onSelect` to drive local state
 * instead (e.g. the RSVP setup tab, which isn't URL-scoped).
 */
export function EventPicker({
  events,
  selectedId,
  strings,
  allowAll = false,
  disabled = false,
  onSelect,
  className,
}: {
  events: Pick<WeddingEvent, 'id' | 'name'>[]
  selectedId: string
  strings: DashboardEventScopeStrings
  allowAll?: boolean
  disabled?: boolean
  onSelect?: (id: string) => void
  className?: string
}) {
  const router = useRouter()
  const pathname = usePathname()

  if (events.length < 2) return null

  function switchTo(id: string) {
    if (onSelect) {
      onSelect(id)
      return
    }
    setActiveEventCookie(id)
    router.push(`${pathname}?event=${id}`)
  }

  return (
    <label className={cn('relative inline-flex items-center', className)}>
      <span className="pointer-events-none absolute left-3 text-xs font-medium uppercase tracking-wide text-[#1A1A1A]/40">
        {strings.switcher_label}
      </span>
      {/* Divider between the label and the selected name — inset top/bottom. */}
      <span className="pointer-events-none absolute left-[68px] top-2 bottom-2 w-px bg-black/[0.12]" />
      <select
        value={selectedId}
        onChange={(e) => switchTo(e.target.value)}
        disabled={disabled}
        className="appearance-none rounded-xl border border-black/[0.12] bg-white py-2.5 pl-[86px] pr-9 text-sm font-semibold text-[#1A1A1A] outline-none focus:border-[#C9A0DC] focus:ring-2 focus:ring-[#C9A0DC]/30 disabled:opacity-60"
      >
        {allowAll ? <option value="all">{strings.switcher_all}</option> : null}
        {events.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1A1A]/40" />
    </label>
  )
}
