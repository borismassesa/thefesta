'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ClipboardList,
  Share2,
  BarChart3,
  Plus,
  Pencil,
  Trash2,
  Check,
  Eye,
  Mail,
  Users,
  PartyPopper,
} from 'lucide-react'
import { Card } from '@/components/dashboard/primitives'
import { Button, Toggle, ConfirmDialog } from '@/components/dashboard/controls'
import { QuestionEditorSlideover } from '@/components/dashboard/QuestionEditorSlideover'
import { cn } from '@/lib/utils'
import {
  setEventAllowRsvp,
  createRsvpQuestion,
  updateRsvpQuestion,
  deleteRsvpQuestion,
  enableInviteSharing,
  disableInviteSharing,
  type RsvpQuestionInput,
} from '@/lib/dashboard/actions'
import { EVENT_QUESTION_PRESETS, GENERAL_QUESTION_PRESETS, type RsvpQuestionPreset } from '@/lib/dashboard/rsvp-presets'
import { RSVP_QUESTION_KIND_LABELS, type RsvpQuestion, type WeddingEvent } from '@/lib/dashboard/types'

type StepId = 'intro' | 'events' | 'event-questions' | 'general-questions' | 'privacy' | 'done'

const STEPS: { id: StepId; label: string }[] = [
  { id: 'intro', label: 'How it works' },
  { id: 'events', label: 'Events' },
  { id: 'event-questions', label: 'Event questions' },
  { id: 'general-questions', label: 'General questions' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'done', label: 'Done' },
]

type EditorState =
  | { open: false }
  | { open: true; scope: 'event' | 'general'; eventId: string | null; eventName?: string; initial: RsvpQuestion | null }

export default function RsvpSetupWizard({
  events,
  questions,
}: {
  events: WeddingEvent[]
  questions: RsvpQuestion[]
}) {
  const router = useRouter()
  const [stepIndex, setStepIndex] = useState(0)
  const [editor, setEditor] = useState<EditorState>({ open: false })
  const [deleting, setDeleting] = useState<RsvpQuestion | null>(null)
  // "Public RSVP" applies to every event currently collecting RSVPs at once —
  // each event has its own invite link/toggle (see RsvpSetupPanel), but this
  // guided wizard is a single yes/no step, not a per-event picker.
  const [isPublic, setIsPublic] = useState(events.some((e) => e.allow_rsvp && e.invite_sharing_enabled))
  const [pending, startTransition] = useTransition()

  const step = STEPS[stepIndex].id
  const rsvpEvents = useMemo(() => events.filter((e) => e.allow_rsvp), [events])
  const generalQuestions = useMemo(() => questions.filter((q) => q.event_id === null), [questions])
  const questionsByEvent = useMemo(() => {
    const map = new Map<string, RsvpQuestion[]>()
    for (const q of questions) {
      if (!q.event_id) continue
      const list = map.get(q.event_id) ?? []
      list.push(q)
      map.set(q.event_id, list)
    }
    return map
  }, [questions])

  const usedPrompts = useMemo(() => new Set(questions.map((q) => q.prompt.toLowerCase())), [questions])

  function refresh() {
    router.refresh()
  }

  function next() {
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1))
  }
  function back() {
    setStepIndex((i) => Math.max(i - 1, 0))
  }

  function toggleEvent(eventId: string, allow: boolean) {
    startTransition(async () => {
      try {
        await setEventAllowRsvp(eventId, allow)
        refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not update')
      }
    })
  }

  function saveQuestion(input: RsvpQuestionInput) {
    if (!editor.open) return
    const eventId = editor.eventId
    const existing = editor.initial
    startTransition(async () => {
      try {
        if (existing) {
          await updateRsvpQuestion(existing.id, { ...input, event_id: eventId })
        } else {
          const siblings = eventId ? (questionsByEvent.get(eventId)?.length ?? 0) : generalQuestions.length
          await createRsvpQuestion({ ...input, event_id: eventId, sort_order: siblings })
        }
        setEditor({ open: false })
        refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not save question')
      }
    })
  }

  function addPreset(preset: RsvpQuestionPreset, eventId: string | null) {
    const siblings = eventId ? (questionsByEvent.get(eventId)?.length ?? 0) : generalQuestions.length
    startTransition(async () => {
      try {
        await createRsvpQuestion({ ...preset.input, event_id: eventId, sort_order: siblings })
        refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not add question')
      }
    })
  }

  function confirmDelete() {
    if (!deleting) return
    const id = deleting.id
    startTransition(async () => {
      try {
        await deleteRsvpQuestion(id)
        setDeleting(null)
        refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not remove')
      }
    })
  }

  function choosePrivacy(makePublic: boolean) {
    setIsPublic(makePublic)
    startTransition(async () => {
      try {
        await Promise.all(
          rsvpEvents.map((e) => (makePublic ? enableInviteSharing(e.id) : disableInviteSharing(e.id))),
        )
        refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not update privacy')
      }
    })
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-4xl flex-col">
      {/* Header + progress (pinned to top) */}
      <div className="dash-header-safe flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-[#1A1A1A]">Set up RSVPs</h1>
        <Link href="/my/dashboard/rsvps" className="text-sm font-medium text-[#1A1A1A]/55 hover:text-[#1A1A1A]">
          Close
        </Link>
      </div>
      <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
        <span
          className="bg-[#C9A0DC] transition-all"
          style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      {/* Step body — centered in the remaining vertical space */}
      <div className="flex flex-1 flex-col justify-center py-10">
      {step === 'intro' ? (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold tracking-tight text-[#1A1A1A]">Great! Here’s how it works</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <IntroCard step="1" icon={<ClipboardList className="h-5 w-5" />} title="Set up RSVPs" body="Turn on the events you’re collecting responses for and add questions like meal choices." />
            <IntroCard step="2" icon={<Share2 className="h-5 w-5" />} title="Share your invite" body="Send guests their personal RSVP link by WhatsApp, SMS or email." />
            <IntroCard step="3" icon={<BarChart3 className="h-5 w-5" />} title="Track responses" body="Watch replies roll in and export them whenever you need." />
          </div>
          <div className="flex justify-center">
            <Button onClick={next}>Get started</Button>
          </div>
        </div>
      ) : null}

      {step === 'events' ? (
        <StepShell
          title="Which events are you collecting RSVPs for?"
          onBack={back}
          onNext={next}
          nextLabel="Next"
        >
          {events.length === 0 ? (
            <EmptyHint
              text="You haven’t added any events yet."
              cta={<Link href="/my/dashboard/events"><Button variant="secondary">Add an event</Button></Link>}
            />
          ) : (
            <div className="space-y-2.5">
              {events.map((e) => (
                <div
                  key={e.id}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 transition-colors',
                    e.allow_rsvp ? 'border-[#C9A0DC]/60 bg-[#F0DFF6]/40' : 'border-black/[0.1]',
                  )}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[#1A1A1A]">{e.name}</p>
                    {e.venue_name ? <p className="text-xs text-[#1A1A1A]/50">{e.venue_name}</p> : null}
                  </div>
                  <label className="inline-flex shrink-0 items-center gap-2.5">
                    <span className="text-sm text-[#1A1A1A]/65">RSVPs {e.allow_rsvp ? 'on' : 'off'}</span>
                    <Toggle checked={e.allow_rsvp} disabled={pending} onChange={(v) => toggleEvent(e.id, v)} />
                  </label>
                </div>
              ))}
              <Link
                href="/my/dashboard/events"
                className="mt-1 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-[#7E5896] ring-1 ring-inset ring-[#C9A0DC]/60 hover:bg-[#F0DFF6]/50"
              >
                <Plus className="h-4 w-4" /> Add another event
              </Link>
            </div>
          )}
        </StepShell>
      ) : null}

      {step === 'event-questions' ? (
        <StepShell
          title="Add questions for guests attending each event"
          onBack={back}
          onNext={next}
          nextLabel="Next"
        >
          {rsvpEvents.length === 0 ? (
            <EmptyHint text="Turn on RSVPs for at least one event to add follow-up questions." />
          ) : (
            <div className="space-y-5">
              {rsvpEvents.map((e) => {
                const list = questionsByEvent.get(e.id) ?? []
                const presetsLeft = EVENT_QUESTION_PRESETS.filter((p) => !usedPrompts.has(p.input.prompt.toLowerCase()))
                return (
                  <div key={e.id} className="rounded-2xl border border-black/[0.08] p-4">
                    <p className="mb-3 text-sm font-semibold text-[#1A1A1A]">{e.name}</p>
                    <WizardQuestionList
                      questions={list}
                      onEdit={(q) => setEditor({ open: true, scope: 'event', eventId: e.id, eventName: e.name, initial: q })}
                      onDelete={setDeleting}
                    />
                    <PresetChips presets={presetsLeft} disabled={pending} onAdd={(p) => addPreset(p, e.id)} />
                    <AddButton label="Add custom question" onClick={() => setEditor({ open: true, scope: 'event', eventId: e.id, eventName: e.name, initial: null })} />
                  </div>
                )
              })}
            </div>
          )}
        </StepShell>
      ) : null}

      {step === 'general-questions' ? (
        <StepShell title="Add questions for everyone" onBack={back} onNext={next} nextLabel="Next">
          <p className="-mt-2 mb-4 text-sm text-[#1A1A1A]/60">
            Asked to everyone who RSVPs, whether or not they can attend.
          </p>
          <WizardQuestionList
            questions={generalQuestions}
            onEdit={(q) => setEditor({ open: true, scope: 'general', eventId: null, initial: q })}
            onDelete={setDeleting}
          />
          <PresetChips
            presets={GENERAL_QUESTION_PRESETS.filter((p) => !usedPrompts.has(p.input.prompt.toLowerCase()))}
            disabled={pending}
            onAdd={(p) => addPreset(p, null)}
          />
          <AddButton label="Add custom question" onClick={() => setEditor({ open: true, scope: 'general', eventId: null, initial: null })} />
        </StepShell>
      ) : null}

      {step === 'privacy' ? (
        <StepShell title="Who can access your RSVP page?" onBack={back} onNext={next} nextLabel="Done">
          <div className="space-y-3">
            <PrivacyOption
              selected={!isPublic}
              onClick={() => choosePrivacy(false)}
              title="Guest list only"
              recommended
              body="Only guests you’ve added to your roster can RSVP, using their personal link."
            />
            <PrivacyOption
              selected={isPublic}
              onClick={() => choosePrivacy(true)}
              title="Public RSVP"
              body="Anyone with your shared invitation link can RSVP. New replies land in your review queue."
            />
          </div>
        </StepShell>
      ) : null}

      {step === 'done' ? (
        <div className="space-y-6 text-center">
          <div className="flex justify-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F0DFF6] text-[#7E5896]">
              <PartyPopper className="h-8 w-8" />
            </span>
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[#1A1A1A]">Your RSVPs are all set!</h2>
            <p className="mt-1 text-sm text-[#1A1A1A]/60">Share your invite when you’re ready to collect responses.</p>
          </div>
          <div className="mx-auto max-w-md space-y-2.5 text-left">
            <UpNext href="/my/dashboard/rsvps" icon={<Eye className="h-4 w-4" />} title="Review your questions" cta="View RSVPs" />
            <UpNext href="/my/dashboard/invitations" icon={<Mail className="h-4 w-4" />} title="Share your invitation" cta="Send invites" />
            <UpNext href="/my/dashboard/guests" icon={<Users className="h-4 w-4" />} title="Manage your guest list" cta="Add guests" />
          </div>
        </div>
      ) : null}
      </div>

      <QuestionEditorSlideover
        key={editor.open ? `${editor.scope}:${editor.eventId ?? 'g'}:${editor.initial?.id ?? 'new'}` : 'closed'}
        open={editor.open}
        onClose={() => setEditor({ open: false })}
        scope={editor.open ? editor.scope : 'general'}
        eventName={editor.open ? editor.eventName : undefined}
        initial={editor.open ? editor.initial : null}
        saving={pending}
        onSave={saveQuestion}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Remove this question?"
        description={deleting ? `“${deleting.prompt}” will be deleted.` : ''}
        confirmLabel="Remove"
        pending={pending}
      />
    </div>
  )
}

function StepShell({
  title,
  children,
  onBack,
  onNext,
  nextLabel,
}: {
  title: string
  children: React.ReactNode
  onBack: () => void
  onNext: () => void
  nextLabel: string
}) {
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold tracking-tight text-[#1A1A1A]">{title}</h2>
      {children}
      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>{nextLabel}</Button>
      </div>
    </div>
  )
}

function IntroCard({ step, icon, title, body }: { step: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#7E5896]">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#F0DFF6]">{step}</span>
        Step {step}
      </div>
      <div className="mt-3 text-[#7E5896]">{icon}</div>
      <h3 className="mt-2 text-base font-semibold text-[#1A1A1A]">{title}</h3>
      <p className="mt-1 text-sm text-[#1A1A1A]/60">{body}</p>
    </Card>
  )
}

function WizardQuestionList({
  questions,
  onEdit,
  onDelete,
}: {
  questions: RsvpQuestion[]
  onEdit: (q: RsvpQuestion) => void
  onDelete: (q: RsvpQuestion) => void
}) {
  if (questions.length === 0) return <p className="text-sm text-[#1A1A1A]/45">No questions added yet.</p>
  return (
    <ul className="space-y-2">
      {questions.map((q) => (
        <li key={q.id} className="flex items-center gap-3 rounded-xl border border-black/[0.08] px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[#1A1A1A]">{q.prompt}</p>
            <p className="text-xs text-[#1A1A1A]/50">
              {RSVP_QUESTION_KIND_LABELS[q.kind]}
              {q.kind === 'multiple_choice' ? ` · ${q.options.length} options` : ''}
            </p>
          </div>
          <button data-opus-button="control" type="button" onClick={() => onEdit(q)} aria-label="Edit" className="flex h-8 w-8 items-center justify-center rounded-lg text-[#1A1A1A]/55 hover:bg-black/[0.05]">
            <Pencil className="h-4 w-4" />
          </button>
          <button data-opus-button="control" type="button" onClick={() => onDelete(q)} aria-label="Remove" className="flex h-8 w-8 items-center justify-center rounded-lg text-[#1A1A1A]/55 hover:bg-rose-50 hover:text-rose-600">
            <Trash2 className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  )
}

function PresetChips({
  presets,
  onAdd,
  disabled,
}: {
  presets: RsvpQuestionPreset[]
  onAdd: (p: RsvpQuestionPreset) => void
  disabled?: boolean
}) {
  if (presets.length === 0) return null
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {presets.map((p) => (
        <button data-opus-button="primary" data-opus-button-size="small"
          key={p.key}
          type="button"
          disabled={disabled}
          onClick={() => onAdd(p)}
          className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-3 py-1.5 text-xs font-medium text-[#1A1A1A]/70 hover:bg-black/[0.07] disabled:opacity-50"
        >
          <Plus className="h-3 w-3" /> {p.label}
        </button>
      ))}
    </div>
  )
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button data-opus-button="neutral" data-opus-button-size="large"
      type="button"
      onClick={onClick}
      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#C9A0DC]/70 px-4 py-3 text-sm font-semibold text-[#7E5896] hover:bg-[#F0DFF6]/40"
    >
      <Plus className="h-4 w-4" /> {label}
    </button>
  )
}

function PrivacyOption({
  selected,
  onClick,
  title,
  body,
  recommended,
}: {
  selected: boolean
  onClick: () => void
  title: string
  body: string
  recommended?: boolean
}) {
  return (
    <button data-opus-button="neutral" data-opus-button-size="medium"
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-2xl border px-4 py-4 text-left transition-colors',
        selected ? 'border-[#C9A0DC] bg-[#F0DFF6]/40' : 'border-black/[0.12] hover:bg-black/[0.02]',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
          selected ? 'border-[#7E5896] bg-[#7E5896] text-white' : 'border-black/25',
        )}
      >
        {selected ? <Check className="h-3 w-3" /> : null}
      </span>
      <span>
        <span className="flex items-center gap-2 text-sm font-semibold text-[#1A1A1A]">
          {title}
          {recommended ? (
            <span className="rounded-full bg-[#9FE870]/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#3f6b1f]">
              Recommended
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-sm text-[#1A1A1A]/60">{body}</span>
      </span>
    </button>
  )
}

function EmptyHint({ text, cta }: { text: string; cta?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-black/[0.12] px-5 py-8 text-center">
      <p className="text-sm text-[#1A1A1A]/55">{text}</p>
      {cta ? <div className="mt-3 flex justify-center">{cta}</div> : null}
    </div>
  )
}

function UpNext({ href, icon, title, cta }: { href: string; icon: React.ReactNode; title: string; cta: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-black/[0.1] px-4 py-3.5 transition-colors hover:border-[#C9A0DC]/60 hover:bg-[#F0DFF6]/30"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F0DFF6] text-[#7E5896]">{icon}</span>
      <span className="flex-1 text-sm font-medium text-[#1A1A1A]">{title}</span>
      <span className="text-sm font-semibold text-[#7E5896]">{cta} →</span>
    </Link>
  )
}
