import 'server-only'
import { loadFaqContent } from '@/lib/cms/faq'
import { loadPublishedAdviceIdeasPosts } from '@/lib/advice-ideas-db'
import { getAdviceIdeasHref } from '@/lib/advice-ideas'

// Builds a "live context" block appended to Opus's system prompt at request
// time: the current CMS FAQ (authoritative answers) plus the latest Advice &
// Ideas article titles (so Opus can point people to real, current content).
// Both underlying loaders are guarded and fall back to static content, so this
// never throws and never blocks a chat reply.

const MAX_ARTICLES = 12
const TTL_MS = 5 * 60 * 1000 // re-fetch at most every 5 minutes

let cache: { value: string; expires: number } | null = null

async function build(): Promise<string> {
  const [faq, posts] = await Promise.all([
    loadFaqContent().catch(() => null),
    loadPublishedAdviceIdeasPosts().catch(() => []),
  ])

  const parts: string[] = []

  if (faq && faq.items.length > 0) {
    const items = faq.items.map((i) => `Q: ${i.q}\nA: ${i.a}`).join('\n\n')
    parts.push(`# Current FAQ (authoritative, prefer these answers)\n${items}`)
  }

  if (posts.length > 0) {
    const list = posts
      .slice(-MAX_ARTICLES)
      .reverse()
      .map((p) => `- "${p.title}" (${getAdviceIdeasHref(p.slug)})`)
      .join('\n')
    parts.push(
      `# Latest Advice & Ideas articles (link users here when relevant)\n${list}`,
    )
  }

  return parts.join('\n\n')
}

export async function buildOpusLiveContext(): Promise<string> {
  const now = Date.now()
  if (cache && cache.expires > now) return cache.value
  try {
    const value = await build()
    cache = { value, expires: now + TTL_MS }
    return value
  } catch {
    return cache?.value ?? ''
  }
}
