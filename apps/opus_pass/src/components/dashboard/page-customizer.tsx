'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Monitor, Tablet, Smartphone, Trash2, Image as ImageIcon, PenLine, ListChecks, Plus, X, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Field, inputClass } from '@/components/dashboard/controls'
import { uploadPledgeCover } from '@/lib/dashboard/actions'
import type {
  CollectorQuestion,
  CollectorQuestionKind,
  PledgePageConfig,
} from '@/lib/dashboard/pledge-page'
import { isVideoCoverUrl } from '@/lib/dashboard/pledge-page'

// Shared building blocks for the pledge / collector page customizers.

export type PreviewDevice = 'desktop' | 'tablet' | 'phone'

export const PREVIEW_DEVICES: Record<
  PreviewDevice,
  { label: string; width: string; height: number; icon: typeof Monitor }
> = {
  desktop: { label: 'Desktop', width: '100%', height: 620, icon: Monitor },
  tablet: { label: 'iPad', width: '768px', height: 780, icon: Tablet },
  phone: { label: 'Phone', width: '390px', height: 780, icon: Smartphone },
}

export function DeviceToggle({
  device,
  onChange,
}: {
  device: PreviewDevice
  onChange: (d: PreviewDevice) => void
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-black/[0.12] bg-white p-0.5">
      {(Object.keys(PREVIEW_DEVICES) as PreviewDevice[]).map((d) => {
        const { label, icon: Icon } = PREVIEW_DEVICES[d]
        const active = d === device
        return (
          <button data-opus-button="control"
            key={d}
            type="button"
            onClick={() => onChange(d)}
            aria-pressed={active}
            title={label}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              active ? 'bg-[#1A1A1A] text-white' : 'text-[#1A1A1A]/55 hover:text-[#1A1A1A]',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** A browser-chrome framed iframe whose width follows the selected device. */
export function PreviewBrowser({
  src,
  device,
  previewKey,
}: {
  src: string
  device: PreviewDevice
  previewKey: number
}) {
  return (
    <div className="rounded-2xl bg-[#F3F1EE]/60 p-3 sm:p-5">
      <div
        className="mx-auto overflow-hidden rounded-xl border border-black/[0.12] bg-white shadow-[0_24px_60px_-30px_rgba(0,0,0,0.4)] transition-all duration-300"
        style={{ maxWidth: PREVIEW_DEVICES[device].width }}
      >
        <div className="flex items-center gap-2 border-b border-black/[0.08] bg-[#F3F1EE] px-4 py-2.5">
          <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
          <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
          <span className="h-3 w-3 rounded-full bg-[#28C840]" />
          <div className="ml-3 hidden min-w-0 flex-1 truncate rounded-md bg-white px-3 py-1 text-xs text-[#1A1A1A]/50 ring-1 ring-black/[0.06] sm:block">
            {src.replace(/^https?:\/\//, '')}
          </div>
        </div>
        <iframe
          key={previewKey}
          src={src}
          title="Page preview"
          className="w-full bg-white"
          style={{ height: PREVIEW_DEVICES[device].height }}
          loading="lazy"
        />
      </div>
    </div>
  )
}

/** Shared wording + appearance fields for a pledge / collector page config. */
export function PageConfigFields({
  cfg,
  setCfg,
  headingPlaceholder = 'Would Love Your Support',
  buttonPlaceholder = 'Send my pledge',
}: {
  cfg: PledgePageConfig
  setCfg: React.Dispatch<React.SetStateAction<PledgePageConfig>>
  headingPlaceholder?: string
  buttonPlaceholder?: string
}) {
  const set = (patch: Partial<PledgePageConfig>) => setCfg((c) => ({ ...c, ...patch }))
  return (
    <div className="space-y-5">
      <Field label="Cover photo or video" hint="Upload a photo or short video for your cover. Leave empty to use the default cover.">
        {/* This uploader is always a plain photo backdrop (never a
            pre-designed template with names baked in) — clearing
            coverIsFullTemplate here ensures the guest page overlays the
            couple's live name/date text on top, instead of silently
            hiding it because a previous default/template cover had the
            flag set. */}
        <CoverUploader
          value={cfg.coverImageUrl ?? null}
          onChange={(url) => set({ coverImageUrl: url, coverIsFullTemplate: false })}
        />
      </Field>

      <section className="space-y-4 rounded-2xl border border-black/[0.08] bg-white p-4">
        <h4 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1A1A1A]">
          <PenLine className="h-3.5 w-3.5 text-[#8e57b3]" /> Wording
        </h4>
        <Field label="Heading — second line" hint="Shown under the couple’s names">
          <input
            className={inputClass}
            value={cfg.headingLine2 ?? ''}
            onChange={(e) => set({ headingLine2: e.target.value })}
            placeholder={headingPlaceholder}
          />
        </Field>
        <Field label="Intro">
          <textarea
            rows={3}
            className={inputClass}
            value={cfg.intro ?? ''}
            onChange={(e) => set({ intro: e.target.value })}
          />
        </Field>
        <Field label="Button label">
          <input
            className={inputClass}
            value={cfg.buttonLabel ?? ''}
            onChange={(e) => set({ buttonLabel: e.target.value })}
            placeholder={buttonPlaceholder}
          />
        </Field>
        <Field label="Privacy note" hint="Use {couple} where the couple’s name should appear">
          <textarea
            rows={2}
            className={inputClass}
            value={cfg.privacyNote ?? ''}
            onChange={(e) => set({ privacyNote: e.target.value })}
          />
        </Field>
      </section>

      <section className="space-y-4 rounded-2xl border border-black/[0.08] bg-white p-4">
        <div>
          <h4 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1A1A1A]">
            <ListChecks className="h-3.5 w-3.5 text-[#8e57b3]" /> Questions
          </h4>
          <p className="mt-1 text-xs text-[#1A1A1A]/50">
            Name, WhatsApp, and email are always asked first. Add anything extra below.
          </p>
        </div>
        <BuiltInQuestions />
        <QuestionsEditor questions={cfg.questions ?? []} onChange={(questions) => set({ questions })} />
      </section>
    </div>
  )
}

/** The three fields CollectorForm always asks first — not part of `questions`,
 *  shown here (locked, non-removable) so the couple sees the full list guests
 *  will actually get, not just custom questions layered on top of it. */
const BUILT_IN_FIELDS = [
  { label: 'Your name', required: true },
  { label: 'WhatsApp / mobile', required: false },
  { label: 'Email', required: false },
]

function BuiltInQuestions() {
  return (
    <div className="space-y-2">
      {BUILT_IN_FIELDS.map((field, i) => (
        <div
          key={field.label}
          className="flex items-center gap-2 rounded-xl border border-black/[0.08] bg-black/[0.015] px-3 py-2.5"
        >
          <span className="shrink-0 text-xs font-semibold text-[#1A1A1A]/35">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-[#1A1A1A]/70">
            {field.label}
            {field.required ? <span className="text-[#b97fd0]"> *</span> : null}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-[#1A1A1A]/35">
            <Lock className="h-3 w-3" /> Always asked
          </span>
        </div>
      ))}
    </div>
  )
}

/** Add/edit/remove custom questions for the Contact Collector form. */
function QuestionsEditor({
  questions,
  onChange,
}: {
  questions: CollectorQuestion[]
  onChange: (next: CollectorQuestion[]) => void
}) {
  function addQuestion() {
    onChange([
      ...questions,
      { id: crypto.randomUUID(), prompt: '', kind: 'short_answer', required: false, options: [] },
    ])
  }

  function updateQuestion(id: string, patch: Partial<CollectorQuestion>) {
    onChange(questions.map((q) => (q.id === id ? { ...q, ...patch } : q)))
  }

  function removeQuestion(id: string) {
    onChange(questions.filter((q) => q.id !== id))
  }

  function addOption(questionId: string) {
    onChange(
      questions.map((q) =>
        q.id === questionId
          ? { ...q, options: [...q.options, { id: crypto.randomUUID(), label: '' }] }
          : q,
      ),
    )
  }

  function updateOption(questionId: string, optionId: string, label: string) {
    onChange(
      questions.map((q) =>
        q.id === questionId
          ? { ...q, options: q.options.map((o) => (o.id === optionId ? { ...o, label } : o)) }
          : q,
      ),
    )
  }

  function removeOption(questionId: string, optionId: string) {
    onChange(
      questions.map((q) =>
        q.id === questionId ? { ...q, options: q.options.filter((o) => o.id !== optionId) } : q,
      ),
    )
  }

  return (
    <div className="space-y-3">
      {questions.map((q, i) => (
        <div key={q.id} className="flex items-start gap-2 rounded-xl border border-black/[0.1] p-3">
          <span className="mt-2.5 shrink-0 text-xs font-semibold text-[#1A1A1A]/35">
            {i + 1 + BUILT_IN_FIELDS.length}
          </span>
          <div className="min-w-0 flex-1 space-y-2.5">
            <input
              className={inputClass}
              value={q.prompt}
              onChange={(e) => updateQuestion(q.id, { prompt: e.target.value })}
              placeholder="e.g. Which side of the family are you on?"
            />
            <div className="flex flex-wrap items-center gap-3">
              <select
                className={`${inputClass} w-auto`}
                value={q.kind}
                onChange={(e) => {
                  const kind = e.target.value as CollectorQuestionKind
                  updateQuestion(q.id, {
                    kind,
                    options:
                      kind === 'multiple_choice' && q.options.length === 0
                        ? [
                            { id: crypto.randomUUID(), label: '' },
                            { id: crypto.randomUUID(), label: '' },
                          ]
                        : q.options,
                  })
                }}
              >
                <option value="short_answer">Short answer</option>
                <option value="multiple_choice">Multiple choice</option>
              </select>
              <label className="inline-flex items-center gap-1.5 text-sm text-[#1A1A1A]/70">
                <input
                  type="checkbox"
                  checked={q.required}
                  onChange={(e) => updateQuestion(q.id, { required: e.target.checked })}
                  className="h-4 w-4 rounded border-black/20 accent-[#C9A0DC]"
                />
                Required
              </label>
            </div>

            {q.kind === 'multiple_choice' ? (
              <div className="space-y-1.5 pl-1">
                {q.options.map((opt, oi) => (
                  <div key={opt.id} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-black/20" />
                    <input
                      className={`${inputClass} py-1.5 text-sm`}
                      value={opt.label}
                      onChange={(e) => updateOption(q.id, opt.id, e.target.value)}
                      placeholder={`Option ${oi + 1}`}
                    />
                    <button data-opus-button="control"
                      type="button"
                      onClick={() => removeOption(q.id, opt.id)}
                      aria-label="Remove option"
                      className="shrink-0 text-[#1A1A1A]/35 hover:text-rose-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button data-opus-button="control"
                  type="button"
                  onClick={() => addOption(q.id)}
                  className="text-xs font-medium text-[#8e57b3] hover:underline"
                >
                  + Add option
                </button>
              </div>
            ) : null}
          </div>
          <button data-opus-button="control"
            type="button"
            onClick={() => removeQuestion(q.id)}
            aria-label="Remove question"
            className="shrink-0 rounded-lg p-1.5 text-[#1A1A1A]/40 hover:bg-rose-50 hover:text-rose-500"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button data-opus-button="primary" data-opus-button-size="medium"
        type="button"
        onClick={addQuestion}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-black/[0.18] px-4 py-2.5 text-sm font-medium text-[#1A1A1A]/70 hover:bg-black/[0.02]"
      >
        <Plus className="h-4 w-4" /> Add a question
      </button>
    </div>
  )
}

/** Drag-and-drop cover image uploader (Supabase Storage via uploadPledgeCover). */
export function CoverUploader({
  value,
  onChange,
}: {
  value: string | null
  onChange: (url: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, startUpload] = useTransition()
  const [dragOver, setDragOver] = useState(false)

  function handleFile(file: File | undefined | null) {
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    startUpload(async () => {
      try {
        const url = await uploadPledgeCover(fd)
        onChange(url)
        toast.success('Cover uploaded')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Upload failed')
      }
    })
  }

  if (value) {
    const isVideo = isVideoCoverUrl(value)
    return (
      <div className="space-y-2">
        <div className="relative overflow-hidden rounded-xl border border-black/[0.12]">
          {isVideo ? (
            <video src={value} className="h-32 w-full object-cover" muted loop autoPlay playsInline />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={value} alt="Cover preview" className="h-32 w-full object-cover" />
          )}
          <button data-opus-button="danger" data-opus-button-size="small"
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white hover:bg-black/75"
          >
            <Trash2 className="h-3 w-3" /> Remove
          </button>
        </div>
        <button data-opus-button="control"
          type="button"
          onClick={() => inputRef.current?.click()}
          className="text-xs font-medium text-[#8e57b3] hover:underline"
        >
          {uploading ? 'Uploading…' : 'Replace'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>
    )
  }

  return (
    <>
      <button data-opus-button="neutral" data-opus-button-size="medium"
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          handleFile(e.dataTransfer.files?.[0])
        }}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition',
          dragOver ? 'border-[#C9A0DC] bg-[#F0DFF6]/40' : 'border-black/[0.18] hover:bg-black/[0.02]',
        )}
      >
        {uploading ? (
          <span className="text-sm text-[#1A1A1A]/60">Uploading…</span>
        ) : (
          <>
            <ImageIcon className="h-5 w-5 text-[#1A1A1A]/40" />
            <span className="text-sm font-medium text-[#1A1A1A]/70">Drop an image or video here, or click to upload</span>
            <span className="text-xs text-[#1A1A1A]/40">JPG, PNG, WebP · up to 5MB — or MP4, WebM · up to 25MB</span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </>
  )
}
