'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Download, Loader2, Mail, Sparkles } from 'lucide-react'
import type { ReleasedCard } from '@/lib/dashboard/released-cards'
import { downloadReleasedCard } from '@/lib/card-download'

/**
 * The couple's finished cards.
 *
 * Each card is rendered from the frozen file our team approved, fetched through
 * an ownership-checked route rather than a public URL, so what a couple sees
 * here is exactly what was signed off and cannot drift afterwards.
 */
export default function ReleasedCardsView({ cards }: { cards: ReleasedCard[] }) {
  const [downloading, setDownloading] = useState<string | null>(null)

  async function download(card: ReleasedCard) {
    setDownloading(card.designId)
    try {
      await downloadReleasedCard(card.designId, card.cardName)
    } finally {
      setDownloading(null)
    }
  }

  if (cards.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <Sparkles className="mx-auto h-10 w-10 text-[#C9A0DC]" />
        <h1 className="mt-4 text-xl font-semibold text-gray-900">No finished cards yet</h1>
        <p className="mt-2 text-sm text-gray-500">
          When our design team finishes a card and it has been checked, it appears here ready to
          download and share.
        </p>
        <Link
          href="/my/dashboard/orders"
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
        >
          See your orders
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Your cards</h1>
        <p className="mt-1 text-sm text-gray-500">
          {cards.length} finished card{cards.length === 1 ? '' : 's'}, checked by our team and ready
          to use.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card.designId}
            className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
          >
            <div className="flex aspect-[3/4] items-center justify-center overflow-hidden bg-gray-50">
              {card.hasArtefact ? (
                // The real card, served by an ownership-checked route. An <img>
                // renders the SVG as an isolated document, which is exactly why
                // the typefaces were baked into the file at release.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/my/card/${card.designId}`}
                  alt={`${card.cardName} — your finished card`}
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              ) : (
                <div className="px-6 text-center">
                  <AlertTriangle className="mx-auto h-6 w-6 text-amber-500" />
                  <p className="mt-2 text-xs text-gray-500">
                    This card was finished before we started keeping a copy here. Ask us and we
                    will send it over.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2 p-4">
              <div className="min-w-0">
                <h2 className="truncate font-semibold text-gray-900">{card.cardName}</h2>
                <p className="mt-0.5 text-xs text-gray-400">
                  {card.orderRef}
                  {card.releasedAt && ` · ready ${new Date(card.releasedAt).toLocaleDateString()}`}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {card.digitalQty > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#9FE870] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#14361f]">
                    <Mail className="h-3 w-3" />
                    {card.digitalQty.toLocaleString('en-US')} digital
                  </span>
                )}
                {card.printQty > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-600">
                    {card.printQty.toLocaleString('en-US')} printed
                  </span>
                )}
              </div>

              {card.hasArtefact && (
                <button
                  type="button"
                  onClick={() => download(card)}
                  disabled={downloading === card.designId}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#7E5896] px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#6b4a80] disabled:opacity-50"
                >
                  {downloading === card.designId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Download
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
