'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getCallerPermissions } from '@/lib/admin-auth'
import { logDbError } from '@/lib/log-safe'
import { requireRecruitmentAccess } from '@/lib/recruitment-auth'

const SIGNED_URL_TTL_SECONDS = 60
const NOT_VISIBLE = 'That candidate document is not available.'

export type CandidateActionState = { ok: boolean; message: string | null }
export type CandidateDocumentResult =
  | { ok: true; url: string; fileName: string }
  | { ok: false; error: string }

function text(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

export async function mergeCandidates(formData: FormData): Promise<void> {
  const survivingId = text(formData, 'surviving_candidate_id'); const mergedId = text(formData, 'merged_candidate_id'); const reason = text(formData, 'reason')
  const access = await requireRecruitmentAccess({ entityType: 'candidate', entityId: survivingId, allowedPermissions: ['workforce.candidates.merge'] })
  await requireRecruitmentAccess({ entityType: 'candidate', entityId: mergedId, allowedPermissions: ['workforce.candidates.merge'] })
  const { error } = await createSupabaseAdminClient().rpc('recruitment_merge_candidates', { p_surviving_candidate_id: survivingId, p_merged_candidate_id: mergedId, p_actor_employee_id: access.employeeId, p_reason: reason }); if (error) throw error
  revalidatePath('/workforce/recruitment/candidates'); revalidatePath(`/workforce/recruitment/candidates/${survivingId}`); redirect(`/workforce/recruitment/candidates/${survivingId}`)
}

export async function reviewDuplicateMatch(id: string, status: 'confirmed_duplicate' | 'not_duplicate'): Promise<void> {
  const { data: match, error: lookupError } = await createSupabaseAdminClient().from('recruitment_duplicate_matches').select('candidate_id, possible_duplicate_id').eq('id', id).single(); if (lookupError) throw lookupError
  const access = await requireRecruitmentAccess({ entityType: 'candidate', entityId: match.candidate_id, allowedPermissions: ['workforce.candidates.merge'] }); await requireRecruitmentAccess({ entityType: 'candidate', entityId: match.possible_duplicate_id, allowedPermissions: ['workforce.candidates.merge'] })
  const { error } = await createSupabaseAdminClient().from('recruitment_duplicate_matches').update({ status, reviewed_by: access.employeeId, reviewed_at: new Date().toISOString() }).eq('id', id); if (error) throw error; revalidatePath('/workforce/recruitment/candidates')
}

export async function openCandidateDocument(
  candidateId: string,
  documentId: string,
): Promise<CandidateDocumentResult> {
  try {
    const access = await requireRecruitmentAccess({
      entityType: 'candidate',
      entityId: candidateId,
      allowedPermissions: ['workforce.candidates.read'],
    })
    const supabase = createSupabaseAdminClient()
    const { data: document, error } = await supabase
      .from('recruitment_candidate_documents')
      .select('id, candidate_id, document_class, storage_bucket, storage_path, original_filename, malware_scan_status')
      .eq('id', documentId)
      .eq('candidate_id', candidateId)
      .maybeSingle<{
        id: string
        candidate_id: string
        document_class: string
        storage_bucket: string
        storage_path: string
        original_filename: string | null
        malware_scan_status: string
      }>()
    if (error) throw error
    if (!document || ['quarantined', 'failed'].includes(document.malware_scan_status)) {
      return { ok: false, error: NOT_VISIBLE }
    }

    const restricted = ['offer_confidential', 'identity_document', 'background_check', 'employee_transfer', 'restricted'].includes(document.document_class)
    if (restricted) {
      const permissions = await getCallerPermissions()
      if (!permissions.has('recruitment.candidate.sensitive') && !permissions.has('platform.admin')) {
        return { ok: false, error: NOT_VISIBLE }
      }
    }

    const { data: signed, error: signError } = await supabase.storage
      .from(document.storage_bucket)
      .createSignedUrl(document.storage_path, SIGNED_URL_TTL_SECONDS)
    if (signError || !signed) throw signError ?? new Error('Signing failed')

    const { error: accessError } = await supabase.from('recruitment_document_access_events').insert({
      document_id: document.id,
      actor_employee_id: access.employeeId,
      actor_type: 'employee',
      action: 'view',
      reason: 'candidate_profile_review',
    })
    if (accessError) throw accessError

    return {
      ok: true,
      url: signed.signedUrl,
      fileName: document.original_filename || 'candidate-document',
    }
  } catch (error) {
    logDbError('recruitment.candidate_document.open', error, { candidateId, documentId })
    return { ok: false, error: NOT_VISIBLE }
  }
}

export async function addCandidateNote(
  candidateId: string,
  _previous: CandidateActionState,
  formData: FormData,
): Promise<CandidateActionState> {
  try {
    const access = await requireRecruitmentAccess({
      entityType: 'candidate',
      entityId: candidateId,
      allowedPermissions: ['workforce.candidates.write'],
    })
    const body = text(formData, 'body')
    const visibility = text(formData, 'visibility') || 'recruiting_team'
    if (body.length < 1 || body.length > 5000) return { ok: false, message: 'Enter a note of up to 5,000 characters.' }
    if (!['recruiting_team', 'hiring_team', 'private'].includes(visibility)) {
      return { ok: false, message: 'Choose a valid note visibility.' }
    }
    const supabase = createSupabaseAdminClient()
    const { error } = await supabase.from('recruitment_candidate_notes').insert({
      candidate_id: candidateId,
      author_employee_id: access.employeeId,
      body,
      visibility,
    })
    if (error) throw error
    revalidatePath(`/workforce/recruitment/candidates/${candidateId}`)
    return { ok: true, message: 'Note added.' }
  } catch (error) {
    logDbError('recruitment.candidate_note.add', error, { candidateId })
    return { ok: false, message: 'The note could not be saved.' }
  }
}
