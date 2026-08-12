'use client'

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, LogOut, MessagesSquare, Search, Settings, X } from "lucide-react";
import { useClerk } from "@clerk/nextjs";
import NotificationBell from "./NotificationBell";
import { transitionApprovalRequest } from "@/app/(admin)/approvals/actions";
import { usePageHeading } from "./PageHeading";
import { usePageSearch } from "./PageSearch";
import { useInboxUnread } from "./InboxUnread";
import type { CallerProfile } from "@/lib/admin-auth";

// Two empty placeholders sit in the header for pages that need to inject
// their own page-specific content. The vendor review page, for example,
// portals its status pill into `#page-header-badge` and its action buttons
// (Approve / Request corrections / Suspend) into `#page-header-actions`.
// IDs are stable so portals attach reliably across HMR cycles.
const BADGE_SLOT_ID = 'page-header-badge'
const ACTIONS_SLOT_ID = 'page-header-actions'

export function Header({ profile }: { profile: CallerProfile }) {
  // Heading and search are both driven by each page via context — the page
  // is the only thing that knows what it's actually showing and what a
  // search query should match against.
  const heading = usePageHeading()
  const search = usePageSearch()
  // Seeded by the layout, then republished by /inbox as threads are read.
  const inboxUnread = useInboxUnread()

  return (
    <header className="flex items-center justify-between gap-6 pt-4 pb-3 px-8 bg-gray-50/50 relative z-10 w-full shrink-0 print:hidden">
      <div className="min-w-0 flex-1">
        {heading?.back ? (
          // Back-link mode: detail pages (e.g. an employee profile) use
          // this so the global header points back to the parent list
          // rather than echoing the row identity, which already sits in
          // the page body. Two variants:
          //   - { href }    → a true Next.js navigation (route segments)
          //   - { onClick } → client-state reset on the same URL (eg.
          //                   Approvals' dashboard / list / form views
          //                   all live under /approvals; an href would
          //                   be a no-op)
          <div className="flex items-center gap-2 min-w-0">
            {'onClick' in heading.back ? (
              <button data-opus-button="control"
                type="button"
                onClick={heading.back.onClick}
                className="inline-flex items-center gap-1 text-sm font-semibold text-gray-700 hover:text-[#5B2D8E] transition-colors truncate"
              >
                <ChevronLeft className="w-4 h-4 shrink-0" />
                {heading.back.label}
              </button>
            ) : (
              <Link
                href={heading.back.href}
                className="inline-flex items-center gap-1 text-sm font-semibold text-gray-700 hover:text-[#5B2D8E] transition-colors truncate"
              >
                <ChevronLeft className="w-4 h-4 shrink-0" />
                {heading.back.label}
              </Link>
            )}
            <div id={BADGE_SLOT_ID} className="contents" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              {heading?.title && (
                <h1 className="text-xl font-semibold text-gray-900 tracking-tight truncate">
                  {heading.title}
                </h1>
              )}
              <div id={BADGE_SLOT_ID} className="contents" />
            </div>
            {heading?.subtitle && (
              <p className="mt-0.5 text-sm text-gray-500 truncate">
                {heading.subtitle}
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* Page-specific action buttons slot — sits before the global icons
            so the page's primary CTA stays the leftmost interactive element
            in the right rail. */}
        <div id={ACTIONS_SLOT_ID} className="flex items-center gap-2" />

        {search && (
          <div className="relative w-72">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder}
              aria-label={search.ariaLabel}
              className="w-full h-9 pl-9 pr-9 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5B2D8E]/30 focus:border-[#5B2D8E]/40 transition-all"
            />
            {search.value && (
              <button data-opus-button="control"
                type="button"
                onClick={() => (search.onClear ? search.onClear() : search.onChange(''))}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded text-gray-400 hover:text-gray-700 inline-flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Messages: unread threads on /inbox. Seeded on the server from the
            same list the page renders, then republished by the page itself as
            threads are read, so the two stay in step. No unread, no badge. */}
        <Link
          href="/inbox"
          title="Messages"
          aria-label={
            inboxUnread > 0 ? `Messages, ${inboxUnread} unread` : "Messages"
          }
          className="relative rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          <MessagesSquare className="w-5 h-5" />
          {inboxUnread > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {inboxUnread > 9 ? "9+" : inboxUnread}
            </span>
          )}
        </Link>

        {/* The one bell: workflow notifications (approvals and anything else
            that publishes to workflow_events) plus the live support queue.
            Inline approve is handed in here so the bell itself stays free of
            any Approvals-module dependency. */}
        <NotificationBell
          onApprove={async (requestId) => {
            const res = await transitionApprovalRequest(requestId, "Approved", {
              kind: "approve",
            });
            if (!res.ok) throw new Error(res.error);
          }}
        />

        <div className="w-px h-6 bg-gray-200" aria-hidden />

        <HeaderAccount profile={profile} />
      </div>
    </header>
  );
}

// Compact account control on the far right of the header: avatar button that
// drops a small menu (Manage account / Log out). Mirrors the sidebar account
// footer's Clerk wiring so both entry points behave identically — signOut goes
// through Clerk's client so the apex-cookie clearing stays in one place.
function HeaderAccount({ profile }: { profile: CallerProfile }) {
  const { openUserProfile, signOut } = useClerk()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const initials =
    profile.name
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'

  return (
    <div ref={ref} className="relative">
      <button data-opus-button="control"
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={profile.name}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-[#F0DFF6] text-xs font-bold text-[#7E5896] ring-1 ring-black/5 transition-shadow hover:ring-2 hover:ring-[#5B2D8E]/30"
      >
        {profile.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initials
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-lg"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-gray-900">{profile.name}</p>
            {profile.email && (
              <p className="truncate text-xs text-gray-400">{profile.email}</p>
            )}
          </div>
          <div className="my-1 border-t border-gray-100" />
          <button data-opus-button="control"
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              openUserProfile()
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Settings className="h-4 w-4 stroke-[1.5] text-gray-400" />
            Manage account
          </button>
          <div className="my-1 border-t border-gray-100" />
          <button data-opus-button="control"
            type="button"
            role="menuitem"
            disabled={pending}
            onClick={() => {
              setPending(true)
              void signOut()
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          >
            <LogOut className="h-4 w-4 stroke-[1.5]" />
            {pending ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      )}
    </div>
  );
}
