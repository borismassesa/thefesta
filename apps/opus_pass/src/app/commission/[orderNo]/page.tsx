import { notFound } from 'next/navigation'
import {
  CARD_ORDER_STATUS_LABELS,
  COMMISSION_STEPS,
  COMMISSION_STEP_LABELS,
  formatTsh,
  responsibleParty,
  stepForStatus,
  type CommissionStep,
} from '@opusfesta/lib'
import { authorizeOrderAccess } from '@/lib/commission/access'
import { getLedger, listPayments } from '@/lib/commission/orders'
import LipaNambaForm from './LipaNambaForm'

export const dynamic = 'force-dynamic'

/**
 * The customer's order page.
 * Specs: OP-CCS-PRD-001 §7.9, §8.
 *
 * Three things this page has to do, in priority order:
 *
 *   1. Answer "what happens next and who is holding it" without being asked.
 *      That is the single most common support question in a flow with this
 *      many stages.
 *   2. Show BOTH money steps from the very beginning. The balance is half the
 *      price and it is due at the end — a customer who only discovers that at
 *      approval has been ambushed, and ambushed customers do not pay.
 *   3. Work for someone with no account, on a mid-range Android, in Kiswahili.
 *
 * Reachable unauthenticated with a claim token, which is how an anonymous
 * buyer follows their own order before signing up.
 */

type PageProps = {
  params: Promise<{ orderNo: string }>
  searchParams: Promise<{ t?: string; cancelled?: string }>
}

export default async function CommissionOrderPage({ params, searchParams }: PageProps) {
  const { orderNo } = await params
  const { t: token, cancelled } = await searchParams

  const access = await authorizeOrderAccess(decodeURIComponent(orderNo), token ?? null)
  if (!access.ok) {
    // A wrong or expired link should not reveal whether the order exists.
    if (access.status === 404) notFound()
    return (
      <main className="mx-auto max-w-lg px-5 py-16">
        <div className="rounded-2xl border border-[#E8DCC8] bg-[#FDF8F5] p-6 text-center">
          <h1 className="font-serif text-xl text-[#4A2D5C]">We could not open that order</h1>
          <p className="mt-2 text-sm text-[#6B5B73]">{access.message}</p>
        </div>
      </main>
    )
  }

  const order = access.order
  const [ledger, payments] = await Promise.all([getLedger(order.id), listPayments(order.id)])

  const isSw = order.locale === 'sw'
  const currentStep = stepForStatus(order.status)
  const waitingOn = responsibleParty(order.status)
  const outstanding = Math.max(ledger?.outstandingTzs ?? 0, 0)
  const paid = ledger?.paidTzs ?? 0
  const total = ledger?.effectiveTotalTzs ?? order.total_tzs

  const currentIndex = COMMISSION_STEPS.indexOf(currentStep)
  const rejected = payments.find((p) => p.state === 'rejected' && p.review_note)

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-[#C9A961]">
          {order.order_no}
        </p>
        <h1 className="mt-2 font-serif text-2xl text-[#4A2D5C]">
          {order.provisional_event_name ||
            (isSw ? 'Kadi yako maalum' : 'Your custom card')}
        </h1>
        <p className="mt-2 text-sm text-[#6B5B73]">
          {CARD_ORDER_STATUS_LABELS[order.status][isSw ? 'sw' : 'en']}
          {' · '}
          <span className="text-[#8A7A92]">{whoseTurn(waitingOn, isSw)}</span>
        </p>
      </header>

      {cancelled && (
        <p className="mb-6 rounded-xl border border-[#E8DCC8] bg-[#FDF8F5] px-4 py-3 text-sm text-[#6B5B73]">
          {isSw
            ? 'Malipo yameghairiwa. Unaweza kujaribu tena hapa chini.'
            : 'That payment was cancelled. You can try again below.'}
        </p>
      )}

      {rejected && (
        <p className="mb-6 rounded-xl border border-[#E4B7B7] bg-[#FBF0F0] px-4 py-3 text-sm text-[#8A4A4A]">
          <strong className="font-semibold">
            {isSw ? 'Malipo hayakupatikana. ' : 'We could not match your payment. '}
          </strong>
          {rejected.review_note}
        </p>
      )}

      {/* ── The stepper. Both money steps are present from the start. ─────── */}
      <ol className="mb-8 space-y-0">
        {COMMISSION_STEPS.map((step, i) => (
          <StepRow
            key={step}
            step={step}
            label={COMMISSION_STEP_LABELS[step][isSw ? 'sw' : 'en']}
            state={i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming'}
            last={i === COMMISSION_STEPS.length - 1}
          />
        ))}
      </ol>

      {/* ── Payment summary. Quiet, persistent, shown from checkout onward. ─ */}
      <section className="mb-8 rounded-2xl border border-[#E8DCC8] bg-[#FDF8F5] p-5">
        <h2 className="font-serif text-base text-[#4A2D5C]">
          {isSw ? 'Muhtasari wa malipo' : 'Payment summary'}
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Line label={isSw ? 'Jumla' : 'Total'} value={formatTsh(total)} />
          <Line label={isSw ? 'Umelipa' : 'Paid so far'} value={formatTsh(paid)} />
          <Line
            label={isSw ? 'Bado inadaiwa' : 'Outstanding'}
            value={formatTsh(outstanding)}
            emphasis
          />
        </dl>
        {outstanding > 0 && (
          <p className="mt-3 text-xs leading-relaxed text-[#6B5B73]">
            {isSw
              ? 'Malipo ya awali (50%) huanzisha kazi ya ubunifu. Malipo ya mwisho hulipwa baada ya kuidhinisha muundo, na ndipo faili lako hutolewa.'
              : 'The 50% deposit starts the design work. The balance is paid after you approve the design, and that is what releases your files.'}
          </p>
        )}
      </section>

      {/* ── The action, when there is one for the customer ─────────────────── */}
      {needsPayment(order.status) && (
        <LipaNambaForm
          orderKey={order.order_no}
          token={token ?? null}
          locale={isSw ? 'sw' : 'en'}
          amountLabel={formatTsh(
            order.status.startsWith('deposit') || order.status === 'awaiting_deposit'
              ? Math.max(
                  Math.min(ledger?.depositDueTzs ?? 0, total) - (ledger?.depositPaidTzs ?? 0),
                  0,
                )
              : outstanding,
          )}
          merchantNumber={process.env.LIPA_NAMBA_MERCHANT_NUMBER ?? null}
        />
      )}

      {!order.user_id && (
        <section className="mt-8 rounded-2xl border border-[#E8DCC8] bg-white p-5">
          <h2 className="font-serif text-base text-[#4A2D5C]">
            {isSw ? 'Hifadhi oda hii kwenye akaunti yako' : 'Save this order to your account'}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[#6B5B73]">
            {isSw
              ? 'Unaweza kuendelea bila akaunti. Utahitaji akaunti tu pale kadi itakapokabidhiwa kwenye tukio lako.'
              : 'You can carry on without an account. You only need one at the very end, when the finished card is delivered into your event.'}
          </p>
          <a
            href={`/sign-in?redirect_url=${encodeURIComponent(
              `/commission/${order.order_no}/claim?t=${token ?? ''}`,
            )}`}
            className="mt-4 inline-block rounded-full bg-[#4A2D5C] px-5 py-2.5 text-sm font-semibold text-white"
          >
            {isSw ? 'Ingia na uhifadhi' : 'Sign in and save it'}
          </a>
        </section>
      )}
    </main>
  )
}

function needsPayment(status: string): boolean {
  return [
    'awaiting_deposit',
    'deposit_rejected',
    'awaiting_balance',
    'balance_rejected',
    'balance_overdue',
    'forfeited',
  ].includes(status)
}

function whoseTurn(actor: string, isSw: boolean): string {
  switch (actor) {
    case 'customer':
      return isSw ? 'Tunasubiri wewe' : 'Waiting on you'
    case 'designer':
      return isSw ? 'Mbunifu wetu anaifanyia kazi' : 'With our designer'
    case 'finance':
      return isSw ? 'Tunahakiki malipo yako' : 'We are checking your payment'
    case 'admin':
      return isSw ? 'Timu yetu inaishughulikia' : 'With our team'
    default:
      return isSw ? 'Hakuna hatua inayohitajika' : 'Nothing needed from you'
  }
}

function Line({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[#6B5B73]">{label}</dt>
      <dd
        className={
          emphasis ? 'font-semibold text-[#4A2D5C]' : 'text-[#4A2D5C]'
        }
      >
        {value}
      </dd>
    </div>
  )
}

function StepRow({
  step,
  label,
  state,
  last,
}: {
  step: CommissionStep
  label: string
  state: 'done' | 'current' | 'upcoming'
  last: boolean
}) {
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={[
            'mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold',
            state === 'done'
              ? 'border-[#4A2D5C] bg-[#4A2D5C] text-white'
              : state === 'current'
                ? 'border-[#C9A961] bg-[#C9A961] text-white'
                : 'border-[#E8DCC8] bg-white text-[#C9BFA8]',
          ].join(' ')}
          aria-hidden
        >
          {state === 'done' ? '✓' : ''}
        </span>
        {!last && (
          <span
            className={[
              'w-px flex-1',
              state === 'done' ? 'bg-[#4A2D5C]' : 'bg-[#E8DCC8]',
            ].join(' ')}
          />
        )}
      </div>
      <div className={last ? 'pb-0 pt-0.5' : 'pb-6 pt-0.5'}>
        <p
          className={[
            'text-sm',
            state === 'upcoming' ? 'text-[#A89CB0]' : 'font-semibold text-[#4A2D5C]',
          ].join(' ')}
        >
          {label}
        </p>
        {/* Naming the two money steps explicitly is the point: the customer
            should never be able to say they did not know about the balance. */}
        {(step === 'deposit' || step === 'balance') && state === 'upcoming' && (
          <p className="mt-0.5 text-xs text-[#A89CB0]">50%</p>
        )}
      </div>
    </li>
  )
}
