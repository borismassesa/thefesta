'use server';

import { revalidatePath } from 'next/cache';
import { getCallerEmployeeId, requirePermission } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase';

const PATH = '/workforce/recruitment/agencies';
function field(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === 'string' ? value.trim() : '';
}
async function actor() {
  await requirePermission('workforce.recruitment_settings.write');
  return getCallerEmployeeId();
}
async function audit(
  event: string,
  type: string,
  id: string,
  actorId: string | null,
  metadata: Record<string, unknown> = {}
) {
  await createSupabaseAdminClient()
    .from('recruitment_audit_events')
    .insert({
      event_type: event,
      entity_type: type,
      entity_id: id,
      actor_type: 'employee',
      metadata: { ...metadata, actor_employee_id: actorId },
    });
}

export async function createAgency(formData: FormData) {
  const actorId = await actor();
  const name = field(formData, 'name');
  if (name.length < 2) throw new Error('Agency name is required.');
  const fee = field(formData, 'fee_percent')
    ? Number(field(formData, 'fee_percent'))
    : null;
  if (fee != null && (!Number.isFinite(fee) || fee < 0 || fee > 100))
    throw new Error('Enter a valid fee percentage.');
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from('recruitment_agencies')
    .insert({
      name,
      contact_name: field(formData, 'contact_name') || null,
      contact_email: field(formData, 'contact_email') || null,
      terms: field(formData, 'terms') || null,
      fee_percent: fee,
    })
    .select('id')
    .single();
  if (error) throw error;
  if (field(formData, 'contact_email'))
    await db
      .from('recruitment_agency_contacts')
      .insert({
        agency_id: data.id,
        name: field(formData, 'contact_name') || name,
        email: field(formData, 'contact_email'),
        phone: field(formData, 'phone') || null,
        is_primary: true,
      });
  await audit('agency.created', 'agency', data.id, actorId, {
    changed_fields: ['name', 'terms', 'fee_percent'],
  });
  revalidatePath(PATH);
}

export async function setAgencyStatus(id: string, status: string) {
  const actorId = await actor();
  if (!['active', 'paused', 'blocked', 'archived'].includes(status))
    throw new Error('Invalid agency status.');
  const { error } = await createSupabaseAdminClient()
    .from('recruitment_agencies')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
  await audit('agency.status_changed', 'agency', id, actorId, { status });
  revalidatePath(PATH);
}

export async function addAgencyContact(agencyId: string, formData: FormData) {
  const actorId = await actor();
  const email = field(formData, 'email');
  if (!/^\S+@\S+\.\S+$/.test(email))
    throw new Error('Enter a valid contact email.');
  const { error } = await createSupabaseAdminClient()
    .from('recruitment_agency_contacts')
    .insert({
      agency_id: agencyId,
      name: field(formData, 'name'),
      email,
      phone: field(formData, 'phone') || null,
      is_primary: field(formData, 'is_primary') === 'on',
    });
  if (error) throw error;
  await audit('agency.contact_added', 'agency', agencyId, actorId);
  revalidatePath(PATH);
}

export async function assignAgencyJob(agencyId: string, formData: FormData) {
  const actorId = await actor();
  const jobId = field(formData, 'job_id');
  const ownershipDays = Number(field(formData, 'ownership_days') || 180);
  const guaranteeDays = field(formData, 'guarantee_days')
    ? Number(field(formData, 'guarantee_days'))
    : null;
  const fee = field(formData, 'fee_percent')
    ? Number(field(formData, 'fee_percent'))
    : null;
  if (!jobId || ownershipDays < 1 || ownershipDays > 730)
    throw new Error('Choose a job and valid ownership period.');
  const { error } = await createSupabaseAdminClient()
    .from('recruitment_agency_job_assignments')
    .upsert(
      {
        agency_id: agencyId,
        job_id: jobId,
        ownership_days: ownershipDays,
        guarantee_days: guaranteeDays,
        fee_percent: fee,
        assigned_by: actorId,
        status: 'active',
      },
      { onConflict: 'agency_id,job_id' }
    );
  if (error) throw error;
  await audit('agency.job_assigned', 'agency', agencyId, actorId, {
    job_id: jobId,
    ownership_days: ownershipDays,
  });
  revalidatePath(PATH);
}

export async function logAgencySubmission(
  agencyId: string,
  formData: FormData
) {
  const actorId = await actor();
  const db = createSupabaseAdminClient();
  const email = field(formData, 'email').toLowerCase();
  const jobId = field(formData, 'job_id');
  const { data: assignment, error: assignmentError } = await db
    .from('recruitment_agency_job_assignments')
    .select('ownership_days')
    .eq('agency_id', agencyId)
    .eq('job_id', jobId)
    .eq('status', 'active')
    .maybeSingle();
  if (assignmentError) throw assignmentError;
  if (!assignment)
    throw new Error('This agency is not actively assigned to the job.');
  const { data: candidate } = await db
    .from('recruitment_candidates')
    .select('id')
    .eq('normalized_email', email)
    .maybeSingle();
  const { data, error } = await db
    .from('recruitment_agency_submissions')
    .insert({
      agency_id: agencyId,
      job_id: jobId,
      submitted_name: field(formData, 'name'),
      submitted_email: email,
      external_reference: field(formData, 'external_reference') || null,
      candidate_id: candidate?.id ?? null,
      ownership_expires_at: new Date(
        Date.now() + assignment.ownership_days * 86_400_000
      ).toISOString(),
      status: candidate ? 'duplicate' : 'submitted',
    })
    .select('id')
    .single();
  if (error) throw error;
  await audit(
    candidate ? 'agency.submission_duplicate' : 'agency.submission_received',
    'agency_submission',
    data.id,
    actorId,
    { agency_id: agencyId, job_id: jobId }
  );
  revalidatePath(PATH);
}

export async function setAgencySubmissionStatus(id: string, status: string) {
  const actorId = await actor();
  if (
    !['submitted', 'accepted', 'duplicate', 'rejected', 'converted'].includes(
      status
    )
  )
    throw new Error('Invalid submission status.');
  const db = createSupabaseAdminClient();
  let ownershipExpiresAt: string | null | undefined;
  if (status === 'accepted') {
    const { data: submission, error: lookupError } = await db
      .from('recruitment_agency_submissions')
      .select('agency_id, job_id')
      .eq('id', id)
      .single();
    if (lookupError) throw lookupError;
    const { data: assignment, error: assignmentError } = await db
      .from('recruitment_agency_job_assignments')
      .select('ownership_days')
      .eq('agency_id', submission.agency_id)
      .eq('job_id', submission.job_id)
      .eq('status', 'active')
      .maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment)
      throw new Error('The agency is no longer assigned to this role.');
    ownershipExpiresAt = new Date(
      Date.now() + assignment.ownership_days * 86_400_000
    ).toISOString();
  } else if (['duplicate', 'rejected'].includes(status))
    ownershipExpiresAt = null;
  const { error } = await db
    .from('recruitment_agency_submissions')
    .update({
      status,
      ...(ownershipExpiresAt !== undefined
        ? { ownership_expires_at: ownershipExpiresAt }
        : {}),
    })
    .eq('id', id);
  if (error) throw error;
  await audit(
    'agency.submission_status_changed',
    'agency_submission',
    id,
    actorId,
    { status, ownership_expires_at: ownershipExpiresAt }
  );
  revalidatePath(PATH);
}
