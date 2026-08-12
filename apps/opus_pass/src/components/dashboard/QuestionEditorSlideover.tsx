'use client'

import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Slideover, Button, Field, inputClass } from './controls'
import { cn } from '@/lib/utils'
import type { RsvpQuestionInput } from '@/lib/dashboard/actions'
import type { RsvpQuestion, RsvpQuestionKind } from '@/lib/dashboard/types'

interface DraftOption {
  id?: string
  label: string
  description: string
}

interface Draft {
  prompt: string
  kind: RsvpQuestionKind
  required: boolean
  attendingOnly: boolean
  options: DraftOption[]
}

const EMPTY_OPTION: DraftOption = { label: '', description: '' }

function fromQuestion(q: RsvpQuestion | null, scope: 'event' | 'general'): Draft {
  if (!q) {
    return {
      prompt: '',
      kind: 'short_answer',
      required: false,
      attendingOnly: scope === 'event',
      options: [{ ...EMPTY_OPTION }, { ...EMPTY_OPTION }],
    }
  }
  return {
    prompt: q.prompt,
    kind: q.kind,
    required: q.required,
    attendingOnly: q.attending_only,
    options:
      q.options.length > 0
        ? q.options.map((o) => ({ id: o.id, label: o.label, description: o.description ?? '' }))
        : [{ ...EMPTY_OPTION }, { ...EMPTY_OPTION }],
  }
}

/**
 * The "Add / edit question" side panel. Shared by the RSVP management dashboard
 * and the guided setup wizard. Short-answer questions are skippable; multiple-
 * choice questions require the guest to pick an option.
 */
export function QuestionEditorSlideover({
  open,
  onClose,
  initial = null,
  scope,
  eventName,
  saving = false,
  onSave,
}: {
  open: boolean
  onClose: () => void
  initial?: RsvpQuestion | null
  /** 'event' = per-event follow-up; 'general' = asked to everyone. */
  scope: 'event' | 'general'
  /** Event name shown in the header when scope is 'event'. */
  eventName?: string
  saving?: boolean
  onSave: (input: RsvpQuestionInput) => void
}) {
  // State is seeded once from props; the parent passes a `key` that changes
  // each time the panel opens for a different question, remounting it fresh.
  const [draft, setDraft] = useState<Draft>(() => fromQuestion(initial, scope))

  const isMultiple = draft.kind === 'multiple_choice'
  const filledOptions = draft.options.filter((o) => o.label.trim().length > 0)
  const canSave = draft.prompt.trim().length > 0 && (!isMultiple || filledOptions.length >= 2)

  function setKind(kind: RsvpQuestionKind) {
    setDraft((d) => ({
      ...d,
      kind,
      // Multiple choice must be answered; short answer is skippable.
      required: kind === 'multiple_choice',
    }))
  }

  function updateOption(i: number, patch: Partial<DraftOption>) {
    setDraft((d) => ({
      ...d,
      options: d.options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)),
    }))
  }

  function addOption() {
    setDraft((d) => ({ ...d, options: [...d.options, { ...EMPTY_OPTION }] }))
  }

  function removeOption(i: number) {
    setDraft((d) => ({ ...d, options: d.options.filter((_, idx) => idx !== i) }))
  }

  function handleSave() {
    if (!canSave) return
    onSave({
      prompt: draft.prompt.trim(),
      kind: draft.kind,
      required: draft.required,
      attending_only: scope === 'event' ? draft.attendingOnly : false,
      options: isMultiple
        ? filledOptions.map((o) => ({ id: o.id, label: o.label.trim(), description: o.description.trim() || null }))
        : [],
    })
  }

  const title = initial ? 'Edit question' : 'Add question'

  return (
    <Slideover
      open={open}
      onClose={onClose}
      title={title}
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="rounded-xl bg-[#FBF3DD] px-4 py-3 text-xs leading-relaxed text-[#7a5b12]">
          <b>FYI:</b> Guests can skip short-answer questions, but must answer multiple-choice
          questions.
          {scope === 'event' && eventName ? (
            <>
              {' '}
              This question is for <b>{eventName}</b>.
            </>
          ) : null}
        </p>

        <Field label="Question prompt" required>
          <input
            autoFocus
            value={draft.prompt}
            onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
            placeholder="e.g. What's your meal preference?"
            className={inputClass}
          />
        </Field>

        {/* Answer type */}
        <div className="flex gap-3">
          <KindRadio label="Short answer" checked={!isMultiple} onClick={() => setKind('short_answer')} />
          <KindRadio label="Multiple choice" checked={isMultiple} onClick={() => setKind('multiple_choice')} />
        </div>

        {isMultiple ? (
          <div className="space-y-4">
            {draft.options.map((opt, i) => (
              <div key={i} className="rounded-2xl border border-black/[0.08] bg-black/[0.015] p-4">
                <div className="flex items-start gap-3">
                  <button data-opus-button="control"
                    type="button"
                    onClick={() => removeOption(i)}
                    aria-label="Remove option"
                    disabled={draft.options.length <= 2}
                    className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-black/[0.15] text-[#1A1A1A]/55 hover:bg-black/[0.05] disabled:opacity-40"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <input
                      value={opt.label}
                      onChange={(e) => updateOption(i, { label: e.target.value })}
                      placeholder="Option*"
                      className={inputClass}
                    />
                    <textarea
                      value={opt.description}
                      onChange={(e) => updateOption(i, { description: e.target.value })}
                      placeholder="If selected, ask for details (optional)"
                      rows={2}
                      className={cn(inputClass, 'resize-none')}
                    />
                  </div>
                </div>
              </div>
            ))}
            <button data-opus-button="control"
              type="button"
              onClick={addOption}
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#7E5896] hover:text-[#5d3a78]"
            >
              <Plus className="h-4 w-4" /> Add another option
            </button>
          </div>
        ) : null}

        {/* Attending-only toggle for per-event follow-ups */}
        {scope === 'event' ? (
          <label className="flex items-start gap-3 rounded-2xl border border-black/[0.08] px-4 py-3">
            <input
              type="checkbox"
              checked={draft.attendingOnly}
              onChange={(e) => setDraft((d) => ({ ...d, attendingOnly: e.target.checked }))}
              className="mt-0.5 h-4 w-4 accent-[#C9A0DC]"
            />
            <span className="text-sm text-[#1A1A1A]/75">
              Only ask guests who say they’re attending
              <span className="mt-0.5 block text-xs text-[#1A1A1A]/45">
                Turn off to ask everyone who responds to this event.
              </span>
            </span>
          </label>
        ) : null}
      </div>
    </Slideover>
  )
}

function KindRadio({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button data-opus-button="control"
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors',
        checked
          ? 'border-[#C9A0DC] bg-[#F0DFF6]/60 text-[#1A1A1A]'
          : 'border-black/[0.12] text-[#1A1A1A]/65 hover:bg-black/[0.03]',
      )}
    >
      <span
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded-full border-2',
          checked ? 'border-[#7E5896]' : 'border-black/25',
        )}
      >
        {checked ? <span className="h-2 w-2 rounded-full bg-[#7E5896]" /> : null}
      </span>
      {label}
    </button>
  )
}
