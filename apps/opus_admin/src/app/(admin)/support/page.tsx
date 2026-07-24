import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, MessageSquare, Inbox, ChevronRight } from 'lucide-react'
import { getAdminAccessRole, isAdminDashboardRole, hasPermission } from '@/lib/admin-auth'
import SupportHeading from './SupportHeading'
import { getSupportSummary, listConversations, type SupportFilter, type SupportStatus } from './queries'

export const dynamic = 'force-dynamic'

const FILTER_TABS: { key: SupportFilter; label: string }[] = [
  { key: 'attention', label: 'Needs attention' },
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
]

const STATUS_STYLE: Record<SupportStatus, string> = {
  bot: 'border-gray-200 bg-gray-50 text-gray-600',
  needs_human: 'border-amber-200 bg-amber-50 text-amber-700',
  assigned: 'border-[#C9A0DC] bg-[#F0DFF6] text-[#7E5896]',
  resolved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
}
const STATUS_LABEL: Record<SupportStatus, string> = {
  bot: 'Opus',
  needs_human: 'Needs human',
  assigned: 'Assigned',
  resolved: 'Resolved',
}

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function filterHref(key: SupportFilter, q: string): string {
  const p = new URLSearchParams()
  if (key !== 'attention') p.set('filter', key)
  if (q) p.set('q', q)
  const s = p.toString()
  return s ? `/support?${s}` : '/support'
}

function Kpi({
  label,
  value,
  icon,
  active,
}: {
  label: string
  value: number
  icon: React.ReactNode
  active: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-2xl border bg-white p-4 shadow-sm ${
        active ? 'border-[#C9A0DC] ring-1 ring-[#C9A0DC]' : 'border-gray-100'
      }`}
    >
      <div>
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-[#1A1A1A]">{value}</p>
      </div>
      <span className="text-gray-400">{icon}</span>
    </div>
  )
}

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>
}) {
  const role = await getAdminAccessRole()
  if (!isAdminDashboardRole(role)) redirect('/contribute')
  if (!(await hasPermission('support.read'))) redirect('/')

  const sp = await searchParams
  const filter: SupportFilter = (['attention', 'open', 'resolved', 'all'] as const).includes(
    sp.filter as SupportFilter,
  )
    ? (sp.filter as SupportFilter)
    : 'attention'
  const q = (sp.q ?? '').slice(0, 100)

  const [summary, conversations] = await Promise.all([
    getSupportSummary(),
    listConversations(filter, q),
  ])

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <SupportHeading />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Needs attention" value={summary.attention} icon={<AlertCircle className="h-5 w-5" />} active={filter === 'attention'} />
        <Kpi label="Open" value={summary.open} icon={<MessageSquare className="h-5 w-5" />} active={filter === 'open'} />
        <Kpi
          label="Resolved"
          value={summary.resolved}
          /* eslint-disable-next-line @next/next/no-img-element */
          icon={<img src="/assets/logo/opusfesta-mark.png" alt="" className="h-6 w-6 object-contain" />}
          active={filter === 'resolved'}
        />
        <Kpi label="All" value={summary.all} icon={<Inbox className="h-5 w-5" />} active={filter === 'all'} />
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTER_TABS.map((tab) => (
            <Link
              key={tab.key}
              href={filterHref(tab.key, q)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                filter === tab.key
                  ? 'bg-[#7E5896] text-white'
                  : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        <form method="get" action="/support" className="flex items-center gap-2">
          {filter !== 'attention' && <input type="hidden" name="filter" value={filter} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search subject, name, email..."
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#C9A0DC]"
          />
          <button type="submit" className="rounded-xl bg-[#7E5896] px-4 py-2 text-sm font-semibold text-white">
            Search
          </button>
        </form>
      </div>

      {conversations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-center text-sm text-gray-400">
          No conversations here.
        </div>
      ) : (
        <div className="space-y-3">
          {conversations.map((c) => (
            <Link
              key={c.id}
              href={`/support/${c.id}`}
              className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-colors hover:border-[#C9A0DC] hover:shadow"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {c.awaiting_staff && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />}
                  <p className="truncate text-sm font-semibold text-[#1A1A1A]">
                    {c.subject || 'New conversation'}
                  </p>
                  <span className="shrink-0 text-xs text-gray-400">
                    {c.contact_name || c.contact_email || 'Anonymous'}
                    {c.topic ? ` · ${c.topic.replace(/_/g, ' ')}` : ''}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-gray-500">
                  {c.preview ? (
                    <>
                      <span className="font-medium text-gray-400">
                        {c.preview_role === 'agent'
                          ? 'Support: '
                          : c.preview_role === 'user'
                            ? 'Customer: '
                            : c.preview_role === 'assistant'
                              ? 'Opus: '
                              : ''}
                      </span>
                      {c.preview}
                    </>
                  ) : (
                    c.assignee_name ? `Assigned to ${c.assignee_name}` : 'No messages yet'
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[c.status]}`}>
                  {STATUS_LABEL[c.status]}
                </span>
                <span className="hidden w-16 text-right text-xs text-gray-400 sm:block">{timeAgo(c.last_message_at)}</span>
                <ChevronRight className="h-5 w-5 text-gray-300" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
