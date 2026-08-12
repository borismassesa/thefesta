import { requirePermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import AuditFilters from './AuditFilters'
import AuditPageHeading from './AuditPageHeading'

export const dynamic = 'force-dynamic'

const RANGE_TO_MS: Record<string, number | null> = {
  '72h': 3 * 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
  all: null,
}

const VALID_SEVERITIES = new Set(['info', 'warn', 'error', 'critical'])

// Audit log viewer. Reads the most recent ~200 events from audit_log
// and renders them as a simple paginated table. Anyone with
// insights.read can see this page; the audit_log table itself is RLS-
// gated to workforce readers (owner/admin/editor/viewer).
//
// Phase 2 scope is intentionally minimal: no filter UI, no pagination
// controls — the page is here so the Technology lane has a real link
// to send people to. Filters/search land alongside Phase 3.

type AuditRow = {
  id: string
  event_type: string
  severity: 'info' | 'warn' | 'error' | 'critical'
  message: string
  actor_email: string | null
  target_resource: string | null
  created_at: string
}

const SEVERITY_TONE: Record<AuditRow['severity'], string> = {
  info: 'bg-gray-100 text-gray-700',
  warn: 'bg-amber-50 text-amber-700',
  error: 'bg-rose-50 text-rose-700',
  critical: 'bg-rose-100 text-rose-800',
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string; range?: string }>
}) {
  await requirePermission('insights.read')
  const params = await searchParams
  const severity = params.severity && VALID_SEVERITIES.has(params.severity) ? params.severity : null
  const range = params.range && params.range in RANGE_TO_MS ? params.range : '7d'
  const rangeMs = RANGE_TO_MS[range]
  const since = rangeMs ? new Date(Date.now() - rangeMs).toISOString() : null

  const supabase = createSupabaseAdminClient()
  let query = supabase
    .from('audit_log')
    .select('id, event_type, severity, message, actor_email, target_resource, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (severity) query = query.eq('severity', severity)
  if (since) query = query.gte('created_at', since)
  const { data, error } = await query
  if (error) throw error
  const rows = (data ?? []) as AuditRow[]

  const subtitleParts = [`${rows.length} events`]
  if (severity) subtitleParts.push(`severity: ${severity}`)
  subtitleParts.push(range === 'all' ? 'all time' : `last ${range}`)

  return (
    <div className="pb-12">
      <AuditPageHeading
        title="Audit log"
        subtitle={`${subtitleParts.join(' · ')}. Append-only — events cannot be edited.`}
      />
      <div className="mx-auto max-w-[1200px] px-8 pt-8">
        <AuditFilters />
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          {rows.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-gray-500">
              No audit events recorded yet. Events appear here as permissions are
              denied, invitations expire, or admins change platform state.
            </p>
          ) : (
            <table className="opus-table w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-3">When</th>
                  <th className="px-5 py-3">Severity</th>
                  <th className="px-5 py-3">Event</th>
                  <th className="px-5 py-3">Actor</th>
                  <th className="px-5 py-3">Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-5 py-3 text-xs tabular-nums text-gray-500">
                      {formatTimestamp(row.created_at)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${SEVERITY_TONE[row.severity]}`}
                      >
                        {row.severity}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{row.message}</p>
                      <p className="text-[11px] text-gray-500">{row.event_type}</p>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-600">
                      {row.actor_email ?? <span className="text-gray-400">system</span>}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-600">
                      {row.target_resource ?? <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
