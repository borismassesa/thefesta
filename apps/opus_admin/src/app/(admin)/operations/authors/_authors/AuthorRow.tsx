// OF-ADM-AUTHORS-001 — active author row. Drag handle uses dnd-kit's
// useSortable; the rest is a CSS grid that mirrors the header so columns
// align across rows.

'use client'

import Link from 'next/link'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil, Trash2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import AuthorAvatar from './AuthorAvatar'
import StatusPill from './StatusPill'
import ConfirmDialog from '../../_shared/ConfirmDialog'
import { deleteAdviceAuthor } from '../actions'
import type { AuthorListEntry } from './types'

type Props = {
  entry: Extract<AuthorListEntry, { kind: 'author' }>
  reorderable: boolean
}

export default function AuthorRow({ entry, reorderable }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id, disabled: !reorderable })

  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDelete, startDeleteTransition] = useTransition()

  const onConfirmDelete = () => {
    startDeleteTransition(async () => {
      await deleteAdviceAuthor(entry.id)
      setConfirmOpen(false)
      router.refresh()
    })
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div data-opus-table-header
      ref={setNodeRef}
      style={style}
      role="row"
      className={cn(
        'grid grid-cols-[24px_36px_minmax(0,1fr)_140px_90px_80px] items-center gap-3 border-b border-gray-100 bg-white px-4 py-3.5 transition-colors hover:bg-gray-50/60',
        isDragging && 'shadow-lg ring-1 ring-[#C9A0DC]/40 z-10 relative'
      )}
    >
      <button data-opus-button="control"
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag ${entry.name}`}
        title="Drag to reorder"
        disabled={!reorderable}
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded text-gray-300 transition-colors',
          reorderable
            ? 'cursor-grab hover:bg-gray-100 hover:text-gray-500 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A0DC]'
            : 'cursor-not-allowed opacity-30'
        )}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <AuthorAvatar
        name={entry.name}
        initials={entry.initials}
        avatarUrl={entry.avatarUrl}
        seed={entry.email || entry.name}
      />

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Link
            href={`/operations/authors/${entry.id}`}
            className="truncate text-sm font-semibold text-gray-900 hover:text-[#7E5896]"
            title={entry.name}
          >
            {entry.name}
          </Link>
          <StatusPill variant="active" />
        </div>
        {entry.bio && (
          <p className="mt-0.5 truncate text-xs text-gray-500" title={entry.bio}>
            {entry.bio}
          </p>
        )}
      </div>

      <div role="cell" className="truncate text-[13px] text-gray-700" title={entry.role || '—'}>
        {entry.role || '—'}
      </div>
      <div role="cell" className="text-[13px] tabular-nums text-gray-700">
        {entry.articleCount}
      </div>

      <div role="cell" className="flex items-center justify-end gap-1">
        <Link
          href={`/operations/authors/${entry.id}`}
          aria-label={`Edit ${entry.name}`}
          title="Edit"
          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <Pencil className="h-4 w-4" />
        </Link>
        <button data-opus-button="control"
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={pendingDelete}
          aria-label={`Delete ${entry.name}`}
          title="Delete"
          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={onConfirmDelete}
        title={`Delete ${entry.name}?`}
        body="Articles already referencing this author keep their stored name and role — only the bio profile (and the Author Card on those pages) goes away."
        confirmLabel="Delete author"
        cancelLabel="Keep author"
        variant="danger"
        pending={pendingDelete}
      />
    </div>
  )
}
