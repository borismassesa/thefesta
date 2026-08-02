'use client'

import { useState } from 'react'
import { Monitor } from 'lucide-react'

// The admin dashboard is desktop-only, and this says so instead of letting
// people discover it.
//
// WHY THIS EXISTS
// The shell has no responsive behaviour at all: Sidebar.tsx carries no
// breakpoints, so below roughly 1024px it keeps its full width and pushes the
// content off-screen. On a phone that renders as headings wrapping one letter
// per line and controls that cannot be reached. Approvals inherits this, as
// does every other module.
//
// Repairing the shell is a real piece of work touching shared chrome used by
// every page, and it was deliberately descoped rather than half-done. The
// thing that was NOT acceptable was leaving the dashboard implicitly
// "supported" on mobile while visibly unusable, so this makes the boundary
// explicit.
//
// Discourage, not block: there is an escape hatch. Someone dealing with
// something urgent on a phone should be told the layout will fight them, not
// locked out of their own tools.
//
// Pure CSS breakpoint (`lg:hidden`), not a JS media query, so the server and
// client render identically and there is no hydration flash.
export function DesktopOnlyNotice() {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="desktop-only-title"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-white px-6 text-center lg:hidden"
    >
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#F0DFF6] text-[#7E5896]">
        <Monitor className="h-6 w-6" aria-hidden />
      </span>
      <h1 id="desktop-only-title" className="text-lg font-bold text-gray-900">
        Open this on a desktop
      </h1>
      <p className="max-w-sm text-sm leading-relaxed text-gray-600">
        The admin dashboard is built for a wide screen and is not supported on
        phones or narrow windows. Sign in from a laptop or desktop, or widen
        this window, to use it properly.
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="mt-1 text-sm font-semibold text-[#7E5896] underline underline-offset-4"
      >
        Continue anyway
      </button>
      <p className="max-w-xs text-xs text-gray-400">
        The layout will not fit this screen.
      </p>
    </div>
  )
}
