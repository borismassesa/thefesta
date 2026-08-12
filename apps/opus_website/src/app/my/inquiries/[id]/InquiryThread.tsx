'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, MapPin, Users, Send, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import type { InquiryDetail, InquiryMessage } from './page'

type InquiryStatus = 'pending' | 'responded' | 'accepted' | 'declined' | 'closed'
type ProposalStatus = 'sent' | 'countered' | 'accepted'

type InquiryProposal = {
  status: ProposalStatus
  eventDate: string | null
  venue: string | null
  guestCount: number | null
  packageName: string | null
  invoiceAmount: number | null
  invoiceDetails: string | null
  sentAt: string | null
  counterAmount: number | null
  counterMessage: string | null
  counteredAt: string | null
  acceptedAt: string | null
}

const STATUS_LABEL: Record<InquiryStatus, string> = {
  pending: 'Pending reply',
  responded: 'Replied',
  accepted: 'Accepted',
  declined: 'Declined',
  closed: 'Closed',
}

const STATUS_STYLE: Record<InquiryStatus, string> = {
  pending: 'bg-amber-50 text-amber-700',
  responded: 'bg-blue-50 text-blue-700',
  accepted: 'bg-green-50 text-green-700',
  declined: 'bg-red-50 text-red-600',
  closed: 'bg-gray-100 text-gray-500',
}

function formatDate(iso: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!iso) return 'Date TBC'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', opts ?? { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function formatMoney(value: number | null) {
  if (!value || value <= 0) return 'TBC'
  return `TZS ${value.toLocaleString('en-GB')}`
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
    sentAt: inquiry.proposal_sent_at,
    counterAmount: inquiry.proposal_counter_amount,
    counterMessage: inquiry.proposal_counter_message,
    counteredAt: inquiry.proposal_countered_at,
    acceptedAt: inquiry.proposal_accepted_at,
  }
}

function sameInquiryMessages(a: InquiryMessage[], b: InquiryMessage[]): boolean {
  if (a.length !== b.length) return false
  return a.every((message, index) => {
    const other = b[index]
    return Boolean(
      other
      && other.id === message.id
      && other.content === message.content
      && other.created_at === message.created_at
      && other.read_at === message.read_at,
    )
  })
}

function MessageBubble({ msg }: Readonly<{ msg: InquiryMessage }>) {
  const isClient = msg.sender_type === 'client'
  return (
    <div className={`flex gap-3 ${isClient ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold ${
          isClient ? 'bg-(--accent) text-[#1A1A1A]' : 'bg-gray-900 text-white'
        }`}
      >
        {msg.sender_name.charAt(0).toUpperCase()}
      </div>
      <div className={`flex flex-col gap-1 max-w-[75%] ${isClient ? 'items-end' : 'items-start'}`}>
        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          <span className="font-semibold text-gray-600">{msg.sender_name}</span>
          <span>{formatDate(msg.created_at, { day: '2-digit', month: 'short' })} · {formatTime(msg.created_at)}</span>
        </div>
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
            isClient
              ? 'bg-(--accent) text-[#1A1A1A] rounded-tr-sm'
              : 'bg-white border border-gray-100 shadow-sm text-gray-800 rounded-tl-sm'
          }`}
        >
          {msg.content}
        </div>
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
  onCounterAmountChange: (value: string) => void
  onCounterMessageChange: (value: string) => void
  onCounterCancel: () => void
  onAccept: () => void
  onCounterSubmit: () => void
}>) {
  let statusClass = 'bg-blue-50 text-blue-700'
  if (proposal.status === 'accepted') {
    statusClass = 'bg-green-50 text-green-700'
  } else if (proposal.status === 'countered') {
    statusClass = 'bg-amber-50 text-amber-700'
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Proposal</p>
          <p className="text-sm font-semibold text-[#1A1A1A] mt-1">
            {proposal.status === 'sent' && 'Review the vendor proposal'}
            {proposal.status === 'countered' && 'Counter sent to vendor'}
            {proposal.status === 'accepted' && 'Proposal agreed'}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass}`}>
          {proposal.status}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 text-sm text-gray-700">
        <div><strong>Date:</strong> {formatDate(proposal.eventDate)}</div>
        <div><strong>Venue:</strong> {proposal.venue ?? 'TBC'}</div>
        <div><strong>Guests:</strong> {proposal.guestCount ? `${proposal.guestCount} guests` : 'TBC'}</div>
        <div><strong>Package:</strong> {proposal.packageName ?? 'TBC'}</div>
        <div><strong>Invoice:</strong> {formatMoney(proposal.invoiceAmount)}</div>
      </div>

      {proposal.invoiceDetails && (
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap">
          {proposal.invoiceDetails}
        </div>
      )}

      {proposal.status === 'countered' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-2">
          <p><strong>Your counter amount:</strong> {formatMoney(proposal.counterAmount)}</p>
          {proposal.counterMessage && <p className="whitespace-pre-wrap">{proposal.counterMessage}</p>}
          <p className="text-xs text-amber-700">Waiting for vendor approval.</p>
        </div>
      )}

      {proposal.status === 'sent' && (
        <div className="space-y-3">
          {counterOpen ? (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
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
              <button data-opus-button="control"
                type="button"
                disabled={actionLoading}
                onClick={onCounterOpen}
                className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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
          )}
        </div>
      )}
    </div>
  )
}

type Props = {
  inquiry: InquiryDetail
  messages: InquiryMessage[]
  email: string
}

export default function InquiryThread({ inquiry, messages: initialMessages, email }: Readonly<Props>) {
  const router = useRouter()
  const [messages, setMessages] = useState<InquiryMessage[]>(initialMessages)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [inquiryStatus, setInquiryStatus] = useState<InquiryStatus>((inquiry.status ?? 'pending') as InquiryStatus)
  const [inquiryActionLoading, setInquiryActionLoading] = useState(false)
  const [proposal, setProposal] = useState<InquiryProposal | null>(extractProposal(inquiry))
  const [counterOpen, setCounterOpen] = useState(false)
  const [counterAmount, setCounterAmount] = useState(
    inquiry.proposal_invoice_amount ? String(inquiry.proposal_invoice_amount) : '',
  )
  const [counterMessage, setCounterMessage] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    let cancelled = false

    const refreshMessages = async () => {
      try {
        const [messagesResponse, inquiryResponse] = await Promise.all([
          fetch(`/api/my/inquiries/${inquiry.id}/messages`, { cache: 'no-store' }),
          fetch(`/api/my/inquiries/${inquiry.id}`, { cache: 'no-store' }),
        ])
        if (!messagesResponse.ok || !inquiryResponse.ok) return
        const [json, inquiryJson] = await Promise.all([messagesResponse.json(), inquiryResponse.json()])
        if (cancelled) return
        const nextMessages = (json.messages ?? []) as InquiryMessage[]
        setMessages((prev) => (sameInquiryMessages(prev, nextMessages) ? prev : nextMessages))
        const nextInquiry = inquiryJson.inquiry as InquiryDetail | undefined
        if (nextInquiry) {
          setInquiryStatus((nextInquiry.status ?? 'pending') as InquiryStatus)
          setProposal(extractProposal(nextInquiry))
        }
      } catch {
        // Keep current messages and retry on next watcher tick.
      }
    }

    const intervalId = globalThis.setInterval(() => {
      void refreshMessages()
    }, 1500)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshMessages()
      }
    }

    window.addEventListener('focus', handleVisibility)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelled = true
      globalThis.clearInterval(intervalId)
      window.removeEventListener('focus', handleVisibility)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [inquiry.id])

  const status = inquiryStatus
  const vendorLabel = inquiry.vendor_name ?? inquiry.vendor_slug ?? 'Vendor'

  // Build the full thread: initial inquiry message + subsequent messages
  const initialMsg: InquiryMessage | null = inquiry.message
    ? {
        id: 'initial',
        sender_type: 'client',
        sender_name: inquiry.name ?? email,
        content: inquiry.message,
        created_at: inquiry.created_at,
        read_at: null,
      }
    : null

  // Legacy vendor_response (before inquiry_messages existed)
  const legacyReply: InquiryMessage | null =
    inquiry.vendor_response && messages.every((m) => m.sender_type !== 'vendor')
      ? {
          id: 'legacy-reply',
          sender_type: 'vendor',
          sender_name: vendorLabel,
          content: inquiry.vendor_response,
          created_at: inquiry.responded_at ?? inquiry.created_at,
          read_at: null,
        }
      : null

  const thread: InquiryMessage[] = [
    ...(initialMsg ? [initialMsg] : []),
    ...messages,
    ...(legacyReply ? [legacyReply] : []),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  async function sendMessage() {
    if (!draft.trim() || sending) return

    setSending(true)
    setSendError('')
    try {
      const res = await fetch(`/api/my/inquiries/${inquiry.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft.trim() }),
      })
      const json = await res.json()
      if (res.ok) {
        setMessages((prev) => [...prev, json.message])
        setDraft('')
      } else {
        const message = json.error ?? 'Failed to send. Please try again.'
        setSendError(message)
        toast.error(message)
      }
    } catch {
      setSendError('Network error. Please check your connection.')
      toast.error('Network error. Please check your connection.')
    } finally {
      setSending(false)
    }
  }

  async function handleCloseInquiry() {
    if (inquiryActionLoading || status === 'closed') return
    setInquiryActionLoading(true)
    try {
      const res = await fetch(`/api/my/inquiries/${inquiry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' }),
      })
      const json = await res.json()
      if (!res.ok) {
        const message = json.error ?? 'Failed to close request.'
        setSendError(message)
        toast.error(message)
        return
      }
      setInquiryStatus('closed')
      setSendError('')
      toast.success('Request closed')
    } catch {
      setSendError('Network error while closing request.')
      toast.error('Network error while closing request.')
    } finally {
      setInquiryActionLoading(false)
    }
  }

  async function handleDeleteInquiry() {
    if (inquiryActionLoading) return
    if (!window.confirm('Delete this quote request? This cannot be undone.')) return
    setInquiryActionLoading(true)
    try {
      const res = await fetch(`/api/my/inquiries/${inquiry.id}`, { method: 'DELETE' })
      if (!res.ok) {
        setSendError('Failed to delete request.')
        toast.error('Failed to delete request.')
        return
      }
      toast.success('Request deleted')
      router.push('/my/inquiries')
      router.refresh()
    } catch {
      setSendError('Network error while deleting request.')
      toast.error('Network error while deleting request.')
    } finally {
      setInquiryActionLoading(false)
    }
  }

  async function handleAcceptProposal() {
    if (proposal?.status !== 'sent' || inquiryActionLoading) return
    setInquiryActionLoading(true)
    try {
      const res = await fetch(`/api/my/inquiries/${inquiry.id}/proposal`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept' }),
      })
      const json = await res.json()
      if (!res.ok) {
        const message = json.error ?? 'Failed to accept proposal.'
        setSendError(message)
        toast.error(message)
        return
      }
      setInquiryStatus('accepted')
      setProposal((prev) => prev ? { ...prev, status: 'accepted', acceptedAt: new Date().toISOString() } : prev)
      setCounterOpen(false)
      setSendError('')
      toast.success('Proposal accepted')
    } catch {
      setSendError('Network error while accepting proposal.')
      toast.error('Network error while accepting proposal.')
    } finally {
      setInquiryActionLoading(false)
    }
  }

  async function handleCounterProposal() {
    if (proposal?.status !== 'sent' || inquiryActionLoading) return
    setInquiryActionLoading(true)
    try {
      const res = await fetch(`/api/my/inquiries/${inquiry.id}/proposal`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'counter',
          counterAmount,
          counterMessage,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        const message = json.error ?? 'Failed to send counter.'
        setSendError(message)
        toast.error(message)
        return
      }
      setProposal((prev) => prev ? {
        ...prev,
        status: 'countered',
        counterAmount: counterAmount.trim() ? Number(counterAmount) : prev.invoiceAmount,
        counterMessage: counterMessage.trim() || null,
        counteredAt: new Date().toISOString(),
      } : prev)
      setCounterOpen(false)
      setSendError('')
      toast.success('Counter sent')
    } catch {
      setSendError('Network error while sending counter.')
      toast.error('Network error while sending counter.')
    } finally {
      setInquiryActionLoading(false)
    }
  }

  const canSendMore = status !== 'declined' && status !== 'closed'

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      {/* Back link */}
      <Link
        href={`/my/inquiries`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#1A1A1A] mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        All requests
      </Link>

      {/* Inquiry header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-[#1A1A1A]">{vendorLabel}</h1>
            <p className="text-sm text-gray-500 mt-0.5">Quote request</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[status]}`}>
              {STATUS_LABEL[status]}
            </span>
            {status !== 'closed' && (
              <button data-opus-button="control"
                type="button"
                disabled={inquiryActionLoading}
                onClick={handleCloseInquiry}
                className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Close request
              </button>
            )}
            <button data-opus-button="danger" data-opus-button-size="small"
              type="button"
              disabled={inquiryActionLoading}
              onClick={handleDeleteInquiry}
              className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Event details */}
        <div className="mt-4 flex flex-wrap gap-3">
          {inquiry.event_date && (
            <span className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              {formatDate(inquiry.event_date)}
            </span>
          )}
          {inquiry.location && (
            <span className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg">
              <MapPin className="w-3.5 h-3.5 text-gray-400" />
              {inquiry.location}
            </span>
          )}
          {inquiry.guest_count && (
            <span className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg">
              <Users className="w-3.5 h-3.5 text-gray-400" />
              {inquiry.guest_count} guests
            </span>
          )}
        </div>

        {status === 'accepted' && (
          <div className="mt-4 flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <p>
              <strong>{vendorLabel}</strong> has accepted your request. They&apos;ll be in touch to confirm the details.
            </p>
          </div>
        )}
      </div>

      {proposal && (
        <ProposalCard
          proposal={proposal}
          actionLoading={inquiryActionLoading}
          counterOpen={counterOpen}
          counterAmount={counterAmount}
          counterMessage={counterMessage}
          onCounterOpen={() => {
            setCounterOpen(true)
            setCounterAmount(proposal.invoiceAmount ? String(proposal.invoiceAmount) : '')
          }}
          onCounterAmountChange={setCounterAmount}
          onCounterMessageChange={setCounterMessage}
          onCounterCancel={() => {
            setCounterOpen(false)
            setCounterMessage('')
            setCounterAmount(proposal.invoiceAmount ? String(proposal.invoiceAmount) : '')
          }}
          onAccept={handleAcceptProposal}
          onCounterSubmit={handleCounterProposal}
        />
      )}

      {/* Message thread */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Thread body */}
        <div className="p-5 space-y-5 min-h-60">
          {thread.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No messages yet.</p>
          ) : (
            thread.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
          )}
          <div ref={bottomRef} />
        </div>

        {/* Compose area */}
        {canSendMore ? (
          <div className="border-t border-gray-100 p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void sendMessage()
              }}
              className="flex gap-2 items-end"
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Send a follow-up message to ${vendorLabel}…`}
                rows={2}
                disabled={sending}
                className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:border-(--accent) transition-colors disabled:opacity-60"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    void sendMessage()
                  }
                }}
              />
              <button data-opus-button="primary" data-opus-button-size="large"
                type="submit"
                disabled={sending || !draft.trim()}
                className="shrink-0 flex items-center gap-1.5 px-4 py-3 rounded-xl bg-[#1A1A1A] text-white text-sm font-semibold hover:bg-black/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-4 h-4" />
                {sending ? 'Sending…' : 'Send'}
              </button>
            </form>
            {sendError && (
              <p className="text-xs text-red-600 mt-2">{sendError}</p>
            )}
            <p className="text-[11px] text-gray-400 mt-2">Press ⌘ + Enter to send</p>
          </div>
        ) : (
          <div className="border-t border-gray-100 px-5 py-4 text-xs text-gray-400 text-center">
            {status === 'declined'
              ? 'This vendor has declined the request. You can browse other vendors.'
              : 'This conversation is closed.'}
          </div>
        )}
      </div>
    </div>
  )
}
