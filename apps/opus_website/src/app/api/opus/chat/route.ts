import { OPUS_SYSTEM_PROMPT } from '@/lib/opus/knowledge'
import { buildOpusLiveContext } from '@/lib/opus/context'
import { buildOpusRagContext } from '@/lib/opus/rag'
import { checkEscalation, escalationReply } from '@/lib/opus/guardrails'
import { DEFAULT_ETA_MINUTES, isAfterHours, nextOpenLabel } from '@/lib/opus/hours'
import { notifyStaffOfHandoff } from '@/lib/opus/notify-staff'
import { getAuthedContext, OPUS_TOOLS, runTool } from '@/lib/opus/tools'
import {
  appendMessage,
  attachIdentity,
  createConversation,
  escalateConversation,
  getConversation,
  getPresence,
  rateLimitOk,
} from '@/lib/opus/support'

// Opus chat endpoint. Streams a reply from OpenAI back to the browser as plain
// UTF-8 text chunks. Also persists the conversation, rate-limits abuse, and
// routes high-stakes topics / human requests to a live agent instead of letting
// the model improvise (the Air Canada lesson).

// Node runtime: reads the CMS/DB via the Supabase server client (server-only).
export const runtime = 'nodejs'

type ClientMessage = { role: 'user' | 'assistant'; content: string }

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const MAX_MESSAGES = 20 // most recent turns we forward
const MAX_CHARS = 2000 // per-message cap
const RATE_MAX = 20 // messages per window per IP
const RATE_WINDOW = 60 // seconds

function sanitize(messages: unknown): ClientMessage[] {
  if (!Array.isArray(messages)) return []
  const cleaned: ClientMessage[] = []
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue
    const role = (m as { role?: unknown }).role
    const content = (m as { content?: unknown }).content
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') continue
    const text = content.trim().slice(0, MAX_CHARS)
    if (!text) continue
    cleaned.push({ role, content: text })
  }
  return cleaned.slice(-MAX_MESSAGES)
}

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  return fwd ? fwd.split(',')[0].trim() : 'unknown'
}

function str(v: unknown, max = 500): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
}

// A short text stream (used for escalation / human-mode acknowledgements).
function textStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    },
  })
}

function streamHeaders(conversationId: string | null, mode: string): HeadersInit {
  return {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'x-opus-mode': mode,
    ...(conversationId ? { 'x-opus-conversation-id': conversationId } : {}),
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return Response.json(
      { error: 'Opus is not configured yet. Missing OPENAI_API_KEY.' },
      { status: 503 },
    )
  }

  // Rate limit by IP (fails open on infra error).
  const ip = clientIp(request)
  if (!(await rateLimitOk(`opus-chat:${ip}`, RATE_MAX, RATE_WINDOW))) {
    return Response.json(
      { error: 'You are sending messages too quickly. Please wait a moment.' },
      { status: 429 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const b = (body ?? {}) as Record<string, unknown>
  const messages = sanitize(b.messages)
  if (messages.length === 0) {
    return Response.json({ error: 'No message provided.' }, { status: 400 })
  }
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''

  // Resolve or create the persisted conversation.
  let conversationId = str(b.conversationId, 40)
  const visitorId = str(b.visitorId, 80)
  const pageUrl = str(b.pageUrl, 500)
  const locale = str(b.locale, 10)

  // Resolve the signed-in customer once (used for both conversation identity
  // and the account tools below), so a logged-in chat is attributed to them
  // instead of "Anonymous visitor".
  const authedCtx = await getAuthedContext()

  let conversation = conversationId ? await getConversation(conversationId) : null
  if (!conversation) {
    conversationId = await createConversation({
      userId: authedCtx?.usersId ?? null,
      visitorId,
      subject: lastUserMessage,
      pageUrl,
      locale,
      contactName: authedCtx?.name ?? null,
      contactEmail: authedCtx?.email ?? null,
      contactPhone: authedCtx?.phone ?? null,
    })
    conversation = conversationId ? await getConversation(conversationId) : null
  } else if (authedCtx && conversationId) {
    // Existing conversation: backfill identity if it started anonymous, then
    // refresh so downstream staff alerts carry the customer's details.
    await attachIdentity(conversationId, {
      userId: authedCtx.usersId,
      name: authedCtx.name,
      email: authedCtx.email,
      phone: authedCtx.phone,
    })
    conversation = await getConversation(conversationId)
  }

  // Persist the customer's message.
  if (conversationId) {
    await appendMessage(conversationId, 'user', lastUserMessage, {
      awaitingStaff: conversation && conversation.status !== 'bot' ? true : undefined,
    })
  }

  // Human mode: a person owns this conversation. Do not let the AI answer.
  if (conversation && conversation.status !== 'bot') {
    if (conversationId && (await rateLimitOk(`opus-notify:${conversationId}`, 1, 300))) {
      void notifyStaffOfHandoff({
        conversationId,
        topic: conversation.topic,
        reason: 'New customer message while awaiting a human.',
        lastUserMessage,
        contactName: conversation.contact_name,
        contactEmail: conversation.contact_email,
        contactPhone: conversation.contact_phone,
        afterHours: isAfterHours(),
      }).catch(() => {})
    }
    return new Response(
      textStream("Thanks, our team has your message and will reply right here."),
      { headers: streamHeaders(conversationId, 'human') },
    )
  }

  // Guardrail: high-stakes topic or explicit human request -> escalate, do not
  // let the model make commitments.
  const escalation = checkEscalation(lastUserMessage)
  if (escalation.escalate) {
    const afterHours = isAfterHours()
    const presence = await getPresence(conversationId)
    const reply = escalationReply(escalation, {
      afterHours,
      opensNext: afterHours ? nextOpenLabel() : null,
      etaMinutes: presence.etaMinutes ?? DEFAULT_ETA_MINUTES,
    })
    if (conversationId) {
      await escalateConversation(conversationId, {
        reason: escalation.reason,
        topic: escalation.topic,
      })
      await appendMessage(conversationId, 'assistant', reply)
      void notifyStaffOfHandoff({
        conversationId,
        topic: escalation.topic,
        reason: escalation.reason,
        lastUserMessage,
        contactName: conversation?.contact_name ?? null,
        contactEmail: conversation?.contact_email ?? null,
        contactPhone: conversation?.contact_phone ?? null,
        afterHours,
      }).catch(() => {})
    }
    return new Response(textStream(reply), {
      headers: streamHeaders(conversationId, 'escalated'),
    })
  }

  // Normal bot path: retrieve real knowledge (RAG), fall back to static context.
  let context = await buildOpusRagContext(lastUserMessage).catch(() => '')
  if (!context) context = await buildOpusLiveContext().catch(() => '')
  const systemContent = context ? `${OPUS_SYSTEM_PROMPT}\n\n${context}` : OPUS_SYSTEM_PROMPT

  // Action tools: for a signed-in user, let the model look up their OWN account
  // data (scoped server-side to their Clerk email). A first non-streaming pass
  // resolves any tool calls; results are fed back and the final answer streams.
  const baseMessages: unknown[] = [{ role: 'system', content: systemContent }, ...messages]
  let finalMessages = baseMessages
  if (authedCtx) {
    try {
      const firstRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.4,
          max_tokens: 700,
          tools: OPUS_TOOLS,
          tool_choice: 'auto',
          messages: baseMessages,
        }),
      })
      if (firstRes.ok) {
        const json = await firstRes.json()
        const msg = json?.choices?.[0]?.message
        const toolCalls = msg?.tool_calls
        if (Array.isArray(toolCalls) && toolCalls.length > 0) {
          const toolMsgs = []
          for (const tc of toolCalls.slice(0, 4)) {
            let args: unknown = {}
            try {
              args = JSON.parse(tc?.function?.arguments || '{}')
            } catch {
              /* ignore malformed args */
            }
            const result = await runTool(tc?.function?.name, args, authedCtx)
            toolMsgs.push({ role: 'tool', tool_call_id: tc.id, content: result })
          }
          finalMessages = [...baseMessages, msg, ...toolMsgs]
        } else if (typeof msg?.content === 'string' && msg.content.trim()) {
          // Model answered without needing a tool; stream the content directly.
          if (conversationId) void appendMessage(conversationId, 'assistant', msg.content).catch(() => {})
          return new Response(textStream(msg.content), {
            headers: streamHeaders(conversationId, 'bot'),
          })
        }
      }
    } catch (err) {
      console.error('[opus] tool pass failed:', err)
      // Fall through to the normal streaming answer without tools.
    }
  }

  let upstream: Response
  try {
    upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        temperature: 0.5,
        max_tokens: 700,
        messages: finalMessages,
      }),
    })
  } catch (err) {
    console.error('[opus] upstream fetch failed:', err)
    return Response.json({ error: 'Could not reach the assistant.' }, { status: 502 })
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '')
    console.error('[opus] OpenAI error', upstream.status, detail)
    return Response.json({ error: 'The assistant is unavailable right now.' }, { status: 502 })
  }

  // Transform OpenAI's SSE stream into plain text deltas, accumulating the full
  // answer so we can persist it once the stream closes.
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const reader = upstream.body.getReader()
  let buffer = ''
  let assistantText = ''

  const persistOnce = () => {
    if (conversationId && assistantText.trim()) {
      void appendMessage(conversationId, 'assistant', assistantText).catch(() => {})
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) {
        persistOnce()
        controller.close()
        return
      }
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') {
          persistOnce()
          controller.close()
          return
        }
        try {
          const json = JSON.parse(data)
          const delta = json?.choices?.[0]?.delta?.content
          if (typeof delta === 'string' && delta) {
            assistantText += delta
            controller.enqueue(encoder.encode(delta))
          }
        } catch {
          // Ignore keep-alive / non-JSON lines.
        }
      }
    },
    cancel() {
      reader.cancel().catch(() => {})
    },
  })

  return new Response(stream, { headers: streamHeaders(conversationId, 'bot') })
}
