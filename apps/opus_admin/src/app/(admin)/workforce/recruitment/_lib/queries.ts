import { cache } from 'react'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getRecruitmentWorkspaceAccess } from '@/lib/recruitment-auth'

export type RecruitmentScope = {
  organizationWide: boolean
  employeeId: string | null
  requisitionIds: string[]
  jobIds: string[]
  applicationIds: string[]
  interviewIds: string[]
  departments: string[]
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

export const getRecruitmentScope = cache(async (): Promise<RecruitmentScope> => {
  const access = await getRecruitmentWorkspaceAccess()
  if (access.organizationWide) {
    return {
      ...access,
      requisitionIds: [],
      jobIds: [],
      applicationIds: [],
      interviewIds: [],
      departments: [],
    }
  }

  const employeeId = access.employeeId!
  const supabase = createSupabaseAdminClient()
  const [ownedReqs, approvals, teams, assignments, participants] = await Promise.all([
    supabase
      .from('recruitment_requisitions')
      .select('id, department')
      .or(`hiring_manager_employee_id.eq.${employeeId},recruiter_employee_id.eq.${employeeId},requested_by_employee_id.eq.${employeeId}`),
    supabase
      .from('recruitment_approval_steps')
      .select('requisition_id')
      .eq('approver_employee_id', employeeId),
    supabase
      .from('recruitment_team_assignments')
      .select('requisition_id, job_id, department')
      .eq('employee_id', employeeId)
      .lte('starts_at', new Date().toISOString())
      .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`),
    supabase
      .from('recruitment_application_assignments')
      .select('application_id')
      .eq('employee_id', employeeId)
      .or(`ended_at.is.null,ended_at.gt.${new Date().toISOString()}`),
    supabase
      .from('recruitment_interview_participants')
      .select('interview_id')
      .eq('employee_id', employeeId),
  ])

  for (const result of [ownedReqs, approvals, teams, assignments, participants]) {
    if (result.error) throw result.error
  }

  const departments = unique([
    ...(ownedReqs.data ?? []).map((row) => row.department),
    ...(teams.data ?? []).map((row) => row.department),
  ])
  let requisitionIds = unique([
    ...(ownedReqs.data ?? []).map((row) => row.id),
    ...(approvals.data ?? []).map((row) => row.requisition_id),
    ...(teams.data ?? []).map((row) => row.requisition_id),
  ])

  if (departments.length > 0) {
    const { data, error } = await supabase
      .from('recruitment_requisitions')
      .select('id')
      .in('department', departments)
    if (error) throw error
    requisitionIds = unique([...requisitionIds, ...(data ?? []).map((row) => row.id)])
  }

  let jobIds = unique((teams.data ?? []).map((row) => row.job_id))
  const jobFilters: string[] = []
  if (requisitionIds.length > 0) jobFilters.push(`requisition_id.in.(${requisitionIds.join(',')})`)
  if (departments.length > 0) jobFilters.push(`department.in.(${departments.map((value) => `"${value}"`).join(',')})`)
  if (jobFilters.length > 0) {
    const { data, error } = await supabase
      .from('workforce_jobs')
      .select('id')
      .or(jobFilters.join(','))
    if (error) throw error
    jobIds = unique([...jobIds, ...(data ?? []).map((row) => row.id)])
  }

  const interviewIds = unique((participants.data ?? []).map((row) => row.interview_id))
  let applicationIds = unique((assignments.data ?? []).map((row) => row.application_id))
  if (interviewIds.length > 0) {
    const { data, error } = await supabase
      .from('recruitment_interviews')
      .select('application_id')
      .in('id', interviewIds)
    if (error) throw error
    applicationIds = unique([...applicationIds, ...(data ?? []).map((row) => row.application_id)])
  }

  if (applicationIds.length > 0) {
    const { data, error } = await supabase
      .from('recruitment_applications')
      .select('job_id')
      .in('id', applicationIds)
    if (error) throw error
    jobIds = unique([...jobIds, ...(data ?? []).map((row) => row.job_id)])
  }

  if (jobIds.length > 0) {
    const { data, error } = await supabase
      .from('recruitment_applications')
      .select('id')
      .in('job_id', jobIds)
    if (error) throw error
    applicationIds = unique([...applicationIds, ...(data ?? []).map((row) => row.id)])
  }

  return {
    ...access,
    requisitionIds,
    jobIds,
    applicationIds,
    interviewIds,
    departments,
  }
})

export type RecruitmentOverviewData = {
  openRequisitions: number
  publishedJobs: number
  newApplications: number
  awaitingReview: number
  interviewsThisWeek: number
  scorecardsOverdue: number
  offersAwaitingApproval: number
  offersAwaitingResponse: number
  closingSoon: number
  applicationsByStatus: Array<{ status: string; count: number }>
  urgentQueues: Array<{ label: string; count: number; href: string; tone: 'rose' | 'amber' | 'violet' }>
}

export const getRecruitmentOverview = cache(async (): Promise<RecruitmentOverviewData> => {
  const scope = await getRecruitmentScope()
  const supabase = createSupabaseAdminClient()
  const now = new Date()
  const weekEnd = new Date(now.getTime() + 7 * 86400000)
  const closeSoon = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10)
  const staleReview = new Date(now.getTime() - 3 * 86400000).toISOString()

  let requisitionsQuery = supabase.from('recruitment_requisitions').select('id, status')
  let jobsQuery = supabase.from('workforce_jobs').select('id, status, closing_date')
  let applicationsQuery = supabase
    .from('recruitment_applications')
    .select('id, status, submitted_at, last_stage_changed_at')
  let interviewsQuery = supabase
    .from('recruitment_interviews')
    .select('id, application_id, status, starts_at')
    .gte('starts_at', now.toISOString())
    .lte('starts_at', weekEnd.toISOString())
  let offersQuery = supabase.from('recruitment_offers').select('id, application_id, status, expires_at')
  let scorecardsQuery = supabase
    .from('recruitment_scorecards')
    .select('id, application_id, status, created_at')
    .eq('status', 'draft')
    .lt('created_at', new Date(now.getTime() - 86400000).toISOString())

  if (!scope.organizationWide) {
    if (scope.requisitionIds.length === 0) requisitionsQuery = requisitionsQuery.in('id', ['00000000-0000-0000-0000-000000000000'])
    else requisitionsQuery = requisitionsQuery.in('id', scope.requisitionIds)
    if (scope.jobIds.length === 0) jobsQuery = jobsQuery.in('id', ['00000000-0000-0000-0000-000000000000'])
    else jobsQuery = jobsQuery.in('id', scope.jobIds)
    if (scope.applicationIds.length === 0) {
      const none = ['00000000-0000-0000-0000-000000000000']
      applicationsQuery = applicationsQuery.in('id', none)
      interviewsQuery = interviewsQuery.in('application_id', none)
      offersQuery = offersQuery.in('application_id', none)
      scorecardsQuery = scorecardsQuery.in('application_id', none)
    } else {
      applicationsQuery = applicationsQuery.in('id', scope.applicationIds)
      interviewsQuery = interviewsQuery.in('application_id', scope.applicationIds)
      offersQuery = offersQuery.in('application_id', scope.applicationIds)
      scorecardsQuery = scorecardsQuery.in('application_id', scope.applicationIds)
    }
  }

  const [requisitions, jobs, applications, interviews, offers, scorecards] = await Promise.all([
    requisitionsQuery,
    jobsQuery,
    applicationsQuery,
    interviewsQuery,
    offersQuery,
    scorecardsQuery,
  ])
  for (const result of [requisitions, jobs, applications, interviews, offers, scorecards]) {
    if (result.error) throw result.error
  }

  const appRows = applications.data ?? []
  const statusCounts = new Map<string, number>()
  for (const row of appRows) statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1)
  const awaitingReview = appRows.filter((row) =>
    ['submitted', 'under_review', 'eligibility_review'].includes(row.status) &&
    (row.submitted_at ?? row.last_stage_changed_at) < staleReview,
  ).length
  const closingSoonCount = (jobs.data ?? []).filter((row) =>
    row.status === 'Open' && row.closing_date && row.closing_date <= closeSoon && row.closing_date >= now.toISOString().slice(0, 10),
  ).length
  const approvalCount = (offers.data ?? []).filter((row) => row.status === 'pending_approval').length
  const responseCount = (offers.data ?? []).filter((row) => ['sent', 'viewed'].includes(row.status)).length
  const scorecardCount = (scorecards.data ?? []).length

  return {
    openRequisitions: (requisitions.data ?? []).filter((row) => ['approved', 'open', 'recruiting', 'partially_filled'].includes(row.status)).length,
    publishedJobs: (jobs.data ?? []).filter((row) => row.status === 'Open').length,
    newApplications: appRows.filter((row) => row.status === 'submitted').length,
    awaitingReview,
    interviewsThisWeek: (interviews.data ?? []).filter((row) => ['scheduled', 'confirmed'].includes(row.status)).length,
    scorecardsOverdue: scorecardCount,
    offersAwaitingApproval: approvalCount,
    offersAwaitingResponse: responseCount,
    closingSoon: closingSoonCount,
    applicationsByStatus: [...statusCounts.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    urgentQueues: [
      { label: 'Applications unreviewed for more than 3 days', count: awaitingReview, href: '/workforce/recruitment/applications?queue=stale', tone: 'rose' },
      { label: 'Interview scorecards overdue', count: scorecardCount, href: '/workforce/recruitment/interviews?queue=scorecards', tone: 'amber' },
      { label: 'Offers awaiting approval', count: approvalCount, href: '/workforce/recruitment/offers?queue=approval', tone: 'violet' },
      { label: 'Published jobs closing this week', count: closingSoonCount, href: '/workforce/recruitment/jobs?queue=closing', tone: 'amber' },
    ],
  }
})
