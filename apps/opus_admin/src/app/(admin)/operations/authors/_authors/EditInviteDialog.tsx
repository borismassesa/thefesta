// OF-ADM-AUTHORS-001 v2 — edit pending invite metadata. Email is intentionally
// read-only: changing it would require revoking and re-inviting (different
// recipient, different scope). The two editable fields match the create flow.

'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { updateContributorInvitation } from '@/lib/advice-submission-actions'

type Props = {
  open: boolean
  onClose: () => void
  invite: {
    id: string
    email: string
    displayName: string | null
    articleTitle: string | null
  }
}

export default function EditInviteDialog({ open, onClose, invite }: Props) {
  const [fullName, setFullName] = useState(invite.displayName ?? '')
  const [articleTitle, setArticleTitle] = useState(invite.articleTitle ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const firstFieldRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setFullName(invite.displayName ?? '')
    setArticleTitle(invite.articleTitle ?? '')
    setError(null)
    firstFieldRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, invite, onClose])

  if (!open) return null

  function save() {
    setError(null)
    startTransition(async () => {
      try {
        await updateContributorInvitation(invite.id, {
          fullName,
          articleTitle,
        })
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save invite.')
      }
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-invite-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="edit-invite-title" className="text-lg font-semibold text-gray-900">
              Edit invite
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Update the recipient name or article title. The invite link stays valid.
            </p>
          </div>
          <button data-opus-button="control"
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Email">
            <input
              type="email"
              value={invite.email}
              readOnly
              className={cn(INPUT_CLS, 'bg-gray-50 text-gray-500')}
              title="Email cannot be changed — revoke and re-invite to switch recipient"
            />
          </Field>
          <Field label="Display name (optional)">
            <input
              ref={firstFieldRef}
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="How they appear on the article byline"
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Article title (optional)">
            <input
              type="text"
              value={articleTitle}
              onChange={(e) => setArticleTitle(e.target.value)}
              placeholder="Helps the writer know what we expect"
              className={INPUT_CLS}
            />
          </Field>

          {error && <p className="text-sm text-rose-700">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button data-opus-button="control"
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button data-opus-button="primary" data-opus-button-size="medium"
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-lg bg-[#C9A0DC] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#b97fd0] disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const INPUT_CLS = cn(
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none',
  'focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]'
)

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </span>
      {children}
    </label>
  )
}
