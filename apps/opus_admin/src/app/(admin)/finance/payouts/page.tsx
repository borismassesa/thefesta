import { redirect } from 'next/navigation'
import { Wallet, Store, CheckCircle2 } from 'lucide-react'
import { getAdminAccessRole, hasPermission, isAdminDashboardRole } from '@/lib/admin-auth'
import { getPayoutsSummary, getVendorPayouts } from './queries'
import { markEarningsPaid } from './actions'

export const dynamic = 'force-dynamic'

function formatTzs(value: number): string {
  return `TZS ${Math.round(value).toLocaleString('en-US')}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

const PAYOUT_LABEL: Record<string, string> = {
  mpesa: 'M-Pesa',
  airtel: 'Airtel Money',
  tigo: 'Mixx by Yas',
  lipa_namba: 'Lipa Namba',
  bank: 'Bank',
  stripe_connect: 'Stripe',
}

export default async function VendorPayoutsPage() {
  const role = await getAdminAccessRole()
  if (!isAdminDashboardRole(role)) redirect('/contribute')
  if (!(await hasPermission('finance.read'))) redirect('/')
  const canWrite = await hasPermission('finance.write')

  const [summary, payouts] = await Promise.all([getPayoutsSummary(), getVendorPayouts()])

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Vendor payouts</h1>
        <p className="mt-1 text-sm text-gray-500">
          What OpusFesta owes each product vendor — the vendor keeps 88% of each order, OpusFesta keeps a 12% platform
          fee. Pay the vendor via their payout method, then mark it settled here.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Owed to vendors</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">{formatTzs(summary.pendingTzs)}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Platform fee (12%)</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-[#7E5896]">{formatTzs(summary.platformFeeTzs)}</p>
          <p className="mt-0.5 text-xs text-gray-500">OpusFesta&rsquo;s cut on pending orders</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Vendors owed</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">{summary.vendorsOwed}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Paid out (all time)</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">{formatTzs(summary.paidOutTzs)}</p>
        </div>
      </div>

      {payouts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-gray-200 py-16 text-center">
          <Wallet className="h-8 w-8 text-gray-300" />
          <p className="text-sm font-semibold text-gray-900">No vendor earnings yet</p>
          <p className="max-w-sm text-sm text-gray-500">Earnings appear here once product orders are paid.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {payouts.map((p) => (
            <div key={p.vendorId} className="rounded-2xl border border-gray-100 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-gray-900">
                    <Store className="h-4 w-4 text-gray-400" /> {p.vendorName}
                    {p.requestedAt ? (
                      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        Payout requested {formatDate(p.requestedAt)}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    {p.payoutMethod
                      ? `${PAYOUT_LABEL[p.payoutMethod.type] ?? p.payoutMethod.type} · ${p.payoutMethod.account}${p.payoutMethod.holder ? ` · ${p.payoutMethod.holder}` : ''}`
                      : 'No payout method on file'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-gray-900">{formatTzs(p.pendingTzs)}</p>
                  {p.pendingCount > 0 ? (
                    <p className="text-xs text-gray-500">
                      {formatTzs(p.pendingGrossTzs)} gross &minus; {formatTzs(p.pendingFeeTzs)} fee (12%)
                    </p>
                  ) : null}
                  <p className="text-xs text-gray-500">
                    {p.pendingCount} order{p.pendingCount === 1 ? '' : 's'} pending
                    {p.paidOutTzs > 0 ? ` · ${formatTzs(p.paidOutTzs)} paid` : ''}
                  </p>
                </div>
              </div>

              {p.pendingCount > 0 && canWrite ? (
                <form action={markEarningsPaid} className="mt-4 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-4">
                  <input type="hidden" name="ids" value={p.pendingIds.join(',')} />
                  <label className="flex-1 min-w-[140px] text-xs font-semibold text-gray-500">
                    Reference
                    <input
                      name="reference"
                      placeholder="M-Pesa / bank ref"
                      className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal text-gray-900 outline-none focus:border-gray-400"
                    />
                  </label>
                  <label className="flex-1 min-w-[140px] text-xs font-semibold text-gray-500">
                    Note (optional)
                    <input
                      name="note"
                      placeholder="e.g. batch 2026-07"
                      className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal text-gray-900 outline-none focus:border-gray-400"
                    />
                  </label>
                  <button data-opus-button="primary" data-opus-button-size="medium"
                    type="submit"
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Mark paid
                  </button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
