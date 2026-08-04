'use server'

import { randomUUID } from 'node:crypto'
import { createSupabaseServerClient } from '@/lib/supabase'
import type { CareersFormState } from '@/lib/career-form-state'

const CAREERS_PRIVACY_NOTICE_VERSION = 'careers-2026-08-02'

const MAX_RESUME_BYTES = 10 * 1024 * 1024
const RESUME_TYPES = new Map([
  ['application/pdf', 'pdf'],
  ['application/msword', 'doc'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
])

function textField(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function optionalUrl(value: string): boolean {
  if (!value) return true
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
}

async function validateResume(file: File): Promise<{ extension: string; bytes: ArrayBuffer }> {
  if (!file.name || file.size === 0) throw new Error('Please attach your CV or résumé.')
  if (file.size > MAX_RESUME_BYTES) throw new Error('Your CV must be 10 MB or smaller.')
  const extension = RESUME_TYPES.get(file.type)
  if (!extension) throw new Error('Upload your CV as a PDF, DOC or DOCX file.')

  const bytes = await file.arrayBuffer()
  const head = new Uint8Array(bytes.slice(0, 8))
  const isPdf = extension === 'pdf' && String.fromCharCode(...head.slice(0, 4)) === '%PDF'
  const isDoc =
    extension === 'doc' &&
    [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every(
      (value, index) => head[index] === value,
    )
  const isDocx = extension === 'docx' && head[0] === 0x50 && head[1] === 0x4b
  if (!isPdf && !isDoc && !isDocx) {
    throw new Error('The uploaded file does not match its declared document type.')
  }
  return { extension, bytes }
}

async function uploadResume(options: {
  file: File
  folder: 'applications' | 'talent-community'
  scopeId: string
}): Promise<string> {
  const { extension, bytes } = await validateResume(options.file)
  const path = `${options.folder}/${options.scopeId}/${randomUUID()}.${extension}`
  const supabase = createSupabaseServerClient()
  const { error } = await supabase.storage.from('careers').upload(path, bytes, {
    contentType: options.file.type,
    upsert: false,
  })
  if (error) throw new Error('We could not securely upload your CV. Please try again.')
  return path
}

async function removeUploadedResume(path: string): Promise<void> {
  const supabase = createSupabaseServerClient()
  await supabase.storage.from('careers').remove([path])
}

export async function submitJobApplication(
  _previousState: CareersFormState,
  formData: FormData,
): Promise<CareersFormState> {
  const jobId = textField(formData, 'jobId')
  const fullName = textField(formData, 'fullName')
  const preferredName = textField(formData, 'preferredName')
  const email = textField(formData, 'email').toLowerCase()
  const phone = textField(formData, 'phone')
  const country = textField(formData, 'country') || 'Tanzania'
  const city = textField(formData, 'city')
  const currentPosition = textField(formData, 'currentPosition')
  const currentOrganization = textField(formData, 'currentOrganization')
  const linkedinUrl = textField(formData, 'linkedinUrl')
  const portfolioUrl = textField(formData, 'portfolioUrl')
  const coverLetter = textField(formData, 'coverLetter')
  const salaryExpectation = textField(formData, 'salaryExpectation')
  const earliestStartDate = textField(formData, 'earliestStartDate') || null
  const yearsExperienceRaw = textField(formData, 'yearsExperience')
  const yearsExperience = yearsExperienceRaw ? Number(yearsExperienceRaw) : null
  const workAuthorizedRaw = textField(formData, 'workAuthorized')
  const weekendAvailableRaw = textField(formData, 'weekendAvailable')
  const resume = formData.get('resume')

  const fieldErrors: Record<string, string> = {}
  if (!isUuid(jobId)) fieldErrors.jobId = 'This vacancy is not available.'
  if (fullName.length < 2 || fullName.length > 120) fieldErrors.fullName = 'Enter your full name.'
  if (!isEmail(email) || email.length > 200) fieldErrors.email = 'Enter a valid email address.'
  if (phone.length < 7 || phone.length > 30) fieldErrors.phone = 'Enter a valid phone number.'
  if (city.length < 2 || city.length > 100) fieldErrors.city = 'Enter your city.'
  if (!optionalUrl(linkedinUrl)) fieldErrors.linkedinUrl = 'Enter a complete LinkedIn URL.'
  if (!optionalUrl(portfolioUrl)) fieldErrors.portfolioUrl = 'Enter a complete portfolio URL.'
  if (yearsExperience !== null && (!Number.isFinite(yearsExperience) || yearsExperience < 0 || yearsExperience > 60)) {
    fieldErrors.yearsExperience = 'Enter years of experience between 0 and 60.'
  }
  if (!['yes', 'no'].includes(workAuthorizedRaw)) {
    fieldErrors.workAuthorized = 'Choose whether you are authorized to work in Tanzania.'
  }
  if (!['yes', 'no'].includes(weekendAvailableRaw)) {
    fieldErrors.weekendAvailable = 'Choose your availability for weekend event work.'
  }
  if (formData.get('applicationConsent') !== 'on') {
    fieldErrors.applicationConsent = 'Consent is required to process your application.'
  }
  if (!(resume instanceof File) || resume.size === 0) fieldErrors.resume = 'Attach your CV or résumé.'

  if (Object.keys(fieldErrors).length > 0) {
    return { status: 'error', message: 'Check the highlighted fields and try again.', fieldErrors }
  }

  const supabase = createSupabaseServerClient()
  const { data: job, error: jobError } = await supabase
    .from('workforce_jobs')
    .select('id, title, status, closing_date')
    .eq('id', jobId)
    .maybeSingle<{ id: string; title: string; status: string; closing_date: string | null }>()
  if (jobError || !job || job.status !== 'Open') {
    return { status: 'error', message: 'This vacancy is no longer accepting applications.' }
  }
  if (job.closing_date && job.closing_date < new Date().toISOString().slice(0, 10)) {
    return { status: 'error', message: 'The application deadline for this vacancy has passed.' }
  }
  const { data: posting, error: postingError } = await supabase.from('recruitment_job_postings').select('id, status, visibility, publish_at, unpublish_at').eq('workforce_job_id', jobId).maybeSingle()
  const timestamp = Date.now()
  if (postingError || !posting || posting.status !== 'published' || !['public', 'unlisted'].includes(posting.visibility) || (posting.publish_at && Date.parse(posting.publish_at) > timestamp) || (posting.unpublish_at && Date.parse(posting.unpublish_at) <= timestamp)) {
    return { status: 'error', message: 'This vacancy is no longer accepting applications.' }
  }

  let resumePath = ''
  try {
    resumePath = await uploadResume({
      file: resume as File,
      folder: 'applications',
      scopeId: jobId,
    })
    const now = new Date().toISOString()
    const reference = `OF-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`
    const { data: candidate, error } = await supabase
      .from('workforce_candidates')
      .insert({
        job_id: jobId,
        full_name: fullName,
        preferred_name: preferredName || null,
        email,
        phone,
        country,
        city,
        current_position: currentPosition || null,
        current_organization: currentOrganization || null,
        years_experience: yearsExperience,
        linkedin_url: linkedinUrl || null,
        portfolio_url: portfolioUrl || null,
        resume_storage_path: resumePath,
        cover_letter: coverLetter || null,
        earliest_start_date: earliestStartDate,
        salary_expectation: salaryExpectation || null,
        work_authorized: workAuthorizedRaw === 'yes',
        weekend_available: weekendAvailableRaw === 'yes',
        stage: 'Applied',
        source: 'Careers Page',
        rating: 3,
        application_reference: reference,
        privacy_notice_version: CAREERS_PRIVACY_NOTICE_VERSION,
        application_consent_at: now,
        talent_pool_consent_at: formData.get('talentPoolConsent') === 'on' ? now : null,
        career_updates_consent_at: formData.get('careerUpdatesConsent') === 'on' ? now : null,
      })
      .select('id')
      .single<{ id: string }>()

    if (error) {
      await removeUploadedResume(resumePath)
      if (error.code === '23505') {
        return {
          status: 'error',
          message: 'An application using this email already exists for this role.',
        }
      }
      console.error('[careers] application insert failed', { code: error.code, jobId })
      return { status: 'error', message: 'We could not submit your application. Please try again.' }
    }

    const { error: auditError } = await supabase.from('recruitment_audit_events').insert({
      event_type: 'application.submitted',
      entity_type: 'workforce_candidate',
      entity_id: candidate.id,
      actor_type: 'candidate',
      metadata: { job_id: jobId, application_reference: reference, source: 'careers_page' },
    })
    if (auditError) console.error('[careers] audit insert failed', { code: auditError.code })

    const { data: canonicalApplication } = await supabase.from('recruitment_applications').select('id, candidate_id').eq('legacy_workforce_candidate_id', candidate.id).maybeSingle()
    if (canonicalApplication) {
      const utmSource = textField(formData, 'utmSource').slice(0, 120); const utmMedium = textField(formData, 'utmMedium').slice(0, 120); const utmCampaign = textField(formData, 'utmCampaign').slice(0, 200); const referrerUrl = textField(formData, 'referrerUrl').slice(0, 1000)
      await supabase.from('recruitment_application_sources').upsert({ application_id: canonicalApplication.id, source_type: utmSource ? 'campaign' : 'careers_site', source_name: utmSource || 'Careers website', campaign: utmCampaign || null, medium: utmMedium || null, referrer_url: referrerUrl || null, metadata: { immutable_original: true } }, { onConflict: 'application_id,source_type,source_name' })
      const body = `Hello ${preferredName || fullName.split(/\s+/)[0]},\n\nWe received your application for ${job.title}. Your reference is ${reference}. You can use the candidate portal to follow progress and complete any next steps.\n\nThank you,\nOpusFesta People Team`
      const { data: message } = await supabase.from('recruitment_messages').insert({ candidate_id: canonicalApplication.candidate_id, application_id: canonicalApplication.id, channel: 'email', subject: `Application received — ${job.title}`, body, status: 'queued', approval_status: 'not_required' }).select('id').single()
      if (message) await supabase.from('recruitment_message_recipients').insert({ message_id: message.id, recipient_type: 'to', address: email, display_name: fullName })
      await supabase.from('recruitment_candidate_notices').insert({ candidate_id: canonicalApplication.candidate_id, application_id: canonicalApplication.id, notice_type: 'application_received', title: 'Application received', body: `We received your application for ${job.title}. Reference: ${reference}.`, version: '1' })
    }

    return {
      status: 'success',
      message: `Your application for ${job.title} has been received.`,
      reference,
    }
  } catch (error) {
    if (resumePath) await removeUploadedResume(resumePath)
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'We could not submit your application.',
    }
  }
}

export async function joinTalentCommunity(
  _previousState: CareersFormState,
  formData: FormData,
): Promise<CareersFormState> {
  const fullName = textField(formData, 'fullName')
  const email = textField(formData, 'email').toLowerCase()
  const phone = textField(formData, 'phone')
  const location = textField(formData, 'location')
  const roleInterests = textField(formData, 'roleInterests')
  const experienceLevel = textField(formData, 'experienceLevel')
  const profileUrl = textField(formData, 'profileUrl')
  const preferredContactMethod = textField(formData, 'preferredContactMethod') || 'Email'
  const preferredDepartments = formData
    .getAll('preferredDepartments')
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)
  const resume = formData.get('resume')

  const fieldErrors: Record<string, string> = {}
  if (fullName.length < 2 || fullName.length > 120) fieldErrors.fullName = 'Enter your full name.'
  if (!isEmail(email) || email.length > 200) fieldErrors.email = 'Enter a valid email address.'
  if (!location) fieldErrors.location = 'Enter your location.'
  if (preferredDepartments.length === 0) {
    fieldErrors.preferredDepartments = 'Choose at least one team.'
  }
  if (!optionalUrl(profileUrl)) fieldErrors.profileUrl = 'Enter a complete portfolio or LinkedIn URL.'
  if (!['Email', 'Phone', 'WhatsApp'].includes(preferredContactMethod)) {
    fieldErrors.preferredContactMethod = 'Choose a contact method.'
  }
  if (formData.get('retentionConsent') !== 'on') {
    fieldErrors.retentionConsent = 'Consent is required to join the talent community.'
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { status: 'error', message: 'Check the highlighted fields and try again.', fieldErrors }
  }

  let resumePath: string | null = null
  try {
    if (resume instanceof File && resume.size > 0) {
      resumePath = await uploadResume({
        file: resume,
        folder: 'talent-community',
        scopeId: randomUUID(),
      })
    }
    const now = new Date().toISOString()
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('career_talent_prospects')
      .insert({
        full_name: fullName,
        email,
        phone: phone || null,
        location,
        preferred_departments: preferredDepartments,
        role_interests: roleInterests || null,
        experience_level: experienceLevel || null,
        linkedin_or_portfolio_url: profileUrl || null,
        resume_storage_path: resumePath,
        preferred_contact_method: preferredContactMethod,
        privacy_notice_version: CAREERS_PRIVACY_NOTICE_VERSION,
        retention_consent_at: now,
        career_updates_consent_at: formData.get('careerUpdatesConsent') === 'on' ? now : null,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) {
      if (resumePath) await removeUploadedResume(resumePath)
      console.error('[careers] talent community insert failed', { code: error.code })
      return { status: 'error', message: 'We could not save your profile. Please try again.' }
    }
    const { error: auditError } = await supabase.from('recruitment_audit_events').insert({
      event_type: 'talent_prospect.created',
      entity_type: 'career_talent_prospect',
      entity_id: data.id,
      actor_type: 'candidate',
      metadata: { preferred_departments: preferredDepartments },
    })
    if (auditError) console.error('[careers] talent audit insert failed', { code: auditError.code })
    return {
      status: 'success',
      message: 'You are in our talent community. We will be in touch when the right role opens.',
    }
  } catch (error) {
    if (resumePath) await removeUploadedResume(resumePath)
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'We could not save your profile.',
    }
  }
}
