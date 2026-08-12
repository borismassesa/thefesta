'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { opusButtonClass } from '@opusfesta/lib'
import {
  ArrowRight,
  Briefcase,
  CalendarRange,
  ChevronRight,
  Mail,
  MapPin,
  Plus,
  Star,
  TrendingUp,
  UserPlus,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { HeaderActionsSlot } from '@/components/HeaderPortals'
import Avatar from '../_components/Avatar'
import StatusPill from '../_components/StatusPill'
import Kpi, { KpiRow } from '../_components/Kpi'
import {
  departments as DEPARTMENT_LIST,
  jobStages,
  type Candidate,
  type Department,
  type EmploymentType,
  type Job,
  type JobStage,
  type JobStatus,
  type Location,
} from '../_lib/data'
import { formatDate, formatTzsCompact } from '../_lib/format'
import {
  addCandidate,
  createJob,
  moveCandidate,
  rateCandidate,
  setJobStatus,
} from './actions'

const LOCATIONS: Location[] = ['Dar es Salaam', 'Arusha', 'Zanzibar', 'Remote']
const EMPLOYMENT_TYPES: EmploymentType[] = ['Permanent', 'Contract', 'Probation', 'Intern']

const STATUSES: JobStatus[] = ['Open', 'On hold', 'Closed']
const SOURCES: Candidate['source'][] = ['LinkedIn', 'Referral', 'Careers Page', 'Direct', 'Brighter Monday']

const STATUS_TONE: Record<JobStatus, 'green' | 'amber' | 'gray'> = {
  Open: 'green',
  'On hold': 'amber',
  Closed: 'gray',
}

const STAGE_DOT: Record<JobStage, string> = {
  Applied: 'bg-gray-300',
  Screening: 'bg-sky-400',
  Interview: 'bg-amber-400',
  Offer: 'bg-[#C9A0DC]',
  Hired: 'bg-emerald-500',
  Rejected: 'bg-rose-400',
}

const STAGE_PILL_BG: Record<JobStage, string> = {
  Applied: 'bg-gray-50',
  Screening: 'bg-sky-50',
  Interview: 'bg-amber-50',
  Offer: 'bg-[#F0DFF6]',
  Hired: 'bg-emerald-50',
  Rejected: 'bg-rose-50',
}

const palette = [
  '#F0DFF6',
  '#FFF3D9',
  '#E5F2FB',
  '#FCE8F0',
  '#DDF6E3',
  '#FFE3D1',
  '#E4E0FB',
  '#D6F0EE',
]

function candidateColor(id: string): string {
  const hash = [...id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return palette[hash % palette.length]
}

export default function RecruitmentClient({ jobs }: { jobs: Job[] }) {
  const [selectedId, setSelectedId] = useState<string>(jobs[0]?.id ?? '')
  const selected = jobs.find((j) => j.id === selectedId) ?? jobs[0]
  const [addingFor, setAddingFor] = useState<Job | null>(null)

  const open = jobs.filter((j) => j.status === 'Open').length
  const totalCandidates = jobs.reduce((s, j) => s + j.candidates.length, 0)
  const offers = jobs.reduce(
    (s, j) => s + j.candidates.filter((c) => c.stage === 'Offer').length,
    0,
  )

  // Time-to-hire = avg days between Applied and now for candidates currently
  // at Offer or Hired. Approximation until we add a `hired_at` column;
  // because we don't store stage-transition timestamps yet, this uses
  // applied_at vs. today which over-estimates after long pipelines. Once the
  // stage_transitions table lands we can compute applied→hired exactly.
  const closingCandidates = jobs.flatMap((j) =>
    j.candidates.filter((c) => c.stage === 'Offer' || c.stage === 'Hired'),
  )
  const [now] = useState(() => Date.now())
  const avgPipelineDays = closingCandidates.length
    ? Math.round(
        closingCandidates.reduce(
          (s, c) => s + Math.max(0, (now - new Date(c.appliedAt).getTime()) / 86400000),
          0,
        ) / closingCandidates.length,
      )
    : 0

  return (
    <div className="space-y-6">
      {/* Page-level CTA portals into the global admin Header so the
          recruitment toolbar stays focused on filtering/selecting jobs.
          Mirrors the pattern used on Employees (Export / Add employee). */}
      <HeaderActionsSlot>
        <Link
          href="/workforce/recruitment/requisitions/new"
          className={opusButtonClass()}
        >
          <Plus className="h-4 w-4" />
          New requisition
        </Link>
      </HeaderActionsSlot>

      <KpiRow>
        <Kpi label="Open roles" value={String(open)} delta={`${jobs.length - open} other`} deltaTone="neutral" icon={<Briefcase className="h-4 w-4" />} />
        <Kpi label="Active candidates" value={String(totalCandidates)} hint="across all pipelines" icon={<UserPlus className="h-4 w-4" />} />
        <Kpi label="Offers out" value={String(offers)} hint="awaiting acceptance" icon={<Star className="h-4 w-4" />} />
        <Kpi label="Time to hire" value={avgPipelineDays > 0 ? `${avgPipelineDays} days` : '—'} hint="applied → offer (avg)" icon={<TrendingUp className="h-4 w-4" />} />
      </KpiRow>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className="space-y-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Open roles</h3>
          <div className="space-y-2">
            {jobs.map((j) => (
              <JobCard
                key={j.id}
                job={j}
                active={j.id === selectedId}
                onSelect={() => setSelectedId(j.id)}
              />
            ))}
          </div>
        </div>

        {selected && (
          <JobDetail
            job={selected}
            onAddCandidate={() => setAddingFor(selected)}
          />
        )}
      </div>

      {addingFor && (
        <AddCandidateDialog
          job={addingFor}
          onClose={() => setAddingFor(null)}
        />
      )}
    </div>
  )
}

function JobCard({
  job,
  active,
  onSelect,
}: {
  job: Job
  active: boolean
  onSelect: () => void
}) {
  const hot = job.candidates.filter((c) => c.stage === 'Offer' || c.stage === 'Interview').length
  return (
    <button data-opus-button="neutral" data-opus-button-size="medium"
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-2xl border bg-white p-4 text-left shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] transition-colors',
        active ? 'border-[#C9A0DC] ring-2 ring-[#F0DFF6]' : 'border-gray-100 hover:border-gray-200',
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">{job.title}</p>
          <p className="text-xs text-gray-500">{job.department} · {job.type}</p>
        </div>
        <StatusPill tone={STATUS_TONE[job.status]} label={job.status} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {job.location}
        </span>
        <span className="inline-flex items-center gap-1">
          <CalendarRange className="h-3 w-3" />
          Open since {formatDate(job.openedAt)}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-gray-500">{job.candidates.length} candidates</span>
        {hot > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#F0DFF6] px-2 py-0.5 font-semibold text-[#5B2D8E]">
            {hot} late stage
          </span>
        )}
        <ChevronRight className="h-4 w-4 text-gray-400" />
      </div>
    </button>
  )
}

function JobDetail({
  job,
  onAddCandidate,
}: {
  job: Job
  onAddCandidate: () => void
}) {
  const stages = jobStages()
  const grouped = useMemo(() => {
    const map = new Map<JobStage, Candidate[]>()
    for (const s of stages) map.set(s, [])
    for (const c of job.candidates) {
      map.get(c.stage)!.push(c)
    }
    return map
  }, [job, stages])

  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function changeStatus(status: JobStatus) {
    setError(null)
    startTransition(async () => {
      try {
        await setJobStatus(job.id, status)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not update status.')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-[#F7EAFB] via-white to-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight text-gray-900">{job.title}</h2>
              <StatusPill tone={STATUS_TONE[job.status]} label={job.status} />
            </div>
            <p className="mt-1 text-sm text-gray-600">
              {job.department} · {job.location} · {job.type}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Status</span>
              <select
                value={job.status}
                onChange={(e) => changeStatus(e.target.value as JobStatus)}
                disabled={pending}
                className="bg-transparent text-sm font-semibold text-gray-900 outline-none disabled:opacity-50"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={onAddCandidate}
              className={opusButtonClass()}
            >
              <Mail className="h-4 w-4" />
              Add candidate
            </button>
          </div>
        </div>
        {error && <p className="mt-3 text-sm font-medium text-rose-700">{error}</p>}

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Stat label="Posted salary" value={`${formatTzsCompact(job.postedSalaryTzs[0])} – ${formatTzsCompact(job.postedSalaryTzs[1])}`} />
          <Stat label="Hiring manager" value={job.hiringManager} />
          <Stat label="Opened" value={formatDate(job.openedAt)} />
          <Stat label="Candidates" value={String(job.candidates.length)} />
        </dl>
      </div>

      <div className="overflow-x-auto no-scrollbar rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div className="flex min-w-[920px] gap-3">
          {stages.map((s) => {
            const candidates = grouped.get(s) ?? []
            return (
              <div key={s} className="flex w-64 shrink-0 flex-col">
                <div className={cn('rounded-t-xl px-3 py-2.5', STAGE_PILL_BG[s])}>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-700">
                      <span className={cn('h-2 w-2 rounded-full', STAGE_DOT[s])} />
                      {s}
                    </span>
                    <span className="rounded-full bg-white px-1.5 text-[11px] font-bold text-gray-700">
                      {candidates.length}
                    </span>
                  </div>
                </div>
                <div className="flex-1 space-y-2 rounded-b-xl bg-gray-50/50 p-2 ring-1 ring-gray-100">
                  {candidates.length === 0 ? (
                    <p className="px-2 py-3 text-center text-[11px] font-medium text-gray-400">
                      No candidates
                    </p>
                  ) : (
                    candidates.map((c) => (
                      <CandidateCard key={c.id} candidate={c} />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function CandidateCard({ candidate }: { candidate: Candidate }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const stages = jobStages()
  const idx = stages.indexOf(candidate.stage)
  const nextStage = idx >= 0 && idx < stages.length - 2 ? stages[idx + 1] : null

  function moveTo(stage: JobStage) {
    setError(null)
    startTransition(async () => {
      try {
        await moveCandidate(candidate.id, stage)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not move candidate.')
      }
    })
  }

  function setRating(next: number) {
    setError(null)
    startTransition(async () => {
      try {
        await rateCandidate(candidate.id, next)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save rating.')
      }
    })
  }

  return (
    <div className={cn('rounded-xl border border-gray-100 bg-white p-3 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] hover:border-gray-200', pending && 'opacity-60')}>
      <div className="flex items-start gap-2.5">
        <Avatar name={candidate.name} color={candidateColor(candidate.id)} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{candidate.name}</p>
          <p className="truncate text-[11px] text-gray-500">{candidate.email}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
        <span>{candidate.source}</span>
        <div className="flex items-center gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => {
            const star = (i + 1) as 1 | 2 | 3 | 4 | 5
            return (
              <button data-opus-button="control"
                key={i}
                type="button"
                onClick={() => setRating(star)}
                disabled={pending}
                aria-label={`Rate ${star} of 5`}
                className="rounded p-0.5 hover:bg-amber-50 disabled:opacity-50"
              >
                <Star
                  className={cn(
                    'h-3 w-3',
                    i < candidate.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200',
                  )}
                />
              </button>
            )
          })}
        </div>
      </div>
      <p className="mt-1 text-[10px] text-gray-400">applied {formatDate(candidate.appliedAt)}</p>
      {nextStage && (
        <div className="mt-2 flex items-center justify-between gap-1.5 border-t border-gray-100 pt-2">
          <button data-opus-button="secondary" data-opus-button-size="small"
            type="button"
            onClick={() => moveTo(nextStage)}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md bg-[#F0DFF6] px-2 py-1 text-[11px] font-semibold text-[#5B2D8E] hover:bg-[#E0BEEC] disabled:opacity-50"
          >
            <ArrowRight className="h-3 w-3" />
            {nextStage}
          </button>
          <button data-opus-button="danger" data-opus-button-size="small"
            type="button"
            onClick={() => moveTo('Rejected')}
            disabled={pending}
            className="rounded-md px-2 py-1 text-[11px] font-semibold text-gray-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
      {error && <p className="mt-1.5 text-[10px] font-medium text-rose-700">{error}</p>}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-gray-900">{value}</dd>
    </div>
  )
}

// ---------------------------------------------------------------------------
// New job
// ---------------------------------------------------------------------------

function NewJobDialog({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [department, setDepartment] = useState<Department>(DEPARTMENT_LIST[0])
  const [location, setLocation] = useState<Location>('Dar es Salaam')
  const [employmentType, setEmploymentType] = useState<EmploymentType>('Permanent')
  const [hiringManager, setHiringManager] = useState('')
  const [minSalary, setMinSalary] = useState('')
  const [maxSalary, setMaxSalary] = useState('')
  const [description, setDescription] = useState('')
  const [workplaceType, setWorkplaceType] = useState<'On-site' | 'Hybrid' | 'Remote' | 'Field-based'>('On-site')
  const [experienceLevel, setExperienceLevel] = useState('Professional')
  const [closingDate, setClosingDate] = useState('')
  const [showSalary, setShowSalary] = useState(false)
  const [responsibilities, setResponsibilities] = useState('')
  const [requirements, setRequirements] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function submit() {
    setError(null)
    const min = Number.parseInt(minSalary.replace(/[^0-9]/g, ''), 10) || 0
    const max = Number.parseInt(maxSalary.replace(/[^0-9]/g, ''), 10) || 0
    startTransition(async () => {
      try {
        await createJob({
          title,
          department,
          location,
          type: employmentType,
          hiringManager,
          postedSalaryMinTzs: min,
          postedSalaryMaxTzs: max,
          description: description || undefined,
          workplaceType,
          experienceLevel,
          closingDate: closingDate || undefined,
          showSalary,
          responsibilities: responsibilities.split('\n').map((line) => line.trim()).filter(Boolean),
          requirements: requirements.split('\n').map((line) => line.trim()).filter(Boolean),
        })
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not create the job.')
      }
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">New job</h2>
            <p className="mt-1 text-sm text-gray-500">
              Posted to the careers page once the status is set to Open.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
          className={opusButtonClass({ variant: 'tertiary', size: 'icon-small' })}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-6 py-5">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Department</span>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value as Department)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
              >
                {DEPARTMENT_LIST.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Workplace</span>
              <select value={workplaceType} onChange={(e) => setWorkplaceType(e.target.value as typeof workplaceType)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]">
                {['On-site', 'Hybrid', 'Remote', 'Field-based'].map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Experience level</span>
              <select value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]">
                {['Early career', 'Professional', 'Senior', 'Leadership'].map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Closing date</span>
              <input type="date" value={closingDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setClosingDate(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Location</span>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value as Location)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
              >
                {LOCATIONS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Type</span>
              <select
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
              >
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Hiring manager</span>
              <input
                type="text"
                value={hiringManager}
                onChange={(e) => setHiringManager(e.target.value)}
                placeholder="e.g. Asha Mwangi"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Posted salary min (TZS)</span>
              <input
                type="text"
                inputMode="numeric"
                value={minSalary}
                onChange={(e) => setMinSalary(e.target.value)}
                placeholder="e.g. 5000000"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Posted salary max (TZS)</span>
              <input
                type="text"
                inputMode="numeric"
                value={maxSalary}
                onChange={(e) => setMaxSalary(e.target.value)}
                placeholder="e.g. 7500000"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Description (optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Role summary for the careers page."
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Responsibilities</span>
              <textarea value={responsibilities} onChange={(e) => setResponsibilities(e.target.value)} rows={4} placeholder="One responsibility per line" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Requirements</span>
              <textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} rows={4} placeholder="One requirement per line" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]" />
            </label>
          </div>

          <label className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 text-sm font-medium text-gray-700">
            <input type="checkbox" checked={showSalary} onChange={(e) => setShowSalary(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
            Show the salary range publicly on the role page
          </label>
        </div>

        {error && (
          <div className="border-t border-gray-100 px-6 pt-3 text-sm font-medium text-rose-700">{error}</div>
        )}

        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className={opusButtonClass({ variant: 'neutral' })}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !title || !hiringManager || !minSalary || !maxSalary}
            className={opusButtonClass()}
          >
            {pending ? 'Creating…' : 'Create job'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add candidate
// ---------------------------------------------------------------------------

function AddCandidateDialog({
  job,
  onClose,
}: {
  job: Job
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [source, setSource] = useState<Candidate['source']>('Careers Page')
  const [rating, setRating] = useState(3)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function submit() {
    setError(null)
    startTransition(async () => {
      try {
        await addCandidate({
          jobId: job.id,
          name,
          email,
          source,
          rating,
        })
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not add candidate.')
      }
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Add candidate</h2>
            <p className="mt-1 text-sm text-gray-500">{job.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
          className={opusButtonClass({ variant: 'tertiary', size: 'icon-small' })}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Full name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Source</span>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as Candidate['source'])}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Rating</span>
              <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button data-opus-button="control"
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    aria-label={`Rate ${n}`}
                    className="rounded p-0.5 hover:bg-amber-50"
                  >
                    <Star
                      className={cn(
                        'h-4 w-4',
                        n <= rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200',
                      )}
                    />
                  </button>
                ))}
              </div>
            </label>
          </div>
        </div>

        {error && <p className="mt-3 text-sm font-medium text-rose-700">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className={opusButtonClass({ variant: 'neutral' })}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !name || !email}
            className={opusButtonClass()}
          >
            {pending ? 'Adding…' : 'Add candidate'}
          </button>
        </div>
      </div>
    </div>
  )
}
