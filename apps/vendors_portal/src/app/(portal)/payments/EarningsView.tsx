import { Wallet, TrendingUp, Clock, CheckCircle2, Landmark, Info } from 'lucide-react'
import type { EarningsData, VendorEarning } from './actions'
import { RequestPayoutButton } from './RequestPayoutButton'
import { PayoutMethodCard } from './PayoutMethodCard'

function tzs(n: number): string {
  return `TZS ${Math.round(n).toLocaleString('en-US')}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const PAYOUT_METHOD_LABEL: Record<string, string> = {
  mpesa: 'M-Pesa',
  airtel: 'Airtel Money',
  tigo: 'Mixx by Yas',
  lipa_namba: 'Lipa Namba',
  bank: 'Bank transfer',
}

export function EarningsView({ data, nextPayoutLabel }: { data: EarningsData; nextPayoutLabel: string }) {
  const { earnings, pendingNetTzs, paidOutNetTzs, lifetimeGrossTzs, platformFeeTzs, payoutMethod, payoutRequestedAt } = data

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Payments</h1>
        <p className="mt-1 text-sm text-gray-500">
          You keep 88% of every product sale. OpusFesta keeps a 12% platform fee. Payouts run automatically every Monday.
        </p>
      </div>

      {/* Hero — available balance + weekly payout */}
      <div className="overflow-hidden rounded-2xl border border-[#1A1A1A]/10 bg-[#1A1A1A] text-white">
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
              <Wallet className="h-4 w-4" /> Available balance
            </p>
            <p className="mt-2 text-4xl font-bold tracking-tight">{tzs(pendingNetTzs)}</p>
            <p className="mt-1 text-sm text-white/60">
              {pendingNetTzs > 0 ? (
                <>Next payout <span className="font-semibold text-[#9FE870]">{nextPayoutLabel}</span></>
              ) : (
                'Your available balance is paid out every Monday.'
              )}
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <PayoutBadge payoutMethod={payoutMethod} />
            {payoutMethod && pendingNetTzs > 0 ? (
              <RequestPayoutButton
                amountTzs={pendingNetTzs}
                alreadyRequested={payoutRequestedAt != null}
                nextPayoutLabel={nextPayoutLabel}
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat icon={<TrendingUp className="h-4 w-4" />} label="Lifetime sales" value={tzs(lifetimeGrossTzs)} sub={`${tzs(platformFeeTzs)} platform fee`} />
        <Stat icon={<Clock className="h-4 w-4" />} label="Pending payout" value={tzs(pendingNetTzs)} sub="Your 88%, in transit" />
        <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="Paid out" value={tzs(paidOutNetTzs)} sub="All time" />
      </div>

      {/* Payout method — where OpusFesta sends the weekly payout */}
      <div className="mt-4">
        <PayoutMethodCard current={payoutMethod} />
      </div>

      {/* How payouts work */}
      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <p className="text-sm leading-relaxed text-gray-600">
          When a guest buys one of your products, OpusFesta collects the payment and confirms it. Your 88% is added to your
          available balance and sent to your payout method every Monday. Each sale below shows the exact split.
        </p>
      </div>

      {/* Ledger */}
      <h2 className="mb-3 mt-8 text-base font-bold text-gray-900">Sales &amp; earnings</h2>
      {earnings.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-gray-200 py-14 text-center">
          <Wallet className="h-8 w-8 text-gray-300" />
          <p className="text-sm font-semibold text-gray-900">No earnings yet</p>
          <p className="max-w-sm text-sm text-gray-500">
            When a guest buys one of your products and the payment is confirmed, your earnings appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {earnings.map((e) => (
            <EarningCard key={e.id} earning={e} />
          ))}
        </div>
      )}
    </div>
  )
}

function PayoutBadge({ payoutMethod }: { payoutMethod: EarningsData['payoutMethod'] }) {
  if (!payoutMethod) {
    return (
      <p className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/70">
        <Landmark className="h-4 w-4 text-white/50" /> Add your payout method below
      </p>
    )
  }
  const label = PAYOUT_METHOD_LABEL[payoutMethod.methodType] ?? payoutMethod.methodType
  return (
    <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-right">
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/50">
        <Landmark className="h-3.5 w-3.5" /> Paid to
      </p>
      <p className="mt-1 text-sm font-semibold">{label}</p>
      <p className="text-xs text-white/60">
        {payoutMethod.accountNumber} · {payoutMethod.accountHolderName}
      </p>
    </div>
  )
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        <span className="text-gray-400">{icon}</span>
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-gray-900">{value}</p>
      <p className="mt-0.5 text-xs text-gray-500">{sub}</p>
    </div>
  )
}

function EarningCard({ earning: e }: { earning: VendorEarning }) {
  const paid = e.status === 'paid_out'
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            {e.lines.length > 0
              ? e.lines.map((l) => `${l.name}${l.quantity > 1 ? ` ×${l.quantity}` : ''}`).join(', ')
              : 'Product sale'}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">{formatDate(e.createdAt)}</p>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
            paid ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          {paid ? `Paid out ${e.paidOutAt ? formatDate(e.paidOutAt) : ''}`.trim() : 'Pending payout'}
        </span>
      </div>

      {/* The split — sale → platform fee → your earnings */}
      <div className="mt-4 space-y-1.5 border-t border-gray-100 pt-3 text-sm">
        <div className="flex justify-between text-gray-600">
          <span>Sale total</span>
          <span className="tabular-nums">{tzs(e.grossTzs)}</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>Platform fee ({e.commissionPct}%)</span>
          <span className="tabular-nums">&minus; {tzs(e.commissionTzs)}</span>
        </div>
        <div className="flex justify-between border-t border-gray-100 pt-1.5 text-base font-bold text-gray-900">
          <span>You earn</span>
          <span className="tabular-nums text-[#3f6b1f]">{tzs(e.netTzs)}</span>
        </div>
      </div>
    </div>
  )
}
