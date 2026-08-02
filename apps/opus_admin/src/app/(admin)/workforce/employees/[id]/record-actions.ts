'use server'

// CRUD server actions for employee records — resume, skills, certifications,
// badges and onboarding documents. Each mutation gates on
// requirePermission('workforce.write') so admins and HR ('people-ops') can
// run them; everyone else is rejected before touching the DB.

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getCallerEmail, requirePermission } from '@/lib/admin-auth'
import type {
  DocumentStatus,
  ResumeEntryType,
  SkillCategory,
  SkillLevel,
} from '../../_lib/types'

const RESUME_TYPES = new Set<ResumeEntryType>(['experience', 'education', 'project'])
const SKILL_CATEGORIES = new Set<SkillCategory>(['language', 'soft', 'technical', 'other'])
const SKILL_LEVELS = new Set<SkillLevel>(['Beginner', 'Intermediate', 'Advanced', 'Expert'])
const DOC_STATUSES = new Set<DocumentStatus>([
  'pending',
  'sent',
  'signed',
  'approved',
  'rejected',
])

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

// File-storage constants — used by both record actions (delete cleanup)
// and the attachment helpers below. Bucket already exists from
// migration 042; the 10MB cap matches the bucket file_size_limit.
const BUCKET = 'employees'
const SIGNED_URL_TTL_SECONDS = 60 * 10
const MAX_FILE_BYTES = 10 * 1024 * 1024

export type RecordKind = 'resume' | 'certification' | 'badge' | 'document'

const RECORD_TABLES: Record<RecordKind, string> = {
  resume: 'workforce_employee_resume_entries',
  certification: 'workforce_employee_certifications',
  badge: 'workforce_employee_badges',
  document: 'workforce_employee_documents',
}

// recordKind arrives from the client, so test it with an own-property
// check: a plain `RECORD_TABLES[kind]` lookup answers truthily for
// inherited keys like 'constructor'.
function isRecordKind(value: unknown): value is RecordKind {
  return typeof value === 'string' && Object.hasOwn(RECORD_TABLES, value)
}

async function getCallerEmployeeId(): Promise<string | null> {
  const email = await getCallerEmail()
  if (!email) return null
  const supabase = createSupabaseAdminClient()
  const { data } = await supabase
    .from('workforce_employees')
    .select('id')
    .ilike('email', email)
    .maybeSingle<{ id: string }>()
  return data?.id ?? null
}

function revalidateEmployee(employeeId: string) {
  // Both the list (which reads the roster) and the specific detail page
  // need to re-render after each mutation so the UI matches the DB.
  revalidatePath('/workforce/employees')
  revalidatePath(`/workforce/employees/${employeeId}`)
}

// -----------------------------------------------------------------------------
// Resume entries
// -----------------------------------------------------------------------------

export type ResumeEntryInput = {
  entryType: ResumeEntryType
  title: string
  organization?: string | null
  location?: string | null
  startDate: string
  endDate?: string | null
  description?: string | null
}

function validateResumeInput(input: ResumeEntryInput) {
  assert(RESUME_TYPES.has(input.entryType), 'Pick a known entry type.')
  assert(input.title.trim().length > 1, 'Title is required.')
  assert(input.startDate, 'Start date is required.')
  if (input.endDate) {
    assert(input.endDate >= input.startDate, 'End date must be on or after start date.')
  }
}

export async function createResumeEntry(employeeId: string, input: ResumeEntryInput): Promise<void> {
  await requirePermission('workforce.write')
  validateResumeInput(input)
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('workforce_employee_resume_entries').insert({
    employee_id: employeeId,
    entry_type: input.entryType,
    title: input.title.trim(),
    organization: input.organization?.trim() || null,
    location: input.location?.trim() || null,
    start_date: input.startDate,
    end_date: input.endDate || null,
    description: input.description?.trim() || null,
  })
  if (error) throw error
  revalidateEmployee(employeeId)
}

export async function updateResumeEntry(
  employeeId: string,
  entryId: string,
  input: ResumeEntryInput,
): Promise<void> {
  await requirePermission('workforce.write')
  validateResumeInput(input)
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('workforce_employee_resume_entries')
    .update({
      entry_type: input.entryType,
      title: input.title.trim(),
      organization: input.organization?.trim() || null,
      location: input.location?.trim() || null,
      start_date: input.startDate,
      end_date: input.endDate || null,
      description: input.description?.trim() || null,
    })
    .eq('id', entryId)
    .eq('employee_id', employeeId)
  if (error) throw error
  revalidateEmployee(employeeId)
}

export async function deleteResumeEntry(employeeId: string, entryId: string): Promise<void> {
  await requirePermission('workforce.write')
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('workforce_employee_resume_entries')
    .delete()
    .eq('id', entryId)
    .eq('employee_id', employeeId)
  if (error) throw error
  revalidateEmployee(employeeId)
}

// -----------------------------------------------------------------------------
// Skills
// -----------------------------------------------------------------------------

export type SkillInput = {
  category: SkillCategory
  name: string
  level: SkillLevel
  proficiencyPercent: number
}

function validateSkill(input: SkillInput) {
  assert(SKILL_CATEGORIES.has(input.category), 'Pick a known skill category.')
  assert(SKILL_LEVELS.has(input.level), 'Pick a known skill level.')
  assert(input.name.trim().length > 0, 'Skill name is required.')
  assert(
    input.proficiencyPercent >= 0 && input.proficiencyPercent <= 100,
    'Proficiency must be between 0 and 100.',
  )
}

export async function createSkill(employeeId: string, input: SkillInput): Promise<void> {
  await requirePermission('workforce.write')
  validateSkill(input)
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('workforce_employee_skills').insert({
    employee_id: employeeId,
    category: input.category,
    name: input.name.trim(),
    level: input.level,
    proficiency_percent: Math.round(input.proficiencyPercent),
  })
  if (error) {
    // Friendlier message for the (employee, category, name) uniqueness
    // collision — the DB throws 23505 but the error text is unreadable.
    if ((error as { code?: string }).code === '23505') {
      throw new Error(`${input.name} is already listed under this category.`)
    }
    throw error
  }
  revalidateEmployee(employeeId)
}

export async function updateSkill(
  employeeId: string,
  skillId: string,
  input: SkillInput,
): Promise<void> {
  await requirePermission('workforce.write')
  validateSkill(input)
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('workforce_employee_skills')
    .update({
      category: input.category,
      name: input.name.trim(),
      level: input.level,
      proficiency_percent: Math.round(input.proficiencyPercent),
    })
    .eq('id', skillId)
    .eq('employee_id', employeeId)
  if (error) throw error
  revalidateEmployee(employeeId)
}

export async function deleteSkill(employeeId: string, skillId: string): Promise<void> {
  await requirePermission('workforce.write')
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('workforce_employee_skills')
    .delete()
    .eq('id', skillId)
    .eq('employee_id', employeeId)
  if (error) throw error
  revalidateEmployee(employeeId)
}

// -----------------------------------------------------------------------------
// Certifications
// -----------------------------------------------------------------------------

export type CertificationInput = {
  name: string
  issuingBody?: string | null
  issuedDate?: string | null
  expiresDate?: string | null
  credentialId?: string | null
  notes?: string | null
}

function validateCertification(input: CertificationInput) {
  assert(input.name.trim().length > 1, 'Certification name is required.')
  if (input.issuedDate && input.expiresDate) {
    assert(
      input.expiresDate >= input.issuedDate,
      'Expiry date must be on or after the issue date.',
    )
  }
}

export async function createCertification(
  employeeId: string,
  input: CertificationInput,
): Promise<void> {
  await requirePermission('workforce.write')
  validateCertification(input)
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('workforce_employee_certifications').insert({
    employee_id: employeeId,
    name: input.name.trim(),
    issuing_body: input.issuingBody?.trim() || null,
    issued_date: input.issuedDate || null,
    expires_date: input.expiresDate || null,
    credential_id: input.credentialId?.trim() || null,
    notes: input.notes?.trim() || null,
  })
  if (error) throw error
  revalidateEmployee(employeeId)
}

export async function updateCertification(
  employeeId: string,
  certId: string,
  input: CertificationInput,
): Promise<void> {
  await requirePermission('workforce.write')
  validateCertification(input)
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('workforce_employee_certifications')
    .update({
      name: input.name.trim(),
      issuing_body: input.issuingBody?.trim() || null,
      issued_date: input.issuedDate || null,
      expires_date: input.expiresDate || null,
      credential_id: input.credentialId?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .eq('id', certId)
    .eq('employee_id', employeeId)
  if (error) throw error
  revalidateEmployee(employeeId)
}

export async function deleteCertification(employeeId: string, certId: string): Promise<void> {
  await requirePermission('workforce.write')
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('workforce_employee_certifications')
    .delete()
    .eq('id', certId)
    .eq('employee_id', employeeId)
  if (error) throw error
  revalidateEmployee(employeeId)
}

// -----------------------------------------------------------------------------
// Badges
// -----------------------------------------------------------------------------

export type BadgeInput = {
  badgeKind: string
  name: string
  description?: string | null
  colorToken?: string | null
  awardedAt?: string | null
}

function validateBadge(input: BadgeInput) {
  assert(input.name.trim().length > 1, 'Badge name is required.')
  assert(input.badgeKind.trim().length > 0, 'Badge kind is required.')
}

export async function awardBadge(employeeId: string, input: BadgeInput): Promise<void> {
  await requirePermission('workforce.write')
  validateBadge(input)
  const supabase = createSupabaseAdminClient()
  const awardedBy = await getCallerEmployeeId()
  const { error } = await supabase.from('workforce_employee_badges').insert({
    employee_id: employeeId,
    badge_kind: input.badgeKind.trim(),
    name: input.name.trim(),
    description: input.description?.trim() || null,
    color_token: input.colorToken?.trim() || null,
    awarded_by: awardedBy,
    awarded_at: input.awardedAt || new Date().toISOString(),
  })
  if (error) throw error
  revalidateEmployee(employeeId)
}

export async function updateBadge(
  employeeId: string,
  badgeId: string,
  input: BadgeInput,
): Promise<void> {
  await requirePermission('workforce.write')
  validateBadge(input)
  const supabase = createSupabaseAdminClient()
  const patch: Record<string, unknown> = {
    badge_kind: input.badgeKind.trim(),
    name: input.name.trim(),
    description: input.description?.trim() || null,
    color_token: input.colorToken?.trim() || null,
  }
  if (input.awardedAt) patch.awarded_at = input.awardedAt
  const { error } = await supabase
    .from('workforce_employee_badges')
    .update(patch)
    .eq('id', badgeId)
    .eq('employee_id', employeeId)
  if (error) throw error
  revalidateEmployee(employeeId)
}

export async function revokeBadge(employeeId: string, badgeId: string): Promise<void> {
  await requirePermission('workforce.write')
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('workforce_employee_badges')
    .delete()
    .eq('id', badgeId)
    .eq('employee_id', employeeId)
  if (error) throw error
  revalidateEmployee(employeeId)
}

// -----------------------------------------------------------------------------
// Onboarding documents
// -----------------------------------------------------------------------------

export type CreateDocumentInput = {
  docType: string
  docLabel: string
  required?: boolean
}

export async function createDocument(
  employeeId: string,
  input: CreateDocumentInput,
): Promise<void> {
  await requirePermission('workforce.write')
  assert(input.docType.trim().length > 0, 'Document type is required.')
  assert(input.docLabel.trim().length > 1, 'Document label is required.')
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('workforce_employee_documents').insert({
    employee_id: employeeId,
    doc_type: input.docType.trim(),
    doc_label: input.docLabel.trim(),
    status: 'pending',
    required: input.required ?? true,
  })
  if (error) throw error
  revalidateEmployee(employeeId)
}

// Status transitions are central to the onboarding tracker — each move
// updates the corresponding timestamp so HR can see when the doc
// landed at each step. setDocumentStatus is the single chokepoint;
// dedicated mark* helpers below call it with the right enum so the
// call sites read like a verb list ("mark as sent", "mark as approved").
export async function setDocumentStatus(
  employeeId: string,
  docId: string,
  status: DocumentStatus,
  options?: { notes?: string | null; rejectionReason?: string | null },
): Promise<void> {
  await requirePermission('workforce.write')
  assert(DOC_STATUSES.has(status), 'Pick a known document status.')

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { status }

  if (status === 'sent') patch.sent_at = now
  if (status === 'signed') patch.signed_at = now
  if (status === 'approved' || status === 'rejected') {
    patch.reviewed_at = now
    patch.reviewed_by = await getCallerEmployeeId()
  }
  if (status !== 'rejected') {
    // Clear any prior rejection reason when transitioning out of rejected.
    patch.rejection_reason = options?.rejectionReason ?? null
  } else {
    patch.rejection_reason = options?.rejectionReason?.trim() || null
  }
  if (options?.notes !== undefined) {
    patch.notes = options.notes?.trim() || null
  }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('workforce_employee_documents')
    .update(patch)
    .eq('id', docId)
    .eq('employee_id', employeeId)
  if (error) throw error
  revalidateEmployee(employeeId)
}

export type UpdateDocumentInput = {
  docLabel?: string
  required?: boolean
  notes?: string | null
}

export async function updateDocument(
  employeeId: string,
  docId: string,
  input: UpdateDocumentInput,
): Promise<void> {
  await requirePermission('workforce.write')
  const patch: Record<string, unknown> = {}
  if (input.docLabel !== undefined) {
    assert(input.docLabel.trim().length > 1, 'Document label is required.')
    patch.doc_label = input.docLabel.trim()
  }
  if (input.required !== undefined) patch.required = input.required
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null
  if (Object.keys(patch).length === 0) return

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('workforce_employee_documents')
    .update(patch)
    .eq('id', docId)
    .eq('employee_id', employeeId)
  if (error) throw error
  revalidateEmployee(employeeId)
}

export async function deleteDocument(employeeId: string, docId: string): Promise<void> {
  await requirePermission('workforce.write')
  const supabase = createSupabaseAdminClient()
  // Best-effort delete the attached file too — leftover storage objects
  // are wasted bytes once the row that referenced them is gone.
  const { data: existing } = await supabase
    .from('workforce_employee_documents')
    .select('storage_path')
    .eq('id', docId)
    .eq('employee_id', employeeId)
    .maybeSingle<{ storage_path: string | null }>()
  if (existing?.storage_path) {
    await supabase.storage.from(BUCKET).remove([existing.storage_path]).catch(() => undefined)
  }
  const { error } = await supabase
    .from('workforce_employee_documents')
    .delete()
    .eq('id', docId)
    .eq('employee_id', employeeId)
  if (error) throw error
  revalidateEmployee(employeeId)
}

// -----------------------------------------------------------------------------
// Attachments — upload, remove, signed URL
// -----------------------------------------------------------------------------
// Files live in the existing `employees` Supabase storage bucket so we
// don't need a new bucket migration. Path convention:
//   `{employee_id}/{record_kind}/{record_id}/{timestamp}-{filename}`
// The timestamp prefix lets us keep history if the user re-uploads
// (the DB row only ever points to the latest file). Service-role
// admin client bypasses bucket RLS — gate is requirePermission.

function safeFilename(name: string): string {
  // Strip path traversal and weird chars; keep extension. Storage will
  // tolerate most of these, but a clean key reads better in audits.
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-180)
}

export async function uploadRecordAttachment(formData: FormData): Promise<void> {
  await requirePermission('workforce.write')

  const employeeId = formData.get('employeeId')
  const recordKind = formData.get('recordKind')
  const recordId = formData.get('recordId')
  const file = formData.get('file')

  // These three become the storage key below, so they're checked to the
  // shape the path convention assumes rather than just "non-empty".
  if (!isUuid(employeeId)) throw new Error('Missing employee id.')
  if (!isUuid(recordId)) throw new Error('Missing record id.')
  if (!isRecordKind(recordKind)) throw new Error('Unknown record kind.')
  const table = RECORD_TABLES[recordKind]
  if (!(file instanceof File)) throw new Error('No file provided.')
  if (file.size === 0) throw new Error('File is empty.')
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`File is larger than 10MB (${Math.round(file.size / 1024 / 1024)}MB).`)
  }

  const supabase = createSupabaseAdminClient()

  // Look up the existing attachment so we can delete the old file on
  // a successful re-upload (avoids orphaned objects piling up).
  const { data: existing } = await supabase
    .from(table)
    .select('storage_path')
    .eq('id', recordId)
    .eq('employee_id', employeeId)
    .maybeSingle<{ storage_path: string | null }>()

  const ext = file.name.includes('.') ? file.name.split('.').pop() : null
  const cleaned = safeFilename(file.name)
  const key = `${employeeId}/${recordKind}/${recordId}/${Date.now()}-${cleaned}${
    ext && !cleaned.endsWith(`.${ext}`) ? `.${ext}` : ''
  }`

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(key, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
  if (uploadErr) throw uploadErr

  const { error: updateErr } = await supabase
    .from(table)
    .update({
      storage_path: key,
      file_name: file.name,
      file_size_bytes: file.size,
      mime_type: file.type || null,
    })
    .eq('id', recordId)
    .eq('employee_id', employeeId)
  if (updateErr) {
    // Roll back the storage upload so we don't leave an orphaned file.
    await supabase.storage.from(BUCKET).remove([key]).catch(() => undefined)
    throw updateErr
  }

  if (existing?.storage_path && existing.storage_path !== key) {
    // Stale prior file — fire-and-forget; failure here doesn't unwind
    // the new upload, the user will see the latest file regardless.
    await supabase.storage
      .from(BUCKET)
      .remove([existing.storage_path])
      .catch((err) => console.warn('[workforce] stale attachment cleanup failed', err))
  }

  revalidateEmployee(employeeId)
}

export async function removeRecordAttachment(
  employeeId: string,
  recordKind: RecordKind,
  recordId: string,
): Promise<void> {
  await requirePermission('workforce.write')
  if (!isRecordKind(recordKind)) throw new Error('Unknown record kind.')
  const table = RECORD_TABLES[recordKind]
  const supabase = createSupabaseAdminClient()

  const { data: existing } = await supabase
    .from(table)
    .select('storage_path')
    .eq('id', recordId)
    .eq('employee_id', employeeId)
    .maybeSingle<{ storage_path: string | null }>()
  if (!existing?.storage_path) return

  // Clear the DB columns first so the UI immediately reflects the
  // missing attachment. Storage cleanup runs after.
  const { error } = await supabase
    .from(table)
    .update({
      storage_path: null,
      file_name: null,
      file_size_bytes: null,
      mime_type: null,
    })
    .eq('id', recordId)
    .eq('employee_id', employeeId)
  if (error) throw error

  await supabase.storage
    .from(BUCKET)
    .remove([existing.storage_path])
    .catch((err) => console.warn('[workforce] attachment removal failed', err))

  revalidateEmployee(employeeId)
}

export type AttachmentUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

// Identify the attachment by the record that owns it, never by a raw
// storage key. The `employees` bucket holds far more than these four
// record kinds, and the path convention
// (`{employee_id}/{record_kind}/{record_id}/…`) is guessable, so signing
// a caller-supplied path would let any workforce.read holder pull any
// object out of the bucket. Resolving the row first means the only paths
// we ever sign are ones the record tables actually point at.
export async function getRecordAttachmentUrl(
  employeeId: string,
  recordKind: RecordKind,
  recordId: string,
): Promise<AttachmentUrlResult> {
  // Reading is gated on workforce.read so any signed-in member of the
  // HR / admin team can preview, not just write-capable users.
  await requirePermission('workforce.read')

  if (!isRecordKind(recordKind)) return { ok: false, error: 'Unknown record kind.' }
  if (!isUuid(employeeId) || !isUuid(recordId)) {
    return { ok: false, error: 'Attachment not found.' }
  }
  const table = RECORD_TABLES[recordKind]

  const supabase = createSupabaseAdminClient()
  const { data: record, error: lookupErr } = await supabase
    .from(table)
    .select('storage_path')
    .eq('id', recordId)
    .eq('employee_id', employeeId)
    .maybeSingle<{ storage_path: string | null }>()

  // Collapse "no such row", "row belongs to another employee" and a
  // lookup failure into one answer so the response can't be used to
  // probe which record ids exist.
  if (lookupErr || !record?.storage_path) {
    return { ok: false, error: 'Attachment not found.' }
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(record.storage_path, SIGNED_URL_TTL_SECONDS)
  if (error || !data) {
    // The provider message can carry the storage key, which is the one thing
    // this function now refuses to accept as input. Log it, return a generic
    // string to the browser.
    console.error('[workforce] attachment signed URL failed', {
      employeeId,
      recordKind,
      reason: error?.message ?? 'unknown',
    })
    return { ok: false, error: 'Could not open that attachment.' }
  }
  return { ok: true, url: data.signedUrl }
}
