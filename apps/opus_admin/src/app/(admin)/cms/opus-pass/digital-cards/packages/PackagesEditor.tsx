'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  Award, Check, ChevronsDownUp, ChevronsUpDown, Crown, Diamond, Flame, Gem, GripVertical,
  Heart, PartyPopper, Plus, Sparkles, Star, Trash2, Zap, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CollapsibleCard } from '@/components/cms/CollapsibleCard'
import {
  OPUS_PASS_PACKAGES_FALLBACK,
  TIER_BADGE_ICONS,
  TIER_BADGE_TONES,
  packagesRandomId,
  type OpusPassPackagesContent,
  type PackageAddon,
  type PackageBullet,
  type PackageTier,
  type TierBadgeIcon,
  type TierBadgeTone,
} from '@/lib/cms/opus-pass-packages'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardOpusPassPackagesDraft,
  publishOpusPassPackages,
  saveOpusPassPackagesDraft,
} from './actions'

type Props = { initial: OpusPassPackagesContent; hasDraft: boolean }

const inputCls =
  'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all'

// Every badge icon key → its real lucide glyph (null = no icon). Used by both
// the visual icon picker and the previews so they show the actual icon.
const BADGE_ICON: Record<TierBadgeIcon, LucideIcon | null> = {
  none: null,
  sparkles: Sparkles,
  star: Star,
  diamond: Diamond,
  crown: Crown,
  gem: Gem,
  heart: Heart,
  award: Award,
  zap: Zap,
  flame: Flame,
  party: PartyPopper,
}

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

export default function PackagesEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<OpusPassPackagesContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { bind, unbind } = useEditorActions()

  const [openTiers, setOpenTiers] = useState<Set<number>>(() => new Set([0]))

  const toggle = (set: Set<number>, setter: (s: Set<number>) => void, idx: number) => {
    const next = new Set(set)
    next.has(idx) ? next.delete(idx) : next.add(idx)
    setter(next)
  }

  const setField = <K extends keyof OpusPassPackagesContent>(key: K, value: OpusPassPackagesContent[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  // ── Tiers ──
  const setTier = (idx: number, patch: Partial<PackageTier>) =>
    setDraft((d) => ({ ...d, tiers: d.tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t)) }))

  const setFeatured = (idx: number) =>
    setDraft((d) => ({ ...d, tiers: d.tiers.map((t, i) => ({ ...t, featured: i === idx })) }))

  const addTier = () =>
    setDraft((d) => ({
      ...d,
      tiers: [
        ...d.tiers,
        {
          id: packagesRandomId('tier'),
          name: 'New tier', name_sw: '', featured: false, price_per_guest: 0,
          best_for: '', best_for_sw: '',
          badge_label: '', badge_label_sw: '', badge_icon: 'none' as TierBadgeIcon, badge_tone: 'slate' as TierBadgeTone,
          includes: [],
        },
      ],
    }))

  const removeTier = (idx: number) =>
    setDraft((d) => ({ ...d, tiers: d.tiers.filter((_, i) => i !== idx) }))

  const moveTier = (idx: number, delta: number) =>
    setDraft((d) => {
      const next = [...d.tiers]
      const t = idx + delta
      if (t < 0 || t >= next.length) return d
      ;[next[idx], next[t]] = [next[t], next[idx]]
      return { ...d, tiers: next }
    })

  // ── Per-tier bullets ──
  const updateBullets = (tierIdx: number, fn: (b: PackageBullet[]) => PackageBullet[]) =>
    setDraft((d) => ({ ...d, tiers: d.tiers.map((t, i) => (i === tierIdx ? { ...t, includes: fn(t.includes) } : t)) }))

  const setBullet = (tierIdx: number, bIdx: number, patch: Partial<PackageBullet>) =>
    updateBullets(tierIdx, (bs) => bs.map((b, i) => (i === bIdx ? { ...b, ...patch } : b)))

  const addBullet = (tierIdx: number) =>
    updateBullets(tierIdx, (bs) => [...bs, { id: packagesRandomId('b'), label: '', label_sw: '', note: '', note_sw: '' }])

  const removeBullet = (tierIdx: number, bIdx: number) =>
    updateBullets(tierIdx, (bs) => bs.filter((_, i) => i !== bIdx))

  const moveBullet = (tierIdx: number, bIdx: number, delta: number) =>
    updateBullets(tierIdx, (bs) => {
      const next = [...bs]
      const t = bIdx + delta
      if (t < 0 || t >= next.length) return bs
      ;[next[bIdx], next[t]] = [next[t], next[bIdx]]
      return next
    })

  // ── Add-ons (content-level) ──
  const setAddon = (idx: number, patch: Partial<PackageAddon>) =>
    setDraft((d) => ({ ...d, addons: d.addons.map((a, i) => (i === idx ? { ...a, ...patch } : a)) }))
  const addAddon = () =>
    setDraft((d) => ({ ...d, addons: [...d.addons, { id: packagesRandomId('a'), label: '', label_sw: '' }] }))
  const removeAddon = (idx: number) =>
    setDraft((d) => ({ ...d, addons: d.addons.filter((_, i) => i !== idx) }))

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
      await saveOpusPassPackagesDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })
  const handlePublish = () =>
    runAction(async () => {
      await saveOpusPassPackagesDraft(draft)
      await publishOpusPassPackages()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })
  const handleDiscard = () =>
    runAction(async () => {
      await discardOpusPassPackagesDraft()
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
          <h3 className="text-[15px] font-semibold text-gray-900">Packages & pricing</h3>
          <button
            type="button"
            onClick={() => { setDraft(OPUS_PASS_PACKAGES_FALLBACK); setMessage('Reset to defaults — save the draft to keep this.') }}
            className="text-[11px] font-medium text-gray-500 underline underline-offset-2 hover:text-gray-800"
          >
            Reset to defaults
          </button>
        </div>

        <FieldGroup label="Section text">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Heading (EN)"><input className={inputCls} value={draft.heading} onChange={(e) => setField('heading', e.target.value)} /></Field>
            <Field label="Heading (SW)"><input className={inputCls} value={draft.heading_sw} onChange={(e) => setField('heading_sw', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Subheading (EN)"><input className={inputCls} value={draft.subheading} onChange={(e) => setField('subheading', e.target.value)} /></Field>
            <Field label="Subheading (SW)"><input className={inputCls} value={draft.subheading_sw} onChange={(e) => setField('subheading_sw', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="'per guest' price suffix (EN)"><input className={inputCls} value={draft.perGuestLabel} onChange={(e) => setField('perGuestLabel', e.target.value)} /></Field>
            <Field label="(SW)"><input className={inputCls} value={draft.perGuestLabel_sw} onChange={(e) => setField('perGuestLabel_sw', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="'per design' price suffix (EN)"><input className={inputCls} value={draft.perDesignLabel} onChange={(e) => setField('perDesignLabel', e.target.value)} /></Field>
            <Field label="(SW)"><input className={inputCls} value={draft.perDesignLabel_sw} onChange={(e) => setField('perDesignLabel_sw', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="'From' price-anchor prefix (EN)"><input className={inputCls} value={draft.fromLabel} onChange={(e) => setField('fromLabel', e.target.value)} /></Field>
            <Field label="(SW)"><input className={inputCls} value={draft.fromLabel_sw} onChange={(e) => setField('fromLabel_sw', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Card-count stepper label (EN)"><input className={inputCls} value={draft.cardsCountLabel} onChange={(e) => setField('cardsCountLabel', e.target.value)} /></Field>
            <Field label="(SW)"><input className={inputCls} value={draft.cardsCountLabel_sw} onChange={(e) => setField('cardsCountLabel_sw', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Minimum-guests line (EN) — use {count} as a placeholder"><input className={inputCls} value={draft.minGuestsTemplate} onChange={(e) => setField('minGuestsTemplate', e.target.value)} /></Field>
            <Field label="(SW)"><input className={inputCls} value={draft.minGuestsTemplate_sw} onChange={(e) => setField('minGuestsTemplate_sw', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="'Package includes' suffix (EN)"><input className={inputCls} value={draft.includesSuffixLabel} onChange={(e) => setField('includesSuffixLabel', e.target.value)} /></Field>
            <Field label="(SW)"><input className={inputCls} value={draft.includesSuffixLabel_sw} onChange={(e) => setField('includesSuffixLabel_sw', e.target.value)} /></Field>
          </div>
        </FieldGroup>

        {/* ── Tiers ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Tiers ({draft.tiers.length})</p>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setOpenTiers(new Set(draft.tiers.map((_, i) => i)))} className="flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100">
                <ChevronsUpDown className="w-3 h-3" /> Expand all
              </button>
              <button type="button" onClick={() => setOpenTiers(new Set())} className="flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100">
                <ChevronsDownUp className="w-3 h-3" /> Collapse all
              </button>
            </div>
          </div>

          {draft.tiers.map((tier, idx) => (
            <CollapsibleCard
              key={tier.id}
              index={idx}
              title={tier.name || 'New tier'}
              subtitle={`TZS ${tier.price_per_guest.toLocaleString('en-US')} / guest${tier.featured ? ' · highlighted' : ''}`}
              collapsed={!openTiers.has(idx)}
              onToggle={() => toggle(openTiers, setOpenTiers, idx)}
              onMoveUp={() => moveTier(idx, -1)}
              onMoveDown={() => moveTier(idx, 1)}
              onRemove={() => removeTier(idx)}
              disableMoveUp={idx === 0}
              disableMoveDown={idx === draft.tiers.length - 1}
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name (EN)"><input className={inputCls} value={tier.name} onChange={(e) => setTier(idx, { name: e.target.value })} /></Field>
                <Field label="Name (SW)"><input className={inputCls} value={tier.name_sw} onChange={(e) => setTier(idx, { name_sw: e.target.value })} /></Field>
              </div>
              <Field label="Price per guest (TZS)">
                <input type="number" min={0} className={inputCls} value={Number.isFinite(tier.price_per_guest) ? tier.price_per_guest : 0} onChange={(e) => setTier(idx, { price_per_guest: Number(e.target.value) || 0 })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Best for (EN)"><input className={inputCls} value={tier.best_for} onChange={(e) => setTier(idx, { best_for: e.target.value })} /></Field>
                <Field label="Best for (SW)"><input className={inputCls} value={tier.best_for_sw} onChange={(e) => setTier(idx, { best_for_sw: e.target.value })} /></Field>
              </div>

              {/* Badge pill */}
              <FieldGroup label="Badge pill (the label above the tier card)">
                <div className="flex items-center justify-center pb-1">
                  <BadgePreview label={tier.badge_label} icon={tier.badge_icon} tone={tier.badge_tone} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Badge text (EN) — blank = no pill"><input className={inputCls} value={tier.badge_label} placeholder="e.g. Most popular" onChange={(e) => setTier(idx, { badge_label: e.target.value })} /></Field>
                  <Field label="Badge text (SW)"><input className={inputCls} value={tier.badge_label_sw} onChange={(e) => setTier(idx, { badge_label_sw: e.target.value })} /></Field>
                </div>
                {/* NOTE: a plain <div>, not <Field>/<label> — a <label> wrapping
                    multiple <button>s redirects clicks to its first control, which
                    is why the icon picker wouldn't update. */}
                <div className="block">
                  <span className="block text-xs font-semibold text-gray-600 mb-1.5">Icon — click to choose</span>
                  <div className="flex flex-wrap gap-1.5">
                    {TIER_BADGE_ICONS.map((key) => {
                      const Glyph = BADGE_ICON[key]
                      const active = tier.badge_icon === key
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setTier(idx, { badge_icon: key })}
                          title={key}
                          aria-label={`Icon: ${key}`}
                          aria-pressed={active}
                          className={cn(
                            'grid h-9 w-9 place-items-center rounded-md border transition',
                            active
                              ? 'border-[#7E5896] bg-[#F0DFF6] text-[#5d3a78] ring-1 ring-[#C9A0DC]'
                              : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700',
                          )}
                        >
                          {Glyph ? <Glyph className="h-4 w-4" /> : <span className="text-[8px] font-bold uppercase">none</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <Field label="Colour">
                  <select className={inputCls} value={tier.badge_tone} onChange={(e) => setTier(idx, { badge_tone: e.target.value as TierBadgeTone })}>
                    {TIER_BADGE_TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
              </FieldGroup>

              <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                <input type="radio" name="featured-tier" checked={tier.featured} onChange={() => setFeatured(idx)} className="h-4 w-4 text-[#C9A0DC] focus:ring-[#C9A0DC]" />
                Highlight this card (raised accent border)
              </label>

              {/* Per-tier bullet points */}
              <FieldGroup label={`Package includes — bullet points (${tier.includes.length})`}>
                <div className="space-y-2">
                  {tier.includes.map((b, bIdx) => (
                    <div key={b.id} className="rounded-lg border border-gray-100 bg-gray-50/60 p-2">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <GripVertical className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                        <span className="text-[11px] font-semibold text-gray-400">#{bIdx + 1}</span>
                        <div className="ml-auto flex items-center gap-0.5">
                          <button type="button" onClick={() => moveBullet(idx, bIdx, -1)} disabled={bIdx === 0} className="px-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Move up">↑</button>
                          <button type="button" onClick={() => moveBullet(idx, bIdx, 1)} disabled={bIdx === tier.includes.length - 1} className="px-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Move down">↓</button>
                          <button type="button" onClick={() => removeBullet(idx, bIdx)} className="px-1 text-gray-400 hover:text-red-600" aria-label="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input className={inputCls} placeholder="Bullet text (EN)" value={b.label} onChange={(e) => setBullet(idx, bIdx, { label: e.target.value })} />
                        <input className={inputCls} placeholder="Bullet text (SW)" value={b.label_sw} onChange={(e) => setBullet(idx, bIdx, { label_sw: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <input className={inputCls} placeholder="Emphasis after — (EN, optional)" value={b.note} onChange={(e) => setBullet(idx, bIdx, { note: e.target.value })} />
                        <input className={inputCls} placeholder="Emphasis (SW, optional)" value={b.note_sw} onChange={(e) => setBullet(idx, bIdx, { note_sw: e.target.value })} />
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => addBullet(idx)} className="flex items-center gap-1.5 text-[13px] font-medium text-[#7E5896] hover:text-[#5d3a78] px-2.5 py-1.5 rounded-lg border border-dashed border-[#C9A0DC] hover:bg-[#F0DFF6]">
                  <Plus className="w-3.5 h-3.5" /> Add bullet
                </button>
              </FieldGroup>

              <p className="text-[11px] text-gray-400">Internal key: <code className="font-mono">{tier.id}</code></p>
            </CollapsibleCard>
          ))}
          <button type="button" onClick={addTier} className="flex items-center gap-2 text-sm font-medium text-[#7E5896] hover:text-[#5d3a78] px-3 py-2 rounded-lg border border-dashed border-[#C9A0DC] hover:bg-[#F0DFF6]">
            <Plus className="w-4 h-4" /> Add tier
          </button>
        </div>

        {/* ── Add-ons ── */}
        <FieldGroup label={`Available as add-ons — footnote (${draft.addons.length})`}>
          <div className="space-y-2">
            {draft.addons.map((a, i) => (
              <div key={a.id} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                <input className={inputCls} placeholder="Add-on (EN)" value={a.label} onChange={(e) => setAddon(i, { label: e.target.value })} />
                <input className={inputCls} placeholder="Add-on (SW)" value={a.label_sw} onChange={(e) => setAddon(i, { label_sw: e.target.value })} />
                <button type="button" onClick={() => removeAddon(i)} className="px-1.5 text-gray-400 hover:text-red-600" aria-label="Remove"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addAddon} className="flex items-center gap-1.5 text-[13px] font-medium text-[#7E5896] hover:text-[#5d3a78] px-2.5 py-1.5 rounded-lg border border-dashed border-[#C9A0DC] hover:bg-[#F0DFF6]">
            <Plus className="w-3.5 h-3.5" /> Add add-on
          </button>
        </FieldGroup>
      </div>

      {/* ── Preview ── */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] xl:sticky xl:top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-semibold text-gray-900">Live preview</h3>
          <span className="text-xs text-gray-400">Approximate</span>
        </div>
        <PackagesPreview content={draft} />
      </div>
    </div>
  )
}

const TONE_CLS: Record<TierBadgeTone, string> = {
  slate: 'bg-[#475569] text-white',
  accent: 'bg-[#7E5896] text-white',
  gold: 'bg-gradient-to-b from-[#E6C66E] to-[#C9A84C] text-[#3A2C06]',
}

function BadgeIconGlyph({ icon, className }: { icon: TierBadgeIcon; className?: string }) {
  const Glyph = BADGE_ICON[icon]
  return Glyph ? <Glyph className={className} /> : null
}

function BadgePreview({ label, icon, tone }: { label: string; icon: TierBadgeIcon; tone: TierBadgeTone }) {
  if (!label) return <span className="text-[11px] text-gray-400">No pill</span>
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide shadow-sm ${TONE_CLS[tone] ?? TONE_CLS.slate}`}>
      <BadgeIconGlyph icon={icon} className="w-3 h-3" />
      {label}
    </span>
  )
}

function PackagesPreview({ content }: { content: OpusPassPackagesContent }) {
  const featured = content.tiers.find((t) => t.featured) ?? content.tiers[0]
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-gray-500">{content.heading || 'Choose your package'}</p>
        <p className="mt-1 text-[11px] text-gray-500">{content.subheading}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {content.tiers.map((t) => (
          <div key={t.id} className={`relative rounded-lg border p-2.5 ${t.featured ? 'border-[#B98FD6] bg-[#ECDDF7]' : 'border-gray-200 bg-gray-50'}`}>
            {t.badge_label && (
              <span className={`absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${TONE_CLS[t.badge_tone] ?? TONE_CLS.slate}`}>
                <BadgeIconGlyph icon={t.badge_icon} className="w-2.5 h-2.5" />
                {t.badge_label}
              </span>
            )}
            <p className="text-[11px] font-bold text-gray-900">{t.name || 'Tier'}</p>
            <p className="mt-0.5 text-[12px] font-extrabold text-gray-900 tabular-nums">
              TZS {t.price_per_guest.toLocaleString('en-US')}
              <span className="ml-0.5 text-[8px] font-medium text-gray-500">/ guest</span>
            </p>
            <p className="mt-1 text-[9px] leading-tight text-gray-500">{t.best_for}</p>
          </div>
        ))}
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-600 mb-1.5">{featured?.name} package includes</p>
        <ul className="grid grid-cols-1 gap-1 text-[11px] text-gray-700">
          {(featured?.includes ?? []).map((b) => (
            <li key={b.id} className="flex items-start gap-1.5">
              <Check className="w-3 h-3 mt-0.5 shrink-0 text-emerald-600" strokeWidth={3} />
              <span>{b.label || 'Bullet'}{b.note && <span className="text-gray-400"> — {b.note}</span>}</span>
            </li>
          ))}
        </ul>
        {content.addons.length > 0 && (
          <p className="mt-2 text-[10px] text-gray-400">
            Available as add-ons: {content.addons.map((a) => a.label.toLowerCase()).filter(Boolean).join(', ')}.
          </p>
        )}
      </div>
    </div>
  )
}
