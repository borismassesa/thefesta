'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import {
  BookOpen,
  ClipboardCheck,
  Inbox,
  MessageSquare,
  Milestone,
  Plus,
  Sprout,
  Target,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  APPROVAL_STATUS_LABELS,
  GOAL_LEVEL_LABELS,
  GOAL_STATUS_LABELS,
  GOAL_VISIBILITIES,
  GOAL_VISIBILITY_LABELS,
  MEASUREMENT_TYPE_LABELS,
  attainment,
  formatValue,
  isGoalClosed,
  sortGoals,
  validateWeights,
  type ApprovalStatus,
  type GoalStatus,
  type GoalVisibility,
} from '@/lib/performance/goals'
import {
  CYCLE_STAGES,
  CYCLE_STAGE_ASKS,
  CYCLE_STAGE_LABELS,
  REVIEW_KIND_LABELS,
  REVIEW_STATE_LABELS,
  canWriteReview,
  stageRank,
} from '@/lib/performance/cycle'
import { SECTION_VISIBILITY_LABELS } from '@/lib/performance/authorization'
import type {
  CheckInRow,
  CompetencyRow,
  CycleRow,
  DevelopmentActionRow,
  EvidenceRow,
  FeedbackRow,
  GoalRow,
  RatingRow,
  ReviewRow,
  ReviewSectionRow,
} from '@/lib/performance/queries'
import type { ActionResult } from './actions'

// Goals and performance.
//
// The lists here arrived already scoped: a review this employee may not open
// was never sent, and a calibration note about them was dropped inside the
// database. Nothing on this page filters for permission, because nothing on it
// received anything it should not have.
//
// What the UI decides is what to OFFER. A review somebody can read but not
// write gets no editor, which matches what the server would refuse anyway.

const GREEN_PILL =
  'inline-flex items-center rounded-full bg-[#9FE870] px-2.5 py-0.5 text-[11px] font-semibold text-gray-900'

const CARD =
  'rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]'

const STATUS_TONE: Record<GoalStatus, string> = {
  not_started: 'bg-gray-100 text-gray-600',
  on_track: 'bg-emerald-50 text-emerald-700',
  at_risk: 'bg-amber-50 text-amber-800',
  off_track: 'bg-rose-50 text-rose-700',
  achieved: 'bg-emerald-100 text-emerald-800',
  partially_achieved: 'bg-amber-100 text-amber-800',
  missed: 'bg-rose-100 text-rose-800',
  cancelled: 'bg-gray-100 text-gray-400',
}

const APPROVAL_TONE: Record<ApprovalStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pending_approval: 'bg-blue-50 text-blue-700',
  approved: 'bg-emerald-50 text-emerald-700',
  changes_requested: 'bg-amber-50 text-amber-800',
  rejected: 'bg-rose-50 text-rose-700',
}

const SECTION_TONE: Record<string, string> = {
  employee_visible: 'bg-emerald-50 text-emerald-700',
  manager_only: 'bg-amber-50 text-amber-800',
  calibration_only: 'bg-violet-50 text-violet-700',
  hr_only: 'bg-rose-50 text-rose-700',
}

type Actions = {
  createGoal: (input: {
    title: string
    description?: string
    cycleId?: string | null
    dueDate?: string | null
    weight?: number
    visibility?: GoalVisibility
    parentGoalId?: string | null
  }) => Promise<ActionResult<{ goalId: string }>>
  updateGoalProgress: (goalId: string, progress: number, note?: string) => Promise<ActionResult<{ progress: number }>>
  addGoalEvidence: (goalId: string, body: string) => Promise<ActionResult>
  submitGoalForApproval: (goalId: string) => Promise<ActionResult<{ status: string }>>
  decideGoalApproval: (
    goalId: string,
    decision: 'approve' | 'reject' | 'request_changes',
    note?: string,
  ) => Promise<ActionResult<{ status: string }>>
  saveReviewSection: (sectionId: string, body: string) => Promise<ActionResult>
  setReviewRating: (input: {
    reviewId: string
    competencyId?: string | null
    goalId?: string | null
    rating: number
    rationale: string
    changeReason?: string
  }) => Promise<ActionResult<{ ratingId: string }>>
  submitReview: (reviewId: string) => Promise<ActionResult<{ state: string }>>
  finaliseReview: (
    reviewId: string,
    overallRating: number | null,
    summary: string,
  ) => Promise<ActionResult<{ state: string }>>
  acknowledgeReview: (reviewId: string, note: string, disagrees: boolean) => Promise<ActionResult<{ state: string }>>
  requestFeedback: (input: {
    respondentEmployeeId: string
    relationship: 'manager' | 'peer' | 'direct_report' | 'skip_level' | 'cross_functional'
    message?: string
  }) => Promise<ActionResult<{ requestId: string }>>
  respondToFeedback: (input: {
    requestId: string
    strengths: string
    improvements: string
    overallScore?: number | null
  }) => Promise<ActionResult>
  createDevelopmentAction: (input: {
    title: string
    description?: string
    actionType?: string
    competencyId?: string | null
    targetDate?: string | null
  }) => Promise<ActionResult<{ actionId: string }>>
  updateDevelopmentAction: (
    actionId: string,
    status: 'planned' | 'in_progress' | 'completed' | 'abandoned' | 'blocked',
    progressNote?: string,
  ) => Promise<ActionResult>
}

type Tab = 'goals' | 'reviews' | 'feedback' | 'development' | 'checkins' | 'evidence' | 'queue'

type ReviewDetail = {
  reviewId: string
  sections: ReviewSectionRow[]
  ratings: RatingRow[]
}

function formatDay(date: string | null): string {
  if (!date) return 'No date'
  const [y, m, d] = date.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export default function PerformanceClient({
  employeeId,
  isHr,
  cycle,
  goals,
  approvalQueue,
  reviews,
  reviewDetail,
  competencies,
  development,
  checkIns,
  feedbackInbox,
  feedback,
  evidence,
  actions,
}: {
  employeeId: string
  isHr: boolean
  cycle: CycleRow | null
  goals: GoalRow[]
  approvalQueue: GoalRow[]
  reviews: ReviewRow[]
  reviewDetail: ReviewDetail[]
  competencies: CompetencyRow[]
  development: DevelopmentActionRow[]
  checkIns: CheckInRow[]
  feedbackInbox: { id: string; subjectName: string | null; relationship: string; dueDate: string | null }[]
  feedback: FeedbackRow[]
  evidence: EvidenceRow[]
  actions: Actions
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [tab, setTab] = useState<Tab>('goals')
  const [showGoalForm, setShowGoalForm] = useState(false)

  const run = (fn: () => Promise<ActionResult>, okText?: string) => {
    setMessage(null)
    startTransition(async () => {
      const result = await fn()
      if (result.ok) {
        if (okText) setMessage({ tone: 'ok', text: okText })
        router.refresh()
      } else {
        setMessage({ tone: 'error', text: result.error })
      }
    })
  }

  const myGoals = useMemo(
    () => goals.filter((g) => g.ownerEmployeeId === employeeId),
    [goals, employeeId],
  )
  const sharedGoals = useMemo(
    () => goals.filter((g) => g.ownerEmployeeId !== employeeId),
    [goals, employeeId],
  )

  // The same arithmetic the database does at the approval gate, run here so
  // somebody can see they are at 80 of 100 while they are still typing.
  const weights = useMemo(() => {
    if (!cycle) return null
    return validateWeights(
      myGoals
        .filter((g) => g.level === 'employee')
        .map((g) => ({ weight: g.weight, status: g.status, approvalStatus: g.approvalStatus })),
      {
        requiredTotal: cycle.weightTotalRequired,
        tolerance: cycle.weightTolerance,
        minGoals: cycle.minGoals,
        maxGoals: cycle.maxGoals,
      },
    )
  }, [myGoals, cycle])

  const detailByReview = useMemo(
    () => new Map(reviewDetail.map((d) => [d.reviewId, d])),
    [reviewDetail],
  )

  const ALL_TABS: { id: Tab; label: string; icon: typeof Target; count?: number }[] = [
    { id: 'goals', label: 'My goals', icon: Target, count: myGoals.length },
    { id: 'reviews', label: 'Reviews', icon: ClipboardCheck, count: reviews.length },
    { id: 'feedback', label: 'Feedback', icon: MessageSquare, count: feedbackInbox.length },
    { id: 'development', label: 'Development', icon: Sprout, count: development.length },
    { id: 'checkins', label: 'Check ins', icon: Milestone, count: checkIns.length },
    { id: 'evidence', label: 'Evidence', icon: BookOpen },
    { id: 'queue', label: 'To approve', icon: Inbox, count: approvalQueue.length },
  ]
  // The approval queue is only a tab for somebody who actually has reports.
  // Hiding it is a courtesy: goal_decide_approval() re-checks the reporting
  // line regardless of what the browser shows.
  const TABS = ALL_TABS.filter((t) => t.id !== 'queue' || approvalQueue.length > 0 || isHr)

  return (
    <div className="space-y-5">
      {cycle && <CycleBanner cycle={cycle} />}

      <nav className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors',
                  tab === t.id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
                {t.label}
                {t.count ? (
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[11px] font-semibold',
                      tab === t.id ? 'bg-white/20' : 'bg-gray-200 text-gray-700',
                    )}
                  >
                    {t.count}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
        {tab === 'goals' && (
          <button
            type="button"
            onClick={() => setShowGoalForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            {showGoalForm ? 'Close' : 'Propose a goal'}
          </button>
        )}
      </nav>

      {message && (
        <p
          className={cn(
            'rounded-xl px-4 py-3 text-sm',
            message.tone === 'error' ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800',
          )}
        >
          {message.text}
        </p>
      )}

      {tab === 'goals' && (
        <div className="space-y-5">
          {weights && <WeightMeter weights={weights} cycle={cycle!} />}

          {showGoalForm && (
            <GoalForm
              cycle={cycle}
              alignable={goals.filter((g) => g.level !== 'employee')}
              pending={pending}
              onCreate={async (input) => {
                const result = await actions.createGoal(input)
                if (result.ok) {
                  setShowGoalForm(false)
                  setMessage({ tone: 'ok', text: 'Goal saved as a draft. Send it to your manager when the set is complete.' })
                  router.refresh()
                }
                return result
              }}
            />
          )}

          {myGoals.length === 0 ? (
            <Empty>You have not set any goals for this cycle yet.</Empty>
          ) : (
            <ul className="space-y-3">
              {sortGoals(myGoals, new Date().toISOString().slice(0, 10)).map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  isOwner
                  pending={pending}
                  actions={actions}
                  onRun={run}
                />
              ))}
            </ul>
          )}

          {sharedGoals.length > 0 && (
            <section className={CARD}>
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-gray-500">
                What you are aligned to
              </h2>
              <ul className="mt-3 divide-y divide-gray-100">
                {sharedGoals.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="min-w-0">
                      <span className="text-[13px] font-medium text-gray-900">{g.title}</span>
                      <span className="ml-2 text-[12px] text-gray-400">{GOAL_LEVEL_LABELS[g.level]}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={GREEN_PILL}>{Math.round(g.progress)}%</span>
                      <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold', STATUS_TONE[g.status])}>
                        {GOAL_STATUS_LABELS[g.status]}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {tab === 'queue' && (
        <div className="space-y-3">
          {approvalQueue.length === 0 ? (
            <Empty>No goals are waiting on your decision.</Empty>
          ) : (
            <ul className="space-y-3">
              {approvalQueue.map((goal) => (
                <ApprovalCard key={goal.id} goal={goal} pending={pending} actions={actions} onRun={run} />
              ))}
            </ul>
          )}
          <p className="text-[12px] text-gray-400">
            You can only decide on the goals of people who report directly to you. Nobody approves their
            own, including People Ops.
          </p>
        </div>
      )}

      {tab === 'reviews' && (
        <Reviews
          reviews={reviews}
          detailByReview={detailByReview}
          employeeId={employeeId}
          isHr={isHr}
          cycle={cycle}
          competencies={competencies}
          goals={goals}
          pending={pending}
          actions={actions}
          onRun={run}
        />
      )}

      {tab === 'feedback' && (
        <Feedback
          inbox={feedbackInbox}
          received={feedback}
          pending={pending}
          actions={actions}
          onRun={run}
        />
      )}

      {tab === 'development' && (
        <Development
          actionsList={development}
          competencies={competencies}
          pending={pending}
          actions={actions}
          onRun={run}
        />
      )}

      {tab === 'checkins' && <CheckIns checkIns={checkIns} />}

      {tab === 'evidence' && <Evidence evidence={evidence} />}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cycle
// ---------------------------------------------------------------------------

function CycleBanner({ cycle }: { cycle: CycleRow }) {
  const current = stageRank(cycle.stage)
  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">{cycle.name}</h2>
          <p className="mt-0.5 text-[13px] text-gray-500">
            {formatDay(cycle.startsOn)} to {formatDay(cycle.endsOn)}
          </p>
        </div>
        <span className={GREEN_PILL}>{CYCLE_STAGE_LABELS[cycle.stage]}</span>
      </div>

      <p className="mt-3 text-[13px] text-gray-700">{CYCLE_STAGE_ASKS[cycle.stage]}</p>

      <ol className="mt-3 flex flex-wrap gap-1">
        {CYCLE_STAGES.map((stage, i) => (
          <li
            key={stage}
            title={CYCLE_STAGE_LABELS[stage]}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              i + 1 < current ? 'bg-[#9FE870]' : i + 1 === current ? 'bg-gray-900' : 'bg-gray-100',
            )}
          />
        ))}
      </ol>
    </section>
  )
}

function WeightMeter({
  weights,
  cycle,
}: {
  weights: ReturnType<typeof validateWeights>
  cycle: CycleRow
}) {
  const percent = Math.min(100, Math.round((weights.total / cycle.weightTotalRequired) * 100))
  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-gray-500">
          Goal weights
        </h2>
        <span className={weights.isValid ? GREEN_PILL : 'rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800'}>
          {weights.total} of {cycle.weightTotalRequired}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className={cn('h-full rounded-full', weights.isValid ? 'bg-[#9FE870]' : 'bg-amber-400')}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-[13px] text-gray-600">
        {weights.message ?? 'Your goals satisfy this cycle. You can send them for approval.'}
      </p>
      <p className="mt-1 text-[12px] text-gray-400">
        Checked over the whole set, not one goal at a time. Cancelled and rejected goals stop counting.
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

function GoalCard({
  goal,
  isOwner,
  pending,
  actions,
  onRun,
}: {
  goal: GoalRow
  isOwner: boolean
  pending: boolean
  actions: Actions
  onRun: (fn: () => Promise<ActionResult>, okText?: string) => void
}) {
  const [progress, setProgress] = useState(String(Math.round(goal.progress)))
  const [note, setNote] = useState('')
  const editable = isOwner && !isGoalClosed(goal.status)

  return (
    <li className={CARD}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{goal.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-gray-500">
            {goal.weight > 0 && <span className={GREEN_PILL}>Weight {goal.weight}</span>}
            <span>{GOAL_LEVEL_LABELS[goal.level]}</span>
            {goal.parentTitle && <span>Aligned to {goal.parentTitle}</span>}
            <span>Due {formatDay(goal.dueDate)}</span>
            <span>{GOAL_VISIBILITY_LABELS[goal.visibility]}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold', APPROVAL_TONE[goal.approvalStatus])}>
            {APPROVAL_STATUS_LABELS[goal.approvalStatus]}
          </span>
          <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold', STATUS_TONE[goal.status])}>
            {GOAL_STATUS_LABELS[goal.status]}
          </span>
        </div>
      </div>

      {goal.description && <p className="mt-2 text-sm text-gray-700">{goal.description}</p>}

      {goal.approvalNote && goal.approvalStatus !== 'approved' && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          From your manager: {goal.approvalNote}
        </p>
      )}

      <div className="mt-3">
        <div className="flex items-center justify-between text-[12px] text-gray-500">
          <span>
            {Math.round(goal.progress)}% complete
            {goal.progressSource === 'key_results' && ' (rolled up from the key results)'}
          </span>
          <span>{goal.updateCount} updates</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-[#9FE870]" style={{ width: `${Math.min(100, goal.progress)}%` }} />
        </div>
      </div>

      {goal.keyResults.length > 0 && (
        <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100 pt-2">
          {goal.keyResults.map((kr) => (
            <li key={kr.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="text-[13px] text-gray-900">{kr.title}</span>
                <span className="ml-2 text-[11px] uppercase tracking-wide text-gray-400">
                  {MEASUREMENT_TYPE_LABELS[kr.measurementType]}
                </span>
              </span>
              <span className="flex items-center gap-2 text-[12px] text-gray-500">
                <span>
                  {formatValue(kr, kr.currentValue)}
                  {kr.targetValue !== null && ` of ${formatValue(kr, kr.targetValue)}`}
                </span>
                <span className={GREEN_PILL}>{Math.round(attainment(kr))}%</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">
              Progress
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={progress}
              onChange={(e) => setProgress(e.target.value)}
              className="w-20 rounded-lg border border-gray-200 px-3 py-1.5 text-[13px]"
            />
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What moved, and what is the evidence?"
              className="min-w-[220px] flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-[13px]"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                onRun(async () => {
                  const result = await actions.updateGoalProgress(goal.id, Number(progress), note || undefined)
                  if (result.ok) setNote('')
                  return result
                }, 'Progress recorded.')
              }
              className="rounded-full bg-gray-900 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              disabled={pending || !note.trim()}
              onClick={() =>
                onRun(async () => {
                  const result = await actions.addGoalEvidence(goal.id, note)
                  if (result.ok) setNote('')
                  return result
                }, 'Evidence attached.')
              }
              className="rounded-full border border-gray-200 px-4 py-1.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Attach as evidence
            </button>
          </div>

          {(goal.approvalStatus === 'draft' || goal.approvalStatus === 'changes_requested') && (
            <button
              type="button"
              disabled={pending}
              onClick={() => onRun(() => actions.submitGoalForApproval(goal.id), 'Sent to your manager.')}
              className="rounded-full bg-[#9FE870] px-4 py-1.5 text-[13px] font-semibold text-gray-900 hover:brightness-95 disabled:opacity-40"
            >
              Send for approval
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function ApprovalCard({
  goal,
  pending,
  actions,
  onRun,
}: {
  goal: GoalRow
  pending: boolean
  actions: Actions
  onRun: (fn: () => Promise<ActionResult>, okText?: string) => void
}) {
  const [note, setNote] = useState('')
  return (
    <li className={CARD}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{goal.title}</p>
          <p className="mt-0.5 text-[13px] text-gray-500">
            {goal.ownerName ?? 'Employee'} · weight {goal.weight} · due {formatDay(goal.dueDate)}
          </p>
          {goal.description && <p className="mt-2 text-sm text-gray-700">{goal.description}</p>}
        </div>
        <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold', APPROVAL_TONE[goal.approvalStatus])}>
          {APPROVAL_STATUS_LABELS[goal.approvalStatus]}
        </span>
      </div>

      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What needs to change? Required if you are not approving."
        className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !note.trim()}
          onClick={() => onRun(() => actions.decideGoalApproval(goal.id, 'reject', note))}
          className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-[13px] font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-40"
        >
          Reject
        </button>
        <button
          type="button"
          disabled={pending || !note.trim()}
          onClick={() => onRun(() => actions.decideGoalApproval(goal.id, 'request_changes', note))}
          className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-40"
        >
          Ask for changes
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => onRun(() => actions.decideGoalApproval(goal.id, 'approve', note || undefined))}
          className="rounded-full bg-[#9FE870] px-4 py-2 text-[13px] font-semibold text-gray-900 hover:brightness-95 disabled:opacity-40"
        >
          Approve
        </button>
      </div>
    </li>
  )
}

function GoalForm({
  cycle,
  alignable,
  pending,
  onCreate,
}: {
  cycle: CycleRow | null
  alignable: GoalRow[]
  pending: boolean
  onCreate: (input: {
    title: string
    description?: string
    cycleId?: string | null
    dueDate?: string | null
    weight?: number
    visibility?: GoalVisibility
    parentGoalId?: string | null
  }) => Promise<ActionResult>
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [weight, setWeight] = useState('')
  const [dueDate, setDueDate] = useState(cycle?.endsOn ?? '')
  const [visibility, setVisibility] = useState<GoalVisibility>('manager')
  const [parentGoalId, setParentGoalId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <form
      className={cn('space-y-4', CARD)}
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        setBusy(true)
        const result = await onCreate({
          title,
          description,
          cycleId: cycle?.id ?? null,
          dueDate: dueDate || null,
          weight: weight ? Number(weight) : 0,
          visibility,
          parentGoalId: parentGoalId || null,
        })
        setBusy(false)
        if (result.ok) {
          setTitle('')
          setDescription('')
          setWeight('')
        } else {
          setError(result.error)
        }
      }}
    >
      <label className="block text-[13px] font-semibold text-gray-700">
        What are you setting out to do
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={500}
          placeholder="Cut vendor onboarding time from ten days to four"
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-[13px] font-semibold text-gray-700">
          Aligned to
          <select
            value={parentGoalId}
            onChange={(e) => setParentGoalId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
          >
            <option value="">Nothing yet</option>
            {alignable.map((g) => (
              <option key={g.id} value={g.id}>
                {GOAL_LEVEL_LABELS[g.level]}: {g.title}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[13px] font-semibold text-gray-700">
          Weight
          <input
            type="number"
            min={0}
            max={100}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder={cycle ? `of ${cycle.weightTotalRequired}` : ''}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
          />
        </label>

        <label className="text-[13px] font-semibold text-gray-700">
          Due
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
          />
        </label>

        <label className="text-[13px] font-semibold text-gray-700">
          Who can see it
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as GoalVisibility)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
          >
            {GOAL_VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {GOAL_VISIBILITY_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-[13px] font-semibold text-gray-700">
        How you will know it worked
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
        />
      </label>

      <p className="text-[12px] text-gray-400">
        Goals start as drafts. Nothing goes to your manager until the whole set adds up to what the
        cycle asks for.
      </p>
      {error && <p className="text-sm text-rose-700">{error}</p>}

      <button
        type="submit"
        disabled={pending || busy || !title.trim()}
        className="rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
      >
        Save draft
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

function Reviews({
  reviews,
  detailByReview,
  employeeId,
  isHr,
  cycle,
  competencies,
  goals,
  pending,
  actions,
  onRun,
}: {
  reviews: ReviewRow[]
  detailByReview: Map<string, ReviewDetail>
  employeeId: string
  isHr: boolean
  cycle: CycleRow | null
  competencies: CompetencyRow[]
  goals: GoalRow[]
  pending: boolean
  actions: Actions
  onRun: (fn: () => Promise<ActionResult>, okText?: string) => void
}) {
  if (reviews.length === 0) {
    return <Empty>No reviews yet. They appear when the cycle reaches the review stages.</Empty>
  }

  return (
    <div className="space-y-4">
      {reviews.map((review) => (
        <ReviewCard
          key={review.id}
          review={review}
          detail={detailByReview.get(review.id)}
          employeeId={employeeId}
          isHr={isHr}
          cycle={cycle}
          competencies={competencies}
          goals={goals}
          pending={pending}
          actions={actions}
          onRun={onRun}
        />
      ))}
      <p className="text-[12px] text-gray-400">
        Your review is visible to you, whoever is named as your reviewer, your manager and People Ops.
        Nobody else, at any level.
      </p>
    </div>
  )
}

function ReviewCard({
  review,
  detail,
  employeeId,
  isHr,
  cycle,
  competencies,
  goals,
  pending,
  actions,
  onRun,
}: {
  review: ReviewRow
  detail: ReviewDetail | undefined
  employeeId: string
  isHr: boolean
  cycle: CycleRow | null
  competencies: CompetencyRow[]
  goals: GoalRow[]
  pending: boolean
  actions: Actions
  onRun: (fn: () => Promise<ActionResult>, okText?: string) => void
}) {
  const [ackNote, setAckNote] = useState('')
  const [disagrees, setDisagrees] = useState(false)

  const isSubject = review.employeeId === employeeId
  const isReviewer = review.reviewerEmployeeId === employeeId
  const writable = canWriteReview(review.state, isHr) && (isReviewer || isHr)
  const liveRatings = (detail?.ratings ?? []).filter((r) => r.supersededAt === null)
  const history = (detail?.ratings ?? []).filter((r) => r.supersededAt !== null)

  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">
            {REVIEW_KIND_LABELS[review.kind]}
            {!isSubject && review.employeeName && (
              <span className="ml-2 font-normal text-gray-500">{review.employeeName}</span>
            )}
          </h2>
          <p className="mt-0.5 text-[13px] text-gray-500">
            {isSubject
              ? review.reviewerName
                ? `Written by ${review.reviewerName}`
                : 'No reviewer assigned yet'
              : 'You are the reviewer'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {review.overallRating !== null && (
            <span className={GREEN_PILL}>
              {review.overallRating}
              {review.overallRatingLabel ? ` ${review.overallRatingLabel}` : ''}
            </span>
          )}
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-700">
            {REVIEW_STATE_LABELS[review.state]}
          </span>
        </div>
      </div>

      {review.correctionReason && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          People Ops opened a correction: {review.correctionReason}
        </p>
      )}

      {review.summary && <p className="mt-3 text-sm text-gray-700">{review.summary}</p>}

      {detail && detail.sections.length > 0 && (
        <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
          {detail.sections.map((section) => (
            <ReviewSection
              key={section.id}
              section={section}
              writable={writable}
              pending={pending}
              onSave={(body) => onRun(() => actions.saveReviewSection(section.id, body), 'Saved.')}
            />
          ))}
        </div>
      )}

      {liveRatings.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">Ratings</h3>
          <ul className="mt-2 divide-y divide-gray-100">
            {liveRatings.map((r) => (
              <li key={r.id} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-gray-900">
                    {r.competencyName ?? r.goalTitle ?? 'Rating'}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={GREEN_PILL}>
                      {r.rating} of {r.scaleMax}
                      {r.ratingLabel ? ` · ${r.ratingLabel}` : ''}
                    </span>
                    {r.source === 'hr_correction' && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                        Corrected
                      </span>
                    )}
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-gray-600">{r.rationale}</p>
                {r.ratedByName && <p className="text-[12px] text-gray-400">{r.ratedByName}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {history.length > 0 && (
        <details className="mt-3 border-t border-gray-100 pt-3">
          <summary className="cursor-pointer text-[13px] font-medium text-gray-600 hover:text-gray-900">
            Rating history ({history.length} superseded)
          </summary>
          <ul className="mt-2 divide-y divide-gray-100">
            {history.map((r) => (
              <li key={r.id} className="py-2 text-[13px] text-gray-500">
                <span className="line-through">
                  {r.competencyName ?? r.goalTitle}: {r.rating}
                </span>
                {r.changeReason && <span className="ml-2">Changed because: {r.changeReason}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-gray-400">
            A rating is never edited. Changing one keeps both, with the reason for the change.
          </p>
        </details>
      )}

      {writable && cycle && (
        <RatingForm
          reviewId={review.id}
          cycle={cycle}
          competencies={competencies}
          goals={goals.filter((g) => g.ownerEmployeeId === review.employeeId)}
          existing={liveRatings}
          pending={pending}
          actions={actions}
          onRun={onRun}
        />
      )}

      {writable && (review.state === 'not_started' || review.state === 'in_progress') && (
        <button
          type="button"
          disabled={pending}
          onClick={() => onRun(() => actions.submitReview(review.id), 'Review submitted.')}
          className="mt-3 rounded-full border border-gray-200 px-4 py-2 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          Submit review
        </button>
      )}

      {writable && review.state === 'submitted' && cycle && (
        <FinaliseForm
          reviewId={review.id}
          cycle={cycle}
          pending={pending}
          actions={actions}
          onRun={onRun}
        />
      )}

      {isSubject && review.state === 'finalised' && (
        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          <textarea
            rows={2}
            value={ackNote}
            onChange={(e) => setAckNote(e.target.value)}
            placeholder="Anything you want on the record alongside it"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-[13px] text-gray-700">
            <input
              type="checkbox"
              checked={disagrees}
              onChange={(e) => setDisagrees(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            I do not agree with this review
          </label>
          <button
            type="button"
            disabled={pending || (disagrees && !ackNote.trim())}
            onClick={() =>
              onRun(
                () => actions.acknowledgeReview(review.id, ackNote, disagrees),
                'Acknowledged. Your note is on the record.',
              )
            }
            className="rounded-full bg-[#9FE870] px-4 py-2 text-[13px] font-semibold text-gray-900 hover:brightness-95 disabled:opacity-40"
          >
            Acknowledge
          </button>
          <p className="text-[12px] text-gray-400">
            Acknowledging says you have read it, not that you agree. If you disagree, say so here and
            it stays next to the review.
          </p>
        </div>
      )}

      {isSubject && review.acknowledgedAt && (
        <p className="mt-3 border-t border-gray-100 pt-3 text-[13px] text-gray-600">
          You acknowledged this on {formatDay(review.acknowledgedAt)}
          {review.employeeDisagrees && ', recording that you disagree'}.
          {review.acknowledgmentNote && ` "${review.acknowledgmentNote}"`}
        </p>
      )}
    </section>
  )
}

function ReviewSection({
  section,
  writable,
  pending,
  onSave,
}: {
  section: ReviewSectionRow
  writable: boolean
  pending: boolean
  onSave: (body: string) => void
}) {
  const [body, setBody] = useState(section.body)
  const dirty = body !== section.body

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-gray-900">{section.title}</h3>
        {/* Anybody writing here should know who ends up reading it. A
            calibration note is candid precisely because it is not shared, and
            the label is what stops somebody assuming otherwise. */}
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-semibold',
            SECTION_TONE[section.visibility] ?? 'bg-gray-100 text-gray-600',
          )}
        >
          {SECTION_VISIBILITY_LABELS[section.visibility]}
        </span>
      </div>

      {writable ? (
        <>
          <textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          {dirty && (
            <button
              type="button"
              disabled={pending}
              onClick={() => onSave(body)}
              className="mt-1 rounded-full border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Save this section
            </button>
          )}
        </>
      ) : (
        <p className="mt-1 whitespace-pre-line text-[13px] text-gray-700">
          {section.body || <span className="text-gray-300">Nothing written yet</span>}
        </p>
      )}
    </div>
  )
}

function RatingForm({
  reviewId,
  cycle,
  competencies,
  goals,
  existing,
  pending,
  actions,
  onRun,
}: {
  reviewId: string
  cycle: CycleRow
  competencies: CompetencyRow[]
  goals: GoalRow[]
  existing: RatingRow[]
  pending: boolean
  actions: Actions
  onRun: (fn: () => Promise<ActionResult>, okText?: string) => void
}) {
  const [subject, setSubject] = useState('')
  const [rating, setRating] = useState(String(cycle.ratingScaleMin))
  const [rationale, setRationale] = useState('')
  const [changeReason, setChangeReason] = useState('')

  const [kind, id] = subject.split(':')
  // A rating that already exists is a CHANGE, and a change has to say why.
  // Surfacing that before they type, rather than after the server refuses.
  const isChange = existing.some((r) =>
    kind === 'competency' ? r.competencyId === id : r.goalId === id,
  )

  const scale = Array.from(
    { length: cycle.ratingScaleMax - cycle.ratingScaleMin + 1 },
    (_, i) => cycle.ratingScaleMin + i,
  )

  return (
    <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">
        Rate a competency or a goal
      </h3>
      <div className="flex flex-wrap gap-2">
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="min-w-[200px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-[13px]"
        >
          <option value="">Choose what you are rating</option>
          <optgroup label="Competencies">
            {competencies.map((c) => (
              <option key={c.id} value={`competency:${c.id}`}>
                {c.name}
              </option>
            ))}
          </optgroup>
          {goals.length > 0 && (
            <optgroup label="Goals">
              {goals.map((g) => (
                <option key={g.id} value={`goal:${g.id}`}>
                  {g.title}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        <select
          value={rating}
          onChange={(e) => setRating(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-[13px]"
        >
          {scale.map((n) => {
            const label = cycle.ratingScaleLabels.find((l) => Number(l.value) === n)?.label
            return (
              <option key={n} value={n}>
                {n}
                {label ? ` · ${label}` : ''}
              </option>
            )
          })}
        </select>
      </div>

      <textarea
        rows={2}
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        placeholder="Why this rating? Give the example you have in mind."
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
      />

      {isChange && (
        <input
          type="text"
          value={changeReason}
          onChange={(e) => setChangeReason(e.target.value)}
          placeholder="This is already rated. Why are you changing it?"
          className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
        />
      )}

      <button
        type="button"
        disabled={pending || !subject || !rationale.trim() || (isChange && !changeReason.trim())}
        onClick={() =>
          onRun(async () => {
            const result = await actions.setReviewRating({
              reviewId,
              competencyId: kind === 'competency' ? id : null,
              goalId: kind === 'goal' ? id : null,
              rating: Number(rating),
              rationale,
              changeReason: changeReason || undefined,
            })
            if (result.ok) {
              setRationale('')
              setChangeReason('')
              setSubject('')
            }
            return result
          }, isChange ? 'Rating changed. Both versions are on the record.' : 'Rating saved.')
        }
        className="rounded-full bg-gray-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
      >
        {isChange ? 'Change the rating' : 'Save rating'}
      </button>

      <p className="text-[12px] text-gray-400">
        Every rating needs a reason, and no rating is ever calculated from how much work somebody
        logged. Tasks, reports and tracker entries are evidence for you to read.
      </p>
    </div>
  )
}

function FinaliseForm({
  reviewId,
  cycle,
  pending,
  actions,
  onRun,
}: {
  reviewId: string
  cycle: CycleRow
  pending: boolean
  actions: Actions
  onRun: (fn: () => Promise<ActionResult>, okText?: string) => void
}) {
  const [overall, setOverall] = useState('')
  const [summary, setSummary] = useState('')

  const scale = Array.from(
    { length: cycle.ratingScaleMax - cycle.ratingScaleMin + 1 },
    (_, i) => cycle.ratingScaleMin + i,
  )

  return (
    <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">Finalise</h3>
      <div className="flex flex-wrap gap-2">
        <select
          value={overall}
          onChange={(e) => setOverall(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-[13px]"
        >
          <option value="">No overall rating</option>
          {scale.map((n) => {
            const label = cycle.ratingScaleLabels.find((l) => Number(l.value) === n)?.label
            return (
              <option key={n} value={n}>
                {n}
                {label ? ` · ${label}` : ''}
              </option>
            )
          })}
        </select>
      </div>
      <textarea
        rows={3}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="The summary the employee will read."
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
      />
      <button
        type="button"
        disabled={pending || !summary.trim()}
        onClick={() =>
          onRun(
            () => actions.finaliseReview(reviewId, overall ? Number(overall) : null, summary),
            'Finalised. It is with the employee to acknowledge.',
          )
        }
        className="rounded-full bg-gray-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
      >
        Finalise review
      </button>
      <p className="text-[12px] text-gray-400">
        An overall rating needs at least one component rating under it first. Once the cycle closes,
        only People Ops can reopen this, and the reason is recorded.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

function Feedback({
  inbox,
  received,
  pending,
  actions,
  onRun,
}: {
  inbox: { id: string; subjectName: string | null; relationship: string; dueDate: string | null }[]
  received: FeedbackRow[]
  pending: boolean
  actions: Actions
  onRun: (fn: () => Promise<ActionResult>, okText?: string) => void
}) {
  return (
    <div className="space-y-4">
      {inbox.length > 0 && (
        <section className={CARD}>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-gray-500">
            Asked of you
          </h2>
          <ul className="mt-3 space-y-4">
            {inbox.map((request) => (
              <FeedbackAnswerForm
                key={request.id}
                request={request}
                pending={pending}
                actions={actions}
                onRun={onRun}
              />
            ))}
          </ul>
        </section>
      )}

      <section className={CARD}>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-gray-500">
          Feedback about you
        </h2>
        {received.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">
            Nothing yet. Ask a colleague for feedback and it appears here once they answer.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {received.map((f) => (
              <li key={f.requestId} className="rounded-xl border border-gray-100 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-gray-900">{f.respondentLabel}</span>
                  <span className="flex items-center gap-2">
                    {f.overallScore !== null && <span className={GREEN_PILL}>{f.overallScore}</span>}
                    <span className="text-[12px] text-gray-400">{f.status}</span>
                  </span>
                </div>
                {f.strengths === null && f.status === 'submitted' ? (
                  <p className="mt-2 text-[13px] text-gray-400">
                    This answer was not shared with you. Your manager has it.
                  </p>
                ) : (
                  <>
                    {f.strengths && <p className="mt-2 text-[13px] text-gray-700">{f.strengths}</p>}
                    {f.improvements && (
                      <p className="mt-1 text-[13px] text-gray-600">{f.improvements}</p>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[12px] text-gray-400">
          Anonymity is decided when the request is sent and applied to everybody who reads it
          afterwards, People Ops included.
        </p>
      </section>
    </div>
  )
}

function FeedbackAnswerForm({
  request,
  pending,
  actions,
  onRun,
}: {
  request: { id: string; subjectName: string | null; relationship: string; dueDate: string | null }
  pending: boolean
  actions: Actions
  onRun: (fn: () => Promise<ActionResult>, okText?: string) => void
}) {
  const [strengths, setStrengths] = useState('')
  const [improvements, setImprovements] = useState('')

  return (
    <li className="rounded-xl border border-gray-100 p-4">
      <p className="text-[13px] font-medium text-gray-900">
        {request.subjectName ?? 'A colleague'} asked for your feedback
        <span className="ml-2 font-normal text-gray-400">
          as a {request.relationship.replace(/_/g, ' ')}
          {request.dueDate && `, by ${formatDay(request.dueDate)}`}
        </span>
      </p>
      <textarea
        rows={2}
        value={strengths}
        onChange={(e) => setStrengths(e.target.value)}
        placeholder="What are they doing well?"
        className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
      />
      <textarea
        rows={2}
        value={improvements}
        onChange={(e) => setImprovements(e.target.value)}
        placeholder="What would help them most to change?"
        className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
      />
      <button
        type="button"
        disabled={pending || (!strengths.trim() && !improvements.trim())}
        onClick={() =>
          onRun(
            () => actions.respondToFeedback({ requestId: request.id, strengths, improvements }),
            'Sent. Thank you.',
          )
        }
        className="mt-2 rounded-full bg-gray-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
      >
        Send feedback
      </button>
      <p className="mt-1 text-[12px] text-gray-400">
        Feedback cannot be edited once sent, so read it back first.
      </p>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Development
// ---------------------------------------------------------------------------

function Development({
  actionsList,
  competencies,
  pending,
  actions,
  onRun,
}: {
  actionsList: DevelopmentActionRow[]
  competencies: CompetencyRow[]
  pending: boolean
  actions: Actions
  onRun: (fn: () => Promise<ActionResult>, okText?: string) => void
}) {
  const [title, setTitle] = useState('')
  const [actionType, setActionType] = useState('on_the_job')
  const [competencyId, setCompetencyId] = useState('')
  const [targetDate, setTargetDate] = useState('')

  return (
    <div className="space-y-4">
      <section className={CARD}>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-gray-500">
          Add a development action
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Shadow the payments on call rota"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm lg:col-span-2"
          />
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="course">Course</option>
            <option value="certification">Certification</option>
            <option value="mentoring">Mentoring</option>
            <option value="coaching">Coaching</option>
            <option value="stretch_assignment">Stretch assignment</option>
            <option value="shadowing">Shadowing</option>
            <option value="reading">Reading</option>
            <option value="conference">Conference</option>
            <option value="on_the_job">On the job</option>
          </select>
          <select
            value={competencyId}
            onChange={(e) => setCompetencyId(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="">No competency</option>
            {competencies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={pending || !title.trim()}
            onClick={() =>
              onRun(async () => {
                const result = await actions.createDevelopmentAction({
                  title,
                  actionType,
                  competencyId: competencyId || null,
                  targetDate: targetDate || null,
                })
                if (result.ok) setTitle('')
                return result
              }, 'Added.')
            }
            className="rounded-full bg-gray-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
          >
            Add
          </button>
        </div>
        <p className="mt-3 text-[12px] text-gray-400">
          These are yours. You choose what goes on the list and what comes off it.
        </p>
      </section>

      {actionsList.length === 0 ? (
        <Empty>Nothing on your development list yet.</Empty>
      ) : (
        <ul className="space-y-3">
          {actionsList.map((a) => (
            <li key={a.id} className={CARD}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{a.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-gray-500">
                    <span>{a.actionType.replace(/_/g, ' ')}</span>
                    {a.competencyName && <span className={GREEN_PILL}>{a.competencyName}</span>}
                    {a.targetDate && <span>By {formatDay(a.targetDate)}</span>}
                  </p>
                </div>
                <select
                  value={a.status}
                  disabled={pending}
                  onChange={(e) =>
                    onRun(() =>
                      actions.updateDevelopmentAction(
                        a.id,
                        e.target.value as 'planned' | 'in_progress' | 'completed' | 'abandoned' | 'blocked',
                        a.progressNote,
                      ),
                    )
                  }
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px]"
                >
                  <option value="planned">Planned</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                  <option value="blocked">Blocked</option>
                  <option value="abandoned">Abandoned</option>
                </select>
              </div>
              {a.description && <p className="mt-2 text-[13px] text-gray-700">{a.description}</p>}
              {a.supportNeeded && (
                <p className="mt-1 text-[13px] text-gray-600">
                  Support needed: {a.supportNeeded}
                  {a.supportApproved === true && ' (approved)'}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Check-ins and evidence
// ---------------------------------------------------------------------------

function CheckIns({ checkIns }: { checkIns: CheckInRow[] }) {
  if (checkIns.length === 0) {
    return <Empty>No check ins recorded yet.</Empty>
  }
  return (
    <ul className="space-y-3">
      {checkIns.map((c) => (
        <li key={c.id} className={CARD}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-gray-900">
              {c.kind.replace(/_/g, ' ')} check in
              {c.managerName && <span className="ml-2 font-normal text-gray-500">with {c.managerName}</span>}
            </span>
            <span className="flex items-center gap-2">
              {c.employeeSentiment && <span className={GREEN_PILL}>{c.employeeSentiment}</span>}
              <span className="text-[12px] text-gray-400">{formatDay(c.scheduledFor)}</span>
            </span>
          </div>
          {c.employeeNotes && (
            <p className="mt-2 text-[13px] text-gray-700">
              <span className="font-medium">You said:</span> {c.employeeNotes}
            </p>
          )}
          {c.managerNotes && (
            <p className="mt-1 text-[13px] text-gray-700">
              <span className="font-medium">They said:</span> {c.managerNotes}
            </p>
          )}
          {c.agreedActions && (
            <p className="mt-1 rounded-lg bg-[#9FE870]/20 px-3 py-2 text-[13px] text-gray-800">
              Agreed: {c.agreedActions}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

function Evidence({ evidence }: { evidence: EvidenceRow[] }) {
  const grouped = useMemo(() => {
    const map = new Map<string, EvidenceRow[]>()
    for (const e of evidence) {
      const list = map.get(e.source) ?? []
      list.push(e)
      map.set(e.source, list)
    }
    return [...map.entries()]
  }, [evidence])

  if (evidence.length === 0) {
    return <Empty>Nothing recorded in this cycle yet.</Empty>
  }

  return (
    <div className="space-y-4">
      {grouped.map(([source, rows]) => (
        <section key={source} className={CARD}>
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-gray-500">
              {source.replace(/_/g, ' ')}
            </h2>
            <span className={GREEN_PILL}>{rows.length}</span>
          </div>
          <ul className="mt-3 divide-y divide-gray-100">
            {rows.slice(0, 25).map((row, i) => (
              <li key={`${row.refId ?? i}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-[13px] text-gray-900">{row.title}</span>
                <span className="text-[12px] text-gray-400">
                  {row.detail} · {formatDay(row.occurredOn)}
                </span>
              </li>
            ))}
          </ul>
          {rows.length > 25 && (
            <p className="mt-2 text-[12px] text-gray-400">
              Showing the 25 most recent of {rows.length}.
            </p>
          )}
        </section>
      ))}
      <p className="text-[12px] text-gray-400">
        This is a record of what happened, for a person to read. Nothing here is counted into a
        rating: a good quarter is not the same as a busy one, and no amount of logged activity
        produces a number by itself.
      </p>
    </div>
  )
}
