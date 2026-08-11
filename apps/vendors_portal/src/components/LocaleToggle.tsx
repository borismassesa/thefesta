'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LOCALES, type Locale } from '@/lib/cms/localized'
import { persistLocale, useLocale } from '@/lib/cms/locale-store'

const SHORT_LABEL: Record<Locale, string> = { en: 'EN', sw: 'SW' }

// EN/SW segmented switch. Mounted in the marketing navbar and the onboarding
// chrome. Writes the shared `vendors_locale` cookie (which instantly re-renders
// any client `useOnboardT` consumers via the locale store) and calls
// router.refresh() so server components re-resolve CMS content in the chosen
// language.
export function LocaleToggle({ className = '' }: { className?: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const locale = useLocale()

  const choose = (next: Locale) => {
    if (next === locale) return
    persistLocale(next)
    startTransition(() => router.refresh())
  }

  return (
    // The active language is read from the cookie on the client, so for a
    // visitor whose cookie is Swahili the highlighted button legitimately
    // differs from the server's default-English render. suppressHydrationWarning
    // tells React this attribute difference is expected (the store re-renders it
    // to the correct value right after hydration).
    <div
      role="group"
      aria-label="Language"
      suppressHydrationWarning
      className={`inline-flex items-center rounded-full border border-gray-200 bg-white p-0.5 text-xs font-semibold ${className}`}
    >
      {LOCALES.map((l) => {
        const active = l === locale
        return (
          <button data-opus-button="control"
            key={l}
            type="button"
            onClick={() => choose(l)}
            disabled={pending}
            aria-pressed={active}
            suppressHydrationWarning
            className={`rounded-full px-2.5 py-1 transition-colors disabled:opacity-60 ${
              active ? 'bg-[#1A1A1A] text-white' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            {SHORT_LABEL[l]}
          </button>
        )
      })}
    </div>
  )
}
