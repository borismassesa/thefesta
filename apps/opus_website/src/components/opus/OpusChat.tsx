'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Send, Headset, ThumbsUp, ThumbsDown, Check } from 'lucide-react'
import { OPUS_GREETING } from '@/lib/opus/knowledge'

type Role = 'user' | 'assistant' | 'agent' | 'system'
type Msg = { id?: string; role: Role; content: string; at?: string }
type Mode = 'bot' | 'human' | 'resolved'
type Presence = {
  online: boolean
  opensNext: string | null
  etaMinutes: number | null
  agentName: string | null
  agentLastSeenAt: string | null
  staffLastSeenAt: string | null
}

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hr ago`
  return `${Math.floor(h / 24)} days ago`
}

/** Clock time next to a message, in the reader's own locale and timezone. */
function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

function formatEta(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.round(minutes / 60)
  return h === 1 ? 'an hour' : `${h} hours`
}

/** One plain sentence telling the customer when to expect a human. */
function presenceLine(p: Presence | null): string {
  if (!p) return 'Checking availability...'
  if (p.agentName && p.agentLastSeenAt) return `${p.agentName} replied ${timeAgo(p.agentLastSeenAt)}`
  if (p.agentName) return `${p.agentName} has picked up your request`
  if (!p.online) return `Support is offline. Back ${p.opensNext ?? 'soon'}`
  if (p.etaMinutes) return `Support is online. Usually replies in about ${formatEta(p.etaMinutes)}`
  return 'Support is online'
}

const GREETING: Msg = { role: 'assistant', content: OPUS_GREETING }
const SUGGESTIONS = [
  'How does the wedding website work?',
  'How do I find vendors in my city?',
  'Is OpusFesta free?',
]

const VISITOR_KEY = 'opusfesta:opusVisitorId'
const CONVO_KEY = 'opusfesta:opusConversationId'

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `v_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
  }
}

export default function OpusChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([GREETING])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<Mode>('bot')
  const [handoffOpen, setHandoffOpen] = useState(false)
  const [handoffDone, setHandoffDone] = useState(false)
  const [contact, setContact] = useState({ name: '', email: '', phone: '' })
  const [rated, setRated] = useState<Record<number, 'up' | 'down'>>({})
  const [presence, setPresence] = useState<Presence | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const visitorIdRef = useRef<string>('')
  const convoIdRef = useRef<string | null>(null)
  const lastTsRef = useRef<string | null>(null)
  const restoredRef = useRef(false)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open])

  useEffect(() => {
    if (open && mode !== 'human') inputRef.current?.focus()
  }, [open, mode])

  const persistConvo = useCallback((id: string) => {
    convoIdRef.current = id
    try {
      window.localStorage.setItem(CONVO_KEY, id)
    } catch {
      /* ignore */
    }
  }, [])

  // Restore identity + any existing conversation on first open.
  const restore = useCallback(async () => {
    if (restoredRef.current) return
    restoredRef.current = true
    try {
      let vid = window.localStorage.getItem(VISITOR_KEY)
      if (!vid) {
        vid = newId()
        window.localStorage.setItem(VISITOR_KEY, vid)
      }
      visitorIdRef.current = vid
      const cid = window.localStorage.getItem(CONVO_KEY)
      if (!cid) return
      convoIdRef.current = cid
      const res = await fetch(
        `/api/opus/messages?conversationId=${encodeURIComponent(cid)}&visitorId=${encodeURIComponent(vid)}`,
      )
      if (!res.ok) return
      const data = (await res.json()) as {
        status: Mode | 'needs_human' | 'assigned'
        messages: Array<{ id: string; role: Role; content: string; createdAt: string }>
      }
      if (data.messages.length > 0) {
        setMessages(
          data.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, at: m.createdAt })),
        )
        lastTsRef.current = data.messages[data.messages.length - 1].createdAt
      }
      if (data.status === 'assigned' || data.status === 'needs_human') {
        setMode('human')
        setHandoffDone(true)
      } else if (data.status === 'resolved') {
        setMode('resolved')
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (open) void restore()
  }, [open, restore])

  // Staff availability, so the customer knows whether anyone is around and how
  // long a reply usually takes. Refreshed on open and after a handoff.
  useEffect(() => {
    if (!open) return
    let alive = true
    const load = async () => {
      try {
        const cid = convoIdRef.current
        const qs = cid
          ? `?conversationId=${encodeURIComponent(cid)}&visitorId=${encodeURIComponent(visitorIdRef.current)}`
          : ''
        const res = await fetch(`/api/opus/presence${qs}`)
        if (!res.ok || !alive) return
        setPresence((await res.json()) as Presence)
      } catch {
        /* availability is optional; the widget still works without it */
      }
    }
    void load()
    const timer = setInterval(load, 60000)
    return () => {
      alive = false
      clearInterval(timer)
    }
    // The interval reads convoIdRef live, so a conversation created mid-session
    // is picked up on the next tick without re-running this effect.
  }, [open, mode])

  // Poll for agent replies while a human owns the conversation.
  useEffect(() => {
    if (!open || mode !== 'human' || !convoIdRef.current) return
    let alive = true
    const tick = async () => {
      const cid = convoIdRef.current
      if (!cid) return
      try {
        const after = lastTsRef.current ? `&after=${encodeURIComponent(lastTsRef.current)}` : ''
        const vid = `&visitorId=${encodeURIComponent(visitorIdRef.current)}`
        const res = await fetch(`/api/opus/messages?conversationId=${encodeURIComponent(cid)}${after}${vid}`)
        if (!res.ok || !alive) return
        const data = (await res.json()) as {
          status: string
          messages: Array<{ id: string; role: Role; content: string; createdAt: string }>
        }
        const incoming = data.messages.filter((m) => m.role === 'agent' || m.role === 'system')
        if (incoming.length > 0) {
          setMessages((prev) => {
            const seen = new Set(prev.map((p) => p.id).filter(Boolean))
            const add = incoming.filter((m) => !seen.has(m.id))
            return add.length
              ? [...prev, ...add.map((m) => ({ id: m.id, role: m.role, content: m.content, at: m.createdAt }))]
              : prev
          })
        }
        if (data.messages.length > 0) {
          lastTsRef.current = data.messages[data.messages.length - 1].createdAt
        }
        if (data.status === 'resolved') setMode('resolved')
      } catch {
        /* ignore */
      }
    }
    const timer = setInterval(tick, 4000)
    void tick()
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [open, mode])

  async function send(text: string) {
    const question = text.trim()
    if (!question || busy) return
    setInput('')
    const history = messages.filter((m) => !(m === GREETING) && (m.role === 'user' || m.role === 'assistant'))
    const sentAt = new Date().toISOString()
    const outgoing: Msg[] = [...messages, { role: 'user', content: question, at: sentAt }]

    // In human mode we just deliver the message; agent replies arrive via poll.
    if (mode === 'human') {
      setMessages(outgoing)
      setBusy(true)
      try {
        await fetch('/api/opus/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: question }],
            conversationId: convoIdRef.current,
            visitorId: visitorIdRef.current,
          }),
        })
      } catch {
        /* delivered best-effort; poll will reconcile */
      } finally {
        setBusy(false)
      }
      return
    }

    setMessages([...outgoing, { role: 'assistant', content: '', at: new Date().toISOString() }])
    setBusy(true)
    try {
      const res = await fetch('/api/opus/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...history, { role: 'user', content: question }],
          conversationId: convoIdRef.current,
          visitorId: visitorIdRef.current,
          pageUrl: window.location.pathname,
          locale: document.documentElement.lang || undefined,
        }),
      })
      if (!res.ok || !res.body) {
        const { error } = await res.json().catch(() => ({ error: '' }))
        throw new Error(error || 'request failed')
      }
      const cid = res.headers.get('x-opus-conversation-id')
      if (cid) persistConvo(cid)
      const respMode = res.headers.get('x-opus-mode')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        setMessages((prev) => {
          const copy = [...prev]
          copy[copy.length - 1] = { ...copy[copy.length - 1], role: 'assistant', content: acc }
          return copy
        })
      }
      if (!acc.trim()) throw new Error('empty response')

      // Guardrail escalated this thread to a human.
      if (respMode === 'escalated') {
        lastTsRef.current = new Date().toISOString()
        setMode('human')
        setHandoffDone(true)
      }
    } catch (err) {
      console.error('[opus] chat error:', err)
      setMessages((prev) => {
        const copy = [...prev]
        copy[copy.length - 1] = {
          ...copy[copy.length - 1],
          role: 'assistant',
          content:
            "Sorry, I'm having trouble responding right now. Please try again, or tap 'Talk to a person'.",
        }
        return copy
      })
    } finally {
      setBusy(false)
    }
  }

  async function submitHandoff() {
    const cid = convoIdRef.current
    setHandoffOpen(false)
    try {
      const res = await fetch('/api/opus/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: cid,
          visitorId: visitorIdRef.current,
          name: contact.name || undefined,
          email: contact.email || undefined,
          phone: contact.phone || undefined,
        }),
      })
      // The route answers 429/400/404 without rejecting the fetch, so check the
      // status before telling the customer a human was notified.
      if (!res.ok) throw new Error('handoff failed')
      const data = (await res.json().catch(() => ({}))) as { afterHours?: boolean }
      lastTsRef.current = new Date().toISOString()
      setMode('human')
      setHandoffDone(true)
      setMessages((prev) => [
        ...prev,
        {
          role: 'system',
          content: data.afterHours
            ? `Thanks. We're offline right now, but our team will follow up ${presence?.opensNext ?? 'as soon as we are back'}. You can keep typing here.`
            : presence?.etaMinutes
              ? `Thanks. A member of our team has been notified and usually replies within ${formatEta(presence.etaMinutes)}.`
              : 'Thanks. A member of our team has been notified and will reply right here.',
        },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'system', content: 'We could not reach the team just now. Please try again shortly.' },
      ])
    }
  }

  async function rate(index: number, rating: 'up' | 'down') {
    if (rated[index]) return
    setRated((r) => ({ ...r, [index]: rating }))
    try {
      await fetch('/api/opus/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: convoIdRef.current,
          visitorId: visitorIdRef.current,
          rating,
        }),
      })
    } catch {
      /* best-effort */
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const showSuggestions = messages.length === 1 && mode === 'bot' && !busy

  return (
    <>
      <button data-opus-button="control"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close Opus assistant' : 'Open Opus assistant'}
        aria-expanded={open}
        className="group fixed bottom-5 right-5 z-[60] flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-white to-[#F3F0EA] ring-1 ring-black/5 transition-all duration-200 hover:scale-105 active:scale-95"
        style={{ boxShadow: '0 12px 32px -10px rgba(201,160,220,0.55), 0 4px 14px rgba(0,0,0,0.10)' }}
      >
        {open ? (
          <X className="h-6 w-6 text-[#1A1A1A]" />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/logo/opusfesta-mark.png"
              alt=""
              className="h-9 w-9 object-contain transition-transform duration-200 group-hover:scale-110"
            />
            {/* Online / available indicator */}
            <span className="absolute right-1.5 top-1.5 h-3 w-3 rounded-full bg-[#9FE870] ring-2 ring-white" />
          </>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Opus assistant"
          // Lenis smooth-scrolls the page and swallows wheel events, which left
          // the transcript scrollable only by dragging its scrollbar.
          data-lenis-prevent
          className="fixed bottom-24 right-5 z-[60] flex h-[70vh] max-h-[600px] w-[calc(100vw-2.5rem)] max-w-[380px] flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-2xl shadow-black/20"
        >
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/logo/opusfesta-mark.png" alt="OpusFesta" className="h-9 w-9 object-contain" />
            <div className="leading-tight">
              <p className="text-sm font-bold text-[#1A1A1A]">Opus</p>
              <p className="text-xs text-gray-400">
                {mode === 'bot' ? 'OpusFesta assistant' : mode === 'resolved' ? 'Conversation resolved' : 'Connected to support'}
              </p>
            </div>
            <button data-opus-button="control"
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="ml-auto rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Status bar / handoff entry */}
          {mode === 'bot' ? (
            <button data-opus-button="control"
              type="button"
              onClick={() => setHandoffOpen(true)}
              className="flex w-full items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-left hover:bg-gray-100"
            >
              <Headset className="h-4 w-4 shrink-0 text-gray-500" />
              <span className="flex-1 text-xs font-semibold text-gray-700">Talk to a person</span>
              <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <StatusDot online={presence?.online ?? false} />
                {presence ? (presence.online ? 'Online' : 'Offline') : ''}
              </span>
            </button>
          ) : mode === 'human' ? (
            <div className="flex items-start gap-2 border-b border-gray-100 bg-[#F0DFF6] px-4 py-2.5">
              <Headset className="mt-0.5 h-4 w-4 shrink-0 text-[#7E5896]" />
              <div className="min-w-0 leading-tight">
                <p className="text-xs font-bold text-[#7E5896]">A team member will reply here</p>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#7E5896]/80">
                  <StatusDot online={presence?.online ?? false} />
                  {presenceLine(presence)}
                </p>
              </div>
            </div>
          ) : null}

          {/* Transcript */}
          <div
            ref={scrollRef}
            data-lenis-prevent
            className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
          >
            {messages.map((m, i) => {
              const isUser = m.role === 'user'
              const isAgent = m.role === 'agent'
              const isSystem = m.role === 'system'
              if (isSystem) {
                return (
                  <p key={i} className="px-2 text-center text-[11px] leading-relaxed text-gray-400">
                    {m.content}
                  </p>
                )
              }
              const canRate = m.role === 'assistant' && m.content.trim() !== '' && i !== 0 && !busy
              return (
                <div key={i} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  <div className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'} w-full`}>
                    {!isUser && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src="/assets/logo/opusfesta-mark.png"
                        alt={isAgent ? 'Support' : 'Opus'}
                        className="h-6 w-6 shrink-0 object-contain"
                      />
                    )}
                    <div
                      className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        isUser
                          ? 'rounded-br-md bg-[#1A1A1A] text-white'
                          : isAgent
                            ? 'rounded-bl-md bg-[#F0DFF6] text-[#4a2f57]'
                            : 'rounded-bl-md bg-gray-100 text-[#1A1A1A]'
                      }`}
                    >
                      {isAgent && (
                        <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-[#7E5896]">
                          Support
                        </span>
                      )}
                      {m.content ? (
                        isUser ? (
                          m.content
                        ) : (
                          <RichText text={m.content} />
                        )
                      ) : (
                        <span className="inline-flex gap-1 py-1">
                          <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
                        </span>
                      )}
                    </div>
                  </div>
                  {(m.at || canRate) && (
                    <div
                      className={`mt-1 flex items-center gap-1 ${isUser ? 'justify-end pr-1' : 'pl-8'}`}
                    >
                      {m.at && (
                        <time dateTime={m.at} className="text-[10px] text-gray-400">
                          {formatTime(m.at)}
                        </time>
                      )}
                      {canRate &&
                        (rated[i] ? (
                          <span className="ml-1 inline-flex items-center gap-1 text-[10px] text-gray-400">
                            <Check className="h-3 w-3" /> Thanks for the feedback
                          </span>
                        ) : (
                          <>
                            <button data-opus-button="control"
                              type="button"
                              onClick={() => rate(i, 'up')}
                              aria-label="Helpful"
                              className="rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-600"
                            >
                              <ThumbsUp className="h-3.5 w-3.5" />
                            </button>
                            <button data-opus-button="control"
                              type="button"
                              onClick={() => rate(i, 'down')}
                              aria-label="Not helpful"
                              className="rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-600"
                            >
                              <ThumbsDown className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ))}
                    </div>
                  )}
                </div>
              )
            })}

            {showSuggestions && (
              <div className="flex flex-col items-start gap-2 pl-8 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button data-opus-button="control"
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full border border-gray-200 px-3 py-1.5 text-left text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Composer or handoff form */}
          {handoffOpen ? (
            <div className="space-y-2 border-t border-gray-100 p-3">
              <p className="text-xs font-semibold text-[#1A1A1A]">Talk to a person</p>
              <p className="text-[11px] leading-relaxed text-gray-500">
                Leave your details (optional) so we can reach you if you step away.
              </p>
              <input
                value={contact.name}
                onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))}
                placeholder="Your name"
                className="w-full rounded-xl bg-gray-100 px-3 py-2 text-sm text-[#1A1A1A] outline-none placeholder:text-gray-400"
              />
              <input
                value={contact.email}
                onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                placeholder="Email"
                type="email"
                className="w-full rounded-xl bg-gray-100 px-3 py-2 text-sm text-[#1A1A1A] outline-none placeholder:text-gray-400"
              />
              <input
                value={contact.phone}
                onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
                placeholder="WhatsApp number"
                className="w-full rounded-xl bg-gray-100 px-3 py-2 text-sm text-[#1A1A1A] outline-none placeholder:text-gray-400"
              />
              <div className="flex gap-2">
                <button data-opus-button="primary" data-opus-button-size="medium"
                  type="button"
                  onClick={submitHandoff}
                  className="flex-1 rounded-full bg-[#1A1A1A] py-2 text-sm font-bold text-white hover:bg-[#333]"
                >
                  Connect me
                </button>
                <button data-opus-button="control"
                  type="button"
                  onClick={() => setHandoffOpen(false)}
                  className="rounded-full px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="border-t border-gray-100 p-3">
              <div className="flex items-end gap-2 rounded-2xl bg-gray-100 px-3 py-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={1}
                  placeholder={mode === 'human' ? 'Message the team...' : 'Ask Opus anything...'}
                  className="max-h-28 flex-1 resize-none bg-transparent text-sm text-[#1A1A1A] outline-none placeholder:text-gray-400"
                />
                <button data-opus-button="control"
                  type="button"
                  onClick={() => send(input)}
                  disabled={busy || !input.trim()}
                  aria-label="Send message"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1A1A1A] text-white transition-opacity disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-center text-[10px] text-gray-400">
                {mode === 'human'
                  ? 'You are chatting with the OpusFesta team.'
                  : 'Opus can make mistakes. Verify important details.'}
              </p>
            </div>
          )}
        </div>
      )}
    </>
  )
}

// Minimal, safe rich-text: renders **bold**, [label](url) and bare http(s)
// links (internal links open in the same tab, external in a new one) while
// preserving line breaks. No dependency, no dangerouslySetInnerHTML.
const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s)]+)/g

function Anchor({ href, children }: { href: string; children: React.ReactNode }) {
  const external = /^https?:\/\//i.test(href)
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className="font-semibold text-[#7E5896] underline underline-offset-2 hover:text-[#5f4270]"
    >
      {children}
    </a>
  )
}

function parseInline(line: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  INLINE.lastIndex = 0
  let key = 0
  while ((m = INLINE.exec(line)) !== null) {
    if (m.index > last) out.push(line.slice(last, m.index))
    if (m[1] !== undefined) {
      out.push(<strong key={key++}>{m[1]}</strong>)
    } else if (m[2] !== undefined && m[3] !== undefined) {
      out.push(
        <Anchor key={key++} href={m[3]}>
          {m[2]}
        </Anchor>,
      )
    } else if (m[4] !== undefined) {
      out.push(
        <Anchor key={key++} href={m[4]}>
          {m[4]}
        </Anchor>,
      )
    }
    last = m.index + m[0].length
  }
  if (last < line.length) out.push(line.slice(last))
  return out
}

function RichText({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {parseInline(line)}
          {i < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </>
  )
}

/** Availability dot: green when staffed, amber when outside support hours. */
function StatusDot({ online }: { online: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${online ? 'bg-[#4CAF50]' : 'bg-amber-400'}`}
    />
  )
}

function Dot({ delay = '0ms' }: { delay?: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
      style={{ animationDelay: delay }}
    />
  )
}
