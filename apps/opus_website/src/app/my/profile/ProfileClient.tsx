'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClerk } from '@clerk/nextjs'
import { toast } from 'sonner'
import {
  Calendar, Check, ChevronRight, Heart,
  LogOut, MapPin, MessageCircle, Pencil,
  Phone, Tag, Trash2, Users, Wallet, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Constants ────────────────────────────────────────────────────────────────

const BUDGET_LABELS: Record<string, string> = {
  under_5m:   'Under TZS 5M',
  '5m_15m':   'TZS 5–15M',
  '15m_30m':  'TZS 15–30M',
  '30m_50m':  'TZS 30–50M',
  over_50m:   'Over TZS 50M',
  undisclosed:'Prefer not to say',
}

const BUDGET_OPTIONS = Object.entries(BUDGET_LABELS).map(([value, label]) => ({ value, label }))

const TZ_REGIONS = [
  'Dar es Salaam','Zanzibar','Arusha','Mwanza','Dodoma',
  'Mbeya','Tanga','Kilimanjaro','Morogoro','Iringa','Other',
]

const CATEGORY_OPTIONS = [
  { value: 'venues',           label: 'Venues' },
  { value: 'photographers',    label: 'Photographers' },
  { value: 'videographers',    label: 'Videographers' },
  { value: 'caterers',         label: 'Caterers' },
  { value: 'djs-music',        label: 'DJs & Music' },
  { value: 'florists',         label: 'Florists' },
  { value: 'wedding-planners', label: 'Wedding Planners' },
  { value: 'hair-makeup',      label: 'Hair & Makeup' },
  { value: 'cakes-desserts',   label: 'Cakes & Desserts' },
  { value: 'decorators',       label: 'Decorators' },
]

// ── Types ────────────────────────────────────────────────────────────────────

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

type Props = {
  clerkName: string | null
  clerkEmail: string | null
  clerkImageUrl: string | null
  profile: CoupleProfile | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso)
  return new Date(dateOnly ? `${iso}T00:00:00` : iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
    ...(dateOnly ? { timeZone: 'UTC' } : {}),
  })
}

// ── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ imageUrl, name }: { imageUrl: string | null; name: string | null }) {
  const initials = name
    ? name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
    : '?'
  return imageUrl ? (
    <Image
      src={imageUrl}
      alt={name ?? 'Profile'}
      width={80}
      height={80}
      className="w-20 h-20 rounded-full object-cover ring-4 ring-white shadow"
    />
  ) : (
    <div className="w-20 h-20 rounded-full bg-(--accent)/20 text-(--accent) font-bold text-2xl flex items-center justify-center ring-4 ring-white shadow">
      {initials}
    </div>
  )
}

// ── Detail row ────────────────────────────────────────────────────────────────

function DetailRow({ icon: Icon, label, value }: {
  icon: React.ElementType; label: string; value: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-3.5 border-b border-gray-100 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-gray-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">{label}</p>
        <div className="text-sm font-semibold text-[#1A1A1A]">{value ?? <span className="text-gray-300 font-normal">—</span>}</div>
      </div>
    </div>
  )
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

function DeleteModal({ onCancel, onConfirm, deleting }: {
  onCancel: () => void
  onConfirm: () => void
  deleting: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-red-500" />
          </div>
          <button data-opus-button="control" onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">Delete your account?</h2>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          This will permanently delete your profile, wedding details, and all saved data. Your inquiry history with vendors will remain for their records but will no longer be linked to you. This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button data-opus-button="control"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-full border-2 border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button data-opus-button="danger" data-opus-button-size="medium"
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 py-2.5 rounded-full bg-red-500 hover:bg-red-600 text-sm font-semibold text-white transition-colors disabled:opacity-60"
          >
            {deleting ? 'Deleting…' : 'Yes, delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit form ─────────────────────────────────────────────────────────────────

function EditForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: CoupleProfile
  onSave: (updated: CoupleProfile) => void
  onCancel: () => void
}) {
  const [partner1Name, setPartner1Name] = useState(initial.partner1_name ?? '')
  const [partner2Name, setPartner2Name] = useState(initial.partner2_name ?? '')
  const [weddingDate, setWeddingDate] = useState(initial.wedding_date ?? '')
  const [dateUndecided, setDateUndecided] = useState(initial.date_undecided ?? false)
  const [city, setCity] = useState(initial.city ?? '')
  const [region, setRegion] = useState(initial.region ?? '')
  const [guestCount, setGuestCount] = useState(initial.guest_count != null ? String(initial.guest_count) : '')
  const [budgetRange, setBudgetRange] = useState(initial.budget_range ?? '')
  const [whatsappPhone, setWhatsappPhone] = useState(initial.whatsapp_phone ?? '')
  const [categories, setCategories] = useState<Set<string>>(new Set(initial.preferred_categories ?? []))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleCat = (v: string) => setCategories(prev => {
    const next = new Set(prev)
    next.has(v) ? next.delete(v) : next.add(v)
    return next
  })

  async function handleSave() {
    if (!partner1Name.trim() || !partner2Name.trim() || !city.trim()) return
    setSaving(true)
    setError(null)
    try {
      const guestCountNum = guestCount.trim() ? parseInt(guestCount, 10) : null
      const res = await fetch('/api/my/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partner1Name: partner1Name.trim(),
          partner2Name: partner2Name.trim(),
          weddingDate: dateUndecided ? null : weddingDate || null,
          dateUndecided,
          city: city.trim(),
          region: region || null,
          guestCount: guestCountNum && !isNaN(guestCountNum) ? guestCountNum : null,
          budgetRange: budgetRange || null,
          whatsappPhone: whatsappPhone.trim() || null,
          preferredCategories: Array.from(categories),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Update failed')
      }
      onSave({
        partner1_name: partner1Name.trim(),
        partner2_name: partner2Name.trim(),
        wedding_date: dateUndecided ? null : weddingDate || null,
        date_undecided: dateUndecided,
        city: city.trim(),
        region: region || null,
        guest_count: guestCountNum && !isNaN(guestCountNum) ? guestCountNum : null,
        budget_range: budgetRange || null,
        whatsapp_phone: whatsappPhone.trim() || null,
        preferred_categories: Array.from(categories),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setError(message)
      toast.error(message)
      setSaving(false)
    }
  }

  const inputCls = 'border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#1A1A1A] w-full transition-colors placeholder-gray-300'
  const labelCls = 'text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1 block'

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Your name</label>
          <input type="text" value={partner1Name} onChange={e => setPartner1Name(e.target.value)}
            placeholder="e.g. Amina" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Partner&apos;s name</label>
          <input type="text" value={partner2Name} onChange={e => setPartner2Name(e.target.value)}
            placeholder="e.g. David" className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Wedding date</label>
        <input type="date" value={weddingDate} onChange={e => setWeddingDate(e.target.value)}
          disabled={dateUndecided} className={cn(inputCls, dateUndecided && 'opacity-40 cursor-not-allowed')} />
        <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
          <div
            onClick={() => { setDateUndecided(!dateUndecided); if (!dateUndecided) setWeddingDate('') }}
            className={cn('w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all',
              dateUndecided ? 'bg-(--accent) border-(--accent)' : 'border-gray-300 hover:border-[#1A1A1A]')}
          >
            {dateUndecided && <Check size={9} strokeWidth={3} className="text-white" />}
          </div>
          <span className="text-xs text-gray-500">We haven&apos;t decided yet</span>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>City</label>
          <input type="text" value={city} onChange={e => setCity(e.target.value)}
            placeholder="e.g. Dar es Salaam" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Region</label>
          <select value={region} onChange={e => setRegion(e.target.value)}
            className={cn(inputCls, 'bg-white')}>
            <option value="">Select region</option>
            {TZ_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Guest count</label>
          <input type="number" value={guestCount} onChange={e => setGuestCount(e.target.value)}
            placeholder="e.g. 150" min="1" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>WhatsApp</label>
          <input type="tel" value={whatsappPhone} onChange={e => setWhatsappPhone(e.target.value)}
            placeholder="+255 7XX XXX XXX" className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Budget range</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {BUDGET_OPTIONS.map(opt => (
            <button data-opus-button="neutral" data-opus-button-size="small" key={opt.value} type="button"
              onClick={() => setBudgetRange(budgetRange === opt.value ? '' : opt.value)}
              className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all',
                budgetRange === opt.value
                  ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white'
                  : 'border-gray-200 text-[#1A1A1A] hover:border-gray-400 bg-white'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>Vendor categories</label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {CATEGORY_OPTIONS.map(cat => (
            <button data-opus-button="neutral" data-opus-button-size="small" key={cat.value} type="button" onClick={() => toggleCat(cat.value)}
              className={cn('flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all text-left',
                categories.has(cat.value)
                  ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white'
                  : 'border-gray-200 text-[#1A1A1A] hover:border-gray-400 bg-white'
              )}
            >
              {categories.has(cat.value) && <Check size={10} strokeWidth={3} />}
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button data-opus-button="control" type="button" onClick={onCancel}
          className="flex-1 py-3 rounded-full border-2 border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button data-opus-button="primary" data-opus-button-size="large" type="button" onClick={handleSave} disabled={saving || !partner1Name.trim() || !partner2Name.trim() || !city.trim()}
          className="flex-1 py-3 rounded-full bg-(--accent) text-(--on-accent) hover:bg-(--accent-hover) text-sm font-semibold transition-colors disabled:opacity-40">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ProfileClient({ clerkName, clerkEmail, clerkImageUrl, profile: initialProfile }: Props) {
  const router = useRouter()
  const { signOut } = useClerk()
  const [profile, setProfile] = useState<CoupleProfile | null>(initialProfile)
  const [editing, setEditing] = useState(!initialProfile)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const displayName = profile
    ? [profile.partner1_name, profile.partner2_name].filter(Boolean).join(' & ')
    : clerkName

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch('/api/my/profile', { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Delete failed')
      }
      await signOut()
      router.push('/')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setDeleteError(message)
      toast.error(message)
      setDeleting(false)
    }
  }

  const emptyProfile: CoupleProfile = {
    partner1_name: null, partner2_name: null, wedding_date: null,
    date_undecided: false, city: null, region: null, guest_count: null,
    budget_range: null, whatsapp_phone: null, preferred_categories: null,
  }

  return (
    <>
      {showDelete && (
        <DeleteModal
          onCancel={() => setShowDelete(false)}
          onConfirm={handleDelete}
          deleting={deleting}
        />
      )}

      <div className="max-w-xl mx-auto px-4 py-10 sm:py-14 space-y-6">

        {/* Profile header */}
        <div className="flex items-center gap-4">
          <Avatar imageUrl={clerkImageUrl} name={displayName ?? clerkName} />
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[#1A1A1A] truncate">
              {displayName ?? 'Your profile'}
            </h1>
            {clerkEmail && <p className="text-sm text-gray-400 truncate mt-0.5">{clerkEmail}</p>}
          </div>
        </div>

        {/* Wedding details */}
        <div className="bg-white rounded-2xl border border-gray-100">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-[#1A1A1A]">Wedding details</h2>
            {!editing && (
              <button data-opus-button="control" type="button" onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-(--accent) hover:text-(--accent-hover) transition-colors">
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
            )}
          </div>

          <div className="px-5">
            {editing ? (
              <div className="py-5">
                <EditForm
                  initial={profile ?? emptyProfile}
                  onSave={(updated) => {
                    setProfile(updated)
                    setEditing(false)
                    toast.success('Profile updated')
                  }}
                  onCancel={() => setEditing(false)}
                />
              </div>
            ) : profile ? (
              <>
                <DetailRow icon={Heart} label="The couple"
                  value={[profile.partner1_name, profile.partner2_name].filter(Boolean).join(' & ')} />
                <DetailRow icon={Calendar} label="Wedding date"
                  value={profile.date_undecided ? 'Date not yet decided' : profile.wedding_date ? formatDate(profile.wedding_date) : null} />
                <DetailRow icon={MapPin} label="Location"
                  value={[profile.city, profile.region].filter(Boolean).join(', ')} />
                <DetailRow icon={Users} label="Guest count"
                  value={profile.guest_count != null ? `${profile.guest_count} guests` : null} />
                <DetailRow icon={Wallet} label="Budget"
                  value={profile.budget_range ? BUDGET_LABELS[profile.budget_range] : null} />
                <DetailRow icon={Phone} label="WhatsApp"
                  value={profile.whatsapp_phone} />
                <DetailRow icon={Tag} label="Looking for"
                  value={profile.preferred_categories?.length
                    ? profile.preferred_categories.map(c => CATEGORY_OPTIONS.find(o => o.value === c)?.label ?? c).join(', ')
                    : null}
                />
              </>
            ) : (
              <div className="py-8 text-center">
                <p className="text-sm text-gray-400 mb-4">Complete your wedding profile so vendors have what they need.</p>
                <button data-opus-button="primary" data-opus-button-size="medium" type="button" onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-2 bg-(--accent) text-(--on-accent) hover:bg-(--accent-hover) px-5 py-2.5 rounded-full text-sm font-semibold transition-colors">
                  Set up profile
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Quick links */}
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
          <Link href="/my/inquiries"
            className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors group">
            <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
              <MessageCircle className="w-4 h-4 text-gray-400" />
            </div>
            <span className="flex-1 text-sm font-semibold text-[#1A1A1A]">Your quote requests</span>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
          </Link>
          <Link href="/vendors"
            className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors group">
            <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
              <Heart className="w-4 h-4 text-gray-400" />
            </div>
            <span className="flex-1 text-sm font-semibold text-[#1A1A1A]">Browse vendors</span>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
          </Link>
        </div>

        {/* Account actions */}
        <div className="flex flex-col gap-2 pt-2">
          {deleteError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-1">{deleteError}</p>
          )}
          <button data-opus-button="control" type="button" onClick={() => signOut().then(() => router.push('/')).catch(() => router.push('/'))}
            className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-[#1A1A1A] transition-colors">
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
          <button data-opus-button="control" type="button" onClick={() => setShowDelete(true)}
            className="flex items-center gap-2 text-sm font-semibold text-red-400 hover:text-red-600 transition-colors">
            <Trash2 className="w-4 h-4" />
            Delete account
          </button>
        </div>

      </div>
    </>
  )
}
