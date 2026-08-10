import Link from 'next/link'
import { Search } from 'lucide-react'
import WorkforceHeading from '../../_components/PageHeading'
import { getCallerPermissions, requirePermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getRecruitmentScope } from '../_lib/queries'
import { EmptyState, PANEL, StatusPill, TABLE_HEADER } from '../_components/ui'
import { reviewDuplicateMatch } from './actions'
import CandidateMergeForm from './CandidateMergeForm'

const NONE = ['00000000-0000-0000-0000-000000000000']
function param(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? '' : value ?? '' }

const FIELD =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7E5896] focus:ring-2 focus:ring-[#F0DFF6]'
/** The secondary filters: same control, quieter, so the search field leads. */
const NARROW =
  'w-full rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-1.5 text-[13px] text-gray-700 outline-none focus:border-[#7E5896] focus:bg-white focus:ring-2 focus:ring-[#F0DFF6]'

const STAGES = ['submitted', 'screening', 'assessment', 'interview', 'final_interview', 'reference_check', 'offer', 'hired', 'rejected', 'withdrawn']

/** Deliberately not the shared Chip: that one capitalises and strips
 *  underscores, which is right for statuses and wrong for skills. Skills carry
 *  casing that means something, and Chip would render "iOS" as "IOS". */
function SkillChip({ label }: { label: string }) {
  return (
    <span className="inline-flex w-fit items-center rounded-full bg-[#F0DFF6] px-2 py-0.5 text-[11px] font-semibold text-[#7E5896]">
      {label}
    </span>
  )
}

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission('workforce.candidates.read'); const [scope, permissions, params] = await Promise.all([getRecruitmentScope(), getCallerPermissions(), searchParams]); const db = createSupabaseAdminClient()
  let scopedIds: string[] | null = null; if (!scope.organizationWide) { const result = scope.applicationIds.length ? await db.from('recruitment_applications').select('candidate_id').in('id', scope.applicationIds) : { data: [], error: null }; if (result.error) throw result.error; scopedIds = [...new Set((result.data ?? []).map((row) => row.candidate_id))] }
  let candidateQuery = db.from('recruitment_candidates').select('id, full_name, preferred_name, primary_email, phone, city, country, current_position, current_organization, linkedin_url, status, source_summary, last_activity_at').neq('status', 'deleted').order('last_activity_at', { ascending: false }).limit(1000); if (scopedIds) candidateQuery = candidateQuery.in('id', scopedIds.length ? scopedIds : NONE)
  const candidates = await candidateQuery; if (candidates.error) throw candidates.error; const ids = (candidates.data ?? []).map((candidate) => candidate.id)
  const [applications, skills, tags, memberships, duplicates] = await Promise.all([
    ids.length ? db.from('recruitment_applications').select('id, candidate_id, application_reference, status, source, workforce_jobs(title)').in('candidate_id', ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? db.from('recruitment_candidate_skills').select('candidate_id, skill, proficiency').in('candidate_id', ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? db.from('recruitment_candidate_tags').select('candidate_id, recruitment_tags(name)').in('candidate_id', ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? db.from('recruitment_talent_pool_members').select('candidate_id, recruitment_talent_pools(name)').in('candidate_id', ids).eq('status', 'active') : Promise.resolve({ data: [], error: null }),
    permissions.has('workforce.candidates.merge') && ids.length ? db.from('recruitment_duplicate_matches').select('*').or(`candidate_id.in.(${ids.join(',')}),possible_duplicate_id.in.(${ids.join(',')})`).eq('status', 'pending').order('confidence', { ascending: false }) : Promise.resolve({ data: [], error: null }),
  ]); for (const result of [applications, skills, tags, memberships, duplicates]) if (result.error) throw result.error
  const q = param(params.q).toLowerCase(); const skill = param(params.skill).toLowerCase(); const location = param(params.location).toLowerCase(); const status = param(params.status); const source = param(params.source).toLowerCase(); const stage = param(params.stage)
  const filtered = (candidates.data ?? []).filter((candidate) => { const apps = (applications.data ?? []).filter((app) => app.candidate_id === candidate.id); const candidateSkills = (skills.data ?? []).filter((item) => item.candidate_id === candidate.id).map((item) => item.skill); const candidateTags = (tags.data ?? []).filter((item) => item.candidate_id === candidate.id).map((item) => { const tag = Array.isArray(item.recruitment_tags) ? item.recruitment_tags[0] : item.recruitment_tags; return tag?.name ?? '' }); const pools = (memberships.data ?? []).filter((item) => item.candidate_id === candidate.id).map((item) => { const pool = Array.isArray(item.recruitment_talent_pools) ? item.recruitment_talent_pools[0] : item.recruitment_talent_pools; return pool?.name ?? '' }); const haystack = [candidate.full_name, candidate.primary_email, candidate.phone, candidate.current_position, candidate.current_organization, candidate.city, candidate.country, candidate.linkedin_url, ...candidateSkills, ...candidateTags, ...pools, ...apps.map((app) => app.application_reference), ...apps.map((app) => { const job = Array.isArray(app.workforce_jobs) ? app.workforce_jobs[0] : app.workforce_jobs; return job?.title ?? '' })].join(' ').toLowerCase(); return (!q || haystack.includes(q)) && (!skill || candidateSkills.some((value) => value.toLowerCase().includes(skill))) && (!location || `${candidate.city} ${candidate.country}`.toLowerCase().includes(location)) && (!status || candidate.status === status) && (!source || apps.some((app) => app.source.toLowerCase().includes(source))) && (!stage || apps.some((app) => app.status === stage)) })
  const compareRaw = params.compare; const compareIds = (Array.isArray(compareRaw) ? compareRaw : typeof compareRaw === 'string' ? compareRaw.split(',') : []).slice(0, 4); const compared = filtered.filter((candidate) => compareIds.includes(candidate.id)); const nameMap = new Map((candidates.data ?? []).map((candidate) => [candidate.id, candidate.full_name]))

  // Carried into the compare form as hidden fields. Both forms are GET on the
  // same URL, so without these, comparing after a search threw the search away
  // and compared against the unfiltered list.
  const activeFilters = { q, skill, location, status, source, stage }
  const hasSearch = Object.values(activeFilters).some(Boolean)

  return (
    <>
      <WorkforceHeading title="Candidate search" subtitle="Search name, contacts, skills, employer, role, reference, job, location, tags, pools, source and stage within your hiring scope." />

      {/*
        One search, five narrowers.

        The previous version gave all six equal weight in a six-column grid with
        two of them spanning two columns, so the last field wrapped alone and
        left half a row empty, under six shouty uppercase labels. A filter bar
        is not a data-entry form: the labels are screen-reader only here because
        each control already says what it is, in its placeholder or its first
        option. (Contrast the workforce plan form, where the fields carry
        default VALUES and genuinely cannot be read without a label.)
      */}
      <form className={`${PANEL} p-4`}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <label htmlFor="candidate-q" className="sr-only">Search everything</label>
            <input
              id="candidate-q"
              name="q"
              defaultValue={q}
              placeholder="Search name, email, phone, employer, job, tag or reference"
              className={`${FIELD} pl-9`}
            />
          </div>
          <button className="shrink-0 rounded-lg bg-[#7E5896] px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90">
            Search
          </button>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
          <label className="block"><span className="sr-only">Skill</span>
            <input name="skill" defaultValue={skill} placeholder="Skill" className={NARROW} /></label>
          <label className="block"><span className="sr-only">Location</span>
            <input name="location" defaultValue={location} placeholder="Location" className={NARROW} /></label>
          <label className="block"><span className="sr-only">Status</span>
            <select name="status" defaultValue={status} className={NARROW}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="talent_pool">Talent pool</option>
              <option value="hired">Hired</option>
              <option value="do_not_contact">Do not contact</option>
            </select>
          </label>
          <label className="block"><span className="sr-only">Source</span>
            <input name="source" defaultValue={source} placeholder="Source" className={NARROW} /></label>
          <label className="block"><span className="sr-only">Stage</span>
            <select name="stage" defaultValue={stage} className={NARROW}>
              <option value="">All stages</option>
              {STAGES.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
            </select>
          </label>
        </div>
      </form>

      <form className="mt-5">
        {/* Keeps the current search when the compare submit reloads the page. */}
        {Object.entries(activeFilters).map(([key, value]) => value ? <input key={key} type="hidden" name={key} value={value} /> : null)}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            {filtered.length} {filtered.length === 1 ? 'candidate' : 'candidates'}
            {hasSearch && ' matching'}
            {filtered.length > 0 && ' · select up to four to compare'}
          </p>
          <div className="flex items-center gap-2">
            {/* Next to the result count, which is the thing it changes. */}
            {hasSearch && (
              <Link href="/workforce/recruitment/candidates" className="rounded-lg px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50 hover:text-gray-800">
                Clear filters
              </Link>
            )}
            {filtered.length > 0 && (
              <button className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50">
                Compare selected
              </button>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title={hasSearch ? 'No candidates match those filters' : 'No candidates yet'}
              hint={hasSearch ? 'Try a broader search, or clear the filters to see everyone in your hiring scope.' : 'Candidates appear here once people apply, are referred, or are added to a talent pool.'}
            />
          </div>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((candidate) => {
              const candidateSkills = (skills.data ?? []).filter((item) => item.candidate_id === candidate.id)
              const apps = (applications.data ?? []).filter((app) => app.candidate_id === candidate.id)
              return (
                <article key={candidate.id} className={`${PANEL} p-5`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/workforce/recruitment/candidates/${candidate.id}`} className="text-sm font-semibold text-gray-900 hover:text-[#7E5896]">
                        {candidate.full_name}
                      </Link>
                      <p className="mt-1 truncate text-xs text-gray-500">
                        {candidate.primary_email}{candidate.city ? ` · ${candidate.city}` : ''}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      name="compare"
                      value={candidate.id}
                      defaultChecked={compareIds.includes(candidate.id)}
                      aria-label={`Compare ${candidate.full_name}`}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#7E5896]"
                    />
                  </div>
                  <p className="mt-3 text-sm text-gray-700">
                    {[candidate.current_position, candidate.current_organization].filter(Boolean).join(' at ') || 'Profile details pending'}
                  </p>
                  {candidateSkills.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {candidateSkills.slice(0, 6).map((item) => <SkillChip key={item.skill} label={item.skill} />)}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <StatusPill status={candidate.status} />
                    <span className="text-xs text-gray-500">{apps.length} application{apps.length === 1 ? '' : 's'}</span>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </form>

      {compared.length > 1 && (
        <section className={`${PANEL} mt-5`}>
          <div className={TABLE_HEADER}>Candidate comparison</div>
          <div className="no-scrollbar overflow-x-auto p-5">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Field</th>
                  {compared.map((candidate) => (
                    <th key={candidate.id} className="p-2">
                      <Link href={`/workforce/recruitment/candidates/${candidate.id}`} className="font-semibold text-[#7E5896] hover:underline">{candidate.full_name}</Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([
                  ['Current role', (id: string) => { const candidate = compared.find((item) => item.id === id)!; return [candidate.current_position, candidate.current_organization].filter(Boolean).join(' at ') || '—' }],
                  ['Location', (id: string) => { const candidate = compared.find((item) => item.id === id)!; return [candidate.city, candidate.country].filter(Boolean).join(', ') || '—' }],
                  ['Skills', (id: string) => (skills.data ?? []).filter((item) => item.candidate_id === id).map((item) => item.skill).join(', ') || '—'],
                  ['Applications', (id: string) => (applications.data ?? []).filter((item) => item.candidate_id === id).map((item) => item.status.replaceAll('_', ' ')).join(', ') || '—'],
                ] as const).map(([label, getter]) => (
                  <tr key={label} className="border-t border-gray-100">
                    <th className="p-2 align-top text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</th>
                    {compared.map((candidate) => <td key={candidate.id} className="p-2 text-gray-700">{getter(candidate.id)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {permissions.has('workforce.candidates.merge') && (
        // A white panel with rose only on the heading and the button, rather
        // than a full pink wash. This tool is idle most of the time, and on an
        // empty page the wash made the most destructive thing here also the
        // loudest. Collapsed unless there is something waiting.
        <details open={(duplicates.data ?? []).length > 0} className={`${PANEL} mt-5 group`}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
            <span>
              <span className="text-sm font-bold text-[#A84F66]">Duplicate review</span>
              <span className="mt-0.5 block text-xs text-gray-500">
                Merges are never automatic. Every one is reviewed by a person and recorded with a reason.
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-[#F5DCE2] px-2 py-0.5 text-[11px] font-semibold text-[#A84F66]">
              {(duplicates.data ?? []).length} waiting
            </span>
          </summary>

          <div className="border-t border-gray-100 p-5">
          {(duplicates.data ?? []).length > 0 && (
            <div className="space-y-2">
              {(duplicates.data ?? []).map((match) => (
                <div key={match.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <p className="text-sm font-semibold text-gray-900">
                    {nameMap.get(match.candidate_id)} ↔ {nameMap.get(match.possible_duplicate_id)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Matched on {match.matched_fields.join(', ')} · confidence {match.confidence == null ? 'not scored' : `${Math.round(Number(match.confidence) * 100)}%`}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <form action={reviewDuplicateMatch.bind(null, match.id, 'confirmed_duplicate')}>
                      <button className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Confirm for merge review</button>
                    </form>
                    <form action={reviewDuplicateMatch.bind(null, match.id, 'not_duplicate')}>
                      <button className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Not a duplicate</button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}

            <CandidateMergeForm candidates={filtered.map(({ id, full_name, primary_email }) => ({ id, full_name, primary_email }))} />
          </div>
        </details>
      )}
    </>
  )
}
