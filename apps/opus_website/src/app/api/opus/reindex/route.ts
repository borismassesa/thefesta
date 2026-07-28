import { ingestOpusKnowledge } from '@/lib/opus/rag'

// Rebuilds the Opus pgvector knowledge base (vendors + articles + FAQ).
//
// - POST with `Authorization: Bearer <OPUS_REINDEX_SECRET>` for a manual trigger.
// - GET is used by the Vercel Cron in vercel.json; Vercel signs cron requests
//   with `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set. Either
//   secret is accepted.

export const runtime = 'nodejs'
export const maxDuration = 60

function authorized(request: Request): boolean {
  const header = request.headers.get('authorization')
  const secrets = [process.env.OPUS_REINDEX_SECRET, process.env.CRON_SECRET].filter(Boolean)
  return secrets.length > 0 && secrets.some((s) => header === `Bearer ${s}`)
}

async function run(request: Request): Promise<Response> {
  if (!authorized(request)) {
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

export async function POST(request: Request) {
  return run(request)
}

export async function GET(request: Request) {
  return run(request)
}
