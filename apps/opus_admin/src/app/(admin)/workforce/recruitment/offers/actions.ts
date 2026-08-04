'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getCallerEmployeeId, requirePermission } from '@/lib/admin-auth'
import { logDbError } from '@/lib/log-safe'
import { requireRecruitmentAccess } from '@/lib/recruitment-auth'
import { renderOfferPdfBuffer } from '@/lib/recruitment-offer-pdf'

function text(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

export async function submitOfferForApproval(offerId: string): Promise<void> {
  const access = await requireRecruitmentAccess({ entityType: 'offer', entityId: offerId, allowedPermissions: ['workforce.offers.create'] })
  const supabase = createSupabaseAdminClient()
  const { data: offer, error } = await supabase.from('recruitment_offers').select('*, recruitment_applications(recruitment_candidates(full_name))').eq('id', offerId).single()
  if (error) throw error
  if (!['draft', 'changes_requested'].includes(offer.status)) throw new Error('Offer is not ready for submission.')
  const nextVersion = offer.status === 'changes_requested' ? Number(offer.version) + 1 : Number(offer.version)
  const application = Array.isArray(offer.recruitment_applications) ? offer.recruitment_applications[0] : offer.recruitment_applications
  const candidate = Array.isArray(application?.recruitment_candidates) ? application.recruitment_candidates[0] : application?.recruitment_candidates
  let managerName: string | null = null
  if (offer.manager_employee_id) {
    const { data: manager } = await supabase.from('workforce_employees').select('full_name').eq('id', offer.manager_employee_id).maybeSingle<{ full_name: string }>()
    managerName = manager?.full_name ?? null
  }
  const pdf = await renderOfferPdfBuffer({
    offerNumber: offer.offer_number, version: nextVersion, candidateName: candidate?.full_name ?? 'Candidate',
    jobTitle: offer.job_title, department: offer.department, managerName, startDate: offer.start_date,
    employmentType: offer.employment_type, location: offer.location, workplaceType: offer.workplace_type,
    baseSalary: Number(offer.base_salary), currency: offer.currency, payFrequency: offer.pay_frequency,
    workingHours: offer.working_hours, contractDuration: offer.contract_duration,
    probationTerms: offer.probation_terms, conditions: offer.conditions ?? [], expiresAt: offer.expires_at,
  })
  const path = `offers/${offerId}/v${nextVersion}/offer-letter.pdf`
  const { error: uploadError } = await supabase.storage.from('candidate-offers').upload(path, pdf, { contentType: 'application/pdf', upsert: true })
  if (uploadError) throw uploadError
  const sha256 = createHash('sha256').update(pdf).digest('hex')
  const { data: document, error: documentError } = await supabase.from('recruitment_offer_documents').upsert({
    offer_id: offerId, document_type: 'offer_letter', storage_bucket: 'candidate-offers', storage_path: path,
    mime_type: 'application/pdf', byte_size: pdf.byteLength, sha256, signature_status: 'pending',
  }, { onConflict: 'storage_bucket,storage_path' }).select('id').single<{ id: string }>()
  if (documentError) {
    await supabase.storage.from('candidate-offers').remove([path])
    throw documentError
  }
  const { error: rpcError } = await supabase.rpc('recruitment_submit_offer_for_approval', { p_offer_id: offerId, p_actor_employee_id: access.employeeId })
  if (rpcError) {
    await supabase.from('recruitment_offer_documents').delete().eq('id', document.id)
    await supabase.storage.from('candidate-offers').remove([path])
    throw rpcError
  }
  const { data: version, error: versionError } = await supabase.from('recruitment_offer_versions').select('id').eq('offer_id', offerId).eq('version', nextVersion).single<{ id: string }>()
  if (versionError) throw versionError
  const { error: linkError } = await supabase.from('recruitment_offer_documents').update({ offer_version_id: version.id }).eq('id', document.id)
  if (linkError) throw linkError
  await supabase.from('recruitment_offer_versions').update({ document_storage_path: path }).eq('id', version.id)
  revalidatePath(`/workforce/recruitment/offers/${offerId}`)
  revalidatePath('/workforce/recruitment/offers')
}

export async function decideOfferStep(offerId: string, decision: 'approved' | 'changes_requested' | 'rejected', formData: FormData): Promise<void> {
  const access = await requireRecruitmentAccess({ entityType: 'offer', entityId: offerId, allowedPermissions: ['workforce.offers.approve'] })
  const supabase = createSupabaseAdminClient()
  const { data: step, error } = await supabase.from('recruitment_offer_approvals').select('id').eq('offer_id', offerId).eq('status', 'pending').order('sequence').limit(1).maybeSingle<{ id: string }>()
  if (error) throw error
  if (!step) throw new Error('No offer approval is pending.')
  const { error: rpcError } = await supabase.rpc('recruitment_decide_offer_step', {
    p_offer_id: offerId, p_step_id: step.id, p_decision: decision,
    p_note: text(formData, 'note') || null, p_actor_employee_id: access.employeeId,
  })
  if (rpcError) throw rpcError
  revalidatePath(`/workforce/recruitment/offers/${offerId}`)
  revalidatePath('/workforce/recruitment/offers')
}

export async function sendApprovedOffer(offerId: string): Promise<void> {
  const access = await requireRecruitmentAccess({ entityType: 'offer', entityId: offerId, allowedPermissions: ['workforce.offers.send'] })
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.rpc('recruitment_send_approved_offer', { p_offer_id: offerId, p_actor_employee_id: access.employeeId })
  if (error) throw error
  revalidatePath(`/workforce/recruitment/offers/${offerId}`)
  revalidatePath('/workforce/recruitment/offers')
}

export async function reviseOffer(offerId: string, formData: FormData): Promise<void> {
  await requireRecruitmentAccess({ entityType: 'offer', entityId: offerId, allowedPermissions: ['workforce.offers.create'] })
  const salary = Number(text(formData, 'base_salary'))
  if (!Number.isSafeInteger(salary) || salary < 0) throw new Error('Enter a valid salary.')
  const conditions = text(formData, 'conditions').split('\n').map((value) => value.trim()).filter(Boolean)
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('recruitment_offers').update({
    base_salary: salary,
    start_date: text(formData, 'start_date') || null,
    expires_at: text(formData, 'expires_on') ? `${text(formData, 'expires_on')}T14:00:00.000Z` : null,
    working_hours: text(formData, 'working_hours') || null,
    contract_duration: text(formData, 'contract_duration') || null,
    probation_terms: text(formData, 'probation_terms') || null,
    conditions,
  }).eq('id', offerId).in('status', ['draft', 'changes_requested'])
  if (error) throw error
  revalidatePath(`/workforce/recruitment/offers/${offerId}`)
}

export async function addOfferComponent(offerId: string, formData: FormData): Promise<void> {
  await requireRecruitmentAccess({ entityType: 'offer', entityId: offerId, allowedPermissions: ['workforce.offers.create'] })
  const label = text(formData, 'label')
  const componentType = text(formData, 'component_type')
  const amountRaw = text(formData, 'amount')
  const amount = amountRaw ? Number(amountRaw) : null
  if (label.length < 2 || !['allowance', 'bonus', 'benefit', 'equity', 'reimbursement', 'other'].includes(componentType)) throw new Error('Enter a valid offer component.')
  if (amount != null && (!Number.isSafeInteger(amount) || amount < 0)) throw new Error('Enter a valid component amount.')
  const supabase = createSupabaseAdminClient()
  const { data: offer, error: offerError } = await supabase.from('recruitment_offers').select('status').eq('id', offerId).single<{ status: string }>()
  if (offerError) throw offerError
  if (!['draft', 'changes_requested'].includes(offer.status)) throw new Error('Approved terms cannot be edited.')
  const { error } = await supabase.from('recruitment_offer_components').insert({ offer_id: offerId, component_type: componentType, label, amount, currency: 'TZS', frequency: text(formData, 'frequency') || null, details: text(formData, 'details') || null })
  if (error) throw error
  revalidatePath(`/workforce/recruitment/offers/${offerId}`)
}

export async function openOfferDocument(offerId: string, documentId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    await requireRecruitmentAccess({ entityType: 'offer', entityId: offerId, allowedPermissions: ['workforce.offers.read'] })
    await requirePermission('workforce.offers.compensation_read')
    const supabase = createSupabaseAdminClient()
    const { data: document, error } = await supabase.from('recruitment_offer_documents').select('storage_bucket, storage_path').eq('id', documentId).eq('offer_id', offerId).maybeSingle<{ storage_bucket: string; storage_path: string }>()
    if (error || !document) return { ok: false, error: 'That offer document is not available.' }
    const { data, error: signError } = await supabase.storage.from(document.storage_bucket).createSignedUrl(document.storage_path, 60)
    if (signError || !data) throw signError
    return { ok: true, url: data.signedUrl }
  } catch (error) {
    logDbError('recruitment.offer_document.open', error, { offerId, documentId, employeeId: await getCallerEmployeeId() })
    return { ok: false, error: 'That offer document is not available.' }
  }
}

export async function updatePreHireCheck(offerId: string, checkId: string, formData: FormData): Promise<void> {
  const access = await requireRecruitmentAccess({ entityType: 'offer', entityId: offerId, allowedPermissions: ['workforce.offers.approve'] })
  const status = text(formData, 'status')
  if (!['pending', 'in_progress', 'passed', 'review_required', 'failed', 'waived', 'cancelled'].includes(status)) throw new Error('Invalid check status.')
  const supabase = createSupabaseAdminClient()
  const { data: conversion, error: conversionError } = await supabase.from('recruitment_hiring_conversions').select('id').eq('offer_id', offerId).single<{ id: string }>()
  if (conversionError) throw conversionError
  const { error } = await supabase.from('recruitment_pre_hire_checks').update({ status, result_note: text(formData, 'result_note') || null, assigned_to: access.employeeId, completed_at: ['passed', 'failed', 'waived', 'cancelled'].includes(status) ? new Date().toISOString() : null }).eq('id', checkId).eq('conversion_id', conversion.id)
  if (error) throw error
  await supabase.from('recruitment_audit_events').insert({ event_type: 'pre_hire_check.updated', entity_type: 'hiring_conversion', entity_id: conversion.id, actor_type: 'employee', metadata: { check_id: checkId, status, actor_employee_id: access.employeeId } })
  revalidatePath(`/workforce/recruitment/offers/${offerId}`)
}

export async function convertCandidateToEmployee(offerId: string): Promise<void> {
  const access = await requireRecruitmentAccess({ entityType: 'offer', entityId: offerId, allowedPermissions: ['workforce.offers.approve'] })
  const supabase = createSupabaseAdminClient()
  const { data: conversion, error: lookupError } = await supabase.from('recruitment_hiring_conversions').select('id').eq('offer_id', offerId).single<{ id: string }>()
  if (lookupError) throw lookupError
  const { error } = await supabase.rpc('recruitment_convert_candidate_to_employee', { p_conversion_id: conversion.id, p_actor_employee_id: access.employeeId })
  if (error) throw error
  revalidatePath(`/workforce/recruitment/offers/${offerId}`)
  revalidatePath('/workforce/employees')
}

export async function savePostHireReview(offerId: string, formData: FormData): Promise<void> {
  const access = await requireRecruitmentAccess({ entityType: 'offer', entityId: offerId, allowedPermissions: ['workforce.recruitment_reports.read'] }); const period = text(formData, 'review_period')
  if (!['30_days', '90_days', 'probation', 'six_months'].includes(period)) throw new Error('Choose a valid review period.')
  const satisfaction = text(formData, 'hiring_manager_satisfaction') ? Number(text(formData, 'hiring_manager_satisfaction')) : null; if (satisfaction != null && (!Number.isFinite(satisfaction) || satisfaction < 0 || satisfaction > 5)) throw new Error('Satisfaction must be between 0 and 5.')
  const db = createSupabaseAdminClient(); const { data: conversion, error: conversionError } = await db.from('recruitment_hiring_conversions').select('id, application_id').eq('offer_id', offerId).eq('status', 'converted').single(); if (conversionError) throw conversionError
  const { error } = await db.from('recruitment_post_hire_reviews').upsert({ conversion_id: conversion.id, review_period: period, reviewer_employee_id: access.employeeId, hiring_manager_satisfaction: satisfaction, performance_outcome: text(formData, 'performance_outcome') || null, retention_status: text(formData, 'retention_status') || null, source_quality_note: text(formData, 'source_quality_note') || null, restricted_notes: text(formData, 'restricted_notes') || null, reviewed_at: new Date().toISOString() }, { onConflict: 'conversion_id,review_period' }); if (error) throw error
  if (period === 'probation') { const { data: referral } = await db.from('recruitment_referrals').select('id').eq('application_id', conversion.application_id).eq('status', 'hired').maybeSingle(); if (referral) await db.from('recruitment_referral_rewards').update({ status: 'eligible', eligibility_date: new Date().toISOString().slice(0, 10) }).eq('referral_id', referral.id).eq('status', 'pending') }
  await db.from('recruitment_audit_events').insert({ event_type: 'post_hire.reviewed', entity_type: 'hiring_conversion', entity_id: conversion.id, actor_type: 'employee', metadata: { actor_employee_id: access.employeeId, review_period: period, changed_fields: ['hiring_manager_satisfaction', 'performance_outcome', 'retention_status', 'source_quality_note'] } }); revalidatePath(`/workforce/recruitment/offers/${offerId}`); revalidatePath('/workforce/recruitment/reports')
}
