// Shared inquiry types for the dashboard inbox. The data mirrors the shared
// marketplace `inquiries` / `inquiry_messages` tables.

export type InquiryStatus = 'pending' | 'responded' | 'accepted' | 'declined' | 'closed'
export type ProposalStatus = 'sent' | 'countered' | 'accepted'

export type InquirySummary = {
  id: string
  vendor_id: string | null
  vendor_name: string | null
  vendor_slug: string | null
  vendor_page_slug: string | null
  status: InquiryStatus | null
  created_at: string
  event_date: string | null
  location: string | null
  guest_count: number | null
}

export type InquiryDetail = {
  id: string
  vendor_name: string | null
  vendor_slug: string | null
  name: string | null
  email: string
  status: InquiryStatus | null
  created_at: string
  event_date: string | null
  location: string | null
  guest_count: number | null
  budget: string | null
  message: string | null
  vendor_response: string | null
  responded_at: string | null
  proposal_status: ProposalStatus | null
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

export type InquiryAttachment = {
  url: string
  name: string
  type: string
  size: number
}

export type InquiryMessage = {
  id: string
  sender_type: 'client' | 'vendor'
  sender_name: string
  content: string
  created_at: string
  read_at: string | null
  attachments?: InquiryAttachment[] | null
}

export function isImageAttachment(att: InquiryAttachment): boolean {
  return att.type.startsWith('image/')
}

export const STATUS_LABEL: Record<InquiryStatus, string> = {
  pending: 'Pending reply',
  responded: 'Replied',
  accepted: 'Accepted',
  declined: 'Declined',
  closed: 'Closed',
}

export const STATUS_STYLE: Record<InquiryStatus, string> = {
  pending: 'bg-amber-50 text-amber-700',
  responded: 'bg-blue-50 text-blue-700',
  accepted: 'bg-emerald-50 text-emerald-700',
  declined: 'bg-red-50 text-red-600',
  closed: 'bg-gray-100 text-gray-500',
}

export function formatInquiryDate(iso: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!iso) return 'Date TBC'
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso)
  const d = dateOnly ? new Date(`${iso}T00:00:00`) : new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', opts ?? { day: '2-digit', month: 'short', year: 'numeric', timeZone: dateOnly ? 'UTC' : undefined })
}

export function formatInquiryTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function formatInquiryMoney(value: number | null) {
  if (!value || value <= 0) return 'TBC'
  return `TZS ${value.toLocaleString('en-GB')}`
}
