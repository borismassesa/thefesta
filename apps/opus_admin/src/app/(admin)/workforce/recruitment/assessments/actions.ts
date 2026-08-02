'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { logDbError } from '@/lib/log-safe'
import { requireRecruitmentAccess } from '@/lib/recruitment-auth'

export type AssessmentReviewState = { ok: boolean; message: string | null }
export type AssessmentAttachmentResult = { ok: true; url: string } | { ok: false; error: string }
function text(formData: FormData, key: string): string { const value = formData.get(key); return typeof value === 'string' ? value.trim() : '' }

export async function reviewAssessment(assessmentId: string, _previous: AssessmentReviewState, formData: FormData): Promise<AssessmentReviewState> {
  try {
    const access = await requireRecruitmentAccess({ entityType: 'assessment', entityId: assessmentId, allowedPermissions: ['workforce.assessments.score'] })
    if (!access.employeeId) return { ok: false, message: 'Link your employee profile before reviewing.' }
    const score = Number(text(formData, 'score'))
    const recommendation = text(formData, 'recommendation')
    const comments = text(formData, 'comments')
    const integrityNote = text(formData, 'integrity_note')
    const submit = text(formData, 'intent') === 'submit'
    if (!Number.isFinite(score) || score < 0) return { ok: false, message: 'Enter a valid score.' }
    if (submit && (comments.length < 10 || !recommendation)) return { ok: false, message: 'Add review evidence and a recommendation.' }
    const supabase = createSupabaseAdminClient()
    const { data: assessment, error: assessmentError } = await supabase.from('recruitment_assessments').select('id, max_score, reviewer_employee_id, status').eq('id', assessmentId).single<{ id: string; max_score: number | null; reviewer_employee_id: string | null; status: string }>()
    if (assessmentError) throw assessmentError
    if (assessment.reviewer_employee_id && assessment.reviewer_employee_id !== access.employeeId) return { ok: false, message: 'This assessment is assigned to another reviewer.' }
    if (assessment.max_score != null && score > assessment.max_score) return { ok: false, message: `Score cannot exceed ${assessment.max_score}.` }
    const { data: submission, error: submissionError } = await supabase.from('recruitment_assessment_submissions').select('id').eq('assessment_id', assessmentId).order('attempt', { ascending: false }).limit(1).maybeSingle<{ id: string }>()
    if (submissionError) throw submissionError
    if (!submission) return { ok: false, message: 'The candidate has not submitted this assessment.' }
    const { data: existing, error: existingError } = await supabase.from('recruitment_assessment_reviews').select('status').eq('submission_id', submission.id).eq('reviewer_employee_id', access.employeeId).maybeSingle<{ status: string }>()
    if (existingError) throw existingError
    if (existing && ['submitted', 'locked'].includes(existing.status)) return { ok: false, message: 'Submitted assessment reviews are locked.' }
    const { error } = await supabase.from('recruitment_assessment_reviews').upsert({ submission_id: submission.id, reviewer_employee_id: access.employeeId, rubric_ratings: {}, score, recommendation, comments: comments || null, status: submit ? 'submitted' : 'draft', submitted_at: submit ? new Date().toISOString() : null }, { onConflict: 'submission_id,reviewer_employee_id' })
    if (error) throw error
    const { error: updateError } = await supabase.from('recruitment_assessments').update({ score, reviewer_employee_id: access.employeeId, integrity_note: integrityNote || null, status: submit ? 'reviewed' : assessment.status, reviewed_at: submit ? new Date().toISOString() : null }).eq('id', assessmentId)
    if (updateError) throw updateError
    if (submit) await supabase.from('recruitment_audit_events').insert({ event_type: 'assessment.reviewed', entity_type: 'assessment', entity_id: assessmentId, actor_type: 'employee', metadata: { reviewer_employee_id: access.employeeId, score, recommendation, automated_score: false } })
    revalidatePath(`/workforce/recruitment/assessments/${assessmentId}`)
    return { ok: true, message: submit ? 'Review submitted and locked.' : 'Review draft saved.' }
  } catch (error) {
    logDbError('recruitment.assessment.review', error, { assessmentId })
    return { ok: false, message: 'The assessment review could not be saved.' }
  }
}

// Resolves the object from the submission row, never from a string the caller
// handed us. A signed URL is a bearer token, so the path it covers has to come
// from a row the caller is provably entitled to: the submission is re-read here
// scoped to its owning assessment, and the path is read out of that row's
// storage_paths by index. Attachments have no row of their own, so the index
// into the array stands in for an attachment id.
export async function openAssessmentAttachment(assessmentId: string, submissionId: string, attachmentIndex: number): Promise<AssessmentAttachmentResult> {
  try {
    const access = await requireRecruitmentAccess({ entityType: 'assessment', entityId: assessmentId, allowedPermissions: ['workforce.assessments.read'] }); if (!Number.isInteger(attachmentIndex) || attachmentIndex < 0) return { ok: false, error: 'Attachment is unavailable.' }
    const db = createSupabaseAdminClient(); const { data: submission, error } = await db.from('recruitment_assessment_submissions').select('id, storage_paths').eq('id', submissionId).eq('assessment_id', assessmentId).maybeSingle<{ id: string; storage_paths: string[] | null }>(); if (error || !submission) return { ok: false, error: 'Attachment is unavailable.' }
    const storagePath = submission.storage_paths?.[attachmentIndex]; if (!storagePath) return { ok: false, error: 'Attachment is unavailable.' }
    const { data: signed, error: signError } = await db.storage.from('careers').createSignedUrl(storagePath, 60); if (signError || !signed) return { ok: false, error: 'Attachment is unavailable.' }
    const { error: logError } = await db.from('recruitment_assessment_access_events').insert({ assessment_id: assessmentId, actor_employee_id: access.employeeId, storage_path: storagePath, action: 'view', reason: 'assessment_review' }); if (logError) throw logError
    return { ok: true, url: signed.signedUrl }
  } catch (error) { logDbError('recruitment.assessment_attachment.open', error, { assessmentId }); return { ok: false, error: 'Attachment is unavailable.' } }
}
