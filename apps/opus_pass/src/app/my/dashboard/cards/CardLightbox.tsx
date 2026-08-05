'use client'

import { useEffect } from 'react'
import { Download, Loader2, X } from 'lucide-react'

/**
 * A card at full size.
 *
 * Shared by the gallery and the detail page: a card is dense with small print
 * (venue, times, contacts) and the couple has to be able to read every line of
 * it before they send it to anyone.
 *
 * Escape closes it as well as the button, because on a phone the close button
 * can end up under the browser chrome.
 */
export default function CardLightbox({
  designId,
  releaseId,
  cardName,
  downloading,
  onClose,
  onDownload,
}: {
  designId: string
  releaseId?: string | null
  cardName: string
  downloading: boolean
  onClose: () => void
  onDownload: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const src = `/api/my/card/${designId}${releaseId ? `?release=${encodeURIComponent(releaseId)}` : ''}`

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#1A1A1A]/92 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${cardName}, full size`}
      onClick={onClose}
    >
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
        >
          <X className="h-4 w-4" />
          Close
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`${cardName}, full size`}
          className="max-h-full max-w-full rounded-lg bg-white object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onDownload()
        }}
        disabled={downloading}
        className="mx-auto flex w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#1A1A1A] disabled:opacity-60"
      >
        {downloading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        Download card
      </button>
    </div>
  )
}
