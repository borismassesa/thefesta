'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Calendar, MapPin, Users, Send, CheckCircle2, Loader2, Plus, Image as ImageIcon, FileText, X, Package } from 'lucide-react'
import { toast } from 'sonner'
import {
  type InquiryDetail,
  type InquiryMessage,
  type InquiryStatus,
  type ProposalStatus,
  STATUS_LABEL,
  STATUS_STYLE,
  formatInquiryDate,
  formatInquiryTime,
  formatInquiryMoney,
  isImageAttachment,
} from './types'

const MAX_ATTACH = 6
const MAX_ATTACH_BYTES = 25 * 1024 * 1024

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type InquiryProposal = {
  status: ProposalStatus
  eventDate: string | null
  venue: string | null
  guestCount: number | null
  packageName: string | null
  invoiceAmount: number | null
  invoiceDetails: string | null
  counterAmount: number | null
  counterMessage: string | null
}

function extractProposal(inquiry: InquiryDetail): InquiryProposal | null {
  if (!inquiry.proposal_status) return null
  return {
    status: inquiry.proposal_status,
    eventDate: inquiry.proposal_event_date,
    venue: inquiry.proposal_venue,
    guestCount: inquiry.proposal_guest_count,
    packageName: inquiry.proposal_package,
    invoiceAmount: inquiry.proposal_invoice_amount,
    invoiceDetails: inquiry.proposal_invoice_details,
    counterAmount: inquiry.proposal_counter_amount,
    counterMessage: inquiry.proposal_counter_message,
  }
}

function sameMessages(a: InquiryMessage[], b: InquiryMessage[]): boolean {
  if (a.length !== b.length) return false
  return a.every((m, i) => {
    const o = b[i]
    return Boolean(o && o.id === m.id && o.content === m.content && o.created_at === m.created_at && o.read_at === m.read_at)
  })
}

function MessageBubble({ msg }: Readonly<{ msg: InquiryMessage }>) {
  const isClient = msg.sender_type === 'client'
  return (
    <div className={`flex gap-3 ${isClient ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold ${
          isClient ? 'bg-(--accent) text-[#1A1A1A]' : 'bg-gray-900 text-white'
        }`}
      >
        {msg.sender_name.charAt(0).toUpperCase()}
      </div>
      <div className={`flex flex-col gap-1 max-w-[78%] ${isClient ? 'items-end' : 'items-start'}`}>
        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          <span className="font-semibold text-gray-600">{msg.sender_name}</span>
          <span>{formatInquiryDate(msg.created_at, { day: '2-digit', month: 'short' })} · {formatInquiryTime(msg.created_at)}</span>
        </div>
        {msg.content && (
          <div
            className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
              isClient
                ? 'bg-(--accent) text-[#1A1A1A] rounded-tr-sm'
                : 'bg-gray-50 border border-gray-100 text-gray-800 rounded-tl-sm'
            }`}
          >
            {msg.content}
          </div>
        )}
        {msg.attachments && msg.attachments.length > 0 && (
          <div className={`flex flex-col gap-2 ${isClient ? 'items-end' : 'items-start'}`}>
            {msg.attachments.map((att) =>
              isImageAttachment(att) ? (
                <a key={att.url} href={att.url} target="_blank" rel="noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={att.url} alt={att.name} className="max-h-52 max-w-full rounded-xl border border-gray-100 object-cover" />
                </a>
              ) : att.type.startsWith('video/') ? (
                <video key={att.url} src={att.url} controls className="max-h-52 max-w-full rounded-xl border border-gray-100" />
              ) : (
                <a
                  key={att.url}
                  href={att.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors max-w-[16rem]"
                >
                  <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="truncate font-medium">{att.name}</span>
                </a>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ProposalCard({
  proposal,
  actionLoading,
  counterOpen,
  counterAmount,
  counterMessage,
  onCounterOpen,
  onCounterAmountChange,
  onCounterMessageChange,
  onCounterCancel,
  onAccept,
  onCounterSubmit,
}: Readonly<{
  proposal: InquiryProposal
  actionLoading: boolean
  counterOpen: boolean
  counterAmount: string
  counterMessage: string
  onCounterOpen: () => void
  onCounterAmountChange: (v: string) => void
  onCounterMessageChange: (v: string) => void
  onCounterCancel: () => void
  onAccept: () => void
  onCounterSubmit: () => void
}>) {
  let statusClass = 'bg-blue-50 text-blue-700'
  if (proposal.status === 'accepted') statusClass = 'bg-green-50 text-green-700'
  else if (proposal.status === 'countered') statusClass = 'bg-amber-50 text-amber-700'

  return (
    <div className="rounded-2xl border border-(--accent)/30 bg-(--accent)/[0.06] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#8e57b3]">Proposal</p>
          <p className="mt-0.5 text-base font-bold text-[#1A1A1A]">
            {proposal.status === 'sent' && 'Review the vendor proposal'}
            {proposal.status === 'countered' && 'Counter sent to vendor'}
            {proposal.status === 'accepted' && 'Proposal agreed'}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold capitalize ${statusClass}`}>{proposal.status}</span>
      </div>

      {/* Headline figure */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-(--accent)/20 bg-white px-4 py-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Invoice total</span>
        <span className="text-xl font-extrabold tracking-tight text-[#1A1A1A]">{formatInquiryMoney(proposal.invoiceAmount)}</span>
      </div>

      {/* Detail tiles */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { icon: Calendar, label: 'Date', value: formatInquiryDate(proposal.eventDate) },
          { icon: MapPin, label: 'Venue', value: proposal.venue ?? 'TBC' },
          { icon: Users, label: 'Guests', value: proposal.guestCount ? `${proposal.guestCount} guests` : 'TBC' },
          { icon: Package, label: 'Package', value: proposal.packageName ?? 'TBC' },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-xl border border-(--accent)/15 bg-white/70 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              <Icon className="w-3 h-3" />{label}
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold text-[#1A1A1A]">{value}</p>
          </div>
        ))}
      </div>

      {proposal.invoiceDetails && (
        <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap">
          {proposal.invoiceDetails}
        </div>
      )}

      {proposal.status === 'countered' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-2">
          <p><strong>Your counter amount:</strong> {formatInquiryMoney(proposal.counterAmount)}</p>
          {proposal.counterMessage && <p className="whitespace-pre-wrap">{proposal.counterMessage}</p>}
          <p className="text-xs text-amber-700">Waiting for vendor approval.</p>
        </div>
      )}

      {proposal.status === 'sent' && (
        counterOpen ? (
          <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-3">
            <div>
              <label htmlFor="counter-amount" className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">
                Counter amount (TZS)
              </label>
              <input
                id="counter-amount"
                type="text"
                inputMode="numeric"
                value={counterAmount}
                onChange={(e) => onCounterAmountChange(e.target.value.replaceAll(/\D/g, ''))}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:border-(--accent)"
                placeholder="Leave as proposed amount or enter your counter"
              />
            </div>
            <div>
              <label htmlFor="counter-message" className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">
                Counter note
              </label>
              <textarea
                id="counter-message"
                rows={3}
                value={counterMessage}
                onChange={(e) => onCounterMessageChange(e.target.value)}
                className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:border-(--accent)"
                placeholder="Tell the vendor what you'd like adjusted"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button data-opus-button="control"
                type="button"
                disabled={actionLoading}
                onClick={onCounterCancel}
                className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button data-opus-button="primary" data-opus-button-size="medium"
                type="button"
                disabled={actionLoading || (!counterAmount.trim() && !counterMessage.trim())}
                onClick={onCounterSubmit}
                className="rounded-full bg-[#1A1A1A] px-4 py-2 text-sm font-semibold text-white hover:bg-black/85 disabled:opacity-50"
              >
                Send counter
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            <button data-opus-button="neutral" data-opus-button-size="medium"
              type="button"
              disabled={actionLoading}
              onClick={onCounterOpen}
              className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Counter
            </button>
            <button data-opus-button="primary" data-opus-button-size="medium"
              type="button"
              disabled={actionLoading}
              onClick={onAccept}
              className="rounded-full bg-[#1A1A1A] px-4 py-2 text-sm font-semibold text-white hover:bg-black/85 disabled:opacity-50"
            >
              Accept proposal
            </button>
          </div>
        )
      )}
    </div>
  )
}

type Props = {
  inquiryId: string
  onStatusChange?: (id: string, status: InquiryStatus) => void
  onDeleted?: (id: string) => void
}

export default function ConversationPanel({ inquiryId, onStatusChange, onDeleted }: Readonly<Props>) {
  const [inquiry, setInquiry] = useState<InquiryDetail | null>(null)
  const [messages, setMessages] = useState<InquiryMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [attachFiles, setAttachFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [counterOpen, setCounterOpen] = useState(false)
  const [counterAmount, setCounterAmount] = useState('')
  const [counterMessage, setCounterMessage] = useState('')
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)

  function addFiles(input: HTMLInputElement | null) {
    const selected = input?.files
    if (!selected || selected.length === 0) return
    setAttachFiles((prev) => {
      const next = [...prev]
      for (const file of Array.from(selected)) {
        if (file.size > MAX_ATTACH_BYTES) { toast.error(`"${file.name}" is larger than 25MB`); continue }
        if (next.length >= MAX_ATTACH) { toast.error(`You can attach up to ${MAX_ATTACH} files`); break }
        next.push(file)
      }
      return next
    })
    if (input) input.value = ''
  }

  function openPicker(which: 'photo' | 'doc') {
    setAttachMenuOpen(false)
    if (which === 'photo') photoInputRef.current?.click()
    else docInputRef.current?.click()
  }

  function removeFile(index: number) {
    setAttachFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const status: InquiryStatus = (inquiry?.status ?? 'pending') as InquiryStatus
  const proposal = inquiry ? extractProposal(inquiry) : null
  const vendorLabel = inquiry?.vendor_name ?? inquiry?.vendor_slug ?? 'Vendor'

  const applyInquiry = useCallback((next: InquiryDetail) => {
    setInquiry(next)
    onStatusChange?.(next.id, (next.status ?? 'pending') as InquiryStatus)
  }, [onStatusChange])

  // Initial load. The inbox remounts this panel per selection (via `key`), so a
  // fresh instance already starts from default state — no synchronous resets.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/my/inquiries/${inquiryId}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((json) => {
        if (cancelled) return
        const next = json.inquiry as InquiryDetail
        setInquiry(next)
        setMessages((json.messages ?? []) as InquiryMessage[])
        setCounterAmount(next.proposal_invoice_amount ? String(next.proposal_invoice_amount) : '')
      })
      .catch(() => { if (!cancelled) setInquiry(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [inquiryId])

  // Live polling for new vendor replies + proposal updates.
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const res = await fetch(`/api/my/inquiries/${inquiryId}`, { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json()
        if (cancelled) return
        const next = (json.messages ?? []) as InquiryMessage[]
        setMessages((prev) => (sameMessages(prev, next) ? prev : next))
        if (json.inquiry) applyInquiry(json.inquiry as InquiryDetail)
      } catch {
        // retry next tick
      }
    }
    const id = globalThis.setInterval(() => void tick(), 2000)
    const onVisible = () => { if (document.visibilityState === 'visible') void tick() }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      globalThis.clearInterval(id)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [inquiryId, applyInquiry])

  if (loading && !inquiry) {
    return (
      <div className="flex flex-1 min-h-80 items-center justify-center text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (!inquiry) {
    return (
      <div className="flex flex-1 min-h-80 items-center justify-center px-6 text-center text-sm text-gray-400">
        Could not load this conversation.
      </div>
    )
  }

  // Compose the full thread: original request + messages + legacy reply.
  const initialMsg: InquiryMessage | null = inquiry.message
    ? { id: 'initial', sender_type: 'client', sender_name: inquiry.name ?? inquiry.email, content: inquiry.message, created_at: inquiry.created_at, read_at: null }
    : null
  const legacyReply: InquiryMessage | null =
    inquiry.vendor_response && messages.every((m) => m.sender_type !== 'vendor')
      ? { id: 'legacy-reply', sender_type: 'vendor', sender_name: vendorLabel, content: inquiry.vendor_response, created_at: inquiry.responded_at ?? inquiry.created_at, read_at: null }
      : null
  const thread: InquiryMessage[] = [
    ...(initialMsg ? [initialMsg] : []),
    ...messages,
    ...(legacyReply ? [legacyReply] : []),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  const canSendMore = status !== 'declined' && status !== 'closed'

  async function sendMessage() {
    if ((!draft.trim() && attachFiles.length === 0) || sending) return
    setSending(true)
    try {
      const form = new FormData()
      form.set('content', draft.trim())
      for (const file of attachFiles) form.append('files', file)
      const res = await fetch(`/api/my/inquiries/${inquiryId}/messages`, { method: 'POST', body: form })
      const json = await res.json()
      if (res.ok) {
        setMessages((prev) => [...prev, json.message])
        setDraft('')
        setAttachFiles([])
      } else {
        toast.error(json.error ?? 'Failed to send. Please try again.')
      }
    } catch {
      toast.error('Network error. Please check your connection.')
    } finally {
      setSending(false)
    }
  }

  async function handleClose() {
    if (actionLoading || status === 'closed' || !inquiry) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/my/inquiries/${inquiryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.error ?? 'Failed to close request.'); return }
      applyInquiry({ ...inquiry, status: 'closed' })
      toast.success('Request closed')
    } catch {
      toast.error('Network error while closing request.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleReopen() {
    if (actionLoading || !inquiry) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/my/inquiries/${inquiryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'responded' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.error ?? 'Failed to reopen.'); return }
      applyInquiry({ ...inquiry, status: 'responded' })
      toast.success('Conversation reopened')
    } catch {
      toast.error('Network error while reopening.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDelete() {
    if (actionLoading) return
    if (!window.confirm('Delete this quote request? This cannot be undone.')) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/my/inquiries/${inquiryId}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to delete request.'); return }
      toast.success('Request deleted')
      onDeleted?.(inquiryId)
    } catch {
      toast.error('Network error while deleting request.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleAccept() {
    if (proposal?.status !== 'sent' || actionLoading || !inquiry) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/my/inquiries/${inquiryId}/proposal`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.error ?? 'Failed to accept proposal.'); return }
      applyInquiry({ ...inquiry, status: 'accepted', proposal_status: 'accepted', proposal_accepted_at: new Date().toISOString() })
      setCounterOpen(false)
      toast.success('Proposal accepted')
    } catch {
      toast.error('Network error while accepting proposal.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleCounter() {
    if (proposal?.status !== 'sent' || actionLoading || !inquiry) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/my/inquiries/${inquiryId}/proposal`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'counter', counterAmount, counterMessage }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.error ?? 'Failed to send counter.'); return }
      applyInquiry({
        ...inquiry,
        proposal_status: 'countered',
        proposal_counter_amount: counterAmount.trim() ? Number(counterAmount) : inquiry.proposal_invoice_amount,
        proposal_counter_message: counterMessage.trim() || null,
        proposal_countered_at: new Date().toISOString(),
      })
      setCounterOpen(false)
      toast.success('Counter sent')
    } catch {
      toast.error('Network error while sending counter.')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    // Plain content column. The scroll container is the parent (InquiriesInbox),
    // matching the vendor portal Leads detail; the whole column scrolls there.
    <div>
      {/* Conversation header (scrolls with the column) */}
      <div className="bg-white border-b border-gray-100 px-5 py-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[#1A1A1A] truncate">{vendorLabel}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Quote request · {formatInquiryDate(inquiry.created_at)}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
            {status !== 'closed' && (
              <button data-opus-button="control"
                type="button"
                disabled={actionLoading}
                onClick={handleClose}
                className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Close
              </button>
            )}
            <button data-opus-button="danger" data-opus-button-size="small"
              type="button"
              disabled={actionLoading}
              onClick={handleDelete}
              className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {inquiry.event_date && (
            <span className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />{formatInquiryDate(inquiry.event_date)}
            </span>
          )}
          {inquiry.location && (
            <span className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg">
              <MapPin className="w-3.5 h-3.5 text-gray-400" />{inquiry.location}
            </span>
          )}
          {inquiry.guest_count && (
            <span className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg">
              <Users className="w-3.5 h-3.5 text-gray-400" />{inquiry.guest_count} guests
            </span>
          )}
        </div>
      </div>

      {/* Message area (flows inside the single scroller) */}
      <div className="px-5 py-5 space-y-4">
        {status === 'accepted' && (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <p><strong>{vendorLabel}</strong> accepted your request. They&apos;ll be in touch to confirm details.</p>
          </div>
        )}

        {proposal && (
          <ProposalCard
            proposal={proposal}
            actionLoading={actionLoading}
            counterOpen={counterOpen}
            counterAmount={counterAmount}
            counterMessage={counterMessage}
            onCounterOpen={() => { setCounterOpen(true); setCounterAmount(proposal.invoiceAmount ? String(proposal.invoiceAmount) : '') }}
            onCounterAmountChange={setCounterAmount}
            onCounterMessageChange={setCounterMessage}
            onCounterCancel={() => { setCounterOpen(false); setCounterMessage(''); setCounterAmount(proposal.invoiceAmount ? String(proposal.invoiceAmount) : '') }}
            onAccept={handleAccept}
            onCounterSubmit={handleCounter}
          />
        )}

        <div className="space-y-5">
          {thread.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No messages yet. Say hello below.</p>
          ) : (
            thread.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
          )}
        </div>
      </div>

      {/* Compose */}
      {canSendMore ? (
        <div className="bg-white border-t border-gray-100 p-4">
          {/* Selected attachments awaiting send */}
          {attachFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachFiles.map((file, i) => (
                <span
                  key={`${file.name}-${i}`}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700 max-w-[14rem]"
                >
                  <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="truncate">{file.name}</span>
                  <span className="text-gray-400 shrink-0">{formatFileSize(file.size)}</span>
                  <button data-opus-button="control"
                    type="button"
                    onClick={() => removeFile(i)}
                    aria-label={`Remove ${file.name}`}
                    className="text-gray-400 hover:text-gray-700 shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => { e.preventDefault(); void sendMessage() }}
            className="flex gap-2 items-end"
          >
            <input
              ref={photoInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => addFiles(e.target)}
            />
            <input
              ref={docInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              className="hidden"
              onChange={(e) => addFiles(e.target)}
            />
            {/* WhatsApp-style "+" attach menu */}
            <div className="relative shrink-0">
              <button data-opus-button="control"
                type="button"
                onClick={() => setAttachMenuOpen((o) => !o)}
                disabled={sending || attachFiles.length >= MAX_ATTACH}
                aria-label="Add attachment"
                aria-haspopup="menu"
                aria-expanded={attachMenuOpen}
                title="Attach"
                className="flex items-center justify-center w-11 h-11 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-[#1A1A1A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
              {attachMenuOpen && (
                <>
                  <button data-opus-button="control"
                    type="button"
                    aria-hidden="true"
                    tabIndex={-1}
                    className="fixed inset-0 z-10 cursor-default"
                    onClick={() => setAttachMenuOpen(false)}
                  />
                  <div
                    role="menu"
                    className="absolute bottom-full left-0 z-20 mb-2 w-56 overflow-hidden rounded-2xl border border-gray-100 bg-white py-1.5 shadow-lg"
                  >
                    <button data-opus-button="control"
                      type="button"
                      role="menuitem"
                      onClick={() => openPicker('photo')}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-sm font-medium text-[#1A1A1A] hover:bg-gray-50"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-(--accent)/20 text-[#8e57b3]">
                        <ImageIcon className="w-4 h-4" />
                      </span>
                      Photos &amp; videos
                    </button>
                    <button data-opus-button="control"
                      type="button"
                      role="menuitem"
                      onClick={() => openPicker('doc')}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-sm font-medium text-[#1A1A1A] hover:bg-gray-50"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                        <FileText className="w-4 h-4" />
                      </span>
                      Document
                    </button>
                  </div>
                </>
              )}
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Message ${vendorLabel}…`}
              rows={2}
              disabled={sending}
              className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:border-(--accent) transition-colors disabled:opacity-60"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void sendMessage() }
              }}
            />
            <button data-opus-button="primary" data-opus-button-size="large"
              type="submit"
              disabled={sending || (!draft.trim() && attachFiles.length === 0)}
              className="shrink-0 flex items-center gap-1.5 px-4 py-3 rounded-xl bg-[#1A1A1A] text-white text-sm font-semibold hover:bg-black/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4" />
              {sending ? 'Sending…' : 'Send'}
            </button>
          </form>
        </div>
      ) : (
        <div className="bg-white border-t border-gray-100 px-5 py-4 text-center">
          {status === 'declined' ? (
            <p className="text-xs text-gray-400">This vendor declined the request. Browse other vendors to keep planning.</p>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-gray-400">This conversation is closed.</p>
              <button data-opus-button="primary" data-opus-button-size="small"
                type="button"
                disabled={actionLoading}
                onClick={handleReopen}
                className="rounded-full border border-gray-200 px-4 py-1.5 text-xs font-semibold text-[#7E5896] hover:bg-(--accent)/10 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? 'Reopening…' : 'Reopen conversation'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
