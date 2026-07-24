import { isAfterHours, notifyStaffOfHandoff } from '@/lib/opus/notify-staff'
import {
  appendMessage,
  escalateConversation,
  getConversation,
  ownsConversation,
  rateLimitOk,
} from '@/lib/opus/support'

// Explicit "talk to a person" handoff. Escalates the conversation, captures any
// contact details the customer left, and alerts staff. Idempotent-ish: safe to
// call more than once.

export const runtime = 'nodejs'

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  return fwd ? fwd.split(',')[0].trim() : 'unknown'
}

function str(v: unknown, max = 500): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
}

export async function POST(request: Request) {
  if (!(await rateLimitOk(`opus-handoff:${clientIp(request)}`, 5, 60))) {
    return Response.json({ error: 'Too many requests.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }
  const b = (body ?? {}) as Record<string, unknown>
  const conversationId = str(b.conversationId, 40)
  if (!conversationId) {
    return Response.json({ error: 'Missing conversationId.' }, { status: 400 })
  }
  const conversation = await getConversation(conversationId)
  if (!conversation) {
    return Response.json({ error: 'Conversation not found.' }, { status: 404 })
  }
  // Only the visitor that owns this conversation can escalate it.
  if (!ownsConversation(conversation, str(b.visitorId, 80))) {
    return Response.json({ error: 'Not found.' }, { status: 404 })
  }

  const name = str(b.name, 120)
  const email = str(b.email, 200)
  const phone = str(b.phone, 40)
  const note = str(b.message, 1000)
  const afterHours = isAfterHours()

  await escalateConversation(conversationId, {
    reason: 'Customer requested a human agent.',
    topic: conversation.topic ?? 'human_request',
    contactName: name,
    contactEmail: email,
    contactPhone: phone,
  })
  if (note) await appendMessage(conversationId, 'user', note, { awaitingStaff: true })

  void notifyStaffOfHandoff({
    conversationId,
    topic: conversation.topic ?? 'human_request',
    reason: 'Customer requested a human agent.',
    lastUserMessage: note ?? conversation.subject,
    contactName: name ?? conversation.contact_name,
    contactEmail: email ?? conversation.contact_email,
    contactPhone: phone ?? conversation.contact_phone,
    afterHours,
  }).catch(() => {})

  return Response.json({ ok: true, afterHours })
}
