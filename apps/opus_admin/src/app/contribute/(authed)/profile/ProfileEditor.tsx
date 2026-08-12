'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { ImageIcon, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { initialsFromName } from '@/lib/cms/advice-ideas'
import {
  updateContributorProfile,
  uploadContributorAvatar,
} from '@/lib/contribute/profile'
import type { ContributorProfileFormInput } from '@/lib/contribute/profile-types'

type Props = {
  initial: ContributorProfileFormInput
  email: string
  existingId: string | null
}

export default function ProfileEditor({ initial, email, existingId }: Props) {
  const [draft, setDraft] = useState(initial)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarDragOver, setAvatarDragOver] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const bioRef = useRef<HTMLTextAreaElement>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)

  // Auto-grow the bio textarea on initial render and external changes.
  useEffect(() => {
    const el = bioRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft.bio])

  // Auto-derive initials from name unless the user has typed custom ones
  // (we treat it as custom whenever it diverges from the auto-derived value
  // for the previous name — i.e. if the user clears it, we re-derive).
  function setName(name: string) {
    setDraft((d) => {
      const autoForOld = initialsFromName(d.name).toUpperCase()
      const initialsAreAuto = !d.initials || d.initials.toUpperCase() === autoForOld
      return {
        ...d,
        name,
        initials: initialsAreAuto ? initialsFromName(name).toUpperCase() : d.initials,
      }
    })
  }

  function uploadAvatar(file: File) {
    setAvatarUploading(true)
    setError(null)
    const fd = new FormData()
    fd.append('file', file)
    void uploadContributorAvatar(fd)
      .then(({ url }) => setDraft((d) => ({ ...d, avatar_url: url })))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Avatar upload failed.')
      )
      .finally(() => setAvatarUploading(false))
  }

  function onAvatarFileInput(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) uploadAvatar(file)
    event.target.value = ''
  }

  function onAvatarDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setAvatarDragOver(false)
    const file = Array.from(event.dataTransfer.files).find((f) =>
      f.type.startsWith('image/')
    )
    if (file) uploadAvatar(file)
  }

  function save() {
    setMessage(null)
    setError(null)
    startTransition(async () => {
      try {
        await updateContributorProfile(draft)
        setMessage('Profile saved.')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save profile.')
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)] sm:p-8">
        <div className="space-y-5">
          <Field label="Name" hint="As it appears on the byline.">
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tamara Mwenda"
              className={INPUT_CLS}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-[1fr_140px]">
            <Field label="Role" hint="Your title or short descriptor.">
              <input
                type="text"
                value={draft.role}
                onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
                placeholder="e.g. Wedding planner & writer"
                className={INPUT_CLS}
              />
            </Field>
            <Field label="Initials" hint="Used as a fallback avatar.">
              <input
                type="text"
                value={draft.initials}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, initials: e.target.value.toUpperCase() }))
                }
                placeholder="TM"
                maxLength={4}
                className={cn(INPUT_CLS, 'text-center font-semibold tracking-wider')}
              />
            </Field>
          </div>

          <Field
            label="Bio"
            hint="A short paragraph readers see at the bottom of every article."
          >
            <textarea
              ref={bioRef}
              value={draft.bio}
              onChange={(e) => {
                setDraft((d) => ({ ...d, bio: e.target.value }))
                e.currentTarget.style.height = 'auto'
                e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`
              }}
              rows={3}
              placeholder="A wedding planner based in Dar es Salaam who writes about coastal weddings, vendor coordination, and budgets that actually hold."
              className={cn(INPUT_CLS, 'min-h-[88px] resize-none leading-relaxed')}
            />
          </Field>

          <Field label="Avatar" hint="PNG, JPEG, or WebP — under 10MB.">
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setAvatarDragOver(true)
              }}
              onDragLeave={() => setAvatarDragOver(false)}
              onDrop={onAvatarDrop}
              className={cn(
                'flex items-center gap-4 rounded-xl border-2 border-dashed p-3 transition-colors',
                avatarDragOver
                  ? 'border-[#7E5896] bg-[#F8F0FB]'
                  : 'border-gray-200 bg-gray-50/40 hover:border-gray-300'
              )}
            >
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-white text-[11px] font-bold uppercase tracking-wider text-gray-400">
                {draft.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={draft.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span>{draft.initials || <ImageIcon className="h-5 w-5" />}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-700">
                  Drag &amp; drop, or{' '}
                  <button data-opus-button="control"
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="font-semibold text-[#7E5896] underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    {avatarUploading ? 'uploading…' : 'browse'}
                  </button>
                  .
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Square crops look best — readers see this on every article.
                </p>
              </div>
              {draft.avatar_url && (
                <button data-opus-button="danger" data-opus-button-size="small"
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, avatar_url: '' }))}
                  className="shrink-0 rounded-md border border-transparent px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:border-gray-200 hover:bg-white hover:text-gray-900"
                >
                  Remove
                </button>
              )}
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={onAvatarFileInput}
              />
            </div>
          </Field>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
        <div className="min-w-0 text-xs text-gray-500">
          <p>
            Signed in as{' '}
            <span className="font-semibold text-gray-700">{email}</span>
            {existingId ? (
              <span className="ml-2 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                Profile saved
              </span>
            ) : (
              <span className="ml-2 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                Not yet saved
              </span>
            )}
          </p>
          <p className="mt-1 text-gray-400">
            Email comes from your sign-in account — change it via the
            account menu, top right.
          </p>
        </div>
        <button data-opus-button="primary" data-opus-button-size="medium"
          type="button"
          onClick={save}
          disabled={pending || !dirty || !draft.name.trim()}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
            dirty && draft.name.trim() && !pending
              ? 'bg-[#C9A0DC] text-white shadow-sm hover:bg-[#b97fd0]'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          )}
        >
          <Save className="h-4 w-4" />
          {pending ? 'Saving…' : existingId ? 'Save changes' : 'Create profile'}
        </button>
      </div>

      {message && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">
          {error}
        </p>
      )}
    </div>
  )
}

const INPUT_CLS = cn(
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none',
  'focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]'
)

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold text-gray-700">{label}</span>
        {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

