'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { logDbError } from '@/lib/log-safe'
import { requireWorkspaceCapability } from '@/lib/workspace/guards'
import { toSafeMessage } from '@/lib/workspace/errors'

const MAX_CV_BYTES = 10 * 1024 * 1024
const CV_TYPES = new Map([
  ['application/pdf', 'pdf'],
  ['application/msword', 'doc'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
])

export type ReferralActionState = {
  status: 'idle' | 'error' | 'success'
  message: string | null
  reference?: string
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

async function validateCv(file: File): Promise<{ extension: string; bytes: ArrayBuffer }> {
  if (file.size > MAX_CV_BYTES) throw new Error('The CV must be 10 MB or smaller.')
  const extension = CV_TYPES.get(file.type)
  if (!extension) throw new Error('Upload the CV as a PDF, DOC or DOCX file.')
  const bytes = await file.arrayBuffer()
  const head = new Uint8Array(bytes.slice(0, 8))
  const valid =
    (extension === 'pdf' && String.fromCharCode(...head.slice(0, 4)) === '%PDF') ||
    (extension === 'doc' &&
      [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every(
        (value, index) => head[index] === value,
      )) ||
    (extension === 'docx' && head[0] === 0x50 && head[1] === 0x4b)
  if (!valid) throw new Error('The uploaded CV does not match its declared file type.')
  return { extension, bytes }
}

export async function submitEmployeeReferral(
  _previousState: ReferralActionState,
  formData: FormData,
): Promise<ReferralActionState> {
  let uploadedPath: string | null = null
  try {
    const { employee } = await requireWorkspaceCapability('workspace.write', {
      action: 'referrals.submit',
    })
    const jobId = field(formData, 'jobId')
    const candidateName = field(formData, 'candidateName')
    const candidateEmail = field(formData, 'candidateEmail').toLowerCase()
    const relationship = field(formData, 'relationship')
    const endorsement = field(formData, 'endorsement')
    const conflictDisclosure = field(formData, 'conflictDisclosure')
    const cv = formData.get('cv')

    if (!isUuid(jobId)) return { status: 'error', message: 'Choose an open opportunity.' }
    if (candidateName.length < 2 || candidateName.length > 120) {
      return { status: 'error', message: 'Enter the candidate’s full name.' }
    }
    if (!isEmail(candidateEmail) || candidateEmail.length > 200) {
      return { status: 'error', message: 'Enter a valid candidate email address.' }
    }
    if (relationship.length < 2 || relationship.length > 120) {
      return { status: 'error', message: 'Describe how you know the candidate.' }
    }
    if (endorsement.length < 10 || endorsement.length > 3000) {
      return { status: 'error', message: 'Add a short endorsement of at least 10 characters.' }
    }
    if (conflictDisclosure.length > 1000) {
      return { status: 'error', message: 'Keep the conflict disclosure under 1,000 characters.' }
    }
    if (formData.get('candidateConsent') !== 'on') {
      return {
        status: 'error',
        message: 'Confirm that the candidate agreed to share their details with OpusFesta.',
      }
    }

    const supabase = createSupabaseAdminClient()
    let upload: {
      bucket: string | null
      path: string | null
      filename: string | null
      mimeType: string | null
      byteSize: number | null
    } = { bucket: null, path: null, filename: null, mimeType: null, byteSize: null }

    if (cv instanceof File && cv.size > 0) {
      const { extension, bytes } = await validateCv(cv)
      uploadedPath = `referrals/${employee.id}/${randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('careers').upload(uploadedPath, bytes, {
        contentType: cv.type,
        upsert: false,
      })
      if (uploadError) throw uploadError
      upload = {
        bucket: 'careers',
        path: uploadedPath,
        filename: cv.name.slice(0, 255),
        mimeType: cv.type,
        byteSize: cv.size,
      }
    }

    const { data, error } = await supabase.rpc('recruitment_submit_employee_referral', {
      p_referrer_employee_id: employee.id,
      p_job_id: jobId,
      p_candidate_name: candidateName,
      p_candidate_email: candidateEmail,
      p_relationship: relationship,
      p_endorsement: endorsement,
      p_conflict_disclosure: conflictDisclosure || null,
      p_resume_storage_bucket: upload.bucket,
      p_resume_storage_path: upload.path,
      p_resume_original_filename: upload.filename,
      p_resume_mime_type: upload.mimeType,
      p_resume_byte_size: upload.byteSize,
    })
    if (error) {
      if (uploadedPath) await supabase.storage.from('careers').remove([uploadedPath])
      if (error.code === '23505') {
        return {
          status: 'error',
          message: 'This person is already connected to that vacancy. People Ops can help if this seems wrong.',
        }
      }
      if (error.code === '23514') {
        return { status: 'error', message: 'That vacancy is no longer accepting referrals.' }
      }
      throw error
    }

    const result = Array.isArray(data) ? data[0] : data
    const reference = result && typeof result === 'object' && 'referral_reference' in result
      ? String(result.referral_reference)
      : undefined
    revalidatePath('/workspace/referrals')
    return {
      status: 'success',
      message: 'Referral submitted. We’ll keep the candidate’s hiring details confidential.',
      reference,
    }
  } catch (error) {
    if (uploadedPath) {
      try {
        await createSupabaseAdminClient().storage.from('careers').remove([uploadedPath])
      } catch {
        // Retention processing can reconcile an orphan if storage is temporarily unavailable.
      }
    }
    logDbError('workspace.referrals.submit', error)
    return { status: 'error', message: toSafeMessage(error) }
  }
}

export async function addEmployeeReferralNote(
  _previousState: ReferralActionState,
  formData: FormData,
): Promise<ReferralActionState> {
  try {
    const { employee } = await requireWorkspaceCapability('workspace.write', {
      action: 'referrals.note',
    })
    const referralId = field(formData, 'referralId')
    const note = field(formData, 'note')
    if (!isUuid(referralId) || note.length < 1 || note.length > 2000) {
      return { status: 'error', message: 'Enter a note of up to 2,000 characters.' }
    }
    const supabase = createSupabaseAdminClient()
    const { error } = await supabase.rpc('recruitment_add_employee_referral_note', {
      p_referral_id: referralId,
      p_author_employee_id: employee.id,
      p_body: note,
    })
    if (error) throw error
    revalidatePath('/workspace/referrals')
    return { status: 'success', message: 'Note added.' }
  } catch (error) {
    logDbError('workspace.referrals.note', error)
    return { status: 'error', message: toSafeMessage(error) }
  }
}
