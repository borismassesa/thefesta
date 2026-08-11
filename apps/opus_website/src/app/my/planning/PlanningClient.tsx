'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowRight, Calendar, Check, ChevronDown, ChevronUp, ListTodo, Pencil, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Constants ─────────────────────────────────────────────────────────────────

const BUDGET_LABELS: Record<string, string> = {
  under_5m:    'Under TZS 5M',
  '5m_15m':   'TZS 5–15M',
  '15m_30m':  'TZS 15–30M',
  '30m_50m':  'TZS 30–50M',
  over_50m:   'Over TZS 50M',
  undisclosed: 'Prefer not to say',
}
const BUDGET_OPTIONS = Object.entries(BUDGET_LABELS).map(([value, label]) => ({ value, label }))

const TZ_REGIONS = [
  'Dar es Salaam','Zanzibar','Arusha','Mwanza','Dodoma',
  'Mbeya','Tanga','Kilimanjaro','Morogoro','Iringa','Other',
]

const CATEGORY_OPTIONS = [
  { value: 'venues',            label: 'Venues' },
  { value: 'photographers',     label: 'Photographers' },
  { value: 'videographers',     label: 'Videographers' },
  { value: 'caterers',          label: 'Caterers' },
  { value: 'djs-music',         label: 'DJs & Music' },
  { value: 'florists',          label: 'Florists' },
  { value: 'wedding-planners',  label: 'Wedding Planners' },
  { value: 'hair-makeup',       label: 'Hair & Makeup' },
  { value: 'cakes-desserts',    label: 'Cakes & Desserts' },
  { value: 'decorators',        label: 'Decorators' },
]

// ── Types ─────────────────────────────────────────────────────────────────────

type WidgetType = 'date' | 'budget' | 'guest_count' | 'location' | 'categories'

type TaskCTA = { label: string; href: string }

type Task = {
  id: string
  text: string
  widget?: WidgetType
  cta?: TaskCTA
}

type Section = {
  id: string
  title: string
  tasks: Task[]
}

type CoupleProfile = {
  partner1_name: string | null
  partner2_name: string | null
  wedding_date: string | null
  date_undecided: boolean | null
  city: string | null
  region: string | null
  guest_count: number | null
  budget_range: string | null
  whatsapp_phone: string | null
  preferred_categories: string[] | null
}

// ── Checklist data ────────────────────────────────────────────────────────────

const SECTIONS: Section[] = [
  {
    id: 's12',
    title: '12+ Months Before',
    tasks: [
      { id: 's12_1', text: 'Set your wedding date',
        widget: 'date' },
      { id: 's12_2', text: 'Define your wedding budget',
        widget: 'budget' },
      { id: 's12_3', text: 'Estimate your guest count',
        widget: 'guest_count' },
      { id: 's12_4', text: 'Choose a venue and city',
        widget: 'location',
        cta: { label: 'Browse venues', href: '/vendors/browse?category=venues' } },
      { id: 's12_5', text: 'Choose your wedding style or theme' },
      { id: 's12_6', text: 'Choose which vendor categories you need',
        widget: 'categories' },
      { id: 's12_7', text: 'Consider hiring a wedding planner',
        cta: { label: 'Find wedding planners', href: '/vendors/browse?category=wedding-planners' } },
    ],
  },
  {
    id: 's9',
    title: '9–12 Months Before',
    tasks: [
      { id: 's9_1', text: 'Book your photographer',
        cta: { label: 'Find photographers', href: '/vendors/browse?category=photographers' } },
      { id: 's9_2', text: 'Book your videographer',
        cta: { label: 'Find videographers', href: '/vendors/browse?category=videographers' } },
      { id: 's9_3', text: 'Book your caterer',
        cta: { label: 'Find caterers', href: '/vendors/browse?category=caterers' } },
      { id: 's9_4', text: 'Book musicians or a DJ',
        cta: { label: 'Find DJs & musicians', href: '/vendors/browse?category=djs-music' } },
      { id: 's9_5', text: 'Send save-the-dates',
        cta: { label: 'Create a wedding website', href: '/planning-tools' } },
      { id: 's9_6', text: 'Begin shopping for wedding attire',
        cta: { label: 'Explore attire & rings', href: '/attire-and-rings' } },
      { id: 's9_7', text: 'Research honeymoon destinations' },
    ],
  },
  {
    id: 's6',
    title: '6–9 Months Before',
    tasks: [
      { id: 's6_1', text: 'Send formal invitations',
        cta: { label: 'Create digital invitations', href: '/planning-tools' } },
      { id: 's6_2', text: 'Book your florist',
        cta: { label: 'Find florists', href: '/vendors/browse?category=florists' } },
      { id: 's6_3', text: 'Book hair and makeup artists',
        cta: { label: 'Find hair & makeup artists', href: '/vendors/browse?category=hair-makeup' } },
      { id: 's6_4', text: 'Plan and book the honeymoon' },
      { id: 's6_5', text: 'Choose and order bridal party outfits',
        cta: { label: 'Explore attire & rings', href: '/attire-and-rings' } },
      { id: 's6_6', text: 'Hire a cake designer',
        cta: { label: 'Find cake designers', href: '/vendors/browse?category=cakes-desserts' } },
      { id: 's6_7', text: 'Arrange accommodation for out-of-town guests' },
    ],
  },
  {
    id: 's3',
    title: '3–6 Months Before',
    tasks: [
      { id: 's3_1', text: 'Finalise the catering menu and details' },
      { id: 's3_2', text: 'Confirm all vendor bookings in writing',
        cta: { label: 'View your inquiries', href: '/my/inquiries' } },
      { id: 's3_3', text: 'Purchase your wedding rings',
        cta: { label: 'Browse rings & jewellery', href: '/attire-and-rings' } },
      { id: 's3_4', text: 'Schedule dress and suit fittings' },
      { id: 's3_5', text: 'Plan your rehearsal dinner' },
      { id: 's3_6', text: 'Create a seating chart',
        cta: { label: 'Use planning tools', href: '/planning-tools' } },
      { id: 's3_7', text: 'Organise a vendor payments schedule',
        cta: { label: 'View your inquiries', href: '/my/inquiries' } },
    ],
  },
  {
    id: 's1',
    title: '1–3 Months Before',
    tasks: [
      { id: 's1_1', text: 'Confirm final headcount with all vendors',
        cta: { label: 'View your inquiries', href: '/my/inquiries' } },
      { id: 's1_2', text: 'Apply for your marriage certificate' },
      { id: 's1_3', text: 'Arrange wedding day transportation',
        cta: { label: 'Browse vendors', href: '/vendors/browse' } },
      { id: 's1_4', text: 'Write your vows' },
      { id: 's1_5', text: 'Create the day-of timeline' },
      { id: 's1_6', text: 'Send out final RSVP reminders',
        cta: { label: 'Manage RSVPs', href: '/planning-tools' } },
      { id: 's1_7', text: 'Break in your wedding shoes' },
    ],
  },
  {
    id: 'sf',
    title: 'Final Month',
    tasks: [
      { id: 'sf_1', text: 'Final dress and suit fittings' },
      { id: 'sf_2', text: 'Confirm all vendors with exact timings',
        cta: { label: 'View your inquiries', href: '/my/inquiries' } },
      { id: 'sf_3', text: 'Prepare vendor payment envelopes' },
      { id: 'sf_4', text: 'Pack for the honeymoon' },
      { id: 'sf_5', text: 'Delegate day-of responsibilities' },
      { id: 'sf_6', text: 'Schedule beauty prep (skincare, hair treatments)',
        cta: { label: 'Find hair & makeup artists', href: '/vendors/browse?category=hair-makeup' } },
      { id: 'sf_7', text: "Relax and enjoy — you've got this!" },
    ],
  },
]

const TOTAL_TASKS = SECTIONS.reduce((sum, s) => sum + s.tasks.length, 0)

// ── Profile helpers ───────────────────────────────────────────────────────────

function isWiredComplete(widget: WidgetType, profile: CoupleProfile): boolean {
  switch (widget) {
    case 'date':        return !!(profile.wedding_date || profile.date_undecided)
    case 'budget':      return !!profile.budget_range
    case 'guest_count': return profile.guest_count != null
    case 'location':    return !!profile.city
    case 'categories':  return (profile.preferred_categories?.length ?? 0) > 0
  }
}

function wiredValueLabel(widget: WidgetType, profile: CoupleProfile): string | null {
  switch (widget) {
    case 'date':
      if (profile.date_undecided) return 'Date TBD'
      if (profile.wedding_date) return new Date(profile.wedding_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      return null
    case 'budget':
      return profile.budget_range ? BUDGET_LABELS[profile.budget_range] : null
    case 'guest_count':
      return profile.guest_count != null ? `${profile.guest_count} guests` : null
    case 'location':
      return [profile.city, profile.region].filter(Boolean).join(', ') || null
    case 'categories':
      return profile.preferred_categories?.length
        ? `${profile.preferred_categories.length} categor${profile.preferred_categories.length === 1 ? 'y' : 'ies'}`
        : null
  }
}

function currentSectionId(weddingDate: string | null): string | null {
  if (!weddingDate) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(weddingDate); d.setHours(0, 0, 0, 0)
  const days = Math.ceil((d.getTime() - today.getTime()) / 86400000)
  if (days > 365) return 's12'
  if (days > 270) return 's9'
  if (days > 180) return 's6'
  if (days > 90)  return 's3'
  if (days > 30)  return 's1'
  return 'sf'
}

// ── Widgets ───────────────────────────────────────────────────────────────────

function DateWidget({ profile, onSave, onCancel, saving }: {
  profile: CoupleProfile
  onSave: (patch: Partial<CoupleProfile>) => Promise<void>
  onCancel: () => void
  saving: boolean
}) {
  const [date, setDate]     = useState(profile.wedding_date ?? '')
  const [tbd, setTbd]       = useState(profile.date_undecided ?? false)

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[11px] font-bold uppercase tracking-wide text-gray-400 block mb-1">
          Wedding date
        </label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          disabled={tbd}
          className={cn(
            'border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full focus:outline-none focus:border-[#1A1A1A] transition-colors bg-white',
            tbd && 'opacity-40 cursor-not-allowed',
          )}
        />
        <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
          <div
            onClick={() => { setTbd(v => !v); if (!tbd) setDate('') }}
            className={cn(
              'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all',
              tbd ? 'bg-(--accent) border-(--accent)' : 'border-gray-300 hover:border-[#1A1A1A]',
            )}
          >
            {tbd && <Check size={9} strokeWidth={3} className="text-(--on-accent)" />}
          </div>
          <span className="text-xs text-gray-500">We haven&apos;t decided yet</span>
        </label>
      </div>
      <SaveBar
        onSave={() => onSave({ wedding_date: tbd ? null : (date || null), date_undecided: tbd })}
        onCancel={onCancel}
        saving={saving}
        disabled={!tbd && !date}
      />
    </div>
  )
}

function BudgetWidget({ profile, onSave, onCancel, saving }: {
  profile: CoupleProfile
  onSave: (patch: Partial<CoupleProfile>) => Promise<void>
  onCancel: () => void
  saving: boolean
}) {
  const [range, setRange] = useState(profile.budget_range ?? '')
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[11px] font-bold uppercase tracking-wide text-gray-400 block mb-2">
          Budget range
        </label>
        <div className="flex flex-wrap gap-2">
          {BUDGET_OPTIONS.map(opt => (
            <button data-opus-button="neutral" data-opus-button-size="small"
              key={opt.value} type="button"
              onClick={() => setRange(r => r === opt.value ? '' : opt.value)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all',
                range === opt.value
                  ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white'
                  : 'border-gray-200 text-[#1A1A1A] hover:border-gray-400 bg-white',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <SaveBar
        onSave={() => onSave({ budget_range: range || null })}
        onCancel={onCancel}
        saving={saving}
        disabled={!range}
      />
    </div>
  )
}

function GuestCountWidget({ profile, onSave, onCancel, saving }: {
  profile: CoupleProfile
  onSave: (patch: Partial<CoupleProfile>) => Promise<void>
  onCancel: () => void
  saving: boolean
}) {
  const [count, setCount] = useState(profile.guest_count != null ? String(profile.guest_count) : '')
  const parsed = count.trim() ? parseInt(count, 10) : null
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[11px] font-bold uppercase tracking-wide text-gray-400 block mb-1">
          Estimated guest count
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={count}
            onChange={e => setCount(e.target.value)}
            placeholder="e.g. 150"
            min="1"
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-32 focus:outline-none focus:border-[#1A1A1A] transition-colors bg-white"
          />
          <span className="text-sm text-gray-400">guests</span>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">An approximate number is fine</p>
      </div>
      <SaveBar
        onSave={() => onSave({ guest_count: parsed && !isNaN(parsed) ? parsed : null })}
        onCancel={onCancel}
        saving={saving}
        disabled={!parsed || isNaN(parsed) || parsed < 1}
      />
    </div>
  )
}

function LocationWidget({ profile, onSave, onCancel, saving }: {
  profile: CoupleProfile
  onSave: (patch: Partial<CoupleProfile>) => Promise<void>
  onCancel: () => void
  saving: boolean
}) {
  const [city, setCity]     = useState(profile.city ?? '')
  const [region, setRegion] = useState(profile.region ?? '')
  const inputCls = 'border border-gray-200 rounded-xl px-4 py-2.5 text-sm w-full focus:outline-none focus:border-[#1A1A1A] transition-colors bg-white'
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-gray-400 block mb-1">City</label>
          <input
            type="text" value={city} onChange={e => setCity(e.target.value)}
            placeholder="e.g. Dar es Salaam" className={inputCls}
          />
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-gray-400 block mb-1">Region</label>
          <select value={region} onChange={e => setRegion(e.target.value)} className={cn(inputCls, 'bg-white')}>
            <option value="">Select region</option>
            {TZ_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>
      <SaveBar
        onSave={() => onSave({ city: city.trim() || null, region: region || null })}
        onCancel={onCancel}
        saving={saving}
        disabled={!city.trim()}
      />
      <div className="pt-1 border-t border-gray-200">
        <Link
          href="/vendors/browse?category=venues"
          className="inline-flex items-center gap-1 text-xs font-bold text-(--accent) hover:text-(--accent-hover) transition-colors"
        >
          Browse venues on OpusFesta
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  )
}

function CategoriesWidget({ profile, onSave, onCancel, saving }: {
  profile: CoupleProfile
  onSave: (patch: Partial<CoupleProfile>) => Promise<void>
  onCancel: () => void
  saving: boolean
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(profile.preferred_categories ?? []),
  )
  const toggle = (v: string) => setSelected(prev => {
    const next = new Set(prev); next.has(v) ? next.delete(v) : next.add(v); return next
  })
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[11px] font-bold uppercase tracking-wide text-gray-400 block mb-2">
          Vendor categories you need
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {CATEGORY_OPTIONS.map(cat => (
            <button data-opus-button="control"
              key={cat.value} type="button" onClick={() => toggle(cat.value)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-xs font-semibold transition-all text-left',
                selected.has(cat.value)
                  ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white'
                  : 'border-gray-200 text-[#1A1A1A] hover:border-gray-400 bg-white',
              )}
            >
              {selected.has(cat.value) && <Check size={9} strokeWidth={3.5} />}
              {cat.label}
            </button>
          ))}
        </div>
      </div>
      <SaveBar
        onSave={() => onSave({ preferred_categories: [...selected] })}
        onCancel={onCancel}
        saving={saving}
        disabled={selected.size === 0}
      />
      {selected.size > 0 && (
        <div className="pt-1 border-t border-gray-200">
          <Link
            href="/vendors/browse"
            className="inline-flex items-center gap-1 text-xs font-bold text-(--accent) hover:text-(--accent-hover) transition-colors"
          >
            Browse vendors in these categories
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </div>
  )
}

function SaveBar({ onSave, onCancel, saving, disabled }: {
  onSave: () => void; onCancel: () => void; saving: boolean; disabled: boolean
}) {
  return (
    <div className="flex gap-2">
      <button data-opus-button="control"
        type="button" onClick={onCancel}
        className="px-4 py-2 rounded-full border-2 border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
      >
        Cancel
      </button>
      <button data-opus-button="primary" data-opus-button-size="small"
        type="button" onClick={onSave} disabled={saving || disabled}
        className="px-4 py-2 rounded-full bg-(--accent) text-(--on-accent) text-xs font-bold hover:bg-(--accent-hover) transition-colors disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Save to profile'}
      </button>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  userId: string
  profile: CoupleProfile | null
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function PlanningClient({ userId, profile: initialProfile }: Props) {
  const storageKey = `of_plan_${userId}`
  const [profile, setProfile] = useState<CoupleProfile | null>(initialProfile)
  const [completed, setCompleted] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loaded, setLoaded]       = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) setCompleted(new Set(JSON.parse(raw) as string[]))
    } catch {}
    setLoaded(true)
  }, [storageKey])

  const noNames = !profile?.partner1_name

  // ── Helpers ──────────────────────────────────────────────────────────────

  function toggleTask(taskId: string) {
    setCompleted(prev => {
      const next = new Set(prev)
      next.has(taskId) ? next.delete(taskId) : next.add(taskId)
      try { localStorage.setItem(storageKey, JSON.stringify([...next])) } catch {}
      return next
    })
  }

  function toggleSection(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
    })
  }

  const toggleExpand = useCallback((taskId: string) => {
    setExpanded(prev => prev === taskId ? null : taskId)
    setSaveError(null)
  }, [])

  async function saveProfilePatch(patch: Partial<CoupleProfile>) {
    if (!profile) return
    setSaving(true)
    setSaveError(null)
    try {
      const merged = { ...profile, ...patch }
      const res = await fetch('/api/my/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partner1Name:        merged.partner1_name?.trim() ?? '',
          partner2Name:        merged.partner2_name?.trim() ?? '',
          weddingDate:         merged.date_undecided ? null : (merged.wedding_date ?? null),
          dateUndecided:       merged.date_undecided ?? false,
          city:                merged.city?.trim() ?? '',
          region:              merged.region ?? null,
          guestCount:          merged.guest_count ?? null,
          budgetRange:         merged.budget_range ?? null,
          whatsappPhone:       merged.whatsapp_phone ?? null,
          preferredCategories: merged.preferred_categories ?? [],
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Save failed')
      }
      setProfile(merged)
      setExpanded(null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  // ── Counts ───────────────────────────────────────────────────────────────

  function isTaskDone(task: Task): boolean {
    if (task.widget && profile) return isWiredComplete(task.widget, profile)
    return completed.has(task.id)
  }

  const completedCount = SECTIONS.flatMap(s => s.tasks).filter(t => isTaskDone(t)).length
  const progressPct    = Math.round((completedCount / TOTAL_TASKS) * 100)
  const currentId      = currentSectionId(profile?.wedding_date ?? null)

  // ── No profile nudge ─────────────────────────────────────────────────────

  if (!profile) {
    return (
      <div className="px-4 py-8 sm:px-8 max-w-2xl">
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <Sparkles className="w-10 h-10 text-(--accent) mx-auto mb-4" />
          <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">Set up your profile first</h2>
          <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto leading-relaxed">
            Your planning checklist connects directly to your wedding profile. Complete your profile to get started.
          </p>
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 bg-(--accent) text-(--on-accent) hover:bg-(--accent-hover) px-5 py-2.5 rounded-full text-sm font-bold transition-colors"
          >
            Complete profile
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 sm:px-8 max-w-2xl">

      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-0.5">
          <ListTodo className="w-5 h-5 text-[#1A1A1A]" />
          <h1 className="text-2xl font-extrabold text-[#1A1A1A] tracking-tight">Wedding Checklist</h1>
        </div>
        <p className="text-sm text-gray-400">
          {completedCount} of {TOTAL_TASKS} tasks complete
          {profile.wedding_date && !profile.date_undecided && (
            <span className="ml-2 text-gray-300">·</span>
          )}
          {profile.wedding_date && !profile.date_undecided && (() => {
            const d = new Date(profile.wedding_date!)
            const days = Math.ceil((d.getTime() - Date.now()) / 86400000)
            return days > 0 ? (
              <span className="ml-2 text-gray-400">{days} days to go</span>
            ) : null
          })()}
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-7">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-gray-400">Overall progress</span>
          <span className="text-xs font-bold text-[#1A1A1A]">{progressPct}%</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-(--accent) rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* No-names warning */}
      {noNames && (
        <div className="mb-5 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-start gap-3">
          <Calendar className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs text-amber-700 font-medium">
              Add your partner&apos;s names in{' '}
              <Link href="/my/profile" className="font-bold underline underline-offset-2">
                your profile
              </Link>{' '}
              so checklist saves work correctly.
            </p>
          </div>
        </div>
      )}

      {saveError && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          {saveError}
        </p>
      )}

      {/* Sections */}
      {loaded && (
        <div className="space-y-3">
          {SECTIONS.map(section => {
            const isCollapsed = collapsed.has(section.id)
            const isCurrent   = section.id === currentId
            const doneTasks   = section.tasks.filter(t => isTaskDone(t)).length
            const allDone     = doneTasks === section.tasks.length

            return (
              <div
                key={section.id}
                className={cn(
                  'rounded-2xl border overflow-hidden transition-all',
                  isCurrent ? 'border-(--accent)/30 shadow-sm'
                  : allDone  ? 'border-gray-100 opacity-75'
                  :             'border-gray-100',
                )}
              >
                {/* Section header */}
                <button data-opus-button="primary" data-opus-button-size="medium"
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className={cn(
                    'w-full flex items-center justify-between px-5 py-4 text-left transition-colors',
                    isCurrent ? 'bg-(--accent)/5' : 'bg-white hover:bg-gray-50',
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-bold text-[#1A1A1A]">{section.title}</span>
                    {isCurrent && (
                      <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] bg-(--accent) text-(--on-accent) px-2 py-0.5 rounded-full">
                        Now
                      </span>
                    )}
                    {allDone && !isCurrent && (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        Done
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-gray-400">{doneTasks}/{section.tasks.length}</span>
                    {isCollapsed
                      ? <ChevronDown className="w-4 h-4 text-gray-400" />
                      : <ChevronUp   className="w-4 h-4 text-gray-400" />
                    }
                  </div>
                </button>

                {/* Tasks */}
                {!isCollapsed && (
                  <ul className="bg-white divide-y divide-gray-50 px-2 pb-2">
                    {section.tasks.map(task => {
                      const done        = isTaskDone(task)
                      const isExpanded  = expanded === task.id
                      const wired       = !!task.widget
                      const valueLabel  = wired && profile ? wiredValueLabel(task.widget!, profile) : null

                      return (
                        <li key={task.id}>
                          {/* Task row */}
                          <button data-opus-button="control"
                            type="button"
                            onClick={() => wired ? toggleExpand(task.id) : toggleTask(task.id)}
                            className={cn(
                              'w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors text-left group',
                              isExpanded ? 'bg-gray-50' : 'hover:bg-gray-50',
                            )}
                          >
                            {/* Checkbox */}
                            <div className={cn(
                              'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all',
                              done
                                ? 'bg-(--accent) border-(--accent)'
                                : 'border-gray-300 group-hover:border-gray-400',
                            )}>
                              {done && <Check size={10} strokeWidth={3.5} className="text-(--on-accent)" />}
                            </div>

                            {/* Text + value */}
                            <div className="flex-1 min-w-0">
                              <span className={cn(
                                'text-sm transition-colors block',
                                done && !wired ? 'line-through text-gray-300 font-normal' : 'text-[#1A1A1A] font-medium',
                              )}>
                                {task.text}
                              </span>
                              {valueLabel && (
                                <span className="text-xs text-gray-400 mt-0.5 block">{valueLabel}</span>
                              )}
                            </div>

                            {/* Wired indicator */}
                            {wired && (
                              <Pencil className={cn(
                                'w-3.5 h-3.5 shrink-0 transition-colors',
                                isExpanded ? 'text-(--accent)' : 'text-gray-300 group-hover:text-gray-400',
                              )} />
                            )}
                          </button>

                          {/* CTA — shown when not done and not currently expanded */}
                          {task.cta && !done && !isExpanded && (
                            <div className="pl-11 pb-3 -mt-0.5">
                              <Link
                                href={task.cta.href}
                                className="inline-flex items-center gap-1 text-xs font-bold text-(--accent) hover:text-(--accent-hover) transition-colors"
                              >
                                {task.cta.label}
                                <ArrowRight className="w-3 h-3" />
                              </Link>
                            </div>
                          )}

                          {/* Inline widget */}
                          {isExpanded && wired && (
                            <div className="px-4 pb-4 pt-1">
                              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                {task.widget === 'date' && (
                                  <DateWidget
                                    profile={profile}
                                    onSave={saveProfilePatch}
                                    onCancel={() => setExpanded(null)}
                                    saving={saving}
                                  />
                                )}
                                {task.widget === 'budget' && (
                                  <BudgetWidget
                                    profile={profile}
                                    onSave={saveProfilePatch}
                                    onCancel={() => setExpanded(null)}
                                    saving={saving}
                                  />
                                )}
                                {task.widget === 'guest_count' && (
                                  <GuestCountWidget
                                    profile={profile}
                                    onSave={saveProfilePatch}
                                    onCancel={() => setExpanded(null)}
                                    saving={saving}
                                  />
                                )}
                                {task.widget === 'location' && (
                                  <LocationWidget
                                    profile={profile}
                                    onSave={saveProfilePatch}
                                    onCancel={() => setExpanded(null)}
                                    saving={saving}
                                  />
                                )}
                                {task.widget === 'categories' && (
                                  <CategoriesWidget
                                    profile={profile}
                                    onSave={saveProfilePatch}
                                    onCancel={() => setExpanded(null)}
                                    saving={saving}
                                  />
                                )}
                              </div>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!loaded && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="rounded-2xl border border-gray-100 bg-white h-16 animate-pulse" />)}
        </div>
      )}

      <p className="text-xs text-gray-300 mt-8 text-center">
        Profile-linked tasks save to your account. Other tasks are stored in this browser.
      </p>
    </div>
  )
}
