'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Manual payment: show the merchant number, take the transaction ID.
 * Specs: OP-CCS-PRD-001 §7.2.1; loophole L1.
 *
 * Submitting a reference does not credit anything. It puts the payment in the
 * Finance queue, and the copy says so plainly — a customer who believes they
 * have paid and then sees no progress will call, and telling them the truth up
 * front is cheaper than that call.
 *
 * Bilingual because the majority of buyers here are reading Kiswahili on a
 * mid-range Android, and this is the screen where a misunderstanding costs
 * real money.
 */
export default function LipaNambaForm({
  orderKey,
  token,
  locale,
  amountLabel,
  merchantNumber,
}: {
  orderKey: string
  token: string | null
  locale: 'en' | 'sw'
  amountLabel: string
  merchantNumber: string | null
}) {
  const router = useRouter()
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const sw = locale === 'sw'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/commission/orders/${encodeURIComponent(orderKey)}/lipa-namba${
          token ? `?t=${encodeURIComponent(token)}` : ''
        }`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference }),
        },
      )
      const body = (await res.json().catch(() => ({}))) as { message?: string }
      if (!res.ok) {
        setError(body.message ?? (sw ? 'Imeshindikana. Jaribu tena.' : 'That did not work. Try again.'))
        return
      }
      setDone(body.message ?? (sw ? 'Asante. Tunahakiki malipo yako.' : 'Thank you. We are checking your payment.'))
      // Refresh so the timeline and the status pill reflect the new state.
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
        <p className="mt-2 text-xs leading-relaxed text-[#6B5B73]">
          {sw
            ? 'Timu yetu ya fedha huhakiki ndani ya saa 4 za kazi. Utapata ujumbe mara tu itakapothibitishwa.'
            : 'Our finance team checks references within 4 working hours. You will get a message as soon as it is confirmed.'}
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-[#E8DCC8] bg-white p-5">
      <h2 className="font-serif text-base text-[#4A2D5C]">
        {sw ? 'Lipa kwa Lipa Namba' : 'Pay by Lipa Namba'}
      </h2>
      <p className="mt-1 text-sm text-[#6B5B73]">
        {sw ? 'Kiasi cha kulipa' : 'Amount to pay'}:{' '}
        <strong className="font-semibold text-[#4A2D5C]">{amountLabel}</strong>
      </p>

      {merchantNumber ? (
        <dl className="mt-4 space-y-2 rounded-xl bg-[#FDF8F5] p-4 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-[#6B5B73]">{sw ? 'Namba ya mfanyabiashara' : 'Merchant number'}</dt>
            <dd className="font-mono font-semibold text-[#4A2D5C]">{merchantNumber}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-[#6B5B73]">{sw ? 'Kumbukumbu' : 'Reference'}</dt>
            <dd className="font-mono font-semibold text-[#4A2D5C]">{orderKey}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 rounded-xl bg-[#FDF8F5] p-4 text-sm text-[#6B5B73]">
          {sw
            ? 'Njia hii haipatikani kwa sasa. Tafadhali wasiliana nasi.'
            : 'This option is unavailable right now. Please contact us.'}
        </p>
      )}

      <form onSubmit={submit} className="mt-4">
        <label className="block text-sm font-medium text-[#4A2D5C]">
          {sw ? 'Weka namba ya muamala' : 'Enter your transaction ID'}
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            required
            minLength={6}
            // A confirmation code is never lowercase in practice, and phone
            // keyboards love to autocorrect it.
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder={sw ? 'k.m. QR12AB34CD' : 'e.g. QR12AB34CD'}
            className="mt-1 w-full rounded-xl border border-[#E8DCC8] px-4 py-3 text-base text-[#4A2D5C] outline-none focus:border-[#C9A961]"
          />
        </label>
        <p className="mt-1 text-xs text-[#8A7A92]">
          {sw
            ? 'Utaipata kwenye ujumbe wa uthibitisho kutoka kwa mtoa huduma wako.'
            : 'You will find this in the confirmation message from your mobile money provider.'}
        </p>

        {error && <p className="mt-3 text-sm text-[#8A4A4A]">{error}</p>}

        <button
          type="submit"
          disabled={busy || !merchantNumber}
          className="mt-4 w-full rounded-full bg-[#4A2D5C] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy
            ? sw
              ? 'Inatuma…'
              : 'Sending…'
            : sw
              ? 'Tuma namba ya muamala'
              : 'Submit transaction ID'}
        </button>
        <p className="mt-2 text-center text-xs text-[#8A7A92]">
          {sw
            ? 'Tutathibitisha kwanza kabla ya malipo kuhesabiwa.'
            : 'We verify this against our records before it counts as paid.'}
        </p>
      </form>
    </section>
  )
}
