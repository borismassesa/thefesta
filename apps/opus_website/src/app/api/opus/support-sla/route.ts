import { listUnattended, rateLimitOk } from '@/lib/opus/support'
import { isAfterHours } from '@/lib/opus/hours'
import { notifyStaffOfHandoff } from '@/lib/opus/notify-staff'

// Unattended-conversation nudge. The immediate handoff alert can be missed, so
// this sweeps for customers still waiting on a human and re-pages staff.
//
// Driven by the Vercel Cron in vercel.json (signed with CRON_SECRET); a manual
// run is possible with OPUS_REINDEX_SECRET. Each conversation is nudged at most
// once every NUDGE_COOLDOWN_MINUTES so staff are reminded, not spammed.

export const runtime = 'nodejs'
export const maxDuration = 60

const WAITING_MINUTES = 15
const NUDGE_COOLDOWN_MINUTES = 60

function authorized(request: Request): boolean {
  const header = request.headers.get('authorization')
  const secrets = [process.env.CRON_SECRET, process.env.OPUS_REINDEX_SECRET].filter(Boolean)
  return secrets.length > 0 && secrets.some((s) => header === `Bearer ${s}`)
}

async function run(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const waiting = await listUnattended(WAITING_MINUTES)
  const afterHours = isAfterHours()
  let nudged = 0

  // `?dryRun=1` reports what would be paged without emailing anyone. Handy for
  // checking the sweep after a config change.
  if (new URL(request.url).searchParams.get('dryRun')) {
    return Response.json({
      ok: true,
      dryRun: true,
      afterHours,
      waiting: waiting.map((c) => ({
        id: c.id,
        status: c.status,
        topic: c.topic,
        waitingMinutes: Math.round(
          (Date.now() - new Date(c.last_message_at).getTime()) / 60_000,
        ),
      })),
    })
  }

  for (const convo of waiting) {
    // rateLimitOk doubles as the per-conversation cooldown ledger.
    const fresh = await rateLimitOk(
      `opus-sla:${convo.id}`,
      1,
      NUDGE_COOLDOWN_MINUTES * 60,
    )
    if (!fresh) continue
    const minutes = Math.round(
      (Date.now() - new Date(convo.last_message_at).getTime()) / 60_000,
    )
    await notifyStaffOfHandoff({
      conversationId: convo.id,
      topic: convo.topic,
      reason: 'No staff reply yet.',
      lastUserMessage: convo.subject,
      contactName: convo.contact_name,
      contactEmail: convo.contact_email,
      contactPhone: convo.contact_phone,
      afterHours,
      reminderMinutes: minutes,
    }).catch(() => {})
    nudged++
  }

  return Response.json({ ok: true, waiting: waiting.length, nudged })
}

export async function POST(request: Request) {
  return run(request)
}

export async function GET(request: Request) {
  return run(request)
}
