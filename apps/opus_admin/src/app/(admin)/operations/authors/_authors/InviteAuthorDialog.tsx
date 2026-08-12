// OF-ADM-AUTHORS-001 — invite-via-email dialog. Replaces the old
// AuthorAccessForm card. After "Create & send", shows whether Resend
// delivered the email or whether we fell back to a mailto: handoff.

'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { CheckCircle2, Copy, Link2, Mail, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  createContributorInvitation,
  type ContributorInvitationDelivery,
} from '@/lib/advice-submission-actions'

type ActiveInvite = {
  email: string
  fullName: string | null
  articleTitle: string | null
  link: string
  expiresAt: string
  delivery: ContributorInvitationDelivery
}

function buildMailto(invite: ActiveInvite): string {
  const recipient = invite.fullName?.trim() || invite.email
  const titleClause = invite.articleTitle?.trim()
    ? ` on "${invite.articleTitle.trim()}"`
    : ''
  const subject = invite.articleTitle?.trim()
    ? `Invitation to write for OpusFesta — ${invite.articleTitle.trim()}`
    : 'Invitation to write for OpusFesta Ideas & Advice'
  const body = [
    `Hi ${recipient},`,
    '',
    `We'd love for you to write for OpusFesta's Ideas & Advice section${titleClause}.`,
    '',
    `Use this link to start drafting (it's scoped to your email — sign in with ${invite.email}):`,
    invite.link,
    '',
    'Looking forward to your story!',
    '— The OpusFesta team',
  ].join('\n')
  return `mailto:${encodeURIComponent(invite.email)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`
}

export default function InviteAuthorDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [articleTitle, setArticleTitle] = useState('')
  const [active, setActive] = useState<ActiveInvite | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const firstFieldRef = useRef<HTMLInputElement>(null)

  // Trap focus to the dialog and close on Escape — minimal a11y baseline so
  // we can ship without pulling in @radix-ui or shadcn for v1.
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    firstFieldRef.current?.focus()
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  // Reset on reopen.
  useEffect(() => {
    if (open) {
      setEmail('')
      setFullName('')
      setArticleTitle('')
      setActive(null)
      setError(null)
    }
  }, [open])

  const mailto = useMemo(() => (active ? buildMailto(active) : null), [active])

  if (!open) return null

  function submit() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await createContributorInvitation({
          email,
          fullName,
          articleTitle,
        })
        setActive({
          email: result.recipient.email,
          fullName: result.recipient.fullName,
          articleTitle: result.recipient.articleTitle,
          link: result.link,
          expiresAt: result.expiresAt,
          delivery: result.delivery,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not create invite.')
      }
    })
  }

  async function copyLink() {
    if (!active) return
    await navigator.clipboard.writeText(active.link)
  }

  const banner = active ? deliveryBanner(active.delivery) : null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-author-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="invite-author-title" className="text-lg font-semibold text-gray-900">
              Invite a contributor
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              They get a scoped link to write and submit one article — no admin
              access.
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

        {!active ? (
          <div className="space-y-3">
            <Field label="Email">
              <input
                ref={firstFieldRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="author@example.com"
                className={INPUT_CLS}
              />
            </Field>
            <Field label="Display name (optional)">
              <input
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
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button data-opus-button="primary" data-opus-button-size="medium"
                type="button"
                onClick={submit}
                disabled={pending || !email}
                className="inline-flex items-center gap-2 rounded-lg bg-[#C9A0DC] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#b97fd0] disabled:opacity-50"
              >
                <Mail className="h-4 w-4" />
                {pending ? 'Sending…' : 'Create & send'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {banner && (
              <div
                className={cn(
                  'flex items-start gap-2 rounded-xl border px-3 py-2 text-sm',
                  TONES[banner.tone]
                )}
              >
                {active.delivery.sent ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span>{banner.text}</span>
              </div>
            )}

            <div className="rounded-xl border border-[#E7D5EE] bg-[#F8F0FB] p-3">
              <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#7E5896]">
                <Link2 className="h-3.5 w-3.5" />
                Invite link
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  readOnly
                  value={active.link}
                  className="min-w-[260px] flex-1 rounded-lg border border-[#E7D5EE] bg-white px-3 py-2 text-sm text-gray-700"
                />
                {!active.delivery.sent && mailto && (
                  <a
                    href={mailto}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#C9A0DC] px-3 py-2 text-sm font-semibold text-white hover:bg-[#b97fd0]"
                  >
                    <Mail className="h-4 w-4" />
                    Mail client
                  </a>
                )}
                <button data-opus-button="primary" data-opus-button-size="medium"
                  type="button"
                  onClick={copyLink}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black"
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Expires {new Date(active.expiresAt).toLocaleDateString()}.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button data-opus-button="primary" data-opus-button-size="medium"
                type="button"
                onClick={onClose}
                className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black"
              >
                Done
              </button>
            </div>
          </div>
        )}
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

const TONES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warn: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-gray-200 bg-gray-50 text-gray-700',
} as const

function deliveryBanner(delivery: ContributorInvitationDelivery): {
  tone: 'success' | 'warn' | 'info'
  text: string
} {
  if (delivery.sent) {
    return { tone: 'success', text: 'Email sent via Resend.' }
  }
  if (delivery.reason === 'not_configured') {
    return {
      tone: 'info',
      text: `Resend is not configured${delivery.error ? `: ${delivery.error}` : ''}. Use Mail client to send manually.`,
    }
  }
  return {
    tone: 'warn',
    text: `Resend send failed${delivery.error ? `: ${delivery.error}` : ''}. Use Mail client as a fallback.`,
  }
}
