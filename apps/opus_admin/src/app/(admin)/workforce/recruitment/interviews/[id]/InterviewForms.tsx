'use client'

import { useActionState, useState } from 'react'
import {
  addInterviewParticipant,
  saveInterviewSchedule,
  submitInterviewFeedback,
  type InterviewActionState,
} from '../actions'

const initial: InterviewActionState = { ok: false, message: null }
const input = 'mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#7E5896] focus:ring-2 focus:ring-[#E8D4F1]'

function zonedLocalToIso(value: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return ''
  const desired = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]))
  let guess = desired
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  })
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]))
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute))
    guess += desired - represented
  }
  return new Date(guess).toISOString()
}

export function InterviewScheduleForm({ interviewId, rooms, defaults }: {
  interviewId: string
  rooms: Array<{ id: string; name: string; location: string | null }>
  defaults: { startsAt: string | null; endsAt: string | null; timezone: string; location: string; meetingUrl: string; roomId: string; instructions: string }
}) {
  const [state, action, pending] = useActionState(saveInterviewSchedule.bind(null, interviewId), initial)
  const [timezone, setTimezone] = useState(defaults.timezone)
  const local = (iso: string | null) => iso ? new Date(iso).toLocaleString('sv-SE', { timeZone: defaults.timezone }).slice(0, 16).replace(' ', 'T') : ''
  return (
    <form action={action} onSubmit={(event) => {
      const form = event.currentTarget
      const start = (form.elements.namedItem('startsAtLocal') as HTMLInputElement).value
      const end = (form.elements.namedItem('endsAtLocal') as HTMLInputElement).value
      ;(form.elements.namedItem('startsAtIso') as HTMLInputElement).value = zonedLocalToIso(start, timezone)
      ;(form.elements.namedItem('endsAtIso') as HTMLInputElement).value = zonedLocalToIso(end, timezone)
    }} className="mt-4 space-y-4">
      <input type="hidden" name="startsAtIso" /><input type="hidden" name="endsAtIso" />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-gray-600">Starts<input className={input} name="startsAtLocal" type="datetime-local" required defaultValue={local(defaults.startsAt)} /></label>
        <label className="text-xs font-semibold text-gray-600">Ends<input className={input} name="endsAtLocal" type="datetime-local" required defaultValue={local(defaults.endsAt)} /></label>
      </div>
      <label className="block text-xs font-semibold text-gray-600">Time zone<select className={input} name="timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="Africa/Dar_es_Salaam">Africa/Dar es Salaam</option><option value="Africa/Nairobi">Africa/Nairobi</option><option value="Africa/Kampala">Africa/Kampala</option><option value="UTC">UTC</option><option value="Europe/London">Europe/London</option><option value="America/New_York">America/New York</option><option value="America/Vancouver">America/Vancouver</option></select></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-gray-600">Location<input className={input} name="location" defaultValue={defaults.location} placeholder="Office or venue" /></label>
        <label className="text-xs font-semibold text-gray-600">Room<select className={input} name="roomId" defaultValue={defaults.roomId}><option value="">No room</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}{room.location ? ` · ${room.location}` : ''}</option>)}</select></label>
      </div>
      <label className="block text-xs font-semibold text-gray-600">Video meeting link<input className={input} name="meetingUrl" type="url" defaultValue={defaults.meetingUrl} placeholder="https://…" /></label>
      <label className="block text-xs font-semibold text-gray-600">Candidate instructions<textarea className={input} name="candidateInstructions" rows={3} defaultValue={defaults.instructions} /></label>
      <button disabled={pending} className="rounded-xl bg-[#5B2D8E] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? 'Checking conflicts…' : 'Save schedule'}</button>
      {state.message && <p role="status" className={`text-xs font-medium ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>}
    </form>
  )
}

export function InterviewParticipantForm({ interviewId, employees }: { interviewId: string; employees: Array<{ id: string; name: string; title: string }> }) {
  const [state, action, pending] = useActionState(addInterviewParticipant.bind(null, interviewId), initial)
  return <form action={action} className="mt-4 space-y-3"><select name="employeeId" required defaultValue="" className={input}><option value="" disabled>Choose employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.title}</option>)}</select><select name="participantRole" className={input} defaultValue="interviewer"><option value="lead">Lead interviewer</option><option value="interviewer">Interviewer</option><option value="observer">Observer</option><option value="coordinator">Coordinator</option></select><button disabled={pending} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700">{pending ? 'Adding…' : 'Add participant'}</button>{state.message && <p role="status" className={`text-xs ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>}</form>
}

export function InterviewFeedbackForm({ interviewId, feedback, locked }: {
  interviewId: string
  feedback: { assigned_competencies: string[]; evidence: string | null; red_flags: string | null; recommendation: string | null; confidence: string | null; conflictDeclared: boolean; conflictNote: string | null } | null
  locked: boolean
}) {
  const [state, action, pending] = useActionState(submitInterviewFeedback.bind(null, interviewId), initial)
  if (locked) return <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">Your feedback is submitted and locked.</p>
  return <form action={action} className="mt-4 space-y-4"><label className="block text-xs font-semibold text-gray-600">Assigned competencies<input className={input} name="competencies" defaultValue={feedback?.assigned_competencies.join(', ') ?? ''} placeholder="Communication, role expertise, ownership" /></label><label className="block text-xs font-semibold text-gray-600">Evidence<textarea className={input} name="evidence" required rows={5} defaultValue={feedback?.evidence ?? ''} placeholder="Describe observed evidence, not impressions." /></label><label className="block text-xs font-semibold text-gray-600">Red flags or follow-up<textarea className={input} name="redFlags" rows={2} defaultValue={feedback?.red_flags ?? ''} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-gray-600">Recommendation<select className={input} name="recommendation" required defaultValue={feedback?.recommendation ?? ''}><option value="" disabled>Choose</option><option value="strong_no">Strong no</option><option value="no">No</option><option value="mixed">Mixed</option><option value="yes">Yes</option><option value="strong_yes">Strong yes</option></select></label><label className="text-xs font-semibold text-gray-600">Confidence<select className={input} name="confidence" required defaultValue={feedback?.confidence ?? ''}><option value="" disabled>Choose</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div><label className="flex items-start gap-2 text-sm text-gray-700"><input type="checkbox" name="conflictDeclared" defaultChecked={feedback?.conflictDeclared ?? false} className="mt-1" />I have a conflict of interest to disclose.</label><label className="block text-xs font-semibold text-gray-600">Conflict details<textarea className={input} name="conflictNote" rows={2} defaultValue={feedback?.conflictNote ?? ''} /></label><div className="rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">Submit independently. Other interviewers’ ratings remain hidden until yours is submitted.</div><div className="flex gap-2"><button name="intent" value="draft" disabled={pending} className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700">Save draft</button><button name="intent" value="submit" disabled={pending} className="rounded-lg bg-[#5B2D8E] px-4 py-2 text-xs font-semibold text-white">Submit and lock</button></div>{state.message && <p role="status" className={`text-xs font-medium ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>}</form>
}
