'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  Check,
  CheckCheck,
  CornerUpRight,
  Download,
  FileArchive,
  FileAudio,
  FileSpreadsheet,
  FileText,
  FileVideo,
  File as FileIcon,
  Filter,
  Inbox,
  Lock,
  MailOpen,
  MoreHorizontal,
  Paperclip,
  Presentation,
  Search,
  Send,
  Sparkles,
  Star,
  User2,
  UserCircle2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePublishInboxUnread } from '@/components/InboxUnread'
import { SOURCE_META } from './data'
import type {
  InboxAttachment,
  InboxAttachmentKind,
  InboxItem,
  InboxPriority,
  InboxSource,
  InboxStatus,
} from './types'

type FolderKey = 'all' | 'unread' | 'starred' | 'mine' | 'archived'

const FOLDERS: Array<{ key: FolderKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'starred', label: 'Starred' },
  { key: 'mine', label: 'Assigned to me' },
  { key: 'archived', label: 'Archived' },
]

const SOURCE_KEYS: InboxSource[] = [
  'booking_inquiry',
  'vendor_application',
  'review_flag',
  'client_support',
  'vendor_support',
  'payout_dispute',
  'refund_request',
  'system_alert',
]

const ME = 'Neema K.'

const STATUS_LABEL: Record<InboxStatus, string> = {
  new: 'New',
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  archived: 'Archived',
}

const PRIORITY_STYLES: Record<InboxPriority, { label: string; dot: string; text: string }> = {
  urgent: { label: 'Urgent', dot: 'bg-[#E15656]', text: 'text-[#921E1E]' },
  high: { label: 'High', dot: 'bg-[#F5A623]', text: 'text-[#8A5A09]' },
  normal: { label: 'Normal', dot: 'bg-gray-300', text: 'text-gray-500' },
  low: { label: 'Low', dot: 'bg-gray-200', text: 'text-gray-400' },
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.max(1, Math.round(diff / 60_000))
  if (mins < 60) return `${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatFull(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function kindFromFile(file: File): InboxAttachmentKind {
  const mime = file.type || ''
  const name = file.name.toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (name.match(/\.(xlsx|xls|csv|numbers|tsv)$/)) return 'sheet'
  if (name.match(/\.(pptx|ppt|key)$/)) return 'slide'
  if (name.match(/\.(docx|doc|rtf|pages|txt|md)$/)) return 'doc'
  if (name.match(/\.(zip|rar|7z|tar|gz)$/)) return 'archive'
  return 'other'
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024 // 25 MB per file
const ACCEPT_ATTR =
  'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.key,.pages,.numbers,.rtf,.txt,.md,.zip,.rar,.7z,.tar,.gz'

function attachmentIcon(kind: InboxAttachmentKind) {
  switch (kind) {
    case 'pdf':
      return { Icon: FileText, color: '#E15656', tint: '#FCDDDD' }
    case 'sheet':
      return { Icon: FileSpreadsheet, color: '#1F8A4C', tint: '#DCF3E4' }
    case 'slide':
      return { Icon: Presentation, color: '#E97B2A', tint: '#FCE6D4' }
    case 'doc':
      return { Icon: FileText, color: '#4A90E2', tint: '#E1ECF9' }
    case 'audio':
      return { Icon: FileAudio, color: '#7E5896', tint: '#F0DFF6' }
    case 'video':
      return { Icon: FileVideo, color: '#7E5896', tint: '#F0DFF6' }
    case 'archive':
      return { Icon: FileArchive, color: '#7A7A7A', tint: '#EFEFEF' }
    case 'image':
      return { Icon: FileIcon, color: '#7A7A7A', tint: '#EFEFEF' }
    default:
      return { Icon: FileIcon, color: '#7A7A7A', tint: '#EFEFEF' }
  }
}

type StagedAttachment = InboxAttachment & { file: File }

export function InboxClient({ initial }: { initial: InboxItem[] }) {
  const [items, setItems] = useState<InboxItem[]>(initial)
  const [folder, setFolder] = useState<FolderKey>('all')
  const [sources, setSources] = useState<Set<InboxSource>>(new Set())
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null)

  const counts = useMemo(() => {
    const byFolder: Record<FolderKey, number> = {
      all: 0, unread: 0, starred: 0, mine: 0, archived: 0,
    }
    for (const it of items) {
      if (it.status !== 'archived') byFolder.all += 1
      if (it.unread && it.status !== 'archived') byFolder.unread += 1
      if (it.starred && it.status !== 'archived') byFolder.starred += 1
      if (it.assignee === ME && it.status !== 'archived') byFolder.mine += 1
      if (it.status === 'archived') byFolder.archived += 1
    }
    const bySource: Record<string, number> = {}
    for (const key of SOURCE_KEYS) bySource[key] = 0
    for (const it of items) if (it.status !== 'archived') bySource[it.source] += 1
    return { byFolder, bySource }
  }, [items])

  // Keep the header's Messages badge honest: this page owns read/archive
  // state, so it is the only thing that knows the count once anyone opens a
  // thread. Publishes the same number the "Unread" folder shows.
  usePublishInboxUnread(counts.byFolder.unread)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items
      .filter((it) => {
        if (folder === 'archived') return it.status === 'archived'
        if (it.status === 'archived') return false
        if (folder === 'unread' && !it.unread) return false
        if (folder === 'starred' && !it.starred) return false
        if (folder === 'mine' && it.assignee !== ME) return false
        if (sources.size > 0 && !sources.has(it.source)) return false
        if (q) {
          const hay = `${it.subject} ${it.preview} ${it.sender.name} ${it.tags.join(' ')}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => +new Date(b.receivedAt) - +new Date(a.receivedAt))
  }, [items, folder, sources, query])

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? filtered[0] ?? null,
    [items, selectedId, filtered],
  )

  const toggleSource = (key: InboxSource) => {
    setSources((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const patch = (id: string, p: Partial<InboxItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)))

  const openItem = (id: string) => {
    setSelectedId(id)
    patch(id, { unread: false })
  }

  const toggleStar = (id: string) => {
    const it = items.find((x) => x.id === id)
    if (!it) return
    patch(id, { starred: !it.starred })
  }

  const archive = (id: string) => patch(id, { status: 'archived', unread: false })
  const unarchive = (id: string) => patch(id, { status: 'open' })
  const resolve = (id: string) => patch(id, { status: 'resolved', unread: false })
  const assignToMe = (id: string) => patch(id, { assignee: ME, status: 'in_progress' })
  const markAllRead = () =>
    setItems((prev) => prev.map((it) => (it.status === 'archived' ? it : { ...it, unread: false })))

  return (
    <div className="h-full flex overflow-hidden bg-[#FDFDFD]">
      {/* LEFT RAIL — folders + sources */}
      <aside className="w-60 shrink-0 border-r border-gray-100 bg-white overflow-y-auto">
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-gray-900">Inbox</h2>
            <button
              type="button"
              onClick={markAllRead}
              title="Mark all as read"
              className="text-gray-400 hover:text-[#7E5896] transition-colors"
            >
              <CheckCheck className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">Unified admin communications</p>
        </div>

        <nav className="px-3 space-y-0.5">
          {FOLDERS.map((f) => {
            const active = folder === f.key
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFolder(f.key)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold transition-colors',
                  active
                    ? 'bg-[#F0DFF6] text-[#7E5896]'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
                )}
              >
                <span className="flex items-center gap-2.5">
                  {f.key === 'all' && <Inbox className="w-4 h-4 stroke-[1.5]" />}
                  {f.key === 'unread' && <MailOpen className="w-4 h-4 stroke-[1.5]" />}
                  {f.key === 'starred' && <Star className="w-4 h-4 stroke-[1.5]" />}
                  {f.key === 'mine' && <UserCircle2 className="w-4 h-4 stroke-[1.5]" />}
                  {f.key === 'archived' && <Archive className="w-4 h-4 stroke-[1.5]" />}
                  {f.label}
                </span>
                <span
                  className={cn(
                    'text-[11px] font-bold tabular-nums px-1.5 rounded min-w-[22px] text-center',
                    active ? 'bg-white text-[#7E5896]' : 'text-gray-400',
                  )}
                >
                  {counts.byFolder[f.key]}
                </span>
              </button>
            )
          })}
        </nav>

        <div className="mt-6 px-5">
          <div className="flex items-center gap-2 mb-2">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
              Sources
            </p>
          </div>
        </div>

        <div className="px-3 pb-6 space-y-0.5">
          {SOURCE_KEYS.map((key) => {
            const meta = SOURCE_META[key]
            const active = sources.has(key)
            const count = counts.bySource[key] ?? 0
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleSource(key)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors',
                  active
                    ? 'bg-gray-50 text-gray-900'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
                )}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: meta.accent }}
                  />
                  <span className="truncate">{meta.label}</span>
                </span>
                <span className="text-[11px] font-semibold tabular-nums text-gray-400">
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </aside>

      {/* MIDDLE — list */}
      <section className="w-[380px] shrink-0 border-r border-gray-100 flex flex-col bg-white">
        <div className="px-5 pt-6 pb-3">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-gray-400 absolute left-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sender, subject, tag…"
              className="pl-9 pr-3 py-2 bg-gray-50 border border-gray-100 rounded-lg w-full text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex items-center justify-between px-5 pb-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
            {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto border-t border-gray-100">
          {filtered.length === 0 ? (
            <div className="py-16 px-6 text-center">
              <Sparkles className="w-6 h-6 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500 font-semibold">Nothing here</p>
              <p className="text-xs text-gray-400 mt-1">
                Try a different filter or clear your search.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((it) => {
                const meta = SOURCE_META[it.source]
                const active = selected?.id === it.id
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => openItem(it.id)}
                      className={cn(
                        'w-full text-left px-5 py-3.5 flex gap-3 transition-colors relative',
                        active ? 'bg-[#F7EEFB]' : 'hover:bg-gray-50',
                      )}
                    >
                      {it.unread && (
                        <span
                          className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
                          style={{ background: meta.accent }}
                        />
                      )}
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
                        style={{ background: it.sender.avatarColor, color: meta.text }}
                      >
                        {it.sender.initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={cn(
                              'text-sm truncate',
                              it.unread ? 'font-bold text-gray-900' : 'font-semibold text-gray-700',
                            )}
                          >
                            {it.sender.name}
                          </p>
                          <span className="text-[11px] text-gray-400 tabular-nums shrink-0">
                            {formatRelative(it.receivedAt)}
                          </span>
                        </div>
                        <p
                          className={cn(
                            'text-[13px] truncate mt-0.5',
                            it.unread ? 'text-gray-900 font-semibold' : 'text-gray-600',
                          )}
                        >
                          {it.subject}
                        </p>
                        <p className="text-[12px] text-gray-400 truncate mt-0.5">{it.preview}</p>
                        <div className="flex items-center gap-1.5 mt-2">
                          <span
                            className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                            style={{ background: meta.tint, color: meta.text }}
                          >
                            {meta.label}
                          </span>
                          {it.priority === 'urgent' || it.priority === 'high' ? (
                            <span
                              className={cn(
                                'flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide',
                                PRIORITY_STYLES[it.priority].text,
                              )}
                            >
                              <span
                                className={cn(
                                  'w-1.5 h-1.5 rounded-full',
                                  PRIORITY_STYLES[it.priority].dot,
                                )}
                              />
                              {PRIORITY_STYLES[it.priority].label}
                            </span>
                          ) : null}
                          {(() => {
                            const count = it.thread.reduce(
                              (n, msg) => n + (msg.attachments?.length ?? 0),
                              0,
                            )
                            return count > 0 ? (
                              <span className="flex items-center gap-0.5 text-[10px] font-semibold text-gray-400 tabular-nums">
                                <Paperclip className="w-3 h-3" />
                                {count}
                              </span>
                            ) : null
                          })()}
                          {it.starred && (
                            <Star className="w-3 h-3 fill-[#F5A623] text-[#F5A623] ml-auto shrink-0" />
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      {/* RIGHT — detail */}
      <section className="flex-1 min-w-0 flex flex-col bg-gray-50/40">
        {selected ? (
          <DetailPane
            key={selected.id}
            item={selected}
            onStar={() => toggleStar(selected.id)}
            onArchive={() =>
              selected.status === 'archived' ? unarchive(selected.id) : archive(selected.id)
            }
            onResolve={() => resolve(selected.id)}
            onAssignMe={() => assignToMe(selected.id)}
          />
        ) : (
          <EmptyDetail />
        )}
      </section>
    </div>
  )
}

function EmptyDetail() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
      <div className="w-14 h-14 rounded-2xl bg-white border border-gray-100 flex items-center justify-center mb-4 shadow-sm">
        <Inbox className="w-6 h-6 text-gray-300" />
      </div>
      <p className="text-sm font-semibold text-gray-700">Select a conversation</p>
      <p className="text-xs text-gray-400 mt-1 max-w-xs">
        Pick an item from the list to view the thread and take action.
      </p>
    </div>
  )
}

function DetailPane({
  item,
  onStar,
  onArchive,
  onResolve,
  onAssignMe,
}: {
  item: InboxItem
  onStar: () => void
  onArchive: () => void
  onResolve: () => void
  onAssignMe: () => void
}) {
  const meta = SOURCE_META[item.source]
  const [reply, setReply] = useState('')
  const [internal, setInternal] = useState(false)
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

  const canSend = reply.trim().length > 0 || staged.length > 0

  return (
    <>
      <header className="px-8 pt-8 pb-4 bg-white border-b border-gray-100">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span
                className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                style={{ background: meta.tint, color: meta.text }}
              >
                {meta.label}
              </span>
              <StatusPill status={item.status} />
              <span
                className={cn(
                  'flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide',
                  PRIORITY_STYLES[item.priority].text,
                )}
              >
                <span
                  className={cn('w-1.5 h-1.5 rounded-full', PRIORITY_STYLES[item.priority].dot)}
                />
                {PRIORITY_STYLES[item.priority].label} priority
              </span>
              {item.tags.map((t) => (
                <span
                  key={t}
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-100"
                >
                  #{t}
                </span>
              ))}
            </div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900 truncate">
              {item.subject}
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              {item.sender.name}
              {item.sender.handle && <span className="text-gray-300"> · </span>}
              {item.sender.handle}
              {item.related && (
                <>
                  <span className="text-gray-300"> · </span>
                  <span className="inline-flex items-center gap-1 text-[#7E5896] font-semibold">
                    <CornerUpRight className="w-3 h-3" />
                    {item.related.label}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <IconBtn label="Star" onClick={onStar} active={item.starred}>
              <Star
                className={cn('w-4 h-4', item.starred && 'fill-[#F5A623] text-[#F5A623]')}
              />
            </IconBtn>
            <IconBtn label="Mark resolved" onClick={onResolve}>
              <Check className="w-4 h-4" />
            </IconBtn>
            <IconBtn
              label={item.status === 'archived' ? 'Restore' : 'Archive'}
              onClick={onArchive}
            >
              {item.status === 'archived' ? (
                <ArchiveRestore className="w-4 h-4" />
              ) : (
                <Archive className="w-4 h-4" />
              )}
            </IconBtn>
            <IconBtn label="More">
              <MoreHorizontal className="w-4 h-4" />
            </IconBtn>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <User2 className="w-3.5 h-3.5 text-gray-400" />
            {item.assignee ? (
              <span className="font-semibold text-gray-700">{item.assignee}</span>
            ) : (
              <button
                type="button"
                onClick={onAssignMe}
                className="font-semibold text-[#7E5896] hover:underline"
              >
                Assign to me
              </button>
            )}
          </div>
          <span className="text-gray-300">·</span>
          <span>Received {formatFull(item.receivedAt)}</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
        {item.thread.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
      </div>

      <footer className="px-8 py-4 bg-white border-t border-gray-100">
        <div
          className="rounded-2xl border border-gray-100 bg-white focus-within:border-[#C9A0DC] focus-within:ring-2 focus-within:ring-[#F0DFF6] transition"
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={(e) => {
            e.preventDefault()
            onPickFiles(e.dataTransfer.files)
          }}
        >
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            placeholder={
              internal
                ? 'Write an internal note — only the team sees this. Drop files to attach.'
                : 'Write a reply… Drop files to attach.'
            }
            className="w-full resize-none bg-transparent px-4 py-3 text-sm placeholder:text-gray-400 focus:outline-none"
          />

          {staged.length > 0 && (
            <div className="px-3 pb-3 pt-1 flex flex-wrap gap-2 border-t border-gray-50">
              {staged.map((a) => (
                <StagedChip key={a.id} attachment={a} onRemove={() => removeStaged(a.id)} />
              ))}
            </div>
          )}

          {uploadError && (
            <div className="px-4 pb-2 text-[11px] text-[#921E1E] font-semibold">
              {uploadError}
            </div>
          )}

          <div className="flex items-center justify-between px-3 py-2 border-t border-gray-50 gap-2">
            <div className="flex items-center gap-2">
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
                title="Attach files — images, PDFs, documents (max 25 MB each)"
                className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-[#7E5896] px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <Paperclip className="w-3.5 h-3.5" />
                Attach
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none pl-1">
                <input
                  type="checkbox"
                  checked={internal}
                  onChange={(e) => setInternal(e.target.checked)}
                  className="accent-[#C9A0DC]"
                />
                <Lock className="w-3 h-3" /> Internal note
              </label>
            </div>
            <button
              type="button"
              disabled={!canSend}
              className={cn(
                'flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors',
                canSend
                  ? 'bg-[#C9A0DC] hover:bg-[#b97fd0] text-white'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed',
              )}
            >
              <Send className="w-3.5 h-3.5" />
              {internal ? 'Post note' : 'Send reply'}
              {staged.length > 0 && (
                <span className="text-[10px] font-bold bg-white/25 px-1.5 py-0.5 rounded-full tabular-nums">
                  {staged.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </footer>
    </>
  )
}

function MessageBubble({ msg }: { msg: InboxItem['thread'][number] }) {
  return (
    <div
      className={cn(
        'rounded-2xl border px-5 py-4',
        msg.internal
          ? 'bg-[#FFF8E4] border-[#F5E0A3]'
          : 'bg-white border-gray-100 shadow-[0_1px_6px_-3px_rgba(0,0,0,0.05)]',
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
          style={{ background: msg.from.avatarColor, color: '#555' }}
        >
          {msg.from.initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-gray-900 truncate">
            {msg.from.name}
            {msg.from.handle && (
              <span className="ml-1.5 text-xs text-gray-400 font-normal">{msg.from.handle}</span>
            )}
          </p>
        </div>
        {msg.internal && (
          <span className="text-[10px] font-bold uppercase tracking-wide text-[#8A5A09] bg-[#FEF3DB] px-2 py-0.5 rounded-full flex items-center gap-1">
            <Lock className="w-2.5 h-2.5" /> Internal
          </span>
        )}
        <span className="text-[11px] text-gray-400 tabular-nums shrink-0">
          {formatFull(msg.at)}
        </span>
      </div>
      {msg.body && (
        <p className="text-[13.5px] leading-relaxed text-gray-700 whitespace-pre-wrap">
          {msg.body}
        </p>
      )}
      {msg.attachments && msg.attachments.length > 0 && (
        <AttachmentGallery attachments={msg.attachments} />
      )}
    </div>
  )
}

function AttachmentGallery({ attachments }: { attachments: InboxAttachment[] }) {
  const images = attachments.filter((a) => a.kind === 'image' && (a.thumbUrl || a.url))
  const files = attachments.filter((a) => !(a.kind === 'image' && (a.thumbUrl || a.url)))

  return (
    <div className="mt-3 space-y-2">
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {images.map((a) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="group relative block aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-100 hover:border-[#C9A0DC] transition"
              title={`${a.name} · ${formatBytes(a.size)}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.thumbUrl || a.url}
                alt={a.name}
                className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                loading="lazy"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-[10px] font-semibold text-white truncate">{a.name}</p>
                <p className="text-[9px] text-white/80 tabular-nums">{formatBytes(a.size)}</p>
              </div>
            </a>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((a) => (
            <FileChip key={a.id} attachment={a} />
          ))}
        </div>
      )}
    </div>
  )
}

function FileChip({ attachment }: { attachment: InboxAttachment }) {
  const { Icon, color, tint } = attachmentIcon(attachment.kind)
  const downloadable = Boolean(attachment.url)

  return (
    <a
      href={attachment.url || '#'}
      target={attachment.url ? '_blank' : undefined}
      rel="noreferrer"
      onClick={(e) => {
        if (!attachment.url) e.preventDefault()
      }}
      className={cn(
        'group flex items-center gap-2.5 pl-2 pr-3 py-2 rounded-xl border border-gray-100 bg-white max-w-[260px]',
        downloadable
          ? 'hover:border-[#C9A0DC] hover:shadow-[0_1px_6px_-2px_rgba(0,0,0,0.08)] transition cursor-pointer'
          : 'cursor-default',
      )}
      title={attachment.name}
    >
      <span
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: tint, color }}
      >
        <Icon className="w-4 h-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold text-gray-900 truncate">
          {attachment.name}
        </span>
        <span className="block text-[11px] text-gray-400 tabular-nums">
          {attachment.kind.toUpperCase()} · {formatBytes(attachment.size)}
        </span>
      </span>
      {downloadable && (
        <Download className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#7E5896] shrink-0" />
      )}
    </a>
  )
}

function StatusPill({ status }: { status: InboxStatus }) {
  const map: Record<InboxStatus, { bg: string; text: string; dot: string }> = {
    new: { bg: 'bg-[#F0DFF6]', text: 'text-[#7E5896]', dot: 'bg-[#C9A0DC]' },
    open: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
    in_progress: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
    resolved: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    archived: { bg: 'bg-gray-100', text: 'text-gray-500', dot: 'bg-gray-400' },
  }
  const s = map[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full',
        s.bg,
        s.text,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />
      {STATUS_LABEL[status]}
    </span>
  )
}

function StagedChip({
  attachment,
  onRemove,
}: {
  attachment: InboxAttachment
  onRemove: () => void
}) {
  const { Icon, color, tint } = attachmentIcon(attachment.kind)
  const isImage = attachment.kind === 'image' && attachment.thumbUrl

  return (
    <div className="group relative flex items-center gap-2 pl-1.5 pr-2 py-1.5 rounded-xl border border-gray-100 bg-gray-50 max-w-[220px]">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={attachment.thumbUrl}
          alt=""
          className="w-8 h-8 rounded-md object-cover shrink-0"
        />
      ) : (
        <span
          className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
          style={{ background: tint, color }}
        >
          <Icon className="w-3.5 h-3.5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-gray-800 truncate">{attachment.name}</p>
        <p className="text-[10px] text-gray-400 tabular-nums">{formatBytes(attachment.size)}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        title="Remove"
        aria-label={`Remove ${attachment.name}`}
        className="w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#E15656] transition-colors shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

function IconBtn({
  label,
  onClick,
  active,
  children,
}: {
  label: string
  onClick?: () => void
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'w-8 h-8 flex items-center justify-center rounded-lg border border-gray-100 transition-colors',
        active
          ? 'bg-[#FFF6D9] text-[#8A5A09] border-[#F5E0A3]'
          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50',
      )}
    >
      {children}
    </button>
  )
}
