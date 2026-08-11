'use client'

import { useEffect, useMemo, useState } from 'react'
import { Heart, MessageCircle, Reply, Send } from 'lucide-react'
import type { AdviceIdeasSeedComment } from '@/lib/advice-ideas'

type Comment = AdviceIdeasSeedComment & {
  parentId?: string
}

const STORAGE_NAME = 'opusfesta:comment-name'

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'G'
  )
}

export default function CommentsSection({
  slug,
  seed = [],
}: {
  slug: string
  seed?: Comment[]
}) {
  const seedIds = useMemo(() => new Set(seed.map((c) => c.id)), [seed])
  const userKey = `opusfesta:comments:${slug}`
  const likeKey = `opusfesta:comment-likes:${slug}`

  const [userComments, setUserComments] = useState<Comment[]>([])
  const [liked, setLiked] = useState<Record<string, boolean>>({})
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [replyTarget, setReplyTarget] = useState<Comment | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
    try {
      const stored = localStorage.getItem(userKey)
      if (stored) setUserComments(JSON.parse(stored) as Comment[])
      const likedRaw = localStorage.getItem(likeKey)
      if (likedRaw) setLiked(JSON.parse(likedRaw) as Record<string, boolean>)
      const storedName = localStorage.getItem(STORAGE_NAME)
      if (storedName) setName(storedName)
    } catch {
      // localStorage may be blocked — defaults are fine.
    }
  }, [userKey, likeKey])

  const all: Comment[] = useMemo(
    () => [...userComments, ...seed],
    [userComments, seed],
  )

  const topLevelComments = useMemo(
    () => all.filter((comment) => !comment.parentId),
    [all],
  )

  const repliesByParent = useMemo(() => {
    const map = new Map<string, Comment[]>()
    all.forEach((comment) => {
      if (!comment.parentId) return
      const existing = map.get(comment.parentId) ?? []
      existing.push(comment)
      map.set(comment.parentId, existing)
    })
    return map
  }, [all])

  const persistComments = (next: Comment[], display: string) => {
    setUserComments(next)
    try {
      localStorage.setItem(userKey, JSON.stringify(next))
      if (display !== 'Guest') localStorage.setItem(STORAGE_NAME, display)
    } catch {
      // ignore
    }
  }

  const createComment = (text: string, parentId?: string): Comment => {
    const display = name.trim() || 'Guest'
    return {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: display,
      body: text,
      date: 'Just now',
      likes: 0,
      ...(parentId ? { parentId } : {}),
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    const display = name.trim() || 'Guest'
    const next = [createComment(text), ...userComments]
    persistComments(next, display)
    setBody('')
  }

  const submitReply = (e: React.FormEvent) => {
    e.preventDefault()
    if (!replyTarget) return
    const text = replyBody.trim()
    if (!text) return
    const display = name.trim() || 'Guest'
    const next = [...userComments, createComment(text, replyTarget.id)]
    persistComments(next, display)
    setReplyBody('')
    setReplyTarget(null)
  }

  const toggleLike = (id: string) => {
    const next = { ...liked, [id]: !liked[id] }
    if (!next[id]) delete next[id]
    setLiked(next)
    try {
      localStorage.setItem(likeKey, JSON.stringify(next))
    } catch {
      // ignore
    }
  }

  const total = all.length

  return (
    <section className="mt-14 border-t border-gray-200 pt-10">
      <header className="mb-6 flex items-baseline justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-500">
            Discussion
          </p>
          <h2 className="mt-1 text-[22px] font-bold tracking-tight text-[#1A1A1A] sm:text-[24px]">
            {hydrated && total > 0
              ? `${total} ${total === 1 ? 'thought' : 'thoughts'}`
              : 'Share your thoughts'}
          </h2>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-gray-500">
          <MessageCircle size={14} aria-hidden />
          Be kind
        </span>
      </header>

      {/* Form */}
      <form
        onSubmit={submit}
        className="mb-8 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <div
            aria-hidden
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FAF7F2] text-[12px] font-bold tracking-wide text-[var(--accent-hover)] sm:flex"
          >
            {initialsOf(name)}
          </div>
          <div className="flex-1">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              aria-label="Your name"
              className="mb-3 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[14px] text-[#1A1A1A] outline-none transition-colors focus:border-[var(--accent-hover)]"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Share your thoughts on this story…"
              aria-label="Comment"
              rows={3}
              className="block w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-[14px] leading-relaxed text-[#1A1A1A] outline-none transition-colors focus:border-[var(--accent-hover)]"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[11px] text-gray-500">
                Comments are moderated. No spam, no promotions.
              </p>
              <button data-opus-button="primary" data-opus-button-size="medium"
                type="submit"
                disabled={!body.trim()}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-[var(--on-accent)] transition-colors hover:bg-[var(--accent-hover)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[var(--accent)] disabled:hover:text-[var(--on-accent)]"
              >
                <Send size={14} aria-hidden />
                Post
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* List */}
      {total === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-[#FAFAFA] px-5 py-10 text-center">
          <p className="text-[15px] text-gray-600">
            Be the first to share your thoughts on this story.
          </p>
        </div>
      ) : (
        <ol className="space-y-6">
          {topLevelComments.map((c) => {
            const isLiked = !!liked[c.id]
            const count = c.likes + (isLiked ? 1 : 0)
            const isUser = !seedIds.has(c.id)
            const replies = repliesByParent.get(c.id) ?? []
            const isReplying = replyTarget?.id === c.id
            return (
              <li
                key={c.id}
                className="flex gap-4 border-b border-gray-100 pb-6 last:border-b-0"
              >
                <div
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FAF7F2] text-[12px] font-bold tracking-wide text-[var(--accent-hover)]"
                >
                  {initialsOf(c.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <p className="text-[14px] font-semibold text-[#1A1A1A]">
                      {c.name}
                    </p>
                    <span className="text-[12px] text-gray-500">
                      {c.date}
                    </span>
                    {isUser && (
                      <span className="rounded-full bg-[#FAF7F2] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-hover)]">
                        You
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-[15px] leading-[1.6] text-gray-700">
                    {c.body}
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <button data-opus-button="control"
                      type="button"
                      onClick={() => toggleLike(c.id)}
                      aria-pressed={isLiked}
                      aria-label={isLiked ? 'Unlike comment' : 'Like comment'}
                      className={`inline-flex items-center gap-1.5 text-[12px] font-semibold transition-colors ${
                        isLiked
                          ? 'text-[var(--accent-hover)]'
                          : 'text-gray-500 hover:text-[var(--accent-hover)]'
                      }`}
                    >
                      <Heart
                        size={14}
                        fill={isLiked ? 'currentColor' : 'none'}
                        strokeWidth={isLiked ? 1.5 : 2}
                      />
                      {count > 0 ? count : 'Like'}
                    </button>
                    <button data-opus-button="control"
                      type="button"
                      onClick={() => {
                        setReplyTarget(isReplying ? null : c)
                        setReplyBody('')
                      }}
                      aria-expanded={isReplying}
                      className={`inline-flex items-center gap-1.5 text-[12px] font-semibold transition-colors ${
                        isReplying
                          ? 'text-[var(--accent-hover)]'
                          : 'text-gray-500 hover:text-[var(--accent-hover)]'
                      }`}
                    >
                      <Reply size={14} aria-hidden />
                      Reply
                    </button>
                  </div>

                  {replies.length > 0 && (
                    <ol className="mt-5 space-y-4 border-l border-gray-200 pl-5">
                      {replies.map((reply) => {
                        const replyLiked = !!liked[reply.id]
                        const replyCount = reply.likes + (replyLiked ? 1 : 0)
                        const replyIsUser = !seedIds.has(reply.id)
                        return (
                          <li key={reply.id} className="flex gap-3">
                            <div
                              aria-hidden
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FAF7F2] text-[11px] font-bold tracking-wide text-[var(--accent-hover)]"
                            >
                              {initialsOf(reply.name)}
                            </div>
                            <div className="min-w-0 flex-1 rounded-2xl bg-[#FAFAFA] px-4 py-3">
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <p className="text-[13px] font-semibold text-[#1A1A1A]">
                                  {reply.name}
                                </p>
                                <span className="text-[11px] text-gray-500">
                                  {reply.date}
                                </span>
                                {replyIsUser && (
                                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-hover)]">
                                    You
                                  </span>
                                )}
                              </div>
                              <p className="mt-1.5 whitespace-pre-line text-[14px] leading-[1.6] text-gray-700">
                                {reply.body}
                              </p>
                              <div className="mt-3 flex items-center gap-3">
                                <button data-opus-button="control"
                                  type="button"
                                  onClick={() => toggleLike(reply.id)}
                                  aria-pressed={replyLiked}
                                  aria-label={replyLiked ? 'Unlike reply' : 'Like reply'}
                                  className={`inline-flex items-center gap-1.5 text-[12px] font-semibold transition-colors ${
                                    replyLiked
                                      ? 'text-[var(--accent-hover)]'
                                      : 'text-gray-500 hover:text-[var(--accent-hover)]'
                                  }`}
                                >
                                  <Heart
                                    size={14}
                                    fill={replyLiked ? 'currentColor' : 'none'}
                                    strokeWidth={replyLiked ? 1.5 : 2}
                                  />
                                  {replyCount > 0 ? replyCount : 'Like'}
                                </button>
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ol>
                  )}

                  {isReplying && (
                    <form
                      onSubmit={submitReply}
                      className="mt-4 rounded-2xl border border-gray-200 bg-[#FAFAFA] p-4"
                    >
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                        Replying to {c.name}
                      </p>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        aria-label="Your name"
                        className="mb-3 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[14px] text-[#1A1A1A] outline-none transition-colors focus:border-[var(--accent-hover)]"
                      />
                      <textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        placeholder={`Reply to ${c.name}…`}
                        aria-label={`Reply to ${c.name}`}
                        rows={3}
                        className="block w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-[14px] leading-relaxed text-[#1A1A1A] outline-none transition-colors focus:border-[var(--accent-hover)]"
                      />
                      <div className="mt-3 flex items-center justify-end gap-2">
                        <button data-opus-button="control"
                          type="button"
                          onClick={() => {
                            setReplyTarget(null)
                            setReplyBody('')
                          }}
                          className="rounded-full px-3 py-2 text-[12px] font-semibold text-gray-500 transition-colors hover:text-[#1A1A1A]"
                        >
                          Cancel
                        </button>
                        <button data-opus-button="primary" data-opus-button-size="medium"
                          type="submit"
                          disabled={!replyBody.trim()}
                          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-[var(--on-accent)] transition-colors hover:bg-[var(--accent-hover)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[var(--accent)] disabled:hover:text-[var(--on-accent)]"
                        >
                          <Send size={14} aria-hidden />
                          Reply
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
