import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BriefcaseBusiness, FileLock2, GraduationCap, History, Mail, MapPin, Phone, Tags, UserRound } from 'lucide-react'
import WorkforceHeading from '../../../_components/PageHeading'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getCallerPermissions } from '@/lib/admin-auth'
import { requireRecruitmentAccess } from '@/lib/recruitment-auth'
import CandidateDocumentButton from './CandidateDocumentButton'
import CandidateNoteForm from './CandidateNoteForm'

type Candidate = {
  id: string
  full_name: string
  preferred_name: string | null
  primary_email: string
  phone: string | null
  country: string | null
  city: string | null
  timezone: string | null
  current_position: string | null
  current_organization: string | null
  years_experience: number | null
  linkedin_url: string | null
  portfolio_url: string | null
  status: string
  source_summary: string | null
  created_at: string
  last_activity_at: string
}

const RESTRICTED_CLASSES = ['offer_confidential', 'identity_document', 'background_check', 'employee_transfer', 'restricted']

function fmt(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

export default async function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [access, permissions] = await Promise.all([
    requireRecruitmentAccess({
      entityType: 'candidate', entityId: id, allowedPermissions: ['workforce.candidates.read'],
    }),
    getCallerPermissions(),
  ])
  const canSensitive = permissions.has('recruitment.candidate.sensitive') || permissions.has('platform.admin')
  const supabase = createSupabaseAdminClient()
  let notesQuery = supabase
    .from('recruitment_candidate_notes')
    .select('id, body, visibility, created_at, author_employee_id, workforce_employees(full_name)')
    .eq('candidate_id', id)
    .order('created_at', { ascending: false })
  notesQuery = access.employeeId
    ? notesQuery.or(`visibility.neq.private,author_employee_id.eq.${access.employeeId}`)
    : notesQuery.neq('visibility', 'private')
  let documentsQuery = supabase
    .from('recruitment_candidate_documents')
    .select('id, document_type, document_class, original_filename, mime_type, byte_size, malware_scan_status, retention_until, created_at')
    .eq('candidate_id', id)
    .order('created_at', { ascending: false })
  if (!canSensitive) documentsQuery = documentsQuery.not('document_class', 'in', `(${RESTRICTED_CLASSES.join(',')})`)

  const [candidateResult, applicationsResult, experienceResult, educationResult, skillsResult, documentsResult, consentsResult, tagsResult, notesResult] = await Promise.all([
    supabase.from('recruitment_candidates').select('*').eq('id', id).maybeSingle<Candidate>(),
    supabase.from('recruitment_applications').select('id, job_id, application_reference, status, candidate_facing_status, source, submitted_at, created_at').eq('candidate_id', id).order('created_at', { ascending: false }),
    supabase.from('recruitment_candidate_experience').select('id, organization, title, location, started_on, ended_on, is_current, description').eq('candidate_id', id).order('sort_order'),
    supabase.from('recruitment_candidate_education').select('id, institution, qualification, field_of_study, started_on, ended_on').eq('candidate_id', id).order('sort_order'),
    supabase.from('recruitment_candidate_skills').select('skill, proficiency, years_experience').eq('candidate_id', id).order('skill'),
    documentsQuery,
    supabase.from('recruitment_candidate_consents').select('id, consent_type, notice_version, granted_at, withdrawn_at, source').eq('candidate_id', id).order('created_at', { ascending: false }),
    supabase.from('recruitment_candidate_tags').select('tag_id, recruitment_tags(name, color)').eq('candidate_id', id),
    notesQuery,
  ])
  const results = [candidateResult, applicationsResult, experienceResult, educationResult, skillsResult, documentsResult, consentsResult, tagsResult, notesResult]
  const firstError = results.find((result) => result.error)?.error
  if (firstError) throw firstError
  if (!candidateResult.data) notFound()
  const candidate = candidateResult.data
  const applications = applicationsResult.data ?? []
  const jobIds = [...new Set(applications.map((application) => application.job_id))]
  const { data: jobs, error: jobsError } = jobIds.length
    ? await supabase.from('workforce_jobs').select('id, title, department, location').in('id', jobIds)
    : { data: [], error: null }
  if (jobsError) throw jobsError
  const jobsById = new Map((jobs ?? []).map((job) => [job.id, job]))

  return (
    <>
      <WorkforceHeading title={candidate.full_name} subtitle={`${candidate.current_position ?? 'Candidate'}${candidate.current_organization ? ` · ${candidate.current_organization}` : ''}`} />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3"><span className="rounded-2xl bg-[#F7EAFB] p-3 text-[#5B2D8E]"><UserRound className="h-6 w-6" /></span><div><h2 className="font-semibold text-gray-950">Profile</h2><p className="text-sm text-gray-500">{candidate.preferred_name ? `Prefers ${candidate.preferred_name}` : 'No preferred name recorded'}</p></div></div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold capitalize text-gray-700">{candidate.status.replaceAll('_', ' ')}</span>
            </div>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Email</dt><dd className="mt-1 flex items-center gap-1.5 text-sm text-gray-700"><Mail className="h-3.5 w-3.5" />{candidate.primary_email}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Phone</dt><dd className="mt-1 flex items-center gap-1.5 text-sm text-gray-700"><Phone className="h-3.5 w-3.5" />{candidate.phone ?? 'Not provided'}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Location</dt><dd className="mt-1 flex items-center gap-1.5 text-sm text-gray-700"><MapPin className="h-3.5 w-3.5" />{[candidate.city, candidate.country].filter(Boolean).join(', ') || 'Not provided'}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Experience</dt><dd className="mt-1 text-sm text-gray-700">{candidate.years_experience == null ? 'Not provided' : `${candidate.years_experience} years`}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Source</dt><dd className="mt-1 text-sm text-gray-700">{candidate.source_summary ?? 'Direct'}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Last activity</dt><dd className="mt-1 text-sm text-gray-700">{fmt(candidate.last_activity_at)}</dd></div>
            </dl>
            {(candidate.linkedin_url || candidate.portfolio_url) && <div className="mt-5 flex flex-wrap gap-2">{candidate.linkedin_url && <a href={candidate.linkedin_url} target="_blank" rel="noreferrer" className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700">LinkedIn</a>}{candidate.portfolio_url && <a href={candidate.portfolio_url} target="_blank" rel="noreferrer" className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700">Portfolio</a>}</div>}
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2"><BriefcaseBusiness className="h-5 w-5 text-[#5B2D8E]" /><h2 className="font-semibold text-gray-950">Applications</h2></div>
            <div className="mt-4 divide-y divide-gray-100">{applications.map((application) => { const job = jobsById.get(application.job_id); return <Link key={application.id} href={`/workforce/recruitment/applications/${application.id}`} className="flex items-center justify-between gap-4 py-4 hover:text-[#5B2D8E]"><div><p className="text-sm font-semibold">{job?.title ?? 'Role'}</p><p className="mt-1 text-xs text-gray-500">{application.application_reference} · {job?.department ?? ''} · {application.source}</p></div><span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold capitalize text-gray-700">{application.status.replaceAll('_', ' ')}</span></Link> })}{applications.length === 0 && <p className="py-5 text-sm text-gray-400">No applications yet.</p>}</div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2"><History className="h-5 w-5 text-[#5B2D8E]" /><h2 className="font-semibold text-gray-950">Experience</h2></div>
            <div className="mt-4 space-y-4">{(experienceResult.data ?? []).map((item) => <article key={item.id} className="border-l-2 border-violet-100 pl-4"><h3 className="text-sm font-semibold text-gray-900">{item.title} · {item.organization}</h3><p className="mt-1 text-xs text-gray-500">{fmt(item.started_on)} – {item.is_current ? 'Present' : fmt(item.ended_on)}{item.location ? ` · ${item.location}` : ''}</p>{item.description && <p className="mt-2 text-sm leading-6 text-gray-600">{item.description}</p>}</article>)}{experienceResult.data?.length === 0 && <p className="text-sm text-gray-400">No work history provided.</p>}</div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2"><GraduationCap className="h-5 w-5 text-[#5B2D8E]" /><h2 className="font-semibold text-gray-950">Education and skills</h2></div>
            <div className="mt-4 space-y-3">{(educationResult.data ?? []).map((item) => <article key={item.id}><h3 className="text-sm font-semibold text-gray-900">{item.qualification ?? 'Study'}{item.field_of_study ? `, ${item.field_of_study}` : ''}</h3><p className="text-xs text-gray-500">{item.institution} · {fmt(item.started_on)} – {fmt(item.ended_on)}</p></article>)}{educationResult.data?.length === 0 && <p className="text-sm text-gray-400">No education history provided.</p>}</div>
            {(skillsResult.data ?? []).length > 0 && <div className="mt-5 flex flex-wrap gap-2">{skillsResult.data!.map((skill) => <span key={skill.skill} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">{skill.skill}{skill.proficiency ? ` · ${skill.proficiency}` : ''}</span>)}</div>}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><FileLock2 className="h-5 w-5 text-[#5B2D8E]" /><h2 className="font-semibold text-gray-950">Documents</h2></div>
            <p className="mt-1 text-xs leading-5 text-gray-500">Links expire after 60 seconds. Every open is recorded.</p>
            <div className="mt-4 divide-y divide-gray-100">{(documentsResult.data ?? []).map((document) => <div key={document.id} className="flex items-start justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold capitalize text-gray-800">{document.document_type.replaceAll('_', ' ')}</p><p className="mt-1 truncate text-xs text-gray-500">{document.original_filename ?? 'Document'} · {document.malware_scan_status}</p></div><CandidateDocumentButton candidateId={id} documentId={document.id} disabled={['quarantined', 'failed'].includes(document.malware_scan_status)} /></div>)}{documentsResult.data?.length === 0 && <p className="py-4 text-sm text-gray-400">No accessible documents.</p>}</div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><Tags className="h-5 w-5 text-[#5B2D8E]" /><h2 className="font-semibold text-gray-950">Tags and consent</h2></div>
            <div className="mt-4 flex flex-wrap gap-2">{(tagsResult.data ?? []).map((row) => { const tag = Array.isArray(row.recruitment_tags) ? row.recruitment_tags[0] : row.recruitment_tags; return tag ? <span key={row.tag_id} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">{tag.name}</span> : null })}{tagsResult.data?.length === 0 && <span className="text-sm text-gray-400">No tags</span>}</div>
            <ul className="mt-4 space-y-2">{(consentsResult.data ?? []).map((consent) => <li key={consent.id} className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600"><span className="font-semibold capitalize">{consent.consent_type.replaceAll('_', ' ')}</span> · {consent.withdrawn_at ? `withdrawn ${fmt(consent.withdrawn_at)}` : `granted ${fmt(consent.granted_at)}`}</li>)}{consentsResult.data?.length === 0 && <li className="text-sm text-gray-400">No consent record.</li>}</ul>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-gray-950">Recruitment notes</h2>
            <CandidateNoteForm candidateId={id} />
            <div className="mt-4 divide-y divide-gray-100">{(notesResult.data ?? []).map((note) => { const employee = Array.isArray(note.workforce_employees) ? note.workforce_employees[0] : note.workforce_employees; return <article key={note.id} className="py-3"><div className="flex justify-between gap-2 text-[11px] text-gray-400"><span className="font-semibold text-gray-600">{employee?.full_name ?? 'Team member'} · {note.visibility.replaceAll('_', ' ')}</span><time>{fmt(note.created_at)}</time></div><p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-gray-600">{note.body}</p></article> })}</div>
          </section>
        </aside>
      </div>
    </>
  )
}
