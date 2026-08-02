'use client'

import { useActionState } from 'react'
import { createRequisition, type RequisitionFormState } from '../actions'

type EmployeeOption = { id: string; name: string; jobTitle: string; department: string }

const initialState: RequisitionFormState = { error: null }
const input = 'mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-950 outline-none transition focus:border-[#7E5896] focus:ring-2 focus:ring-[#E8D4F1]'
const label = 'text-sm font-semibold text-gray-700'

export default function RequisitionForm({ employees }: { employees: EmployeeOption[] }) {
  const [state, action, pending] = useActionState(createRequisition, initialState)
  return (
    <form action={action} className="space-y-6">
      {state.error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{state.error}</div>}
      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-950">Position and ownership</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <label className={label}>Position title<input className={input} name="title" required minLength={3} /></label>
          <label className={label}>Brand<input className={input} name="brand" defaultValue="OpusFesta" required /></label>
          <label className={label}>Department<input className={input} name="department" required /></label>
          <label className={label}>Location<input className={input} name="location" required /></label>
          <label className={label}>Hiring manager<select className={input} name="hiring_manager_employee_id" defaultValue=""><option value="">Assign later</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.jobTitle}</option>)}</select></label>
          <label className={label}>Recruiter<select className={input} name="recruiter_employee_id" defaultValue=""><option value="">Assign later</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.department}</option>)}</select></label>
          <label className={label}>Employment type<select className={input} name="employment_type" defaultValue="Permanent"><option>Permanent</option><option>Contract</option><option>Probation</option><option>Intern</option></select></label>
          <label className={label}>Workplace model<select className={input} name="workplace_type" defaultValue="On-site"><option>On-site</option><option>Hybrid</option><option>Remote</option><option>Field-based</option></select></label>
          <label className={label}>Requisition type<select className={input} name="requisition_type" defaultValue="new_headcount"><option value="new_headcount">New headcount</option><option value="replacement">Replacement</option><option value="temporary_coverage">Temporary coverage</option><option value="internship">Internship</option><option value="contractor">Contractor</option><option value="seasonal">Seasonal staffing</option><option value="project_based">Project based</option><option value="confidential_replacement">Confidential replacement</option></select></label>
          <label className={label}>Number of openings<input className={input} name="headcount" type="number" min="1" step="1" defaultValue="1" required /></label>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-950">Budget and timing</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <label className={label}>Salary minimum (TZS)<input className={input} name="salary_min_tzs" type="number" min="0" step="1" /></label>
          <label className={label}>Salary maximum (TZS)<input className={input} name="salary_max_tzs" type="number" min="0" step="1" /></label>
          <label className={label}>Target fill date<input className={input} name="target_fill_date" type="date" /></label>
          <label className={label}>Target start date<input className={input} name="target_start_date" type="date" /></label>
        </div>
        <label className="mt-5 flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700"><input type="checkbox" name="budget_confirmed" className="h-4 w-4 rounded border-gray-300 text-[#5B2D8E] focus:ring-[#7E5896]" />Budget is confirmed for this request</label>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-950">Business case and role profile</h2>
        <div className="mt-5 space-y-5">
          <label className={label}>Business justification<textarea className={input} name="reason" rows={4} required minLength={20} /></label>
          <label className={label}>Responsibilities <span className="font-normal text-gray-400">(one per line)</span><textarea className={input} name="responsibilities" rows={5} /></label>
          <label className={label}>Essential requirements <span className="font-normal text-gray-400">(one per line)</span><textarea className={input} name="requirements" rows={5} /></label>
          <label className={label}>Preferred qualifications <span className="font-normal text-gray-400">(one per line)</span><textarea className={input} name="preferred_qualifications" rows={4} /></label>
        </div>
      </section>

      <div className="flex justify-end">
        <button disabled={pending} className="rounded-xl bg-[#5B2D8E] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#492270] disabled:cursor-wait disabled:opacity-60">{pending ? 'Creating…' : 'Create draft requisition'}</button>
      </div>
    </form>
  )
}
