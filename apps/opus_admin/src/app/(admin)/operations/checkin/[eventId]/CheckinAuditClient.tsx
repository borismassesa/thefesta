'use client'

import { AlertTriangle, FileClock, ScrollText } from 'lucide-react'

/**
 * The Internal Audit report. OpusFesta staff only, never shown to a client.
 *
 * Answers one question: can we prove exactly what happened at the door? So it
 * is the raw ledger, one row per admission mutation, with nothing softened and
 * nothing aggregated away. Where the Client report says "3 manual admissions",
 * this says which request id, which credential, which operator, and when.
 *
 * It also states, in writing, what is NOT captured. A gap that is invisible
 * reads as an absence of events rather than an absence of instrumentation, and
 * someone will eventually cite this page as proof that something did not
 * happen when the truth is that we never recorded it.
 */

export interface AuditLedgerRow {
  id: string
  requestId: string
  guestName: string | null
  passId: string | null
  result: string
  admittedCount: number
  totalAfter: number | null
  allowanceAfter: number | null
  source: string
  resolutionMethod: string | null
  admissionMode: string | null
  manualReason: string | null
  reason: string | null
  attendantName: string | null
  checkedInBy: string | null
  checkedInDoor: string | null
  credentialFormat: string | null
  createdAt: string
  completedAt: string | null
}

export interface AuditSnapshotRow {
  id: string
  version: number
  modelVersion: number
  finalizedAt: string
  supersededAt: string | null
}

function dt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Africa/Dar_es_Salaam',
  })
}

const RESULT_CLASS: Record<string, string> = {
  admitted: 'bg-emerald-50 text-emerald-700',
  exhausted: 'bg-amber-50 text-amber-700',
  not_attending: 'bg-rose-50 text-rose-700',
  in_progress: 'bg-gray-100 text-gray-600',
}

function Section({
  title,
  icon,
  count,
  children,
}: {
  title: string
  icon: React.ReactNode
  count?: number
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
          {icon}
          {title}
        </h2>
        {typeof count === 'number' ? (
          <span className="text-xs font-semibold tabular-nums text-gray-400">{count}</span>
        ) : null}
      </div>
      {children}
    </section>
  )
}

export default function CheckinAuditClient({
  ledger,
  snapshots,
}: {
  ledger: AuditLedgerRow[]
  snapshots: AuditSnapshotRow[]
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 rounded-2xl border border-[#C9A0DC] bg-[#faf7fc] px-5 py-3">
        <span className="rounded-full bg-[#7E5896] px-2.5 py-1 text-[11px] font-semibold tracking-wide text-white">
          INTERNAL
        </span>
        <p className="text-xs text-gray-600">
          Staff only. Contains operator names, credential formats and request ids. Never share this
          view or its contents with a couple.
        </p>
      </div>

      <Section
        title="Admission ledger"
        icon={<ScrollText className="h-3.5 w-3.5 text-[#7E5896]" />}
        count={ledger.length}
      >
        {ledger.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">
            No admission mutation has been recorded for this event.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/70 text-[10px] font-semibold tracking-wide text-gray-500 uppercase">
                  <th className="px-4 py-2.5 text-left">When</th>
                  <th className="px-4 py-2.5 text-left">Guest</th>
                  <th className="px-4 py-2.5 text-left">Result</th>
                  <th className="px-4 py-2.5 text-right">Seats</th>
                  <th className="px-4 py-2.5 text-right">After</th>
                  <th className="px-4 py-2.5 text-left">Resolution</th>
                  <th className="px-4 py-2.5 text-left">Mode</th>
                  <th className="px-4 py-2.5 text-left">Door</th>
                  <th className="px-4 py-2.5 text-left">Operator</th>
                  <th className="px-4 py-2.5 text-left">Credential</th>
                  <th className="px-4 py-2.5 text-left">Reason</th>
                  <th className="px-4 py-2.5 text-left">Request id</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ledger.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-2.5 whitespace-nowrap tabular-nums text-gray-500">
                      {dt(r.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900">{r.guestName ?? '—'}</div>
                      {r.passId ? (
                        <div className="font-mono text-[10px] text-gray-400">{r.passId}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          RESULT_CLASS[r.result] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {r.result}
                      </span>
                    </td>
                    {/* Negative counts are downward amendments, not admissions. */}
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums ${
                        r.admittedCount < 0 ? 'font-semibold text-rose-600' : 'text-gray-700'
                      }`}
                    >
                      {r.admittedCount}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                      {r.totalAfter ?? '—'}/{r.allowanceAfter ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{r.resolutionMethod ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.admissionMode ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.checkedInDoor ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {r.attendantName ?? r.checkedInBy ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{r.credentialFormat ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.manualReason ?? r.reason ?? '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-gray-400">{r.requestId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Report snapshot history"
        icon={<FileClock className="h-3.5 w-3.5 text-[#7E5896]" />}
        count={snapshots.length}
      >
        {snapshots.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">
            No client report has been finalized for this event.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/70 text-[10px] font-semibold tracking-wide text-gray-500 uppercase">
                  <th className="px-4 py-2.5 text-left">Version</th>
                  <th className="px-4 py-2.5 text-left">Model</th>
                  <th className="px-4 py-2.5 text-left">Finalized</th>
                  <th className="px-4 py-2.5 text-left">State</th>
                  <th className="px-4 py-2.5 text-left">Snapshot id</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {snapshots.map((snap) => (
                  <tr key={snap.id}>
                    <td className="px-4 py-2.5 font-semibold text-gray-900">v{snap.version}</td>
                    <td className="px-4 py-2.5 text-gray-500">model v{snap.modelVersion}</td>
                    <td className="px-4 py-2.5 tabular-nums text-gray-500">{dt(snap.finalizedAt)}</td>
                    <td className="px-4 py-2.5">
                      {snap.supersededAt ? (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                          superseded {dt(snap.supersededAt)}
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-gray-400">{snap.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Named, not omitted. A gap nobody can see reads as an absence of events
          rather than an absence of instrumentation, and this page will one day
          be cited as proof that something did not happen. */}
      <Section title="Not captured" icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}>
        <dl className="divide-y divide-gray-100">
          <div className="px-5 py-3">
            <dt className="text-sm font-medium text-gray-900">Device identity</dt>
            <dd className="mt-0.5 text-xs text-gray-500">
              <code className="rounded bg-gray-100 px-1">source</code> records which code path called
              in (always <code className="rounded bg-gray-100 px-1">api</code> today), not which
              handset. No device id is stored anywhere.
            </dd>
          </div>
          <div className="px-5 py-3">
            <dt className="text-sm font-medium text-gray-900">Verified operator identity</dt>
            <dd className="mt-0.5 text-xs text-gray-500">
              The operator name is typed into the scanner, not authenticated. Attributable, not
              proven: two people sharing a door token are indistinguishable here.
            </dd>
          </div>
          <div className="px-5 py-3">
            <dt className="text-sm font-medium text-gray-900">Failed scans</dt>
            <dd className="mt-0.5 text-xs text-gray-500">
              A scan that never resolves to a real invitation — an unreadable QR, an unknown or
              revoked credential — is refused before the admission RPC is reached and writes no
              ledger row. An empty ledger therefore does not mean nobody was turned away.
            </dd>
          </div>
          <div className="px-5 py-3">
            <dt className="text-sm font-medium text-gray-900">Scan duration and queue time</dt>
            <dd className="mt-0.5 text-xs text-gray-500">
              The gap between <code className="rounded bg-gray-100 px-1">created_at</code> and{' '}
              <code className="rounded bg-gray-100 px-1">completed_at</code> is server processing
              time, typically 1-45ms. It is not how long a guest stood at the door, and nothing
              records when anyone joined a queue.
            </dd>
          </div>
          <div className="px-5 py-3">
            <dt className="text-sm font-medium text-gray-900">Intent behind a blocked entry</dt>
            <dd className="mt-0.5 text-xs text-gray-500">
              <code className="rounded bg-gray-100 px-1">exhausted</code> covers both a re-scan of a
              spent pass and a request for more seats than remain. The ledger cannot separate them,
              so neither reading may be presented as fact.
            </dd>
          </div>
        </dl>
      </Section>
    </div>
  )
}
