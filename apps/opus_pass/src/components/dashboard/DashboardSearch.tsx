'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Search, Loader2, User2, CalendarHeart, MessageCircle, LayoutGrid } from 'lucide-react'
import { searchDashboard, type SearchResult, type SearchResultType } from '@/lib/dashboard/search-action'

type NavPage = { label: string; href: string }

const TYPE_ICON: Record<SearchResultType, typeof User2> = {
  guest: User2,
  event: CalendarHeart,
  inquiry: MessageCircle,
}
const TYPE_GROUP: Record<SearchResultType, string> = {
  guest: 'Guests',
  event: 'Events',
  inquiry: 'Inquiries',
}
const GROUP_ORDER: SearchResultType[] = ['guest', 'event', 'inquiry']

export default function DashboardSearch({
  navItems,
  onNavigate,
}: Readonly<{ navItems: NavPage[]; onNavigate?: () => void }>) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)

  const q = query.trim().toLowerCase()
  const pages = q ? navItems.filter((n) => n.label.toLowerCase().includes(q)).slice(0, 5) : []

  // Debounced data search (guests / events / inquiries). setState only runs
  // inside the debounce callback / promise, never synchronously in the effect.
  useEffect(() => {
    if (q.length < 2) return
    const id = ++reqId.current
    const handle = setTimeout(() => {
      setLoading(true)
      searchDashboard(query)
        .then((r) => { if (id === reqId.current) setResults(r) })
        .catch(() => { if (id === reqId.current) setResults([]) })
        .finally(() => { if (id === reqId.current) setLoading(false) })
    }, 250)
    return () => clearTimeout(handle)
  }, [query, q])

  // Only surface results once the query is long enough (state may hold stale
  // results from a longer prior query).
  const dataResults = q.length >= 2 ? results : []
  const grouped = GROUP_ORDER
    .map((type) => ({ type, items: dataResults.filter((r) => r.type === type) }))
    .filter((g) => g.items.length > 0)

  const open = focused && q.length > 0
  const nothing = open && q.length >= 2 && !loading && pages.length === 0 && dataResults.length === 0

  function close() {
    setFocused(false)
    setQuery('')
    onNavigate?.()
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#1A1A1A]/35" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        placeholder="Search guests, events, vendors…"
        aria-label="Search the dashboard"
        className="w-full rounded-xl border border-black/[0.08] bg-black/[0.02] py-2 pl-9 pr-3 text-sm text-[#1A1A1A] placeholder:text-[#1A1A1A]/35 transition-colors focus:border-[#C9A0DC] focus:bg-white focus:outline-none"
      />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#1A1A1A]/30" />
      )}

      {open && (
        <>
          {/* click-away */}
          <button data-opus-button="control" type="button" aria-hidden="true" tabIndex={-1} className="fixed inset-0 z-30 cursor-default" onClick={() => setFocused(false)} />
          <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-[60vh] overflow-y-auto overscroll-contain rounded-2xl border border-black/[0.08] bg-white py-2 shadow-xl">
            {pages.length > 0 && (
              <SearchGroup label="Pages">
                {pages.map((p) => (
                  <Link key={p.href} href={p.href} onClick={close} className="flex items-center gap-3 px-3 py-2 text-sm text-[#1A1A1A] hover:bg-black/[0.04]">
                    <LayoutGrid className="h-4 w-4 shrink-0 text-[#1A1A1A]/40" />
                    <span className="truncate">{p.label}</span>
                  </Link>
                ))}
              </SearchGroup>
            )}

            {grouped.map(({ type, items }) => {
              const Icon = TYPE_ICON[type]
              return (
                <SearchGroup key={type} label={TYPE_GROUP[type]}>
                  {items.map((r, i) => (
                    <Link key={`${type}-${i}`} href={r.href} onClick={close} className="flex items-center gap-3 px-3 py-2 text-sm text-[#1A1A1A] hover:bg-black/[0.04]">
                      <Icon className="h-4 w-4 shrink-0 text-[#1A1A1A]/40" />
                      <span className="min-w-0 flex-1 truncate">{r.label}</span>
                      {r.sublabel ? <span className="shrink-0 text-xs text-[#1A1A1A]/40">{r.sublabel}</span> : null}
                    </Link>
                  ))}
                </SearchGroup>
              )
            })}

            {q.length < 2 && pages.length === 0 && (
              <p className="px-3 py-2 text-xs text-[#1A1A1A]/40">Keep typing to search…</p>
            )}
            {nothing && <p className="px-3 py-2 text-sm text-[#1A1A1A]/45">No results for &ldquo;{query.trim()}&rdquo;.</p>}
          </div>
        </>
      )}
    </div>
  )
}

function SearchGroup({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="px-1 pb-1">
      <p className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-[#1A1A1A]/35">{label}</p>
      {children}
    </div>
  )
}
