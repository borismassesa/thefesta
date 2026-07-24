import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'

export type SupportStatus = 'bot' | 'needs_human' | 'assigned' | 'resolved'
export type SupportFilter = 'attention' | 'open' | 'resolved' | 'all'

export type ConversationListItem = {
  id: string
  status: SupportStatus
  awaiting_staff: boolean
  subject: string | null
  topic: string | null
  contact_name: string | null
  contact_email: string | null
  page_url: string | null
  assignee_name: string | null
  last_message_at: string
  created_at: string
}

export type SupportMessage = {
  id: string
  role: 'user' | 'assistant' | 'agent' | 'system'
  content: string
  created_at: string
  agent_name: string | null
}

export type ConversationDetail = {
  id: string
  status: SupportStatus
  awaiting_staff: boolean
  subject: string | null
  topic: string | null
  escalation_reason: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  page_url: string | null
  locale: string | null
  assigned_to: string | null
  assignee_name: string | null
  created_at: string
  messages: SupportMessage[]
}

export type SupportSummary = { attention: number; open: number; resolved: number; all: number }

export async function getSupportSummary(): Promise<SupportSummary> {
  if (!hasSupabaseAdminConfig()) return { attention: 0, open: 0, resolved: 0, all: 0 }
  const sb = createSupabaseAdminClient()
  const table = () => sb.from('support_conversations').select('id', { count: 'exact', head: true })
  const [attention, open, resolved, all] = await Promise.all([
    table().eq('awaiting_staff', true),
    table().in('status', ['needs_human', 'assigned']),
    table().eq('status', 'resolved'),
    table(),
  ])
  return {
    attention: attention.count ?? 0,
    open: open.count ?? 0,
    resolved: resolved.count ?? 0,
    all: all.count ?? 0,
  }
}

export async function listConversations(
  filter: SupportFilter,
  q: string,
): Promise<ConversationListItem[]> {
  if (!hasSupabaseAdminConfig()) return []
  const sb = createSupabaseAdminClient()
  let query = sb
    .from('support_conversations')
    .select(
      'id, status, awaiting_staff, subject, topic, contact_name, contact_email, page_url, last_message_at, created_at, assignee:assigned_to(full_name)',
    )
    .order('awaiting_staff', { ascending: false })
    .order('last_message_at', { ascending: false })
    .limit(100)

  if (filter === 'attention') query = query.eq('awaiting_staff', true)
  else if (filter === 'open') query = query.in('status', ['needs_human', 'assigned'])
  else if (filter === 'resolved') query = query.eq('status', 'resolved')

  // Strip PostgREST filter metacharacters so a search term cannot break out of
  // the .or() expression (commas/parens/wildcards would alter the filter).
  const safe = q.trim().replace(/[,()*:%\\]/g, '')
  if (safe) {
    const like = `%${safe}%`
    query = query.or(`subject.ilike.${like},contact_name.ilike.${like},contact_email.ilike.${like}`)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => {
    const assignee = r.assignee as { full_name: string } | { full_name: string }[] | null
    const name = Array.isArray(assignee) ? assignee[0]?.full_name : assignee?.full_name
    return {
      id: r.id as string,
      status: r.status as SupportStatus,
      awaiting_staff: r.awaiting_staff as boolean,
      subject: r.subject as string | null,
      topic: r.topic as string | null,
      contact_name: r.contact_name as string | null,
      contact_email: r.contact_email as string | null,
      page_url: r.page_url as string | null,
      assignee_name: name ?? null,
      last_message_at: r.last_message_at as string,
      created_at: r.created_at as string,
    }
  })
}

export type SupportAnalytics = {
  total: number
  last7: number
  botOnly: number
  escalated: number
  resolved: number
  thumbsUp: number
  thumbsDown: number
  totalMessages: number
  topTopics: Array<{ topic: string; count: number }>
}

export async function getSupportAnalytics(): Promise<SupportAnalytics> {
  const empty: SupportAnalytics = {
    total: 0, last7: 0, botOnly: 0, escalated: 0, resolved: 0,
    thumbsUp: 0, thumbsDown: 0, totalMessages: 0, topTopics: [],
  }
  if (!hasSupabaseAdminConfig()) return empty
  const sb = createSupabaseAdminClient()
  const conv = () => sb.from('support_conversations').select('id', { count: 'exact', head: true })
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [total, last7, botOnly, escalated, resolved, messages, feedback, topics] =
    await Promise.all([
      conv(),
      conv().gte('created_at', weekAgo),
      conv().eq('status', 'bot'),
      conv().in('status', ['needs_human', 'assigned', 'resolved']),
      conv().eq('status', 'resolved'),
      sb.from('support_messages').select('id', { count: 'exact', head: true }),
      sb.from('support_feedback').select('rating'),
      sb.from('support_conversations').select('topic').not('topic', 'is', null).limit(1000),
    ])

  const fb = (feedback.data ?? []) as Array<{ rating: string }>
  const topicCounts = new Map<string, number>()
  for (const r of (topics.data ?? []) as Array<{ topic: string }>) {
    topicCounts.set(r.topic, (topicCounts.get(r.topic) ?? 0) + 1)
  }

  return {
    total: total.count ?? 0,
    last7: last7.count ?? 0,
    botOnly: botOnly.count ?? 0,
    escalated: escalated.count ?? 0,
    resolved: resolved.count ?? 0,
    thumbsUp: fb.filter((r) => r.rating === 'up').length,
    thumbsDown: fb.filter((r) => r.rating === 'down').length,
    totalMessages: messages.count ?? 0,
    topTopics: [...topicCounts.entries()]
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
  }
}

export async function getConversationDetail(id: string): Promise<ConversationDetail | null> {
  if (!hasSupabaseAdminConfig()) return null
  const sb = createSupabaseAdminClient()
  const { data: c, error } = await sb
    .from('support_conversations')
    .select(
      'id, status, awaiting_staff, subject, topic, escalation_reason, contact_name, contact_email, contact_phone, page_url, locale, assigned_to, created_at, assignee:assigned_to(full_name)',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!c) return null

  const { data: msgs } = await sb
    .from('support_messages')
    .select('id, role, content, created_at, agent:agent_id(full_name)')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })
    .limit(200)

  const assignee = c.assignee as { full_name: string } | { full_name: string }[] | null
  const assigneeName = Array.isArray(assignee) ? assignee[0]?.full_name : assignee?.full_name

  return {
    id: c.id as string,
    status: c.status as SupportStatus,
    awaiting_staff: c.awaiting_staff as boolean,
    subject: c.subject as string | null,
    topic: c.topic as string | null,
    escalation_reason: c.escalation_reason as string | null,
    contact_name: c.contact_name as string | null,
    contact_email: c.contact_email as string | null,
    contact_phone: c.contact_phone as string | null,
    page_url: c.page_url as string | null,
    locale: c.locale as string | null,
    assigned_to: c.assigned_to as string | null,
    assignee_name: assigneeName ?? null,
    created_at: c.created_at as string,
    messages: (msgs ?? []).map((m) => {
      const agent = m.agent as { full_name: string } | { full_name: string }[] | null
      const agentName = Array.isArray(agent) ? agent[0]?.full_name : agent?.full_name
      return {
        id: m.id as string,
        role: m.role as SupportMessage['role'],
        content: m.content as string,
        created_at: m.created_at as string,
        agent_name: agentName ?? null,
      }
    }),
  }
}
