'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowRight, CheckCircle2, FileText, ShieldCheck } from 'lucide-react'
import {
  submitJobApplication,
} from '@/app/careers/actions'
import { INITIAL_CAREERS_FORM_STATE } from '@/lib/career-form-state'
import type { CareerJob } from '@/lib/careers'

export default function JobApplicationForm({ job }: { job: CareerJob }) {
  const [state, action, pending] = useActionState(submitJobApplication, INITIAL_CAREERS_FORM_STATE)
  const searchParams = useSearchParams()

  if (state.status === 'success') {
    return (
      <div className="rounded-[32px] border border-black/10 bg-white p-7 text-center md:p-12">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-700" />
        <p className="mt-7 text-xs font-bold uppercase tracking-[0.18em] text-black/45">Application received</p>
        <h2 className="mt-3 text-3xl font-medium tracking-[-0.03em] md:text-4xl">Thank you for applying.</h2>
        <p className="mx-auto mt-4 max-w-lg leading-7 text-black/60">{state.message} Our People team will review it and contact you using the details you provided.</p>
        <div className="mx-auto mt-7 max-w-sm rounded-2xl bg-[#F4F4F0] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">Application reference</p>
          <p className="mt-2 font-mono text-lg font-semibold">{state.reference}</p>
        </div>
        <Link href="/careers" className="mt-8 inline-flex rounded-full bg-black px-6 py-3 text-sm font-semibold text-white">Back to careers</Link>
      </div>
    )
  }

  return (
    <form action={action} encType="multipart/form-data" className="space-y-8" noValidate>
      <input type="hidden" name="jobId" value={job.id} />
      <input type="hidden" name="utmSource" value={searchParams.get('utm_source') ?? ''} />
      <input type="hidden" name="utmMedium" value={searchParams.get('utm_medium') ?? ''} />
      <input type="hidden" name="utmCampaign" value={searchParams.get('utm_campaign') ?? ''} />
      <input type="hidden" name="referrerUrl" value={typeof document === 'undefined' ? '' : document.referrer.slice(0, 1000)} />
      {state.status === 'error' && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">Your application has not been submitted.</p>
          <p className="mt-1">{state.message}</p>
        </div>
      )}

      <FormSection number="01" title="About you" description="The details we will use to contact you.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Legal full name" name="fullName" required autoComplete="name" error={state.fieldErrors?.fullName} />
          <Field label="Preferred name" name="preferredName" autoComplete="nickname" />
          <Field label="Email" name="email" type="email" required autoComplete="email" error={state.fieldErrors?.email} />
          <Field label="Phone" name="phone" type="tel" required autoComplete="tel" error={state.fieldErrors?.phone} />
          <Field label="Country" name="country" defaultValue="Tanzania" required autoComplete="country-name" />
          <Field label="City" name="city" required autoComplete="address-level2" error={state.fieldErrors?.city} />
        </div>
      </FormSection>

      <FormSection number="02" title="Professional profile" description="Help us understand the work you have done and where you are going.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Current position" name="currentPosition" autoComplete="organization-title" />
          <Field label="Current organization" name="currentOrganization" autoComplete="organization" />
          <Field label="Years of relevant experience" name="yearsExperience" type="number" min="0" max="60" step="0.5" error={state.fieldErrors?.yearsExperience} />
          <Field label="LinkedIn" name="linkedinUrl" type="url" placeholder="https://linkedin.com/in/..." error={state.fieldErrors?.linkedinUrl} />
          <div className="sm:col-span-2"><Field label="Portfolio or personal website" name="portfolioUrl" type="url" placeholder="https://" error={state.fieldErrors?.portfolioUrl} /></div>
        </div>
      </FormSection>

      <FormSection number="03" title="Your application" description="Keep it relevant to this role; clarity matters more than length.">
        <label className="grid gap-2 text-sm font-medium">
          CV or résumé <span className="font-normal text-black/45">Required · PDF, DOC or DOCX · max 10 MB</span>
          <span className="flex min-h-28 items-center gap-4 rounded-2xl border border-dashed border-black/25 bg-[#FAFAF7] p-4">
            <FileText className="h-6 w-6 shrink-0 text-black/45" />
            <input type="file" name="resume" required accept=".pdf,.doc,.docx" aria-invalid={Boolean(state.fieldErrors?.resume)} className="w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-black file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white" />
          </span>
          {state.fieldErrors?.resume && <span className="font-normal text-red-700">{state.fieldErrors.resume}</span>}
        </label>
        <label className="mt-5 grid gap-2 text-sm font-medium">
          Why this role? <span className="font-normal text-black/45">Optional</span>
          <textarea name="coverLetter" rows={6} maxLength={4000} placeholder="Tell us what connects your experience to the work…" className="rounded-xl border border-black/15 px-3 py-3 outline-none focus:border-black focus:ring-2 focus:ring-black/10" />
        </label>
      </FormSection>

      <FormSection number="04" title="Practical details" description="These answers help us identify practical mismatches early and respectfully.">
        <div className="grid gap-5 sm:grid-cols-2">
          <RadioGroup name="workAuthorized" label="Are you legally permitted to work in Tanzania?" error={state.fieldErrors?.workAuthorized} />
          <RadioGroup name="weekendAvailable" label="Are you available for occasional weekend event work?" error={state.fieldErrors?.weekendAvailable} />
          <Field label="Earliest start date" name="earliestStartDate" type="date" />
          <Field label="Expected salary range" name="salaryExpectation" placeholder="Optional, in TZS" />
        </div>
      </FormSection>

      <FormSection number="05" title="Privacy and consent" description="Each choice is separate. Only the first is required for this application.">
        <div className="space-y-4">
          <Checkbox name="applicationConsent" required error={state.fieldErrors?.applicationConsent}>I consent to OpusFesta processing my information for this application.</Checkbox>
          <Checkbox name="talentPoolConsent">If I am not selected, OpusFesta may retain my profile for suitable future roles.</Checkbox>
          <Checkbox name="careerUpdatesConsent">I would like to receive occasional career notifications.</Checkbox>
        </div>
        <div className="mt-6 flex gap-3 rounded-2xl bg-[#F4F4F0] p-4 text-sm leading-6 text-black/60">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <p>Your documents are stored privately and are only available to authorized recruitment staff. You may request correction, withdrawal or deletion.</p>
        </div>
      </FormSection>

      <div className="flex flex-col-reverse gap-4 border-t border-black/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-xs leading-5 text-black/45">OpusFesta never charges application or recruitment fees. Final decisions are reviewed by people.</p>
        <button type="submit" disabled={pending} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-black px-7 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-50">
          {pending ? 'Submitting securely…' : 'Submit application'} <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </form>
  )
}

function FormSection({ number, title, description, children }: { number: string; title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-[28px] border border-black/10 bg-white p-6 md:p-8"><div className="mb-7 grid gap-2 border-b border-black/10 pb-6 sm:grid-cols-[42px_1fr]"><span className="text-xs font-semibold text-black/35">{number}</span><div><h2 className="text-2xl font-medium tracking-tight">{title}</h2><p className="mt-1 text-sm leading-6 text-black/50">{description}</p></div></div>{children}</section>
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; error?: string }
function Field({ label, name, error, ...props }: FieldProps) {
  return <label className="grid gap-2 text-sm font-medium">{label}<input name={name} aria-invalid={Boolean(error)} {...props} className="min-h-12 rounded-xl border border-black/15 px-3 outline-none focus:border-black focus:ring-2 focus:ring-black/10 aria-[invalid=true]:border-red-600" />{error && <span className="font-normal text-red-700">{error}</span>}</label>
}

function RadioGroup({ name, label, error }: { name: string; label: string; error?: string }) {
  return <fieldset><legend className="text-sm font-medium">{label}</legend><div className="mt-3 flex gap-2">{[['yes', 'Yes'], ['no', 'No']].map(([value, text]) => <label key={value} className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-xl border border-black/15 px-3 text-sm has-[:checked]:border-black has-[:checked]:bg-black has-[:checked]:text-white"><input type="radio" name={name} value={value} className="accent-black" />{text}</label>)}</div>{error && <p className="mt-2 text-sm text-red-700">{error}</p>}</fieldset>
}

function Checkbox({ name, children, required, error }: { name: string; children: React.ReactNode; required?: boolean; error?: string }) {
  return <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" name={name} required={required} className="mt-1 h-4 w-4 rounded border-black/25 accent-black" /><span>{children}{error && <span className="block text-red-700">{error}</span>}</span></label>
}
