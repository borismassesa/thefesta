import { NextResponse } from 'next/server'
import { getDashboardUser } from '@/lib/dashboard/auth'
import { createDashboardClient } from '@/lib/dashboard/supabase'
import { resolveOwnedEventId } from '@/lib/dashboard/queries'
import { listTopupCandidates } from '@/lib/payments/topup'

// Which released cards the couple can add invitations to, for the top-up drawer.
//
// Fetched when the drawer opens rather than with the send console, because it
// costs a design + release join that the vast majority of page loads never need.
//
// `eventId` is re-resolved against the couple's own events; a candidate list is
// scoped to one event, and taking the client's word for which would let a
// caller enumerate another event's cards.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request): Promise<NextResponse> {
  const user = await getDashboardUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const eventId = await resolveOwnedEventId(
    user.id,
    new URL(req.url).searchParams.get('event'),
  )
  if (!eventId) return NextResponse.json({ error: 'unknown_event' }, { status: 400 })

  const supabase = createDashboardClient()
  const [candidates, profile] = await Promise.all([
    listTopupCandidates(user.id, eventId),
    supabase
      .from('couple_profiles')
      .select('whatsapp_phone')
      .eq('user_id', user.id)
      .maybeSingle<{ whatsapp_phone: string | null }>()
      .then((r) => r.data),
  ])

  return NextResponse.json({
    candidates,
    contact: {
      name: user.name,
      email: user.email,
      phone: profile?.whatsapp_phone ?? '',
    },
  })
}
