'use client'

import { useSyncExternalStore, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LOCALES, type Locale } from '@/lib/cms/localized'
import {
  getLocaleServerSnapshot,
  getLocaleSnapshot,
  persistLocale,
  subscribeLocale,
} from '@/lib/cms/locale-cookie-client'

const SHORT_LABEL: Record<Locale, string> = { en: 'EN', sw: 'SW' }

// EN/SW segmented switch. Sets the opuspass_locale cookie and refreshes so
// server components re-resolve CMS content. Client UIs (scanner) subscribe to
// the same cookie store and update immediately.
export function LocaleToggle({ className = '' }: { className?: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const locale = useSyncExternalStore(subscribeLocale, getLocaleSnapshot, getLocaleServerSnapshot)

  const choose = (next: Locale) => {
    if (next === locale) return
    persistLocale(next)
    startTransition(() => router.refresh())
  }

  return (
    // The active language is read from the cookie on the client, so for a
    // visitor whose cookie is Swahili the highlighted button legitimately
    // differs from the server's default-English render. suppressHydrationWarning
    // tells React this attribute difference is expected (useSyncExternalStore
    // re-renders it to the correct value right after hydration).
    <div
      role="group"
      aria-label={locale === 'sw' ? 'Lugha' : 'Language'}
      suppressHydrationWarning
      className={`inline-flex items-center rounded-full border border-gray-200 bg-white p-0.5 text-xs font-semibold ${className}`}
    >
      {LOCALES.map((l) => {
        const active = l === locale
        return (
          <button
            data-opus-button="control"
            key={l}
            type="button"
            onClick={() => choose(l)}
            disabled={pending}
            aria-pressed={active}
            suppressHydrationWarning
            className={`rounded-full px-2.5 py-1 transition-colors disabled:opacity-60 ${
              active ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            {SHORT_LABEL[l]}
          </button>
        )
      })}
    </div>
  )
}
