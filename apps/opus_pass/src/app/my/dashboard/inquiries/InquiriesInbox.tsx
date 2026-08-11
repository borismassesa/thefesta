'use client'

import { useMemo, useState } from 'react'
import { MessageCircle, ChevronRight, ArrowLeft, Calendar, MapPin, Search, ArrowDownUp, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import ConversationPanel from './ConversationPanel'
import {
  type InquirySummary,
  type InquiryStatus,
  STATUS_LABEL,
  STATUS_STYLE,
  formatInquiryDate,
} from './types'

type Props = {
  initialInquiries: InquirySummary[]
  marketplaceUrl: string
  preselectId?: string
}

const TABS = ['Active', 'Booked', 'Closed'] as const
type Tab = (typeof TABS)[number]

// Couple-side funnel: every request lands in exactly one tab.
//   Active → still in play (awaiting reply or replied)
//   Booked → accepted
//   Closed → declined or closed
function tabForStatus(status: InquiryStatus | null): Tab {
  if (status === 'accepted') return 'Booked'
  if (status === 'declined' || status === 'closed') return 'Closed'
  return 'Active'
}

function matchesTab(tab: Tab, status: InquiryStatus | null) {
  return tabForStatus(status) === tab
}

function countByTab(inquiries: InquirySummary[]): Record<Tab, number> {
  return {
    Active: inquiries.filter((i) => matchesTab('Active', i.status)).length,
    Booked: inquiries.filter((i) => matchesTab('Booked', i.status)).length,
    Closed: inquiries.filter((i) => matchesTab('Closed', i.status)).length,
  }
}

function firstNonEmptyTab(counts: Record<Tab, number>): Tab {
  return TABS.find((t) => counts[t] > 0) ?? 'Active'
}

type SortOption = 'newest' | 'oldest' | 'event'
const SORT_LABEL: Record<SortOption, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  event: 'Event date soonest',
}

// Rows arrive newest-first from the DB query, so 'newest' is the identity order.
function sortInquiries(rows: InquirySummary[], sortBy: SortOption): InquirySummary[] {
  if (sortBy === 'newest') return rows
  if (sortBy === 'oldest') return [...rows].reverse()
  return [...rows].sort((a, b) => {
    if (!a.event_date) return 1
    if (!b.event_date) return -1
    return a.event_date.localeCompare(b.event_date)
  })
}

function matchesSearch(inq: InquirySummary, q: string): boolean {
  if (!q) return true
  return [inq.vendor_name ?? '', inq.vendor_slug ?? '', inq.location ?? '']
    .join(' ')
    .toLowerCase()
    .includes(q)
}

function avatarInitial(inq: InquirySummary): string {
  const name = inq.vendor_name ?? inq.vendor_slug ?? 'V'
  return name.trim().charAt(0).toUpperCase() || 'V'
}

function SortMenu({ sortBy, onChange }: Readonly<{ sortBy: SortOption; onChange: (next: SortOption) => void }>) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button data-opus-button="control"
        type="button"
        aria-label="Sort requests"
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Sort: ${SORT_LABEL[sortBy]}`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'p-2 rounded-lg border transition-colors',
          open ? 'border-[#C9A0DC] bg-[#FCF7FF] text-[#7E5896]' : 'border-gray-200 text-gray-500 hover:bg-gray-50',
        )}
      >
        <ArrowDownUp className="w-4 h-4" />
      </button>
      {open && (
        <>
          <button data-opus-button="control" type="button" aria-hidden="true" tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
            {(Object.keys(SORT_LABEL) as SortOption[]).map((option) => (
              <button data-opus-button="control"
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={sortBy === option}
                onClick={() => { onChange(option); setOpen(false) }}
                className={cn(
                  'flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50',
                  sortBy === option ? 'font-semibold text-[#7E5896]' : 'text-gray-600',
                )}
              >
                {SORT_LABEL[option]}
                {sortBy === option && <Check className="w-3.5 h-3.5" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function InquiriesInbox({ initialInquiries, marketplaceUrl, preselectId }: Readonly<Props>) {
  const [inquiries, setInquiries] = useState<InquirySummary[]>(initialInquiries)
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (preselectId && initialInquiries.some((i) => i.id === preselectId)) return preselectId
    return initialInquiries[0]?.id ?? null
  })
  const [active, setActive] = useState<Tab>(() => {
    const preselected = preselectId ? initialInquiries.find((i) => i.id === preselectId) : null
    if (preselected) return tabForStatus(preselected.status)
    return firstNonEmptyTab(countByTab(initialInquiries))
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('newest')
  // Mobile: list and conversation are mutually exclusive; desktop shows both.
  const [mobileConversation, setMobileConversation] = useState<boolean>(Boolean(preselectId))

  const tabCounts = useMemo(() => countByTab(inquiries), [inquiries])

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const filtered = inquiries.filter((i) => matchesTab(active, i.status) && matchesSearch(i, q))
    return sortInquiries(filtered, sortBy)
  }, [inquiries, active, searchQuery, sortBy])

  // Effective selection is derived (no effect): the chosen request if it's in the
  // current view, otherwise the first visible one.
  const selected = visible.find((i) => i.id === selectedId) ?? visible[0] ?? null

  function selectInquiry(id: string) {
    setSelectedId(id)
    setMobileConversation(true)
  }

  function handleStatusChange(id: string, status: InquiryStatus) {
    setInquiries((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)))
  }

  function handleDeleted(id: string) {
    setInquiries((prev) => prev.filter((i) => i.id !== id))
    setMobileConversation(false)
  }

  function emptyListMessage(): string {
    const q = searchQuery.trim()
    if (q) return `No requests match "${q}".`
    if (active === 'Active') return 'No active requests. New quote requests show here.'
    if (active === 'Booked') return 'No booked vendors yet.'
    return 'Nothing closed or declined yet.'
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="dash-header-safe">
        <h1 className="text-2xl font-extrabold text-[#1A1A1A] tracking-tight">Your Inquiries</h1>
        <p className="text-sm text-gray-400 mt-1">Chat with vendors and track your quote requests.</p>
      </div>

      {inquiries.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white px-6 py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-(--accent)/15 flex items-center justify-center mx-auto mb-5">
            <MessageCircle className="w-7 h-7 text-[#8e57b3]" />
          </div>
          <p className="text-lg font-bold text-[#1A1A1A] mb-2">No conversations yet</p>
          <p className="text-sm text-gray-500 max-w-sm mx-auto leading-relaxed">
            When you request a quote from a vendor, your conversation lands here so you can chat, compare proposals and book.
          </p>
          <a
            href={`${marketplaceUrl}/vendors`}
            className="inline-flex items-center gap-2 mt-6 bg-(--accent) text-(--on-accent) px-6 py-3 rounded-full text-sm font-bold hover:bg-(--accent-hover) transition-colors"
          >
            Browse vendors
            <ChevronRight className="w-4 h-4" />
          </a>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[340px_1fr] lg:grid-rows-1 rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm min-h-[70vh] lg:min-h-0 lg:h-[calc(100vh-9rem)]">
          {/* List pane — its own scroll container; overscroll-contain stops wheel
              events from chaining out to the page or the conversation pane. */}
          <aside
            className={cn(
              'flex-col border-r border-gray-100 lg:flex lg:min-h-0',
              mobileConversation ? 'hidden' : 'flex',
            )}
          >
            {/* Tabs + search + sort */}
            <div className="shrink-0 p-5 border-b border-gray-100">
              <div className="flex gap-1 border-b border-gray-100 -mx-5 px-5">
                {TABS.map((t) => {
                  const isActive = active === t
                  const count = tabCounts[t]
                  return (
                    <button data-opus-button="neutral" data-opus-button-size="medium"
                      key={t}
                      type="button"
                      onClick={() => setActive(t)}
                      className={cn(
                        'pb-3 px-3 text-sm font-semibold transition-colors border-b-2 -mb-px flex items-center gap-1.5',
                        isActive ? 'border-[#C9A0DC] text-[#7E5896]' : 'border-transparent text-gray-400 hover:text-gray-700',
                      )}
                    >
                      {t}
                      {count > 0 && (
                        <span className={cn(
                          'min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center tabular-nums',
                          isActive ? 'bg-[#F0DFF6] text-[#7E5896]' : 'bg-gray-100 text-gray-500',
                        )}>
                          {count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search vendors…"
                    className="pl-9 pr-3 py-2 bg-gray-50 border border-gray-100 rounded-lg w-full text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all"
                  />
                </div>
                <SortMenu sortBy={sortBy} onChange={setSortBy} />
              </div>
            </div>

            <ul className="flex-1 overflow-y-auto overscroll-contain">
              {visible.length === 0 ? (
                <li className="px-6 py-14 flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                    {searchQuery.trim() ? <Search className="w-5 h-5 text-gray-300" /> : <MessageCircle className="w-5 h-5 text-gray-300" />}
                  </div>
                  <p className="text-sm text-gray-500 max-w-[240px]">{emptyListMessage()}</p>
                </li>
              ) : (
                visible.map((inq) => {
                  const isActive = inq.id === selected?.id
                  const s = (inq.status ?? 'pending') as InquiryStatus
                  return (
                    <li key={inq.id}>
                      <button data-opus-button="control"
                        type="button"
                        onClick={() => selectInquiry(inq.id)}
                        className={cn(
                          'w-full flex items-start gap-3 px-5 py-4 text-left border-b border-gray-50 transition-colors',
                          isActive ? 'bg-[#FCF7FF]' : 'hover:bg-gray-50',
                        )}
                      >
                        <span className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm font-bold bg-(--accent)/20 text-[#8e57b3]">
                          {avatarInitial(inq)}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-bold text-[#1A1A1A] truncate text-sm">
                              {inq.vendor_name ?? inq.vendor_slug ?? 'Vendor'}
                            </span>
                            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold', STATUS_STYLE[s])}>
                              {STATUS_LABEL[s]}
                            </span>
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-400">
                            {inq.event_date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />{formatInquiryDate(inq.event_date)}
                              </span>
                            )}
                            {inq.location && (
                              <span className="flex items-center gap-1 truncate">
                                <MapPin className="w-3 h-3 shrink-0" />{inq.location}
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-gray-300">Sent {formatInquiryDate(inq.created_at)}</span>
                        </span>
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
          </aside>

          {/* Conversation pane */}
          <section
            className={cn(
              'min-w-0 flex-col bg-white lg:flex lg:min-h-0',
              mobileConversation ? 'flex' : 'hidden',
            )}
          >
            {selected ? (
              <>
                {/* Mobile back to list */}
                <button data-opus-button="control"
                  type="button"
                  onClick={() => setMobileConversation(false)}
                  className="lg:hidden flex items-center gap-1.5 px-5 py-3 text-sm font-medium text-gray-500 border-b border-gray-100 hover:text-[#1A1A1A]"
                >
                  <ArrowLeft className="w-4 h-4" /> All requests
                </button>
                {/* This inner div is the scroll container (matches the vendor
                    portal Leads detail): bounded by the grid cell, the whole
                    conversation scrolls inside it. */}
                <div className="flex-1 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain">
                  <ConversationPanel
                    key={selected.id}
                    inquiryId={selected.id}
                    onStatusChange={handleStatusChange}
                    onDeleted={handleDeleted}
                  />
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-gray-400">
                Select a conversation to start chatting.
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
