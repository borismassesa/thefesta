'use server'

import { createHash, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase'
import { requirePortalCandidate } from '@/lib/candidate-portal'

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim()
}

function uuid(valueToCheck: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valueToCheck)) {
    throw new Error('Invalid record identifier.')
  }
  return valueToCheck
}

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
const DOCUMENT_TYPES = new Map([
  ['application/pdf', 'pdf'], ['application/msword', 'doc'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
])

export type PortalTaskState = { ok: boolean; message: string | null }

async function validateDocument(file: File): Promise<{ bytes: ArrayBuffer; extension: string; sha256: string }> {
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error('The document must be 10 MB or smaller.')
  const extension = DOCUMENT_TYPES.get(file.type)
  if (!extension) throw new Error('Upload a PDF, DOC or DOCX file.')
  const bytes = await file.arrayBuffer()
  const head = new Uint8Array(bytes.slice(0, 8))
  const valid = (extension === 'pdf' && String.fromCharCode(...head.slice(0, 4)) === '%PDF') ||
    (extension === 'doc' && [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((part, index) => head[index] === part)) ||
    (extension === 'docx' && head[0] === 0x50 && head[1] === 0x4b)
  if (!valid) throw new Error('The file does not match its declared document type.')
  return { bytes, extension, sha256: createHash('sha256').update(new Uint8Array(bytes)).digest('hex') }
}

export async function updateCandidateContact(formData: FormData): Promise<void> {
  const candidate = await requirePortalCandidate()
  if (!candidate) throw new Error('No candidate profile is linked to this account.')
  const phone = value(formData, 'phone')
  const preferredName = value(formData, 'preferred_name')
  const city = value(formData, 'city')
  const country = value(formData, 'country')
  const timezone = value(formData, 'timezone')
  if (phone && phone.length < 7) throw new Error('Enter a valid phone number.')
  const supabase = createSupabaseServerClient()
  const { error } = await supabase.from('recruitment_candidates').update({
    phone: phone || null,
    preferred_name: preferredName || null,
    city: city || null,
    country: country || null,
    timezone: timezone || null,
  }).eq('id', candidate.id).eq('candidate_clerk_user_id', candidate.candidate_clerk_user_id)
  if (error) throw error
  revalidatePath('/careers/candidate')
}

export async function updateCandidatePreferences(formData: FormData): Promise<void> {
  const candidate = await requirePortalCandidate(); if (!candidate) throw new Error('Candidate profile not found.')
  const list = (name: string) => value(formData, name).split(',').map((item) => item.trim()).filter(Boolean).slice(0, 20)
  const min = value(formData, 'salary_min') ? Number(value(formData, 'salary_min')) : null; const max = value(formData, 'salary_max') ? Number(value(formData, 'salary_max')) : null
  if ((min != null && (!Number.isSafeInteger(min) || min < 0)) || (max != null && (!Number.isSafeInteger(max) || max < 0)) || (min != null && max != null && max < min)) throw new Error('Enter a valid salary range.')
  const { error } = await createSupabaseServerClient().from('recruitment_candidate_preferences').upsert({ candidate_id: candidate.id, preferred_departments: list('departments'), preferred_locations: list('locations'), preferred_employment_types: list('employment_types'), salary_expectation_min: min, salary_expectation_max: max, remote_preference: value(formData, 'remote_preference') || null, earliest_start_date: value(formData, 'earliest_start_date') || null, willing_to_relocate: value(formData, 'willing_to_relocate') === 'on', updated_at: new Date().toISOString() }, { onConflict: 'candidate_id' }); if (error) throw error; revalidatePath('/careers/candidate')
}

export async function updateCandidateConsent(consentType: 'talent_pool' | 'career_updates' | 'sms', intent: 'grant' | 'withdraw'): Promise<void> {
  const candidate = await requirePortalCandidate(); if (!candidate) throw new Error('Candidate profile not found.'); const db = createSupabaseServerClient()
  if (intent === 'withdraw') { const { error } = await db.from('recruitment_candidate_consents').update({ withdrawn_at: new Date().toISOString(), evidence: { candidate_portal: true, action: 'withdraw' } }).eq('candidate_id', candidate.id).eq('consent_type', consentType).not('granted_at', 'is', null).is('withdrawn_at', null); if (error) throw error; if (consentType === 'talent_pool') await db.from('recruitment_talent_pool_members').update({ status: 'removed', removed_at: new Date().toISOString() }).eq('candidate_id', candidate.id).eq('status', 'active') }
  else { const { data: existing } = await db.from('recruitment_candidate_consents').select('id').eq('candidate_id', candidate.id).eq('consent_type', consentType).not('granted_at', 'is', null).is('withdrawn_at', null).limit(1).maybeSingle(); if (!existing) { const { error } = await db.from('recruitment_candidate_consents').insert({ candidate_id: candidate.id, consent_type: consentType, notice_version: 'candidate-portal-2026-08', granted_at: new Date().toISOString(), source: 'candidate_portal', evidence: { candidate_portal: true, action: 'grant' } }); if (error) throw error } }
  await db.from('recruitment_audit_events').insert({ event_type: `candidate.consent_${intent}`, entity_type: 'candidate', entity_id: candidate.id, actor_type: 'candidate', metadata: { consent_type: consentType } }); revalidatePath('/careers/candidate')
}

export async function toggleCandidateSavedJob(jobId: string, intent: 'save' | 'remove'): Promise<void> {
  const candidate = await requirePortalCandidate(); if (!candidate) throw new Error('Sign in with your verified candidate email to save roles.'); const db = createSupabaseServerClient()
  if (intent === 'save') { const { data: posting, error: lookupError } = await db.from('recruitment_job_postings').select('id').eq('workforce_job_id', uuid(jobId)).eq('status', 'published').in('visibility', ['public', 'unlisted']).maybeSingle(); if (lookupError || !posting) throw new Error('This role is not available to save.'); const { error } = await db.from('recruitment_candidate_saved_jobs').upsert({ candidate_id: candidate.id, job_id: jobId }, { onConflict: 'candidate_id,job_id' }); if (error) throw error }
  else { const { error } = await db.from('recruitment_candidate_saved_jobs').delete().eq('candidate_id', candidate.id).eq('job_id', uuid(jobId)); if (error) throw error }
  revalidatePath('/careers/candidate')
}

export async function withdrawCandidateApplication(applicationId: string, formData: FormData): Promise<void> {
  const candidate = await requirePortalCandidate()
  if (!candidate) throw new Error('Candidate profile not found.')
  const supabase = createSupabaseServerClient()
  const { error } = await supabase.rpc('recruitment_candidate_withdraw_application', {
    p_application_id: uuid(applicationId),
    p_candidate_id: candidate.id,
    p_reason: value(formData, 'reason') || null,
  })
  if (error) throw error
  revalidatePath('/careers/candidate')
}

export async function submitCandidateAvailability(applicationId: string, formData: FormData): Promise<void> {
  const candidate = await requirePortalCandidate()
  if (!candidate) throw new Error('Candidate profile not found.')
  const startsAt = new Date(value(formData, 'starts_at_iso'))
  const endsAt = new Date(value(formData, 'ends_at_iso'))
  const timezone = value(formData, 'timezone')
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
    throw new Error('Choose a valid availability window.')
  }
  if (!timezone) throw new Error('Time zone is required.')
  const supabase = createSupabaseServerClient()
  const { data: application, error: lookupError } = await supabase
    .from('recruitment_applications')
    .select('id')
    .eq('id', uuid(applicationId))
    .eq('candidate_id', candidate.id)
    .maybeSingle<{ id: string }>()
  if (lookupError) throw lookupError
  if (!application) throw new Error('Application not found.')
  const { error } = await supabase.from('recruitment_candidate_availability').insert({
    candidate_id: candidate.id,
    application_id: application.id,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    timezone,
    note: value(formData, 'note') || null,
  })
  if (error) throw error
  revalidatePath('/careers/candidate')
}

export async function acknowledgeCandidateNotice(noticeId: string): Promise<void> {
  const candidate = await requirePortalCandidate()
  if (!candidate) throw new Error('Candidate profile not found.')
  const supabase = createSupabaseServerClient()
  const { error } = await supabase.from('recruitment_candidate_notices')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', uuid(noticeId))
    .eq('candidate_id', candidate.id)
    .is('acknowledged_at', null)
  if (error) throw error
  revalidatePath('/careers/candidate')
}

export async function respondToCandidateOffer(
  offerId: string,
  response: 'accepted' | 'declined' | 'question',
  formData: FormData,
): Promise<void> {
  const candidate = await requirePortalCandidate()
  if (!candidate) throw new Error('Candidate profile not found.')
  const supabase = createSupabaseServerClient()
  const { error } = await supabase.rpc('recruitment_candidate_respond_offer', {
    p_offer_id: uuid(offerId),
    p_candidate_id: candidate.id,
    p_response: response,
    p_typed_signature: value(formData, 'typed_signature') || null,
    p_note: value(formData, 'note') || null,
  })
  if (error) throw error
  revalidatePath('/careers/candidate')
}

export async function requestCandidatePrivacyAction(formData: FormData): Promise<void> {
  const candidate = await requirePortalCandidate()
  if (!candidate) throw new Error('Candidate profile not found.')
  const requestType = value(formData, 'request_type')
  if (!['access', 'correction', 'export', 'withdraw_consent', 'delete'].includes(requestType)) {
    throw new Error('Invalid privacy request type.')
  }
  const supabase = createSupabaseServerClient()
  const { error } = await supabase.from('recruitment_privacy_requests').insert({
    request_reference: `PRV-${randomUUID().slice(0, 12).toUpperCase()}`,
    candidate_id: candidate.id,
    requester_email: candidate.primary_email,
    request_type: requestType,
    status: 'received',
    due_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    verification_evidence: { candidate_portal: true },
  })
  if (error) throw error
  revalidatePath('/careers/candidate')
}

export async function openCandidateOfferDocument(
  offerId: string,
  documentId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const candidate = await requirePortalCandidate()
  if (!candidate) return { ok: false, error: 'Candidate profile not found.' }
  const supabase = createSupabaseServerClient()
  const { data: offer, error: offerError } = await supabase
    .from('recruitment_offers')
    .select('id, status, version, recruitment_applications!inner(candidate_id)')
    .eq('id', uuid(offerId))
    .maybeSingle()
  if (offerError || !offer) return { ok: false, error: 'That offer document is not available.' }
  const application = Array.isArray(offer.recruitment_applications) ? offer.recruitment_applications[0] : offer.recruitment_applications
  if (application?.candidate_id !== candidate.id || !['sent', 'viewed', 'accepted', 'declined'].includes(offer.status)) {
    return { ok: false, error: 'That offer document is not available.' }
  }
  const { data: document, error } = await supabase
    .from('recruitment_offer_documents')
    .select('id, storage_bucket, storage_path, offer_version_id, recruitment_offer_versions!inner(version)')
    .eq('id', uuid(documentId))
    .eq('offer_id', offer.id)
    .maybeSingle()
  if (error || !document) return { ok: false, error: 'That offer document is not available.' }
  const version = Array.isArray(document.recruitment_offer_versions) ? document.recruitment_offer_versions[0] : document.recruitment_offer_versions
  if (Number(version?.version) !== Number(offer.version)) return { ok: false, error: 'That offer document is not available.' }
  const { data: signed, error: signError } = await supabase.storage.from(document.storage_bucket).createSignedUrl(document.storage_path, 60)
  if (signError || !signed) return { ok: false, error: 'That offer document is not available.' }
  if (offer.status === 'sent') await supabase.from('recruitment_offers').update({ status: 'viewed' }).eq('id', offer.id).eq('status', 'sent')
  await supabase.from('recruitment_offer_documents').update({ signature_status: 'viewed' }).eq('id', document.id).eq('signature_status', 'pending')
  await supabase.from('recruitment_audit_events').insert({ event_type: 'offer.document_viewed', entity_type: 'offer', entity_id: offer.id, actor_type: 'candidate', metadata: { document_id: document.id, version: offer.version } })
  revalidatePath('/careers/candidate')
  return { ok: true, url: signed.signedUrl }
}

export async function submitCandidateAssessmentTask(taskId: string, _previous: PortalTaskState, formData: FormData): Promise<PortalTaskState> {
  let uploadedPath: string | null = null
  try {
    const candidate = await requirePortalCandidate()
    if (!candidate) return { ok: false, message: 'Candidate profile not found.' }
    const answer = value(formData, 'answer')
    const attachment = formData.get('attachment')
    if (answer.length < 10) return { ok: false, message: 'Add a complete response before submitting.' }
    const supabase = createSupabaseServerClient()
    if (attachment instanceof File && attachment.size > 0) {
      const validated = await validateDocument(attachment)
      uploadedPath = `candidate-portal/${candidate.id}/assessments/${randomUUID()}.${validated.extension}`
      const { error: uploadError } = await supabase.storage.from('careers').upload(uploadedPath, validated.bytes, { contentType: attachment.type, upsert: false })
      if (uploadError) throw uploadError
    }
    const { error } = await supabase.rpc('recruitment_candidate_submit_assessment', {
      p_task_id: uuid(taskId), p_candidate_id: candidate.id,
      p_response: { answer }, p_storage_paths: uploadedPath ? [uploadedPath] : [],
    })
    if (error) throw error
    revalidatePath('/careers/candidate')
    return { ok: true, message: 'Assessment submitted. The recruitment team will review it.' }
  } catch {
    if (uploadedPath) await createSupabaseServerClient().storage.from('careers').remove([uploadedPath])
    return { ok: false, message: 'The assessment could not be submitted. Check the deadline and try again.' }
  }
}

export async function uploadCandidatePortalDocument(taskId: string | null, _previous: PortalTaskState, formData: FormData): Promise<PortalTaskState> {
  let uploadedPath: string | null = null
  try {
    const candidate = await requirePortalCandidate()
    if (!candidate) return { ok: false, message: 'Candidate profile not found.' }
    const document = formData.get('document')
    if (!(document instanceof File) || document.size === 0) return { ok: false, message: 'Choose a document to upload.' }
    const applicationId = value(formData, 'applicationId') || null
    if (applicationId) uuid(applicationId)
    const documentType = value(formData, 'documentType') || 'other'
    const validated = await validateDocument(document)
    const supabase = createSupabaseServerClient()
    uploadedPath = `candidate-portal/${candidate.id}/documents/${randomUUID()}.${validated.extension}`
    const { error: uploadError } = await supabase.storage.from('careers').upload(uploadedPath, validated.bytes, { contentType: document.type, upsert: false })
    if (uploadError) throw uploadError
    const { error } = await supabase.rpc('recruitment_candidate_register_document', {
      p_candidate_id: candidate.id, p_application_id: applicationId,
      p_task_id: taskId ? uuid(taskId) : null, p_document_type: documentType,
      p_storage_bucket: 'careers', p_storage_path: uploadedPath,
      p_original_filename: document.name.slice(0, 255), p_mime_type: document.type,
      p_byte_size: document.size, p_sha256: validated.sha256,
    })
    if (error) throw error
    revalidatePath('/careers/candidate')
    return { ok: true, message: 'Document uploaded securely. It will be scanned before review.' }
  } catch {
    if (uploadedPath) await createSupabaseServerClient().storage.from('careers').remove([uploadedPath])
    return { ok: false, message: 'The document could not be uploaded. Check the file and try again.' }
  }
}

export async function requestInterviewReschedule(interviewId: string, formData: FormData): Promise<void> {
  const candidate = await requirePortalCandidate()
  if (!candidate) throw new Error('Candidate profile not found.')
  const reason = value(formData, 'reason')
  if (reason.length < 5 || reason.length > 1000) throw new Error('Add a short rescheduling reason.')
  const supabase = createSupabaseServerClient()
  const { data: interview, error } = await supabase.from('recruitment_interviews').select('id, application_id, recruitment_applications!inner(candidate_id)').eq('id', uuid(interviewId)).in('status', ['scheduled', 'confirmed']).maybeSingle()
  if (error) throw error
  const application = Array.isArray(interview?.recruitment_applications) ? interview?.recruitment_applications[0] : interview?.recruitment_applications
  if (!interview || application?.candidate_id !== candidate.id) throw new Error('Interview not found.')
  const { error: insertError } = await supabase.from('recruitment_interview_reschedule_requests').insert({ interview_id: interview.id, requested_by_type: 'candidate', requested_by_candidate_id: candidate.id, reason, proposed_slots: [] })
  if (insertError) throw insertError
  revalidatePath('/careers/candidate')
}

export async function requestInterviewAccommodation(interviewId: string, formData: FormData): Promise<void> {
  const candidate = await requirePortalCandidate()
  if (!candidate) throw new Error('Candidate profile not found.')
  const details = value(formData, 'request_details')
  if (details.length < 5 || details.length > 2000) throw new Error('Describe the accommodation requested.')
  const supabase = createSupabaseServerClient()
  const { data: interview, error } = await supabase.from('recruitment_interviews').select('id, application_id, recruitment_applications!inner(candidate_id)').eq('id', uuid(interviewId)).maybeSingle()
  if (error) throw error
  const application = Array.isArray(interview?.recruitment_applications) ? interview?.recruitment_applications[0] : interview?.recruitment_applications
  if (!interview || application?.candidate_id !== candidate.id) throw new Error('Interview not found.')
  const { error: insertError } = await supabase.from('recruitment_accommodation_requests').insert({ candidate_id: candidate.id, application_id: interview.application_id, interview_id: interview.id, request_details: details, status: 'received' })
  if (insertError) throw insertError
  revalidatePath('/careers/candidate')
}
