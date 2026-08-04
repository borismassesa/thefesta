import { createSupabaseAdminClient } from '@/lib/supabase'
import { getRecruitmentScope } from './queries'

export type RecruitmentCollectionRow = {
  id: string
  title: string
  subtitle: string
  status: string
  detail: string
  href?: string
}

const NONE = ['00000000-0000-0000-0000-000000000000']

export async function getWorkforcePlanRows(): Promise<RecruitmentCollectionRow[]> {
  const scope = await getRecruitmentScope()
  const supabase = createSupabaseAdminClient()
  let query = supabase
    .from('recruitment_workforce_plans')
    .select('id, name, fiscal_year, department, status, planned_headcount, approved_headcount, planned_budget_tzs')
    .order('fiscal_year', { ascending: false })
  if (!scope.organizationWide) {
    query = scope.departments.length ? query.in('department', scope.departments) : query.in('id', NONE)
  }
  const { data, error } = await query.returns<Array<{
    id: string; name: string; fiscal_year: number; department: string | null; status: string
    planned_headcount: number; approved_headcount: number; planned_budget_tzs: number
  }>>()
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.name,
    subtitle: `${row.department ?? 'Company'} · FY ${row.fiscal_year}`,
    status: row.status,
    detail: `${row.approved_headcount}/${row.planned_headcount} approved · TZS ${Number(row.planned_budget_tzs).toLocaleString()}`,
  }))
}

export async function getRequisitionRows(myOnly = false): Promise<RecruitmentCollectionRow[]> {
  const scope = await getRecruitmentScope()
  const supabase = createSupabaseAdminClient()
  let query = supabase
    .from('recruitment_requisitions')
    .select('id, requisition_number, title, department, location, status, headcount, openings_filled, target_start_date')
    .order('created_at', { ascending: false })
  if (!scope.organizationWide || myOnly) query = query.in('id', scope.requisitionIds.length ? scope.requisitionIds : NONE)
  const { data, error } = await query.returns<Array<{
    id: string; requisition_number: string; title: string; department: string; location: string
    status: string; headcount: number; openings_filled: number; target_start_date: string | null
  }>>()
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    subtitle: `${row.requisition_number} · ${row.department} · ${row.location}`,
    status: row.status,
    detail: `${row.openings_filled}/${row.headcount} openings filled${row.target_start_date ? ` · target ${row.target_start_date}` : ''}`,
    href: `/workforce/recruitment/requisitions/${row.id}`,
  }))
}

export async function getApplicationRows(): Promise<RecruitmentCollectionRow[]> {
  const scope = await getRecruitmentScope()
  const supabase = createSupabaseAdminClient()
  let query = supabase
    .from('recruitment_applications')
    .select('id, candidate_id, job_id, application_reference, status, source, submitted_at, last_stage_changed_at')
    .order('last_stage_changed_at', { ascending: false })
    .limit(250)
  if (!scope.organizationWide) query = query.in('id', scope.applicationIds.length ? scope.applicationIds : NONE)
  const { data, error } = await query.returns<Array<{
    id: string; candidate_id: string; job_id: string; application_reference: string; status: string
    source: string; submitted_at: string | null; last_stage_changed_at: string
  }>>()
  if (error) throw error
  const candidateIds = [...new Set((data ?? []).map((row) => row.candidate_id))]
  const jobIds = [...new Set((data ?? []).map((row) => row.job_id))]
  const [candidates, jobs] = await Promise.all([
    candidateIds.length
      ? supabase.from('recruitment_candidates').select('id, full_name, primary_email').in('id', candidateIds)
      : Promise.resolve({ data: [], error: null }),
    jobIds.length
      ? supabase.from('workforce_jobs').select('id, title').in('id', jobIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (candidates.error) throw candidates.error
  if (jobs.error) throw jobs.error
  const candidateMap = new Map((candidates.data ?? []).map((row) => [row.id, row]))
  const jobMap = new Map((jobs.data ?? []).map((row) => [row.id, row.title]))
  return (data ?? []).map((row) => {
    const candidate = candidateMap.get(row.candidate_id)
    return {
      id: row.id,
      title: candidate?.full_name ?? 'Candidate',
      subtitle: `${row.application_reference} · ${jobMap.get(row.job_id) ?? 'Job'} · ${candidate?.primary_email ?? ''}`,
      status: row.status,
      detail: `${row.source} · stage changed ${new Date(row.last_stage_changed_at).toLocaleDateString('en-TZ')}`,
      href: `/workforce/recruitment/applications/${row.id}`,
    }
  })
}

export async function getCandidateRows(): Promise<RecruitmentCollectionRow[]> {
  const scope = await getRecruitmentScope()
  const supabase = createSupabaseAdminClient()
  let candidateIds: string[] | null = null
  if (!scope.organizationWide) {
    if (scope.applicationIds.length === 0) candidateIds = NONE
    else {
      const { data, error } = await supabase
        .from('recruitment_applications')
        .select('candidate_id')
        .in('id', scope.applicationIds)
      if (error) throw error
      candidateIds = [...new Set((data ?? []).map((row) => row.candidate_id))]
    }
  }
  let query = supabase
    .from('recruitment_candidates')
    .select('id, full_name, primary_email, current_position, current_organization, city, status, last_activity_at')
    .order('last_activity_at', { ascending: false })
    .limit(250)
  if (candidateIds) query = query.in('id', candidateIds.length ? candidateIds : NONE)
  const { data, error } = await query.returns<Array<{
    id: string; full_name: string; primary_email: string; current_position: string | null
    current_organization: string | null; city: string | null; status: string; last_activity_at: string
  }>>()
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.full_name,
    subtitle: `${row.primary_email}${row.city ? ` · ${row.city}` : ''}`,
    status: row.status,
    detail: [row.current_position, row.current_organization].filter(Boolean).join(' at ') || 'Profile details pending',
    href: `/workforce/recruitment/candidates/${row.id}`,
  }))
}

export async function getInterviewRows(): Promise<RecruitmentCollectionRow[]> {
  const scope = await getRecruitmentScope()
  const supabase = createSupabaseAdminClient()
  let query = supabase
    .from('recruitment_interviews')
    .select('id, application_id, title, interview_type, status, starts_at, timezone, location')
    .order('starts_at', { ascending: true, nullsFirst: false })
    .limit(250)
  if (!scope.organizationWide) query = query.in('application_id', scope.applicationIds.length ? scope.applicationIds : NONE)
  const { data, error } = await query.returns<Array<{
    id: string; application_id: string; title: string; interview_type: string; status: string
    starts_at: string | null; timezone: string | null; location: string | null
  }>>()
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    subtitle: `${row.interview_type.replaceAll('_', ' ')}${row.location ? ` · ${row.location}` : ''}`,
    status: row.status,
    detail: row.starts_at ? `${new Date(row.starts_at).toLocaleString('en-TZ')} ${row.timezone ?? ''}` : 'Not scheduled',
    href: `/workforce/recruitment/interviews/${row.id}`,
  }))
}

export async function getAssessmentRows(): Promise<RecruitmentCollectionRow[]> {
  const scope = await getRecruitmentScope()
  const supabase = createSupabaseAdminClient()
  let query = supabase
    .from('recruitment_assessments')
    .select('id, application_id, title, assessment_type, provider, status, due_at, score, max_score')
    .order('created_at', { ascending: false })
    .limit(250)
  if (!scope.organizationWide) query = query.in('application_id', scope.applicationIds.length ? scope.applicationIds : NONE)
  const { data, error } = await query.returns<Array<{
    id: string; application_id: string; title: string; assessment_type: string; provider: string | null
    status: string; due_at: string | null; score: number | null; max_score: number | null
  }>>()
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    subtitle: `${row.assessment_type}${row.provider ? ` · ${row.provider}` : ''}`,
    status: row.status,
    detail: row.score == null ? (row.due_at ? `Due ${new Date(row.due_at).toLocaleDateString('en-TZ')}` : 'No due date') : `Score ${row.score}/${row.max_score ?? '—'}`,
    href: `/workforce/recruitment/assessments/${row.id}`,
  }))
}

export async function getOfferRows(): Promise<RecruitmentCollectionRow[]> {
  const scope = await getRecruitmentScope()
  const supabase = createSupabaseAdminClient()
  let query = supabase
    .from('recruitment_offers')
    .select('id, application_id, offer_number, job_title, status, start_date, expires_at, version')
    .order('created_at', { ascending: false })
    .limit(250)
  if (!scope.organizationWide) query = query.in('application_id', scope.applicationIds.length ? scope.applicationIds : NONE)
  const { data, error } = await query.returns<Array<{
    id: string; application_id: string; offer_number: string; job_title: string; status: string
    start_date: string | null; expires_at: string | null; version: number
  }>>()
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.job_title,
    subtitle: `${row.offer_number} · version ${row.version}`,
    status: row.status,
    detail: row.expires_at ? `Expires ${new Date(row.expires_at).toLocaleString('en-TZ')}` : (row.start_date ? `Starts ${row.start_date}` : 'Dates pending'),
    href: `/workforce/recruitment/offers/${row.id}`,
  }))
}

export async function getSimpleCollectionRows(
  kind: 'talent-pools' | 'referrals' | 'agencies' | 'career-content' | 'templates',
): Promise<RecruitmentCollectionRow[]> {
  const scope = await getRecruitmentScope()
  const supabase = createSupabaseAdminClient()
  if (kind === 'talent-pools') {
    const { data, error } = await supabase.from('recruitment_talent_pools').select('id, name, description, visibility, status').order('name')
    if (error) throw error
    return (data ?? []).map((row) => ({ id: row.id, title: row.name, subtitle: row.visibility, status: row.status, detail: row.description ?? 'No description' }))
  }
  if (kind === 'referrals') {
    let query = supabase.from('recruitment_referrals').select('id, referral_reference, candidate_name, candidate_email, job_id, status, created_at').order('created_at', { ascending: false })
    if (!scope.organizationWide) query = query.in('job_id', scope.jobIds.length ? scope.jobIds : NONE)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map((row) => ({ id: row.id, title: row.candidate_name, subtitle: `${row.referral_reference} · ${row.candidate_email}`, status: row.status, detail: `Submitted ${new Date(row.created_at).toLocaleDateString('en-TZ')}` }))
  }
  if (kind === 'agencies') {
    const { data, error } = await supabase.from('recruitment_agencies').select('id, name, contact_name, contact_email, status, fee_percent').order('name')
    if (error) throw error
    return (data ?? []).map((row) => ({ id: row.id, title: row.name, subtitle: [row.contact_name, row.contact_email].filter(Boolean).join(' · ') || 'No contact', status: row.status, detail: row.fee_percent == null ? 'Fee terms not set' : `${row.fee_percent}% placement fee` }))
  }
  if (kind === 'career-content') {
    const { data, error } = await supabase.from('careers_cms_pages').select('id, title, slug, locale, status, updated_at').order('updated_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map((row) => ({ id: row.id, title: row.title, subtitle: `/${row.slug} · ${row.locale}`, status: row.status, detail: `Updated ${new Date(row.updated_at).toLocaleDateString('en-TZ')}`, href: `/workforce/recruitment/career-content/${row.id}` }))
  }
  const { data, error } = await supabase.from('recruitment_message_templates').select('id, name, channel, category, language_code, status').order('name')
  if (error) throw error
  return (data ?? []).map((row) => ({ id: row.id, title: row.name, subtitle: `${row.category} · ${row.language_code}`, status: row.status, detail: row.channel.replaceAll('_', ' ') }))
}
