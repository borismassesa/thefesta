// OF-ADM-AUTHORS-001 — split CTA in the page header. The dropdown surfaces
// the two ways an admin acquires a new contributor:
//   1. Create directly — internal author bio (existing /new page)
//   2. Invite via email — sends a scoped link via Resend or mailto fallback
//
// Lavender (#C9A0DC) primary per the OpusFesta brand. Closes on outside
// click and Escape; AddAuthorDialog/InviteAuthorDialog handle their own focus.

'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, MailPlus, Plus, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import InviteAuthorDialog from './InviteAuthorDialog'

export default function AddAuthorMenu() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function chooseDirect() {
    setOpen(false)
    // The new-author form is its own existing route — open it directly so we
    // don't double-implement validation logic.
    router.push('/operations/authors/new')
  }

  function chooseInvite() {
    setOpen(false)
    setInviteOpen(true)
  }

  return (
    <>
      <div className="relative" ref={wrapperRef}>
        <button data-opus-button="control"
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg bg-[#C9A0DC] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#b97fd0]',
            'focus:outline-none focus:ring-2 focus:ring-[#7E5896] focus:ring-offset-1'
          )}
        >
          <Plus className="h-4 w-4" />
          Add author
          <ChevronDown className="h-3.5 w-3.5 opacity-80" />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg"
          >
            <button data-opus-button="control"
              role="menuitem"
              type="button"
              onClick={chooseDirect}
              className="flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-[#F8F0FB]"
            >
              <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-[#7E5896]" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-900">
                  Create directly
                </span>
                <span className="block text-xs text-gray-500">
                  Internal bio for the Author Card
                </span>
              </span>
            </button>
            <button data-opus-button="control"
              role="menuitem"
              type="button"
              onClick={chooseInvite}
              className="flex w-full items-start gap-3 border-t border-gray-100 px-3 py-3 text-left transition-colors hover:bg-[#F8F0FB]"
            >
              <MailPlus className="mt-0.5 h-4 w-4 shrink-0 text-[#7E5896]" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-900">
                  Invite via email
                </span>
                <span className="block text-xs text-gray-500">
                  Send a scoped link to a guest writer
                </span>
              </span>
            </button>
          </div>
        )}
      </div>

      <InviteAuthorDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </>
  )
}
