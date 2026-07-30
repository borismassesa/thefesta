import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import Logo from '@/components/ui/Logo'
import { LocaleToggle } from '@/components/LocaleToggle'

/**
 * Chrome for the token-addressed card pages.
 *
 * These are reached from a WhatsApp link, so for many couples this is the first
 * OpusPass screen they ever see — an unbranded form on white reads as a
 * phishing page, not as us. It carries the logo, the language toggle (the card
 * copy itself is bilingual, so the form around it has to be too), and a way
 * onward, but deliberately not the full site nav: there is no session here and
 * most of that nav would bounce them to a sign-in.
 */
export default function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#FDFDFD]">
      <header className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" aria-label="OpusPass home">
            <Logo />
          </Link>
          <LocaleToggle />
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-gray-100 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-5">
          <p className="text-xs text-gray-500">
            Digital cards, guest lists and RSVPs for Tanzanian celebrations.
          </p>
          <div className="flex items-center gap-2">
            <Link
              href="/digital-cards"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              Browse cards
            </Link>
            <Link
              href="/my/dashboard"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7E5896] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#6b4a80]"
            >
              My dashboard
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
