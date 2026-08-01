'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Bell,
  Clock,
  RefreshCcw,
  CreditCard,
  CalendarX,
  Headset,
  AlertTriangle,
  ShieldAlert,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react'

type Item = { id: string; subject: string | null; topic: string | null; lastMessageAt: string }

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

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function SupportBell() {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(0)
  const [items, setItems] = useState<Item[]>([])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/support/notifications')
        if (!res.ok || !alive) return
        const data = (await res.json()) as { count: number; items: Item[] }
        setCount(data.count ?? 0)
        setItems(data.items ?? [])
      } catch {
        /* ignore */
      }
    }
    void load()
    const t = setInterval(load, 30000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Customer messages"
        aria-label={count > 0 ? `Customer messages, ${count} awaiting` : 'Customer messages'}
        aria-expanded={open}
        className="relative text-gray-400 transition-colors hover:text-gray-600"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 w-80 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-bold text-[#1A1A1A]">Support notifications</p>
            <Link
              href="/support?filter=attention"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-[#7E5896] hover:text-[#5f4270]"
            >
              View all
            </Link>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">You are all caught up.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-gray-50 overflow-y-auto">
              {items.map((it) => {
                const Icon = topicIcon(it.topic)
                return (
                  <li key={it.id}>
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
                          {timeAgo(it.lastMessageAt)}
                        </p>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
