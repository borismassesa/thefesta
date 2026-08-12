'use client'

import { LocaleToggle } from '@/components/LocaleToggle'

/** Shared EN/SW control for scanner screens — same cookie as the rest of OpusPass. */
export function ScannerLocaleToggle({ className = '' }: { className?: string }) {
  return <LocaleToggle className={`shadow-sm ${className}`.trim()} />
}
