import 'server-only';

import { cache } from 'react';
import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase';

export type AgencyPortalIdentity = {
  contactId: string;
  contactName: string;
  email: string;
  agencyId: string;
  agencyName: string;
};

export const requireAgencyPortalIdentity = cache(
  async (): Promise<AgencyPortalIdentity | null> => {
    const { userId } = await auth();
    if (!userId) redirect('/sign-in?redirect_url=%2Fcareers%2Fagency');
    const user = await currentUser();
    const primary =
      user?.primaryEmailAddress ??
      user?.emailAddresses.find(
        (address) => address.id === user.primaryEmailAddressId
      );
    const email = primary?.emailAddress.trim().toLowerCase();
    if (!email || primary?.verification?.status !== 'verified') {
      throw new Error(
        'Verify your primary email address before opening the agency portal.'
      );
    }

    const { data, error } = await createSupabaseServerClient()
      .from('recruitment_agency_contacts')
      .select(
        'id, name, email, agency_id, recruitment_agencies(id, name, status)'
      )
      .ilike('email', email)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const agency = Array.isArray(data.recruitment_agencies)
      ? data.recruitment_agencies[0]
      : data.recruitment_agencies;
    if (!agency || agency.status !== 'active') return null;
    return {
      contactId: data.id,
      contactName: data.name,
      email,
      agencyId: data.agency_id,
      agencyName: agency.name,
    };
  }
);
