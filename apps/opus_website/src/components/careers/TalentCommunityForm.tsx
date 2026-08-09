'use client'

import { useActionState } from 'react'
import { ArrowRight, CheckCircle2, FileText, ShieldCheck } from 'lucide-react'
import {
  joinTalentCommunity,
} from '@/app/careers/actions'
import { INITIAL_CAREERS_FORM_STATE } from '@/lib/career-form-state'

const TEAMS = ['Technology', 'Product & Design', 'Operations', 'OpusStudio', 'Growth & Partnerships', 'Business & People']

// Shared control styling so inputs, selects and the textarea stay on one rhythm.
const CONTROL = 'rounded-xl border border-black/15 bg-white px-3 outline-none transition-colors focus:border-black focus:ring-2 focus:ring-black/10 aria-[invalid=true]:border-red-600'

export default function TalentCommunityForm() {
  const [state, action, pending] = useActionState(joinTalentCommunity, INITIAL_CAREERS_FORM_STATE)

  if (state.status === 'success') {
    return (
      <div className="flex min-h-96 flex-col items-center justify-center rounded-[32px] border border-black/5 bg-white p-8 text-center text-black shadow-[0_24px_60px_-32px_rgba(23,19,23,0.45)] md:p-12">
        <CheckCircle2 className="h-11 w-11 text-emerald-700" strokeWidth={1.6} />
        <h3 className="mt-6 text-3xl font-medium tracking-[-0.03em]">Your profile is with us.</h3>
        <p className="mt-3 max-w-md leading-7 text-black/60">{state.message}</p>
        <a href="/careers#open-roles" className="mt-8 inline-flex items-center gap-2 rounded-full border border-black/20 px-6 py-3 text-sm font-semibold transition-colors hover:bg-black/5">
          Browse open roles <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    )
  }

  return (
    <form action={action} encType="multipart/form-data" className="rounded-[32px] border border-black/5 bg-white p-6 text-black shadow-[0_24px_60px_-32px_rgba(23,19,23,0.45)] md:p-9">
      <div className="border-b border-black/10 pb-6">
        <h3 className="text-2xl font-medium tracking-[-0.02em]">Your talent profile</h3>
        <p className="mt-2 text-sm leading-6 text-black/50">Takes about two minutes. Everything is required unless marked optional.</p>
      </div>

      <div className="mt-8 space-y-8">
        <Group number="01" title="About you">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Full name" name="fullName" autoComplete="name" required error={state.fieldErrors?.fullName} />
            <Field label="Email" name="email" type="email" autoComplete="email" required error={state.fieldErrors?.email} />
            <Field label="Phone" name="phone" type="tel" autoComplete="tel" hint="Optional" />
            <Field label="Location" name="location" autoComplete="address-level2" placeholder="Dar es Salaam" required error={state.fieldErrors?.location} />
            <label className="grid gap-2 text-sm font-medium">
              Experience level
              <select name="experienceLevel" className={`min-h-12 ${CONTROL}`}>
                <option value="">Select one</option>
                <option>Student</option><option>Early career</option><option>Professional</option><option>Leadership</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Preferred contact method
              <select name="preferredContactMethod" className={`min-h-12 ${CONTROL}`}>
                <option>Email</option><option>Phone</option><option>WhatsApp</option>
              </select>
            </label>
          </div>
        </Group>

        <Group number="02" title="Your work">
          <Field label="Portfolio or LinkedIn" name="profileUrl" type="url" placeholder="https://" hint="Optional" error={state.fieldErrors?.profileUrl} />
          <fieldset className="mt-5">
            <legend className="text-sm font-medium">Teams you are interested in</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {TEAMS.map((team) => (
                <label key={team} className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-black/15 px-4 text-sm transition-colors hover:border-black/40 has-[:checked]:border-black has-[:checked]:bg-black has-[:checked]:text-white">
                  <input type="checkbox" name="preferredDepartments" value={team} className="peer sr-only" />
                  <span className="peer-focus-visible:underline peer-focus-visible:underline-offset-4">{team}</span>
                </label>
              ))}
            </div>
            {state.fieldErrors?.preferredDepartments && <p className="mt-2 text-sm text-red-700">{state.fieldErrors.preferredDepartments}</p>}
          </fieldset>
          <label className="mt-5 grid gap-2 text-sm font-medium">
            <span className="flex flex-wrap items-baseline gap-x-2">
              Roles or skills you want us to know about
              <span className="text-xs font-normal text-black/40">Optional</span>
            </span>
            <textarea name="roleInterests" rows={4} placeholder="What you do well, and where you want to grow next…" className={`py-3 ${CONTROL}`} />
          </label>
        </Group>

        <Group number="03" title="Your CV">
          <label className="grid gap-2 text-sm font-medium">
            <span className="flex flex-wrap items-baseline gap-x-2">
              CV or résumé
              <span className="text-xs font-normal text-black/40">Optional. PDF, DOC or DOCX.</span>
            </span>
            <span className="flex min-h-24 items-center gap-4 rounded-2xl border border-dashed border-black/25 bg-[#FAFAF7] p-4 transition-colors hover:border-black/40">
              <FileText className="h-6 w-6 shrink-0 text-black/40" strokeWidth={1.6} />
              <input type="file" name="resume" accept=".pdf,.doc,.docx" className="w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-black file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white" />
            </span>
          </label>
        </Group>

        <Group number="04" title="Privacy and consent">
          <div className="space-y-4 rounded-2xl bg-[#F6F3F9] p-5">
            <Checkbox name="retentionConsent" required error={state.fieldErrors?.retentionConsent}>I consent to OpusFesta retaining my profile for suitable future roles.</Checkbox>
            <Checkbox name="careerUpdatesConsent">I would like to receive occasional career updates.</Checkbox>
            <p className="flex gap-3 border-t border-black/10 pt-4 text-xs leading-5 text-black/50">
              <ShieldCheck className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              Your profile is kept private and used only for OpusFesta recruitment. You can ask us to update or delete it at any time.
            </p>
          </div>
        </Group>
      </div>

      {state.status === 'error' && <p role="alert" className="mt-7 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{state.message}</p>}
      <div className="mt-8 border-t border-black/10 pt-7">
        <button type="submit" disabled={pending} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-black px-6 text-sm font-semibold text-white transition-colors hover:bg-[#2A2A2A] disabled:cursor-wait disabled:opacity-50 sm:w-auto">
          {pending ? 'Saving your profile…' : 'Join the talent community'} <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </form>
  )
}

function Group({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-5 flex items-baseline gap-3">
        <span className="text-xs font-semibold text-black/30">{number}</span>
        <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-black/55">{title}</h4>
      </div>
      {children}
    </section>
  )
}

function Field({ label, name, type = 'text', placeholder, autoComplete, required, hint, error }: { label: string; name: string; type?: string; placeholder?: string; autoComplete?: string; required?: boolean; hint?: string; error?: string }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      <span className="flex flex-wrap items-baseline gap-x-2">
        {label}
        {hint && <span className="text-xs font-normal text-black/40">{hint}</span>}
      </span>
      <input name={name} type={type} placeholder={placeholder} autoComplete={autoComplete} required={required} aria-invalid={Boolean(error)} className={`min-h-12 ${CONTROL}`} />
      {error && <span className="text-sm font-normal text-red-700">{error}</span>}
    </label>
  )
}

function Checkbox({ name, children, required, error }: { name: string; children: React.ReactNode; required?: boolean; error?: string }) {
  return <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" name={name} required={required} className="mt-1 h-4 w-4 rounded border-black/25 accent-black" /><span>{children}{error && <span className="block text-red-700">{error}</span>}</span></label>
}
