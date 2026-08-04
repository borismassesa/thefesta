'use client'

import { ExternalLink } from 'lucide-react'
import {
  CHANNEL_LABEL,
  LINKED_LABEL,
  PRIORITY_LABEL,
  RESOLUTION_LABEL,
  STATUS_LABEL,
  TEAM_LABEL,
  formatFull,
  slaTargetLabel,
  slaView,
} from './lib'
import { SlaBadge } from './ui'
import type { CaseRecord } from './types'

// Everything operational lives here, one scroll, closed by default. The
// thread stays a conversation; this is where you go when you need to know
// what the conversation is attached to.
export function DetailsPanel({ item }: { item: CaseRecord }) {
  const sla = slaView(item)
  const c = item.context.customer
  const attachments = item.timeline.flatMap((e) => (e.kind === 'event' ? [] : (e.attachments ?? [])))
  const events = item.timeline.filter((e) => e.kind === 'event')

  return (
    <aside className="w-[300px] shrink-0 border-l border-gray-100 bg-white overflow-y-auto hidden xl:block">
      <div className="px-5 py-5 space-y-6">
        <Block title="Conversation">
          <Row label="Reference" value={item.reference} />
          <Row label="Status" value={STATUS_LABEL[item.status]} />
          <Row label="Priority" value={PRIORITY_LABEL[item.priority]} />
          <Row label="Assignee" value={item.assignee ?? 'Unassigned'} />
          <Row label="Team" value={TEAM_LABEL[item.team]} />
          <Row label="Channel" value={CHANNEL_LABEL[item.channel]} />
          <div className="flex items-start gap-3">
            <span className="text-[11.5px] text-gray-400 w-[92px] shrink-0">
              {slaTargetLabel(sla)}
            </span>
            <SlaBadge sla={sla} />
          </div>
          {item.resolution && (
            <Row label="Resolved as" value={RESOLUTION_LABEL[item.resolution.reason]} />
          )}
        </Block>

        <Block title="Customer">
          <Row label="Name" value={c.name} />
          {c.email && <Row label="Email" value={c.email} />}
          {c.phone && <Row label="Phone" value={c.phone} />}
          {c.location && <Row label="Location" value={c.location} />}
          {c.language && <Row label="Language" value={c.language} />}
          {c.lifecycle && <Row label="Status" value={c.lifecycle} />}
          <Row
            label="History"
            value={
              c.previousCases === 0
                ? 'First conversation'
                : `${c.previousCases} earlier ${c.previousCases === 1 ? 'conversation' : 'conversations'}`
            }
          />
        </Block>

        {item.context.record && (
          <Block title={LINKED_LABEL[item.context.record.kind]}>
            <p className="text-[13px] font-bold text-gray-900 pb-1">{item.context.record.title}</p>
            {item.context.record.fields.map((f) => (
              <Row key={f.label} label={f.label} value={f.value} />
            ))}
          </Block>
        )}

        {item.linked.length > 0 && (
          <Block title="Linked records">
            <ul className="space-y-1.5">
              {item.linked.map((l) => (
                <li key={`${l.kind}-${l.id}`}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 rounded-xl border border-gray-100 hover:border-[#C9A0DC] hover:bg-gray-50 transition-colors"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                        {LINKED_LABEL[l.kind]}
                      </span>
                      <ExternalLink className="w-3 h-3 text-gray-300" />
                    </span>
                    <span className="block text-[12.5px] font-semibold text-gray-800 truncate mt-0.5">
                      {l.label}
                    </span>
                    {l.meta && (
                      <span className="block text-[11px] text-gray-400 truncate">{l.meta}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </Block>
        )}

        {attachments.length > 0 && (
          <Block title={`Files (${attachments.length})`}>
            <ul className="space-y-1">
              {attachments.map((a) => (
                <li key={a.id} className="text-[12px] text-gray-600 truncate">
                  {a.name}
                </li>
              ))}
            </ul>
          </Block>
        )}

        {events.length > 0 && (
          <Block title="Activity">
            <ol className="space-y-2.5">
              {events.map((e) => (
                <li key={e.id}>
                  <p className="text-[12px] text-gray-600 leading-snug">{e.detail}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {e.actor} · {formatFull(e.at)}
                  </p>
                </li>
              ))}
            </ol>
          </Block>
        )}
      </div>
    </aside>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">{title}</p>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-[11.5px] text-gray-400 w-[92px] shrink-0 leading-snug">{label}</span>
      <span className="text-[12.5px] font-semibold text-gray-800 leading-snug min-w-0 break-words">
        {value}
      </span>
    </div>
  )
}
