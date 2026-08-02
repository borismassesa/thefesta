import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { runAllSweeps } from '@/lib/commission/sweeper'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// The reconciliation and delivery passes make outbound calls and storage
// round-trips; the platform default would cut them off mid-batch.
export const maxDuration = 60

/**
 * The commission sweeper endpoint.
 * Specs: OP-CCS-TDD-001 §5.4.
 *
 * Everything time-based in the lifecycle runs from here: auto-assign,
 * accept-SLA requeue, auto-approve, the balance chase cadence, forfeiture,
 * Selcom reconciliation, delivery and dormancy.
 *
 * ── Cadence ────────────────────────────────────────────────────────────────
 *
 * The TDD asks for every 5 minutes. Vercel's Hobby plan caps cron at once per
 * day, so this route is deliberately CADENCE-AGNOSTIC: every decision is made
 * from timestamps in the database rather than from "what happened since the
 * last run", and every pass is idempotent. Running daily produces the same end
 * states as running every five minutes — reminders just land later.
 *
 * To get the specified cadence, either move the project to a plan that allows
 * it, or point any external scheduler at this URL with the same bearer token.
 *
 * ── Auth ───────────────────────────────────────────────────────────────────
 *
 * This endpoint transitions orders and moves money forward, so it is guarded
 * by a shared secret compared in constant time. Vercel Cron sends its own
 * Authorization header; an external scheduler sends the same. If the secret is
 * not configured the route refuses to run rather than defaulting open — an
 * unauthenticated endpoint that can forfeit orders is not something to leave
 * to a missing environment variable.
 */

function authorized(req: Request): boolean {
  const secret = process.env.COMMISSION_CRON_SECRET ?? process.env.CRON_SECRET
  if (!secret) return false

  const header = req.headers.get('authorization') ?? ''
  const provided = header.startsWith('Bearer ') ? header.slice(7) : header
  if (!provided) return false

  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

async function handle(req: Request): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const results = await runAllSweeps()

  const totals = results.reduce(
    (acc, r) => ({
      examined: acc.examined + r.examined,
      acted: acc.acted + r.acted,
      errors: acc.errors + r.errors.length,
    }),
    { examined: 0, acted: 0, errors: 0 },
  )

  // Errors are reported, not thrown. A pass failing is worth surfacing, but a
  // non-2xx would make a scheduler retry the whole sweep including the passes
  // that already succeeded.
  if (totals.errors > 0) {
    console.error('[commission-sweeper] completed with errors', JSON.stringify(results))
  }

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    totals,
    passes: results,
  })
}

// GET for Vercel Cron, POST for external schedulers.
export async function GET(req: Request): Promise<NextResponse> {
  return handle(req)
}
export async function POST(req: Request): Promise<NextResponse> {
  return handle(req)
}
