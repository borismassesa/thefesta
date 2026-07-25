import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase'

// Persistence + rate limiting for Opus support conversations. Everything is
// best-effort: if Supabase is not configured or a call fails, chat still works
// (persistence just no-ops), and rate limiting fails OPEN. All access uses the
// service-role client; the support_* tables are RLS deny-all otherwise.

export type SupportRole = 'user' | 'assistant' | 'agent' | 'system'
export type SupportStatus = 'bot' | 'needs_human' | 'assigned' | 'resolved'

export type SupportMessageRow = {
  id: string
  role: SupportRole
  content: string
  agent_id: string | null
  created_at: string
}

export type SupportConversationRow = {
  id: string
  status: SupportStatus
  awaiting_staff: boolean
  visitor_id: string | null
  user_id: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  subject: string | null
  topic: string | null
  page_url: string | null
  locale: string | null
}

// A conversation belongs to the visitor that created it. We verify ownership on
// public read/handoff so knowing (or leaking) a conversation UUID alone doesn't
// grant access to someone else's support chat.
export function ownsConversation(
  conversation: Pick<SupportConversationRow, 'visitor_id'>,
  visitorId: string | null | undefined,
): boolean {
  return Boolean(visitorId && conversation.visitor_id && conversation.visitor_id === visitorId)
}

function client(): SupabaseClient | null {
  try {
    return createSupabaseServerClient()
  } catch {
    return null
  }
}

/** Returns true when the request is allowed. Fails open on any infra error. */
export async function rateLimitOk(
  bucket: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const sb = client()
  if (!sb) return true
  try {
    const { data, error } = await sb.rpc('support_rate_limit_hit', {
      p_bucket: bucket,
      p_limit: max,
      p_window_seconds: windowSeconds,
    })
    if (error) return true
    return data !== false
  } catch {
    return true
  }
}

export async function createConversation(input: {
  userId?: string | null
  visitorId?: string | null
  subject?: string | null
  pageUrl?: string | null
  locale?: string | null
  contactName?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
}): Promise<string | null> {
  const sb = client()
  if (!sb) return null
  try {
    const { data, error } = await sb
      .from('support_conversations')
      .insert({
        user_id: input.userId ?? null,
        visitor_id: input.visitorId ?? null,
        subject: input.subject?.slice(0, 200) ?? null,
        page_url: input.pageUrl?.slice(0, 500) ?? null,
        locale: input.locale ?? null,
        contact_name: input.contactName?.slice(0, 120) ?? null,
        contact_email: input.contactEmail?.slice(0, 200) ?? null,
        contact_phone: input.contactPhone?.slice(0, 40) ?? null,
      })
      .select('id')
      .single()
    if (error) return null
    return data.id as string
  } catch {
    return null
  }
}

/**
 * Attach the signed-in customer's identity to a conversation, filling only the
 * blanks so contact details the customer typed themselves are never overwritten.
 * Lets a conversation that started anonymous become attributed once we know who
 * they are.
 */
export async function attachIdentity(
  conversationId: string,
  identity: { userId?: string | null; name?: string | null; email?: string | null; phone?: string | null },
): Promise<void> {
  const sb = client()
  if (!sb) return
  try {
    const { data } = await sb
      .from('support_conversations')
      .select('user_id, contact_name, contact_email, contact_phone')
      .eq('id', conversationId)
      .maybeSingle()
    if (!data) return
    const patch: Record<string, unknown> = {}
    if (!data.user_id && identity.userId) patch.user_id = identity.userId
    if (!data.contact_name && identity.name) patch.contact_name = identity.name.slice(0, 120)
    if (!data.contact_email && identity.email) patch.contact_email = identity.email.slice(0, 200)
    if (!data.contact_phone && identity.phone) patch.contact_phone = identity.phone.slice(0, 40)
    if (Object.keys(patch).length === 0) return
    patch.updated_at = new Date().toISOString()
    await sb.from('support_conversations').update(patch).eq('id', conversationId)
  } catch {
    /* best-effort */
  }
}

export async function getConversation(id: string): Promise<SupportConversationRow | null> {
  const sb = client()
  if (!sb) return null
  try {
    const { data, error } = await sb
      .from('support_conversations')
      .select(
        'id, status, awaiting_staff, visitor_id, user_id, contact_name, contact_email, contact_phone, subject, topic, page_url, locale',
      )
      .eq('id', id)
      .maybeSingle()
    if (error || !data) return null
    return data as SupportConversationRow
  } catch {
    return null
  }
}

export async function appendMessage(
  conversationId: string,
  role: SupportRole,
  content: string,
  opts: { agentId?: string | null; awaitingStaff?: boolean } = {},
): Promise<string | null> {
  const sb = client()
  if (!sb || !content.trim()) return null
  try {
    const { data, error } = await sb
      .from('support_messages')
      .insert({
        conversation_id: conversationId,
        role,
        content: content.slice(0, 8000),
        agent_id: opts.agentId ?? null,
      })
      .select('id')
      .single()
    if (error) return null
    const patch: Record<string, unknown> = {
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    if (opts.awaitingStaff !== undefined) patch.awaiting_staff = opts.awaitingStaff
    await sb.from('support_conversations').update(patch).eq('id', conversationId)
    return data.id as string
  } catch {
    return null
  }
}

/** Escalate a conversation to a human and capture any contact details. */
export async function escalateConversation(
  conversationId: string,
  input: {
    reason?: string
    topic?: string
    contactName?: string | null
    contactEmail?: string | null
    contactPhone?: string | null
  },
): Promise<void> {
  const sb = client()
  if (!sb) return
  try {
    const patch: Record<string, unknown> = {
      status: 'needs_human',
      awaiting_staff: true,
      updated_at: new Date().toISOString(),
    }
    if (input.reason) patch.escalation_reason = input.reason
    if (input.topic) patch.topic = input.topic
    if (input.contactName) patch.contact_name = input.contactName.slice(0, 120)
    if (input.contactEmail) patch.contact_email = input.contactEmail.slice(0, 200)
    if (input.contactPhone) patch.contact_phone = input.contactPhone.slice(0, 40)
    // Only escalate if not already owned/resolved by a human.
    await sb
      .from('support_conversations')
      .update(patch)
      .eq('id', conversationId)
      .in('status', ['bot', 'needs_human'])
  } catch {
    /* best-effort */
  }
}

/** Record thumbs feedback against the latest assistant message in a thread. */
export async function recordFeedback(
  conversationId: string,
  rating: 'up' | 'down',
  reason?: string | null,
): Promise<boolean> {
  const sb = client()
  if (!sb) return false
  try {
    const { data: msg } = await sb
      .from('support_messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const { error } = await sb.from('support_feedback').insert({
      conversation_id: conversationId,
      message_id: msg?.id ?? null,
      rating,
      reason: reason?.slice(0, 500) ?? null,
    })
    return !error
  } catch {
    return false
  }
}

/** Messages after an ISO timestamp (for the widget's human-mode polling). */
export async function getMessagesAfter(
  conversationId: string,
  afterIso?: string | null,
): Promise<SupportMessageRow[]> {
  const sb = client()
  if (!sb) return []
  try {
    let q = sb
      .from('support_messages')
      .select('id, role, content, agent_id, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(50)
    if (afterIso) q = q.gt('created_at', afterIso)
    const { data, error } = await q
    if (error || !data) return []
    return data as SupportMessageRow[]
  } catch {
    return []
  }
}
