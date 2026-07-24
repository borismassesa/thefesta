import 'server-only'
import { loadFaqContent } from '@/lib/cms/faq'
import { loadPublishedAdviceIdeasPosts } from '@/lib/advice-ideas-db'
import { getAdviceIdeasHref } from '@/lib/advice-ideas'
import { getActiveMarketplaceVendors } from '@/lib/vendors-db'
import { createSupabaseServerClient } from '@/lib/supabase'

// Retrieval-augmented generation for Opus.
//
// We build a small in-memory vector index over the real knowledge base
// (marketplace vendors, Advice & Ideas articles, and the CMS FAQ), embedding
// each document once with OpenAI and caching the result. Per question we embed
// the query and cosine-rank the documents, then feed the top matches to the
// chat model. This lets Opus answer from real data (including specific vendors)
// rather than a static prompt.
//
// It is intentionally in-memory (no pgvector migration): the corpus is small
// and this keeps the feature self-contained. Swapping the store for Supabase
// pgvector later only touches getIndex()/retrieve().

const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small'
const EMBED_URL = 'https://api.openai.com/v1/embeddings'
const INDEX_TTL_MS = 30 * 60 * 1000 // rebuild the index at most every 30 min
const MAX_VENDORS = 200 // bound cold-start embedding cost
const MAX_DOC_CHARS = 1000 // per-document text cap before embedding

export type KnowledgeDoc = {
  id: string
  type: 'vendor' | 'article' | 'faq'
  title: string
  url?: string
  text: string
}

function clip(s: string, n = MAX_DOC_CHARS): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}...` : t
}

async function collectDocs(): Promise<KnowledgeDoc[]> {
  const [vendors, posts, faq] = await Promise.all([
    getActiveMarketplaceVendors().catch(() => []),
    loadPublishedAdviceIdeasPosts().catch(() => []),
    loadFaqContent().catch(() => null),
  ])

  const docs: KnowledgeDoc[] = []

  const cappedVendors = vendors.slice(0, MAX_VENDORS)
  for (const v of cappedVendors) {
    const bits = [
      `${v.name} is a ${v.category} in ${v.city}.`,
      v.excerpt || v.about || '',
      v.services?.length ? `Services: ${v.services.join(', ')}.` : '',
      v.startingPrice || v.priceRange ? `Pricing: ${v.startingPrice || v.priceRange}.` : '',
      v.reviewCount ? `Rated ${v.rating} from ${v.reviewCount} reviews.` : '',
    ].filter(Boolean)
    docs.push({
      id: `vendor:${v.slug}`,
      type: 'vendor',
      title: v.name,
      url: `/vendors/${v.slug}`,
      text: clip(bits.join(' ')),
    })
  }

  for (const p of posts) {
    docs.push({
      id: `article:${p.slug}`,
      type: 'article',
      title: p.title,
      url: getAdviceIdeasHref(p.slug),
      text: clip(`${p.title}. ${p.description || p.excerpt || ''}`),
    })
  }

  if (faq) {
    for (const item of faq.items) {
      docs.push({
        id: `faq:${item.id}`,
        type: 'faq',
        title: item.q,
        text: clip(`Q: ${item.q} A: ${item.a}`),
      })
    }
  }

  return docs
}

async function embed(inputs: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`embeddings ${res.status}: ${detail.slice(0, 200)}`)
  }
  const json = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> }
  // Preserve input order (the API returns an `index` per row).
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding)
}

type Index = { docs: KnowledgeDoc[]; vectors: number[][]; expires: number; vendorCount: number }
let indexCache: Index | null = null
let building: Promise<Index> | null = null

async function buildIndex(apiKey: string): Promise<Index> {
  const docs = await collectDocs()
  const vendorCount = docs.filter((d) => d.type === 'vendor').length
  if (docs.length === 0) {
    return { docs: [], vectors: [], expires: Date.now() + INDEX_TTL_MS, vendorCount: 0 }
  }
  const vectors = await embed(
    docs.map((d) => d.text),
    apiKey,
  )
  return { docs, vectors, expires: Date.now() + INDEX_TTL_MS, vendorCount }
}

async function getIndex(apiKey: string): Promise<Index> {
  if (indexCache && indexCache.expires > Date.now()) return indexCache
  // De-dupe concurrent rebuilds (many chat requests on a cold instance).
  if (!building) {
    building = buildIndex(apiKey)
      .then((idx) => {
        indexCache = idx
        return idx
      })
      .finally(() => {
        building = null
      })
  }
  return building
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

// Persist the whole knowledge base into Supabase pgvector. Called by the
// protected /api/opus/reindex route. Returns the number of chunks upserted.
export async function ingestOpusKnowledge(): Promise<number> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY')
  const docs = await collectDocs()
  if (docs.length === 0) return 0
  const vectors = await embed(
    docs.map((d) => d.text),
    apiKey,
  )
  const sb = createSupabaseServerClient()
  const rows = docs.map((d, i) => ({
    id: d.id,
    source_type: d.type,
    source_id: d.id,
    title: d.title,
    url: d.url ?? null,
    content: d.text,
    embedding: vectors[i],
    updated_at: new Date().toISOString(),
  }))
  // Upsert in batches to stay well under payload limits.
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await sb
      .from('opus_knowledge_chunks')
      .upsert(rows.slice(i, i + 100), { onConflict: 'id' })
    if (error) throw new Error(error.message)
  }
  return rows.length
}

// Query the persistent pgvector store first; fall back to the in-memory index
// if pgvector is empty or unavailable, so retrieval always works.
export async function retrieve(query: string, k = 6): Promise<KnowledgeDoc[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || !query.trim()) return []
  const [qVec] = await embed([query], apiKey)

  try {
    const sb = createSupabaseServerClient()
    const { data, error } = await sb.rpc('match_opus_knowledge', {
      query_embedding: qVec,
      match_count: k,
    })
    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map((r) => ({
        id: r.source_id as string,
        type: r.source_type as KnowledgeDoc['type'],
        title: r.title as string,
        url: (r.url as string) ?? undefined,
        text: r.content as string,
      }))
    }
  } catch {
    // fall through to in-memory
  }

  const index = await getIndex(apiKey)
  if (index.docs.length === 0) return []
  return index.vectors
    .map((vec, i) => ({ doc: index.docs[i], score: cosine(qVec, vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((r) => r.doc)
}

// Formats the top matches into a context block for the system prompt. Returns
// '' on any failure so the chat route can fall back to the static context.
export async function buildOpusRagContext(query: string): Promise<string> {
  try {
    const docs = await retrieve(query)
    if (docs.length === 0) return ''
    const label = { vendor: 'Vendor', article: 'Article', faq: 'FAQ' } as const
    const blocks = docs.map((d) => {
      const head = `[${label[d.type]}] ${d.title}${d.url ? ` (${d.url})` : ''}`
      return `${head}\n${d.text}`
    })
    return `# Relevant OpusFesta knowledge (retrieved for this question)\nUse these real entries to answer. When you mention a vendor or article, link its URL.\n\n${blocks.join('\n\n')}`
  } catch (err) {
    console.warn('[opus] RAG retrieval failed:', err instanceof Error ? err.message : err)
    return ''
  }
}
