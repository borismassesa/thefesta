'use client'

import { DEFAULT_LOCALE, isLocale, type Locale } from '@/lib/cms/localized'

/** Shared client store for the opuspass_locale cookie — LocaleToggle writes,
 *  scanner (and any other client UI) reads via useSyncExternalStore. */

export const LOCALE_COOKIE = 'opuspass_locale'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

const listeners = new Set<() => void>()

export function subscribeLocale(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function readCookieLocale(): Locale {
  if (typeof document === 'undefined') return DEFAULT_LOCALE
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
  const value = match?.split('=')[1]
  return isLocale(value) ? value : DEFAULT_LOCALE
}

export function getLocaleSnapshot(): Locale {
  return readCookieLocale()
}

export function getLocaleServerSnapshot(): Locale {
  return DEFAULT_LOCALE
}

export function persistLocale(next: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`
  document.documentElement.setAttribute('lang', next)
  listeners.forEach((l) => l())
}
