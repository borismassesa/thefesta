'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Send, Trash2, AlertCircle } from 'lucide-react'
import {
  publishStorefront,
  discardStorefrontDraft,
  hasStorefrontDraft,
} from './actions'
import { usePortalT } from '@/components/providers/PortalUIStringsProvider'

/**
 * Sticky banner that surfaces draft state on every storefront editor page.
 *
 * - Hidden when there's no staged draft.
 * - Shows a "You have unpublished changes" pill + Publish/Discard buttons
 *   when `vendors.draft_content` is non-empty.
 * - Publish flattens the draft into live columns; the public detail page on
 *   opus_website (/vendors/[slug]) reads only live columns, so couples never
 *   see drafts.
 */
export function StorefrontPublishBar() {
  const router = useRouter()
  const t = usePortalT('storefront-chrome')
  const [hasDraft, setHasDraft] = useState<boolean | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    let cancelled = false
    hasStorefrontDraft().then((v) => {
      if (!cancelled) setHasDraft(v)
    })
    return () => {
      cancelled = true
    }
    // Re-check on route change so saving in another section refreshes the
    // banner state on the current page.
  }, [router])

  // First load (or no draft) — render nothing to keep the layout quiet.
  if (hasDraft !== true) return null

  const onPublish = () => {
    setError(null)
    setMessage(null)
    start(async () => {
      const result = await publishStorefront()
      if (result.ok) {
        setMessage(t('publish_success'))
        setHasDraft(false)
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  const onDiscard = () => {
    setError(null)
    setMessage(null)
    start(async () => {
      const result = await discardStorefrontDraft()
      if (result.ok) {
        setMessage(t('discard_success'))
        setHasDraft(false)
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="sticky top-0 z-30 -mx-6 lg:-mx-10 border-b border-amber-100 bg-amber-50/95 backdrop-blur px-6 lg:px-10 py-3">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
            <AlertCircle className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-900 leading-tight">
              {t('banner_title')}
            </p>
            <p className="text-xs text-amber-800/80 mt-0.5">
              {t('banner_desc')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {message ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" /> {message}
            </span>
          ) : null}
          {error ? (
            <span className="text-xs font-semibold text-red-700">{error}</span>
          ) : null}
          <button data-opus-button="warning" data-opus-button-size="medium"
            type="button"
            onClick={onDiscard}
            disabled={pending}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            {t('discard_button')}
          </button>
          <button data-opus-button="control"
            type="button"
            onClick={onPublish}
            disabled={pending}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-[#7E5896] hover:bg-[#6b4a82] px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {t('publish_button')}
          </button>
        </div>
      </div>
    </div>
  )
}
