'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Eye,
  MessageCircle,
  Plus,
  Star,
  Trash2,
  TrendingUp,
  Upload,
} from 'lucide-react'
import type {
  BusinessContent,
  FeaturePill,
  UpcomingBooking,
  VendorShowcase,
} from '@/lib/cms/business'
import { uploadCmsMedia } from '@/lib/cms/upload-client'
import { cn } from '@/lib/utils'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardBusinessDraft,
  publishBusiness,
  saveBusinessDraft,
} from './actions'

type Props = { initial: BusinessContent; hasDraft: boolean }

const HEADLINE_MAX = 30
const SUBHEAD_MAX = 220

export default function BusinessEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<BusinessContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [openVendorId, setOpenVendorId] = useState<string | null>(initial.vendors[0]?.id ?? null)
  const { bind, unbind } = useEditorActions()

  const setField = <K extends keyof BusinessContent>(key: K, value: BusinessContent[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  // Pills
  const updatePill = (id: string, label: string) =>
    setDraft((d) => ({
      ...d,
      feature_pills: d.feature_pills.map((p) => (p.id === id ? { ...p, label } : p)),
    }))
  const removePill = (id: string) =>
    setDraft((d) => ({ ...d, feature_pills: d.feature_pills.filter((p) => p.id !== id) }))
  const movePill = (id: string, dir: -1 | 1) =>
    setDraft((d) => {
      const idx = d.feature_pills.findIndex((p) => p.id === id)
      const t = idx + dir
      if (idx < 0 || t < 0 || t >= d.feature_pills.length) return d
      const next = [...d.feature_pills]
      ;[next[idx], next[t]] = [next[t], next[idx]]
      return { ...d, feature_pills: next }
    })
  const addPill = () =>
    setDraft((d) => ({
      ...d,
      feature_pills: [
        ...d.feature_pills,
        { id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, label: 'New benefit' },
      ],
    }))

  // Vendors
  const updateVendor = (id: string, patch: Partial<VendorShowcase>) =>
    setDraft((d) => ({
      ...d,
      vendors: d.vendors.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    }))
  const removeVendor = (id: string) =>
    setDraft((d) => ({ ...d, vendors: d.vendors.filter((v) => v.id !== id) }))
  const moveVendor = (id: string, dir: -1 | 1) =>
    setDraft((d) => {
      const idx = d.vendors.findIndex((v) => v.id === id)
      const t = idx + dir
      if (idx < 0 || t < 0 || t >= d.vendors.length) return d
      const next = [...d.vendors]
      ;[next[idx], next[t]] = [next[t], next[idx]]
      return { ...d, vendors: next }
    })
  const addVendor = () => {
    const id = `vendor-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setDraft((d) => ({
      ...d,
      vendors: [
        ...d.vendors,
        {
          id,
          name: 'New Vendor',
          category: 'Category',
          location: 'City',
          avatar_url: '',
          cover_url: '',
          stars: 4.8,
          reviews: 0,
          response: '95%',
          bookings: 0,
          enquiries: 0,
          views: '0',
          upcoming: [],
        },
      ],
    }))
    setOpenVendorId(id)
  }

  // Upcoming bookings (per vendor)
  const updateBooking = (vendorId: string, bookingId: string, patch: Partial<UpcomingBooking>) =>
    setDraft((d) => ({
      ...d,
      vendors: d.vendors.map((v) =>
        v.id === vendorId
          ? { ...v, upcoming: v.upcoming.map((b) => (b.id === bookingId ? { ...b, ...patch } : b)) }
          : v
      ),
    }))
  const removeBooking = (vendorId: string, bookingId: string) =>
    setDraft((d) => ({
      ...d,
      vendors: d.vendors.map((v) =>
        v.id === vendorId ? { ...v, upcoming: v.upcoming.filter((b) => b.id !== bookingId) } : v
      ),
    }))
  const moveBooking = (vendorId: string, bookingId: string, dir: -1 | 1) =>
    setDraft((d) => ({
      ...d,
      vendors: d.vendors.map((v) => {
        if (v.id !== vendorId) return v
        const idx = v.upcoming.findIndex((b) => b.id === bookingId)
        const t = idx + dir
        if (idx < 0 || t < 0 || t >= v.upcoming.length) return v
        const next = [...v.upcoming]
        ;[next[idx], next[t]] = [next[t], next[idx]]
        return { ...v, upcoming: next }
      }),
    }))
  const addBooking = (vendorId: string) =>
    setDraft((d) => ({
      ...d,
      vendors: d.vendors.map((v) =>
        v.id === vendorId
          ? {
              ...v,
              upcoming: [
                ...v.upcoming,
                {
                  id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  name: 'Couple Name',
                  date: 'TBD',
                  image_url: '',
                },
              ],
            }
          : v
      ),
    }))

  const handleSaveDraft = () =>
    startTransition(async () => {
      await saveBusinessDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })
  const handlePublish = () =>
    startTransition(async () => {
      await saveBusinessDraft(draft)
      await publishBusiness()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })
  const handleDiscard = () =>
    startTransition(async () => {
      await discardBusinessDraft()
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

  const uploadFor =
    (cb: (url: string) => void) =>
    (file: File) => {
      startTransition(async () => {
        try {
          const { url } = await uploadCmsMedia(file, 'homepage/business', 'image')
          cb(url)
          setMessage('Image uploaded.')
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err)
          setMessage(`Upload failed: ${detail}`)
        }
      })
    }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div className="space-y-4">
          {/* Section copy */}
          <Card title="Section copy">
            <Field label="Eyebrow">
              <input
                type="text"
                value={draft.eyebrow}
                onChange={(e) => setField('eyebrow', e.target.value)}
                className={inputCls}
              />
            </Field>
            <FieldGroup label="Headline (3 lines — line 3 takes accent color)">
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
            <Field
              label="Subheadline"
              hint={<CharCount value={draft.subheadline} max={SUBHEAD_MAX} />}
            >
              <textarea
                value={draft.subheadline}
                onChange={(e) => setField('subheadline', e.target.value)}
                rows={3}
                className={inputCls}
              />
            </Field>
            <FieldGroup label="CTAs">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Primary label">
                  <input type="text" value={draft.primary_cta_label} onChange={(e) => setField('primary_cta_label', e.target.value)} className={inputCls} />
                </Field>
                <Field label="Primary link">
                  <input type="text" value={draft.primary_cta_href} onChange={(e) => setField('primary_cta_href', e.target.value)} className={inputCls} />
                </Field>
                <Field label="Secondary label">
                  <input type="text" value={draft.secondary_cta_label} onChange={(e) => setField('secondary_cta_label', e.target.value)} className={inputCls} />
                </Field>
                <Field label="Secondary link">
                  <input type="text" value={draft.secondary_cta_href} onChange={(e) => setField('secondary_cta_href', e.target.value)} className={inputCls} />
                </Field>
              </div>
            </FieldGroup>
          </Card>

          {/* Feature pills */}
          <Card title="Feature pills" count={draft.feature_pills.length}>
            <div className="space-y-1.5">
              {draft.feature_pills.map((pill, i) => (
                <div key={pill.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 group border border-transparent hover:border-gray-100">
                  <input
                    type="text"
                    value={pill.label}
                    onChange={(e) => updatePill(pill.id, e.target.value)}
                    className="flex-1 min-w-0 px-2 py-1 bg-transparent border-0 text-sm text-gray-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#C9A0DC] rounded"
                  />
                  <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-gray-900/8 text-gray-700 border border-gray-200 shrink-0">
                    {pill.label || 'Preview'}
                  </span>
                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <IconBtn onClick={() => movePill(pill.id, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp className="w-3.5 h-3.5" /></IconBtn>
                    <IconBtn onClick={() => movePill(pill.id, 1)} disabled={i === draft.feature_pills.length - 1} aria-label="Move down"><ArrowDown className="w-3.5 h-3.5" /></IconBtn>
                    <IconBtn onClick={() => removePill(pill.id)} aria-label="Remove" danger><Trash2 className="w-3.5 h-3.5" /></IconBtn>
                  </div>
                </div>
              ))}
            </div>
            <button data-opus-button="control"
              type="button"
              onClick={addPill}
              className="w-full flex items-center justify-center gap-2 py-2 mt-2 border-2 border-dashed border-gray-200 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add pill
            </button>
          </Card>

          {/* Card chrome labels */}
          <Card title="Vendor card labels">
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ['verified_badge', 'Verified badge'],
                  ['booked_badge', 'Booked badge'],
                  ['upcoming_label', 'Upcoming label'],
                  ['bookings_suffix', '"bookings" suffix'],
                  ['bookings_stat_label', 'Bookings stat'],
                  ['enquiries_stat_label', 'Enquiries stat'],
                  ['views_stat_label', 'Profile views stat'],
                  ['reviews_suffix', '"reviews" suffix'],
                  ['response_suffix', '"response" suffix'],
                ] as const
              ).map(([k, label]) => (
                <Field key={k} label={label}>
                  <input
                    type="text"
                    value={draft[k]}
                    onChange={(e) => setField(k, e.target.value)}
                    className={inputCls}
                  />
                </Field>
              ))}
            </div>
          </Card>

          {/* Vendor showcase */}
          <Card title="Vendor showcase items" count={draft.vendors.length}>
            <div className="space-y-2">
              {draft.vendors.map((v, i) => (
                <VendorAccordion
                  key={v.id}
                  vendor={v}
                  index={i}
                  total={draft.vendors.length}
                  isOpen={openVendorId === v.id}
                  onToggle={() => setOpenVendorId((cur) => (cur === v.id ? null : v.id))}
                  onChange={(patch) => updateVendor(v.id, patch)}
                  onRemove={() => removeVendor(v.id)}
                  onMoveUp={() => moveVendor(v.id, -1)}
                  onMoveDown={() => moveVendor(v.id, 1)}
                  pending={pending}
                  uploadFor={uploadFor}
                  onAddBooking={() => addBooking(v.id)}
                  onUpdateBooking={(bookingId, patch) => updateBooking(v.id, bookingId, patch)}
                  onRemoveBooking={(bookingId) => removeBooking(v.id, bookingId)}
                  onMoveBooking={(bookingId, dir) => moveBooking(v.id, bookingId, dir)}
                />
              ))}
            </div>
            <button data-opus-button="control"
              type="button"
              onClick={addVendor}
              className="w-full flex items-center justify-center gap-2 py-2.5 mt-2 border-2 border-dashed border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add vendor
            </button>
          </Card>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-semibold text-gray-900">Live preview</h3>
            <span className="text-xs text-gray-400">Approximate</span>
          </div>
          <BusinessPreview content={draft} />
        </div>
      </div>
    </div>
  )
}

function VendorAccordion({
  vendor, index, total, isOpen, onToggle, onChange, onRemove, onMoveUp, onMoveDown,
  pending, uploadFor,
  onAddBooking, onUpdateBooking, onRemoveBooking, onMoveBooking,
}: {
  vendor: VendorShowcase
  index: number
  total: number
  isOpen: boolean
  onToggle: () => void
  onChange: (patch: Partial<VendorShowcase>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  pending: boolean
  uploadFor: (cb: (url: string) => void) => (file: File) => void
  onAddBooking: () => void
  onUpdateBooking: (bookingId: string, patch: Partial<UpcomingBooking>) => void
  onRemoveBooking: (bookingId: string) => void
  onMoveBooking: (bookingId: string, dir: -1 | 1) => void
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50/50">
        <button data-opus-button="control" type="button" onClick={onToggle} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
          <span className="text-sm font-semibold text-gray-900 truncate">{vendor.name}</span>
          <span className="text-xs text-gray-400 truncate">· {vendor.category}</span>
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          <IconBtn onClick={onMoveUp} disabled={index === 0} aria-label="Move up"><ArrowUp className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn onClick={onMoveDown} disabled={index === total - 1} aria-label="Move down"><ArrowDown className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn onClick={onRemove} aria-label="Remove" danger><Trash2 className="w-3.5 h-3.5" /></IconBtn>
        </div>
      </div>

      {isOpen && (
        <div className="p-4 space-y-4 border-t border-gray-100">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vendor name"><input type="text" value={vendor.name} onChange={(e) => onChange({ name: e.target.value })} className={inputCls} /></Field>
            <Field label="Category"><input type="text" value={vendor.category} onChange={(e) => onChange({ category: e.target.value })} className={inputCls} /></Field>
            <Field label="Location"><input type="text" value={vendor.location} onChange={(e) => onChange({ location: e.target.value })} className={inputCls} /></Field>
          </div>

          <FieldGroup label="Cover & avatar">
            <div className="grid grid-cols-2 gap-3">
              <ImageField
                label="Cover image"
                value={vendor.cover_url}
                onChange={(v) => onChange({ cover_url: v })}
                onUpload={uploadFor((url) => onChange({ cover_url: url }))}
                pending={pending}
                aspect="aspect-video"
              />
              <ImageField
                label="Avatar"
                value={vendor.avatar_url}
                onChange={(v) => onChange({ avatar_url: v })}
                onUpload={uploadFor((url) => onChange({ avatar_url: url }))}
                pending={pending}
                aspect="aspect-square"
              />
            </div>
          </FieldGroup>

          <FieldGroup label="Reviews & response">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Stars (0-5)">
                <input type="number" step="0.1" min="0" max="5" value={vendor.stars} onChange={(e) => onChange({ stars: parseFloat(e.target.value || '0') })} className={inputCls} />
              </Field>
              <Field label="Reviews count">
                <input type="number" min="0" value={vendor.reviews} onChange={(e) => onChange({ reviews: parseInt(e.target.value || '0', 10) })} className={inputCls} />
              </Field>
              <Field label="Response rate">
                <input type="text" value={vendor.response} onChange={(e) => onChange({ response: e.target.value })} className={inputCls} placeholder="98%" />
              </Field>
            </div>
          </FieldGroup>

          <FieldGroup label="Stats">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Bookings">
                <input type="number" min="0" value={vendor.bookings} onChange={(e) => onChange({ bookings: parseInt(e.target.value || '0', 10) })} className={inputCls} />
              </Field>
              <Field label="Enquiries">
                <input type="number" min="0" value={vendor.enquiries} onChange={(e) => onChange({ enquiries: parseInt(e.target.value || '0', 10) })} className={inputCls} />
              </Field>
              <Field label="Profile views">
                <input type="text" value={vendor.views} onChange={(e) => onChange({ views: e.target.value })} className={inputCls} placeholder="2.4k" />
              </Field>
            </div>
          </FieldGroup>

          <FieldGroup label={`Upcoming bookings (${vendor.upcoming.length})`}>
            <div className="space-y-1.5">
              {vendor.upcoming.map((b, bi) => (
                <BookingRow
                  key={b.id}
                  booking={b}
                  index={bi}
                  total={vendor.upcoming.length}
                  onChange={(patch) => onUpdateBooking(b.id, patch)}
                  onRemove={() => onRemoveBooking(b.id)}
                  onMoveUp={() => onMoveBooking(b.id, -1)}
                  onMoveDown={() => onMoveBooking(b.id, 1)}
                  onUpload={uploadFor((url) => onUpdateBooking(b.id, { image_url: url }))}
                />
              ))}
              <button data-opus-button="control"
                type="button"
                onClick={onAddBooking}
                className="w-full flex items-center justify-center gap-2 py-1.5 border border-dashed border-gray-200 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add booking
              </button>
            </div>
          </FieldGroup>
        </div>
      )}
    </div>
  )
}

function BookingRow({
  booking, index, total, onChange, onRemove, onMoveUp, onMoveDown, onUpload,
}: {
  booking: UpcomingBooking
  index: number
  total: number
  onChange: (patch: Partial<UpcomingBooking>) => void
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
  }, [booking.image_url])

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-100 hover:bg-gray-50 group">
      <button data-opus-button="control"
        type="button"
        onClick={() => fileRef.current?.click()}
        className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 border border-gray-200 shrink-0 relative group/avatar"
        title="Click to upload"
      >
        {booking.image_url && !errored ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={booking.image_url} src={booking.image_url} alt="" onError={() => setErrored(true)} className="w-full h-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[8px] text-gray-400">No img</span>
        )}
        <span className="absolute inset-0 bg-black/40 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center">
          <Upload className="w-3 h-3 text-white" />
        </span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => {
        const f = e.target.files?.[0]; if (f) { onUpload(f); setErrored(false) }
      }} />
      <input
        type="text"
        value={booking.name}
        onChange={(e) => onChange({ name: e.target.value })}
        className="flex-1 min-w-0 px-2 py-1 bg-transparent border-0 text-xs text-gray-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#C9A0DC] rounded"
      />
      <input
        type="text"
        value={booking.date}
        onChange={(e) => onChange({ date: e.target.value })}
        placeholder="Date"
        className="w-28 px-2 py-1 bg-transparent border-0 text-xs text-gray-500 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#C9A0DC] rounded text-right shrink-0"
      />
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <IconBtn onClick={onMoveUp} disabled={index === 0} aria-label="Move up"><ArrowUp className="w-3 h-3" /></IconBtn>
        <IconBtn onClick={onMoveDown} disabled={index === total - 1} aria-label="Move down"><ArrowDown className="w-3 h-3" /></IconBtn>
        <IconBtn onClick={onRemove} aria-label="Remove" danger><Trash2 className="w-3 h-3" /></IconBtn>
      </div>
    </div>
  )
}

function ImageField({
  label, value, onChange, onUpload, pending, aspect = 'aspect-video',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onUpload: (file: File) => void
  pending: boolean
  aspect?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [errored, setErrored] = useState(false)

  // Reset error state when URL changes (e.g. after upload)
  useEffect(() => {
    setErrored(false)
  }, [value])

  return (
    <Field label={label}>
      <div className="space-y-2">
        <div className={cn('rounded-lg overflow-hidden border border-gray-200 bg-gray-100 relative', aspect)}>
          {value && !errored ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={value} src={value} alt="" onError={() => setErrored(true)} className="w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-400">
              {value ? 'Not previewable' : 'No image'}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => { onChange(e.target.value); setErrored(false) }}
            className={cn(inputCls, 'text-xs')}
            placeholder="https://… or /assets/…"
          />
          <button data-opus-button="control"
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="flex items-center gap-1 text-xs font-medium text-gray-700 px-2 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50 shrink-0"
          >
            <Upload className="w-3 h-3" />
          </button>
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => {
            const f = e.target.files?.[0]; if (f) { onUpload(f); setErrored(false) }
          }} />
        </div>
      </div>
    </Field>
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

function BusinessPreview({ content }: { content: BusinessContent }) {
  const [activeIdx, setActiveIdx] = useState(0)
  useEffect(() => {
    if (content.vendors.length === 0) return
    const id = setInterval(() => setActiveIdx((i) => (i + 1) % content.vendors.length), 4500)
    return () => clearInterval(id)
  }, [content.vendors.length])

  const v = content.vendors[Math.min(activeIdx, content.vendors.length - 1)]

  return (
    <div className="bg-[#1A1A1A] rounded-xl p-4 space-y-4">
      <div>
        <span className="text-[#C9A0DC] text-[9px] font-bold uppercase tracking-widest">{content.eyebrow}</span>
        <h2 className="text-xl font-black uppercase tracking-tighter leading-[0.9] mt-1 text-white">
          {content.headline_line_1}<br />
          {content.headline_line_2}<br />
          <span className="text-[#C9A0DC]">{content.headline_line_3}</span>
        </h2>
        <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">{content.subheadline}</p>
        <div className="flex flex-wrap gap-1 mt-2">
          {content.feature_pills.map((p) => (
            <span key={p.id} className="bg-white/8 text-white/70 text-[8px] font-semibold px-2 py-0.5 rounded-full border border-white/10">
              {p.label}
            </span>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <span className="bg-[#C9A0DC] text-[#1A1A1A] text-[9px] font-bold px-3 py-1 rounded-full">{content.primary_cta_label}</span>
          <span className="text-white border border-white/20 text-[9px] font-bold px-3 py-1 rounded-full">{content.secondary_cta_label}</span>
        </div>
      </div>

      {v && (
        <div className="bg-[#111] rounded-xl p-3 space-y-2">
          <div className="bg-[#1E1E1E] rounded-2xl border border-white/8 relative overflow-hidden">
            <div className="relative h-16">
              {v.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.cover_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gray-700" />
              )}
              <div className="absolute top-1 right-1">
                <span className="bg-[#C9A0DC] text-[#1A1A1A] text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase">{content.verified_badge}</span>
              </div>
            </div>
            <div className="px-3 py-2 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-700 border-2 border-[#1E1E1E] -mt-5 shrink-0">
                {v.avatar_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.avatar_url} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black text-white truncate">{v.name}</p>
                <p className="text-[8px] text-white/40">{v.location}</p>
              </div>
              <span className="text-[7px] font-bold text-white/40 bg-white/8 border border-white/10 px-1.5 py-0.5 rounded-full shrink-0">{v.category}</span>
            </div>
            <div className="px-3 pb-2 flex items-center justify-between">
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={8} fill="#F5A623" className="text-[#F5A623]" />
                ))}
                <span className="text-[8px] text-white/40 ml-1">{v.stars} · {v.reviews} {content.reviews_suffix}</span>
              </div>
              <span className="text-[7px] text-white/40">{v.response} {content.response_suffix}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {[
              { icon: <TrendingUp size={10} />, value: v.bookings, label: content.bookings_stat_label },
              { icon: <MessageCircle size={10} />, value: v.enquiries, label: content.enquiries_stat_label },
              { icon: <Eye size={10} />, value: v.views, label: content.views_stat_label },
            ].map((s) => (
              <div key={s.label} className="bg-[#1E1E1E] rounded-lg px-2 py-1.5 text-center border border-white/8">
                <div className="text-white/60 flex justify-center">{s.icon}</div>
                <p className="text-[10px] font-black text-white">{s.value}</p>
                <p className="text-[7px] text-white/30 uppercase tracking-wide">{s.label}</p>
              </div>
            ))}
          </div>

          {v.upcoming.length > 0 && (
            <div className="bg-[#1E1E1E] rounded-lg overflow-hidden border border-white/8">
              <div className="px-2 py-1.5 border-b border-white/5 flex items-center justify-between">
                <p className="text-[8px] font-black text-white uppercase tracking-widest">{content.upcoming_label}</p>
                <span className="text-[7px] text-white font-bold">{v.bookings} {content.bookings_suffix}</span>
              </div>
              {v.upcoming.slice(0, 2).map((b) => (
                <div key={b.id} className="px-2 py-1 flex items-center gap-2 border-b border-white/5 last:border-0">
                  {b.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.image_url} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-gray-700 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[8px] font-bold text-white truncate">{b.name}</p>
                    <p className="text-[7px] text-white/30">{b.date}</p>
                  </div>
                  <span className="text-[7px] font-bold bg-[#C9A0DC] text-[#1A1A1A] px-1.5 py-0.5 rounded-full shrink-0">{content.booked_badge}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-center gap-1 pt-1">
            {content.vendors.map((vendor, i) => (
              <button data-opus-button="primary" data-opus-button-size="medium"
                key={vendor.id}
                onClick={() => setActiveIdx(i)}
                className={cn(
                  'rounded-full transition-all',
                  i === activeIdx ? 'w-3 h-1 bg-[#C9A0DC]' : 'w-1 h-1 bg-white/20'
                )}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
