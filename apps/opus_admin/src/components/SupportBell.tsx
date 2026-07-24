'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'

type Item = { id: string; subject: string | null; topic: string | null; lastMessageAt: string }

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
        aria-label={count > 0 ? `Notifications, ${count} awaiting` : 'Notifications'}
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
              {items.map((it) => (
                <li key={it.id}>
                  <Link
                    href={`/support/${it.id}`}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-3 transition-colors hover:bg-gray-50"
                  >
                    <p className="truncate text-sm font-semibold text-[#1A1A1A]">
                      {it.subject || 'New conversation'}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      <span className="font-medium text-amber-600">Needs human</span>
                      {it.topic ? ` · ${it.topic.replace(/_/g, ' ')}` : ''} · {timeAgo(it.lastMessageAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
