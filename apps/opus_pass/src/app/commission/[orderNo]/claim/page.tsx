import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase'
import { requireDashboardUser } from '@/lib/dashboard/auth'
import { consumeClaimToken } from '@/lib/commission/claim-tokens'

export const dynamic = 'force-dynamic'

/**
 * The landing point after a buyer signs in from their claim link.
 * Specs: OP-CCS-PRD-001 §7.1.
 *
 * This runs the claim itself, then puts the buyer in front of the one decision
 * only they can make: which event this card belongs to. Everything else —
 * binding the order, matching it to their account — happens without asking.
 *
 * The order is claimed BEFORE the event question is answered. Attaching to an
 * event is a step that can happen later and is only strictly required at
 * delivery; losing the claim because someone closed the tab at the event picker
 * would not be.
 */
export default async function ClaimCommissionPage(props: {
  params: Promise<{ orderNo: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const { orderNo } = await props.params
  const { t: token } = await props.searchParams

  // requireDashboardUser redirects to sign-in and back, so arriving here
  // without a session resolves itself.
  const user = await requireDashboardUser(`/commission/${orderNo}/claim?t=${token ?? ''}`)

  if (!token) {
    return (
      <Shell title="That link is missing its code">
        Open the link exactly as we sent it, or contact us and we will send a new one.
      </Shell>
    )
  }

  const result = await consumeClaimToken({ token, userId: user.id })
  if (!result.ok) {
    return (
      <Shell title="We could not attach that order">
        {result.reason === 'owned_by_other'
          ? 'This order is already saved to another account. Contact us if that is wrong.'
          : 'That link has expired. Contact us and we will send you a new one.'}
      </Shell>
    )
  }

  const order = result.order

  // Already attached to an event — nothing left to ask.
  if (order.event_id) redirect(`/commission/${order.order_no}`)

  const supabase = createSupabaseServerClient()
  const { data: events } = await supabase
    .from('wedding_events')
    .select('id, name, starts_at')
    .eq('user_id', user.id)
    .order('starts_at', { ascending: true })
    .returns<{ id: string; name: string; starts_at: string | null }[]>()

  const sw = order.locale === 'sw'

  return (
    <main className="mx-auto max-w-lg px-5 py-12">
      <p className="font-mono text-xs uppercase tracking-widest text-[#C9A961]">{order.order_no}</p>
      <h1 className="mt-2 font-serif text-2xl text-[#4A2D5C]">
        {sw ? 'Oda yako imehifadhiwa' : 'Your order is saved'}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[#6B5B73]">
        {sw
          ? 'Sasa chagua tukio ambalo kadi hii ni yake. Unaweza kufanya hivi baadaye pia — inahitajika tu pale kadi itakapokabidhiwa.'
          : 'Now choose which event this card is for. You can do this later too — it is only needed when the finished card is delivered.'}
      </p>

      <form action={attachEvent} className="mt-6 space-y-3">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="orderNo" value={order.order_no} />

        {(events ?? []).map((event) => (
          <button
            key={event.id}
            name="eventId"
            value={event.id}
            type="submit"
            className="block w-full rounded-2xl border border-[#E8DCC8] bg-white p-4 text-left hover:border-[#C9A961]"
          >
            <span className="block font-semibold text-[#4A2D5C]">{event.name}</span>
            {event.starts_at && (
              <span className="mt-0.5 block text-xs text-[#8A7A92]">
                {new Date(event.starts_at).toLocaleDateString(sw ? 'sw-TZ' : 'en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            )}
          </button>
        ))}

        {/* The "signed in with no events" case from PRD §7.1: create one from
            what they already told us at checkout, rather than sending them off
            to a separate wizard and hoping they come back. */}
        <button
          name="createEvent"
          value="1"
          type="submit"
          className="block w-full rounded-2xl border border-dashed border-[#C9A961] bg-[#FDF8F5] p-4 text-left"
        >
          <span className="block font-semibold text-[#4A2D5C]">
            {sw ? 'Tengeneza tukio jipya' : 'Create an event from this order'}
          </span>
          <span className="mt-0.5 block text-xs text-[#8A7A92]">
            {order.provisional_event_name || (sw ? 'Tukio langu' : 'Our celebration')}
            {order.provisional_event_date ? ` · ${order.provisional_event_date}` : ''}
          </span>
        </button>
      </form>

      <a
        href={`/commission/${order.order_no}`}
        className="mt-6 block text-center text-sm text-[#6B5B73] underline"
      >
        {sw ? 'Nitafanya baadaye' : 'I will do this later'}
      </a>
    </main>
  )
}

async function attachEvent(formData: FormData): Promise<void> {
  'use server'
  const token = String(formData.get('token') ?? '')
  const orderNo = String(formData.get('orderNo') ?? '')
  const eventId = formData.get('eventId')
  const createEvent = formData.get('createEvent') === '1'

  const user = await requireDashboardUser()
  const supabase = createSupabaseServerClient()

  // Re-consuming is a no-op for an order this user already owns, and it is what
  // re-verifies the token rather than trusting the hidden field.
  const result = await consumeClaimToken({ token, userId: user.id })
  if (!result.ok) redirect(`/commission/${orderNo}`)

  const order = result.order

  if (typeof eventId === 'string' && eventId) {
    // Confirm ownership before attaching — a hidden field is cheap to forge.
    const { data } = await supabase
      .from('wedding_events')
      .select('id')
      .eq('id', eventId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (data) {
      await supabase.from('card_orders').update({ event_id: eventId }).eq('id', order.id)
    }
  } else if (createEvent) {
    const { data: created } = await supabase
      .from('wedding_events')
      .insert({
        user_id: user.id,
        name: order.provisional_event_name || 'Our celebration',
        event_type: order.category_id === 'wedding' ? 'ceremony' : 'other',
        starts_at: order.provisional_event_date
          ? new Date(`${order.provisional_event_date}T12:00:00Z`).toISOString()
          : null,
      })
      .select('id')
      .single()
    if (created) {
      await supabase
        .from('card_orders')
        .update({ event_id: (created as { id: string }).id })
        .eq('id', order.id)
    }
  }

  redirect(`/commission/${order.order_no}`)
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <div className="rounded-2xl border border-[#E8DCC8] bg-[#FDF8F5] p-6">
        <h1 className="font-serif text-xl text-[#4A2D5C]">{title}</h1>
        <p className="mt-2 text-sm text-[#6B5B73]">{children}</p>
      </div>
    </main>
  )
}
