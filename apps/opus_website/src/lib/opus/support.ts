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

// ---------------------------------------------------------------------------
// Presence: what the customer is told about staff availability.
// ---------------------------------------------------------------------------

export type SupportPresence = {
  /** Most recent agent reply anywhere, i.e. "the team was last active then". */
  staffLastSeenAt: string | null
  /** The agent who owns this conversation, if one has been assigned. */
  agentName: string | null
  /** Last agent reply in THIS conversation. */
  agentLastSeenAt: string | null
  /** Measured median first-reply time, in minutes. Null when we have no data. */
  etaMinutes: number | null
}

type Cached<T> = { at: number; value: T }
let staffSeenCache: Cached<string | null> | null = null
let etaCache: Cached<number | null> | null = null

const STAFF_SEEN_TTL = 60_000
const ETA_TTL = 15 * 60_000

/** Timestamp of the newest agent reply across all conversations. */
async function staffLastSeen(sb: SupabaseClient): Promise<string | null> {
  if (staffSeenCache && Date.now() - staffSeenCache.at < STAFF_SEEN_TTL) return staffSeenCache.value
  let value: string | null = null
  try {
    const { data } = await sb
      .from('support_messages')
      .select('created_at')
      .eq('role', 'agent')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    value = (data?.created_at as string) ?? null
  } catch {
    /* leave null */
  }
  staffSeenCache = { at: Date.now(), value }
  return value
}

/**
 * Median minutes between a conversation's creation and its first agent reply,
 * over recent human-handled conversations. Cached: this is two queries and the
 * answer only needs to be roughly right.
 */
async function medianFirstReplyMinutes(sb: SupabaseClient): Promise<number | null> {
  if (etaCache && Date.now() - etaCache.at < ETA_TTL) return etaCache.value
  let value: number | null = null
  try {
    const { data: convos } = await sb
      .from('support_conversations')
      .select('id, created_at')
      .in('status', ['assigned', 'resolved'])
      .order('created_at', { ascending: false })
      .limit(30)
    const ids = (convos ?? []).map((c) => c.id as string)
    if (ids.length > 0) {
      const { data: msgs } = await sb
        .from('support_messages')
        .select('conversation_id, created_at')
        .in('conversation_id', ids)
        .eq('role', 'agent')
        .order('created_at', { ascending: true })
      const firstReply = new Map<string, string>()
      for (const m of msgs ?? []) {
        const cid = m.conversation_id as string
        if (!firstReply.has(cid)) firstReply.set(cid, m.created_at as string)
      }
      const deltas: number[] = []
      for (const c of convos ?? []) {
        const reply = firstReply.get(c.id as string)
        if (!reply) continue
        const mins = (new Date(reply).getTime() - new Date(c.created_at as string).getTime()) / 60000
        if (mins >= 0 && mins < 60 * 24) deltas.push(mins)
      }
      if (deltas.length >= 3) {
        deltas.sort((a, b) => a - b)
        value = Math.max(1, Math.round(deltas[Math.floor(deltas.length / 2)]))
      }
    }
  } catch {
    /* leave null */
  }
  etaCache = { at: Date.now(), value }
  return value
}

/**
 * Availability signals for the chat widget. Best-effort: any failure degrades
 * to nulls and the widget falls back to the published support hours.
 */
export async function getPresence(conversationId?: string | null): Promise<SupportPresence> {
  const empty: SupportPresence = {
    staffLastSeenAt: null,
    agentName: null,
    agentLastSeenAt: null,
    etaMinutes: null,
  }
  const sb = client()
  if (!sb) return empty
  try {
    const [staffSeen, eta] = await Promise.all([staffLastSeen(sb), medianFirstReplyMinutes(sb)])
    const presence: SupportPresence = { ...empty, staffLastSeenAt: staffSeen, etaMinutes: eta }
    if (!conversationId) return presence

    const [{ data: convo }, { data: lastAgentMsg }] = await Promise.all([
      sb.from('support_conversations').select('assigned_to').eq('id', conversationId).maybeSingle(),
      sb
        .from('support_messages')
        .select('created_at')
        .eq('conversation_id', conversationId)
        .eq('role', 'agent')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    presence.agentLastSeenAt = (lastAgentMsg?.created_at as string) ?? null
    const assignedTo = convo?.assigned_to as string | null | undefined
    if (assignedTo) {
      const { data: employee } = await sb
        .from('workforce_employees')
        .select('full_name')
        .eq('id', assignedTo)
        .maybeSingle()
      // First name only: enough to feel human without exposing staff surnames.
      const full = (employee?.full_name as string | undefined)?.trim()
      presence.agentName = full ? full.split(/\s+/)[0] : null
    }
    return presence
  } catch {
    return empty
  }
}

/**
 * Conversations where a customer is waiting on a human and nobody has replied
 * for at least `minMinutes`. Drives the unattended-conversation nudge.
 */
export async function listUnattended(
  minMinutes: number,
  limit = 20,
): Promise<Array<SupportConversationRow & { last_message_at: string }>> {
  const sb = client()
  if (!sb) return []
  try {
    const cutoff = new Date(Date.now() - minMinutes * 60_000).toISOString()
    const { data } = await sb
      .from('support_conversations')
      .select(
        'id, status, awaiting_staff, visitor_id, user_id, contact_name, contact_email, contact_phone, subject, topic, page_url, locale, last_message_at',
      )
      .eq('awaiting_staff', true)
      .in('status', ['needs_human', 'assigned'])
      .lt('last_message_at', cutoff)
      .order('last_message_at', { ascending: true })
      .limit(limit)
    return (data ?? []) as Array<SupportConversationRow & { last_message_at: string }>
  } catch {
    return []
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
