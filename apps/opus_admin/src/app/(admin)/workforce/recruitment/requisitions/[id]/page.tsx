import { notFound } from 'next/navigation'
import WorkforceHeading from '../../../_components/PageHeading'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getCallerPermissions, hasPermission } from '@/lib/admin-auth'
import { requireRecruitmentAccess } from '@/lib/recruitment-auth'
import { addRequisitionComment, decideRequisitionStep, publishApprovedRequisition, submitRequisition, updateRequisition } from '../actions'
import { canSubmitRequisition, isSubmittableStatus, requisitionSubmitBlockers } from '@/lib/recruitment-requisition-submit'
import { DANGER_BUTTON_SMALL, NEUTRAL_BUTTON, PRIMARY_BUTTON, PRIMARY_BUTTON_SMALL, WARNING_BUTTON_SMALL } from '../../_components/ui'

// Brand palette and button geometry come from the shared Opus product system.
const FIELD =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#C9A0DC] focus:ring-2 focus:ring-[#F0DFF6]'
const LABEL = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500'
const HINT = 'mt-1 block text-[11px] text-gray-400'

type Requisition = {
  id: string
  requisition_number: string
  title: string
  department: string
  brand: string
  location: string
  workplace_type: string
  employment_type: string
  requisition_type: string
  headcount: number
  openings_filled: number
  reason: string
  responsibilities: string[]
  requirements: string[]
  preferred_qualifications: string[]
  salary_min_tzs: number | null
  salary_max_tzs: number | null
  target_start_date: string | null
  target_fill_date: string | null
  budget_confirmed: boolean
  status: string
  version: number
  created_at: string
  hiring_manager_employee_id: string | null
  recruiter_employee_id: string | null
}

export default async function RequisitionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireRecruitmentAccess({
    entityType: 'requisition', entityId: id,
    allowedPermissions: ['workforce.requisitions.read'],
  })
  const supabase = createSupabaseAdminClient()
  const [requisitionResult, approvalsResult, commentsResult, canSubmit, permissions, employeesResult] = await Promise.all([
    supabase.from('recruitment_requisitions').select('*').eq('id', id).maybeSingle<Requisition>(),
    supabase.from('recruitment_approval_steps').select('id, sequence, approver_role, status, decision_note, decided_at').eq('requisition_id', id).order('sequence'),
    supabase.from('recruitment_requisition_comments').select('id, body, created_at, workforce_employees(full_name)').eq('requisition_id', id).order('created_at', { ascending: false }),
    hasPermission('workforce.requisitions.create'),
    getCallerPermissions(),
    supabase.from('workforce_employees').select('id, full_name, job_title, department').in('status', ['Active', 'Onboarding']).order('full_name'),
  ])
  if (requisitionResult.error) throw requisitionResult.error
  if (!requisitionResult.data) notFound()
  if (approvalsResult.error) throw approvalsResult.error
  if (commentsResult.error) throw commentsResult.error
  if (employeesResult.error) throw employeesResult.error
  const requisition = requisitionResult.data
  const submitAction = submitRequisition.bind(null, id)
  const commentAction = addRequisitionComment.bind(null, id)
  const pendingStep = (approvalsResult.data ?? []).find((step) => step.status === 'pending')
  const decisionPermission = pendingStep?.approver_role === 'finance'
    ? 'workforce.requisitions.finance_approve'
    : pendingStep?.approver_role === 'executive'
      ? 'workforce.requisitions.executive_approve'
      : 'workforce.requisitions.approve'
  const canDecide = Boolean(pendingStep && permissions.has(decisionPermission))
  const canPublish = requisition.status === 'approved' && permissions.has('workforce.jobs.write') && permissions.has('workforce.jobs.publish')
  const defaultSlug = requisition.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '').slice(0, 80)
  const money = (value: number | null) => value == null ? 'Not set' : `TZS ${Number(value).toLocaleString()}`
  // recruitment_submit_requisition refuses a draft that is missing ownership
  // or an agreed budget, because an approver cannot sensibly approve either.
  // Reflecting those preconditions here lets the draft say what is missing
  // instead of offering a button that throws.
  const submitBlockers = requisitionSubmitBlockers(requisition)
  const isSubmittable = isSubmittableStatus(requisition.status)
  const readyToSubmit = canSubmitRequisition(requisition)

  return (
    <>
      <WorkforceHeading title={requisition.title} subtitle={`${requisition.requisition_number} · ${requisition.department} · ${requisition.location}`} />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Current state</p><p className="mt-1 text-lg font-semibold capitalize text-gray-950">{requisition.status.replaceAll('_', ' ')}</p></div>
              {canSubmit && readyToSubmit && <form action={submitAction}><button data-opus-button="control" className={PRIMARY_BUTTON}>Submit for approval</button></form>}
            </div>
            {canSubmit && isSubmittable && submitBlockers.length > 0 && (
              <section className="mt-4 rounded-xl border border-[#E89AAE] bg-[#F5DCE2]/40 p-4">
                <h2 className="text-sm font-semibold text-[#A84F66]">Finish this draft before submitting</h2>
                <p className="mt-1 text-sm text-[#A84F66]">Approvers need ownership and an agreed budget to make a decision.</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#A84F66]">
                  {submitBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                </ul>
                <p className="mt-2 text-sm text-[#A84F66]">Use <span className="font-semibold">Revise draft</span> below, then submit.</p>
              </section>
            )}
            <dl className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Brand', requisition.brand], ['Employment', requisition.employment_type], ['Workplace', requisition.workplace_type],
                ['Request type', requisition.requisition_type.replaceAll('_', ' ')], ['Openings', `${requisition.openings_filled}/${requisition.headcount} filled`],
                ['Budget confirmed', requisition.budget_confirmed ? 'Yes' : 'No'], ['Salary minimum', money(requisition.salary_min_tzs)],
                ['Salary maximum', money(requisition.salary_max_tzs)], ['Target start', requisition.target_start_date ?? 'Not set'],
              ].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</dt><dd className="mt-1 text-sm font-medium capitalize text-gray-800">{value}</dd></div>)}
            </dl>
          </section>

          {canSubmit && ['draft', 'changes_requested'].includes(requisition.status) && (
            <section className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-6">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Revise draft</h2>
              {/* Every control is labelled. The form is a draft being edited, so
                  each field arrives already holding a value, and a value with no
                  label is unreadable: the first four boxes previously showed
                  "Social Media Coordinator", "Brand, Content & Social",
                  "OpusFesta" and an address, with nothing saying which was the
                  title, the department, the brand or the location. */}
              <form action={updateRequisition.bind(null, id)} className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block"><span className={LABEL}>Job title</span><input name="title" required defaultValue={requisition.title} className={FIELD} /></label>
                  <label className="block"><span className={LABEL}>Department</span><input name="department" required defaultValue={requisition.department} className={FIELD} /></label>
                  <label className="block"><span className={LABEL}>Brand</span><input name="brand" defaultValue={requisition.brand} className={FIELD} /></label>
                  <label className="block"><span className={LABEL}>Location</span><input name="location" required defaultValue={requisition.location} className={FIELD} /></label>
                  <label className="block"><span className={LABEL}>Employment type</span>
                    <select name="employment_type" defaultValue={requisition.employment_type} className={FIELD}><option>Permanent</option><option>Contract</option><option>Probation</option><option>Intern</option></select>
                  </label>
                  <label className="block"><span className={LABEL}>Workplace</span>
                    <select name="workplace_type" defaultValue={requisition.workplace_type} className={FIELD}><option>On-site</option><option>Hybrid</option><option>Remote</option><option>Field-based</option></select>
                  </label>
                  <label className="block"><span className={LABEL}>Request type</span>
                    <select name="requisition_type" defaultValue={requisition.requisition_type} className={FIELD}><option value="new_headcount">New headcount</option><option value="replacement">Replacement</option><option value="temporary_coverage">Temporary coverage</option><option value="internship">Internship</option><option value="contractor">Contractor</option><option value="seasonal">Seasonal</option><option value="project_based">Project based</option><option value="confidential_replacement">Confidential replacement</option></select>
                  </label>
                  <label className="block"><span className={LABEL}>Openings</span><input name="headcount" type="number" min="1" required defaultValue={requisition.headcount} className={FIELD} /></label>
                  <label className="block"><span className={LABEL}>Hiring manager</span>
                    <select name="hiring_manager_employee_id" defaultValue={requisition.hiring_manager_employee_id ?? ''} className={FIELD}><option value="">Not assigned</option>{(employeesResult.data ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.job_title}</option>)}</select>
                  </label>
                  <label className="block"><span className={LABEL}>Recruiter / People Ops</span>
                    <select name="recruiter_employee_id" defaultValue={requisition.recruiter_employee_id ?? ''} className={FIELD}><option value="">Not assigned</option>{(employeesResult.data ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.job_title}</option>)}</select>
                  </label>
                </div>

                <label className="block"><span className={LABEL}>Business justification</span><textarea name="reason" required minLength={20} rows={4} defaultValue={requisition.reason} className={FIELD} /></label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block"><span className={LABEL}>Responsibilities</span><textarea name="responsibilities" rows={5} defaultValue={requisition.responsibilities.join('\n')} className={FIELD} /><span className={HINT}>One per line</span></label>
                  <label className="block"><span className={LABEL}>Requirements</span><textarea name="requirements" rows={5} defaultValue={requisition.requirements.join('\n')} className={FIELD} /><span className={HINT}>One per line</span></label>
                </div>
                <label className="block"><span className={LABEL}>Preferred qualifications</span><textarea name="preferred_qualifications" rows={4} defaultValue={requisition.preferred_qualifications.join('\n')} className={FIELD} /><span className={HINT}>One per line</span></label>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="block"><span className={LABEL}>Salary minimum (TZS)</span><input name="salary_min_tzs" type="number" min="0" defaultValue={requisition.salary_min_tzs ?? ''} className={FIELD} /></label>
                  <label className="block"><span className={LABEL}>Salary maximum (TZS)</span><input name="salary_max_tzs" type="number" min="0" defaultValue={requisition.salary_max_tzs ?? ''} className={FIELD} /></label>
                  <label className="block"><span className={LABEL}>Target start date</span><input name="target_start_date" type="date" defaultValue={requisition.target_start_date ?? ''} className={FIELD} /></label>
                  <label className="block"><span className={LABEL}>Target fill date</span><input name="target_fill_date" type="date" defaultValue={requisition.target_fill_date ?? ''} className={FIELD} /></label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm text-gray-700"><input name="budget_confirmed" type="checkbox" defaultChecked={requisition.budget_confirmed} className="h-4 w-4 accent-[#5B2D8E]" /> Budget confirmed</label>
                  <button data-opus-button="control" className={PRIMARY_BUTTON}>Save revised draft</button>
                </div>
              </form>
            </section>
          )}

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Business justification</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-600">{requisition.reason}</p>
            {[['Responsibilities', requisition.responsibilities], ['Essential requirements', requisition.requirements], ['Preferred qualifications', requisition.preferred_qualifications]].map(([title, items]) => (
              <div key={title as string} className="mt-6"><h3 className="text-sm font-semibold text-gray-900">{title as string}</h3>{(items as string[]).length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-gray-600">{(items as string[]).map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-gray-400">Not provided</p>}</div>
            ))}
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Internal comments</h2>
            <form action={commentAction} className="relative mt-4 flex gap-2"><label className="sr-only" htmlFor="requisition-comment">Add internal comment</label><textarea id="requisition-comment" name="body" required rows={2} className="min-h-12 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#C9A0DC] focus:ring-2 focus:ring-[#F0DFF6]" placeholder="Add context for approvers…" /><button data-opus-button="control" className={`${NEUTRAL_BUTTON} self-end`}>Comment</button></form>
            <div className="mt-5 divide-y divide-gray-100">{(commentsResult.data ?? []).map((comment) => { const employee = Array.isArray(comment.workforce_employees) ? comment.workforce_employees[0] : comment.workforce_employees; return <article key={comment.id} className="py-4"><div className="flex justify-between gap-3 text-xs text-gray-400"><span className="font-semibold text-gray-600">{employee?.full_name ?? 'Team member'}</span><time>{new Date(comment.created_at).toLocaleString('en-TZ')}</time></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">{comment.body}</p></article> })}{commentsResult.data?.length === 0 && <p className="py-5 text-sm text-gray-400">No comments yet.</p>}</div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Approval route</h2>
            <ol className="mt-4 space-y-3">{(approvalsResult.data ?? []).map((step) => <li key={step.id} className="rounded-xl bg-gray-50 p-3"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold capitalize text-gray-800">{step.sequence}. {step.approver_role?.replaceAll('_', ' ')}</span><span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold capitalize text-gray-600">{step.status.replaceAll('_', ' ')}</span></div>{step.decision_note && <p className="mt-2 text-xs leading-5 text-gray-500">{step.decision_note}</p>}</li>)}{approvalsResult.data?.length === 0 && <li className="text-sm text-gray-400">Approval steps are generated on submission.</li>}</ol>
          </section>
          {canDecide && pendingStep && <section className="rounded-2xl border border-[#F0DFF6] bg-[#FCF7FF] p-5 shadow-sm"><h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Your approval decision</h2><p className="mt-1 text-sm capitalize text-gray-500">Current step: {pendingStep.approver_role?.replaceAll('_', ' ')}</p><form action={decideRequisitionStep.bind(null, id, 'approved')} className="mt-4"><label className="block text-sm font-semibold text-gray-700">Decision note<textarea name="note" rows={3} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#C9A0DC] focus:ring-2 focus:ring-[#F0DFF6]" placeholder="Required for rejection or requested changes" /></label><div className="mt-3 grid grid-cols-3 gap-2"><button data-opus-button="control" className={`${PRIMARY_BUTTON_SMALL} w-full`}>Approve</button><button data-opus-button="control" formAction={decideRequisitionStep.bind(null, id, 'changes_requested')} className={`${WARNING_BUTTON_SMALL} w-full`}>Changes</button><button data-opus-button="control" formAction={decideRequisitionStep.bind(null, id, 'rejected')} className={`${DANGER_BUTTON_SMALL} w-full`}>Reject</button></div></form></section>}
          {canPublish && <section className="rounded-2xl border border-[#9FE870] bg-[#E8FBDB] p-5 shadow-sm"><h2 className="text-base font-semibold text-[#2F6844]">Publish approved role</h2><p className="mt-1 text-sm text-[#2F6844]">This atomically creates the public job, canonical posting and requisition openings.</p><form action={publishApprovedRequisition.bind(null, id)} className="mt-4 space-y-3"><label className="block text-sm font-semibold text-[#2F6844]">Public slug<input name="slug" required defaultValue={defaultSlug} className="mt-1 w-full rounded-xl border border-[#9FE870] bg-white px-3 py-2 text-sm outline-none focus:border-[#3F8B5C] focus:ring-2 focus:ring-[#E8FBDB]" /></label><label className="block text-sm font-semibold text-[#2F6844]">Visibility<select name="visibility" className="mt-1 w-full rounded-xl border border-[#9FE870] bg-white px-3 py-2 text-sm"><option value="public">Public</option><option value="internal">Internal only</option><option value="unlisted">Unlisted</option></select></label><button data-opus-button="control" className={`${PRIMARY_BUTTON} w-full`}>Publish job</button></form></section>}
          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"><h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Record integrity</h2><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><dt className="text-gray-500">Version</dt><dd className="font-semibold text-gray-800">{requisition.version}</dd></div><div className="flex justify-between"><dt className="text-gray-500">Created</dt><dd className="font-semibold text-gray-800">{new Date(requisition.created_at).toLocaleDateString('en-TZ')}</dd></div></dl></section>
        </aside>
      </div>
    </>
  )
}
