import { NextResponse } from 'next/server'
import { authorizeOrderAccess } from '@/lib/commission/access'
import {
  appendBriefAttachment,
  getBrief,
  getBriefQuestions,
  saveBriefAnswers,
  storeBriefAttachment,
} from '@/lib/commission/brief'
import { transitionOrder, TransitionError } from '@/lib/commission/orders'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * The structured brief. Auth: claim token or Clerk (OP-CCS-TDD-001 §8).
 *
 *   GET   questions for the order's category, plus any saved answers
 *   PUT   save answers; completing them moves the order intake_pending → queued
 *   POST  upload one attachment (multipart)
 *
 * Reachable unauthenticated with a claim token, because the whole point of
 * PRD §7.1 is that the buyer completes this immediately after paying, long
 * before they have an account.
 */

export async function GET(
  req: Request,
  ctx: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const { key } = await ctx.params
  const token = new URL(req.url).searchParams.get('t')
  const access = await authorizeOrderAccess(key, token)
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status })

  const [questions, brief] = await Promise.all([
    getBriefQuestions(access.order.category_id),
    getBrief(access.order.id),
  ])

  return NextResponse.json({
    status: access.order.status,
    locale: access.order.locale,
    categoryId: access.order.category_id,
    questions,
    answers: brief.answers,
    // Paths only — a signed URL is minted on demand, never handed out in a list.
    attachments: brief.attachments.map((a) => ({ name: a.name, size: a.size, path: a.path })),
    completedAt: brief.completedAt,
  })
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const { key } = await ctx.params
  const token = new URL(req.url).searchParams.get('t')
  const access = await authorizeOrderAccess(key, token)
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status })
  const order = access.order

  const body = (await req.json().catch(() => null)) as {
    answers?: unknown
    complete?: unknown
  } | null
  const answers =
    body && typeof body.answers === 'object' && body.answers !== null
      ? (body.answers as Record<string, unknown>)
      : {}
  const complete = body?.complete === true

  const { saved, missingRequired } = await saveBriefAnswers({
    orderId: order.id,
    categoryId: order.category_id,
    answers,
    complete,
  })

  // Saving is always allowed and always succeeds — a customer part-way through
  // a long form on a patchy connection must never lose what they typed because
  // the order is in an unexpected state.
  if (!complete || missingRequired.length > 0) {
    return NextResponse.json({
      status: order.status,
      answers: saved,
      missingRequired,
      message:
        missingRequired.length > 0 && complete
          ? 'A few required answers are still missing.'
          : 'Saved.',
    })
  }

  // Complete and valid. Only intake_pending can advance; anything else means
  // the brief is being edited after the fact, which is fine and is a no-op.
  if (order.status !== 'intake_pending') {
    return NextResponse.json({ status: order.status, answers: saved, missingRequired: [] })
  }

  try {
    const updated = await transitionOrder({
      orderId: order.id,
      to: 'queued',
      eventType: 'brief.completed',
      actorType: 'customer',
      actorId: access.userId,
    })
    return NextResponse.json({
      status: updated.status,
      answers: saved,
      missingRequired: [],
      message: 'Thank you. Your card is now with our design studio.',
    })
  } catch (error) {
    if (error instanceof TransitionError) {
      // Almost always the deposit gate: the brief is done but the money is not
      // in yet. The answers are saved regardless, and the sweeper will queue
      // the order the moment the deposit clears.
      return NextResponse.json({
        status: order.status,
        answers: saved,
        missingRequired: [],
        message: 'Your answers are saved. Design starts as soon as your deposit is confirmed.',
      })
    }
    throw error
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const { key } = await ctx.params
  const token = new URL(req.url).searchParams.get('t')
  const access = await authorizeOrderAccess(key, token)
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ message: 'No file was received.' }, { status: 400 })
  }

  const brief = await getBrief(access.order.id)
  const result = await storeBriefAttachment({
    orderId: access.order.id,
    file,
    existingCount: brief.attachments.length,
  })
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 })

  const attachments = await appendBriefAttachment(access.order.id, result.attachment)
  return NextResponse.json({
    attachments: attachments.map((a) => ({ name: a.name, size: a.size, path: a.path })),
  })
}
