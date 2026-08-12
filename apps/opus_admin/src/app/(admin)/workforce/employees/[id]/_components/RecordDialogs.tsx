'use client'

import { useEffect, useState, useTransition, type ReactNode } from 'react'
import { Trash2, X } from 'lucide-react'
import {
  awardBadge,
  createCertification,
  createDocument,
  createResumeEntry,
  createSkill,
  deleteCertification,
  deleteDocument,
  deleteResumeEntry,
  deleteSkill,
  revokeBadge,
  setDocumentStatus,
  updateBadge,
  updateCertification,
  updateDocument,
  updateResumeEntry,
  updateSkill,
  type BadgeInput,
  type CertificationInput,
  type CreateDocumentInput,
  type ResumeEntryInput,
  type SkillInput,
  type UpdateDocumentInput,
} from '../record-actions'
import type {
  Certification,
  DocumentStatus,
  EmployeeBadge,
  EmployeeDocument,
  EmployeeSkill,
  ResumeEntry,
  ResumeEntryType,
  SkillCategory,
  SkillLevel,
} from '../../../_lib/types'

// -----------------------------------------------------------------------------
// Building blocks — shared dialog shell, field wrappers, escape handling.
// Kept private to this module since each dialog has slightly different
// content; the shell just unifies layout, close button and submit row.
// -----------------------------------------------------------------------------

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]'

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
}

function DialogShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
  maxWidth = 'max-w-xl',
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
  maxWidth?: string
}) {
  useEscape(onClose)
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={`flex max-h-[90vh] w-full ${maxWidth} flex-col rounded-2xl bg-white shadow-xl`}>
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
          </div>
          <button data-opus-button="control"
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-4">
          {footer}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </span>
      {children}
    </label>
  )
}

function PrimaryButton({
  pending,
  disabled,
  onClick,
  children,
}: {
  pending: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button data-opus-button="control"
      type="button"
      onClick={onClick}
      disabled={pending || disabled}
      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
    >
      {pending ? 'Saving…' : children}
    </button>
  )
}

function CancelButton({ onClick, pending }: { onClick: () => void; pending: boolean }) {
  return (
    <button data-opus-button="control"
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      Cancel
    </button>
  )
}

function ErrorRow({ error }: { error: string | null }) {
  if (!error) return null
  return <p className="text-sm font-medium text-rose-700">{error}</p>
}

// -----------------------------------------------------------------------------
// Resume entry dialog
// -----------------------------------------------------------------------------

const RESUME_TYPES: { value: ResumeEntryType; label: string }[] = [
  { value: 'experience', label: 'Experience' },
  { value: 'education', label: 'Education' },
  { value: 'project', label: 'Project' },
]

export function ResumeEntryDialog({
  employeeId,
  entry,
  onClose,
}: {
  employeeId: string
  entry?: ResumeEntry | null
  onClose: () => void
}) {
  const isEdit = Boolean(entry)
  const [entryType, setEntryType] = useState<ResumeEntryType>(entry?.entryType ?? 'experience')
  const [title, setTitle] = useState(entry?.title ?? '')
  const [organization, setOrganization] = useState(entry?.organization ?? '')
  const [location, setLocation] = useState(entry?.location ?? '')
  const [startDate, setStartDate] = useState(entry?.startDate ?? '')
  const [endDate, setEndDate] = useState(entry?.endDate ?? '')
  const [isCurrent, setIsCurrent] = useState(entry ? entry.endDate === null : false)
  const [description, setDescription] = useState(entry?.description ?? '')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function submit() {
    setError(null)
    const input: ResumeEntryInput = {
      entryType,
      title,
      organization: organization || null,
      location: location || null,
      startDate,
      endDate: isCurrent ? null : endDate || null,
      description: description || null,
    }
    startTransition(async () => {
      try {
        if (isEdit && entry) {
          await updateResumeEntry(employeeId, entry.id, input)
        } else {
          await createResumeEntry(employeeId, input)
        }
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save resume entry.')
      }
    })
  }

  return (
    <DialogShell
      title={isEdit ? 'Edit resume entry' : 'Add resume entry'}
      subtitle="Work history, education and projects power the timeline on the Resume tab."
      onClose={onClose}
      footer={
        <>
          <CancelButton onClick={onClose} pending={pending} />
          <PrimaryButton pending={pending} disabled={!title || !startDate} onClick={submit}>
            {isEdit ? 'Save changes' : 'Add entry'}
          </PrimaryButton>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Entry type">
          <select
            value={entryType}
            onChange={(e) => setEntryType(e.target.value as ResumeEntryType)}
            className={inputClass}
          >
            {RESUME_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Senior Developer"
            className={inputClass}
            autoFocus
          />
        </Field>
        <Field label="Organization">
          <input
            type="text"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            placeholder="Company, school or client"
            className={inputClass}
          />
        </Field>
        <Field label="Location">
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Dar es Salaam"
            className={inputClass}
          />
        </Field>
        <Field label="Start date">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={isCurrent ? 'End date (current role)' : 'End date'}>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={isCurrent}
            className={`${inputClass} ${isCurrent ? 'opacity-50' : ''}`}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isCurrent}
          onChange={(e) => setIsCurrent(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-[#7E5896] focus:ring-[#C9A0DC]"
        />
        <span className="text-gray-700">This is their current role / ongoing</span>
      </label>
      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Key responsibilities, achievements or focus areas."
          className={`${inputClass} min-h-[96px] resize-y`}
        />
      </Field>
      <ErrorRow error={error} />
    </DialogShell>
  )
}

// -----------------------------------------------------------------------------
// Skill dialog
// -----------------------------------------------------------------------------

const SKILL_CATEGORIES: { value: SkillCategory; label: string }[] = [
  { value: 'language', label: 'Language' },
  { value: 'soft', label: 'Soft skill' },
  { value: 'technical', label: 'Technical' },
  { value: 'other', label: 'Other' },
]

const SKILL_LEVELS: SkillLevel[] = ['Beginner', 'Intermediate', 'Advanced', 'Expert']

// Defaults a sensible bar fill for the chosen level so HR doesn't have
// to set both — they can override after.
const LEVEL_DEFAULTS: Record<SkillLevel, number> = {
  Beginner: 25,
  Intermediate: 55,
  Advanced: 80,
  Expert: 95,
}

export function SkillDialog({
  employeeId,
  skill,
  onClose,
}: {
  employeeId: string
  skill?: EmployeeSkill | null
  onClose: () => void
}) {
  const isEdit = Boolean(skill)
  const [category, setCategory] = useState<SkillCategory>(skill?.category ?? 'language')
  const [name, setName] = useState(skill?.name ?? '')
  const [level, setLevel] = useState<SkillLevel>(skill?.level ?? 'Intermediate')
  const [proficiency, setProficiency] = useState(skill?.proficiencyPercent ?? 50)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleLevel(next: SkillLevel) {
    setLevel(next)
    if (!isEdit) setProficiency(LEVEL_DEFAULTS[next])
  }

  function submit() {
    setError(null)
    const input: SkillInput = {
      category,
      name,
      level,
      proficiencyPercent: proficiency,
    }
    startTransition(async () => {
      try {
        if (isEdit && skill) {
          await updateSkill(employeeId, skill.id, input)
        } else {
          await createSkill(employeeId, input)
        }
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save skill.')
      }
    })
  }

  return (
    <DialogShell
      title={isEdit ? 'Edit skill' : 'Add skill'}
      subtitle="Languages, soft skills and technical expertise show on the Resume tab."
      onClose={onClose}
      maxWidth="max-w-lg"
      footer={
        <>
          <CancelButton onClick={onClose} pending={pending} />
          <PrimaryButton pending={pending} disabled={!name} onClick={submit}>
            {isEdit ? 'Save changes' : 'Add skill'}
          </PrimaryButton>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Category">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as SkillCategory)}
            className={inputClass}
          >
            {SKILL_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Skill name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. English, Communication, React"
            autoFocus
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Level">
        <div className="flex gap-1.5">
          {SKILL_LEVELS.map((l) => (
            <button data-opus-button="neutral" data-opus-button-size="small"
              key={l}
              type="button"
              onClick={() => handleLevel(l)}
              className={
                level === l
                  ? 'flex-1 rounded-lg border border-[#7E5896] bg-[#F0DFF6] px-3 py-2 text-xs font-semibold text-[#5B2D8E]'
                  : 'flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:border-[#E0BEEC]'
              }
            >
              {l}
            </button>
          ))}
        </div>
      </Field>
      <Field label={`Proficiency · ${proficiency}%`}>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={proficiency}
          onChange={(e) => setProficiency(Number(e.target.value))}
          className="w-full accent-[#7E5896]"
        />
      </Field>
      <ErrorRow error={error} />
    </DialogShell>
  )
}

// -----------------------------------------------------------------------------
// Certification dialog
// -----------------------------------------------------------------------------

export function CertificationDialog({
  employeeId,
  certification,
  onClose,
}: {
  employeeId: string
  certification?: Certification | null
  onClose: () => void
}) {
  const isEdit = Boolean(certification)
  const [name, setName] = useState(certification?.name ?? '')
  const [issuingBody, setIssuingBody] = useState(certification?.issuingBody ?? '')
  const [issuedDate, setIssuedDate] = useState(certification?.issuedDate ?? '')
  const [expiresDate, setExpiresDate] = useState(certification?.expiresDate ?? '')
  const [credentialId, setCredentialId] = useState(certification?.credentialId ?? '')
  const [notes, setNotes] = useState(certification?.notes ?? '')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function submit() {
    setError(null)
    const input: CertificationInput = {
      name,
      issuingBody: issuingBody || null,
      issuedDate: issuedDate || null,
      expiresDate: expiresDate || null,
      credentialId: credentialId || null,
      notes: notes || null,
    }
    startTransition(async () => {
      try {
        if (isEdit && certification) {
          await updateCertification(employeeId, certification.id, input)
        } else {
          await createCertification(employeeId, input)
        }
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save certification.')
      }
    })
  }

  return (
    <DialogShell
      title={isEdit ? 'Edit certification' : 'Add certification'}
      subtitle="Diplomas, courses and professional certificates. File uploads are coming next."
      onClose={onClose}
      footer={
        <>
          <CancelButton onClick={onClose} pending={pending} />
          <PrimaryButton pending={pending} disabled={!name} onClick={submit}>
            {isEdit ? 'Save changes' : 'Add certification'}
          </PrimaryButton>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Certification name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. AWS Solutions Architect Associate"
            autoFocus
            className={inputClass}
          />
        </Field>
        <Field label="Issuing body">
          <input
            type="text"
            value={issuingBody}
            onChange={(e) => setIssuingBody(e.target.value)}
            placeholder="Amazon, Microsoft, university, etc."
            className={inputClass}
          />
        </Field>
        <Field label="Issued date">
          <input
            type="date"
            value={issuedDate}
            onChange={(e) => setIssuedDate(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Expires (optional)">
          <input
            type="date"
            value={expiresDate}
            onChange={(e) => setExpiresDate(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Credential ID (optional)">
          <input
            type="text"
            value={credentialId}
            onChange={(e) => setCredentialId(e.target.value)}
            placeholder="Verification code or URL"
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Score, level, additional context."
          className={`${inputClass} min-h-[80px] resize-y`}
        />
      </Field>
      <ErrorRow error={error} />
    </DialogShell>
  )
}

// -----------------------------------------------------------------------------
// Badge dialog
// -----------------------------------------------------------------------------

const BADGE_KIND_OPTIONS = [
  { value: 'welcome', label: 'Welcome' },
  { value: 'milestone', label: 'Milestone' },
  { value: 'recognition', label: 'Recognition' },
  { value: 'tenure', label: 'Tenure' },
  { value: 'training', label: 'Training' },
  { value: 'custom', label: 'Custom' },
]

const BADGE_COLOR_OPTIONS = [
  { value: 'emerald', label: 'Emerald' },
  { value: 'purple', label: 'Purple' },
  { value: 'amber', label: 'Amber' },
  { value: 'blue', label: 'Blue' },
  { value: 'rose', label: 'Rose' },
]

export function BadgeDialog({
  employeeId,
  badge,
  onClose,
}: {
  employeeId: string
  badge?: EmployeeBadge | null
  onClose: () => void
}) {
  const isEdit = Boolean(badge)
  const [badgeKind, setBadgeKind] = useState(badge?.badgeKind ?? 'recognition')
  const [name, setName] = useState(badge?.name ?? '')
  const [description, setDescription] = useState(badge?.description ?? '')
  const [colorToken, setColorToken] = useState(badge?.colorToken ?? 'purple')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function submit() {
    setError(null)
    const input: BadgeInput = {
      badgeKind,
      name,
      description: description || null,
      colorToken,
    }
    startTransition(async () => {
      try {
        if (isEdit && badge) {
          await updateBadge(employeeId, badge.id, input)
        } else {
          await awardBadge(employeeId, input)
        }
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save badge.')
      }
    })
  }

  return (
    <DialogShell
      title={isEdit ? 'Edit badge' : 'Award badge'}
      subtitle="Recognition awards, milestone badges and training completions."
      onClose={onClose}
      maxWidth="max-w-lg"
      footer={
        <>
          <CancelButton onClick={onClose} pending={pending} />
          <PrimaryButton pending={pending} disabled={!name} onClick={submit}>
            {isEdit ? 'Save changes' : 'Award badge'}
          </PrimaryButton>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Kind">
          <select
            value={badgeKind}
            onChange={(e) => setBadgeKind(e.target.value)}
            className={inputClass}
          >
            {BADGE_KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Color">
          <select
            value={colorToken}
            onChange={(e) => setColorToken(e.target.value)}
            className={inputClass}
          >
            {BADGE_COLOR_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Badge name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. 1-year tenure, Stellar collaborator"
          autoFocus
          className={inputClass}
        />
      </Field>
      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What earned this badge?"
          className={`${inputClass} min-h-[80px] resize-y`}
        />
      </Field>
      <ErrorRow error={error} />
    </DialogShell>
  )
}

// -----------------------------------------------------------------------------
// Document dialog (add new tracker row)
// -----------------------------------------------------------------------------

export function DocumentCreateDialog({
  employeeId,
  onClose,
}: {
  employeeId: string
  onClose: () => void
}) {
  const [docLabel, setDocLabel] = useState('')
  const [docType, setDocType] = useState('')
  const [required, setRequired] = useState(true)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function submit() {
    setError(null)
    // Derive a stable doc_type slug from the label so HR doesn't have
    // to think about both — overridable via the dedicated input.
    const finalType =
      docType.trim() ||
      docLabel
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
    const input: CreateDocumentInput = {
      docType: finalType,
      docLabel,
      required,
    }
    startTransition(async () => {
      try {
        await createDocument(employeeId, input)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not add document.')
      }
    })
  }

  return (
    <DialogShell
      title="Add document to checklist"
      subtitle="Adds a new row to this employee's onboarding tracker."
      onClose={onClose}
      maxWidth="max-w-lg"
      footer={
        <>
          <CancelButton onClick={onClose} pending={pending} />
          <PrimaryButton pending={pending} disabled={!docLabel} onClick={submit}>
            Add document
          </PrimaryButton>
        </>
      }
    >
      <Field label="Document label">
        <input
          type="text"
          value={docLabel}
          onChange={(e) => setDocLabel(e.target.value)}
          placeholder="e.g. Background Check Authorization"
          autoFocus
          className={inputClass}
        />
      </Field>
      <Field label="Document type (slug — auto-generated from label if blank)">
        <input
          type="text"
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
          placeholder="background_check"
          className={inputClass}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-[#7E5896] focus:ring-[#C9A0DC]"
        />
        <span className="text-gray-700">Required for onboarding completion</span>
      </label>
      <ErrorRow error={error} />
    </DialogShell>
  )
}

// -----------------------------------------------------------------------------
// Document edit dialog — label, required flag and notes.
// -----------------------------------------------------------------------------

export function DocumentEditDialog({
  employeeId,
  doc,
  onClose,
}: {
  employeeId: string
  doc: EmployeeDocument
  onClose: () => void
}) {
  const [docLabel, setDocLabel] = useState(doc.docLabel)
  const [required, setRequired] = useState(doc.required)
  const [notes, setNotes] = useState(doc.notes ?? '')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function submit() {
    setError(null)
    const input: UpdateDocumentInput = {
      docLabel,
      required,
      notes: notes || null,
    }
    startTransition(async () => {
      try {
        await updateDocument(employeeId, doc.id, input)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not update document.')
      }
    })
  }

  return (
    <DialogShell
      title={`Edit ${doc.docLabel}`}
      subtitle="Change the label, required flag or notes. Status changes have their own controls."
      onClose={onClose}
      maxWidth="max-w-lg"
      footer={
        <>
          <CancelButton onClick={onClose} pending={pending} />
          <PrimaryButton pending={pending} disabled={!docLabel} onClick={submit}>
            Save changes
          </PrimaryButton>
        </>
      }
    >
      <Field label="Document label">
        <input
          type="text"
          value={docLabel}
          onChange={(e) => setDocLabel(e.target.value)}
          className={inputClass}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-[#7E5896] focus:ring-[#C9A0DC]"
        />
        <span className="text-gray-700">Required for onboarding completion</span>
      </label>
      <Field label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Internal HR notes about this document."
          className={`${inputClass} min-h-[80px] resize-y`}
        />
      </Field>
      <ErrorRow error={error} />
    </DialogShell>
  )
}

// -----------------------------------------------------------------------------
// Document rejection dialog — captures a reason so HR can give the
// employee actionable feedback.
// -----------------------------------------------------------------------------

export function DocumentRejectDialog({
  employeeId,
  doc,
  onClose,
}: {
  employeeId: string
  doc: EmployeeDocument
  onClose: () => void
}) {
  const [reason, setReason] = useState(doc.rejectionReason ?? '')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function submit() {
    setError(null)
    startTransition(async () => {
      try {
        await setDocumentStatus(employeeId, doc.id, 'rejected', {
          rejectionReason: reason,
        })
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not reject document.')
      }
    })
  }

  return (
    <DialogShell
      title={`Reject ${doc.docLabel}`}
      subtitle="Give HR a clear reason — this is what gets reported back to the employee."
      onClose={onClose}
      maxWidth="max-w-md"
      footer={
        <>
          <CancelButton onClick={onClose} pending={pending} />
          <button data-opus-button="danger" data-opus-button-size="medium"
            type="button"
            onClick={submit}
            disabled={pending || !reason.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {pending ? 'Rejecting…' : 'Reject document'}
          </button>
        </>
      }
    >
      <Field label="Reason">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="e.g. Signature missing on page 3, needs to be resubmitted."
          autoFocus
          className={`${inputClass} min-h-[96px] resize-y`}
        />
      </Field>
      <ErrorRow error={error} />
    </DialogShell>
  )
}

// -----------------------------------------------------------------------------
// Confirm-delete dialog — shared by resume / skill / cert / badge / doc
// destructive actions so the look + behaviour stay identical across tabs.
// -----------------------------------------------------------------------------

export type DeleteKind = 'resume' | 'skill' | 'certification' | 'badge' | 'document'

const KIND_LABELS: Record<DeleteKind, { verb: string; noun: string; warning: string }> = {
  resume: {
    verb: 'Remove',
    noun: 'resume entry',
    warning: 'This removes the entry from the timeline. It cannot be undone.',
  },
  skill: {
    verb: 'Remove',
    noun: 'skill',
    warning: 'This removes the skill from the proficiency list.',
  },
  certification: {
    verb: 'Delete',
    noun: 'certification',
    warning: 'This deletes the certification record permanently.',
  },
  badge: {
    verb: 'Revoke',
    noun: 'badge',
    warning: 'This revokes the badge. The award history is lost.',
  },
  document: {
    verb: 'Delete',
    noun: 'document',
    warning:
      'This deletes the document row from the onboarding checklist. Re-add it from the checklist controls if needed.',
  },
}

export function ConfirmDeleteRecordDialog({
  employeeId,
  kind,
  recordId,
  label,
  onClose,
}: {
  employeeId: string
  kind: DeleteKind
  recordId: string
  label: string
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const { verb, noun, warning } = KIND_LABELS[kind]

  function confirm() {
    setError(null)
    startTransition(async () => {
      try {
        if (kind === 'resume') await deleteResumeEntry(employeeId, recordId)
        else if (kind === 'skill') await deleteSkill(employeeId, recordId)
        else if (kind === 'certification') await deleteCertification(employeeId, recordId)
        else if (kind === 'badge') await revokeBadge(employeeId, recordId)
        else if (kind === 'document') await deleteDocument(employeeId, recordId)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : `Could not ${verb.toLowerCase()} ${noun}.`)
      }
    })
  }

  return (
    <DialogShell
      title={`${verb} ${noun}?`}
      subtitle={label}
      onClose={onClose}
      maxWidth="max-w-md"
      footer={
        <>
          <CancelButton onClick={onClose} pending={pending} />
          <button data-opus-button="danger" data-opus-button-size="medium"
            type="button"
            onClick={confirm}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {pending ? 'Working…' : `${verb} ${noun}`}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-600">{warning}</p>
      <ErrorRow error={error} />
    </DialogShell>
  )
}

// -----------------------------------------------------------------------------
// Document quick-status helper — used by the inline status menu in the
// Documents tab. Centralizes the action call so the tab UI stays
// declarative.
// -----------------------------------------------------------------------------

export async function quickSetDocumentStatus(
  employeeId: string,
  doc: EmployeeDocument,
  next: DocumentStatus,
): Promise<void> {
  await setDocumentStatus(employeeId, doc.id, next)
}
