'use client'

// The admin's single notification bell. Two things feed it:
//
//  1. `staff_notifications` (channel='bell') for the signed-in employee — the
//     workflow inbox: things that happened in Approvals (and, as other modules
//     publish to workflow_events, everywhere else) that this person needs to
//     know about or act on. Stored, so they carry read/archived state.
//  2. Support conversations awaiting a human, polled from
//     /api/support/notifications. These are a live queue, not stored
//     notifications: they clear when someone replies, so they have no read
//     state and no archive action.
//
// They used to be two adjacent bells wearing the same icon, which nobody could
// tell apart. Support keeps its own tab here so the distinction survives.

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Bell,
  CalendarX,
  Check,
  CheckCheck,
  Clock,
  CreditCard,
  ExternalLink,
  Headset,
  Inbox,
  MessageSquare,
  RefreshCcw,
  ShieldAlert,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  archiveNotification,
  markAllNotificationsRead,
  markNotificationsRead,
  refreshNotifications,
} from '@/lib/notifications/actions'
import {
  CATEGORY_LABEL,
  PRIORITY_DOT,
  type NotificationCategory,
  type StaffNotification,
} from '@/lib/notifications/types'

// 'support' is a bell-only tab: it is fed by the live support queue, not by a
// staff_notifications row, so it deliberately is not a NotificationCategory.
type Tab = NotificationCategory | 'all' | 'support'

const TABS: Tab[] = ['all', 'approvals', 'requests', 'support', 'system']

const TAB_LABEL: Record<Tab, string> = { ...CATEGORY_LABEL, support: 'Support' }

type SupportItem = {
  id: string
  subject: string | null
  topic: string | null
  lastMessageAt: string
}

const TOPIC_ICON: Record<string, LucideIcon> = {
  refund: RefreshCcw,
  payment: CreditCard,
  cancellation: CalendarX,
  human_request: Headset,
  complaint: AlertTriangle,
  account: ShieldAlert,
}

function topicIcon(topic: string | null): LucideIcon {
  return (topic && TOPIC_ICON[topic]) || MessageSquare
}

function timeAgo(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function NotificationBell({
  onApprove,
}: {
  // Inline approve, wired by the caller so this component doesn't depend on
  // the Approvals module. Refusal is deliberately NOT offered here: it
  // requires a reason, and a one-click refuse would either skip that or
  // invent a second decision path that bypasses the notification the
  // submitter is owed.
  onApprove?: (requestId: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<StaffNotification[]>([])
  // Set alongside the data it timestamps, so relative times are "as of the
  // last fetch" and never differ between server and client render.
  const [fetchedAt, setFetchedAt] = useState(0)
  const [support, setSupport] = useState<SupportItem[]>([])
  const [supportCount, setSupportCount] = useState(0)
  const [supportFetchedAt, setSupportFetchedAt] = useState(0)
  // The support endpoint 401s for staff without support.read. Hide the tab
  // rather than showing one that is permanently empty for them. Only an
  // auth refusal hides it — a 500 means the queue is unreadable right now,
  // not that this person may not see it.
  const [supportAllowed, setSupportAllowed] = useState(false)
  const [tab, setTab] = useState<Tab>('all')
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // The header is a client component, so the bell loads its own data after
  // mount rather than being handed it by a server parent.
  useEffect(() => {
    let cancelled = false
    refreshNotifications()
      .then((rows) => {
        if (cancelled) return
        setItems(rows)
        setFetchedAt(Date.now())
      })
      .catch((err) => console.error('[notifications] initial load failed', err))
    return () => {
      cancelled = true
    }
  }, [])

  // Support is a live queue rather than stored rows, so it keeps the poll it
  // had as its own bell. The stored notifications still refresh on open.
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/support/notifications')
        if (!alive) return
        if (res.status === 401 || res.status === 403) {
          setSupportAllowed(false)
          return
        }
        if (!res.ok) {
          // Server-side failure. Leave the tab as it was and keep the last
          // known queue; the next poll will pick it up.
          console.error('[support] notifications poll failed', res.status)
          return
        }
        const data = (await res.json()) as { count: number; items: SupportItem[] }
        if (!alive) return
        setSupportAllowed(true)
        setSupportCount(data.count ?? 0)
        setSupport(data.items ?? [])
        setSupportFetchedAt(Date.now())
      } catch {
        /* transient — keep the last known queue */
      }
    }
    void load()
    const t = setInterval(load, 30000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  const unread = items.filter((i) => i.status === 'unread')
  const visible =
    tab === 'all' ? items : tab === 'support' ? [] : items.filter((i) => i.category === tab)
  // Support rows show under their own tab and at the top of All, where they
  // read as the most actionable thing in the panel.
  const visibleSupport = tab === 'all' || tab === 'support' ? support : []
  const tabs = TABS.filter((t) => t !== 'support' || supportAllowed)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function openPanel() {
    setOpen((o) => !o)
    // Refresh on open rather than polling — the bell is not a live feed and a
    // background poll on every admin page is a lot of traffic for a number
    // that changes a few times a day.
    if (!open) {
      startTransition(async () => {
        setItems(await refreshNotifications())
        setFetchedAt(Date.now())
      })
    }
  }

  function markRead(id: string) {
    startTransition(async () => {
      const res = await markNotificationsRead([id])
      if (res.ok) setItems(res.notifications)
    })
  }

  function markAll() {
    startTransition(async () => {
      const res = await markAllNotificationsRead()
      if (res.ok) setItems(res.notifications)
    })
  }

  function archive(id: string) {
    startTransition(async () => {
      const res = await archiveNotification(id)
      if (res.ok) setItems(res.notifications)
    })
  }

  async function approve(n: StaffNotification) {
    if (!onApprove) return
    setBusyId(n.id)
    try {
      await onApprove(n.entityId)
      const res = await markNotificationsRead([n.id])
      if (res.ok) setItems(res.notifications)
    } finally {
      setBusyId(null)
    }
  }

  // Only a submitted approval is actionable from here, and only when the
  // caller wired up a handler.
  const canApproveInline = (n: StaffNotification) =>
    Boolean(onApprove) && n.eventType === 'approval.submitted' && n.entityType === 'approval_request'

  const categoryCounts = TABS.reduce<Record<string, number>>((acc, t) => {
    acc[t] =
      t === 'all'
        ? unread.length + supportCount
        : t === 'support'
          ? supportCount
          : unread.filter((i) => i.category === t).length
    return acc
  }, {})

  // One badge for the one bell: unread workflow notifications plus support
  // conversations still waiting on a human.
  const badge = unread.length + supportCount

  return (
    <div className="relative" ref={ref}>
      <button data-opus-button="control"
        type="button"
        onClick={openPanel}
        title="Notifications"
        aria-label={badge > 0 ? `Notifications, ${badge} needing attention` : 'Notifications'}
        aria-expanded={open}
        className="relative rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
      >
        <Bell className="h-5 w-5" />
        {badge > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[380px] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_20px_50px_-20px_rgba(0,0,0,0.3)]">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">Notifications</p>
            {tab === 'support' ? (
              <Link
                href="/support?filter=attention"
                onClick={() => setOpen(false)}
                className="text-xs font-semibold text-[#5B2D8E] hover:text-[#7E5896]"
              >
                View all
              </Link>
            ) : (
              unread.length > 0 && (
              <button data-opus-button="control"
                type="button"
                onClick={markAll}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[#5B2D8E] hover:bg-[#F8EDFF] disabled:opacity-50"
              >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              )
            )}
          </div>

          <div className="flex gap-1 border-b border-gray-100 px-2 py-1.5">
            {tabs.map((t) => (
              <button data-opus-button="control"
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
                  tab === t ? 'bg-[#F0DFF6] text-[#5B2D8E]' : 'text-gray-500 hover:bg-gray-50',
                )}
              >
                {TAB_LABEL[t]}
                {categoryCounts[t] > 0 && (
                  <span className="ml-1 text-[10px] text-rose-500">{categoryCounts[t]}</span>
                )}
              </button>
            ))}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {visible.length === 0 && visibleSupport.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Inbox className="mx-auto h-6 w-6 text-gray-300" />
                <p className="mt-2 text-sm font-medium text-gray-700">Nothing here</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {tab === 'all'
                    ? 'Approvals and updates will appear here.'
                    : tab === 'support'
                      ? 'No conversations are waiting on a human.'
                      : `No ${TAB_LABEL[tab].toLowerCase()} notifications.`}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {visibleSupport.map((it) => {
                  const Icon = topicIcon(it.topic)
                  return (
                    <li key={`support-${it.id}`}>
                      <Link
                        href={`/support/${it.id}`}
                        onClick={() => setOpen(false)}
                        className="flex gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
                      >
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-[#1A1A1A]">
                            {it.subject || 'New conversation'}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                              Needs human
                            </span>
                            {it.topic && (
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-gray-600">
                                {it.topic.replace(/_/g, ' ')}
                              </span>
                            )}
                          </div>
                          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-gray-400">
                            <Clock className="h-3 w-3" />
                            {timeAgo(it.lastMessageAt, supportFetchedAt)}
                          </p>
                        </div>
                      </Link>
                    </li>
                  )
                })}
                {visible.map((n) => (
                  <li
                    key={n.id}
                    className={cn('group px-4 py-3', n.status === 'unread' && 'bg-[#FAF7FE]')}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', PRIORITY_DOT[n.priority])}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'text-sm',
                            n.status === 'unread'
                              ? 'font-semibold text-gray-900'
                              : 'font-medium text-gray-700',
                          )}
                        >
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-gray-600">{n.body}</p>
                        )}
                        <p className="mt-1 text-[11px] text-gray-400">
                          {timeAgo(n.createdAt, fetchedAt)}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {canApproveInline(n) && (
                            <button data-opus-button="control"
                              type="button"
                              onClick={() => approve(n)}
                              disabled={busyId === n.id || pending}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              <Check className="h-3 w-3" />
                              {busyId === n.id ? 'Approving…' : 'Approve'}
                            </button>
                          )}
                          {n.href && (
                            <a
                              href={n.href}
                              onClick={() => markRead(n.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-700 hover:bg-gray-50"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Open
                            </a>
                          )}
                          {n.status === 'unread' && (
                            <button data-opus-button="control"
                              type="button"
                              onClick={() => markRead(n.id)}
                              disabled={pending}
                              className="rounded-md px-2 py-1 text-[10px] font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                      </div>
                      <button data-opus-button="control"
                        type="button"
                        onClick={() => archive(n.id)}
                        disabled={pending}
                        aria-label={`Archive: ${n.title}`}
                        className="shrink-0 rounded-md p-1 text-gray-300 opacity-0 transition hover:bg-gray-50 hover:text-gray-600 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
