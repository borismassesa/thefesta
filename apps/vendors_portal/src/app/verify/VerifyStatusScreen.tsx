'use client'

import Link from 'next/link'
import { SignOutButton } from '@clerk/nextjs'
import { LogOut, ShieldCheck } from 'lucide-react'
import Logo from '@/components/ui/Logo'
import { LocaleToggle } from '@/components/LocaleToggle'
import { usePortalT } from '@/components/providers/PortalUIStringsProvider'

type Variant = 'suspended'

// Lightweight status screen for the `suspended` state — the one post-application
// state that isn't an active step or a journey. (admin_review now renders the
// full /verify journey with "Under review" active.) Lives on /verify so it's
// the single vendor status surface — the old /pending route was retired.
export default function VerifyStatusScreen({ variant: _variant }: { variant: Variant }) {
  const t = usePortalT('verify')
  const Icon = ShieldCheck
  const iconClass = 'bg-rose-100 text-rose-600'
  const title = t('status_suspended_title')
  const body = t('status_suspended_body')

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-6 sm:px-10 py-5 border-b border-gray-100/80 bg-white/70 backdrop-blur flex items-center justify-between">
        <Link href="/" aria-label="OpusFesta home" className="block">
          <Logo className="h-7 w-auto" />
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <LocaleToggle />
          <SignOutButton redirectUrl="/sign-in">
            <button data-opus-button="danger" data-opus-button-size="small"
              type="button"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 px-3 py-1.5 rounded-md hover:bg-rose-50 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              {t('sign_out')}
            </button>
          </SignOutButton>
        </div>
      </header>

      <main className="flex-1 px-4 sm:px-6 pt-12 sm:pt-16 pb-16">
        <div className="max-w-xl w-full mx-auto text-center">
          <span
            className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${iconClass}`}
          >
            <Icon className="w-8 h-8" strokeWidth={1.75} />
          </span>
          <h1 className="mt-6 text-3xl sm:text-4xl font-semibold text-gray-900 tracking-tight leading-[1.1]">
            {title}
          </h1>
          <p className="mt-4 text-base text-gray-600 leading-relaxed max-w-md mx-auto">
            {body}
          </p>
        </div>
      </main>
    </div>
  )
}
