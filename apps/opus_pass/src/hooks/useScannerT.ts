'use client'

import { useCallback, useSyncExternalStore } from 'react'
import {
  getLocaleServerSnapshot,
  getLocaleSnapshot,
  subscribeLocale,
} from '@/lib/cms/locale-cookie-client'
import { scannerString, type ScannerStringKey } from '@/lib/scanner/i18n'

/** Translator for Entrance Card Scanner UI — follows the opuspass_locale cookie. */
export function useScannerT() {
  const locale = useSyncExternalStore(subscribeLocale, getLocaleSnapshot, getLocaleServerSnapshot)
  return useCallback(
    (key: ScannerStringKey, vars?: Record<string, string | number>) => scannerString(locale, key, vars),
    [locale],
  )
}

export function useScannerLocale() {
  return useSyncExternalStore(subscribeLocale, getLocaleSnapshot, getLocaleServerSnapshot)
}
