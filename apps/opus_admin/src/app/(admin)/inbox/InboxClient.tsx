'use client'

import { useCallback, useMemo, useState } from 'react'
import { usePublishInboxUnread } from '@/components/InboxUnread'
import { useSetPageHeading } from '@/components/PageHeading'
import { useFocusMode } from '@/components/SidebarFocus'
import { ChatList, type ChatFilter } from './ChatList'
import { ChatThread, EmptyThread, type ComposerMode } from './ChatThread'
import { DetailsPanel } from './DetailsPanel'
import { ME, isActive, matchesQuery } from './lib'
import type {
  CaseAttachment,
  CaseEventKind,
  CasePriority,
  CaseRecord,
  CaseStatus,
  ResolutionReason,
  TimelineEntry,
} from './types'

const AGENT = { name: ME, role: 'agent' as const, avatarColor: '#F0DFF6', initials: 'NK' }

// Four filters, no queue rail. Anything finer (team, SLA, saved views) is a
// reporting question, and this screen is for having the conversation.
function matchesFilter(c: CaseRecord, filter: ChatFilter): boolean {
  switch (filter) {
    case 'unread':
      return c.unread && isActive(c)
    case 'mine':
      return isActive(c) && c.assignee === ME
    case 'unassigned':
      return isActive(c) && c.assignee === null
    default:
      return true
  }
}

export function InboxClient({ initial }: { initial: CaseRecord[] }) {
  const [cases, setCases] = useState<CaseRecord[]>(initial)
  const [filter, setFilter] = useState<ChatFilter>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const counts = useMemo(
    () => ({
      all: 0,
      unread: cases.filter((c) => matchesFilter(c, 'unread')).length,
      mine: cases.filter((c) => matchesFilter(c, 'mine')).length,
      unassigned: cases.filter((c) => matchesFilter(c, 'unassigned')).length,
    }),
    [cases],
  )

  usePublishInboxUnread(counts.unread)

  // The shell header's left side is a slot each page fills. Without this the
  // inbox left it empty and the bar read as dead space, while the page
  // repeated its own title inside the list column.
  useSetPageHeading({
    title: 'Inbox',
    subtitle:
      counts.unread > 0
        ? `${counts.unread} unread ${counts.unread === 1 ? 'conversation' : 'conversations'}`
        : 'You are all caught up',
  })

  // Newest activity first, the way every chat list works.
  const visible = useMemo(() => {
    const q = query.trim()
    return cases
      .filter((c) => matchesFilter(c, filter) && matchesQuery(c, q))
      .sort((a, b) => +new Date(b.lastActivityAt) - +new Date(a.lastActivityAt))
  }, [cases, filter, query])

  const selected = useMemo(
    () => cases.find((c) => c.id === selectedId) ?? visible[0] ?? null,
    [cases, selectedId, visible],
  )

  // With a thread open this page is already a two-column chat. Ask the shell
  // for its icon rail so the conversation gets the room, and give it back on
  // the way out.
  useFocusMode(Boolean(selected))

  const patch = useCallback((id: string, p: Partial<CaseRecord>) => {
    setCases((prev) => prev.map((c) => (c.id === id ? { ...c, ...p } : c)))
  }, [])

  const appendEvent = useCallback((id: string, detail: string, event: CaseEventKind) => {
    setCases((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              lastActivityAt: new Date().toISOString(),
              timeline: [
                ...c.timeline,
                {
                  kind: 'event' as const,
                  id: `ev-${c.timeline.length + 1}-${Date.now()}`,
                  at: new Date().toISOString(),
                  event,
                  actor: ME,
                  detail,
                },
              ],
            }
          : c,
      ),
    )
  }, [])

  const openConversation = (id: string) => {
    setSelectedId(id)
    patch(id, { unread: false })
  }

  const setStatus = (id: string, status: CaseStatus) => {
    const c = cases.find((x) => x.id === id)
    if (!c) return
    // Waiting and snoozed stop the SLA clock, and coming off them restarts it,
    // so the pause is derived from status rather than set by hand.
    const pausedReason =
      status === 'waiting_on_customer'
        ? ('waiting_on_customer' as const)
        : status === 'snoozed'
          ? ('snoozed' as const)
          : undefined
    patch(id, { status, sla: { ...c.sla, pausedReason } })
    appendEvent(id, `Status set to ${status.replace(/_/g, ' ')}`, 'status_changed')
  }

  const assign = (id: string, who: string | null) => {
    const c = cases.find((x) => x.id === id)
    if (!c) return
    patch(id, { assignee: who, status: who && c.status === 'new' ? 'in_progress' : c.status })
    appendEvent(id, who ? `Assigned to ${who}` : 'Unassigned', 'assigned')
  }

  const setPriority = (id: string, priority: CasePriority) => {
    patch(id, { priority })
    appendEvent(id, `Priority changed to ${priority}`, 'priority_changed')
  }

  const resolve = (id: string, reason: ResolutionReason) => {
    const c = cases.find((x) => x.id === id)
    if (!c) return
    patch(id, {
      status: 'resolved',
      unread: false,
      resolution: { reason, at: new Date().toISOString(), by: ME },
      sla: { ...c.sla, pausedReason: undefined },
    })
    appendEvent(id, `Resolved as ${reason.replace(/_/g, ' ')}`, 'resolved')
  }

  const send = (
    id: string,
    { mode, body, attachments }: { mode: ComposerMode; body: string; attachments: CaseAttachment[] },
  ) => {
    const c = cases.find((x) => x.id === id)
    if (!c) return
    const at = new Date().toISOString()
    const entry: TimelineEntry =
      mode === 'note'
        ? { kind: 'note', id: `nt-${Date.now()}`, at, from: AGENT, body, attachments }
        : {
            kind: 'message',
            id: `msg-${Date.now()}`,
            at,
            direction: 'outbound',
            from: AGENT,
            body,
            attachments,
          }

    // A reply stops the first-response clock. An internal note does not: the
    // customer has still heard nothing.
    const sla =
      mode === 'reply' && !c.sla.firstRespondedAt ? { ...c.sla, firstRespondedAt: at } : c.sla

    setCases((prev) =>
      prev.map((x) =>
        x.id === id
          ? { ...x, timeline: [...x.timeline, entry], lastActivityAt: at, sla, unread: false }
          : x,
      ),
    )

    if (mode === 'reply' && c.status === 'new') setStatus(id, 'in_progress')
  }

  return (
    <div className="h-full flex overflow-hidden bg-white">
      <ChatList
        conversations={visible}
        selectedId={selected?.id ?? null}
        filter={filter}
        counts={counts}
        query={query}
        onFilter={setFilter}
        onQuery={setQuery}
        onOpen={openConversation}
      />

      {selected ? (
        <ChatThread
          key={`thread-${selected.id}`}
          item={selected}
          detailsOpen={detailsOpen}
          onToggleDetails={() => setDetailsOpen((v) => !v)}
          onAssign={(who) => assign(selected.id, who)}
          onStatus={(status) => setStatus(selected.id, status)}
          onPriority={(priority) => setPriority(selected.id, priority)}
          onResolve={(reason) => resolve(selected.id, reason)}
          onSend={(args) => send(selected.id, args)}
        />
      ) : (
        <EmptyThread />
      )}

      {selected && detailsOpen && <DetailsPanel key={`details-${selected.id}`} item={selected} />}
    </div>
  )
}
