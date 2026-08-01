'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatTsh } from '@opusfesta/lib'

type Version = { id: string; versionNo: number; url: string | null; watermarked: boolean }

/**
 * The review decision, as the customer makes it.
 * Specs: OP-CCS-PRD-001 §7.6, §7.11.6; loopholes L14, L19.
 *
 * Two things this screen has to get right:
 *
 * 1. The preview is visibly a preview. It is watermarked across the artwork
 *    and served from a five-minute signed URL, and the copy says plainly that
 *    the balance releases the file. A customer who feels tricked at the
 *    payment step is a customer who does not pay it.
 *
 * 2. "Errors are not revisions" is offered as a real choice, not buried in a
 *    policy page. The two buttons are visibly different paths, because the
 *    distinction only works if the customer can find it — someone who thinks
 *    reporting our typo will cost them a revision simply will not report it,
 *    and we ship a card with a misspelled name.
 */
export default function ReviewPanel({
  orderKey,
  token,
  locale,
  version,
  revisionsRemaining,
  topupPriceTzs,
}: {
  orderKey: string
  token: string | null
  locale: 'en' | 'sw'
  version: Version | null
  revisionsRemaining: number | null
  topupPriceTzs: number | null
}) {
  const router = useRouter()
  const sw = locale === 'sw'
  const [mode, setMode] = useState<'idle' | 'changes' | 'correction' | 'topup'>('idle')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const endpoint = `/api/commission/orders/${encodeURIComponent(orderKey)}/review${
    token ? `?t=${encodeURIComponent(token)}` : ''
  }`

  async function send(payload: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = (await res.json().catch(() => ({}))) as {
        message?: string
        needsTopup?: boolean
      }
      if (!res.ok) {
        if (body.needsTopup) {
          setMode('topup')
          setError(null)
          return
        }
        setError(body.message ?? (sw ? 'Imeshindikana.' : 'That did not work.'))
        return
      }
      setDone(body.message ?? (sw ? 'Asante!' : 'Thank you!'))
      router.refresh()
    } catch {
      setError(sw ? 'Hakuna mtandao. Jaribu tena.' : 'No connection. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <section className="rounded-2xl border border-[#E8DCC8] bg-[#FDF8F5] p-5">
        <p className="text-sm text-[#4A2D5C]">{done}</p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-[#E8DCC8] bg-white p-5">
      <h2 className="font-serif text-lg text-[#4A2D5C]">
        {sw ? 'Kagua muundo wako' : 'Review your design'}
      </h2>

      {version?.url ? (
        <figure className="mt-4">
          {/* Rendered as <img>, never inlined: an SVG injected into the DOM
              would execute in the page's origin. The validator already rejects
              scripts, but defence in depth is cheap here. */}
          <img
            src={version.url}
            alt={sw ? 'Muundo wa kadi yako' : 'Your card design'}
            className="w-full rounded-xl border border-[#E8DCC8]"
            onContextMenu={(e) => e.preventDefault()}
            draggable={false}
          />
          {version.watermarked && (
            <figcaption className="mt-2 text-xs text-[#8A7A92]">
              {sw
                ? 'Hii ni rasimu yenye alama ya maji. Ukilipa salio, utapata faili kamili bila alama mara moja.'
                : 'This is a watermarked preview. Settling the balance releases the full-resolution file immediately, with no watermark.'}
            </figcaption>
          )}
        </figure>
      ) : (
        <p className="mt-3 text-sm text-[#6B5B73]">
          {sw ? 'Rasimu inaandaliwa…' : 'Your preview is being prepared…'}
        </p>
      )}

      {error && <p className="mt-3 text-sm text-[#8A4A4A]">{error}</p>}

      {mode === 'idle' && (
        <div className="mt-5 space-y-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void send({ action: 'approve' })}
            className="w-full rounded-full bg-[#4A2D5C] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sw ? 'Naidhinisha muundo huu' : 'Approve this design'}
          </button>
          <p className="text-center text-xs text-[#8A7A92]">
            {sw
              ? 'Ukiidhinisha, tutakutumia ankara ya salio. Faili hutolewa mara tu baada ya malipo.'
              : 'Approving raises your balance invoice. Your files are released the moment it is paid.'}
          </p>

          <button
            type="button"
            onClick={() => setMode('changes')}
            className="w-full rounded-full border border-[#E8DCC8] bg-white px-5 py-3 text-sm font-semibold text-[#4A2D5C]"
          >
            {sw ? 'Naomba mabadiliko' : 'Request changes'}
            {revisionsRemaining !== null && (
              <span className="ml-1 font-normal text-[#8A7A92]">
                ({revisionsRemaining} {sw ? 'zimebaki' : 'left'})
              </span>
            )}
          </button>

          {/* The distinction that makes §7.11.6 real rather than a slogan. */}
          <button
            type="button"
            onClick={() => setMode('correction')}
            className="w-full text-center text-sm text-[#6B5B73] underline"
          >
            {sw ? 'Kuna kitu tumekikosea' : 'Something here is wrong on our side'}
          </button>
        </div>
      )}

      {(mode === 'changes' || mode === 'correction') && (
        <div className="mt-5">
          <p className="text-sm font-medium text-[#4A2D5C]">
            {mode === 'correction'
              ? sw ? 'Tumekosea nini?' : 'What did we get wrong?'
              : sw ? 'Ungependa nini kibadilike?' : 'What would you like changed?'}
          </p>
          <p className="mt-1 text-xs text-[#8A7A92]">
            {mode === 'correction'
              ? sw
                ? 'Makosa yetu ni bure kabisa na hayahesabiwi kama marekebisho: jina lililokosewa, tarehe isiyo sahihi, faili lisilofunguka.'
                : 'Our mistakes are free and unlimited, and never count as a revision: a misspelled name, the wrong date, a file that will not open.'
              : sw
                ? 'Andika mabadiliko yote kwa pamoja. Ujumbe unaokuja baadaye baada ya kazi kuanza huhesabiwa kama marekebisho mengine.'
                : 'Put all your changes in one message. Anything that arrives after work has restarted counts as a new revision.'}
          </p>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={5}
            className="mt-3 w-full rounded-xl border border-[#E8DCC8] px-4 py-3 text-base text-[#4A2D5C] outline-none focus:border-[#C9A961]"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy || comment.trim().length < 3}
              onClick={() =>
                void send({
                  action: 'request_changes',
                  isCorrection: mode === 'correction',
                  items: [
                    {
                      element: 'general',
                      type: mode === 'correction' ? 'correction' : 'change',
                      comment,
                    },
                  ],
                })
              }
              className="flex-1 rounded-full bg-[#4A2D5C] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {sw ? 'Tuma' : 'Send'}
            </button>
            <button
              type="button"
              onClick={() => { setMode('idle'); setError(null) }}
              className="rounded-full border border-[#E8DCC8] px-5 py-3 text-sm text-[#6B5B73]"
            >
              {sw ? 'Ghairi' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {mode === 'topup' && (
        <div className="mt-5 rounded-xl border border-[#E8DCC8] bg-[#FDF8F5] p-4">
          <p className="text-sm font-medium text-[#4A2D5C]">
            {sw ? 'Marekebisho ya kifurushi chako yamekwisha' : 'You have used the revisions included with your package'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[#6B5B73]">
            {sw
              ? 'Unaweza kuongeza raundi nyingine kwa gharama ndogo. Haitalipwa sasa: huongezwa kwenye salio lako na hulipwa mara moja mwishoni.'
              : 'You can add another round for a small charge. You are not paying now: it is added to your balance and settled in one payment at the end.'}
          </p>
          {topupPriceTzs !== null && (
            <p className="mt-2 text-sm font-semibold text-[#4A2D5C]">{formatTsh(topupPriceTzs)}</p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void send({ action: 'accept_topup' })}
              className="flex-1 rounded-full bg-[#4A2D5C] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {sw ? 'Naikubali gharama hii' : 'Add it to my balance'}
            </button>
            <button
              type="button"
              onClick={() => { setMode('idle'); setError(null) }}
              className="rounded-full border border-[#E8DCC8] px-5 py-3 text-sm text-[#6B5B73]"
            >
              {sw ? 'Hapana' : 'No thanks'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
