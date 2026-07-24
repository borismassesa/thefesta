import { redirect } from 'next/navigation'
import { getAdminAccessRole, isAdminDashboardRole, hasPermission } from '@/lib/admin-auth'
import { getSupportAnalytics } from '../queries'
import SupportAnalyticsHeading from './SupportAnalyticsHeading'

export const dynamic = 'force-dynamic'

function pct(part: number, whole: number): string {
  if (!whole) return '0%'
  return `${Math.round((part / whole) * 100)}%`
}

function Tile({
  label,
  value,
  hint,
  accent,
}: {
  label: string
  value: string
  hint?: string
  accent?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        accent
          ? 'border-transparent bg-gradient-to-br from-[#7E5896] to-[#5f4270] text-white'
          : 'border-gray-100 bg-white'
      }`}
    >
      <p className={`text-xs font-semibold uppercase tracking-wide ${accent ? 'text-white/70' : 'text-gray-500'}`}>
        {label}
      </p>
      <p className={`mt-2 text-3xl font-black ${accent ? 'text-white' : 'text-[#1A1A1A]'}`}>{value}</p>
      {hint && <p className={`mt-1 text-xs ${accent ? 'text-white/70' : 'text-gray-400'}`}>{hint}</p>}
    </div>
  )
}

export default async function SupportAnalyticsPage() {
  const role = await getAdminAccessRole()
  if (!isAdminDashboardRole(role)) redirect('/contribute')
  if (!(await hasPermission('support.read'))) redirect('/')

  const a = await getSupportAnalytics()
  const csatTotal = a.thumbsUp + a.thumbsDown

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
      <SupportAnalyticsHeading />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Conversations" value={String(a.total)} hint={`${a.last7} in the last 7 days`} accent />
        <Tile
          label="Deflection rate"
          value={pct(a.botOnly, a.total)}
          hint={`${a.botOnly} handled by Opus alone`}
        />
        <Tile
          label="Escalation rate"
          value={pct(a.escalated, a.total)}
          hint={`${a.escalated} reached a human`}
        />
        <Tile
          label="Satisfaction"
          value={csatTotal ? pct(a.thumbsUp, csatTotal) : 'n/a'}
          hint={`${a.thumbsUp} up / ${a.thumbsDown} down`}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Tile label="Messages" value={String(a.totalMessages)} />
        <Tile label="Resolved" value={String(a.resolved)} />
        <Tile
          label="Avg messages / conversation"
          value={a.total ? (a.totalMessages / a.total).toFixed(1) : '0'}
        />
      </div>

      <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-5">
        <p className="text-sm font-bold text-[#1A1A1A]">Top escalation topics</p>
        {a.topTopics.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">No escalations yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {a.topTopics.map((t) => {
              const max = a.topTopics[0]?.count || 1
              return (
                <li key={t.topic} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-sm font-medium capitalize text-gray-700">
                    {t.topic.replace(/_/g, ' ')}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <span
                      className="block h-full rounded-full bg-[#9FE870]"
                      style={{ width: `${Math.max(6, (t.count / max) * 100)}%` }}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right text-sm font-semibold text-gray-500">
                    {t.count}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
