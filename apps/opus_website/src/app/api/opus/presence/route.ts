import { getConversation, getPresence, ownsConversation } from '@/lib/opus/support'
import { DEFAULT_ETA_MINUTES, isAfterHours, nextOpenLabel } from '@/lib/opus/hours'

// Availability for the chat widget: are we staffed right now, when do we open
// next, how fast do we usually reply, and who (if anyone) owns this thread.
// Conversation-specific fields require the owning visitor id; the rest is
// public information (published support hours).

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const conversationId = url.searchParams.get('conversationId')
  const visitorId = url.searchParams.get('visitorId')

  let scopedId: string | null = null
  if (conversationId) {
    const conversation = await getConversation(conversationId)
    // Silently fall back to global presence rather than 404: the widget only
    // wants availability, and a stale conversation id shouldn't hide it.
    if (conversation && ownsConversation(conversation, visitorId)) scopedId = conversationId
  }

  const presence = await getPresence(scopedId)
  const offline = isAfterHours()

  return Response.json(
    {
      online: !offline,
      opensNext: offline ? nextOpenLabel() : null,
      etaMinutes: offline ? null : (presence.etaMinutes ?? DEFAULT_ETA_MINUTES),
      etaMeasured: presence.etaMinutes !== null,
      staffLastSeenAt: presence.staffLastSeenAt,
      agentName: presence.agentName,
      agentLastSeenAt: presence.agentLastSeenAt,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
