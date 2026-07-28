'use client'

import Link from 'next/link'
import { useState, useSyncExternalStore } from 'react'
import { Bell, Check } from 'lucide-react'
import {
  getNotifications,
  getNotificationsServerSnapshot,
  subscribeNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationItem,
} from '@/lib/notifications-storage'

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export default function NotificationBell() {
  const items = useSyncExternalStore(
    subscribeNotifications,
    getNotifications,
    getNotificationsServerSnapshot,
  )
  const [open, setOpen] = useState(false)

  const unread = items.reduce((n, i) => n + (i.read ? 0 : 1), 0)

  function onItemClick(n: NotificationItem) {
    markNotificationRead(n.id)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-800 hover:bg-gray-100"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-[var(--on-accent)]">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Click-away backdrop */}
          <button
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="dialog"
            aria-label="Notifications"
            className="absolute right-0 top-11 z-50 w-[min(88vw,20rem)] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl shadow-black/10"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <p className="text-sm font-bold text-[#1A1A1A]">Notifications</p>
              {unread > 0 && (
                <button
                  onClick={() => markAllNotificationsRead()}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800"
                >
                  <Check size={13} /> Mark all read
                </button>
              )}
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-gray-400">
                  You are all caught up.
                </p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {items.map((n) => {
                    const inner = (
                      <div className="flex gap-3 px-4 py-3">
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                            n.read ? 'bg-transparent' : 'bg-[var(--accent)]'
                          }`}
                        />
                        <div className="min-w-0">
                          <p
                            className={`text-sm leading-snug ${
                              n.read ? 'font-medium text-gray-600' : 'font-bold text-[#1A1A1A]'
                            }`}
                          >
                            {n.title}
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{n.body}</p>
                          <p className="mt-1 text-[11px] text-gray-400">{timeAgo(n.createdAt)}</p>
                        </div>
                      </div>
                    )
                    return (
                      <li key={n.id} className="transition-colors hover:bg-gray-50">
                        {n.href ? (
                          <Link href={n.href} onClick={() => onItemClick(n)} className="block">
                            {inner}
                          </Link>
                        ) : (
                          <button
                            onClick={() => onItemClick(n)}
                            className="block w-full text-left"
                          >
                            {inner}
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
