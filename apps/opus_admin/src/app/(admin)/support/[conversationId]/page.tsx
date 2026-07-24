import { notFound, redirect } from 'next/navigation'
import { User, Globe, Clock, MessageSquare } from 'lucide-react'
import { getAdminAccessRole, isAdminDashboardRole, hasPermission } from '@/lib/admin-auth'
import { getConversationDetail, type SupportStatus } from '../queries'
import { replyToConversation, assignToMe, setConversationStatus } from '../actions'
import RichText from '../RichText'
import DetailHeading from './DetailHeading'
import ReplyComposer from './ReplyComposer'

export const dynamic = 'force-dynamic'

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}
function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

const STATUS_STYLE: Record<SupportStatus, string> = {
  bot: 'border-gray-200 bg-gray-50 text-gray-600',
  needs_human: 'border-amber-200 bg-amber-50 text-amber-700',
  assigned: 'border-[#C9A0DC] bg-[#F0DFF6] text-[#7E5896]',
  resolved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
}
const STATUS_LABEL: Record<SupportStatus, string> = {
  bot: 'Opus handling',
  needs_human: 'Needs human',
  assigned: 'Assigned',
  resolved: 'Resolved',
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const role = await getAdminAccessRole()
  if (!isAdminDashboardRole(role)) redirect('/contribute')
  if (!(await hasPermission('support.read'))) redirect('/')

  const { conversationId } = await params
  const convo = await getConversationDetail(conversationId)
  if (!convo) notFound()

  const canWrite = await hasPermission('support.write')
  const subject = convo.subject || 'Support conversation'
  const lastAt = convo.messages.at(-1)?.created_at ?? convo.created_at

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <DetailHeading subject={subject.length > 60 ? `${subject.slice(0, 60)}...` : subject} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Thread + reply */}
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            {/* Thread header */}
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[#1A1A1A]">{subject}</p>
                <p className="text-xs text-gray-400">
                  {convo.messages.length} message{convo.messages.length === 1 ? '' : 's'} · started {fmt(convo.created_at)}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLE[convo.status]}`}
              >
                {STATUS_LABEL[convo.status]}
              </span>
            </div>

            {/* Messages */}
            <div className="space-y-5 px-5 py-5">
              {convo.messages.map((m) => {
                if (m.role === 'system') {
                  return (
                    <div key={m.id} className="flex justify-center">
                      <span className="rounded-full bg-gray-50 px-3 py-1 text-center text-[11px] text-gray-400">
                        {m.content}
                      </span>
                    </div>
                  )
                }
                const isUser = m.role === 'user'
                const isAgent = m.role === 'agent'
                const label = isUser ? 'Customer' : isAgent ? m.agent_name || 'Support' : 'Opus'
                return (
                  <div
                    key={m.id}
                    className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}
                  >
                    {/* Avatar */}
                    {isUser ? (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1A1A1A] text-white">
                        <User className="h-4 w-4" />
                      </span>
                    ) : isAgent ? (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#7E5896] text-[11px] font-bold text-white">
                        {m.agent_name ? initials(m.agent_name) : 'OF'}
                      </span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src="/assets/logo/opusfesta-mark.png"
                        alt="Opus"
                        className="h-8 w-8 shrink-0 object-contain"
                      />
                    )}

                    <div className={`min-w-0 max-w-[82%] ${isUser ? 'items-end text-right' : ''}`}>
                      <div className={`mb-1 flex items-center gap-2 text-[11px] text-gray-400 ${isUser ? 'justify-end' : ''}`}>
                        <span className="font-semibold text-gray-500">{label}</span>
                        <span>{time(m.created_at)}</span>
                      </div>
                      <div
                        className={`inline-block rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed ${
                          isUser
                            ? 'rounded-tr-sm bg-[#1A1A1A] text-white'
                            : isAgent
                              ? 'rounded-tl-sm bg-[#F0DFF6] text-[#3f2b49]'
                              : 'rounded-tl-sm bg-gray-100 text-[#1A1A1A]'
                        }`}
                      >
                        {isUser ? (
                          <span className="whitespace-pre-wrap">{m.content}</span>
                        ) : (
                          <RichText text={m.content} />
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {canWrite && convo.status !== 'resolved' && (
            <ReplyComposer
              action={replyToConversation}
              conversationId={convo.id}
              contactEmail={convo.contact_email}
            />
          )}
          {convo.status === 'resolved' && (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 py-3 text-sm font-medium text-emerald-700">
              This conversation is resolved.
            </div>
          )}
        </div>

        {/* Context + controls */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Details</p>
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[convo.status]}`}>
                {STATUS_LABEL[convo.status]}
              </span>
            </div>

            {convo.topic && (
              <div className="mb-3">
                <span className="inline-flex items-center rounded-full bg-[#9FE870] px-2.5 py-0.5 text-xs font-bold capitalize text-[#1A1A1A]">
                  {convo.topic.replace(/_/g, ' ')}
                </span>
              </div>
            )}
            {convo.escalation_reason && (
              <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                {convo.escalation_reason}
              </p>
            )}

            <dl className="space-y-2.5 text-sm">
              <Row
                icon={<User className="h-3.5 w-3.5" />}
                label="Contact"
                value={convo.contact_name || 'Anonymous visitor'}
              />
              {convo.contact_email && <Row label="Email" value={convo.contact_email} />}
              {convo.contact_phone && <Row label="Phone" value={convo.contact_phone} />}
              {convo.assignee_name && <Row label="Assigned to" value={convo.assignee_name} />}
              {convo.page_url && (
                <Row
                  icon={<Globe className="h-3.5 w-3.5" />}
                  label="From page"
                  value={convo.page_url === '/' ? 'Home' : convo.page_url}
                />
              )}
              {convo.locale && <Row label="Language" value={convo.locale.toUpperCase()} />}
              <Row icon={<Clock className="h-3.5 w-3.5" />} label="Started" value={fmt(convo.created_at)} />
              <Row
                icon={<MessageSquare className="h-3.5 w-3.5" />}
                label="Last activity"
                value={fmt(lastAt)}
              />
            </dl>
          </div>

          {canWrite && (
            <div className="space-y-2 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-400">Actions</p>
              {!convo.assignee_name && (
                <form action={assignToMe}>
                  <input type="hidden" name="conversationId" value={convo.id} />
                  <button
                    type="submit"
                    className="w-full rounded-xl border border-gray-200 py-2 text-sm font-semibold text-gray-700 transition-colors hover:border-[#C9A0DC] hover:bg-[#F0DFF6] hover:text-[#7E5896]"
                  >
                    Assign to me
                  </button>
                </form>
              )}
              {convo.status !== 'resolved' ? (
                <form action={setConversationStatus}>
                  <input type="hidden" name="conversationId" value={convo.id} />
                  <input type="hidden" name="status" value="resolved" />
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                  >
                    Mark resolved
                  </button>
                </form>
              ) : (
                <form action={setConversationStatus}>
                  <input type="hidden" name="conversationId" value={convo.id} />
                  <input type="hidden" name="status" value="assigned" />
                  <button
                    type="submit"
                    className="w-full rounded-xl border border-gray-200 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    Reopen
                  </button>
                </form>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function Row({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="flex shrink-0 items-center gap-1.5 text-gray-400">
        {icon}
        {label}
      </dt>
      <dd className="min-w-0 break-words text-right font-medium text-[#1A1A1A]">{value}</dd>
    </div>
  )
}
