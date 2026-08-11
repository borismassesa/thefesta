'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertCircle, RotateCw } from 'lucide-react'
import Logo from '@/components/ui/Logo'
import { useOnboardT } from '@/lib/onboarding/strings'

export default function CategoryPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const { t } = useOnboardT()

  useEffect(() => {
    console.error('[vendors_portal] onboarding category page error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="bg-white border-b border-gray-100">
        <div className="px-6 lg:px-12 py-4 flex items-center">
          <Link href="/" aria-label={t('stepper.aria.home')} className="shrink-0">
            <Logo className="h-7 w-auto text-gray-900" />
          </Link>
        </div>
      </header>

      <main className="px-6 lg:px-12 py-10 lg:py-14">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white border border-red-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-gray-900">
                  {t('category.error.title')}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {t('category.error.body')}
                </p>
                <button data-opus-button="primary" data-opus-button-size="small"
                  type="button"
                  onClick={() => reset()}
                  className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1A1A1A] hover:bg-black text-white text-sm font-semibold transition-colors"
                >
                  <RotateCw className="w-4 h-4" />
                  {t('common.try_again')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
