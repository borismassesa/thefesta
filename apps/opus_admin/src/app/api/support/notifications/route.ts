import { hasPermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'

// Feeds the header notification bell: the count + a few most-recent Opus
// conversations awaiting a human. Auth-gated to support readers; polled
// client-side so it never adds a query to the global (force-dynamic) layout.

export const runtime = 'nodejs'

export async function GET() {
  if (!(await hasPermission('support.read'))) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!hasSupabaseAdminConfig()) {
    return Response.json({ count: 0, items: [] })
  }
  const sb = createSupabaseAdminClient()
  const { data, count } = await sb
    .from('support_conversations')
    .select('id, subject, topic, last_message_at', { count: 'exact' })
    .eq('awaiting_staff', true)
    .order('last_message_at', { ascending: false })
    .limit(6)

  return Response.json(
    {
      count: count ?? 0,
      items: (data ?? []).map((r) => ({
        id: r.id as string,
        subject: (r.subject as string) ?? null,
        topic: (r.topic as string) ?? null,
        lastMessageAt: r.last_message_at as string,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
