'use client'

import { Search, SquarePen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ME, formatRelative } from './lib'
import type { CaseRecord } from './types'

// Chat-shaped list. A row answers "who, about what, when, do I need to read
// it" and nothing else. Status, priority, SLA and assignment still exist on
// the case, they just live in the thread's details panel instead of shouting
// from every row.

export type ChatFilter = 'all' | 'unread' | 'mine' | 'unassigned'

const FILTERS: Array<{ key: ChatFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'mine', label: 'Mine' },
  { key: 'unassigned', label: 'Unassigned' },
]

export function ChatList({
  conversations,
  selectedId,
  filter,
  counts,
  query,
  onFilter,
  onQuery,
  onOpen,
}: {
  conversations: CaseRecord[]
  selectedId: string | null
  filter: ChatFilter
  counts: Record<ChatFilter, number>
  query: string
  onFilter: (f: ChatFilter) => void
  onQuery: (q: string) => void
  onOpen: (id: string) => void
}) {
  return (
    <section className="w-[336px] shrink-0 border-r border-gray-100 flex flex-col bg-white">
      {/* No title here: the page publishes "Inbox" into the shell header, so
          repeating it would be the same word twice, 40px apart. */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center flex-1 min-w-0">
            <Search className="w-4 h-4 text-gray-400 absolute left-3" />
            <input
              type="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Search conversations"
              className="pl-9 pr-3 py-2 bg-gray-50 border border-transparent rounded-full w-full text-[13px] focus:outline-none focus:bg-white focus:border-gray-200"
            />
          </div>
          <button data-opus-button="control"
            type="button"
            title="New conversation"
            aria-label="New conversation"
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full text-gray-500 hover:text-[#7E5896] hover:bg-gray-50 transition-colors"
          >
            <SquarePen className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 mt-3">
          {FILTERS.map((f) => (
            <button data-opus-button="secondary" data-opus-button-size="small"
              key={f.key}
              type="button"
              onClick={() => onFilter(f.key)}
              className={cn(
                'text-[12px] font-semibold px-2.5 py-1 rounded-full transition-colors',
                filter === f.key
                  ? 'bg-[#F0DFF6] text-[#7E5896]'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800',
              )}
            >
              {f.label}
              {counts[f.key] > 0 && (
                <span className="ml-1 tabular-nums opacity-60">{counts[f.key]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-2 pb-3">
        {conversations.length === 0 ? (
          <p className="text-[13px] text-gray-400 text-center px-6 py-16">
            No conversations here.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {conversations.map((c) => (
              <li key={c.id}>
                <ChatRow item={c} active={selectedId === c.id} onOpen={() => onOpen(c.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function ChatRow({
  item,
  active,
  onOpen,
}: {
  item: CaseRecord
  active: boolean
  onOpen: () => void
}) {
  // The preview is the newest thing anyone actually said, the way a chat list
  // works. Workflow events are skipped: "status changed to open" is not what
  // the conversation is about.
  const lastSaid = [...item.timeline]
    .reverse()
    .find((e): e is Exclude<typeof e, { kind: 'event' }> => e.kind !== 'event')
  const preview = lastSaid
    ? `${lastSaid.kind === 'note' ? 'Note: ' : lastSaid.from.name === ME ? 'You: ' : ''}${lastSaid.body}`
    : item.preview

  return (
    <button data-opus-button="control"
      type="button"
      onClick={onOpen}
      className={cn(
        'w-full text-left flex gap-3 px-2.5 py-2 rounded-xl transition-colors',
        active ? 'bg-[#F3E8F9]' : 'hover:bg-gray-50',
      )}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 mt-0.5"
        style={{ background: item.requester.avatarColor, color: '#5A5A5A' }}
      >
        {item.requester.initials}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={cn(
              'text-[13px] truncate leading-5',
              item.unread ? 'font-bold text-gray-900' : 'font-semibold text-gray-800',
            )}
          >
            {item.requester.name}
          </p>
          <span
            className={cn(
              'text-[11px] tabular-nums shrink-0',
              item.unread ? 'text-[#7E5896] font-semibold' : 'text-gray-400',
            )}
          >
            {formatRelative(item.lastActivityAt)}
          </span>
        </div>

        {/* Subject then the newest line anyone said. Two lines of 18px, so a
            row stays a row rather than growing into a card. */}
        <p
          className={cn(
            'text-[12.5px] truncate leading-[18px]',
            item.unread ? 'text-gray-900 font-semibold' : 'text-gray-600',
          )}
        >
          {item.subject}
        </p>
        <p className="text-[12px] text-gray-400 truncate leading-[18px]">{preview}</p>
      </div>

      {item.unread && <span className="w-2 h-2 rounded-full bg-[#C9A0DC] shrink-0 mt-4" />}
    </button>
  )
}
