'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Image from 'next/image'
import { ArrowDownUp, Inbox, Mail, Phone, Search, MessageSquare, Check, X, Send, Archive, Receipt, ChevronDown, ChevronUp, Plus, Image as ImageIcon, FileText, Calendar, MapPin, Users, Package } from 'lucide-react'
import { toast } from 'sonner'
import type { InquiryRow } from '@/lib/mock-data'
import { TZ_REGIONS } from '@/lib/onboarding/regions'
import { cn } from '@/lib/utils'
import type { VendorPricingPackage } from '@/lib/vendors'
import { usePortalT, type Translator } from '@/components/providers/PortalUIStringsProvider'

const TABS = ['Prospects', 'Inquiries', 'Conversations'] as const

// One-line description of what each tab holds, surfaced as a tooltip so the
// three labels read as a clear funnel: to-do -> in progress -> resolved.
function buildTabHint(t: Translator): Record<(typeof TABS)[number], string> {
  return {
    Prospects: t('tab_prospects_hint'),
    Inquiries: t('tab_inquiries_hint'),
    Conversations: t('tab_conversations_hint'),
  }
}

function buildTabLabel(t: Translator): Record<(typeof TABS)[number], string> {
  return {
    Prospects: t('tab_prospects'),
    Inquiries: t('tab_inquiries'),
    Conversations: t('tab_conversations'),
  }
}

export type LeadsSource =
  | { kind: 'live' }
  | { kind: 'no-application' }
  | { kind: 'pending-approval' }
  | { kind: 'suspended' }
  | { kind: 'no-env' }

type MessageAttachment = {
  url: string
  name: string
  type: string
  size: number
}

type ThreadMessage = {
  id: string
  sender_type: 'client' | 'vendor'
  sender_name: string
  content: string
  created_at: string
  read_at: string | null
  attachments?: MessageAttachment[] | null
}

type PersistedProposalStatus = 'sent' | 'countered' | 'accepted'

type InquiryDetail = {
  id: string
  status: 'pending' | 'responded' | 'accepted' | 'declined' | 'closed' | null
  proposal_status: PersistedProposalStatus | null
  proposal_event_date: string | null
  proposal_venue: string | null
  proposal_guest_count: number | null
  proposal_package: string | null
  proposal_invoice_amount: number | null
  proposal_invoice_details: string | null
  proposal_sent_at: string | null
  proposal_counter_amount: number | null
  proposal_counter_message: string | null
  proposal_countered_at: string | null
  proposal_accepted_at: string | null
}

function sameThread(a: ThreadMessage[], b: ThreadMessage[]): boolean {
  if (a.length !== b.length) return false
  return a.every((message, index) => {
    const other = b[index]
    return Boolean(
      other?.id === message.id
      && other.content === message.content
      && other.created_at === message.created_at
      && other.read_at === message.read_at,
    )
  })
}

type LeadsClientProps = {
  inquiries: InquiryRow[]
  source: LeadsSource
  vendorName: string
  packages: VendorPricingPackage[]
}

const VENUE_SUGGESTIONS = [
  'Mlimani City Hall, Dar es Salaam',
  'Johari Rotana, Dar es Salaam',
  'Hyatt Regency, Dar es Salaam',
  'Sea Cliff Hotel, Dar es Salaam',
  'White Sands Resort, Dar es Salaam',
  'Gran Meliá, Arusha',
  'Mount Meru Hotel, Arusha',
  'Malaika Beach Resort, Mwanza',
  'Best Western Dodoma City Hotel, Dodoma',
]

// Mutually-exclusive funnel: every lead lands in exactly one tab.
//   Prospects     -> needs a first reply        (new)
//   Inquiries     -> in active discussion        (replied)
//   Conversations -> resolved / archived         (booked | declined | closed)
function matchesTab(active: (typeof TABS)[number], status: InquiryRow['status']) {
  if (active === 'Prospects') return status === 'new'
  if (active === 'Inquiries') return status === 'replied'
  return status === 'booked' || status === 'declined' || status === 'closed'
}

function countByTab(inquiries: InquiryRow[]): Record<(typeof TABS)[number], number> {
  return {
    Prospects: inquiries.filter((row) => matchesTab('Prospects', row.status)).length,
    Inquiries: inquiries.filter((row) => matchesTab('Inquiries', row.status)).length,
    Conversations: inquiries.filter((row) => matchesTab('Conversations', row.status)).length,
  }
}

// Land the vendor on the first tab that actually has leads (preferring the
// to-do end of the funnel) so they never open onto an empty list when work
// is waiting in another tab.
function firstNonEmptyTab(counts: Record<(typeof TABS)[number], number>): (typeof TABS)[number] {
  return TABS.find((tab) => counts[tab] > 0) ?? 'Prospects'
}

function getEmptyListMessage(
  source: LeadsSource['kind'],
  active: (typeof TABS)[number],
  searchQuery: string,
  t: Translator,
) {
  if (source === 'no-application') return t('empty_no_application')
  if (source === 'pending-approval') return t('empty_pending_approval')
  if (source === 'suspended') return t('empty_suspended')

  const q = searchQuery.trim()
  if (q) return t('empty_search_results', { tab: buildTabLabel(t)[active].toLowerCase(), query: q })
  if (active === 'Prospects') return t('empty_prospects_default')
  if (active === 'Conversations') return t('empty_conversations_default')
  return t('empty_inquiries_default')
}

function getReplyButtonClass(isSampleData: boolean, replyOpen: boolean) {
  if (isSampleData) return 'bg-gray-200 text-gray-400 cursor-not-allowed'
  if (replyOpen) return 'bg-[#C9A0DC] text-black hover:bg-[#b98dcc]'
  return 'bg-gray-900 text-white hover:bg-gray-800'
}

async function patchInquiryRequest(id: string, payload: Record<string, unknown>) {
  const res = await fetch(`/api/inquiries/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Request failed')
}

/* ── Sub-components for action panels ── */

type ProposalDraft = {
  eventDate: string
  venue: string
  guestCount: string
  packageName: string
  invoiceAmount: string
  invoiceDetails: string
}

type ProposalPanelProps = {
  open: boolean
  sending: boolean
  draft: ProposalDraft
  packages: VendorPricingPackage[]
  venueSuggestions: string[]
  onToggle: () => void
  onDraftChange: (next: ProposalDraft) => void
  onCancel: () => void
  onSend: () => void
}

function ProposalPanel({ open, sending, draft, packages, venueSuggestions, onToggle, onDraftChange, onCancel, onSend }: Readonly<ProposalPanelProps>) {
  const t = usePortalT('leads')
  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden">
      <button data-opus-button="control"
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Receipt className="w-3.5 h-3.5 text-gray-500" />
          {t('proposal_panel_label')}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="p-4 space-y-3 bg-white border-t border-gray-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="proposal-event-date" className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">{t('proposal_field_event_date')}</label>
              <input
                id="proposal-event-date"
                type="date"
                value={draft.eventDate}
                onChange={(e) => onDraftChange({ ...draft, eventDate: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#C9A0DC] transition-colors"
              />
            </div>
            <div>
              <label htmlFor="proposal-venue" className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">{t('proposal_field_venue')}</label>
              <input
                id="proposal-venue"
                type="text"
                list="proposal-venue-suggestions"
                value={draft.venue}
                onChange={(e) => onDraftChange({ ...draft, venue: e.target.value })}
                placeholder={t('proposal_field_venue_placeholder')}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#C9A0DC] transition-colors"
              />
              <datalist id="proposal-venue-suggestions">
                {venueSuggestions.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
            </div>
            <div>
              <label htmlFor="proposal-guests" className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">{t('proposal_field_guests')}</label>
              <input
                id="proposal-guests"
                type="text"
                inputMode="numeric"
                value={draft.guestCount}
                onChange={(e) => onDraftChange({ ...draft, guestCount: e.target.value.replaceAll(/\D/g, '') })}
                placeholder={t('proposal_field_guests_placeholder')}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#C9A0DC] transition-colors"
              />
            </div>
            <div>
              <label htmlFor="proposal-package" className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">{t('proposal_field_package')}</label>
              <select
                id="proposal-package"
                value={draft.packageName}
                onChange={(e) => {
                  const nextPackage = e.target.value
                  const matched = packages.find((pkg) => pkg.label === nextPackage)
                  onDraftChange({
                    ...draft,
                    packageName: nextPackage,
                    invoiceAmount: matched ? extractDigitsFromPrice(matched.value) : draft.invoiceAmount,
                  })
                }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#C9A0DC] transition-colors"
              >
                <option value="">{t('proposal_field_package_select')}</option>
                {packages.map((pkg) => (
                  <option key={pkg.label} value={pkg.label}>
                    {pkg.label}{pkg.value ? ` · ${pkg.value}` : ''}
                  </option>
                ))}
                {draft.packageName && !packages.some((pkg) => pkg.label === draft.packageName) ? (
                  <option value={draft.packageName}>{draft.packageName}</option>
                ) : null}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="proposal-amount" className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">{t('proposal_field_amount_label')}</label>
            <input
              id="proposal-amount"
              type="text"
              inputMode="numeric"
              value={draft.invoiceAmount}
              onChange={(e) => onDraftChange({ ...draft, invoiceAmount: e.target.value.replaceAll(/\D/g, '') })}
              placeholder={t('proposal_field_amount_placeholder')}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#C9A0DC] transition-colors"
            />
            {draft.invoiceAmount && Number(draft.invoiceAmount) > 0 && (
              <p className="text-xs text-gray-400 mt-1">TZS {Number(draft.invoiceAmount).toLocaleString('en-GB')}</p>
            )}
          </div>
          <div>
            <label htmlFor="proposal-details" className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">{t('proposal_field_details_label')} <span className="font-normal text-gray-400">{t('optional_suffix')}</span></label>
            <textarea
              id="proposal-details"
              value={draft.invoiceDetails}
              onChange={(e) => onDraftChange({ ...draft, invoiceDetails: e.target.value })}
              placeholder={t('proposal_field_details_placeholder')}
              rows={3}
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#C9A0DC] transition-colors"
            />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{t('proposal_preview_label')}</p>
            <div className="rounded-2xl border border-[#C9A0DC]/30 bg-[#C9A0DC]/[0.06] p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-[#C9A0DC]/20 bg-white px-4 py-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{t('proposal_preview_total_label')}</span>
                <span className="text-lg font-extrabold tracking-tight text-gray-900">
                  {draft.invoiceAmount && Number(draft.invoiceAmount) > 0
                    ? `TZS ${Number(draft.invoiceAmount).toLocaleString('en-GB')}`
                    : t('proposal_preview_tbc')}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: Calendar, label: t('proposal_preview_date_label'), value: draft.eventDate ? formatProposalDate(draft.eventDate, t) : t('proposal_preview_tbc') },
                  { icon: MapPin, label: t('proposal_field_venue'), value: draft.venue.trim() || t('proposal_preview_tbc') },
                  { icon: Users, label: t('proposal_field_guests'), value: draft.guestCount.trim() ? `${draft.guestCount.trim()}+` : t('proposal_preview_tbc') },
                  { icon: Package, label: t('proposal_field_package'), value: draft.packageName.trim() || t('proposal_preview_tbc') },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="rounded-xl border border-[#C9A0DC]/15 bg-white/70 px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      <Icon className="w-3 h-3" />{label}
                    </p>
                    <p className="mt-0.5 truncate text-sm font-semibold text-gray-900">{value}</p>
                  </div>
                ))}
              </div>
              {draft.invoiceDetails.trim() && (
                <div className="rounded-xl border border-[#C9A0DC]/15 bg-white/70 px-3 py-2.5 text-sm text-gray-700 whitespace-pre-wrap">
                  {draft.invoiceDetails.trim()}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button data-opus-button="control" type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
              {t('proposal_cancel_button')}
            </button>
            <button data-opus-button="primary" data-opus-button-size="small"
              type="button"
              disabled={sending || !draft.invoiceAmount || Number(draft.invoiceAmount) <= 0}
              onClick={onSend}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              {sending ? t('proposal_send_button_sending') : t('proposal_send_button')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

type DeclinePanelProps = {
  reason: string
  loading: boolean
  onReasonChange: (v: string) => void
  onCancel: () => void
  onConfirm: () => void
}

function DeclinePanel({ reason, loading, onReasonChange, onCancel, onConfirm }: Readonly<DeclinePanelProps>) {
  const t = usePortalT('leads')
  return (
    <div className="rounded-xl border border-red-100 bg-red-50/60 p-4 space-y-3">
      <p className="text-xs font-semibold text-red-700 uppercase tracking-wider">
        {t('decline_panel_label')} <span className="font-normal text-red-500">{t('optional_suffix')}</span>
      </p>
      <textarea
        value={reason}
        onChange={(e) => onReasonChange(e.target.value)}
        placeholder={t('decline_textarea_placeholder')}
        rows={2}
        className="w-full resize-none rounded-lg border border-red-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-red-400 transition-colors"
      />
      <div className="flex justify-end gap-2">
        <button data-opus-button="control" type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          {t('decline_cancel_button')}
        </button>
        <button data-opus-button="danger" data-opus-button-size="small"
          type="button"
          disabled={loading}
          onClick={onConfirm}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          {loading ? t('decline_confirm_button_loading') : t('decline_confirm_button')}
        </button>
      </div>
    </div>
  )
}

function buildBannerBySource(t: Translator): Record<LeadsSource['kind'], string | null> {
  return {
    live: null,
    'no-application': t('banner_no_application'),
    'pending-approval': t('banner_pending_approval'),
    suspended: t('banner_suspended'),
    'no-env': t('banner_no_env'),
  }
}

function buildStatusLabel(t: Translator): Record<InquiryRow['status'], string> {
  return {
    new: t('status_new'),
    replied: t('status_replied'),
    booked: t('status_booked'),
    declined: t('status_declined'),
    closed: t('status_closed'),
  }
}

const STATUS_STYLE: Record<InquiryRow['status'], string> = {
  new: 'bg-[#F0DFF6] text-[#7E5896]',
  replied: 'bg-blue-50 text-blue-700',
  booked: 'bg-green-50 text-green-700',
  declined: 'bg-red-50 text-red-600',
  closed: 'bg-gray-100 text-gray-500',
}

function mapUiStatusToDbStatus(status: InquiryRow['status']) {
  if (status === 'booked') return 'accepted'
  if (status === 'replied') return 'responded'
  return status
}

function extractDigitsFromPrice(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const millionMatch = /([\d.]+)\s*M/i.exec(trimmed)
  if (millionMatch?.[1]) {
    return String(Math.round(Number.parseFloat(millionMatch[1]) * 1_000_000))
  }
  const numeric = trimmed.replaceAll(/[^\d]/g, '')
  return numeric
}

function formatProposalDate(value: string, t: Translator): string {
  if (!value) return t('date_tbc')
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatProposalMoney(value: number | null, t: Translator): string {
  if (!value || value <= 0) return t('proposal_preview_tbc')
  return `TZS ${value.toLocaleString('en-GB')}`
}

function mapDbStatusToUiStatus(status: InquiryDetail['status']): InquiryRow['status'] {
  if (status === 'accepted') return 'booked'
  if (status === 'responded') return 'replied'
  if (status === 'declined') return 'declined'
  if (status === 'closed') return 'closed'
  return 'new'
}

function extractInterestedPackage(message: string | undefined): string {
  if (!message) return ''
  const match = /Interested package:\s*(.+)/i.exec(message)
  return match?.[1]?.trim() ?? ''
}

function buildDefaultProposalDraft(row: InquiryRow, inquiryDetail?: InquiryDetail | null): ProposalDraft {
  const invoiceAmount = inquiryDetail?.proposal_status && inquiryDetail.proposal_invoice_amount
    ? String(inquiryDetail.proposal_invoice_amount)
    : ''
  let guestCount = ''
  if (typeof inquiryDetail?.proposal_guest_count === 'number') {
    guestCount = String(inquiryDetail.proposal_guest_count)
  } else if (typeof row.guestCount === 'number') {
    guestCount = String(row.guestCount)
  }
  return {
    eventDate: inquiryDetail?.proposal_event_date ?? row.eventDateIso ?? '',
    venue: inquiryDetail?.proposal_venue ?? (row.location && row.location !== '—' ? row.location : ''),
    guestCount,
    packageName: inquiryDetail?.proposal_package ?? extractInterestedPackage(row.message),
    invoiceAmount,
    invoiceDetails: inquiryDetail?.proposal_invoice_details ?? '',
  }
}

function ProposalStateCard({
  inquiryDetail,
  onAcceptCounter,
  onCounterBack,
  onDecline,
  acceptingCounter,
}: Readonly<{
  inquiryDetail: InquiryDetail
  onAcceptCounter: () => void
  onCounterBack: () => void
  onDecline: () => void
  acceptingCounter: boolean
}>) {
  const t = usePortalT('leads')
  if (!inquiryDetail.proposal_status) return null
  let statusClass = 'bg-blue-100 text-blue-700'
  if (inquiryDetail.proposal_status === 'accepted') {
    statusClass = 'bg-green-100 text-green-700'
  } else if (inquiryDetail.proposal_status === 'countered') {
    statusClass = 'bg-amber-100 text-amber-700'
  }

  return (
    <div className="mt-6 rounded-2xl border border-[#C9A0DC]/30 bg-[#C9A0DC]/[0.06] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#7E5896]">{t('proposal_state_label')}</p>
          <p className="mt-0.5 text-base font-bold text-gray-900">
            {inquiryDetail.proposal_status === 'sent' && t('proposal_state_waiting')}
            {inquiryDetail.proposal_status === 'countered' && t('proposal_state_countered')}
            {inquiryDetail.proposal_status === 'accepted' && t('proposal_state_accepted')}
          </p>
        </div>
        <span className={cn('shrink-0 rounded-full px-3 py-1 text-xs font-bold capitalize', statusClass)}>
          {inquiryDetail.proposal_status}
        </span>
      </div>

      {/* Headline figure */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[#C9A0DC]/20 bg-white px-4 py-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{t('proposal_invoice_total')}</span>
        <span className="text-xl font-extrabold tracking-tight text-gray-900">{formatProposalMoney(inquiryDetail.proposal_invoice_amount, t)}</span>
      </div>

      {/* Detail tiles */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { icon: Calendar, label: t('proposal_preview_date_label'), value: formatProposalDate(inquiryDetail.proposal_event_date ?? '', t) },
          { icon: MapPin, label: t('proposal_field_venue'), value: inquiryDetail.proposal_venue ?? t('proposal_preview_tbc') },
          { icon: Users, label: t('proposal_field_guests'), value: inquiryDetail.proposal_guest_count ? `${inquiryDetail.proposal_guest_count}+` : t('proposal_preview_tbc') },
          { icon: Package, label: t('proposal_field_package'), value: inquiryDetail.proposal_package ?? t('proposal_preview_tbc') },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-xl border border-[#C9A0DC]/15 bg-white/70 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              <Icon className="w-3 h-3" />{label}
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {inquiryDetail.proposal_invoice_details && (
        <div className="rounded-xl bg-white border border-gray-200 p-3 text-sm text-gray-700 whitespace-pre-wrap">
          {inquiryDetail.proposal_invoice_details}
        </div>
      )}

      {inquiryDetail.proposal_status === 'countered' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-sm font-semibold text-amber-800">{t('counter_title')}</p>
          <p className="text-sm text-amber-900">
            <strong>{t('counter_amount_label')}</strong> {formatProposalMoney(inquiryDetail.proposal_counter_amount, t)}
          </p>
          {inquiryDetail.proposal_counter_message && (
            <p className="text-sm text-amber-900 whitespace-pre-wrap">{inquiryDetail.proposal_counter_message}</p>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button data-opus-button="danger" data-opus-button-size="medium"
              type="button"
              disabled={acceptingCounter}
              onClick={onDecline}
              className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              {t('counter_decline_button')}
            </button>
            <button data-opus-button="neutral" data-opus-button-size="medium"
              type="button"
              disabled={acceptingCounter}
              onClick={onCounterBack}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {t('counter_back_button')}
            </button>
            <button data-opus-button="control"
              type="button"
              disabled={acceptingCounter}
              onClick={onAcceptCounter}
              className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {acceptingCounter ? t('counter_accept_button_loading') : t('counter_accept_button')}
            </button>
          </div>
          <p className="text-[11px] text-amber-700/80">
            {t('counter_back_hint')}
          </p>
        </div>
      )}
    </div>
  )
}

type MessageBubbleProps = {
  msg: ThreadMessage
}

function MessageBubble({ msg }: Readonly<MessageBubbleProps>) {
  const isVendor = msg.sender_type === 'vendor'
  return (
    <div className={`flex gap-2.5 ${isVendor ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold ${isVendor ? 'bg-[#C9A0DC] text-[#1A1A1A]' : 'bg-gray-200 text-gray-600'}`}>
        {msg.sender_name.charAt(0).toUpperCase()}
      </div>
      <div className={`flex flex-col gap-1 max-w-[80%] ${isVendor ? 'items-end' : 'items-start'}`}>
        <span className="text-[10px] text-gray-400 font-semibold">{msg.sender_name}</span>
        {msg.content && (
          <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${isVendor ? 'bg-[#F0DFF6] text-[#1A1A1A] rounded-tr-sm' : 'bg-gray-100 text-gray-800 rounded-tl-sm'}`}>
            {msg.content}
          </div>
        )}
        {msg.attachments && msg.attachments.length > 0 && (
          <div className={`flex flex-col gap-2 ${isVendor ? 'items-end' : 'items-start'}`}>
            {msg.attachments.map((att) =>
              att.type.startsWith('image/') ? (
                <a key={att.url} href={att.url} target="_blank" rel="noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={att.url} alt={att.name} className="max-h-48 max-w-full rounded-xl border border-gray-100 object-cover" />
                </a>
              ) : att.type.startsWith('video/') ? (
                <video key={att.url} src={att.url} controls className="max-h-48 max-w-full rounded-xl border border-gray-100" />
              ) : (
                <a
                  key={att.url}
                  href={att.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors max-w-[15rem]"
                >
                  <Receipt className="w-4 h-4 text-gray-400 shrink-0" />
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

/* ── Initials avatar ── */

// Soft, on-brand backgrounds for the fallback avatar. The lead with no uploaded
// photo gets a stable colour + initials derived from their name, so the list
// reads as distinct people instead of one repeated stock photo.
const AVATAR_PALETTE = [
  'bg-[#F0DFF6] text-[#7E5896]',
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-indigo-100 text-indigo-700',
]

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

function paletteFor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

function LeadAvatar({
  name,
  avatarUrl,
  size,
}: Readonly<{ name: string; avatarUrl: string | null; size: 'sm' | 'lg' }>) {
  const dim = size === 'lg' ? 56 : 40
  const sizeCls = size === 'lg' ? 'w-14 h-14 text-base' : 'w-10 h-10 text-sm'
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={dim}
        height={dim}
        className={cn(sizeCls, 'rounded-full object-cover shrink-0')}
      />
    )
  }
  return (
    <div
      aria-hidden="true"
      className={cn(sizeCls, 'rounded-full shrink-0 flex items-center justify-center font-bold', paletteFor(name))}
    >
      {getInitials(name)}
    </div>
  )
}

function filterInquiry(row: InquiryRow, active: (typeof TABS)[number], q: string): boolean {
  if (!matchesTab(active, row.status)) return false
  if (!q) return true
  const haystack = [row.couple, row.location, row.email ?? '', row.phone ?? ''].join(' ').toLowerCase()
  return haystack.includes(q)
}

type SortOption = 'newest' | 'oldest' | 'event'

function buildSortLabel(t: Translator): Record<SortOption, string> {
  return {
    newest: t('sort_newest'),
    oldest: t('sort_oldest'),
    event: t('sort_event'),
  }
}

// Rows arrive newest-first from the DB query, so 'newest' is the identity order.
function sortInquiries(rows: InquiryRow[], sortBy: SortOption): InquiryRow[] {
  if (sortBy === 'newest') return rows
  if (sortBy === 'oldest') return [...rows].reverse()
  // Event date soonest; leads with no date sort to the bottom.
  return [...rows].sort((a, b) => {
    if (!a.eventDateIso) return 1
    if (!b.eventDateIso) return -1
    return a.eventDateIso.localeCompare(b.eventDateIso)
  })
}

function SortMenu({
  sortBy,
  onChange,
}: Readonly<{ sortBy: SortOption; onChange: (next: SortOption) => void }>) {
  const t = usePortalT('leads')
  const sortLabel = buildSortLabel(t)
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button data-opus-button="control"
        type="button"
        aria-label={t('sort_aria_label')}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('sort_title', { option: sortLabel[sortBy] })}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'p-2 rounded-lg border transition-colors',
          open ? 'border-[#C9A0DC] bg-[#FCF7FF] text-[#7E5896]' : 'border-gray-200 text-gray-500 hover:bg-gray-50',
        )}
      >
        <ArrowDownUp className="w-4 h-4" />
      </button>
      {open && (
        <>
          <button data-opus-button="control"
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-gray-100 bg-white py-1 shadow-lg"
          >
            {(Object.keys(sortLabel) as SortOption[]).map((option) => (
              <button data-opus-button="control"
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={sortBy === option}
                onClick={() => { onChange(option); setOpen(false) }}
                className={cn(
                  'flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50',
                  sortBy === option ? 'font-semibold text-[#7E5896]' : 'text-gray-600',
                )}
              >
                {sortLabel[option]}
                {sortBy === option && <Check className="w-3.5 h-3.5" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function useLeadsState(initialInquiries: InquiryRow[], isSampleData: boolean) {
  const t = usePortalT('leads')
  const [active, setActive] = useState<(typeof TABS)[number]>(() =>
    firstNonEmptyTab(countByTab(initialInquiries)),
  )
  const [inquiries, setInquiries] = useState(initialInquiries)
  const [selected, setSelected] = useState<string | null>(initialInquiries[0]?.id ?? null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('newest')
  const [replyText, setReplyText] = useState('')
  const [replyFiles, setReplyFiles] = useState<File[]>([])
  const [replyOpen, setReplyOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [thread, setThread] = useState<ThreadMessage[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [selectedInquiryDetail, setSelectedInquiryDetail] = useState<InquiryDetail | null>(null)
  const [proposalOpen, setProposalOpen] = useState(false)
  const [proposalSending, setProposalSending] = useState(false)
  const [proposalActionLoading, setProposalActionLoading] = useState(false)
  const [proposalDraft, setProposalDraft] = useState<ProposalDraft>({
    eventDate: '',
    venue: '',
    guestCount: '',
    packageName: '',
    invoiceAmount: '',
    invoiceDetails: '',
  })
  const [declineOpen, setDeclineOpen] = useState(false)
  const [declineReason, setDeclineReason] = useState('')

  const visibleInquiries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const filtered = inquiries.filter((row) => filterInquiry(row, active, q))
    return sortInquiries(filtered, sortBy)
  }, [inquiries, active, searchQuery, sortBy])

  useEffect(() => {
    if (visibleInquiries.length === 0) { setSelected(null); return }
    const stillVisible = visibleInquiries.some((r) => r.id === selected)
    if (!stillVisible) setSelected(visibleInquiries[0].id)
  }, [visibleInquiries, selected])

  const selectedRow = visibleInquiries.find((r) => r.id === selected)
    ?? inquiries.find((r) => r.id === selected)
    ?? null

  function syncInquiryDetail(nextInquiry: InquiryDetail) {
    setSelectedInquiryDetail(nextInquiry)
    updateLocalStatus(nextInquiry.id, mapDbStatusToUiStatus(nextInquiry.status))
  }

  useEffect(() => {
    if (!selected || isSampleData) { setThread([]); setSelectedInquiryDetail(null); return }
    setThreadLoading(true)
    setProposalOpen(false)
    setDeclineOpen(false)
    setDeclineReason('')
    Promise.all([
      fetch(`/api/inquiries/${selected}/messages`).then((r) => r.ok ? r.json() : Promise.reject(new Error('messages failed'))),
      fetch(`/api/inquiries/${selected}`).then((r) => r.ok ? r.json() : Promise.reject(new Error('inquiry failed'))),
    ])
      .then(([messagesJson, inquiryJson]) => {
        setThread(messagesJson.messages ?? [])
        if (inquiryJson.inquiry) syncInquiryDetail(inquiryJson.inquiry as InquiryDetail)
      })
      .catch(() => setThread([]))
      .finally(() => setThreadLoading(false))
  }, [selected, isSampleData])

  useEffect(() => {
    if (!selectedRow) return
    setProposalDraft(buildDefaultProposalDraft(selectedRow, selectedInquiryDetail))
  }, [selectedRow?.id, selectedInquiryDetail?.proposal_sent_at])

  useEffect(() => {
    if (!selected || isSampleData) return

    let cancelled = false

    const refreshThread = async () => {
      try {
        const [messagesResponse, inquiryResponse] = await Promise.all([
          fetch(`/api/inquiries/${selected}/messages`, { cache: 'no-store' }),
          fetch(`/api/inquiries/${selected}`, { cache: 'no-store' }),
        ])
        if (!messagesResponse.ok || !inquiryResponse.ok) return
        const [json, inquiryJson] = await Promise.all([messagesResponse.json(), inquiryResponse.json()])
        if (cancelled) return
        const nextThread = (json.messages ?? []) as ThreadMessage[]
        setThread((prev) => (sameThread(prev, nextThread) ? prev : nextThread))
        if (inquiryJson.inquiry) syncInquiryDetail(inquiryJson.inquiry as InquiryDetail)
      } catch {
        // Keep current thread and retry on the next watcher tick.
      }
    }

    const intervalId = globalThis.setInterval(() => {
      void refreshThread()
    }, 1500)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshThread()
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
  }, [selected, isSampleData])

  function updateLocalStatus(id: string, status: InquiryRow['status']) {
    setInquiries((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)))
  }

  async function handleReply() {
    if (!selectedRow || (!replyText.trim() && replyFiles.length === 0)) return
    setSending(true)
    try {
      const form = new FormData()
      form.set('content', replyText.trim())
      for (const file of replyFiles) form.append('files', file)
      const res = await fetch(`/api/inquiries/${selectedRow.id}/messages`, { method: 'POST', body: form })
      if (!res.ok) throw new Error('send failed')
      const json = await res.json()
      setThread((prev) => [...prev, json.message])
      updateLocalStatus(selectedRow.id, 'replied')
      setReplyText('')
      setReplyFiles([])
      setReplyOpen(false)
      toast.success(t('toast_reply_sent'))
    } catch (err) {
      console.error('[leads] send reply failed', err)
      toast.error(t('toast_reply_error'))
    } finally { setSending(false) }
  }

  async function handleClose() {
    if (!selectedRow || isSampleData) return
    setActionLoading(true)
    try {
      await patchInquiryRequest(selectedRow.id, { status: 'closed' })
      updateLocalStatus(selectedRow.id, 'closed')
      toast.success(t('toast_close_success'))
    } catch (err) {
      console.error('[leads] close failed', err)
      toast.error(t('toast_close_error'))
    } finally { setActionLoading(false) }
  }

  async function handleDecline() {
    if (!selectedRow || isSampleData) return
    setActionLoading(true)
    try {
      await patchInquiryRequest(selectedRow.id, {
        status: 'declined',
        vendor_response: declineReason.trim() || undefined,
      })
      updateLocalStatus(selectedRow.id, 'declined')
      setDeclineOpen(false)
      setDeclineReason('')
      toast.success(t('toast_decline_success'))
    } catch (err) {
      console.error('[leads] decline failed', err)
      toast.error(t('toast_decline_error'))
    } finally { setActionLoading(false) }
  }

  async function handleSendProposal() {
    if (!selectedRow || !proposalDraft.invoiceAmount.trim() || isSampleData) return
    const parsed = Number(proposalDraft.invoiceAmount.replaceAll(/\D/g, ''))
    if (!parsed || parsed <= 0) return
    setProposalSending(true)
    try {
      const res = await fetch(`/api/inquiries/${selectedRow.id}/proposal`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          eventDate: proposalDraft.eventDate,
          venue: proposalDraft.venue,
          guestCount: proposalDraft.guestCount,
          packageName: proposalDraft.packageName,
          invoiceAmount: proposalDraft.invoiceAmount,
          invoiceDetails: proposalDraft.invoiceDetails,
        }),
      })
      if (!res.ok) throw new Error('send failed')
      if (selectedRow.status === 'new') {
        await patchInquiryRequest(selectedRow.id, { status: 'responded' })
        updateLocalStatus(selectedRow.id, 'replied')
      }
      syncInquiryDetail({
        id: selectedRow.id,
        status: 'responded',
        proposal_status: 'sent',
        proposal_event_date: proposalDraft.eventDate || null,
        proposal_venue: proposalDraft.venue || null,
        proposal_guest_count: proposalDraft.guestCount ? Number(proposalDraft.guestCount) : null,
        proposal_package: proposalDraft.packageName || null,
        proposal_invoice_amount: parsed,
        proposal_invoice_details: proposalDraft.invoiceDetails || null,
        proposal_sent_at: new Date().toISOString(),
        proposal_counter_amount: null,
        proposal_counter_message: null,
        proposal_countered_at: null,
        proposal_accepted_at: null,
      })
      setProposalOpen(false)
      toast.success(t('toast_proposal_sent'))
    } catch (err) {
      console.error('[leads] send proposal failed', err)
      toast.error(t('toast_proposal_error'))
    } finally {
      setProposalSending(false)
    }
  }

  async function handleAcceptCounter() {
    if (!selectedRow || selectedInquiryDetail?.proposal_status !== 'countered' || isSampleData) {
      return
    }
    setProposalActionLoading(true)
    try {
      const res = await fetch(`/api/inquiries/${selectedRow.id}/proposal`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept-counter' }),
      })
      if (!res.ok) throw new Error('accept failed')
      syncInquiryDetail({
        ...selectedInquiryDetail,
        status: 'accepted',
        proposal_status: 'accepted',
        proposal_invoice_amount: selectedInquiryDetail.proposal_counter_amount ?? selectedInquiryDetail.proposal_invoice_amount,
        proposal_accepted_at: new Date().toISOString(),
      })
      updateLocalStatus(selectedRow.id, 'booked')
      toast.success(t('toast_counter_accepted'))
    } catch (err) {
      console.error('[leads] accept counter failed', err)
      toast.error(t('toast_counter_error'))
    } finally {
      setProposalActionLoading(false)
    }
  }

  async function handleStatusChange(status: InquiryRow['status']) {
    if (!selectedRow || isSampleData) return
    setActionLoading(true)
    try {
      await patchInquiryRequest(selectedRow.id, { status: mapUiStatusToDbStatus(status) })
      updateLocalStatus(selectedRow.id, status)
      toast.success(t('toast_status_changed', { status: buildStatusLabel(t)[status].toLowerCase() }))
    } catch (err) {
      console.error('[leads] status change failed', err)
      toast.error(t('toast_status_error'))
    } finally { setActionLoading(false) }
  }

  return {
    active, setActive,
    inquiries,
    selected, setSelected,
    searchQuery, setSearchQuery,
    sortBy, setSortBy,
    replyText, setReplyText,
    replyFiles, setReplyFiles,
    replyOpen, setReplyOpen,
    sending,
    actionLoading,
    thread,
    threadLoading,
    selectedInquiryDetail,
    proposalOpen, setProposalOpen,
    proposalSending,
    proposalActionLoading,
    proposalDraft, setProposalDraft,
    declineOpen, setDeclineOpen,
    declineReason, setDeclineReason,
    visibleInquiries,
    selectedRow,
    handleReply,
    handleClose,
    handleDecline,
    handleSendProposal,
    handleAcceptCounter,
    handleStatusChange,
  }
}

export default function LeadsClient({ inquiries: initialInquiries, source, vendorName, packages }: Readonly<LeadsClientProps>) {
  const t = usePortalT('leads')
  const isSampleData = source.kind === 'no-env'
  const banner = buildBannerBySource(t)[source.kind]
  const venueSuggestions = useMemo(() => {
    const suggestions = new Set<string>([...VENUE_SUGGESTIONS, ...TZ_REGIONS.map((region) => region.name)])
    initialInquiries.forEach((inquiry) => {
      if (inquiry.location && inquiry.location !== '—') {
        suggestions.add(inquiry.location)
      }
    })
    return Array.from(suggestions)
  }, [initialInquiries])
  const {
    active, setActive, selected, setSelected, searchQuery, setSearchQuery,
    sortBy, setSortBy,
    replyText, setReplyText, replyFiles, setReplyFiles, replyOpen, setReplyOpen, sending, actionLoading,
    thread, threadLoading, selectedInquiryDetail, proposalOpen, setProposalOpen, proposalSending,
    proposalActionLoading,
    proposalDraft, setProposalDraft, declineOpen, setDeclineOpen,
    declineReason, setDeclineReason, inquiries, visibleInquiries, selectedRow,
    handleReply, handleClose,
    handleDecline, handleSendProposal, handleAcceptCounter, handleStatusChange,
  } = useLeadsState(initialInquiries, isSampleData)

  // Live per-tab counts recompute as lead statuses change (reply, book, decline…).
  const tabCounts = useMemo(() => countByTab(inquiries), [inquiries])

  // Reply attachments (vendor can send photos/videos/documents, like the couple side).
  const [replyMenuOpen, setReplyMenuOpen] = useState(false)
  const replyPhotoRef = useRef<HTMLInputElement>(null)
  const replyDocRef = useRef<HTMLInputElement>(null)

  function addReplyFiles(input: HTMLInputElement | null) {
    const selected = input?.files
    if (!selected || selected.length === 0) return
    setReplyFiles((prev) => {
      const next = [...prev]
      for (const file of Array.from(selected)) {
        if (file.size > 25 * 1024 * 1024) { toast.error(t('reply_error_file_too_large', { filename: file.name })); continue }
        if (next.length >= 6) { toast.error(t('reply_error_too_many_files')); break }
        next.push(file)
      }
      return next
    })
    if (input) input.value = ''
  }

  function openReplyPicker(which: 'photo' | 'doc') {
    setReplyMenuOpen(false)
    if (which === 'photo') replyPhotoRef.current?.click()
    else replyDocRef.current?.click()
  }

  return (
    <div className="p-8 pb-12">
      <div className="max-w-350 mx-auto">
        {banner && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">
            {banner}
          </div>
        )}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
          {/* Desktop: fixed-height cell so each column scrolls independently.
              Mobile: stacks and grows with the page. */}
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] lg:grid-rows-1 min-h-[70vh] lg:min-h-0 lg:h-[calc(100vh-9rem)]">

            {/* ── List sidebar ── */}
            <aside className="border-r border-gray-100 flex flex-col lg:min-h-0">
              <div className="p-5 border-b border-gray-100">
                <div className="flex gap-1 border-b border-gray-100 -mx-5 px-5">
                  {TABS.map((tab) => {
                    const isActive = active === tab
                    const count = tabCounts[tab]
                    return (
                      <button data-opus-button="control"
                        key={tab}
                        type="button"
                        title={buildTabHint(t)[tab]}
                        onClick={() => setActive(tab)}
                        className={cn(
                          'pb-3 px-3 text-sm font-semibold transition-colors border-b-2 -mb-px flex items-center gap-1.5',
                          isActive
                            ? 'border-[#C9A0DC] text-[#7E5896]'
                            : 'border-transparent text-gray-400 hover:text-gray-700',
                        )}
                      >
                        {buildTabLabel(t)[tab]}
                        {count > 0 && (
                          <span
                            className={cn(
                              'min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center tabular-nums',
                              isActive ? 'bg-[#F0DFF6] text-[#7E5896]' : 'bg-gray-100 text-gray-500',
                            )}
                          >
                            {count}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t('search_placeholder')}
                      className="pl-9 pr-3 py-2 bg-gray-50 border border-gray-100 rounded-lg w-full text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all"
                    />
                  </div>
                  <SortMenu sortBy={sortBy} onChange={setSortBy} />
                </div>
              </div>

              <ul className="flex-1 overflow-y-auto overscroll-contain">
                {visibleInquiries.length === 0 ? (
                  <li className="px-6 py-14 flex flex-col items-center text-center">
                    <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                      {searchQuery.trim() ? (
                        <Search className="w-5 h-5 text-gray-300" />
                      ) : (
                        <Inbox className="w-5 h-5 text-gray-300" />
                      )}
                    </div>
                    <p className="text-sm text-gray-500 max-w-[240px]">
                      {getEmptyListMessage(source.kind, active, searchQuery, t)}
                    </p>
                  </li>
                ) : (
                  visibleInquiries.map((row) => (
                    <li key={row.id}>
                      <button data-opus-button="control"
                        type="button"
                        onClick={() => { setSelected(row.id); setReplyOpen(false) }}
                        className={cn(
                          'w-full flex items-start gap-3 px-5 py-4 border-b border-gray-50 transition-colors text-left',
                          selected === row.id ? 'bg-[#FCF7FF]' : 'hover:bg-gray-50',
                        )}
                      >
                        <LeadAvatar name={row.couple} avatarUrl={row.avatarUrl} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              {isSampleData ? t('sample_data_prefix', { name: row.couple }) : row.couple}
                            </p>
                            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold', STATUS_STYLE[row.status])}>
                              {buildStatusLabel(t)[row.status]}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{row.date}</p>
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{row.location}</p>
                        </div>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </aside>

            {/* ── Detail panel ── */}
            <section className="flex flex-col lg:min-h-0">
              {selectedRow ? (
                <div className="flex-1 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain p-8">
                  <div className="flex items-start gap-4">
                    <LeadAvatar name={selectedRow.couple} avatarUrl={selectedRow.avatarUrl} size="lg" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-xl font-semibold text-gray-900">
                          {isSampleData ? t('sample_data_prefix', { name: selectedRow.couple }) : selectedRow.couple}
                        </h2>
                        <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-bold', STATUS_STYLE[selectedRow.status])}>
                          {buildStatusLabel(t)[selectedRow.status]}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {t('lead_date_label', { date: selectedRow.date })}
                      </p>
                      {(selectedRow.email || selectedRow.phone) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                          {selectedRow.email && (
                            <a href={`mailto:${selectedRow.email}`} className="flex items-center gap-1.5 hover:text-gray-900 hover:underline break-all">
                              <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              {selectedRow.email}
                            </a>
                          )}
                          {selectedRow.phone && (
                            <a href={`tel:${selectedRow.phone}`} className="flex items-center gap-1.5 hover:text-gray-900 hover:underline">
                              <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              {selectedRow.phone}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                    <button data-opus-button="control"
                      type="button"
                      disabled={isSampleData}
                      onClick={() => setReplyOpen((o) => !o)}
                      className={cn(
                        'flex items-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors',
                        getReplyButtonClass(isSampleData, replyOpen),
                      )}
                    >
                      <MessageSquare className="w-4 h-4" />
                      {t('reply_button_label')}
                    </button>
                  </div>


                  {selectedInquiryDetail && (
                    <ProposalStateCard
                      inquiryDetail={selectedInquiryDetail}
                      onAcceptCounter={handleAcceptCounter}
                      onCounterBack={() => {
                        // Seed the proposal form with the client's counter amount
                        // so the vendor revises from there, then open the panel.
                        setDeclineOpen(false)
                        setProposalDraft({
                          ...buildDefaultProposalDraft(selectedRow, selectedInquiryDetail),
                          invoiceAmount: selectedInquiryDetail.proposal_counter_amount
                            ? String(selectedInquiryDetail.proposal_counter_amount)
                            : '',
                        })
                        setProposalOpen(true)
                      }}
                      onDecline={() => { setProposalOpen(false); setDeclineOpen(true) }}
                      acceptingCounter={proposalActionLoading}
                    />
                  )}

                  {/* Message thread */}
                  <div className="mt-6 rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{t('conversation_section_label')}</p>
                      {threadLoading && (
                        <span className="text-[10px] text-gray-400 animate-pulse">{t('conversation_loading')}</span>
                      )}
                    </div>
                    <div className="p-4 space-y-4 bg-white">
                      {thread.length === 0 && !threadLoading ? (
                        <p className="text-xs text-gray-400 text-center py-4">
                          {t('conversation_empty')}
                        </p>
                      ) : (
                        thread.map((msg) => (
                          <MessageBubble
                            key={msg.id}
                            msg={msg}
                          />
                        ))
                      )}
                    </div>

                    {/* Reply composer */}
                    {replyOpen && !isSampleData ? (
                      <div className="border-t border-gray-100 p-4 bg-[#FCF7FF]">
                        <input ref={replyPhotoRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => addReplyFiles(e.target)} />
                        <input ref={replyDocRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" className="hidden" onChange={(e) => addReplyFiles(e.target)} />
                        <div className="flex items-end gap-2">
                          {/* WhatsApp-style "+" attach menu — sits at the left of the text box */}
                          <div className="relative shrink-0">
                            <button data-opus-button="control"
                              type="button"
                              onClick={() => setReplyMenuOpen((o) => !o)}
                              disabled={sending || replyFiles.length >= 6}
                              aria-label={t('reply_menu_attach_aria')}
                              aria-haspopup="menu"
                              aria-expanded={replyMenuOpen}
                              title={t('reply_menu_attach_label')}
                              className="flex items-center justify-center w-11 h-11 rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              <Plus className="w-5 h-5" />
                            </button>
                            {replyMenuOpen && (
                              <>
                                <button data-opus-button="control" type="button" aria-hidden="true" tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setReplyMenuOpen(false)} />
                                <div role="menu" className="absolute bottom-full left-0 z-20 mb-2 w-56 overflow-hidden rounded-2xl border border-gray-100 bg-white py-1.5 shadow-lg">
                                  <button data-opus-button="control" type="button" role="menuitem" onClick={() => openReplyPicker('photo')} className="flex w-full items-center gap-3 px-3 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50">
                                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F0DFF6] text-[#7E5896]"><ImageIcon className="w-4 h-4" /></span>
                                    {t('reply_file_photos_videos')}
                                  </button>
                                  <button data-opus-button="control" type="button" role="menuitem" onClick={() => openReplyPicker('doc')} className="flex w-full items-center gap-3 px-3 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50">
                                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-600"><FileText className="w-4 h-4" /></span>
                                    {t('reply_file_document')}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                          <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder={t('reply_composer_placeholder')}
                            rows={3}
                            className="flex-1 resize-none rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-800 focus:outline-none focus:border-[#C9A0DC] transition-colors"
                          />
                        </div>
                        {replyFiles.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {replyFiles.map((file, i) => (
                              <span key={`${file.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 max-w-[14rem]">
                                <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                <span className="truncate">{file.name}</span>
                                <button data-opus-button="control" type="button" onClick={() => setReplyFiles((prev) => prev.filter((_, idx) => idx !== i))} aria-label={t('reply_file_remove_label', { filename: file.name })} className="text-gray-400 hover:text-gray-700 shrink-0">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="mt-3 flex items-center justify-end gap-2">
                          <button data-opus-button="control"
                            type="button"
                            onClick={() => { setReplyOpen(false); setReplyText(''); setReplyFiles([]) }}
                            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                          >
                            {t('reply_cancel_button')}
                          </button>
                          <button data-opus-button="primary" data-opus-button-size="medium"
                            type="button"
                            disabled={sending || (!replyText.trim() && replyFiles.length === 0)}
                            onClick={handleReply}
                            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <Send className="w-3.5 h-3.5" />
                            {sending ? t('reply_sending_button') : t('reply_send_button')}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Status actions */}
                  {!isSampleData && selectedRow.status !== 'booked' && selectedRow.status !== 'closed' && (
                    <div className="mt-auto pt-6 space-y-3">

                      {selectedRow.status !== 'declined' && (
                        <ProposalPanel
                          open={proposalOpen}
                          sending={proposalSending}
                          draft={proposalDraft}
                          packages={packages}
                          venueSuggestions={venueSuggestions}
                          onToggle={() => { setProposalOpen((o) => !o); setDeclineOpen(false) }}
                          onDraftChange={setProposalDraft}
                          onCancel={() => {
                            setProposalOpen(false)
                            setProposalDraft(buildDefaultProposalDraft(selectedRow))
                          }}
                          onSend={handleSendProposal}
                        />
                      )}

                      <div className="flex items-center gap-2 flex-wrap">
                        <button data-opus-button="control"
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleStatusChange('booked')}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                          {t('action_mark_booked')}
                        </button>

                        {selectedRow.status !== 'declined' && (
                          <button data-opus-button="danger" data-opus-button-size="medium"
                            type="button"
                            disabled={actionLoading}
                            onClick={() => { setDeclineOpen((o) => !o); setProposalOpen(false) }}
                            className={cn(
                              'flex items-center gap-1.5 px-4 py-2 rounded-xl border text-sm font-semibold transition-colors',
                              declineOpen
                                ? 'border-red-300 bg-red-50 text-red-700'
                                : 'border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50',
                            )}
                          >
                            <X className="w-3.5 h-3.5" />
                            {t('action_decline')}
                          </button>
                        )}

                        <button data-opus-button="control"
                          type="button"
                          disabled={actionLoading}
                          onClick={handleClose}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors"
                        >
                          <Archive className="w-3.5 h-3.5" />
                          {t('action_archive')}
                        </button>
                      </div>

                      {/* Decline reason panel */}
                      {declineOpen && selectedRow.status !== 'declined' && (
                        <DeclinePanel
                          reason={declineReason}
                          loading={actionLoading}
                          onReasonChange={setDeclineReason}
                          onCancel={() => { setDeclineOpen(false); setDeclineReason('') }}
                          onConfirm={handleDecline}
                        />
                      )}

                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
                  {t('empty_detail_message')}
                </div>
              )}
            </section>

          </div>
        </div>
      </div>
    </div>
  )
}
