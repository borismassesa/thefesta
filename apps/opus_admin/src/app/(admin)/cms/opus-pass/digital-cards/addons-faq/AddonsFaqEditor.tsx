'use client'

import { useEffect, useState, useTransition } from 'react'
import { Check, ChevronsDownUp, ChevronsUpDown, GripVertical, Plus, Trash2 } from 'lucide-react'
import { CollapsibleCard } from '@/components/cms/CollapsibleCard'
import {
  ADDON_TIER_OPTIONS,
  OPUS_PASS_PRODUCT_ADDONS_FAQ_FALLBACK,
  newAddOn,
  productAddonsFaqRandomId,
  type AddOn,
  type AddOnPricingMode,
  type FaqItem,
  type ProductAddonsFaqContent,
} from '@/lib/cms/opus-pass-product-addons-faq'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardOpusPassAddonsFaqDraft,
  publishOpusPassAddonsFaq,
  saveOpusPassAddonsFaqDraft,
} from './actions'

type Props = { initial: ProductAddonsFaqContent; hasDraft: boolean }

const inputCls =
  'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all'
const textareaCls = `${inputCls} min-h-[88px] resize-y`

const PRICING_MODES: { value: AddOnPricingMode; label: string }[] = [
  { value: 'flat', label: 'Flat fee per event' },
  { value: 'per_unit', label: 'Per unit, with a quantity stepper' },
  { value: 'quote', label: 'Priced on a call (Contact us CTA)' },
]

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</span>
      {children}
    </label>
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

export default function AddonsFaqEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<ProductAddonsFaqContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { bind, unbind } = useEditorActions()

  const [openAddons, setOpenAddons] = useState<Set<number>>(() => new Set([0]))
  const [openFaq, setOpenFaq] = useState<Set<number>>(() => new Set([0]))
  const toggle = (set: Set<number>, setter: (s: Set<number>) => void, idx: number) => {
    const next = new Set(set)
    next.has(idx) ? next.delete(idx) : next.add(idx)
    setter(next)
  }

  const setField = <K extends keyof ProductAddonsFaqContent>(key: K, value: ProductAddonsFaqContent[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  // ── Add-ons ──
  const setAddOn = (idx: number, patch: Partial<AddOn>) =>
    setDraft((d) => ({ ...d, addons: d.addons.map((a, i) => (i === idx ? { ...a, ...patch } : a)) }))

  const toggleAddOnTier = (idx: number, tierId: string) =>
    setDraft((d) => ({
      ...d,
      addons: d.addons.map((a, i) => {
        if (i !== idx) return a
        const has = a.includedInTierIds.includes(tierId)
        return { ...a, includedInTierIds: has ? a.includedInTierIds.filter((t) => t !== tierId) : [...a.includedInTierIds, tierId] }
      }),
    }))

  const addAddOn = () => setDraft((d) => ({ ...d, addons: [...d.addons, newAddOn()] }))
  const removeAddOn = (idx: number) => setDraft((d) => ({ ...d, addons: d.addons.filter((_, i) => i !== idx) }))
  const moveAddOn = (idx: number, delta: number) =>
    setDraft((d) => {
      const next = [...d.addons]
      const t = idx + delta
      if (t < 0 || t >= next.length) return d
      ;[next[idx], next[t]] = [next[t], next[idx]]
      return { ...d, addons: next }
    })

  // ── FAQ items ──
  const setFaqItem = (idx: number, patch: Partial<FaqItem>) =>
    setDraft((d) => ({ ...d, faq: d.faq.map((f, i) => (i === idx ? { ...f, ...patch } : f)) }))

  const addFaqItem = () =>
    setDraft((d) => ({
      ...d,
      faq: [
        ...d.faq,
        {
          id: productAddonsFaqRandomId('faq'),
          title: 'New question', title_sw: '',
          body: '', body_sw: '',
          link_label: '', link_label_sw: '', link_href: '',
        },
      ],
    }))

  const removeFaqItem = (idx: number) =>
    setDraft((d) => ({ ...d, faq: d.faq.filter((_, i) => i !== idx) }))

  const moveFaqItem = (idx: number, delta: number) =>
    setDraft((d) => {
      const next = [...d.faq]
      const t = idx + delta
      if (t < 0 || t >= next.length) return d
      ;[next[idx], next[t]] = [next[t], next[idx]]
      return { ...d, faq: next }
    })

  // ── Save / publish / discard ──
  const runAction = (job: () => Promise<void>) =>
    startTransition(async () => {
      setError(null)
      try {
        await job()
      } catch (err) {
        setError(`That didn't go through: ${err instanceof Error ? err.message : String(err)}`)
        setMessage(null)
      }
    })

  const handleSaveDraft = () =>
    runAction(async () => {
      await saveOpusPassAddonsFaqDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })
  const handlePublish = () =>
    runAction(async () => {
      await saveOpusPassAddonsFaqDraft(draft)
      await publishOpusPassAddonsFaq()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })
  const handleDiscard = () =>
    runAction(async () => {
      await discardOpusPassAddonsFaqDraft()
      setDraft(initial)
      setHasDraft(false)
      setMessage('Draft discarded.')
    })

  useEffect(() => {
    bind({ hasDraft, pending, message, error, onSaveDraft: handleSaveDraft, onPublish: handlePublish, onDiscard: handleDiscard })
    return () => unbind()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDraft, pending, message, error, draft])

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start pb-12">
      {/* ── Editor ── */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-gray-900">Optional add-ons & FAQ</h3>
          <button
            type="button"
            onClick={() => { setDraft(OPUS_PASS_PRODUCT_ADDONS_FAQ_FALLBACK); setMessage('Reset to defaults — save the draft to keep this.') }}
            className="text-[11px] font-medium text-gray-500 underline underline-offset-2 hover:text-gray-800"
          >
            Reset to defaults
          </button>
        </div>

        <FieldGroup label="Section labels">
          <div className="grid grid-cols-2 gap-3">
            <Field label="'Optional add-ons' heading (EN)"><input className={inputCls} value={draft.addonsHeading} onChange={(e) => setField('addonsHeading', e.target.value)} /></Field>
            <Field label="Heading (SW)"><input className={inputCls} value={draft.addonsHeading_sw} onChange={(e) => setField('addonsHeading_sw', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="'Description' label (EN)"><input className={inputCls} value={draft.descriptionLabel} onChange={(e) => setField('descriptionLabel', e.target.value)} /></Field>
            <Field label="Label (SW)"><input className={inputCls} value={draft.descriptionLabel_sw} onChange={(e) => setField('descriptionLabel_sw', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="'Included' pill (EN)"><input className={inputCls} value={draft.includedPillLabel} onChange={(e) => setField('includedPillLabel', e.target.value)} /></Field>
            <Field label="Pill (SW)"><input className={inputCls} value={draft.includedPillLabel_sw} onChange={(e) => setField('includedPillLabel_sw', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="'Read More' (EN)"><input className={inputCls} value={draft.readMoreLabel} onChange={(e) => setField('readMoreLabel', e.target.value)} /></Field>
            <Field label="(SW)"><input className={inputCls} value={draft.readMoreLabel_sw} onChange={(e) => setField('readMoreLabel_sw', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="'Read Less' (EN)"><input className={inputCls} value={draft.readLessLabel} onChange={(e) => setField('readLessLabel', e.target.value)} /></Field>
            <Field label="(SW)"><input className={inputCls} value={draft.readLessLabel_sw} onChange={(e) => setField('readLessLabel_sw', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="'Explore similar designs' heading (EN)"><input className={inputCls} value={draft.similarDesignsHeading} onChange={(e) => setField('similarDesignsHeading', e.target.value)} /></Field>
            <Field label="Heading (SW)"><input className={inputCls} value={draft.similarDesignsHeading_sw} onChange={(e) => setField('similarDesignsHeading_sw', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="'From' price prefix (EN)"><input className={inputCls} value={draft.priceFromLabel} onChange={(e) => setField('priceFromLabel', e.target.value)} /></Field>
            <Field label="(SW)"><input className={inputCls} value={draft.priceFromLabel_sw} onChange={(e) => setField('priceFromLabel_sw', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="'How many?' stepper label (EN)"><input className={inputCls} value={draft.howManyLabel} onChange={(e) => setField('howManyLabel', e.target.value)} /></Field>
            <Field label="(SW)"><input className={inputCls} value={draft.howManyLabel_sw} onChange={(e) => setField('howManyLabel_sw', e.target.value)} /></Field>
          </div>
          <Field label="Phone number every 'priced on a call' add-on's CTA dials">
            <input className={inputCls} value={draft.quotePhoneNumber} onChange={(e) => setField('quotePhoneNumber', e.target.value)} placeholder="+255 799 202 171" />
          </Field>
        </FieldGroup>

        {/* ── Add-ons ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Add-ons ({draft.addons.length})</p>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setOpenAddons(new Set(draft.addons.map((_, i) => i)))} className="flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100">
                <ChevronsUpDown className="w-3 h-3" /> Expand all
              </button>
              <button type="button" onClick={() => setOpenAddons(new Set())} className="flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100">
                <ChevronsDownUp className="w-3 h-3" /> Collapse all
              </button>
            </div>
          </div>

          {draft.addons.map((a, idx) => (
            <CollapsibleCard
              key={a.id}
              index={idx}
              title={a.title || 'New add-on'}
              subtitle={
                a.pricingMode === 'flat' ? `TZS ${a.flatFee.toLocaleString('en-US')} ${a.flatFeeLabel}`
                  : a.pricingMode === 'per_unit' ? `TZS ${a.unitPrice.toLocaleString('en-US')} ${a.unitLabel}`
                  : 'Priced on a call'
              }
              collapsed={!openAddons.has(idx)}
              onToggle={() => toggle(openAddons, setOpenAddons, idx)}
              onMoveUp={() => moveAddOn(idx, -1)}
              onMoveDown={() => moveAddOn(idx, 1)}
              onRemove={() => removeAddOn(idx)}
              disableMoveUp={idx === 0}
              disableMoveDown={idx === draft.addons.length - 1}
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="Title (EN)"><input className={inputCls} value={a.title} onChange={(e) => setAddOn(idx, { title: e.target.value })} /></Field>
                <Field label="Title (SW)"><input className={inputCls} value={a.title_sw} onChange={(e) => setAddOn(idx, { title_sw: e.target.value })} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Description (EN)"><textarea className={textareaCls} value={a.description} onChange={(e) => setAddOn(idx, { description: e.target.value })} /></Field>
                <Field label="Description (SW)"><textarea className={textareaCls} value={a.description_sw} onChange={(e) => setAddOn(idx, { description_sw: e.target.value })} /></Field>
              </div>

              <Field label="Pricing">
                <select
                  className={inputCls}
                  value={a.pricingMode}
                  onChange={(e) => setAddOn(idx, { pricingMode: e.target.value as AddOnPricingMode })}
                >
                  {PRICING_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </Field>

              {a.pricingMode === 'flat' && (
                <FieldGroup label="Flat fee">
                  <Field label="Fee (TZS)">
                    <input type="number" min={0} className={inputCls} value={Number.isFinite(a.flatFee) ? a.flatFee : 0} onChange={(e) => setAddOn(idx, { flatFee: Number(e.target.value) || 0 })} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Fee suffix (EN) — e.g. 'flat fee per event'"><input className={inputCls} value={a.flatFeeLabel} onChange={(e) => setAddOn(idx, { flatFeeLabel: e.target.value })} /></Field>
                    <Field label="Fee suffix (SW)"><input className={inputCls} value={a.flatFeeLabel_sw} onChange={(e) => setAddOn(idx, { flatFeeLabel_sw: e.target.value })} /></Field>
                  </div>
                </FieldGroup>
              )}

              {a.pricingMode === 'per_unit' && (
                <FieldGroup label="Per-unit pricing & quantity stepper">
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Unit price (TZS)">
                      <input type="number" min={0} className={inputCls} value={Number.isFinite(a.unitPrice) ? a.unitPrice : 0} onChange={(e) => setAddOn(idx, { unitPrice: Number(e.target.value) || 0 })} />
                    </Field>
                    <Field label="Minimum qty">
                      <input type="number" min={1} className={inputCls} value={Number.isFinite(a.minQty) ? a.minQty : 1} onChange={(e) => setAddOn(idx, { minQty: Number(e.target.value) || 1 })} />
                    </Field>
                    <Field label="Step size">
                      <input type="number" min={1} className={inputCls} value={Number.isFinite(a.qtyStep) ? a.qtyStep : 1} onChange={(e) => setAddOn(idx, { qtyStep: Number(e.target.value) || 1 })} />
                    </Field>
                  </div>
                  <Field label="Default quantity when first checked">
                    <input type="number" min={a.minQty} className={inputCls} value={Number.isFinite(a.defaultQty) ? a.defaultQty : a.minQty} onChange={(e) => setAddOn(idx, { defaultQty: Number(e.target.value) || a.minQty })} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Unit suffix (EN) — e.g. 'per print'"><input className={inputCls} value={a.unitLabel} onChange={(e) => setAddOn(idx, { unitLabel: e.target.value })} /></Field>
                    <Field label="Unit suffix (SW)"><input className={inputCls} value={a.unitLabel_sw} onChange={(e) => setAddOn(idx, { unitLabel_sw: e.target.value })} /></Field>
                  </div>
                </FieldGroup>
              )}

              {a.pricingMode === 'quote' && (
                <FieldGroup label="Priced on a call">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Price note (EN) — e.g. 'Price upon consultation call'"><input className={inputCls} value={a.quoteLabel} onChange={(e) => setAddOn(idx, { quoteLabel: e.target.value })} /></Field>
                    <Field label="Price note (SW)"><input className={inputCls} value={a.quoteLabel_sw} onChange={(e) => setAddOn(idx, { quoteLabel_sw: e.target.value })} /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="CTA button text (EN)"><input className={inputCls} value={a.quoteCtaLabel} onChange={(e) => setAddOn(idx, { quoteCtaLabel: e.target.value })} /></Field>
                    <Field label="CTA button text (SW)"><input className={inputCls} value={a.quoteCtaLabel_sw} onChange={(e) => setAddOn(idx, { quoteCtaLabel_sw: e.target.value })} /></Field>
                  </div>
                  <p className="text-[11px] text-gray-400">Tapping the CTA opens WhatsApp to OpusFesta's number with a prefilled message naming this add-on and the card — no separate link to configure.</p>
                </FieldGroup>
              )}

              <FieldGroup label="Bundle into package tiers (shown as an &quot;Included&quot; card there instead)">
                <div className="flex flex-wrap gap-3">
                  {ADDON_TIER_OPTIONS.map((t) => (
                    <label key={t.id} className="flex items-center gap-1.5 text-sm text-gray-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={a.includedInTierIds.includes(t.id)}
                        onChange={() => toggleAddOnTier(idx, t.id)}
                        className="h-4 w-4 rounded text-[#C9A0DC] focus:ring-[#C9A0DC]"
                      />
                      {t.label}
                    </label>
                  ))}
                </div>
                {a.includedInTierIds.length > 0 && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Included title (EN) — blank = reuse title above"><input className={inputCls} value={a.includedTitle} onChange={(e) => setAddOn(idx, { includedTitle: e.target.value })} /></Field>
                      <Field label="Included title (SW)"><input className={inputCls} value={a.includedTitle_sw} onChange={(e) => setAddOn(idx, { includedTitle_sw: e.target.value })} /></Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Included description (EN) — blank = reuse description above"><textarea className={textareaCls} value={a.includedDescription} onChange={(e) => setAddOn(idx, { includedDescription: e.target.value })} /></Field>
                      <Field label="Included description (SW)"><textarea className={textareaCls} value={a.includedDescription_sw} onChange={(e) => setAddOn(idx, { includedDescription_sw: e.target.value })} /></Field>
                    </div>
                  </>
                )}
              </FieldGroup>

              {a.pricingMode === 'flat' && (
                <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={a.showGuestTicketPreview}
                    onChange={(e) => setAddOn(idx, { showGuestTicketPreview: e.target.checked })}
                    className="h-4 w-4 rounded text-[#C9A0DC] focus:ring-[#C9A0DC]"
                  />
                  Show the sample OpusPass guest ticket once this add-on is checked
                </label>
              )}

              <p className="text-[11px] text-gray-400">Internal key: <code className="font-mono">{a.id}</code></p>
            </CollapsibleCard>
          ))}
          <button type="button" onClick={addAddOn} className="flex items-center gap-2 text-sm font-medium text-[#7E5896] hover:text-[#5d3a78] px-3 py-2 rounded-lg border border-dashed border-[#C9A0DC] hover:bg-[#F0DFF6]">
            <Plus className="w-4 h-4" /> Add add-on
          </button>
        </div>

        {/* ── FAQ ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">FAQ accordion ({draft.faq.length})</p>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setOpenFaq(new Set(draft.faq.map((_, i) => i)))} className="flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100">
                <ChevronsUpDown className="w-3 h-3" /> Expand all
              </button>
              <button type="button" onClick={() => setOpenFaq(new Set())} className="flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100">
                <ChevronsDownUp className="w-3 h-3" /> Collapse all
              </button>
            </div>
          </div>

          {draft.faq.map((item, idx) => (
            <CollapsibleCard
              key={item.id}
              index={idx}
              title={item.title || 'New question'}
              subtitle={item.link_href ? `Links to ${item.link_href}` : undefined}
              collapsed={!openFaq.has(idx)}
              onToggle={() => toggle(openFaq, setOpenFaq, idx)}
              onMoveUp={() => moveFaqItem(idx, -1)}
              onMoveDown={() => moveFaqItem(idx, 1)}
              onRemove={() => removeFaqItem(idx)}
              disableMoveUp={idx === 0}
              disableMoveDown={idx === draft.faq.length - 1}
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="Question (EN)"><input className={inputCls} value={item.title} onChange={(e) => setFaqItem(idx, { title: e.target.value })} /></Field>
                <Field label="Question (SW)"><input className={inputCls} value={item.title_sw} onChange={(e) => setFaqItem(idx, { title_sw: e.target.value })} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Answer (EN)"><textarea className={textareaCls} value={item.body} onChange={(e) => setFaqItem(idx, { body: e.target.value })} /></Field>
                <Field label="Answer (SW)"><textarea className={textareaCls} value={item.body_sw} onChange={(e) => setFaqItem(idx, { body_sw: e.target.value })} /></Field>
              </div>
              <p className="text-[11px] text-gray-400">
                To embed a link inline (like the Cancellation policy answer), write <code className="font-mono">{'{link}'}</code> where the link text should appear.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Link text (EN, optional)"><input className={inputCls} value={item.link_label} onChange={(e) => setFaqItem(idx, { link_label: e.target.value })} /></Field>
                <Field label="Link text (SW, optional)"><input className={inputCls} value={item.link_label_sw} onChange={(e) => setFaqItem(idx, { link_label_sw: e.target.value })} /></Field>
              </div>
              <Field label="Link URL (optional, e.g. /cancellation)">
                <input className={inputCls} value={item.link_href} onChange={(e) => setFaqItem(idx, { link_href: e.target.value })} />
              </Field>
              <p className="text-[11px] text-gray-400">Internal key: <code className="font-mono">{item.id}</code></p>
            </CollapsibleCard>
          ))}
          <button type="button" onClick={addFaqItem} className="flex items-center gap-2 text-sm font-medium text-[#7E5896] hover:text-[#5d3a78] px-3 py-2 rounded-lg border border-dashed border-[#C9A0DC] hover:bg-[#F0DFF6]">
            <Plus className="w-4 h-4" /> Add question
          </button>
        </div>
      </div>

      {/* ── Preview ── */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] xl:sticky xl:top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-semibold text-gray-900">Live preview</h3>
          <span className="text-xs text-gray-400">Approximate</span>
        </div>
        <AddonsFaqPreview content={draft} />
      </div>
    </div>
  )
}

// Mirrors the public renderer's renderFaqBody (apps/opus_pass ProductDetailClient.tsx):
// splices the link into the {link} placeholder when present, but if link_href
// is set and the admin edited the placeholder out of the body, appends the
// link at the end rather than silently dropping it — so the preview never
// shows a false "the link disappeared" state that production wouldn't also show.
function renderFaqPreviewBody(item: FaqItem): React.ReactNode {
  if (!item.link_href) return item.body
  const link = <span className="font-semibold text-gray-900 underline underline-offset-2">{item.link_label}</span>
  const parts = item.body.split('{link}')
  if (parts.length === 1) {
    return (
      <>
        {item.body}{' '}
        {link}
      </>
    )
  }
  return parts.map((chunk, i, arr) => (
    <span key={i}>
      {chunk}
      {i < arr.length - 1 && link}
    </span>
  ))
}

function AddonPreviewCard({ addOn, priceFromLabel }: { addOn: AddOn; priceFromLabel: string }) {
  if (addOn.includedInTierIds.length > 0) {
    return (
      <div className="rounded-md border border-[#CDEBA6] bg-[#F4FBE9] p-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[#5C6B4D] text-white"><Check size={11} strokeWidth={3} /></span>
          <p className="text-[13px] font-bold text-gray-900">{addOn.includedTitle || addOn.title || 'Add-on'}</p>
          <span className="rounded-full bg-[#9FE870] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#1A1A1A]">Included</span>
        </div>
        <p className="mt-1 text-[11px] text-gray-600 leading-relaxed">{addOn.includedDescription || addOn.description}</p>
        <p className="mt-1 text-[10px] text-gray-400">on: {addOn.includedInTierIds.join(', ')}</p>
      </div>
    )
  }
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <p className="text-[13px] font-bold text-gray-900">{addOn.title || 'New add-on'}</p>
      <p className="mt-1 text-[11px] text-gray-600 leading-relaxed">{addOn.description}</p>
      {addOn.pricingMode === 'flat' && (
        <p className="mt-1.5 text-[11px] font-bold text-gray-900">TZS {addOn.flatFee.toLocaleString('en-US')} {addOn.flatFeeLabel}</p>
      )}
      {addOn.pricingMode === 'per_unit' && (
        <p className="mt-1.5 text-[11px] font-bold text-gray-900">{priceFromLabel} TZS {addOn.unitPrice.toLocaleString('en-US')} {addOn.unitLabel}</p>
      )}
      {addOn.pricingMode === 'quote' && (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[11px] font-bold text-gray-900">{addOn.quoteLabel}</span>
          <span className="rounded-full border border-[#1A1A1A] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#1A1A1A]">{addOn.quoteCtaLabel}</span>
        </div>
      )}
    </div>
  )
}

function AddonsFaqPreview({ content }: { content: ProductAddonsFaqContent }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[13px] font-bold text-gray-900 mb-2">{content.addonsHeading || 'Optional add-ons'}</p>
        <div className="space-y-2">
          {content.addons.map((a) => (
            <AddonPreviewCard key={a.id} addOn={a} priceFromLabel={content.priceFromLabel} />
          ))}
        </div>
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">FAQ</p>
        <div className="divide-y divide-gray-200 border-t border-b border-gray-200">
          {content.faq.map((f) => (
            <div key={f.id} className="py-2.5">
              <p className="text-[13px] font-medium text-gray-900 flex items-center gap-1.5"><GripVertical className="w-3 h-3 text-gray-300" />{f.title || 'Question'}</p>
              <p className="mt-1 text-[11px] text-gray-600 leading-relaxed pl-[18px]">
                {renderFaqPreviewBody(f)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
