'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Info, Lock, MessageSquare, Paperclip, Send, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AttachmentGallery, StagedChip } from './attachments'
import {
  ACCEPT_ATTR,
  CHANNEL_LABEL,
  MAX_UPLOAD_BYTES,
  ME,
  RESOLUTION_LABEL,
  STATUS_LABEL,
  formatClock,
  kindFromFile,
} from './lib'
import { MenuButton } from './ui'
import type {
  CaseAttachment,
  CasePriority,
  CaseRecord,
  CaseStatus,
  ResolutionReason,
  TimelineEntry,
} from './types'

type StagedAttachment = CaseAttachment & { file: File }

export type ComposerMode = 'reply' | 'note'

const ASSIGNEES = [ME, 'David O.', 'Grace M.', 'Amina R.']

export function ChatThread({
  item,
  detailsOpen,
  onToggleDetails,
  onAssign,
  onStatus,
  onPriority,
  onResolve,
  onSend,
}: {
  item: CaseRecord
  detailsOpen: boolean
  onToggleDetails: () => void
  onAssign: (who: string | null) => void
  onStatus: (status: CaseStatus) => void
  onPriority: (priority: CasePriority) => void
  onResolve: (reason: ResolutionReason) => void
  onSend: (args: { mode: ComposerMode; body: string; attachments: CaseAttachment[] }) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const entryCount = item.timeline.length

  // A chat opens at the newest message, and posting one puts it in front of
  // you. Anything else feels broken in a thread.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [entryCount])

  const groups = useMemo(() => groupByDay(item.timeline), [item.timeline])

  return (
    <section className="flex-1 min-w-0 flex flex-col bg-white">
      <header className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
          style={{ background: item.requester.avatarColor, color: '#5A5A5A' }}
        >
          {item.requester.initials}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-bold text-gray-900 truncate">{item.requester.name}</p>
          <p className="text-[11.5px] text-gray-400 truncate">
            {item.subject}
            <span className="mx-1.5 text-gray-300">·</span>
            {STATUS_LABEL[item.status]}
            {item.assignee && (
              <>
                <span className="mx-1.5 text-gray-300">·</span>
                {item.assignee === ME ? 'You' : item.assignee}
              </>
            )}
          </p>
        </div>

        <MenuButton
          label="Manage"
          options={[
            { key: 'assign:' + ME, label: 'Assign to me' },
            ...ASSIGNEES.filter((a) => a !== ME).map((a) => ({
              key: 'assign:' + a,
              label: `Assign to ${a}`,
            })),
            { key: 'status:waiting_on_customer', label: 'Mark waiting on customer' },
            { key: 'priority:urgent', label: 'Set priority to urgent' },
            { key: 'resolve:inquiry_answered', label: 'Resolve conversation' },
          ]}
          onSelect={(k) => {
            const [kind, value] = k.split(':')
            if (kind === 'assign') onAssign(value)
            else if (kind === 'status') onStatus(value as CaseStatus)
            else if (kind === 'priority') onPriority(value as CasePriority)
            else if (kind === 'resolve') onResolve(value as ResolutionReason)
          }}
          align="right"
        />

        <button
          type="button"
          onClick={onToggleDetails}
          title={detailsOpen ? 'Hide details' : 'Show details'}
          aria-label={detailsOpen ? 'Hide details' : 'Show details'}
          className={cn(
            'w-8 h-8 flex items-center justify-center rounded-full transition-colors shrink-0',
            detailsOpen
              ? 'bg-[#F0DFF6] text-[#7E5896]'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50',
          )}
        >
          <Info className="w-4 h-4" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar px-6 flex flex-col">
        {/* Centred and capped. On a wide screen an uncapped thread leaves the
            conversation hugging one edge with a void beside it. `mt-auto`
            settles a short thread against the composer the way a chat does,
            rather than stranding three messages at the top of a tall pane. */}
        <div className="mx-auto w-full max-w-[860px] pb-6 mt-auto">
          {groups.map((group) => (
            <div key={group.day}>
              <div className="sticky top-0 z-10 flex items-center justify-center py-3 bg-white/85 backdrop-blur-sm">
                <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                  {group.day}
                </span>
              </div>
              <div>
                {group.entries.map((entry, i) => (
                  <Bubble
                    key={entry.id}
                    entry={entry}
                    // A run is consecutive messages from the same person. Only
                    // the first carries an avatar and a name, only the last
                    // carries a timestamp, so a burst of three reads as one
                    // person talking rather than three separate cards.
                    startsRun={startsRun(group.entries[i - 1], entry)}
                    endsRun={startsRun(entry, group.entries[i + 1])}
                  />
                ))}
              </div>
            </div>
          ))}

          {item.resolution && (
            <div className="flex items-center justify-center mt-5">
              <span className="text-[11.5px] font-semibold text-[#356B14] bg-[#EDFBDD] px-3 py-1 rounded-full">
                Resolved as {RESOLUTION_LABEL[item.resolution.reason].toLowerCase()} by{' '}
                {item.resolution.by}
              </span>
            </div>
          )}
        </div>
      </div>

      <Composer item={item} onSend={onSend} />
    </section>
  )
}

/* ------------------------------------------------------------ bubbles ---- */

function groupByDay(entries: TimelineEntry[]) {
  const out: Array<{ day: string; entries: TimelineEntry[] }> = []
  for (const entry of entries) {
    const day = dayLabel(entry.at)
    const last = out[out.length - 1]
    if (last && last.day === day) last.entries.push(entry)
    else out.push({ day, entries: [entry] })
  }
  return out
}

function dayLabel(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today.getTime() - 86_400_000)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(date, today)) return 'Today'
  if (same(date, yesterday)) return 'Yesterday'
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

// True when `entry` begins a new run: a different author, a different kind,
// or anything at all after a system event.
function startsRun(previous: TimelineEntry | undefined, entry: TimelineEntry | undefined): boolean {
  if (!entry || entry.kind === 'event') return true
  if (!previous || previous.kind === 'event') return true
  return previous.kind !== entry.kind || previous.from.name !== entry.from.name
}

function Bubble({
  entry,
  startsRun: first,
  endsRun: last,
}: {
  entry: TimelineEntry
  startsRun: boolean
  endsRun: boolean
}) {
  // Workflow events are one quiet centred line. They are context, not
  // conversation, and they should never compete with what a person wrote.
  if (entry.kind === 'event') {
    return (
      <p className="text-[11.5px] text-gray-400 text-center py-2.5">
        {entry.detail}
        <span className="mx-1.5 text-gray-300">·</span>
        <span className="tabular-nums">{formatClock(entry.at)}</span>
      </p>
    )
  }

  const isNote = entry.kind === 'note'
  const mine = isNote || (entry.kind === 'message' && entry.direction === 'outbound')

  return (
    <div
      className={cn(
        'flex gap-2.5',
        mine ? 'justify-end' : 'justify-start',
        first ? 'mt-4 first:mt-0' : 'mt-0.5',
      )}
    >
      {!mine &&
        (first ? (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
            style={{ background: entry.from.avatarColor, color: '#5A5A5A' }}
          >
            {entry.from.initials}
          </div>
        ) : (
          // Keeps the run left-aligned under its avatar instead of stepping
          // back to the wall.
          <div className="w-8 shrink-0" aria-hidden />
        ))}

      {/* Capped as well as proportional: a wide screen should not turn a
          message into a 1200px line of text. */}
      <div className="max-w-[min(72%,600px)] min-w-0">
        {!mine && first && (
          <p className="text-[11.5px] font-semibold text-gray-500 mb-1 ml-1">{entry.from.name}</p>
        )}
        {isNote && first && (
          <p className="text-[11px] font-bold text-[#8A5A09] mb-1 mr-1 text-right flex items-center justify-end gap-1">
            <Lock className="w-3 h-3" />
            Internal note, not sent to {entry.from.name === ME ? 'the customer' : 'them'}
          </p>
        )}

        <div
          className={cn(
            'px-4 py-2.5 rounded-2xl',
            // The square-ish corner marks where the run ends, so a burst of
            // messages reads as one block with one tail.
            last && (mine ? 'rounded-br-md' : 'rounded-bl-md'),
            isNote
              ? 'bg-[#FFF8E4] border border-[#F5E0A3]'
              : mine
                ? 'bg-[#F0DFF6]'
                : 'bg-white border border-gray-200 shadow-[0_1px_2px_rgba(16,24,40,0.04)]',
          )}
        >
          {entry.body && (
            <p
              className={cn(
                'text-[13.5px] leading-relaxed whitespace-pre-wrap',
                isNote ? 'text-[#6B4708]' : mine ? 'text-[#4B3358]' : 'text-gray-700',
              )}
            >
              {entry.body}
            </p>
          )}
          {entry.attachments && entry.attachments.length > 0 && (
            <AttachmentGallery attachments={entry.attachments} />
          )}
        </div>

        {last && (
          <p
            className={cn(
              'text-[10.5px] text-gray-400 tabular-nums mt-1',
              mine ? 'text-right mr-1' : 'ml-1',
            )}
          >
            {formatClock(entry.at)}
          </p>
        )}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- composer ---- */

function Composer({
  item,
  onSend,
}: {
  item: CaseRecord
  onSend: (args: { mode: ComposerMode; body: string; attachments: CaseAttachment[] }) => void
}) {
  const [mode, setMode] = useState<ComposerMode>('reply')
  const [body, setBody] = useState('')
  const [staged, setStaged] = useState<StagedAttachment[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      for (const a of staged) {
        if (a.url?.startsWith('blob:')) URL.revokeObjectURL(a.url)
        if (a.thumbUrl?.startsWith('blob:')) URL.revokeObjectURL(a.thumbUrl)
      }
    }
  }, [staged])

  const onPickFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const next: StagedAttachment[] = []
    const errors: string[] = []
    for (const file of Array.from(files)) {
      if (file.size > MAX_UPLOAD_BYTES) {
        errors.push(`${file.name} is over 25 MB`)
        continue
      }
      const kind = kindFromFile(file)
      const url = URL.createObjectURL(file)
      next.push({
        id: `stg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        kind,
        mime: file.type || undefined,
        size: file.size,
        url,
        thumbUrl: kind === 'image' ? url : undefined,
        file,
      })
    }
    if (next.length > 0) setStaged((prev) => [...prev, ...next])
    setUploadError(errors.length > 0 ? errors.join(' · ') : null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeStaged = (id: string) => {
    setStaged((prev) => {
      const dropping = prev.find((a) => a.id === id)
      if (dropping?.url?.startsWith('blob:')) URL.revokeObjectURL(dropping.url)
      return prev.filter((a) => a.id !== id)
    })
  }

  const canSend = body.trim().length > 0 || staged.length > 0
  const isNote = mode === 'note'

  const fire = () => {
    if (!canSend) return
    onSend({
      mode,
      body: body.trim(),
      attachments: staged.map((a) => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        mime: a.mime,
        size: a.size,
        url: a.url,
        thumbUrl: a.thumbUrl,
      })),
    })
    setBody('')
    setStaged([])
    setUploadError(null)
  }

  return (
    <footer className="px-6 pb-5 pt-2 border-t border-gray-100">
      {/* Same centred column as the thread, so the composer lines up with the
          messages instead of floating off to one side. */}
      <div className="mx-auto w-full max-w-[860px]">
      {/* Reply and internal note stay a visible mode switch. It is the one bit
          of ceremony worth keeping: sending an internal note to a customer is
          the expensive mistake on this screen. */}
      <div className="flex items-center gap-1.5 mb-2">
        <button
          type="button"
          onClick={() => setMode('reply')}
          aria-pressed={!isNote}
          className={cn(
            'inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full transition-colors',
            !isNote ? 'bg-[#F0DFF6] text-[#7E5896]' : 'text-gray-500 hover:bg-gray-50',
          )}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Reply
        </button>
        <button
          type="button"
          onClick={() => setMode('note')}
          aria-pressed={isNote}
          className={cn(
            'inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full transition-colors',
            isNote ? 'bg-[#FEF3DB] text-[#8A5A09]' : 'text-gray-500 hover:bg-gray-50',
          )}
        >
          <Lock className="w-3.5 h-3.5" />
          Internal note
        </button>
        <span className="text-[11px] text-gray-400 ml-1 truncate">
          {isNote
            ? 'Only the team sees this'
            : `Goes to ${item.requester.name} via ${CHANNEL_LABEL[item.channel]}`}
        </span>
      </div>

      <div
        className={cn(
          'rounded-2xl border transition',
          isNote
            ? 'bg-[#FFFDF5] border-[#F5E0A3] focus-within:ring-2 focus-within:ring-[#FEF3DB]'
            : 'bg-white border-gray-200 focus-within:border-[#C9A0DC] focus-within:ring-2 focus-within:ring-[#F0DFF6]',
        )}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDrop={(e) => {
          e.preventDefault()
          onPickFiles(e.dataTransfer.files)
        }}
      >
        <div className="flex items-end gap-1 px-2 py-1.5">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            onChange={(e) => onPickFiles(e.target.files)}
            className="sr-only"
            id={`inbox-upload-${item.id}`}
          />
          <label
            htmlFor={`inbox-upload-${item.id}`}
            title="Attach files, max 25 MB each"
            className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-[#7E5896] hover:bg-gray-50 cursor-pointer transition-colors shrink-0"
          >
            <Paperclip className="w-4 h-4" />
          </label>

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                fire()
              }
            }}
            rows={1}
            placeholder={
              isNote ? 'Write a note for the team' : `Message ${item.requester.name}`
            }
            className="flex-1 resize-none bg-transparent px-1 py-2 text-[13.5px] max-h-40 placeholder:text-gray-400 focus:outline-none"
          />

          <button
            type="button"
            disabled={!canSend}
            onClick={fire}
            title={isNote ? 'Post note' : 'Send'}
            aria-label={isNote ? 'Post note' : 'Send'}
            className={cn(
              'w-9 h-9 flex items-center justify-center rounded-full transition-colors shrink-0',
              !canSend
                ? 'text-gray-300 cursor-not-allowed'
                : isNote
                  ? 'bg-[#8A5A09] text-white hover:bg-[#75490a]'
                  : 'bg-[#C9A0DC] text-white hover:bg-[#b97fd0]',
            )}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        {staged.length > 0 && (
          <div className="px-3 pb-2 flex flex-wrap gap-2">
            {staged.map((a) => (
              <StagedChip key={a.id} attachment={a} onRemove={() => removeStaged(a.id)} />
            ))}
          </div>
        )}

        {uploadError && (
          <div className="px-4 pb-2 flex items-center gap-1.5 text-[11px] text-[#921E1E] font-semibold">
            <X className="w-3 h-3" />
            {uploadError}
          </div>
        )}
        </div>
      </div>
    </footer>
  )
}

export function EmptyThread() {
  return (
    <section className="flex-1 min-w-0 flex flex-col items-center justify-center text-center px-6 bg-white">
      <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
        <MessageSquare className="w-5 h-5 text-gray-300" />
      </div>
      <p className="text-[13.5px] font-semibold text-gray-700">No conversation selected</p>
      <p className="text-[12px] text-gray-400 mt-1">Pick one from the list to start reading.</p>
    </section>
  )
}
