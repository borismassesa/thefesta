'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { useOnboardT } from '@/lib/onboarding/strings'
import { cn } from '@/lib/utils'

// `inline` — the quiet arrow+text link used in the desktop header row.
// `button` — a tappable bordered pill used at the bottom-left on mobile, where a
// thumb expects a real button rather than a small arrow+text affordance.
type Variant = 'inline' | 'button'

const VARIANT_CLASSES: Record<Variant, string> = {
  inline:
    'inline-flex items-center gap-2 text-sm font-semibold text-gray-900 hover:text-gray-600 transition-colors',
  button:
    'inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 transition-colors',
}

export function BackLink({
  href,
  label,
  variant = 'inline',
  className,
}: {
  href?: string
  label?: string
  variant?: Variant
  className?: string
}) {
  const router = useRouter()
  const { t } = useOnboardT()
  label = label ?? t('common.back')

  const classes = cn(VARIANT_CLASSES[variant], className)
  const inner = (
    <>
      <ArrowLeft className="w-4 h-4" />
      {label}
    </>
  )

  if (href) {
    return (
      <Link href={href} className={classes}>
        {inner}
      </Link>
    )
  }

  return (
    <button data-opus-button="control" type="button" onClick={() => router.back()} className={classes}>
      {inner}
    </button>
  )
}
