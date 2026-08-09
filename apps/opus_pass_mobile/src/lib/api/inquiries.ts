import { OpusWebsiteApiError, requestOpusWebsite } from '@/lib/api/opusWebsite';
import type { InquiryStatus, ProposalStatus } from '@/types/vendor';

/**
 * The inquiry/proposal surface is the one part of the vendors feature that does
 * NOT talk to Supabase directly. Couples have no UPDATE policy on `inquiries`
 * (052_update_rls_for_clerk.sql grants UPDATE to the owning vendor only), and
 * `inquiry_messages` is `USING (false)` for every client role. opus_website
 * already implements the whole flow server-side — including the atomic
 * proposal guard and the acceptance confirmation email — so we call it rather
 * than fork that state machine into a second implementation.
 *
 * Transport and auth live in @/lib/api/opusWebsite.
 */

export interface InquiryListItem {
  id: string;
  vendor_name: string | null;
  vendor_slug: string | null;
  status: InquiryStatus;
  created_at: string;
  event_date: string | null;
  location: string | null;
  guest_count: number | null;
}

export interface InquiryDetail extends InquiryListItem {
  name: string;
  email: string;
  budget: string | null;
  message: string;
  vendor_response: string | null;
  responded_at: string | null;
  proposal_status: ProposalStatus | null;
  proposal_event_date: string | null;
  proposal_venue: string | null;
  proposal_guest_count: number | null;
  proposal_package: string | null;
  proposal_invoice_amount: number | null;
  proposal_invoice_details: string | null;
  proposal_sent_at: string | null;
  proposal_counter_amount: number | null;
  proposal_counter_message: string | null;
  proposal_countered_at: string | null;
  proposal_accepted_at: string | null;
}

export interface InquiryMessage {
  id: string;
  sender_type: 'client' | 'vendor';
  sender_name: string | null;
  content: string;
  created_at: string;
  read_at: string | null;
}

export class ProposalConflictError extends Error {
  constructor() {
    super('This proposal was already responded to. Pull to refresh for the latest.');
    this.name = 'ProposalConflictError';
  }
}

/**
 * The proposal routes answer 409 when the vendor moved first. That is the one
 * status this surface reinterprets, so it maps here rather than in the shared
 * transport.
 */
async function request<T>(
  path: string,
  token: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  try {
    return await requestOpusWebsite<T>(path, token, init);
  } catch (err) {
    if (err instanceof OpusWebsiteApiError && err.status === 409) {
      throw new ProposalConflictError();
    }
    throw err;
  }
}

export async function getMyInquiries(token: string): Promise<InquiryListItem[]> {
  const data = await request<{ inquiries: InquiryListItem[] }>('/inquiries', token);
  return data.inquiries ?? [];
}

export async function getInquiry(
  token: string,
  id: string,
): Promise<{ inquiry: InquiryDetail; messages: InquiryMessage[] }> {
  return request<{ inquiry: InquiryDetail; messages: InquiryMessage[] }>(
    `/inquiries/${id}`,
    token,
  );
}

export async function sendInquiryMessage(token: string, id: string, content: string) {
  return request<{ success: boolean }>(`/inquiries/${id}/messages`, token, {
    method: 'POST',
    body: { content },
  });
}

export async function acceptProposal(token: string, id: string) {
  return request<{ success: boolean }>(`/inquiries/${id}/proposal`, token, {
    method: 'PATCH',
    body: { action: 'accept' },
  });
}

export async function counterProposal(
  token: string,
  id: string,
  input: { counterAmount?: number; counterMessage?: string },
) {
  return request<{ success: boolean }>(`/inquiries/${id}/proposal`, token, {
    method: 'PATCH',
    body: { action: 'counter', ...input },
  });
}
