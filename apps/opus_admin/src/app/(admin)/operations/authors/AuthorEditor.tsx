'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save, Upload } from 'lucide-react'
import { initialsFromName } from '@/lib/cms/advice-ideas'
import { Card, Field, inputCls } from '@/app/(admin)/cms/advice-and-ideas/_ui'
import { resolveMediaUrl } from '@/app/(admin)/cms/advice-and-ideas/_media'
import { uploadAuthorAvatar, upsertAdviceAuthor, type AuthorUpsertInput } from './actions'

type Props = {
  mode: 'create' | 'edit'
  initial: AuthorUpsertInput
}

export default function AuthorEditor({ mode, initial }: Props) {
  const router = useRouter()
  const [draft, setDraft] = useState<AuthorUpsertInput>(initial)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [keyEdited, setKeyEdited] = useState<boolean>(!!initial.key)
  const [initialsEdited, setInitialsEdited] = useState<boolean>(!!initial.initials)

  const set = <K extends keyof AuthorUpsertInput>(key: K, value: AuthorUpsertInput[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const onNameChange = (name: string) => {
    setDraft((d) => ({
      ...d,
      name,
      key: keyEdited ? d.key : name.trim(),
      initials: initialsEdited ? d.initials : initialsFromName(name),
    }))
  }

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('key', draft.key || draft.name || 'unknown')
    try {
      startTransition(async () => {
        const { url } = await uploadAuthorAvatar(fd)
        set('avatar_url', url)
        setMessage('Avatar uploaded.')
      })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleSave = () =>
    startTransition(async () => {
      try {
        const { id } = await upsertAdviceAuthor(draft)
        if (mode === 'create') {
          router.push(`/operations/authors/${id}`)
        } else {
          setMessage('Saved.')
          router.refresh()
        }
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })

  const previewInitials = draft.initials || initialsFromName(draft.name)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/operations/authors"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" /> All authors
        </Link>
        <div className="flex items-center gap-2">
          {message && <span className="text-xs text-gray-500">{message}</span>}
          <button data-opus-button="primary" data-opus-button-size="medium"
            type="button"
            disabled={pending}
            onClick={handleSave}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-[#C9A0DC] hover:bg-[#b97fd0] px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {mode === 'create' ? 'Create author' : 'Save author'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
        <Card title="Author details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Name">
              <input
                type="text"
                value={draft.name}
                onChange={(e) => onNameChange(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Role / title">
              <input
                type="text"
                value={draft.role}
                onChange={(e) => set('role', e.target.value)}
                className={inputCls}
                placeholder="Editorial Director"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_120px] gap-3">
            <Field label="Key (must match post author_name exactly)">
              <input
                type="text"
                value={draft.key}
                onChange={(e) => {
                  setKeyEdited(true)
                  set('key', e.target.value)
                }}
                className={inputCls}
                placeholder="e.g. Nia K."
              />
            </Field>
            <Field label="Initials">
              <input
                type="text"
                value={draft.initials}
                onChange={(e) => {
                  setInitialsEdited(true)
                  set('initials', e.target.value.toUpperCase())
                }}
                className={inputCls}
                maxLength={3}
              />
            </Field>
            <Field label="Sort order">
              <input
                type="number"
                value={draft.sort_order}
                onChange={(e) => set('sort_order', parseInt(e.target.value || '0', 10))}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Bio (shown on the Author Card at the bottom of every article)">
            <textarea
              value={draft.bio}
              onChange={(e) => set('bio', e.target.value)}
              rows={4}
              className={inputCls}
            />
          </Field>

          <Field label="Avatar URL">
            <input
              type="text"
              value={draft.avatar_url ?? ''}
              onChange={(e) => set('avatar_url', e.target.value)}
              className={inputCls}
              placeholder="/assets/images/… or https://…"
            />
          </Field>
          <div className="flex items-center gap-2">
            <button data-opus-button="control"
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={pending}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              Upload avatar
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />
          </div>
        </Card>

        <Card title="Live preview" action={<span className="text-xs text-gray-400">Approximate</span>}>
          <div className="rounded-xl border border-gray-100 p-5 bg-white">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center text-xs font-bold text-gray-600">
                {draft.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolveMediaUrl(draft.avatar_url)} alt="" className="w-full h-full object-cover" />
                ) : (
                  previewInitials
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#1A1A1A] truncate">{draft.name || 'Author name'}</p>
                <p className="text-xs text-gray-500 truncate">{draft.role || 'Role'}</p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-gray-700">
              {draft.bio || 'Short bio shown beneath every article…'}
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}

