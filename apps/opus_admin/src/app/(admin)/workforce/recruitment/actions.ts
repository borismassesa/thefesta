'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { requirePermission } from '@/lib/admin-auth'
import { requireRecruitmentAccess } from '@/lib/recruitment-auth'
import type {
  Candidate,
  Department,
  EmploymentType,
  JobStage,
  JobStatus,
  Location,
} from '../_lib/types'

const STAGES = new Set<JobStage>(['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'])
const STATUSES = new Set<JobStatus>(['Open', 'On hold', 'Closed'])
const SOURCES = new Set<Candidate['source']>([
  'LinkedIn',
  'Referral',
  'Careers Page',
  'Direct',
  'Brighter Monday',
])

export type CreateJobInput = {
  title: string
  department: Department
  location: Location
  type: EmploymentType
  hiringManager: string
  postedSalaryMinTzs: number
  postedSalaryMaxTzs: number
  description?: string
  workplaceType: 'On-site' | 'Hybrid' | 'Remote' | 'Field-based'
  experienceLevel: string
  closingDate?: string
  showSalary: boolean
  responsibilities?: string[]
  requirements?: string[]
}

export async function createJob(input: CreateJobInput): Promise<{ id: string }> {
  void input
  await requirePermission('workforce.jobs.publish')
  throw new Error('Create and approve a requisition before publishing a job.')
}

export async function setJobStatus(id: string, status: JobStatus): Promise<void> {
  if (!STATUSES.has(status)) throw new Error('Unknown job status.')
  await requireRecruitmentAccess({
    entityType: 'job',
    entityId: id,
    allowedPermissions: [status === 'Closed' ? 'workforce.jobs.archive' : 'workforce.jobs.publish'],
  })
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('workforce_jobs').update({ status }).eq('id', id)
  if (error) throw error
  revalidatePath('/workforce/recruitment')
  revalidatePath('/workforce/recruitment/jobs')
}

export async function addCandidate(input: {
  jobId: string
  name: string
  email: string
  source: Candidate['source']
  rating?: number
}): Promise<{ id: string }> {
  await requireRecruitmentAccess({
    entityType: 'job',
    entityId: input.jobId,
    allowedPermissions: ['workforce.candidates.write'],
  })
  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  if (name.length < 2) throw new Error('Candidate name is required.')
  if (!email.includes('@')) throw new Error('A valid email is required.')
  if (!SOURCES.has(input.source)) throw new Error('Unknown source.')

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_candidates')
    .insert({
      job_id: input.jobId,
      full_name: name,
      email,
      stage: 'Applied',
      source: input.source,
      rating: input.rating ?? 3,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new Error('This candidate is already in the pipeline for that role.')
    }
    throw error
  }
  revalidatePath('/workforce/recruitment')
  revalidatePath('/workforce/recruitment/jobs')
  return { id: data.id }
}

export async function moveCandidate(id: string, stage: JobStage): Promise<void> {
  if (!STAGES.has(stage)) throw new Error('Unknown stage.')
  if (stage === 'Rejected') throw new Error('Use the canonical application workspace to record a structured rejection reason and candidate-safe status.')
  if (stage === 'Hired') throw new Error('A candidate can be hired only after accepting an approved offer in the governed offer workflow.')
  const supabase = createSupabaseAdminClient()
  const { data: application, error: lookupError } = await supabase
    .from('recruitment_applications')
    .select('id')
    .eq('legacy_workforce_candidate_id', id)
    .maybeSingle<{ id: string }>()
  if (lookupError) throw lookupError
  if (!application) throw new Error('Canonical application record not found.')
  await requireRecruitmentAccess({
    entityType: 'application',
    entityId: application.id,
    allowedPermissions: ['workforce.applications.advance'],
  })
  const { error } = await supabase.from('workforce_candidates').update({ stage }).eq('id', id)
  if (error) throw error
  revalidatePath('/workforce/recruitment')
  revalidatePath('/workforce/recruitment/jobs')
}

export async function rateCandidate(id: string, rating: number): Promise<void> {
  if (rating < 1 || rating > 5) throw new Error('Rating must be 1–5.')
  const supabase = createSupabaseAdminClient()
  const { data: application, error: lookupError } = await supabase
    .from('recruitment_applications')
    .select('id')
    .eq('legacy_workforce_candidate_id', id)
    .maybeSingle<{ id: string }>()
  if (lookupError) throw lookupError
  if (!application) throw new Error('Canonical application record not found.')
  await requireRecruitmentAccess({
    entityType: 'application',
    entityId: application.id,
    allowedPermissions: ['workforce.applications.review'],
  })
  const { error } = await supabase
    .from('workforce_candidates')
    .update({ rating: Math.round(rating) })
    .eq('id', id)
  if (error) throw error
  revalidatePath('/workforce/recruitment')
  revalidatePath('/workforce/recruitment/jobs')
}
