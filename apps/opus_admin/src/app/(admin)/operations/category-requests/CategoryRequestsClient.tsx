'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { CheckCircle2, XCircle, ExternalLink, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSetPageHeading } from '@/components/PageHeading'
import EmptyState from '../_shared/EmptyState'
import StatusPill, { type StatusVariant } from '../_shared/StatusPill'
import { reviewCategoryRequest } from './actions'
import type { CategoryRequestRow } from './page'

const STATUS_VARIANT: Record<string, StatusVariant> = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
}

export default function CategoryRequestsClient({ requests }: { requests: CategoryRequestRow[] }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useSetPageHeading({
    title: 'Category Requests',
    subtitle: 'Vendors who selected "Something else" during onboarding.',
  })

  const act = (id: string, status: 'approved' | 'rejected') => {
    setError(null)
    startTransition(async () => {
      const result = await reviewCategoryRequest(id, status)
      if (!result.ok) setError(result.error)
    })
  }

  const pending = requests.filter((r) => r.status === 'pending')
  const resolved = requests.filter((r) => r.status !== 'pending')

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Approve to promote the label to a real category via{' '}
        <Link href="/operations/categories" className="font-semibold text-[#7E5896] hover:underline">
          Vendor Categories
        </Link>
        .
      </p>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {pending.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white">
          <EmptyState
            icon={<Tag className="h-5 w-5" />}
            title="No pending category requests"
            body="New requests show up here as vendors pick “Something else” during onboarding."
          />
        </div>
      )}

      {pending.length > 0 && (
        <Section title={`Pending (${pending.length})`}>
          <RequestTable requests={pending} isPending={isPending} onAct={act} />
        </Section>
      )}

      {resolved.length > 0 && (
        <Section title="Resolved">
          <RequestTable requests={resolved} isPending={isPending} onAct={act} />
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">{title}</h2>
      {children}
    </div>
  )
}

function RequestTable({
  requests,
  isPending,
  onAct,
}: {
  requests: CategoryRequestRow[]
  isPending: boolean
  onAct: (id: string, status: 'approved' | 'rejected') => void
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <table className="opus-table w-full text-sm">
        <thead className="border-b border-gray-100 bg-gray-50/60">
          <tr>
            {['Business', 'Requested label', 'Submitted', 'Status', ''].map((h) => (
              <th key={h} className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {requests.map((req) => (
            <tr key={req.id} className="transition-colors hover:bg-gray-50/60">
              <td className="px-5 py-3.5">
                {req.vendors ? (
                  <Link
                    href={`/operations/vendors/${req.vendor_id}`}
                    className="inline-flex items-center gap-1 font-semibold text-gray-900 hover:text-[#5B2D8E] hover:underline"
                  >
                    {req.vendors.business_name}
                    <ExternalLink className="h-3 w-3 text-gray-400" />
                  </Link>
                ) : (
                  <span className="text-gray-400 italic">Unknown</span>
                )}
                {req.vendors?.vendor_code && (
                  <div className="font-mono text-xs text-gray-400">{req.vendors.vendor_code}</div>
                )}
              </td>
              <td className="px-5 py-3.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F0DFF6] px-2.5 py-1 text-xs font-semibold text-[#7E5896]">
                  <Tag className="h-3 w-3" />
                  {req.requested_label}
                </span>
              </td>
              <td className="px-5 py-3.5 text-xs text-gray-500">
                {new Date(req.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
              </td>
              <td className="px-5 py-3.5">
                <StatusPill variant={STATUS_VARIANT[req.status] ?? 'pending'} />
              </td>
              <td className="px-5 py-3.5">
                {req.status === 'pending' && (
                  <div className="flex items-center justify-end gap-2">
                    <button data-opus-button="control"
                      onClick={() => onAct(req.id, 'approved')}
                      disabled={isPending}
                      title="Approve — add to Vendor Categories CMS"
                      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                    </button>
                    <button data-opus-button="danger" data-opus-button-size="small"
                      onClick={() => onAct(req.id, 'rejected')}
                      disabled={isPending}
                      title="Reject"
                      className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" /> Reject
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
