'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase';
import { requireAgencyPortalIdentity } from '@/lib/agency-portal';

export type AgencySubmissionState = { ok: boolean; message: string | null };

const initialError: AgencySubmissionState = {
  ok: false,
  message: 'The submission could not be saved.',
};
const documentTypes = new Map([
  ['application/pdf', 'pdf'],
  ['application/msword', 'doc'],
  [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'docx',
  ],
]);

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function uploadAgencyResume(
  file: File,
  agencyId: string
): Promise<string> {
  if (file.size < 1 || file.size > 10 * 1024 * 1024)
    throw new Error('The CV must be 10 MB or smaller.');
  const extension = documentTypes.get(file.type);
  if (!extension) throw new Error('Upload a PDF, DOC or DOCX CV.');
  const bytes = await file.arrayBuffer();
  const head = new Uint8Array(bytes.slice(0, 8));
  const valid =
    (extension === 'pdf' &&
      String.fromCharCode(...head.slice(0, 4)) === '%PDF') ||
    (extension === 'doc' &&
      [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every(
        (part, index) => head[index] === part
      )) ||
    (extension === 'docx' && head[0] === 0x50 && head[1] === 0x4b);
  if (!valid)
    throw new Error('The CV does not match its declared document type.');
  const path = `agency-submissions/${agencyId}/${randomUUID()}.${extension}`;
  const { error } = await createSupabaseServerClient()
    .storage.from('careers')
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (error) throw new Error('The CV could not be uploaded securely.');
  return path;
}

export async function submitAgencyCandidate(
  _previous: AgencySubmissionState,
  formData: FormData
): Promise<AgencySubmissionState> {
  const identity = await requireAgencyPortalIdentity();
  if (!identity)
    return {
      ok: false,
      message: 'Your verified email is not linked to an active agency.',
    };
  const jobId = field(formData, 'jobId');
  const name = field(formData, 'name');
  const email = field(formData, 'email').toLowerCase();
  const externalReference = field(formData, 'externalReference');
  const resume = formData.get('resume');
  if (!validUuid(jobId) || name.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) {
    return {
      ok: false,
      message: 'Enter a valid assigned role, candidate name and email.',
    };
  }
  if (formData.get('candidateConsent') !== 'on') {
    return {
      ok: false,
      message: 'Confirm that the candidate authorized this submission.',
    };
  }
  if (!(resume instanceof File) || resume.size === 0) {
    return { ok: false, message: 'Attach the candidate CV.' };
  }

  const db = createSupabaseServerClient();
  const { data: assignment, error: assignmentError } = await db
    .from('recruitment_agency_job_assignments')
    .select('ownership_days')
    .eq('agency_id', identity.agencyId)
    .eq('job_id', jobId)
    .eq('status', 'active')
    .maybeSingle<{ ownership_days: number }>();
  if (assignmentError || !assignment) {
    return { ok: false, message: 'This role is not assigned to your agency.' };
  }

  let storagePath = '';
  try {
    storagePath = await uploadAgencyResume(resume, identity.agencyId);
    const { data: candidate, error: candidateError } = await db
      .from('recruitment_candidates')
      .select('id')
      .eq('normalized_email', email)
      .maybeSingle<{ id: string }>();
    if (candidateError) throw candidateError;
    const { data, error } = await db
      .from('recruitment_agency_submissions')
      .insert({
        agency_id: identity.agencyId,
        job_id: jobId,
        submitted_by_contact_id: identity.contactId,
        submitted_name: name,
        submitted_email: email,
        external_reference: externalReference || null,
        candidate_id: candidate?.id ?? null,
        ownership_expires_at: null,
        status: candidate ? 'duplicate' : 'submitted',
        consent_confirmed_at: new Date().toISOString(),
        consent_evidence: {
          attested_by_contact_id: identity.contactId,
          candidate_authorized_submission: true,
        },
        resume_storage_bucket: 'careers',
        resume_storage_path: storagePath,
        resume_original_filename: resume.name.slice(0, 255),
        resume_mime_type: resume.type,
        resume_byte_size: resume.size,
      })
      .select('id, status')
      .single<{ id: string; status: string }>();
    if (error) {
      await db.storage.from('careers').remove([storagePath]);
      if (error.code === '23505') {
        return {
          ok: false,
          message: 'Your agency already submitted this candidate for the role.',
        };
      }
      throw error;
    }
    await db.from('recruitment_audit_events').insert({
      event_type: candidate
        ? 'agency.submission_duplicate'
        : 'agency.submission_received',
      entity_type: 'agency_submission',
      entity_id: data.id,
      actor_type: 'agency',
      metadata: {
        agency_id: identity.agencyId,
        contact_id: identity.contactId,
        job_id: jobId,
        candidate_consent_attested: true,
      },
    });
    revalidatePath('/careers/agency');
    return {
      ok: true,
      message:
        data.status === 'duplicate'
          ? 'Submission recorded for duplicate review. No ownership is implied until People Ops confirms it.'
          : 'Candidate submitted securely for People Ops review.',
    };
  } catch (error) {
    if (storagePath) await db.storage.from('careers').remove([storagePath]);
    console.error('[agency-portal] submission failed', {
      name: error instanceof Error ? error.name : 'unknown',
    });
    return initialError;
  }
}
