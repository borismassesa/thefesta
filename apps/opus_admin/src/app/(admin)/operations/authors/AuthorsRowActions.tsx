'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { deleteAdviceAuthor } from './actions'
import ConfirmDialog from '../_shared/ConfirmDialog'

export default function AuthorsRowActions({
  id,
  name,
}: {
  id: string
  name?: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const router = useRouter()

  const onConfirmDelete = () => {
    startTransition(async () => {
      await deleteAdviceAuthor(id)
      setConfirmOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <Link
          href={`/operations/authors/${id}`}
          title="Edit"
          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <Pencil className="h-4 w-4" />
        </Link>
        <button data-opus-button="control"
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={pending}
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
        title={name ? `Delete ${name}?` : 'Delete this author?'}
        body="Articles already referencing this author keep their stored name and role — only the bio profile (and the Author Card on those pages) goes away."
        confirmLabel="Delete author"
        cancelLabel="Keep author"
        variant="danger"
        pending={pending}
      />
    </>
  )
}
