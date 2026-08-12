'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useUser, useClerk } from '@clerk/nextjs'
import {
  ArrowUpRight,
  Camera,
  CheckCircle2,
  ChevronRight,
  LogOut,
  Mail,
  Phone,
  Shield,
  Store,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CurrentVendor } from '@/lib/vendor'
import { usePortalT } from '@/components/providers/PortalUIStringsProvider'

const CATEGORY_LABEL: Record<string, string> = {
  Venues: 'Venue',
  Caterers: 'Caterer',
  Photographers: 'Photographer',
  Videographers: 'Videographer',
  'Cake & Desserts': 'Cake & Desserts',
  Florists: 'Florist',
  'Wedding Planners': 'Wedding Planner',
  'DJs & Music': 'DJ & Music',
  Officiants: 'Officiant',
  'Beauty & Makeup': 'Beauty & Makeup',
  Decorators: 'Decorator',
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Staff',
}

type Props = {
  phone: string | null
  vendor: CurrentVendor | null
}

function Avatar({ imageUrl, name }: { imageUrl: string | undefined; name: string | null }) {
  const t = usePortalT('settings')
  const initials = name
    ? name.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  return (
    <div className="relative w-20 h-20 shrink-0">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={name ?? t('fallback_name')}
          width={80}
          height={80}
          className="w-20 h-20 rounded-full object-cover ring-4 ring-white shadow"
        />
      ) : (
        <div className="w-20 h-20 rounded-full bg-[#F0DFF6] text-[#7E5896] font-bold text-2xl flex items-center justify-center ring-4 ring-white shadow">
          {initials}
        </div>
      )}
      <button data-opus-button="control"
        type="button"
        aria-label={t('aria_change_photo')}
        className="absolute bottom-0 right-0 w-7 h-7 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 transition-colors"
      >
        <Camera className="w-3.5 h-3.5 text-gray-500" />
      </button>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="divide-y divide-gray-100">{children}</div>
    </div>
  )
}

function Row({
  icon: Icon,
  label,
  value,
  action,
}: {
  icon: React.ElementType
  label: string
  value: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-4 px-6 py-4">
      <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-gray-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400 font-medium mb-0.5">{label}</p>
        <p className="text-sm font-semibold text-gray-900 truncate">{value ?? '—'}</p>
      </div>
      {action}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const t = usePortalT('settings')
  const isActive = status === 'active'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full',
        isActive ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700',
      )}
    >
      <CheckCircle2 className="w-3 h-3" />
      {isActive ? t('status_active') : t('status_pending_review')}
    </span>
  )
}

function PhoneField({ initial }: { initial: string | null }) {
  const t = usePortalT('settings')
  const [phone, setPhone] = useState(initial ?? '')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (savedTimerRef.current) clearTimeout(savedTimerRef.current) }, [])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError((json as Record<string, unknown>).error as string ?? t('phone_error_generic'))
        return
      }
      setSaved(true)
      setEditing(false)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000)
    } catch {
      setError(t('phone_error_network'))
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-4 px-6 py-4">
        <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
          <Phone className="w-4 h-4 text-gray-400" />
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <input
            type="tel"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setError(null) }}
            placeholder={t('phone_placeholder')}
            autoFocus
            className="flex-1 text-sm font-semibold border-b border-[#C9A0DC] bg-transparent focus:outline-none text-gray-900 pb-0.5"
          />
          <button data-opus-button="control"
            type="button"
            onClick={save}
            disabled={saving}
            className="text-xs font-bold text-[#7E5896] hover:text-[#6b4a80] transition-colors disabled:opacity-50"
          >
            {saving ? t('phone_saving') : t('phone_save')}
          </button>
          <button data-opus-button="control"
            type="button"
            onClick={() => { setPhone(initial ?? ''); setEditing(false); setError(null) }}
            className="text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
          >
            {t('phone_cancel')}
          </button>
        </div>
        {error && (
          <p className="mt-1 text-xs text-red-500 px-6">{error}</p>
        )}
      </div>
    )
  }

  return (
    <Row
      icon={Phone}
      label={t('phone_label')}
      value={
        <span className={phone ? 'text-gray-900' : 'text-gray-400'}>
          {phone || t('phone_add')}
        </span>
      }
      action={
        <button data-opus-button="control"
          type="button"
          onClick={() => setEditing(true)}
          className={cn(
            'text-xs font-semibold shrink-0 transition-colors',
            saved ? 'text-green-600' : 'text-[#7E5896] hover:text-[#6b4a80]',
          )}
        >
          {saved ? t('phone_saved') : phone ? t('phone_edit') : t('phone_add_button')}
        </button>
      }
    />
  )
}

export default function SettingsClient({ phone, vendor }: Props) {
  const t = usePortalT('settings')
  const { user } = useUser()
  const { openUserProfile, signOut } = useClerk()

  const name = user?.fullName ?? null
  const email = user?.primaryEmailAddress?.emailAddress ?? null
  const imageUrl = user?.imageUrl

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
      {/* Profile header */}
      <div className="flex items-center gap-5">
        <Avatar imageUrl={imageUrl} name={name} />
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 truncate">{name ?? email ?? t('fallback_name')}</h1>
          {vendor && (
            <p className="text-sm text-gray-500 mt-0.5 truncate">
              {ROLE_LABEL[vendor.role] ?? vendor.role} · {CATEGORY_LABEL[vendor.category] ?? vendor.category}
            </p>
          )}
        </div>
      </div>

      {/* Account */}
      <Section title={t('section_account')}>
        <Row
          icon={User}
          label={t('row_full_name')}
          value={name}
          action={
            <button data-opus-button="control"
              type="button"
              onClick={() => openUserProfile()}
              className="text-xs font-semibold text-[#7E5896] hover:text-[#6b4a80] transition-colors shrink-0"
            >
              {t('action_edit')}
            </button>
          }
        />
        <Row
          icon={Mail}
          label={t('row_email')}
          value={email}
          action={
            <button data-opus-button="control"
              type="button"
              onClick={() => openUserProfile()}
              className="text-xs font-semibold text-[#7E5896] hover:text-[#6b4a80] transition-colors shrink-0"
            >
              {t('action_manage')}
            </button>
          }
        />
        <PhoneField initial={phone} />
        <Row
          icon={Shield}
          label={t('row_password_security')}
          value={t('row_password_security_value')}
          action={
            <button data-opus-button="control"
              type="button"
              onClick={() => openUserProfile()}
              className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
              aria-label={t('aria_manage_security')}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          }
        />
      </Section>

      {/* Business */}
      {vendor && (
        <Section title={t('section_business')}>
          <Row
            icon={Store}
            label={t('row_business_name')}
            value={vendor.businessName}
            action={
              <Link
                href="/storefront/about"
                className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                aria-label={t('aria_edit_storefront')}
              >
                <ArrowUpRight className="w-4 h-4" />
              </Link>
            }
          />
          <Row
            icon={Store}
            label={t('row_category')}
            value={CATEGORY_LABEL[vendor.category] ?? vendor.category}
          />
          <div className="flex items-center gap-4 px-6 py-4">
            <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4 text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400 font-medium mb-0.5">{t('row_account_status')}</p>
              <StatusBadge status={vendor.onboardingStatus} />
            </div>
          </div>
        </Section>
      )}

      {/* Sign out */}
      <div className="pt-2">
        <button data-opus-button="control"
          type="button"
          onClick={() => signOut({ redirectUrl: '/sign-in' })}
          className="flex items-center gap-2 text-sm font-semibold text-red-500 hover:text-red-600 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          {t('sign_out')}
        </button>
      </div>
    </div>
  )
}
