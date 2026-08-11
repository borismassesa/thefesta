'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Star, Trash2, Upload } from 'lucide-react'
import type {
  TestimonialBg,
  TestimonialItem,
  TestimonialRole,
  TestimonialsContent,
} from '@/lib/cms/vendors-portal-testimonials'
import { uploadCmsMedia } from '@/lib/cms/upload-client'
import { cn } from '@/lib/utils'
import { BilingualField } from '@/components/cms/BilingualField'
import { LOCALES, LOCALE_LABELS, resolveLocalized, type Locale } from '@/lib/cms/localized'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardTestimonialsDraft,
  publishTestimonials,
  saveTestimonialsDraft,
} from './actions'

type Props = { initial: TestimonialsContent; hasDraft: boolean }

const HEADLINE_MAX = 30
const QUOTE_MAX = 240

export default function TestimonialsEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<TestimonialsContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [openItemId, setOpenItemId] = useState<string | null>(initial.items[0]?.id ?? null)
  const [previewLocale, setPreviewLocale] = useState<Locale>('en')
  const { bind, unbind } = useEditorActions()

  const setField = <K extends keyof TestimonialsContent>(key: K, value: TestimonialsContent[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const updateItem = (id: string, patch: Partial<TestimonialItem>) =>
    setDraft((d) => ({
      ...d,
      items: d.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }))

  const removeItem = (id: string) =>
    setDraft((d) => ({ ...d, items: d.items.filter((it) => it.id !== id) }))

  const moveItem = (id: string, dir: -1 | 1) =>
    setDraft((d) => {
      const idx = d.items.findIndex((it) => it.id === id)
      const t = idx + dir
      if (idx < 0 || t < 0 || t >= d.items.length) return d
      const next = [...d.items]
      ;[next[idx], next[t]] = [next[t], next[idx]]
      return { ...d, items: next }
    })

  const addItem = () => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const nextBg: TestimonialBg = draft.items.length % 2 === 0 ? 'dark' : 'accent'
    setDraft((d) => ({
      ...d,
      items: [
        ...d.items,
        {
          id,
          name: 'New Person',
          role: 'Couple' as TestimonialRole,
          company: 'A & B',
          city: 'City',
          stars: 5,
          quote: 'Their feedback about OpusFesta…',
          image_url: '',
          bg: nextBg,
        },
      ],
    }))
    setOpenItemId(id)
  }

  const handleSaveDraft = () =>
    startTransition(async () => {
      await saveTestimonialsDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })
  const handlePublish = () =>
    startTransition(async () => {
      await saveTestimonialsDraft(draft)
      await publishTestimonials()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })
  const handleDiscard = () =>
    startTransition(async () => {
      await discardTestimonialsDraft()
      setDraft(initial)
      setHasDraft(false)
      setMessage('Draft discarded.')
    })

  useEffect(() => {
    bind({
      hasDraft, pending, message,
      onSaveDraft: handleSaveDraft, onPublish: handlePublish, onDiscard: handleDiscard,
    })
    return () => unbind()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDraft, pending, message, draft])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div className="space-y-4">
          {/* Section header */}
          <Card title="Section header">
            <FieldGroup label="Headline (2 lines)">
              <BilingualField
                label="Line 1"
                value={draft.headline_line_1}
                onChange={(v) => setField('headline_line_1', v)}
                max={HEADLINE_MAX}
              />
              <BilingualField
                label="Line 2"
                value={draft.headline_line_2}
                onChange={(v) => setField('headline_line_2', v)}
                max={HEADLINE_MAX}
              />
            </FieldGroup>
          </Card>

          {/* Testimonial items */}
          <Card title="Testimonials" count={draft.items.length}>
            <div className="space-y-2">
              {draft.items.map((item, i) => (
                <ItemAccordion
                  key={item.id}
                  item={item}
                  index={i}
                  total={draft.items.length}
                  isOpen={openItemId === item.id}
                  onToggle={() => setOpenItemId((cur) => (cur === item.id ? null : item.id))}
                  onChange={(patch) => updateItem(item.id, patch)}
                  onRemove={() => removeItem(item.id)}
                  onMoveUp={() => moveItem(item.id, -1)}
                  onMoveDown={() => moveItem(item.id, 1)}
                  onUpload={(file) => {
                    startTransition(async () => {
                      try {
                        const { url } = await uploadCmsMedia(file, 'vendors-portal/testimonials', 'image')
                        updateItem(item.id, { image_url: url })
                        setMessage('Avatar uploaded.')
                      } catch (err) {
                        const detail = err instanceof Error ? err.message : String(err)
                        setMessage(`Upload failed: ${detail}`)
                      }
                    })
                  }}
                />
              ))}
            </div>
            <button data-opus-button="control"
              type="button"
              onClick={addItem}
              className="w-full flex items-center justify-center gap-2 py-2.5 mt-2 border-2 border-dashed border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add testimonial
            </button>
          </Card>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-semibold text-gray-900">Live preview</h3>
            <div className="inline-flex items-center rounded-full border border-gray-200 p-0.5 text-[11px] font-semibold">
              {LOCALES.map((l) => (
                <button data-opus-button="control"
                  key={l}
                  type="button"
                  onClick={() => setPreviewLocale(l)}
                  aria-pressed={previewLocale === l}
                  className={cn(
                    'rounded-full px-2.5 py-0.5 transition-colors',
                    previewLocale === l ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
                  )}
                >
                  {LOCALE_LABELS[l]}
                </button>
              ))}
            </div>
          </div>
          <TestimonialsPreview content={draft} locale={previewLocale} />
        </div>
      </div>
    </div>
  )
}

function ItemAccordion({
  item, index, total, isOpen, onToggle, onChange, onRemove, onMoveUp, onMoveDown, onUpload,
}: {
  item: TestimonialItem
  index: number
  total: number
  isOpen: boolean
  onToggle: () => void
  onChange: (patch: Partial<TestimonialItem>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onUpload: (file: File) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    setErrored(false)
  }, [item.image_url])

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50/50">
        <button data-opus-button="control"
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 border border-gray-200 shrink-0 relative group/avatar"
          title="Click to upload avatar"
        >
          {item.image_url && !errored ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={item.image_url} src={item.image_url} alt="" onError={() => setErrored(true)} className="w-full h-full object-cover" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-[8px] text-gray-400">No img</span>
          )}
          <span className="absolute inset-0 bg-black/40 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center">
            <Upload className="w-3 h-3 text-white" />
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onUpload(f)
          }}
        />
        <button data-opus-button="control" type="button" onClick={onToggle} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
          <span className="text-sm font-semibold text-gray-900 truncate">{item.name}</span>
          <span className="text-xs text-gray-400 truncate">· {item.role} · {item.company}</span>
        </button>
        <span
          className={cn(
            'shrink-0 w-2.5 h-2.5 rounded-full border border-white shadow-sm',
            item.bg === 'accent' ? 'bg-[#C9A0DC]' : 'bg-[#1A1A1A]'
          )}
          title={item.bg === 'accent' ? 'Accent (lavender) card' : 'Dark card'}
        />
        <div className="flex items-center gap-0.5 shrink-0">
          <IconBtn onClick={onMoveUp} disabled={index === 0} aria-label="Move up"><ArrowUp className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn onClick={onMoveDown} disabled={index === total - 1} aria-label="Move down"><ArrowDown className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn onClick={onRemove} aria-label="Remove" danger><Trash2 className="w-3.5 h-3.5" /></IconBtn>
        </div>
      </div>

      {isOpen && (
        <div className="p-4 space-y-3 border-t border-gray-100">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Person name">
              <input type="text" value={item.name} onChange={(e) => onChange({ name: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Role">
              <select
                value={item.role}
                onChange={(e) => onChange({ role: e.target.value as TestimonialRole })}
                className={inputCls}
              >
                <option value="Couple">Couple</option>
                <option value="Vendor">Vendor</option>
              </select>
            </Field>
            <Field label="Company / couple">
              <input type="text" value={item.company} onChange={(e) => onChange({ company: e.target.value })} className={inputCls} />
            </Field>
            <Field label="City">
              <input type="text" value={item.city} onChange={(e) => onChange({ city: e.target.value })} className={inputCls} />
            </Field>
          </div>

          <Field label="Stars (1–5)">
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button data-opus-button="control"
                  key={n}
                  type="button"
                  onClick={() => onChange({ stars: n })}
                  aria-label={`${n} stars`}
                  className="p-0.5"
                >
                  <Star
                    size={20}
                    fill={n <= item.stars ? '#F5A623' : 'transparent'}
                    className={n <= item.stars ? 'text-[#F5A623]' : 'text-gray-300'}
                  />
                </button>
              ))}
              <span className="text-xs text-gray-400 ml-2">{item.stars}/5</span>
            </div>
          </Field>

          <BilingualField
            label="Quote"
            value={item.quote}
            onChange={(v) => onChange({ quote: v })}
            multiline
            max={QUOTE_MAX}
          />

          <Field label="Card background">
            <div className="grid grid-cols-2 gap-2">
              {(['dark', 'accent'] as TestimonialBg[]).map((bg) => (
                <button data-opus-button="neutral" data-opus-button-size="small"
                  key={bg}
                  type="button"
                  onClick={() => onChange({ bg })}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors',
                    item.bg === bg
                      ? 'border-[#C9A0DC] bg-[#F0DFF6] text-[#7E5896]'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  )}
                >
                  <span
                    className="w-5 h-5 rounded border border-gray-200"
                    style={{ background: bg === 'accent' ? '#C9A0DC' : '#1A1A1A' }}
                  />
                  {bg === 'accent' ? 'Accent (lavender)' : 'Dark'}
                </button>
              ))}
            </div>
          </Field>
        </div>
      )}
    </div>
  )
}

function IconBtn({
  onClick, disabled, danger, children, ...rest
}: {
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: React.ReactNode
} & React.AriaAttributes) {
  return (
    <button data-opus-button="control"
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'p-1 rounded transition-colors',
        danger
          ? 'text-gray-400 hover:text-red-600 hover:bg-red-50'
          : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
        'disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400'
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

function Card({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3>
        {typeof count === 'number' && (
          <span className="text-xs text-gray-400 tabular-nums">{count} item{count === 1 ? '' : 's'}</span>
        )}
      </div>
      {children}
    </div>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="border border-gray-200 rounded-lg p-3 pt-2 space-y-3">
      <legend className="px-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</legend>
      {children}
    </fieldset>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs font-semibold text-gray-600">{label}</span>
        {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

const inputCls =
  'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all'

function TestimonialsPreview({ content, locale }: { content: TestimonialsContent; locale: Locale }) {
  const [activeIdx, setActiveIdx] = useState(0)
  useEffect(() => {
    if (content.items.length === 0) return
    const id = setInterval(() => setActiveIdx((i) => (i + 1) % content.items.length), 4500)
    return () => clearInterval(id)
  }, [content.items.length])

  if (content.items.length === 0) {
    return (
      <div className="text-xs text-gray-400 py-8 text-center">
        Add at least one testimonial to preview the carousel.
      </div>
    )
  }

  const t = content.items[Math.min(activeIdx, content.items.length - 1)]
  const isAccent = t.bg === 'accent'
  const quote = resolveLocalized(t.quote, locale)

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-black uppercase tracking-tighter leading-[0.9] text-[#1A1A1A]">
        {resolveLocalized(content.headline_line_1, locale)}<br />{resolveLocalized(content.headline_line_2, locale)}
      </h2>

      <div
        className={cn(
          'rounded-2xl p-5 space-y-4',
          isAccent ? 'bg-[#C9A0DC]' : 'bg-[#1A1A1A]'
        )}
      >
        <div className="flex gap-1">
          {Array.from({ length: 5 }).map((_, s) => (
            <Star
              key={s}
              size={14}
              fill={s < t.stars ? '#F5A623' : 'transparent'}
              className={s < t.stars ? 'text-[#F5A623]' : isAccent ? 'text-[#1A1A1A]/20' : 'text-white/20'}
            />
          ))}
        </div>
        <p className={cn('text-sm font-semibold leading-snug', isAccent ? 'text-[#1A1A1A]' : 'text-white')}>
          &ldquo;{quote}&rdquo;
        </p>
        <div
          className={cn(
            'flex items-center gap-3 pt-3 border-t',
            isAccent ? 'border-[#1A1A1A]/15' : 'border-white/10'
          )}
        >
          {t.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.image_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className={cn('text-xs font-bold truncate', isAccent ? 'text-[#1A1A1A]' : 'text-white')}>{t.company}</p>
            <p className={cn('text-[10px] truncate', isAccent ? 'text-[#1A1A1A]/50' : 'text-white/40')}>{t.city}</p>
          </div>
          <span
            className={cn(
              'shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold',
              isAccent ? 'bg-[#1A1A1A] text-[#C9A0DC]' : 'bg-[#C9A0DC] text-[#1A1A1A]'
            )}
          >
            {t.role}
          </span>
        </div>
      </div>

      <div className="flex justify-center gap-1 pt-1">
        {content.items.map((it, i) => (
          <button data-opus-button="primary" data-opus-button-size="medium"
            key={it.id}
            onClick={() => setActiveIdx(i)}
            className={cn(
              'rounded-full transition-all',
              i === activeIdx ? 'w-4 h-1.5 bg-[#1A1A1A]' : 'w-1.5 h-1.5 bg-gray-300'
            )}
          />
        ))}
      </div>
    </div>
  )
}
