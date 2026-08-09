'use server'

import { revalidatePath } from 'next/cache'
import { createDashboardClient } from '@/lib/dashboard/supabase'
import { createNotification } from '@/lib/dashboard/notifications'
import { resolveEventIdOrDefault } from '@/lib/dashboard/queries'
import { MAX_SELF_SERVICE_PARTY } from '@/lib/dashboard/types'

export interface PublicPledgeInput {
  full_name: string
  phone: string | null
  email: string | null
  amount: number
  max_party_size: number
  promised_date: string | null
  message: string | null
  /**
   * Event the pledge is for, carried on the share link as ?event=<id>. It is
   * verified against the owner; missing or foreign ids fall back to the
   * owner's first event (links sent through the WhatsApp template carry no
   * event).
   */
  event_id?: string | null
}

/**
 * Public submission from /pledge/<token>: looks up the owner by their pledge
 * token, creates a guest_contacts row for the contributor, then an event_pledges
 * row (status 'pledged') scoped to that owner. The token alone authorizes the
 * write — there's no signed-in session — so we use the service-role client but
 * scope every row to the verified user_id. Mirrors submitCollectorEntry.
 */
export async function submitPublicPledge(token: string, input: PublicPledgeInput): Promise<void> {
  const cleanName = input.full_name.trim()
  if (!cleanName) throw new Error('Name is required')
  const amount = Math.max(0, Number(input.amount) || 0)
  if (amount <= 0) throw new Error('Please enter the amount you can pledge')
  // A pledge link is public, so the contributor picks Single or Double only.
  const maxPartySize = Math.min(MAX_SELF_SERVICE_PARTY, Math.max(1, Number(input.max_party_size) || 1))

  const supabase = createDashboardClient()
  const { data: owner, error: ownerErr } = await supabase
    .from('users')
    .select('id')
    .eq('pledge_token', token)
    .maybeSingle<{ id: string }>()
  if (ownerErr) {
    console.error('[pledge] owner lookup failed', ownerErr)
    throw new Error('Something went wrong — please try again in a moment.')
  }
  if (!owner) throw new Error('Invalid pledge link')

  const phone = input.phone?.trim() || null
  const email = input.email?.trim() || null

  // Resolve which event this pledge lands on: the link's event when it really
  // belongs to this couple, else their default (first) event, else NULL. This
  // doesn't depend on (and isn't depended on by) the contact insert below, so
  // the two run concurrently.
  const [eventId, contactResult] = await Promise.all([
    resolveEventIdOrDefault(owner.id, input.event_id),
    supabase
      .from('guest_contacts')
      .insert({
        user_id: owner.id,
        full_name: cleanName,
        phone,
        whatsapp_phone: phone,
        email,
        max_party_size: maxPartySize,
        group_tag: 'From Pledge link',
        notes: 'Self-submitted via /pledge link',
      })
      .select('id')
      .single<{ id: string }>(),
  ])
  const { data: contact, error: contactErr } = contactResult
  if (contactErr || !contact) throw new Error(contactErr?.message ?? 'Could not save your pledge')

  const { error: pledgeErr } = await supabase.from('event_pledges').insert({
    user_id: owner.id,
    guest_contact_id: contact.id,
    event_id: eventId,
    pledged_amount: amount,
    currency: 'TZS',
    promised_date: input.promised_date || null,
    status: 'pledged',
    notes: input.message?.trim() || null,
  })
  if (pledgeErr) throw new Error(pledgeErr.message)

  await createNotification({
    userId: owner.id,
    type: 'pledge_received',
    title: `${cleanName} pledged a contribution`,
    body: `TZS ${amount.toLocaleString('en-US')}${input.promised_date ? ` · by ${input.promised_date}` : ''}`,
    actorName: cleanName,
    href: '/my/dashboard/pledges',
  })

  revalidatePath('/my/dashboard/pledges')
  revalidatePath('/my/dashboard/guests')
  revalidatePath('/my/dashboard')
}
