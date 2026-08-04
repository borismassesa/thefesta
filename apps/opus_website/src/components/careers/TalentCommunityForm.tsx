'use client'

import { useActionState } from 'react'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import {
  joinTalentCommunity,
} from '@/app/careers/actions'
import { INITIAL_CAREERS_FORM_STATE } from '@/lib/career-form-state'

const TEAMS = ['Technology', 'Product & Design', 'Operations', 'OpusStudio', 'Growth & Partnerships', 'Business & People']

export default function TalentCommunityForm() {
  const [state, action, pending] = useActionState(joinTalentCommunity, INITIAL_CAREERS_FORM_STATE)

  if (state.status === 'success') {
    return (
      <div className="flex min-h-96 flex-col items-center justify-center rounded-[32px] bg-white p-8 text-center text-black">
        <CheckCircle2 className="h-10 w-10" />
        <h3 className="mt-6 text-3xl font-medium tracking-tight">Your profile is with us.</h3>
        <p className="mt-3 max-w-md leading-7 text-black/60">{state.message}</p>
      </div>
    )
  }

  return (
    <form action={action} encType="multipart/form-data" className="rounded-[32px] bg-white p-6 text-black md:p-9">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" name="fullName" required error={state.fieldErrors?.fullName} />
        <Field label="Email" name="email" type="email" required error={state.fieldErrors?.email} />
        <Field label="Phone" name="phone" type="tel" />
        <Field label="Location" name="location" placeholder="Dar es Salaam" required error={state.fieldErrors?.location} />
        <Field label="Portfolio or LinkedIn" name="profileUrl" type="url" placeholder="https://" error={state.fieldErrors?.profileUrl} />
        <label className="grid gap-2 text-sm font-medium">
          Experience level
          <select name="experienceLevel" className="min-h-12 rounded-xl border border-black/15 bg-white px-3 outline-none focus:border-black focus:ring-2 focus:ring-black/10">
            <option value="">Select one</option>
            <option>Student</option><option>Early career</option><option>Professional</option><option>Leadership</option>
          </select>
        </label>
      </div>
      <fieldset className="mt-6">
        <legend className="text-sm font-medium">Teams you are interested in</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {TEAMS.map((team) => (
            <label key={team} className="cursor-pointer rounded-full border border-black/15 px-4 py-2 text-sm has-[:checked]:border-black has-[:checked]:bg-black has-[:checked]:text-white">
              <input type="checkbox" name="preferredDepartments" value={team} className="sr-only" />{team}
            </label>
          ))}
        </div>
        {state.fieldErrors?.preferredDepartments && <p className="mt-2 text-sm text-red-700">{state.fieldErrors.preferredDepartments}</p>}
      </fieldset>
      <label className="mt-6 grid gap-2 text-sm font-medium">
        Roles or skills you want us to know about
        <textarea name="roleInterests" rows={3} className="rounded-xl border border-black/15 px-3 py-3 outline-none focus:border-black focus:ring-2 focus:ring-black/10" />
      </label>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          CV or résumé <span className="font-normal text-black/45">PDF, DOC or DOCX · optional</span>
          <input type="file" name="resume" accept=".pdf,.doc,.docx" className="min-h-12 rounded-xl border border-dashed border-black/25 px-3 py-2 file:mr-3 file:rounded-full file:border-0 file:bg-black file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Preferred contact method
          <select name="preferredContactMethod" className="min-h-12 rounded-xl border border-black/15 bg-white px-3 outline-none focus:border-black focus:ring-2 focus:ring-black/10">
            <option>Email</option><option>Phone</option><option>WhatsApp</option>
          </select>
        </label>
      </div>
      <div className="mt-7 space-y-3 border-t border-black/10 pt-6">
        <Checkbox name="retentionConsent" required error={state.fieldErrors?.retentionConsent}>I consent to OpusFesta retaining my profile for suitable future roles.</Checkbox>
        <Checkbox name="careerUpdatesConsent">I would like to receive occasional career updates.</Checkbox>
      </div>
      {state.status === 'error' && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-800">{state.message}</p>}
      <button type="submit" disabled={pending} className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-full bg-black px-6 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-50">
        {pending ? 'Saving your profile…' : 'Join the talent community'} <ArrowRight className="h-4 w-4" />
      </button>
      <p className="mt-4 text-xs leading-5 text-black/45">Your profile is kept private and used only for OpusFesta recruitment. You can ask us to update or delete it at any time.</p>
    </form>
  )
}

function Field({ label, name, type = 'text', placeholder, required, error }: { label: string; name: string; type?: string; placeholder?: string; required?: boolean; error?: string }) {
  return <label className="grid gap-2 text-sm font-medium">{label}<input name={name} type={type} placeholder={placeholder} required={required} aria-invalid={Boolean(error)} className="min-h-12 rounded-xl border border-black/15 px-3 outline-none focus:border-black focus:ring-2 focus:ring-black/10 aria-[invalid=true]:border-red-600" />{error && <span className="text-sm font-normal text-red-700">{error}</span>}</label>
}

function Checkbox({ name, children, required, error }: { name: string; children: React.ReactNode; required?: boolean; error?: string }) {
  return <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" name={name} required={required} className="mt-1 h-4 w-4 rounded border-black/25 accent-black" /><span>{children}{error && <span className="block text-red-700">{error}</span>}</span></label>
}
