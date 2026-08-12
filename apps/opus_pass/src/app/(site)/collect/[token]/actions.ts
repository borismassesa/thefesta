'use server'

import { revalidatePath } from 'next/cache'
import { createDashboardClient } from '@/lib/dashboard/supabase'

export interface CollectorEntryInput {
  full_name: string
  phone: string | null
  email: string | null
  /** Answers to the couple's custom questions, in the order asked. */
  answers?: { prompt: string; answer: string }[]
  /** Which event this submission was collected for, if the guest arrived via
   *  an event-tagged link (?event=<id>). Re-verified against the token's
   *  owner below — never trusted as-is from an unauthenticated client. */
  eventId?: string | null
}

/**
 * Public submission from /collect/<token>: looks up the owner by token, then
 * inserts a guest_contacts row scoped to that owner. The token alone authorizes
 * the write — there's no signed-in session here. We bypass RLS via the
 * service-role client, but every row is scoped to a verified user_id.
 */
export async function submitCollectorEntry(token: string, input: CollectorEntryInput): Promise<void> {
  const cleanName = input.full_name.trim()
  if (!cleanName) throw new Error('Name is required')

  const supabase = createDashboardClient()
  const { data: owner, error: ownerErr } = await supabase
    .from('users')
    .select('id')
    .eq('collector_token', token)
    .maybeSingle<{ id: string }>()
  if (ownerErr) {
    console.error('[collect] owner lookup failed', ownerErr)
    throw new Error('Something went wrong — please try again in a moment.')
  }
  if (!owner) throw new Error('Invalid collector link')

  // A guest-supplied event id must never be trusted as-is — re-verify it
  // actually belongs to this token's owner before using it for the group
  // tag below, so one couple's submission can never get attributed to
  // another couple's event.
  let eventName: string | null = null
  if (input.eventId) {
    const { data: event } = await supabase
      .from('wedding_events')
      .select('name')
      .eq('id', input.eventId)
      .eq('user_id', owner.id)
      .maybeSingle<{ name: string | null }>()
    eventName = event?.name?.trim() || null
  }

  const phone = input.phone?.trim() || null
  const email = input.email?.trim() || null

  // Public, unauthenticated endpoint — cap what an anonymous submitter can
  // stuff into a couple's guest notes rather than trusting the payload shape.
  const answerLines = (input.answers ?? [])
    .slice(0, 20)
    .map((a) => ({ prompt: a.prompt.trim().slice(0, 300), answer: a.answer.trim().slice(0, 2000) }))
    .filter((a) => a.prompt && a.answer)
    .map((a) => `${a.prompt}: ${a.answer}`)
  const notes = answerLines.length
    ? `Self-submitted via /collect link\n\n${answerLines.join('\n')}`
    : 'Self-submitted via /collect link'
  const groupTag = eventName ? `From Contact Collector — ${eventName}` : 'From Contact Collector'

  const { error } = await supabase.from('guest_contacts').insert({
    user_id: owner.id,
    full_name: cleanName,
    phone,
    whatsapp_phone: phone,
    email,
    group_tag: groupTag,
    notes,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/my/dashboard/guests')
  revalidatePath('/my/dashboard')
}
