// OF-ADM-AUTHORS-001 — pending invite row. Visually marked with a soft amber
// tint so admins can scan the list and tell at a glance who is "real" vs.
// outstanding. Resend rotates the token via regenerateContributorInvitation;
// failures fall back to a mailto: handoff (matches AuthorAccessForm).
//
// v2 — kebab menu surfaces the rest of the invite CRUD: Copy fresh link,
// Edit recipient/title, and Cancel (soft revoke). Cancel uses ConfirmDialog
// since it invalidates the link and is hard to undo without re-inviting.

'use client'

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Copy, Mail, MoreHorizontal, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  regenerateContributorInvitation,
  regenerateContributorInvitationLink,
  revokeContributorInvitation,
} from '@/lib/advice-submission-actions'
import ConfirmDialog from '../../_shared/ConfirmDialog'
import EditInviteDialog from './EditInviteDialog'
import StatusPill from './StatusPill'
import type { AuthorListEntry } from './types'

type Props = {
  entry: Extract<AuthorListEntry, { kind: 'invite' }>
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  const min = Math.round(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day}d ago`
  const month = Math.round(day / 30)
  return `${month}mo ago`
}

function buildMailto(invite: Props['entry'], link: string): string {
  const recipient = invite.displayName?.trim() || invite.email
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
    link,
    '',
    'Looking forward to your story!',
    '— The OpusFesta team',
  ].join('\n')
  return `mailto:${encodeURIComponent(invite.email)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`
}

type MenuCoords = { top: number; right: number; placement: 'down' | 'up' }

// Used only by the up-vs-down flip in useLayoutEffect — exact pixel
// accuracy isn't needed. Update if menu items change.
const MENU_HEIGHT = 152 // 3 items * ~44px + borders
const MENU_WIDTH = 208 // matches w-52

type Notice = { tone: 'info' | 'error'; text: string }

export default function PendingInviteRow({ entry }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState<Notice | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [coords, setCoords] = useState<MenuCoords | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const [revoking, startRevokeTransition] = useTransition()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Compute menu position relative to viewport. Flip upward if there isn't
  // enough room below — the table wrapper has overflow-hidden so we render
  // the menu in a portal anchored via fixed coordinates.
  useLayoutEffect(() => {
    if (!menuOpen || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const placement: 'down' | 'up' =
      spaceBelow < MENU_HEIGHT + 16 ? 'up' : 'down'
    setCoords({
      top: placement === 'down' ? rect.bottom + 4 : rect.top - MENU_HEIGHT - 4,
      right: window.innerWidth - rect.right,
      placement,
    })
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    const onScroll = () => setMenuOpen(false)
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [menuOpen])

  function resend() {
    setNotice(null)
    startTransition(async () => {
      try {
        const result = await regenerateContributorInvitation(entry.id)
        if (result.delivery.sent) {
          setNotice({ tone: 'info', text: 'Email sent.' })
        } else if (typeof window !== 'undefined') {
          window.location.href = buildMailto(entry, result.link)
        }
      } catch (err) {
        setNotice({
          tone: 'error',
          text: err instanceof Error ? err.message : 'Could not re-send invite.',
        })
      }
    })
  }

  function copyLink() {
    setMenuOpen(false)
    setNotice(null)
    startTransition(async () => {
      try {
        const result = await regenerateContributorInvitationLink(entry.id)
        // Token rotated server-side regardless of clipboard outcome — be
        // explicit that the previous link is dead either way.
        const canCopy =
          typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.writeText)
        if (canCopy) {
          try {
            await navigator.clipboard.writeText(result.link)
            setNotice({
              tone: 'info',
              text: 'Fresh link copied. Previous link no longer works.',
            })
            return
          } catch {
            // fall through to manual-copy notice
          }
        }
        setNotice({
          tone: 'error',
          text: `Could not copy automatically. Previous link no longer works. New link: ${result.link}`,
        })
      } catch (err) {
        setNotice({
          tone: 'error',
          text: err instanceof Error ? err.message : 'Could not generate link.',
        })
      }
    })
  }

  function openEdit() {
    setMenuOpen(false)
    setEditOpen(true)
  }

  function openCancel() {
    setMenuOpen(false)
    setRevokeError(null)
    setConfirmOpen(true)
  }

  function confirmRevoke() {
    setRevokeError(null)
    startRevokeTransition(async () => {
      try {
        await revokeContributorInvitation(entry.id)
        setConfirmOpen(false)
        router.refresh()
      } catch (err) {
        // Keep the dialog open so the user sees the failure inline rather
        // than wondering whether the row really got cancelled.
        setRevokeError(err instanceof Error ? err.message : 'Could not cancel invite.')
      }
    })
  }

  const titleSuffix = entry.articleTitle ? ` · Article: ${entry.articleTitle}` : ''

  return (
    <div data-opus-table-header
      role="row"
      className="grid grid-cols-[24px_36px_minmax(0,1fr)_140px_90px_80px] items-center gap-3 border-b border-gray-100 bg-white px-4 py-3.5 transition-colors hover:bg-gray-50/60"
    >
      {/* Drag handle is disabled for invites — they always sort last by status */}
      <span aria-hidden className="block h-6 w-6" />

      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#F0DFF6] text-[#7E5896]">
        <Mail className="h-4 w-4" />
      </span>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-gray-900" title={entry.email}>
            {entry.email}
          </span>
          <StatusPill variant="pending" />
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-500">
          Invited {relativeTime(entry.invitedAt)}
          {titleSuffix}
        </p>
      </div>

      <div role="cell" className="truncate text-[13px] text-gray-700" title={entry.role || '—'}>
        {entry.role || '—'}
      </div>
      <div role="cell" className="text-[13px] text-gray-400">
        —
      </div>

      <div role="cell" className="flex items-center justify-end gap-1">
        <button data-opus-button="neutral" data-opus-button-size="small"
          type="button"
          onClick={resend}
          disabled={pending || revoking}
          className={cn(
            'inline-flex items-center gap-1 rounded-md border border-[#E7D5EE] bg-white px-2 py-1 text-xs font-semibold text-[#7E5896] transition-colors hover:bg-[#F8F0FB]',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
          title="Generate a fresh link and email it"
        >
          <RefreshCw className={cn('h-3 w-3', pending && 'animate-spin')} />
          {pending ? 'Sending…' : 'Resend'}
        </button>
        <button data-opus-button="control"
          ref={triggerRef}
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          disabled={revoking}
          aria-label="More actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      {mounted && menuOpen && coords &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: 'fixed',
              top: coords.top,
              right: coords.right,
              width: MENU_WIDTH,
              zIndex: 70,
            }}
            className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg"
          >
            <button data-opus-button="control"
              role="menuitem"
              type="button"
              onClick={copyLink}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-gray-800 transition-colors hover:bg-[#F8F0FB]"
            >
              <Copy className="h-4 w-4 shrink-0 text-[#7E5896]" />
              Copy invite link
            </button>
            <button data-opus-button="control"
              role="menuitem"
              type="button"
              onClick={openEdit}
              className="flex w-full items-center gap-2.5 border-t border-gray-100 px-3 py-2.5 text-left text-sm text-gray-800 transition-colors hover:bg-[#F8F0FB]"
            >
              <Pencil className="h-4 w-4 shrink-0 text-[#7E5896]" />
              Edit details
            </button>
            <button data-opus-button="control"
              role="menuitem"
              type="button"
              onClick={openCancel}
              className="flex w-full items-center gap-2.5 border-t border-gray-100 px-3 py-2.5 text-left text-sm text-red-700 transition-colors hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4 shrink-0" />
              Cancel invite
            </button>
          </div>,
          document.body
        )}

      {notice && (
        <p
          className={cn(
            'col-span-full text-right text-xs',
            notice.tone === 'error' ? 'text-rose-700' : 'text-gray-500'
          )}
        >
          {notice.text}
        </p>
      )}

      <EditInviteDialog
        open={editOpen}
        onClose={() => {
          setEditOpen(false)
          router.refresh()
        }}
        invite={{
          id: entry.id,
          email: entry.email,
          displayName: entry.displayName,
          articleTitle: entry.articleTitle,
        }}
      />

      <ConfirmDialog
        open={confirmOpen}
        onCancel={() => {
          setConfirmOpen(false)
          setRevokeError(null)
        }}
        onConfirm={confirmRevoke}
        title={`Cancel invite to ${entry.email}?`}
        body="The invite link stops working immediately. The audit row stays so you can see who was invited and when. Re-invite by sending a new one."
        confirmLabel="Cancel invite"
        cancelLabel="Keep invite"
        variant="danger"
        pending={revoking}
        error={revokeError}
      />
    </div>
  )
}
