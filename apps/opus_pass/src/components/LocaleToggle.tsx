'use client'

import { useSyncExternalStore, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from '@/lib/cms/localized'

const LOCALE_COOKIE = 'opuspass_locale'
// 1 year — language preference is sticky.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

const SHORT_LABEL: Record<Locale, string> = { en: 'EN', sw: 'SW' }

function readCookieLocale(): Locale {
  if (typeof document === 'undefined') return DEFAULT_LOCALE
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
  const value = match?.split('=')[1]
  return isLocale(value) ? value : DEFAULT_LOCALE
}

// Tiny external store over the locale cookie so the toggle reflects the cookie
// without a setState-in-effect, and stays SSR-safe (server snapshot = default).
const listeners = new Set<() => void>()
function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
function getSnapshot(): Locale {
  return readCookieLocale()
}
function getServerSnapshot(): Locale {
  return DEFAULT_LOCALE
}

// Write the cookie + sync <html lang> synchronously (before router.refresh re-
// renders the server — otherwise the server re-reads the old locale), then
// notify the store so the active state updates.
function persistLocale(next: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`
  document.documentElement.setAttribute('lang', next)
  listeners.forEach((l) => l())
}

// EN/SW segmented switch. Mounted in the navbar; refreshes the route so server
// components re-resolve CMS content in the chosen language.
export function LocaleToggle({ className = '' }: { className?: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

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
