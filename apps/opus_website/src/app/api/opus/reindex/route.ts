import { ingestOpusKnowledge } from '@/lib/opus/rag'

// Rebuilds the Opus pgvector knowledge base (vendors + articles + FAQ).
// Protected by a bearer secret; intended to be called on a schedule (e.g. a
// cron) or after major content changes.

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const secret = process.env.OPUS_REINDEX_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const chunks = await ingestOpusKnowledge()
    return Response.json({ ok: true, chunks })
  } catch (err) {
    console.error('[opus] reindex failed:', err)
    return Response.json({ error: 'reindex_failed' }, { status: 500 })
  }
}
