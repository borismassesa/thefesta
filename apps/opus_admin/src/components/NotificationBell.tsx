'use client'

// Staff notification bell. Reads `staff_notifications` (channel='bell') for
// the signed-in employee.
//
// Distinct from SupportBell, which is a live queue of customer conversations
// awaiting a reply. This one is the workflow inbox: things that happened in
// Approvals (and, as other modules publish to workflow_events, everywhere
// else) that this person needs to know about or act on.

import { useEffect, useRef, useState, useTransition } from 'react'
import { Bell, Check, CheckCheck, ExternalLink, Inbox, X } from 'lucide-react'
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

const TABS: (NotificationCategory | 'all')[] = ['all', 'approvals', 'requests', 'system']

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
  const [tab, setTab] = useState<NotificationCategory | 'all'>('all')
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

  const unread = items.filter((i) => i.status === 'unread')
  const visible = tab === 'all' ? items : items.filter((i) => i.category === tab)

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
        ? unread.length
        : unread.filter((i) => i.category === t).length
    return acc
  }, {})

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={openPanel}
        // Two bells sit side by side in the header. Until they merge into a
        // single notification centre, each has to say which one it is.
        title="Workflow notifications"
        aria-label={
          unread.length > 0
            ? `Workflow notifications, ${unread.length} unread`
            : 'Workflow notifications'
        }
        aria-expanded={open}
        className="relative rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
      >
        <Bell className="h-5 w-5" />
        {unread.length > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[380px] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_20px_50px_-20px_rgba(0,0,0,0.3)]">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">Notifications</p>
            {unread.length > 0 && (
              <button
                type="button"
                onClick={markAll}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[#5B2D8E] hover:bg-[#F8EDFF] disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="flex gap-1 border-b border-gray-100 px-2 py-1.5">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
                  tab === t ? 'bg-[#F0DFF6] text-[#5B2D8E]' : 'text-gray-500 hover:bg-gray-50',
                )}
              >
                {CATEGORY_LABEL[t]}
                {categoryCounts[t] > 0 && (
                  <span className="ml-1 text-[10px] text-rose-500">{categoryCounts[t]}</span>
                )}
              </button>
            ))}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {visible.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Inbox className="mx-auto h-6 w-6 text-gray-300" />
                <p className="mt-2 text-sm font-medium text-gray-700">Nothing here</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {tab === 'all'
                    ? 'Approvals and updates will appear here.'
                    : `No ${CATEGORY_LABEL[tab].toLowerCase()} notifications.`}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
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
                            <button
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
                            <button
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
                      <button
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
