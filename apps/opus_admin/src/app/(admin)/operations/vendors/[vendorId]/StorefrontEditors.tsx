'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition, type ReactNode } from 'react'
import {
  AlertCircle,
  Banknote,
  Building2,
  Calendar,
  Check,
  ClipboardList,
  MapPin,
  Facebook,
  Globe,
  HelpCircle,
  ImageIcon,
  Instagram,
  Link2,
  Loader2,
  MessageCircle,
  Music2,
  Plus,
  Star,
  Trash2,
  UploadCloud,
  Users,
  Video as VideoIcon,
} from 'lucide-react'
import { SERVICE_MARKETS } from '@opusfesta/lib'
import { cn } from '@/lib/utils'
import {
  adminCreateVendorVideoUploadUrl,
  adminUploadVendorPhoto,
  updateStorefrontSection,
  type StorefrontPatch,
} from '../actions'
import { useEditorRegistration } from './EditorRegistry'

// ---------------------------------------------------------------------------
// Shared primitives — keeps the per-section editors compact
// ---------------------------------------------------------------------------

const inputCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7E5896]/30 focus:border-[#7E5896]/40'

function Card({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <article className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-6">
      <header className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-white border border-gray-200 text-gray-500 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
          )}
        </div>
      </header>
      {children}
    </article>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}

// Social-channel input with the channel icon prefixed inside the input.
function SocialField({
  icon,
  label,
  value,
  onChange,
  placeholder,
}: {
  icon: ReactNode
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <Field label={label}>
      <div className="relative">
        <span
          aria-hidden
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
        >
          {icon}
        </span>
        <input
          className={`${inputCls} pl-8`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      </div>
    </Field>
  )
}

// Lavender-tinted empty state — used by the list editors (packages, team,
// FAQs) when the collection is empty. Replaces the old plain gray italic
// "No X yet" text with a properly composed nudge to take action.
function EmptyState({
  icon,
  message,
  ctaLabel,
  onCta,
}: {
  icon: ReactNode
  message: string
  ctaLabel: string
  onCta: () => void
}) {
  return (
    <div className="rounded-2xl border border-[#E0C7E8] bg-[#FAF5FA] p-8 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white border border-[#E0C7E8] text-[#7E5896] mb-3">
        {icon}
      </div>
      <p className="text-sm text-gray-700 mb-4">{message}</p>
      <button data-opus-button="control"
        type="button"
        onClick={onCta}
        className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full bg-[#7E5896] hover:bg-[#6B4880] text-white transition-colors"
      >
        <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
        {ctaLabel}
      </button>
    </div>
  )
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2, 10)}`
}

// useStorefrontSave — boilerplate the editors share. Wraps the server action,
// handles transitions, refreshes the route on success, and resolves a Promise
// so the global save bar can await the result and aggregate toasts.
function useStorefrontSave(vendorId: string) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const save = (
    patch: StorefrontPatch
  ): Promise<{ ok: boolean; error?: string }> => {
    return new Promise((resolve) => {
      setError(null)
      setSaved(false)
      startTransition(async () => {
        const res = await updateStorefrontSection(vendorId, patch)
        if (!res.ok) {
          setError(res.error)
          resolve(res)
          return
        }
        setSaved(true)
        router.refresh()
        resolve(res)
      })
    })
  }
  return { pending, error, saved, save }
}

// ---------------------------------------------------------------------------
// 1. Profile + contact + socials
// ---------------------------------------------------------------------------

export type ProfileInitial = {
  businessName: string
  bio: string
  yearsInBusiness: number | null
  // Tanzania administrative address.
  houseNumber: string
  street: string
  ward: string
  district: string
  region: string
  landmark: string
  postalCode: string
  phone: string
  email: string
  whatsapp: string
  socialWebsite: string
  socialInstagram: string
  socialFacebook: string
  socialTiktok: string
  socialWhatsapp: string
  // Service area — home market + additional markets the vendor serves. The
  // catalogue (SERVICE_MARKETS) is shared via @opusfesta/lib so admin edits
  // write the same IDs the vendor portal and public marketplace resolve.
  homeMarket: string | null
  serviceMarkets: string[]
}

export function AdminProfileEditor({
  vendorId,
  initial,
}: {
  vendorId: string
  initial: ProfileInitial
}) {
  const [v, setV] = useState(initial)
  const dirty = JSON.stringify(v) !== JSON.stringify(initial)
  const { save } = useStorefrontSave(vendorId)

  const onSave = () =>
    save({
      businessName: v.businessName,
      bio: v.bio,
      yearsInBusiness:
        v.yearsInBusiness === null || Number.isNaN(v.yearsInBusiness)
          ? null
          : v.yearsInBusiness,
      houseNumber: v.houseNumber,
      street: v.street,
      ward: v.ward,
      district: v.district,
      region: v.region,
      landmark: v.landmark,
      postalCode: v.postalCode,
      phone: v.phone,
      email: v.email,
      whatsapp: v.whatsapp,
      socialWebsite: v.socialWebsite,
      socialInstagram: v.socialInstagram,
      socialFacebook: v.socialFacebook,
      socialTiktok: v.socialTiktok,
      socialWhatsapp: v.socialWhatsapp,
      homeMarket: v.homeMarket,
      serviceMarkets: v.serviceMarkets,
    })

  useEditorRegistration({
    id: 'profile-business',
    label: 'Business profile & contact',
    dirty,
    save: onSave,
    discard: () => setV(initial),
  })

  return (
    <Card
      icon={<Building2 className="w-5 h-5" strokeWidth={1.75} />}
      title="Business profile & contact"
      subtitle="Public business details, location, phone, email, WhatsApp, and social links."
    >
      <div className="flex flex-col gap-3">
        <Field label="Business name">
          <input
            className={inputCls}
            value={v.businessName}
            onChange={(e) => setV({ ...v, businessName: e.target.value })}
          />
        </Field>
        <Field label="Years in business">
          <input
            type="number"
            min={0}
            className={inputCls}
            value={v.yearsInBusiness ?? ''}
            onChange={(e) =>
              setV({
                ...v,
                yearsInBusiness:
                  e.target.value === '' ? null : Number(e.target.value),
              })
            }
          />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Bio">
          <textarea
            rows={4}
            className={inputCls}
            value={v.bio}
            onChange={(e) => setV({ ...v, bio: e.target.value })}
          />
        </Field>
      </div>

      <div className="mt-5 pt-4 border-t border-gray-100">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
          Address
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Building / Plot number">
            <input
              className={inputCls}
              value={v.houseNumber}
              onChange={(e) => setV({ ...v, houseNumber: e.target.value })}
            />
          </Field>
          <Field label="Street / Village">
            <input
              className={inputCls}
              value={v.street}
              onChange={(e) => setV({ ...v, street: e.target.value })}
            />
          </Field>
          <Field label="Ward">
            <input
              className={inputCls}
              value={v.ward}
              onChange={(e) => setV({ ...v, ward: e.target.value })}
            />
          </Field>
          <Field label="District">
            <input
              className={inputCls}
              value={v.district}
              onChange={(e) => setV({ ...v, district: e.target.value })}
            />
          </Field>
          <Field label="Region">
            <input
              className={inputCls}
              value={v.region}
              onChange={(e) => setV({ ...v, region: e.target.value })}
            />
          </Field>
          <Field label="P.O. Box / Postal code">
            <input
              className={inputCls}
              value={v.postalCode}
              onChange={(e) => setV({ ...v, postalCode: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Landmark / directions">
              <input
                className={inputCls}
                value={v.landmark}
                onChange={(e) => setV({ ...v, landmark: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-gray-100">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
          Service area
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Home market">
            <select
              className={inputCls}
              value={v.homeMarket ?? ''}
              onChange={(e) =>
                setV({
                  ...v,
                  homeMarket: e.target.value || null,
                  // Drop the home market from additional markets if it was
                  // also ticked — a vendor can't "also serve" their base.
                  serviceMarkets: v.serviceMarkets.filter(
                    (id) => id !== e.target.value,
                  ),
                })
              }
            >
              <option value="">Not set</option>
              {SERVICE_MARKETS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-3">
          <p className="text-[11px] text-gray-500 mb-1.5">
            Additional markets served
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {SERVICE_MARKETS.filter((m) => m.id !== v.homeMarket).map((m) => {
              const checked = v.serviceMarkets.includes(m.id)
              return (
                <label
                  key={m.id}
                  className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setV({
                        ...v,
                        serviceMarkets: checked
                          ? v.serviceMarkets.filter((x) => x !== m.id)
                          : [...v.serviceMarkets, m.id],
                      })
                    }
                  />
                  {m.name}
                </label>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-gray-100">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
          Contact
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Phone">
            <input
              className={inputCls}
              value={v.phone}
              onChange={(e) => setV({ ...v, phone: e.target.value })}
            />
          </Field>
          <Field label="WhatsApp">
            <input
              className={inputCls}
              value={v.whatsapp}
              onChange={(e) => setV({ ...v, whatsapp: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Email">
              <input
                type="email"
                className={inputCls}
                value={v.email}
                onChange={(e) => setV({ ...v, email: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-gray-100">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
          Social media &amp; website
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <SocialField
            icon={<Globe className="w-3.5 h-3.5" />}
            label="Website"
            value={v.socialWebsite}
            onChange={(value) => setV({ ...v, socialWebsite: value })}
            placeholder="https://"
          />
          <SocialField
            icon={<MessageCircle className="w-3.5 h-3.5" />}
            label="WhatsApp business"
            value={v.socialWhatsapp}
            onChange={(value) => setV({ ...v, socialWhatsapp: value })}
          />
          <SocialField
            icon={<Instagram className="w-3.5 h-3.5" />}
            label="Instagram"
            value={v.socialInstagram}
            onChange={(value) => setV({ ...v, socialInstagram: value })}
            placeholder="@handle"
          />
          <SocialField
            icon={<Facebook className="w-3.5 h-3.5" />}
            label="Facebook"
            value={v.socialFacebook}
            onChange={(value) => setV({ ...v, socialFacebook: value })}
          />
          <SocialField
            icon={<Music2 className="w-3.5 h-3.5" />}
            label="TikTok"
            value={v.socialTiktok}
            onChange={(value) => setV({ ...v, socialTiktok: value })}
            placeholder="@handle"
          />
        </div>
      </div>

    </Card>
  )
}

// ---------------------------------------------------------------------------
// 2. Style, personality, languages
// ---------------------------------------------------------------------------

const STYLE_OPTIONS = [
  'modern',
  'traditional',
  'fusion',
  'luxury',
  'rustic',
  'minimal',
  'cinematic',
  'editorial',
]
const PERSONALITY_OPTIONS = [
  'decisive',
  'easygoing',
  'serene',
  'lively',
  'meticulous',
  'warm',
]
const LANGUAGE_OPTIONS = [
  { id: 'en', label: 'English' },
  { id: 'sw', label: 'Swahili' },
  { id: 'fr', label: 'French' },
]

export function AdminStylePersonalityEditor({
  vendorId,
  initial,
}: {
  vendorId: string
  initial: {
    style: string | null
    personality: string | null
    languages: string[]
  }
}) {
  const [style, setStyle] = useState<string | null>(initial.style)
  const [personality, setPersonality] = useState<string | null>(
    initial.personality
  )
  const [languages, setLanguages] = useState<string[]>(initial.languages)
  const dirty =
    style !== initial.style ||
    personality !== initial.personality ||
    JSON.stringify(languages) !== JSON.stringify(initial.languages)
  const { save } = useStorefrontSave(vendorId)

  useEditorRegistration({
    id: 'style-personality',
    label: 'Style, personality & languages',
    dirty,
    save: () => save({ style, personality, languages }),
    discard: () => {
      setStyle(initial.style)
      setPersonality(initial.personality)
      setLanguages(initial.languages)
    },
  })

  const toggleLang = (id: string) =>
    setLanguages((cur) =>
      cur.includes(id) ? cur.filter((l) => l !== id) : [...cur, id]
    )

  return (
    <Card
      icon={<Star className="w-5 h-5" strokeWidth={1.75} />}
      title="Style, personality & languages"
      subtitle="How this vendor is categorized and filtered on the marketplace."
    >
      <div className="flex flex-col gap-3">
        <Field label="Style">
          <select
            className={inputCls}
            value={style ?? ''}
            onChange={(e) => setStyle(e.target.value || null)}
          >
            <option value="">—</option>
            {STYLE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Personality">
          <select
            className={inputCls}
            value={personality ?? ''}
            onChange={(e) => setPersonality(e.target.value || null)}
          >
            <option value="">—</option>
            {PERSONALITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p[0].toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
          Languages
        </p>
        <div className="flex flex-wrap gap-1.5">
          {LANGUAGE_OPTIONS.map((l) => {
            const on = languages.includes(l.id)
            return (
              <button data-opus-button="neutral" data-opus-button-size="small"
                key={l.id}
                type="button"
                onClick={() => toggleLang(l.id)}
                className={cn(
                  'inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors',
                  on
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                )}
              >
                {on && <Check className="w-3 h-3" strokeWidth={3} />}
                {l.label}
              </button>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 3. Business hours
// ---------------------------------------------------------------------------

const DAYS: Array<{
  key: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
  label: string
}> = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
]

type DayHours = { open: boolean; from: string; to: string }
type HoursMap = Record<(typeof DAYS)[number]['key'], DayHours>

const DEFAULT_HOURS: HoursMap = {
  mon: { open: true, from: '09:00', to: '18:00' },
  tue: { open: true, from: '09:00', to: '18:00' },
  wed: { open: true, from: '09:00', to: '18:00' },
  thu: { open: true, from: '09:00', to: '18:00' },
  fri: { open: true, from: '09:00', to: '18:00' },
  sat: { open: true, from: '10:00', to: '20:00' },
  sun: { open: false, from: '09:00', to: '18:00' },
}

export function AdminHoursEditor({
  vendorId,
  initial,
}: {
  vendorId: string
  initial: HoursMap | null
}) {
  const seed = initial ?? DEFAULT_HOURS
  const [hours, setHours] = useState<HoursMap>(seed)
  const dirty = JSON.stringify(hours) !== JSON.stringify(seed)
  const { save } = useStorefrontSave(vendorId)

  useEditorRegistration({
    id: 'hours',
    label: 'Business hours',
    dirty,
    save: () => save({ hours }),
    discard: () => setHours(seed),
  })

  return (
    <Card
      icon={<Calendar className="w-5 h-5" strokeWidth={1.75} />}
      title="Business hours"
      subtitle="Weekly availability shown on the public storefront."
    >
      <ul className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100 bg-white">
        {DAYS.map(({ key, label }) => {
          const day = hours[key]
          return (
            <li
              key={key}
              className="flex items-center gap-3 px-4 py-2.5 text-sm flex-wrap"
            >
              <label className="inline-flex items-center gap-2 w-20 shrink-0">
                <input
                  type="checkbox"
                  checked={day.open}
                  onChange={(e) =>
                    setHours({
                      ...hours,
                      [key]: { ...day, open: e.target.checked },
                    })
                  }
                />
                <span className="font-semibold text-gray-700">{label}</span>
              </label>
              <input
                type="time"
                value={day.from}
                disabled={!day.open}
                onChange={(e) =>
                  setHours({
                    ...hours,
                    [key]: { ...day, from: e.target.value },
                  })
                }
                className="px-2 py-1 border border-gray-300 rounded text-sm font-mono disabled:bg-gray-50 disabled:text-gray-400"
              />
              <span className="text-gray-400">–</span>
              <input
                type="time"
                value={day.to}
                disabled={!day.open}
                onChange={(e) =>
                  setHours({ ...hours, [key]: { ...day, to: e.target.value } })
                }
                className="px-2 py-1 border border-gray-300 rounded text-sm font-mono disabled:bg-gray-50 disabled:text-gray-400"
              />
              {!day.open && (
                <span className="text-xs text-gray-400 italic ml-2">
                  Closed
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 4. Booking policies
// ---------------------------------------------------------------------------

export function AdminBookingPoliciesEditor({
  vendorId,
  initial,
}: {
  vendorId: string
  initial: {
    depositPercent: string | null
    cancellationLevel: string | null
    reschedulePolicy: string | null
    parallelBookingCapacity: number | null
  }
}) {
  const [v, setV] = useState(initial)
  const dirty = JSON.stringify(v) !== JSON.stringify(initial)
  const { save } = useStorefrontSave(vendorId)

  useEditorRegistration({
    id: 'booking-policies',
    label: 'Booking policies',
    dirty,
    save: () =>
      save({
        depositPercent: v.depositPercent,
        cancellationLevel: v.cancellationLevel,
        reschedulePolicy: v.reschedulePolicy,
        parallelBookingCapacity: v.parallelBookingCapacity,
      }),
    discard: () => setV(initial),
  })

  return (
    <Card
      icon={<ClipboardList className="w-5 h-5" strokeWidth={1.75} />}
      title="Booking policies"
      subtitle="Deposit, cancellation, rescheduling, and daily booking capacity."
    >
      <div className="flex flex-col gap-3">
        <Field label="Deposit (%)">
          <input
            type="number"
            min={0}
            max={100}
            className={inputCls}
            value={v.depositPercent ?? ''}
            onChange={(e) =>
              setV({ ...v, depositPercent: e.target.value || null })
            }
          />
        </Field>
        <Field label="Parallel bookings/day">
          <input
            type="number"
            min={1}
            className={inputCls}
            value={v.parallelBookingCapacity ?? ''}
            onChange={(e) =>
              setV({
                ...v,
                parallelBookingCapacity:
                  e.target.value === '' ? null : Number(e.target.value),
              })
            }
          />
        </Field>
        <Field label="Cancellation policy">
          <select
            className={inputCls}
            value={v.cancellationLevel ?? ''}
            onChange={(e) =>
              setV({ ...v, cancellationLevel: e.target.value || null })
            }
          >
            <option value="">—</option>
            <option value="flexible">Flexible</option>
            <option value="moderate">Moderate</option>
            <option value="strict">Strict</option>
          </select>
        </Field>
        <Field label="Reschedule policy">
          <select
            className={inputCls}
            value={v.reschedulePolicy ?? ''}
            onChange={(e) =>
              setV({ ...v, reschedulePolicy: e.target.value || null })
            }
          >
            <option value="">—</option>
            <option value="one-free">One free reschedule</option>
            <option value="unlimited">Unlimited reschedules</option>
            <option value="none">No reschedules</option>
          </select>
        </Field>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 4b. Pricing extras + capacity + map coordinates
//
// These are admin-fillable fields the vendor portal doesn't surface its own
// editor for: `starting_price` / `custom_quotes` come from onboarding but had
// no column until migration 20260624000001; `capacity` + `lat`/`lng` are the
// fields the portal "Capacity & location" card used to own before it was
// removed. Centralising them here keeps the public detail page populated.
// ---------------------------------------------------------------------------

export function AdminPricingCapacityEditor({
  vendorId,
  initial,
}: {
  vendorId: string
  initial: {
    startingPrice: string | null
    customQuotes: boolean | null
    capacityMin: number | null
    capacityMax: number | null
    lat: number | null
    lng: number | null
  }
}) {
  const [v, setV] = useState(initial)
  const dirty = JSON.stringify(v) !== JSON.stringify(initial)
  const { save } = useStorefrontSave(vendorId)

  useEditorRegistration({
    id: 'pricing-capacity',
    label: 'Pricing & capacity',
    dirty,
    save: () =>
      save({
        startingPrice: v.startingPrice,
        customQuotes: v.customQuotes,
        capacityMin: v.capacityMin,
        capacityMax: v.capacityMax,
        lat: v.lat,
        lng: v.lng,
      }),
    discard: () => setV(initial),
  })

  const numOrNull = (s: string) => (s === '' ? null : Number(s))

  return (
    <Card
      icon={<Banknote className="w-5 h-5" strokeWidth={1.75} />}
      title="Pricing & capacity"
      subtitle="Starting price, custom quotes, guest capacity, and map location couples see on the public page."
    >
      <div className="flex flex-col gap-3">
        <Field label="Starting price (TZS)">
          <input
            className={inputCls}
            value={v.startingPrice ?? ''}
            placeholder="e.g. 500,000"
            onChange={(e) =>
              setV({ ...v, startingPrice: e.target.value || null })
            }
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={!!v.customQuotes}
            onChange={(e) => setV({ ...v, customQuotes: e.target.checked })}
          />
          Accepts custom quotes
        </label>
      </div>

      <div className="mt-5 pt-4 border-t border-gray-100">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
          Guest capacity
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Minimum">
            <input
              type="number"
              min={0}
              className={inputCls}
              value={v.capacityMin ?? ''}
              onChange={(e) =>
                setV({ ...v, capacityMin: numOrNull(e.target.value) })
              }
            />
          </Field>
          <Field label="Maximum">
            <input
              type="number"
              min={0}
              className={inputCls}
              value={v.capacityMax ?? ''}
              onChange={(e) =>
                setV({ ...v, capacityMax: numOrNull(e.target.value) })
              }
            />
          </Field>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-gray-100">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" /> Map location
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude">
            <input
              type="number"
              step="any"
              className={inputCls}
              value={v.lat ?? ''}
              onChange={(e) => setV({ ...v, lat: numOrNull(e.target.value) })}
            />
          </Field>
          <Field label="Longitude">
            <input
              type="number"
              step="any"
              className={inputCls}
              value={v.lng ?? ''}
              onChange={(e) => setV({ ...v, lng: numOrNull(e.target.value) })}
            />
          </Field>
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 5. Recognition (awards text + response time + locally owned)
// ---------------------------------------------------------------------------

export function AdminRecognitionEditor({
  vendorId,
  initial,
}: {
  vendorId: string
  initial: {
    awards: string | null
    responseTimeHours: string | null
    locallyOwned: boolean | null
  }
}) {
  const [v, setV] = useState(initial)
  const dirty = JSON.stringify(v) !== JSON.stringify(initial)
  const { save } = useStorefrontSave(vendorId)

  useEditorRegistration({
    id: 'recognition',
    label: 'Recognition',
    dirty,
    save: () =>
      save({
        awards: v.awards,
        responseTimeHours: v.responseTimeHours,
        locallyOwned: v.locallyOwned,
      }),
    discard: () => setV(initial),
  })

  return (
    <Card
      icon={<AlertCircle className="w-5 h-5" strokeWidth={1.75} />}
      title="Recognition"
      subtitle="Awards, response expectations, and local ownership signals."
    >
      <Field label="Awards & recognition (free text)">
        <textarea
          rows={4}
          className={inputCls}
          value={v.awards ?? ''}
          onChange={(e) => setV({ ...v, awards: e.target.value || null })}
          placeholder="e.g. Best Wedding Venue 2024 — Tanzania Hospitality Awards"
        />
      </Field>
      <div className="flex flex-col gap-3 mt-3">
        <Field label="Typical response time">
          <input
            className={inputCls}
            value={v.responseTimeHours ?? ''}
            onChange={(e) =>
              setV({ ...v, responseTimeHours: e.target.value || null })
            }
            placeholder="e.g. 4 hours"
          />
        </Field>
        <Field label="Locally owned">
          <label className="inline-flex items-center gap-2 mt-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={v.locallyOwned ?? false}
              onChange={(e) => setV({ ...v, locallyOwned: e.target.checked })}
            />
            Tanzanian-owned & operated
          </label>
        </Field>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 6. Team CRUD
// ---------------------------------------------------------------------------

type TeamMember = {
  id: string
  name: string
  role: string
  bio: string
  // Public URL of the avatar the vendor uploaded (vendors.team[].avatar).
  // Read-only here — admins display it but the vendor owns uploads. Preserved
  // through save so an admin edit never wipes the photo.
  avatar?: string
}

export function AdminTeamEditor({
  vendorId,
  initial,
}: {
  vendorId: string
  initial: TeamMember[]
}) {
  const [team, setTeam] = useState<TeamMember[]>(initial)
  const dirty = JSON.stringify(team) !== JSON.stringify(initial)
  const { save } = useStorefrontSave(vendorId)

  useEditorRegistration({
    id: 'team',
    label: 'Team members',
    dirty,
    save: () =>
      save({
        team: team
          .filter((m) => m.name.trim() || m.role.trim())
          .map((m) => ({
            id: m.id,
            name: m.name.trim(),
            role: m.role.trim(),
            bio: m.bio.trim() || undefined,
            // Preserve the vendor-uploaded avatar — admins don't edit it, but
            // dropping it here would wipe the photo on any admin team save.
            avatar: m.avatar,
          })),
      }),
    discard: () => setTeam(initial),
  })

  const add = () =>
    setTeam([...team, { id: newId(), name: '', role: '', bio: '' }])
  const update = (id: string, patch: Partial<TeamMember>) =>
    setTeam(team.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  const remove = (id: string) => setTeam(team.filter((m) => m.id !== id))

  return (
    <Card
      icon={<Users className="w-5 h-5" strokeWidth={1.75} />}
      title="Team members"
      subtitle="People shown on the vendor storefront."
    >
      {team.length === 0 ? (
        <EmptyState
          icon={<Users className="w-6 h-6" strokeWidth={1.75} />}
          message="No team members yet. Add the people couples will see on the storefront."
          ctaLabel="Add first member"
          onCta={add}
        />
      ) : (
        <ul className="space-y-3">
          {team.map((m) => (
            <li
              key={m.id}
              className="rounded-xl border border-gray-100 bg-gray-50 p-3"
            >
              <div className="mb-2 flex items-center gap-3">
                {m.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.avatar}
                    alt={m.name || 'Team member'}
                    className="h-12 w-12 shrink-0 rounded-full border border-gray-200 object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-dashed border-gray-300 bg-white text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    No photo
                  </div>
                )}
                <span className="text-xs text-gray-500">
                  {m.avatar ? 'Photo uploaded by vendor' : 'No photo uploaded'}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <Field label="Name">
                  <input
                    className={inputCls}
                    value={m.name}
                    onChange={(e) => update(m.id, { name: e.target.value })}
                  />
                </Field>
                <Field label="Role">
                  <input
                    className={inputCls}
                    value={m.role}
                    onChange={(e) => update(m.id, { role: e.target.value })}
                  />
                </Field>
              </div>
              <div className="mt-2">
                <Field label="Bio">
                  <textarea
                    rows={2}
                    className={inputCls}
                    value={m.bio}
                    onChange={(e) => update(m.id, { bio: e.target.value })}
                  />
                </Field>
              </div>
              <button data-opus-button="control"
                type="button"
                onClick={() => remove(m.id)}
                className="mt-2 inline-flex items-center gap-1 text-xs text-rose-700 hover:text-rose-900 font-semibold"
              >
                <Trash2 className="w-3 h-3" /> Remove member
              </button>
            </li>
          ))}
        </ul>
      )}
      {team.length > 0 && (
        <button data-opus-button="control"
          type="button"
          onClick={add}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900"
        >
          <Plus className="w-3.5 h-3.5" /> Add team member
        </button>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 7. FAQ CRUD
// ---------------------------------------------------------------------------

type Faq = { id: string; question: string; answer: string }

export function AdminFaqEditor({
  vendorId,
  initial,
}: {
  vendorId: string
  initial: Faq[]
}) {
  const [faqs, setFaqs] = useState<Faq[]>(initial)
  const dirty = JSON.stringify(faqs) !== JSON.stringify(initial)
  const { save } = useStorefrontSave(vendorId)

  useEditorRegistration({
    id: 'faqs',
    label: 'FAQs',
    dirty,
    save: () =>
      save({
        faqs: faqs
          .filter((f) => f.question.trim() && f.answer.trim())
          .map((f) => ({
            id: f.id,
            question: f.question.trim(),
            answer: f.answer.trim(),
          })),
      }),
    discard: () => setFaqs(initial),
  })

  const add = () =>
    setFaqs([...faqs, { id: newId(), question: '', answer: '' }])
  const update = (id: string, patch: Partial<Faq>) =>
    setFaqs(faqs.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  const remove = (id: string) => setFaqs(faqs.filter((f) => f.id !== id))

  return (
    <Card
      icon={<HelpCircle className="w-5 h-5" strokeWidth={1.75} />}
      title="FAQs"
      subtitle="Questions and answers couples see before inquiring."
    >
      {faqs.length === 0 ? (
        <EmptyState
          icon={<HelpCircle className="w-6 h-6" strokeWidth={1.75} />}
          message="No FAQs yet. Add answers to questions couples ask before inquiring."
          ctaLabel="Add first FAQ"
          onCta={add}
        />
      ) : (
        <ul className="space-y-3">
          {faqs.map((f) => (
            <li
              key={f.id}
              className="rounded-xl border border-gray-100 bg-gray-50 p-3"
            >
              <Field label="Question">
                <input
                  className={inputCls}
                  value={f.question}
                  onChange={(e) => update(f.id, { question: e.target.value })}
                />
              </Field>
              <div className="mt-2">
                <Field label="Answer">
                  <textarea
                    rows={2}
                    className={inputCls}
                    value={f.answer}
                    onChange={(e) => update(f.id, { answer: e.target.value })}
                  />
                </Field>
              </div>
              <button data-opus-button="control"
                type="button"
                onClick={() => remove(f.id)}
                className="mt-2 inline-flex items-center gap-1 text-xs text-rose-700 hover:text-rose-900 font-semibold"
              >
                <Trash2 className="w-3 h-3" /> Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {faqs.length > 0 && (
        <button data-opus-button="control"
          type="button"
          onClick={add}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900"
        >
          <Plus className="w-3.5 h-3.5" /> Add FAQ
        </button>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 8. Packages CRUD
// ---------------------------------------------------------------------------

type Package = {
  id: string
  name: string
  price: string
  description: string
  includes: string
}

export function AdminPackagesEditor({
  vendorId,
  initial,
}: {
  vendorId: string
  initial: Package[]
}) {
  const [packages, setPackages] = useState<Package[]>(initial)
  const dirty = JSON.stringify(packages) !== JSON.stringify(initial)
  const { save } = useStorefrontSave(vendorId)

  useEditorRegistration({
    id: 'packages',
    label: 'Packages & pricing',
    dirty,
    save: () =>
      save({
        packages: packages
          .filter((p) => p.name.trim() && p.price.trim())
          .map((p) => ({
            id: p.id,
            name: p.name.trim(),
            price: p.price.trim(),
            description: p.description.trim() || undefined,
            includes: p.includes
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter(Boolean),
          })),
      }),
    discard: () => setPackages(initial),
  })

  const add = () =>
    setPackages([
      ...packages,
      { id: newId(), name: '', price: '', description: '', includes: '' },
    ])
  const update = (id: string, patch: Partial<Package>) =>
    setPackages(packages.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const remove = (id: string) =>
    setPackages(packages.filter((p) => p.id !== id))

  return (
    <Card
      icon={<Star className="w-5 h-5" strokeWidth={1.75} />}
      title="Packages & pricing"
      subtitle="Commercial packages, prices, descriptions, and included items."
    >
      {packages.length === 0 ? (
        <EmptyState
          icon={<Star className="w-6 h-6" strokeWidth={1.75} />}
          message="No packages yet. Add the commercial offers couples can choose from."
          ctaLabel="Add first package"
          onCta={add}
        />
      ) : (
        <ul className="space-y-3">
          {packages.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border border-gray-100 bg-gray-50 p-3"
            >
              <div className="flex flex-col gap-2">
                <Field label="Package name">
                  <input
                    className={inputCls}
                    value={p.name}
                    onChange={(e) => update(p.id, { name: e.target.value })}
                    placeholder="e.g. Signature"
                  />
                </Field>
                <Field label="Price (TZS)">
                  <input
                    className={inputCls}
                    value={p.price}
                    onChange={(e) => update(p.id, { price: e.target.value })}
                    placeholder="4500000"
                  />
                </Field>
              </div>
              <div className="mt-2">
                <Field label="Description">
                  <textarea
                    rows={2}
                    className={inputCls}
                    value={p.description}
                    onChange={(e) =>
                      update(p.id, { description: e.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="mt-2">
                <Field label="Includes (one per line)">
                  <textarea
                    rows={3}
                    className={inputCls}
                    value={p.includes}
                    onChange={(e) => update(p.id, { includes: e.target.value })}
                    placeholder="In-house catering for 200&#10;Setup + breakdown&#10;Bridal suite"
                  />
                </Field>
              </div>
              <button data-opus-button="control"
                type="button"
                onClick={() => remove(p.id)}
                className="mt-2 inline-flex items-center gap-1 text-xs text-rose-700 hover:text-rose-900 font-semibold"
              >
                <Trash2 className="w-3 h-3" /> Remove package
              </button>
            </li>
          ))}
        </ul>
      )}
      {packages.length > 0 && (
        <button data-opus-button="control"
          type="button"
          onClick={add}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900"
        >
          <Plus className="w-3.5 h-3.5" /> Add package
        </button>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Photos & Videos — admin curation of the storefront gallery
//
// Couples spend the most time staring at the vendor's portfolio. Admin
// needs to be able to:
//   - swap a watermarked cover photo,
//   - add gallery photos a vendor emails over,
//   - upload a highlight reel the vendor couldn't get through the portal,
//   - drop in a YouTube/Vimeo embed link,
//   - remove anything inappropriate.
//
// Reads the same `cover_image` / `gallery_urls` / `video_urls` columns the
// vendor portal writes to, so changes show up immediately on the public
// profile.
// ---------------------------------------------------------------------------

const HTTP_URL = /^https?:\/\//i

function isVideoEmbedUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (
      u.hostname.includes('youtube.com') ||
      u.hostname.includes('youtu.be') ||
      u.hostname.includes('vimeo.com')
    )
  } catch {
    return false
  }
}

export function AdminPhotosVideosEditor({
  vendorId,
  initial,
}: {
  vendorId: string
  initial: {
    coverImage: string | null
    galleryUrls: string[]
    videoUrls: string[]
  }
}) {
  const [coverImage, setCoverImage] = useState<string | null>(initial.coverImage)
  const [galleryUrls, setGalleryUrls] = useState<string[]>(initial.galleryUrls)
  const [videoUrls, setVideoUrls] = useState<string[]>(initial.videoUrls)
  const [embedDraft, setEmbedDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [photoUploads, setPhotoUploads] = useState(0)
  const [videoUploads, setVideoUploads] = useState(0)
  const [coverBusy, setCoverBusy] = useState(false)

  const dirty =
    coverImage !== initial.coverImage ||
    JSON.stringify(galleryUrls) !== JSON.stringify(initial.galleryUrls) ||
    JSON.stringify(videoUrls) !== JSON.stringify(initial.videoUrls)

  const { save } = useStorefrontSave(vendorId)

  useEditorRegistration({
    id: 'photos-videos',
    label: 'Photos & videos',
    dirty,
    save: () =>
      save({
        coverImage: coverImage ?? null,
        galleryUrls: galleryUrls.filter((u) => HTTP_URL.test(u)),
        videoUrls: videoUrls.filter((u) => HTTP_URL.test(u)),
      }),
    discard: () => {
      setCoverImage(initial.coverImage)
      setGalleryUrls(initial.galleryUrls)
      setVideoUrls(initial.videoUrls)
    },
  })

  const uploadPhoto = async (file: File, kind: 'cover' | 'gallery') => {
    const fd = new FormData()
    fd.append('vendorId', vendorId)
    fd.append('kind', kind)
    fd.append('file', file)
    return adminUploadVendorPhoto(fd)
  }

  const onCoverPick = async (file: File) => {
    setError(null)
    setCoverBusy(true)
    const res = await uploadPhoto(file, 'cover')
    setCoverBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setCoverImage(res.url)
  }

  const onGalleryPick = async (files: FileList) => {
    setError(null)
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (list.length === 0) return
    setPhotoUploads((n) => n + list.length)
    const errors: string[] = []
    const added: string[] = []
    // Upload sequentially — admin gallery additions are small batches; the
    // simple loop keeps error messages aligned with file order.
    for (const file of list) {
      const res = await uploadPhoto(file, 'gallery')
      if (res.ok) added.push(res.url)
      else errors.push(`${file.name}: ${res.error}`)
      setPhotoUploads((n) => n - 1)
    }
    if (added.length > 0) setGalleryUrls((prev) => [...prev, ...added])
    if (errors.length > 0) {
      setError(errors.length === 1 ? errors[0] : `${added.length} of ${list.length} uploaded · ${errors[0]}`)
    }
  }

  const onVideoPick = async (files: FileList) => {
    setError(null)
    const list = Array.from(files).filter((f) => f.type.startsWith('video/'))
    if (list.length === 0) return
    setVideoUploads((n) => n + list.length)
    const errors: string[] = []
    const added: string[] = []
    for (const file of list) {
      const minted = await adminCreateVendorVideoUploadUrl({
        vendorId,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      })
      if (!minted.ok) {
        errors.push(`${file.name}: ${minted.error}`)
        setVideoUploads((n) => n - 1)
        continue
      }
      try {
        const put = await fetch(minted.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type, 'x-upsert': 'false' },
          body: file,
        })
        if (!put.ok) {
          const body = await put.text().catch(() => '')
          errors.push(
            `${file.name}: storage rejected (${put.status}${body ? `: ${body.slice(0, 120)}` : ''})`,
          )
        } else {
          added.push(minted.publicUrl)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed.'
        errors.push(`${file.name}: ${message}`)
      } finally {
        setVideoUploads((n) => n - 1)
      }
    }
    if (added.length > 0) setVideoUrls((prev) => [...prev, ...added])
    if (errors.length > 0) {
      setError(errors.length === 1 ? errors[0] : `${added.length} of ${list.length} uploaded · ${errors[0]}`)
    }
  }

  const addEmbed = () => {
    const trimmed = embedDraft.trim()
    if (!trimmed || !HTTP_URL.test(trimmed)) {
      setError('Embed URL must start with http:// or https://')
      return
    }
    setError(null)
    setVideoUrls((prev) => [...prev, trimmed])
    setEmbedDraft('')
  }

  const removeGalleryAt = (idx: number) =>
    setGalleryUrls((prev) => prev.filter((_, i) => i !== idx))
  const removeVideoAt = (idx: number) =>
    setVideoUrls((prev) => prev.filter((_, i) => i !== idx))

  return (
    <Card
      icon={<ImageIcon className="w-5 h-5" strokeWidth={1.75} />}
      title="Photos & videos"
      subtitle="Replace a cover, add photos the vendor emailed over, upload a highlight reel, or paste a YouTube/Vimeo link. Changes go live on the public profile when you save all."
    >
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2">
          <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
          <p className="text-xs text-rose-800 leading-relaxed">{error}</p>
        </div>
      )}

      <div className="space-y-6">
        {/* Cover photo */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Cover photo
            </h3>
            <CoverPicker busy={coverBusy} onPick={onCoverPick} />
          </div>
          {coverImage ? (
            <div className="relative w-full max-w-xl rounded-xl overflow-hidden border border-gray-100 bg-gray-100 aspect-[16/9]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverImage} alt="Cover" className="w-full h-full object-cover" />
              <button data-opus-button="danger" data-opus-button-size="small"
                type="button"
                onClick={() => setCoverImage(null)}
                className="absolute top-2 right-2 inline-flex items-center gap-1 text-xs font-semibold bg-white/95 hover:bg-white text-rose-700 px-2 py-1 rounded-md shadow-sm"
              >
                <Trash2 className="w-3 h-3" /> Remove
              </button>
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic">
              No cover photo yet. Upload one to set the hero image on the public profile.
            </p>
          )}
        </section>

        {/* Gallery */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Gallery photos
              </h3>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {galleryUrls.length} photo{galleryUrls.length === 1 ? '' : 's'}.
                {photoUploads > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 text-amber-700">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Uploading {photoUploads}…
                  </span>
                )}
              </p>
            </div>
            <GalleryPicker
              busy={photoUploads > 0}
              onPick={onGalleryPick}
            />
          </div>
          {galleryUrls.length === 0 ? (
            <p className="text-xs text-gray-500 italic">
              No gallery photos yet. Upload as many as the vendor sent over.
            </p>
          ) : (
            <ul className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
              {galleryUrls.map((url, i) => (
                <li
                  key={`${url}-${i}`}
                  className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="Gallery photo" className="w-full h-full object-cover" />
                  <button data-opus-button="control"
                    type="button"
                    onClick={() => removeGalleryAt(i)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/95 text-rose-700 hover:bg-rose-50 inline-flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Remove photo"
                    title="Remove"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Videos */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Videos
              </h3>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {videoUrls.length} video{videoUrls.length === 1 ? '' : 's'}.
                {videoUploads > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 text-amber-700">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Uploading {videoUploads}…
                  </span>
                )}
              </p>
            </div>
            <VideoPicker
              busy={videoUploads > 0}
              onPick={onVideoPick}
            />
          </div>
          {videoUrls.length === 0 ? (
            <p className="text-xs text-gray-500 italic mb-3">
              No videos yet. Upload an MP4/MOV/WebM reel or paste a YouTube / Vimeo link below.
            </p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
              {videoUrls.map((url, i) => (
                <li
                  key={`${url}-${i}`}
                  className="relative aspect-video rounded-lg overflow-hidden bg-gray-900 group"
                >
                  {isVideoEmbedUrl(url) ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-white gap-1.5"
                    >
                      <Link2 className="w-5 h-5" />
                      <span className="text-[11px] font-semibold truncate max-w-[80%]">
                        {url}
                      </span>
                    </a>
                  ) : (
                    <video
                      src={url}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover bg-black"
                    />
                  )}
                  <button data-opus-button="control"
                    type="button"
                    onClick={() => removeVideoAt(i)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/95 text-rose-700 hover:bg-rose-50 inline-flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Remove video"
                    title="Remove"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <Field label="Paste YouTube or Vimeo URL">
              <div className="flex gap-2">
                <input
                  type="url"
                  className={inputCls}
                  value={embedDraft}
                  onChange={(e) => setEmbedDraft(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=…"
                />
                <button data-opus-button="primary" data-opus-button-size="medium"
                  type="button"
                  onClick={addEmbed}
                  disabled={!embedDraft.trim()}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  <Plus className="w-3.5 h-3.5" /> Add link
                </button>
              </div>
            </Field>
          </div>
        </section>
      </div>
    </Card>
  )
}

function CoverPicker({
  busy,
  onPick,
}: {
  busy: boolean
  onPick: (file: File) => void
}) {
  return (
    <label
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full cursor-pointer transition-colors',
        busy
          ? 'bg-gray-300 text-white cursor-wait'
          : 'bg-gray-900 hover:bg-gray-800 text-white',
      )}
    >
      {busy ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <UploadCloud className="w-3.5 h-3.5" />
      )}
      {busy ? 'Uploading…' : 'Upload cover'}
      <input
        type="file"
        className="hidden"
        accept="image/*"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPick(file)
          e.target.value = ''
        }}
      />
    </label>
  )
}

function GalleryPicker({
  busy,
  onPick,
}: {
  busy: boolean
  onPick: (files: FileList) => void
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-gray-900 hover:bg-gray-800 text-white cursor-pointer transition-colors">
      <UploadCloud className="w-3.5 h-3.5" />
      Upload photos
      <input
        type="file"
        className="hidden"
        accept="image/*"
        multiple
        disabled={busy}
        onChange={(e) => {
          if (e.target.files) onPick(e.target.files)
          e.target.value = ''
        }}
      />
    </label>
  )
}

function VideoPicker({
  busy,
  onPick,
}: {
  busy: boolean
  onPick: (files: FileList) => void
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-gray-900 hover:bg-gray-800 text-white cursor-pointer transition-colors">
      <VideoIcon className="w-3.5 h-3.5" />
      Upload videos
      <input
        type="file"
        className="hidden"
        accept="video/mp4,video/webm,video/quicktime"
        multiple
        disabled={busy}
        onChange={(e) => {
          if (e.target.files) onPick(e.target.files)
          e.target.value = ''
        }}
      />
    </label>
  )
}
