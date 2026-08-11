// OF-ADM-AUTHORS-001 — orchestrates the authors + invites list. Owns search,
// filter, and dnd-kit reorder state. Active authors are sortable; pending
// invites pin to the bottom regardless of role group (documented choice — it
// keeps the actionable "do something about this invite" rows in one place).
//
// TODO(OF-ADM-AUTHORS-001 v2): bulk select for archive / delete / copy-link.

'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Mail } from 'lucide-react'
import { reorderAdviceAuthors } from '../actions'
import AuthorRow from './AuthorRow'
import PendingInviteRow from './PendingInviteRow'
import type { AuthorListEntry } from './types'

type Props = {
  authors: Extract<AuthorListEntry, { kind: 'author' }>[]
  invites: Extract<AuthorListEntry, { kind: 'invite' }>[]
  search: string
  roleFilter: string | null
  statusFilter: 'all' | 'active' | 'pending'
}

function matchesSearch(entry: AuthorListEntry, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  if (entry.kind === 'author') {
    return (
      entry.name.toLowerCase().includes(needle) ||
      (entry.email?.toLowerCase().includes(needle) ?? false) ||
      entry.role.toLowerCase().includes(needle)
    )
  }
  return (
    entry.email.toLowerCase().includes(needle) ||
    (entry.displayName?.toLowerCase().includes(needle) ?? false) ||
    (entry.articleTitle?.toLowerCase().includes(needle) ?? false)
  )
}

export default function AuthorsTable({
  authors,
  invites,
  search,
  roleFilter,
  statusFilter,
}: Props) {
  const [order, setOrder] = useState<string[]>(() => authors.map((a) => a.id))
  const [, startTransition] = useTransition()

  // Sync local order if the server-supplied list changes (e.g. after a new
  // author is added). Keep any IDs we already had to avoid flicker.
  useMemo(() => {
    setOrder((prev) => {
      const known = new Set(prev)
      const incoming = authors.map((a) => a.id)
      const merged = [...prev.filter((id) => incoming.includes(id))]
      for (const id of incoming) if (!known.has(id)) merged.push(id)
      return merged
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authors.map((a) => a.id).join('|')])

  const orderedAuthors = useMemo(() => {
    const byId = new Map(authors.map((a) => [a.id, a]))
    return order.map((id) => byId.get(id)).filter(Boolean) as typeof authors
  }, [order, authors])

  const visibleAuthors = useMemo(
    () =>
      orderedAuthors.filter((a) => {
        if (statusFilter === 'pending') return false
        if (roleFilter && a.role !== roleFilter) return false
        return matchesSearch(a, search)
      }),
    [orderedAuthors, statusFilter, roleFilter, search]
  )

  const visibleInvites = useMemo(
    () =>
      invites.filter((i) => {
        if (statusFilter === 'active') return false
        if (roleFilter && (i.role ?? null) !== roleFilter) return false
        return matchesSearch(i, search)
      }),
    [invites, statusFilter, roleFilter, search]
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const reorderable = !search && !roleFilter && statusFilter === 'all'

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = order.indexOf(String(active.id))
    const to = order.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    const next = arrayMove(order, from, to)
    setOrder(next) // optimistic
    startTransition(async () => {
      try {
        await reorderAdviceAuthors(next)
      } catch {
        // Revert on failure — UI signals via toast in the future; for now we
        // just snap back to the prior order.
        setOrder(order)
      }
    })
  }

  const total = visibleAuthors.length + visibleInvites.length
  const empty = total === 0

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div data-opus-table-header
        role="row"
        className="grid grid-cols-[24px_36px_minmax(0,1fr)_140px_90px_80px] items-center gap-3 border-b border-gray-100 bg-gray-50/60 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500"
      >
        <span aria-hidden />
        <span aria-hidden />
        <span>Author</span>
        <span>Role</span>
        <span>Articles</span>
        <span className="text-right">Actions</span>
      </div>

      {empty ? (
        <EmptyState />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visibleAuthors.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            {visibleAuthors.map((a) => (
              <AuthorRow key={a.id} entry={a} reorderable={reorderable} />
            ))}
          </SortableContext>
          {visibleInvites.map((i) => (
            <PendingInviteRow key={i.id} entry={i} />
          ))}
        </DndContext>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#F0DFF6] text-[#7E5896]">
        <Mail className="h-5 w-5" />
      </span>
      <p className="text-sm font-semibold text-gray-900">No matches</p>
      <p className="mt-1 text-sm text-gray-500">
        Adjust the filters or invite a new contributor.
      </p>
    </div>
  )
}
