import 'server-only'

import { cache } from 'react'
import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase'
import { candidatePortalTestEmail } from '@/lib/candidate-portal-test-identity'

export type PortalCandidate = {
  id: string
  full_name: string
  preferred_name: string | null
  primary_email: string
  phone: string | null
  country: string | null
  city: string | null
  timezone: string | null
  candidate_clerk_user_id: string | null
  status: string
}

export const requirePortalCandidate = cache(async (): Promise<PortalCandidate | null> => {
  const testEmail = candidatePortalTestEmail(
    process.env.NODE_ENV,
    process.env.RECRUITMENT_E2E_CANDIDATE_EMAIL,
  )
  if (testEmail) {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('recruitment_candidates')
      .select('id, full_name, preferred_name, primary_email, phone, country, city, timezone, candidate_clerk_user_id, status')
      .eq('normalized_email', testEmail)
      .maybeSingle<PortalCandidate>()
    if (error) throw error
    return data
  }

  const { userId } = await auth()
  if (!userId) redirect('/sign-in?redirect_url=%2Fcareers%2Fcandidate')
  const user = await currentUser()
  const emailAddress = user?.primaryEmailAddress ?? user?.emailAddresses.find((address) => address.id === user.primaryEmailAddressId)
  const email = emailAddress?.emailAddress.trim().toLowerCase()
  if (!email || emailAddress?.verification?.status !== 'verified') {
    throw new Error('Verify your primary email address before opening the candidate portal.')
  }

  const supabase = createSupabaseServerClient()
  const candidateResult = await supabase
    .from('recruitment_candidates')
    .select('id, full_name, preferred_name, primary_email, phone, country, city, timezone, candidate_clerk_user_id, status')
    .eq('normalized_email', email)
    .maybeSingle<PortalCandidate>()
  if (candidateResult.error) throw candidateResult.error
  let candidate = candidateResult.data
  if (!candidate) return null
  if (candidate.candidate_clerk_user_id && candidate.candidate_clerk_user_id !== userId) {
    throw new Error('This candidate profile is already linked to another account. Contact People Ops for help.')
  }
  if (!candidate.candidate_clerk_user_id) {
    const linked = await supabase
      .from('recruitment_candidates')
      .update({ candidate_clerk_user_id: userId })
      .eq('id', candidate.id)
      .is('candidate_clerk_user_id', null)
      .select('id, full_name, preferred_name, primary_email, phone, country, city, timezone, candidate_clerk_user_id, status')
      .maybeSingle<PortalCandidate>()
    if (linked.error) throw linked.error
    if (!linked.data) {
      const retry = await supabase
        .from('recruitment_candidates')
        .select('id, full_name, preferred_name, primary_email, phone, country, city, timezone, candidate_clerk_user_id, status')
        .eq('id', candidate.id)
        .single<PortalCandidate>()
      if (retry.error) throw retry.error
      if (retry.data.candidate_clerk_user_id !== userId) throw new Error('Could not securely link this candidate profile.')
      candidate = retry.data
    } else candidate = linked.data
  }
  return candidate
})
