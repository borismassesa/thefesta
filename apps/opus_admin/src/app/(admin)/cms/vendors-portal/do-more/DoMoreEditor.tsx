'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2, Upload } from 'lucide-react'
import type {
  DoMoreContent,
  GuestDemo,
  GuestStatus,
  WebsiteDemo,
  WebsiteTheme,
} from '@/lib/cms/vendors-portal-do-more'
import { WEBSITE_THEME_OPTIONS } from '@/lib/cms/vendors-portal-do-more'
import { uploadCmsMedia } from '@/lib/cms/upload-client'
import { cn } from '@/lib/utils'
import { BilingualField } from '@/components/cms/BilingualField'
import { LOCALES, LOCALE_LABELS, resolveLocalized, type Locale } from '@/lib/cms/localized'
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
  const [previewLocale, setPreviewLocale] = useState<Locale>('en')
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
                <BilingualField
                  key={k}
                  label={`Line ${i + 1}`}
                  value={draft[k]}
                  onChange={(v) => setField(k, v)}
                  max={HEADLINE_MAX}
                />
              ))}
            </FieldGroup>
            <BilingualField
              label="Side description"
              value={draft.side_description}
              onChange={(v) => setField('side_description', v)}
              multiline
            />
            <FieldGroup label="Section CTA">
              <div className="grid grid-cols-2 gap-3">
                <BilingualField
                  label="Label"
                  value={draft.cta_label}
                  onChange={(v) => setField('cta_label', v)}
                />
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
            <BilingualField
              label="Card title"
              value={draft.websites_title}
              onChange={(v) => setField('websites_title', v)}
            />
            <BilingualField
              label="Card description"
              value={draft.websites_description}
              onChange={(v) => setField('websites_description', v)}
              multiline
              rows={2}
            />
            <FieldGroup label="Card CTA">
              <div className="grid grid-cols-2 gap-3">
                <BilingualField
                  label="Label"
                  value={draft.websites_cta}
                  onChange={(v) => setField('websites_cta', v)}
                />
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
            <BilingualField
              label="Card title"
              value={draft.guests_title}
              onChange={(v) => setField('guests_title', v)}
            />
            <BilingualField
              label="Card description"
              value={draft.guests_description}
              onChange={(v) => setField('guests_description', v)}
              multiline
              rows={2}
            />
            <FieldGroup label="Card CTA">
              <div className="grid grid-cols-2 gap-3">
                <BilingualField
                  label="Label"
                  value={draft.guests_cta}
                  onChange={(v) => setField('guests_cta', v)}
                />
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
              <div className="grid grid-cols-2 gap-3">
                {(['guests_label_invited', 'guests_label_confirmed', 'guests_label_pending', 'guests_label_declined'] as const).map((k) => (
                  <BilingualField
                    key={k}
                    label={`${k.split('_').slice(-1)[0]} label`}
                    value={draft[k]}
                    onChange={(v) => setField(k, v)}
                  />
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
                        const { url } = await uploadCmsMedia(file, 'vendors-portal/do-more', 'image')
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
          <DoMorePreview content={draft} locale={previewLocale} />
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
          <span className="text-sm font-semibold text-gray-900 truncate">{resolveLocalized(website.name, 'en') || 'Untitled'}</span>
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
            <BilingualField label="Couple name" value={website.name} onChange={(v) => onChange({ name: v })} />
            <BilingualField label="Initials" value={website.initials} onChange={(v) => onChange({ initials: v })} />
            <Field label="URL"><input type="text" value={website.url} onChange={(e) => onChange({ url: e.target.value })} className={inputCls} /></Field>
            <BilingualField label="Date" value={website.date} onChange={(v) => onChange({ date: v })} />
            <BilingualField label="Location (full)" value={website.location} onChange={(v) => onChange({ location: v })} />
            <BilingualField label="Venue" value={website.venue} onChange={(v) => onChange({ venue: v })} />
            <BilingualField label="Venue city" value={website.venue_city} onChange={(v) => onChange({ venue_city: v })} />
            <BilingualField label="Countdown label" value={website.countdown_label} onChange={(v) => onChange({ countdown_label: v })} placeholder="Days to go" />
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
    <div className="px-2 py-2 rounded-lg border border-gray-100 hover:bg-gray-50 group space-y-2">
      <div className="flex items-center gap-2">
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
        <span className="flex-1 min-w-0 text-xs font-semibold text-gray-600">Guest {index + 1}</span>
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
      <BilingualField label="Name" value={guest.name} onChange={(v) => onChange({ name: v })} />
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

function DoMorePreview({ content, locale }: { content: DoMoreContent; locale: Locale }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-black uppercase tracking-tighter leading-[0.9] text-[#1A1A1A]">
          {resolveLocalized(content.headline_line_1, locale)}<br />
          {resolveLocalized(content.headline_line_2, locale)}<br />
          {resolveLocalized(content.headline_line_3, locale)}
        </h2>
        <p className="text-xs text-gray-500 mt-2">{resolveLocalized(content.side_description, locale)}</p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="bg-white border border-gray-100 rounded-xl p-3">
          <h4 className="text-sm font-black mb-1">{resolveLocalized(content.websites_title, locale)}</h4>
          <p className="text-[11px] text-gray-500 mb-2">{resolveLocalized(content.websites_description, locale)}</p>
          <div className="flex gap-2 overflow-hidden">
            {content.websites.slice(0, 3).map((w) => (
              <div key={w.id} className="flex-1 min-w-0 rounded border border-gray-200 px-2 py-1 text-[10px]">
                <p className="font-bold truncate">{resolveLocalized(w.name, locale)}</p>
                <p className="text-gray-400 truncate">{w.theme}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#F2F2F0] rounded-xl p-3">
          <h4 className="text-sm font-black mb-1">{resolveLocalized(content.guests_title, locale)}</h4>
          <p className="text-[11px] text-gray-500 mb-3">{resolveLocalized(content.guests_description, locale)}</p>
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            {[
              { label: resolveLocalized(content.guests_label_invited, locale), value: content.guests_total },
              { label: resolveLocalized(content.guests_label_confirmed, locale), value: content.guests_confirmed },
              { label: resolveLocalized(content.guests_label_pending, locale), value: content.guests_pending },
              { label: resolveLocalized(content.guests_label_declined, locale), value: content.guests_declined },
            ].map((s, i) => (
              <div key={i} className="bg-white rounded p-2 text-center">
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
                <p className="text-[10px] font-bold text-[#1A1A1A] flex-1 truncate">{resolveLocalized(g.name, locale)}</p>
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
