import { notFound } from 'next/navigation'
import WorkforceHeading from '../../../_components/PageHeading'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getCallerPermissions, hasPermission } from '@/lib/admin-auth'
import { requireRecruitmentAccess } from '@/lib/recruitment-auth'
import { addRequisitionComment, decideRequisitionStep, publishApprovedRequisition, submitRequisition, updateRequisition } from '../actions'
import { canSubmitRequisition, isSubmittableStatus, requisitionSubmitBlockers } from '@/lib/recruitment-requisition-submit'

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
              {canSubmit && readyToSubmit && <form action={submitAction}><button className="rounded-xl bg-[#5B2D8E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#492270]">Submit for approval</button></form>}
            </div>
            {canSubmit && isSubmittable && submitBlockers.length > 0 && (
              <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <h2 className="text-sm font-semibold text-amber-950">Finish this draft before submitting</h2>
                <p className="mt-1 text-sm text-amber-900">Approvers need ownership and an agreed budget to make a decision.</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                  {submitBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                </ul>
                <p className="mt-2 text-sm text-amber-900">Use <span className="font-semibold">Revise draft</span> below, then submit.</p>
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

          {canSubmit && ['draft', 'changes_requested'].includes(requisition.status) && <section className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-6"><h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Revise draft</h2><form action={updateRequisition.bind(null, id)} className="mt-4 grid gap-3 sm:grid-cols-2"><input name="title" required defaultValue={requisition.title} className="rounded-lg border px-3 py-2 text-sm" /><input name="department" required defaultValue={requisition.department} className="rounded-lg border px-3 py-2 text-sm" /><input name="brand" defaultValue={requisition.brand} className="rounded-lg border px-3 py-2 text-sm" /><input name="location" required defaultValue={requisition.location} className="rounded-lg border px-3 py-2 text-sm" /><select name="employment_type" defaultValue={requisition.employment_type} className="rounded-lg border px-3 py-2 text-sm"><option>Permanent</option><option>Contract</option><option>Probation</option><option>Intern</option></select><select name="workplace_type" defaultValue={requisition.workplace_type} className="rounded-lg border px-3 py-2 text-sm"><option>On-site</option><option>Hybrid</option><option>Remote</option><option>Field-based</option></select><select name="requisition_type" defaultValue={requisition.requisition_type} className="rounded-lg border px-3 py-2 text-sm"><option value="new_headcount">New headcount</option><option value="replacement">Replacement</option><option value="temporary_coverage">Temporary coverage</option><option value="internship">Internship</option><option value="contractor">Contractor</option><option value="seasonal">Seasonal</option><option value="project_based">Project based</option><option value="confidential_replacement">Confidential replacement</option></select><input name="headcount" type="number" min="1" required defaultValue={requisition.headcount} className="rounded-lg border px-3 py-2 text-sm" /><select name="hiring_manager_employee_id" defaultValue={requisition.hiring_manager_employee_id ?? ''} className="rounded-lg border px-3 py-2 text-sm"><option value="">Hiring manager</option>{(employeesResult.data ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.job_title}</option>)}</select><select name="recruiter_employee_id" defaultValue={requisition.recruiter_employee_id ?? ''} className="rounded-lg border px-3 py-2 text-sm"><option value="">Recruiter / People Ops</option>{(employeesResult.data ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.job_title}</option>)}</select><textarea name="reason" required minLength={20} defaultValue={requisition.reason} className="rounded-lg border px-3 py-2 text-sm sm:col-span-2" /><textarea name="responsibilities" defaultValue={requisition.responsibilities.join('\n')} className="rounded-lg border px-3 py-2 text-sm" /><textarea name="requirements" defaultValue={requisition.requirements.join('\n')} className="rounded-lg border px-3 py-2 text-sm" /><textarea name="preferred_qualifications" defaultValue={requisition.preferred_qualifications.join('\n')} className="rounded-lg border px-3 py-2 text-sm sm:col-span-2" /><input name="salary_min_tzs" type="number" min="0" defaultValue={requisition.salary_min_tzs ?? ''} placeholder="Salary minimum TZS" className="rounded-lg border px-3 py-2 text-sm" /><input name="salary_max_tzs" type="number" min="0" defaultValue={requisition.salary_max_tzs ?? ''} placeholder="Salary maximum TZS" className="rounded-lg border px-3 py-2 text-sm" /><input name="target_start_date" type="date" defaultValue={requisition.target_start_date ?? ''} className="rounded-lg border px-3 py-2 text-sm" /><input name="target_fill_date" type="date" defaultValue={requisition.target_fill_date ?? ''} className="rounded-lg border px-3 py-2 text-sm" /><label className="flex items-center gap-2 text-sm"><input name="budget_confirmed" type="checkbox" defaultChecked={requisition.budget_confirmed} /> Budget confirmed</label><button className="rounded-lg bg-[#5B2D8E] px-4 py-2 text-xs font-semibold text-white">Save revised draft</button></form></section>}

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Business justification</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-600">{requisition.reason}</p>
            {[['Responsibilities', requisition.responsibilities], ['Essential requirements', requisition.requirements], ['Preferred qualifications', requisition.preferred_qualifications]].map(([title, items]) => (
              <div key={title as string} className="mt-6"><h3 className="text-sm font-semibold text-gray-900">{title as string}</h3>{(items as string[]).length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-gray-600">{(items as string[]).map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-gray-400">Not provided</p>}</div>
            ))}
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Internal comments</h2>
            <form action={commentAction} className="relative mt-4 flex gap-2"><label className="sr-only" htmlFor="requisition-comment">Add internal comment</label><textarea id="requisition-comment" name="body" required rows={2} className="min-h-12 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#7E5896] focus:ring-2 focus:ring-[#E8D4F1]" placeholder="Add context for approvers…" /><button className="self-end rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50">Comment</button></form>
            <div className="mt-5 divide-y divide-gray-100">{(commentsResult.data ?? []).map((comment) => { const employee = Array.isArray(comment.workforce_employees) ? comment.workforce_employees[0] : comment.workforce_employees; return <article key={comment.id} className="py-4"><div className="flex justify-between gap-3 text-xs text-gray-400"><span className="font-semibold text-gray-600">{employee?.full_name ?? 'Team member'}</span><time>{new Date(comment.created_at).toLocaleString('en-TZ')}</time></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">{comment.body}</p></article> })}{commentsResult.data?.length === 0 && <p className="py-5 text-sm text-gray-400">No comments yet.</p>}</div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Approval route</h2>
            <ol className="mt-4 space-y-3">{(approvalsResult.data ?? []).map((step) => <li key={step.id} className="rounded-xl bg-gray-50 p-3"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold capitalize text-gray-800">{step.sequence}. {step.approver_role?.replaceAll('_', ' ')}</span><span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold capitalize text-gray-600">{step.status.replaceAll('_', ' ')}</span></div>{step.decision_note && <p className="mt-2 text-xs leading-5 text-gray-500">{step.decision_note}</p>}</li>)}{approvalsResult.data?.length === 0 && <li className="text-sm text-gray-400">Approval steps are generated on submission.</li>}</ol>
          </section>
          {canDecide && pendingStep && <section className="rounded-2xl border border-[#E8D4F1] bg-[#FBF7FD] p-5 shadow-sm"><h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Your approval decision</h2><p className="mt-1 text-sm capitalize text-gray-500">Current step: {pendingStep.approver_role?.replaceAll('_', ' ')}</p><form action={decideRequisitionStep.bind(null, id, 'approved')} className="mt-4"><label className="block text-sm font-semibold text-gray-700">Decision note<textarea name="note" rows={3} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7E5896] focus:ring-2 focus:ring-[#E8D4F1]" placeholder="Required for rejection or requested changes" /></label><div className="mt-3 grid grid-cols-3 gap-2"><button className="w-full rounded-lg bg-emerald-600 px-2 py-2 text-xs font-semibold text-white hover:bg-emerald-700">Approve</button><button formAction={decideRequisitionStep.bind(null, id, 'changes_requested')} className="w-full rounded-lg bg-amber-100 px-2 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-200">Changes</button><button formAction={decideRequisitionStep.bind(null, id, 'rejected')} className="w-full rounded-lg bg-rose-100 px-2 py-2 text-xs font-semibold text-rose-900 hover:bg-rose-200">Reject</button></div></form></section>}
          {canPublish && <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm"><h2 className="text-base font-semibold text-emerald-950">Publish approved role</h2><p className="mt-1 text-sm text-emerald-800">This atomically creates the public job, canonical posting and requisition openings.</p><form action={publishApprovedRequisition.bind(null, id)} className="mt-4 space-y-3"><label className="block text-sm font-semibold text-emerald-950">Public slug<input name="slug" required defaultValue={defaultSlug} className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" /></label><label className="block text-sm font-semibold text-emerald-950">Visibility<select name="visibility" className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm"><option value="public">Public</option><option value="internal">Internal only</option><option value="unlisted">Unlisted</option></select></label><button className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">Publish job</button></form></section>}
          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"><h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Record integrity</h2><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><dt className="text-gray-500">Version</dt><dd className="font-semibold text-gray-800">{requisition.version}</dd></div><div className="flex justify-between"><dt className="text-gray-500">Created</dt><dd className="font-semibold text-gray-800">{new Date(requisition.created_at).toLocaleDateString('en-TZ')}</dd></div></dl></section>
        </aside>
      </div>
    </>
  )
}
