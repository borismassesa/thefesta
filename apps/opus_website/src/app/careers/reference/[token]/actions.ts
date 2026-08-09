'use server';

import { createHash } from 'node:crypto';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase';

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

export async function submitReferenceResponse(
  token: string,
  formData: FormData
): Promise<void> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new Error('This reference request is unavailable.');
  const response = {
    relationship_confirmation: value(formData, 'relationship_confirmation'),
    strengths: value(formData, 'strengths'),
    development: value(formData, 'development') || null,
    rehire: value(formData, 'rehire'),
    comments: value(formData, 'comments'),
    declaration: value(formData, 'declaration') === 'on',
  };
  if (!response.declaration)
    throw new Error(
      'Confirm that the reference is accurate to the best of your knowledge.'
    );
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { error } = await createSupabaseServerClient().rpc(
    'recruitment_submit_reference_response',
    {
      p_token_hash: tokenHash,
      p_response: response,
    }
  );
  if (error)
    throw new Error(
      'This reference could not be submitted. Check the required fields or ask the candidate to contact OpusFesta.'
    );
  redirect(`/careers/reference/${token}?submitted=1`);
}
