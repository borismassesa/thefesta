'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Landmark, Check, Loader2, Pencil, ShieldCheck, Clock } from 'lucide-react'
import { savePayoutMethod } from './actions'
import type { PayoutMethod } from './actions'

const METHOD_OPTIONS: { value: string; label: string; providerLabel?: string }[] = [
  { value: 'mpesa', label: 'M-Pesa (Vodacom)' },
  { value: 'airtel', label: 'Airtel Money' },
  { value: 'tigo', label: 'Mixx by Yas (Tigo)' },
  { value: 'lipa_namba', label: 'Lipa Namba (Till)', providerLabel: 'Network' },
  { value: 'bank', label: 'Bank account', providerLabel: 'Bank name' },
]

const METHOD_LABEL: Record<string, string> = Object.fromEntries(
  METHOD_OPTIONS.map((o) => [o.value, o.label]),
)

function statusPill(status: string) {
  if (status === 'verified')
    return { cls: 'border-emerald-200 bg-emerald-50 text-emerald-700', icon: <ShieldCheck className="h-3.5 w-3.5" />, label: 'Verified' }
  if (status === 'failed')
    return { cls: 'border-rose-200 bg-rose-50 text-rose-700', icon: null, label: 'Needs attention' }
  return { cls: 'border-amber-200 bg-amber-50 text-amber-800', icon: <Clock className="h-3.5 w-3.5" />, label: 'Pending review' }
}

export function PayoutMethodCard({ current }: { current: PayoutMethod | null }) {
  const router = useRouter()
  const [editing, setEditing] = useState(current === null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [methodType, setMethodType] = useState(current?.methodType ?? 'mpesa')

  const selected = METHOD_OPTIONS.find((o) => o.value === methodType)

  const onSubmit = (formData: FormData) => {
    setError(null)
    startTransition(async () => {
      const res = await savePayoutMethod(formData)
      if (res.ok) {
        setEditing(false)
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-gray-900">
          <Landmark className="h-4 w-4 text-gray-400" /> Payout method
        </h2>
        {current && !editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1A1A1A] hover:underline"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        ) : null}
      </div>

      {current && !editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-sm font-semibold text-gray-900">{METHOD_LABEL[current.methodType] ?? current.methodType}</p>
          <p className="text-sm text-gray-500">
            {current.accountNumber} · {current.accountHolderName}
            {current.provider ? ` · ${current.provider}` : ''}
          </p>
          {(() => {
            const s = statusPill(current.status)
            return (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${s.cls}`}>
                {s.icon}
                {s.label}
              </span>
            )
          })()}
        </div>
      ) : (
        <form action={onSubmit} className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-gray-500">
              Method
              <select
                name="method_type"
                value={methodType}
                onChange={(e) => setMethodType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-normal text-gray-900 outline-none focus:border-gray-400"
              >
                {METHOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {selected?.providerLabel ? (
              <label className="block text-xs font-semibold text-gray-500">
                {selected.providerLabel}
                <input
                  name="provider"
                  defaultValue={current?.provider ?? ''}
                  placeholder={selected.value === 'bank' ? 'e.g. CRDB Bank' : 'e.g. M-Pesa'}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal text-gray-900 outline-none focus:border-gray-400"
                />
              </label>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-gray-500">
              {methodType === 'bank' ? 'Account number' : 'Number / Till'}
              <input
                name="account_number"
                defaultValue={current?.accountNumber ?? ''}
                placeholder={methodType === 'bank' ? '0123 4567 8901' : '0754 123 456'}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal text-gray-900 outline-none focus:border-gray-400"
              />
            </label>
            <label className="block text-xs font-semibold text-gray-500">
              Account holder name
              <input
                name="account_holder_name"
                defaultValue={current?.accountHolderName ?? ''}
                placeholder="As it appears on the account"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal text-gray-900 outline-none focus:border-gray-400"
              />
            </label>
          </div>
          <p className="text-xs text-gray-400">
            The name must match your registered account. Finance verifies it before your first payout.
          </p>
          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1A1A1A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save payout method
            </button>
            {current ? (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-500 hover:text-gray-800"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      )}
    </div>
  )
}
