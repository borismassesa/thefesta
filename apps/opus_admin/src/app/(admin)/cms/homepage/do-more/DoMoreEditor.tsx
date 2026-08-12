'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2, Upload } from 'lucide-react'
import type {
  DoMoreContent,
  GuestDemo,
  GuestStatus,
  WebsiteDemo,
  WebsiteTheme,
} from '@/lib/cms/do-more'
import { WEBSITE_THEME_OPTIONS } from '@/lib/cms/do-more'
import { uploadCmsMedia } from '@/lib/cms/upload-client'
import { cn } from '@/lib/utils'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardDoMoreDraft,
  publishDoMore,
  saveDoMoreDraft,
} from './actions'

type Props = { initial: DoMoreContent; hasDraft: boolean }

const HEADLINE_MAX = 30

export default function DoMoreEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<DoMoreContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [openWebsiteId, setOpenWebsiteId] = useState<string | null>(initial.websites[0]?.id ?? null)
  const { bind, unbind } = useEditorActions()

  const setField = <K extends keyof DoMoreContent>(key: K, value: DoMoreContent[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  // Websites
  const updateWebsite = (id: string, patch: Partial<WebsiteDemo>) =>
    setDraft((d) => ({
      ...d,
      websites: d.websites.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    }))
  const removeWebsite = (id: string) =>
    setDraft((d) => ({ ...d, websites: d.websites.filter((w) => w.id !== id) }))
  const moveWebsite = (id: string, dir: -1 | 1) =>
    setDraft((d) => {
      const idx = d.websites.findIndex((w) => w.id === id)
      const target = idx + dir
      if (idx < 0 || target < 0 || target >= d.websites.length) return d
      const next = [...d.websites]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...d, websites: next }
    })
  const addWebsite = () => {
    const newId = `web-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setDraft((d) => ({
      ...d,
      websites: [
        ...d.websites,
        {
          id: newId,
          url: 'newcouple.opusfesta.com',
          initials: 'A & B',
          name: 'A & B',
          date: 'TBD',
          location: 'Tanzania',
          venue: 'Venue Name',
          venue_city: 'City, Tanzania',
          theme: 'cream' as WebsiteTheme,
        },
      ],
    }))
    setOpenWebsiteId(newId)
  }

  // Guests
  const updateGuest = (id: string, patch: Partial<GuestDemo>) =>
    setDraft((d) => ({
      ...d,
      guests: d.guests.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }))
  const removeGuest = (id: string) =>
    setDraft((d) => ({ ...d, guests: d.guests.filter((g) => g.id !== id) }))
  const moveGuest = (id: string, dir: -1 | 1) =>
    setDraft((d) => {
      const idx = d.guests.findIndex((g) => g.id === id)
      const target = idx + dir
      if (idx < 0 || target < 0 || target >= d.guests.length) return d
      const next = [...d.guests]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...d, guests: next }
    })
  const addGuest = () =>
    setDraft((d) => ({
      ...d,
      guests: [
        ...d.guests,
        {
          id: `g-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: 'New Guest',
          image_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80',
          status: 'Pending' as GuestStatus,
        },
      ],
    }))

  const handleSaveDraft = () =>
    startTransition(async () => {
      await saveDoMoreDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })
  const handlePublish = () =>
    startTransition(async () => {
      await saveDoMoreDraft(draft)
      await publishDoMore()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })
  const handleDiscard = () =>
    startTransition(async () => {
      await discardDoMoreDraft()
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
            <FieldGroup label="Headline (3 lines)">
              {(['headline_line_1', 'headline_line_2', 'headline_line_3'] as const).map((k, i) => (
                <Field
                  key={k}
                  label={`Line ${i + 1}`}
                  hint={<CharCount value={draft[k]} max={HEADLINE_MAX} />}
                >
                  <input
                    type="text"
                    value={draft[k]}
                    onChange={(e) => setField(k, e.target.value)}
                    className={inputCls}
                  />
                </Field>
              ))}
            </FieldGroup>
            <Field label="Side description">
              <textarea
                value={draft.side_description}
                onChange={(e) => setField('side_description', e.target.value)}
                rows={3}
                className={inputCls}
              />
            </Field>
            <FieldGroup label="Section CTA">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Label">
                  <input
                    type="text"
                    value={draft.cta_label}
                    onChange={(e) => setField('cta_label', e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Link">
                  <input
                    type="text"
                    value={draft.cta_href}
                    onChange={(e) => setField('cta_href', e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>
            </FieldGroup>
          </Card>

          {/* Websites card */}
          <Card title="Wedding websites card" count={draft.websites.length}>
            <Field label="Card title">
              <input
                type="text"
                value={draft.websites_title}
                onChange={(e) => setField('websites_title', e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Card description">
              <textarea
                value={draft.websites_description}
                onChange={(e) => setField('websites_description', e.target.value)}
                rows={2}
                className={inputCls}
              />
            </Field>
            <FieldGroup label="Card CTA">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Label">
                  <input
                    type="text"
                    value={draft.websites_cta}
                    onChange={(e) => setField('websites_cta', e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Link">
                  <input
                    type="text"
                    value={draft.websites_cta_href}
                    onChange={(e) => setField('websites_cta_href', e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>
            </FieldGroup>

            <div className="space-y-2 pt-2">
              <p className="text-xs font-semibold text-gray-600">Demo websites</p>
              {draft.websites.map((w, i) => (
                <WebsiteAccordion
                  key={w.id}
                  website={w}
                  index={i}
                  total={draft.websites.length}
                  isOpen={openWebsiteId === w.id}
                  onToggle={() => setOpenWebsiteId((cur) => (cur === w.id ? null : w.id))}
                  onChange={(patch) => updateWebsite(w.id, patch)}
                  onRemove={() => removeWebsite(w.id)}
                  onMoveUp={() => moveWebsite(w.id, -1)}
                  onMoveDown={() => moveWebsite(w.id, 1)}
                />
              ))}
              <button data-opus-button="control"
                type="button"
                onClick={addWebsite}
                className="w-full flex items-center justify-center gap-2 py-2 mt-2 border-2 border-dashed border-gray-200 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add demo website
              </button>
            </div>
          </Card>

          {/* Guests card */}
          <Card title="Guest list card" count={draft.guests.length}>
            <Field label="Card title">
              <input
                type="text"
                value={draft.guests_title}
                onChange={(e) => setField('guests_title', e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Card description">
              <textarea
                value={draft.guests_description}
                onChange={(e) => setField('guests_description', e.target.value)}
                rows={2}
                className={inputCls}
              />
            </Field>
            <FieldGroup label="Card CTA">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Label">
                  <input
                    type="text"
                    value={draft.guests_cta}
                    onChange={(e) => setField('guests_cta', e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Link">
                  <input
                    type="text"
                    value={draft.guests_cta_href}
                    onChange={(e) => setField('guests_cta_href', e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>
            </FieldGroup>

            <FieldGroup label="Stat counts">
              <div className="grid grid-cols-4 gap-2">
                {(['guests_total', 'guests_confirmed', 'guests_pending', 'guests_declined'] as const).map((k) => (
                  <Field key={k} label={k.replace('guests_', '')}>
                    <input
                      type="number"
                      value={draft[k]}
                      onChange={(e) => setField(k, parseInt(e.target.value || '0', 10))}
                      className={inputCls}
                    />
                  </Field>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {(['guests_label_invited', 'guests_label_confirmed', 'guests_label_pending', 'guests_label_declined'] as const).map((k) => (
                  <Field key={k} label={`${k.split('_').slice(-1)[0]} label`}>
                    <input
                      type="text"
                      value={draft[k]}
                      onChange={(e) => setField(k, e.target.value)}
                      className={cn(inputCls, 'text-xs')}
                    />
                  </Field>
                ))}
              </div>
            </FieldGroup>

            <div className="space-y-2 pt-2">
              <p className="text-xs font-semibold text-gray-600">Sample guests (first 5 shown in preview)</p>
              {draft.guests.map((g, i) => (
                <GuestRow
                  key={g.id}
                  guest={g}
                  index={i}
                  total={draft.guests.length}
                  onChange={(patch) => updateGuest(g.id, patch)}
                  onRemove={() => removeGuest(g.id)}
                  onMoveUp={() => moveGuest(g.id, -1)}
                  onMoveDown={() => moveGuest(g.id, 1)}
                  onUpload={(file) => {
                    startTransition(async () => {
                      try {
                        const { url } = await uploadCmsMedia(file, 'homepage/do-more', 'image')
                        updateGuest(g.id, { image_url: url })
                        setMessage('Avatar uploaded.')
                      } catch (err) {
                        const detail = err instanceof Error ? err.message : String(err)
                        setMessage(`Upload failed: ${detail}`)
                      }
                    })
                  }}
                />
              ))}
              <button data-opus-button="control"
                type="button"
                onClick={addGuest}
                className="w-full flex items-center justify-center gap-2 py-2 mt-2 border-2 border-dashed border-gray-200 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add sample guest
              </button>
            </div>
          </Card>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-semibold text-gray-900">Live preview</h3>
            <span className="text-xs text-gray-400">Approximate</span>
          </div>
          <DoMorePreview content={draft} />
        </div>
      </div>
    </div>
  )
}

function WebsiteAccordion({
  website, index, total, isOpen, onToggle, onChange, onRemove, onMoveUp, onMoveDown,
}: {
  website: WebsiteDemo
  index: number
  total: number
  isOpen: boolean
  onToggle: () => void
  onChange: (patch: Partial<WebsiteDemo>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50/50">
        <button data-opus-button="control" type="button" onClick={onToggle} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
          <span className="text-sm font-semibold text-gray-900 truncate">{website.name}</span>
          <span className="text-xs text-gray-400 truncate">· {website.theme}</span>
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          <IconBtn onClick={onMoveUp} disabled={index === 0} aria-label="Move up"><ArrowUp className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn onClick={onMoveDown} disabled={index === total - 1} aria-label="Move down"><ArrowDown className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn onClick={onRemove} aria-label="Remove" danger><Trash2 className="w-3.5 h-3.5" /></IconBtn>
        </div>
      </div>
      {isOpen && (
        <div className="p-3 space-y-3 border-t border-gray-100">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Couple name"><input type="text" value={website.name} onChange={(e) => onChange({ name: e.target.value })} className={inputCls} /></Field>
            <Field label="Initials"><input type="text" value={website.initials} onChange={(e) => onChange({ initials: e.target.value })} className={inputCls} /></Field>
            <Field label="URL"><input type="text" value={website.url} onChange={(e) => onChange({ url: e.target.value })} className={inputCls} /></Field>
            <Field label="Date"><input type="text" value={website.date} onChange={(e) => onChange({ date: e.target.value })} className={inputCls} /></Field>
            <Field label="Location (full)"><input type="text" value={website.location} onChange={(e) => onChange({ location: e.target.value })} className={inputCls} /></Field>
            <Field label="Venue"><input type="text" value={website.venue} onChange={(e) => onChange({ venue: e.target.value })} className={inputCls} /></Field>
            <Field label="Venue city"><input type="text" value={website.venue_city} onChange={(e) => onChange({ venue_city: e.target.value })} className={inputCls} /></Field>
            <Field label="Countdown label"><input type="text" value={website.countdown_label ?? ''} onChange={(e) => onChange({ countdown_label: e.target.value })} className={inputCls} placeholder="Days to go" /></Field>
          </div>
          <Field label="Theme">
            <div className="grid grid-cols-3 gap-2">
              {WEBSITE_THEME_OPTIONS.map((t) => (
                <button data-opus-button="neutral" data-opus-button-size="small"
                  key={t.key}
                  type="button"
                  onClick={() => onChange({ theme: t.key })}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors',
                    website.theme === t.key
                      ? 'border-[#C9A0DC] bg-[#F0DFF6] text-[#7E5896]'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  )}
                >
                  <span
                    className="w-5 h-5 rounded border border-gray-200 flex items-center justify-center text-[8px] font-bold shrink-0"
                    style={{ background: t.swatchBg, color: t.swatchText }}
                  >
                    Aa
                  </span>
                  {t.label}
                </button>
              ))}
            </div>
          </Field>
        </div>
      )}
    </div>
  )
}

function GuestRow({
  guest, index, total, onChange, onRemove, onMoveUp, onMoveDown, onUpload,
}: {
  guest: GuestDemo
  index: number
  total: number
  onChange: (patch: Partial<GuestDemo>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onUpload: (file: File) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [errored, setErrored] = useState(false)

  // Reset error state when URL changes (e.g. after upload)
  useEffect(() => {
    setErrored(false)
  }, [guest.image_url])

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-100 hover:bg-gray-50 group">
      <button data-opus-button="control"
        type="button"
        onClick={() => fileRef.current?.click()}
        className="w-9 h-9 rounded-full overflow-hidden bg-gray-100 border border-gray-200 shrink-0 relative group/avatar"
        title="Click to upload new avatar"
      >
        {guest.image_url && !errored ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={guest.image_url} src={guest.image_url} alt="" onError={() => setErrored(true)} className="w-full h-full object-cover" />
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
          if (f) { onUpload(f); setErrored(false) }
        }}
      />
      <input
        type="text"
        value={guest.name}
        onChange={(e) => onChange({ name: e.target.value })}
        className="flex-1 min-w-0 px-2 py-1.5 bg-transparent border-0 text-sm text-gray-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#C9A0DC] rounded"
      />
      <select
        value={guest.status}
        onChange={(e) => onChange({ status: e.target.value as GuestStatus })}
        className={cn(inputCls, 'w-auto text-xs py-1 pr-6 shrink-0')}
      >
        <option value="Confirmed">Confirmed</option>
        <option value="Pending">Pending</option>
        <option value="Declined">Declined</option>
      </select>
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <IconBtn onClick={onMoveUp} disabled={index === 0} aria-label="Move up"><ArrowUp className="w-3.5 h-3.5" /></IconBtn>
        <IconBtn onClick={onMoveDown} disabled={index === total - 1} aria-label="Move down"><ArrowDown className="w-3.5 h-3.5" /></IconBtn>
        <IconBtn onClick={onRemove} aria-label="Remove" danger><Trash2 className="w-3.5 h-3.5" /></IconBtn>
      </div>
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

function CharCount({ value, max }: { value: string; max: number }) {
  const len = (value ?? '').length
  const over = len > max
  const near = !over && len > max * 0.85
  return (
    <span className={cn('tabular-nums font-medium', over ? 'text-red-500' : near ? 'text-amber-600' : 'text-gray-400')}>
      {len}/{max}
    </span>
  )
}

const inputCls =
  'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all'

function DoMorePreview({ content }: { content: DoMoreContent }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-black uppercase tracking-tighter leading-[0.9] text-[#1A1A1A]">
          {content.headline_line_1}<br />
          {content.headline_line_2}<br />
          {content.headline_line_3}
        </h2>
        <p className="text-xs text-gray-500 mt-2">{content.side_description}</p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="bg-white border border-gray-100 rounded-xl p-3">
          <h4 className="text-sm font-black mb-1">{content.websites_title}</h4>
          <p className="text-[11px] text-gray-500 mb-2">{content.websites_description}</p>
          <div className="flex gap-2 overflow-hidden">
            {content.websites.slice(0, 3).map((w) => (
              <div key={w.id} className="flex-1 min-w-0 rounded border border-gray-200 px-2 py-1 text-[10px]">
                <p className="font-bold truncate">{w.name}</p>
                <p className="text-gray-400 truncate">{w.theme}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#F2F2F0] rounded-xl p-3">
          <h4 className="text-sm font-black mb-1">{content.guests_title}</h4>
          <p className="text-[11px] text-gray-500 mb-3">{content.guests_description}</p>
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            {[
              { label: content.guests_label_invited, value: content.guests_total },
              { label: content.guests_label_confirmed, value: content.guests_confirmed },
              { label: content.guests_label_pending, value: content.guests_pending },
              { label: content.guests_label_declined, value: content.guests_declined },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded p-2 text-center">
                <p className="text-sm font-black text-[#1A1A1A]">{s.value}</p>
                <p className="text-[8px] text-gray-400 uppercase tracking-wider">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            {content.guests.slice(0, 3).map((g) => (
              <div key={g.id} className="bg-white rounded px-2 py-1 flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.image_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                <p className="text-[10px] font-bold text-[#1A1A1A] flex-1 truncate">{g.name}</p>
                <span
                  className={cn(
                    'text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                    g.status === 'Confirmed' ? 'bg-[#C9A0DC] text-[#1A1A1A]' :
                    g.status === 'Pending' ? 'bg-orange-100 text-orange-500' :
                    'bg-red-100 text-red-500'
                  )}
                >
                  {g.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
