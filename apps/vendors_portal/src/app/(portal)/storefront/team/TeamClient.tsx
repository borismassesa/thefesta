'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Camera, Loader2, Plus, Save, Trash2, User, X } from 'lucide-react'
import { FieldLabel, TextArea, TextInput } from '@/components/onboard/FormField'
import { useOnboardingDraft, type TeamMember } from '@/lib/onboarding/draft'
import { getStorefrontSections } from '@/lib/storefront/completion'
import { useVendorVertical } from '@/lib/onboarding/vertical-context'
import { cn } from '@/lib/utils'
import { usePortalT } from '@/components/providers/PortalUIStringsProvider'
import { loadTeam, saveTeam, uploadStorefrontPhoto } from '../sections/actions'

const newMember = (seed?: Partial<TeamMember>): TeamMember => ({
  id:
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `tm-${Math.random().toString(36).slice(2, 10)}`,
  name: '',
  role: '',
  bio: '',
  ...seed,
})

const initialsFor = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function TeamClient() {
  const router = useRouter()
  const t = usePortalT('storefront-photos-team')
  const { draft, update, hydrated } = useOnboardingDraft()

  // Track every blob URL we mint so we can revoke them on unmount and prevent
  // memory leaks. Persisted draft state never holds blob URLs.
  const objectUrlsRef = useRef<string[]>([])
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [])

  const vertical = useVendorVertical()
  const nextHref = useMemo(() => {
    const sections = getStorefrontSections(draft, vertical)
    const idx = sections.findIndex((s) => s.id === 'team')
    return idx >= 0 && idx < sections.length - 1 ? sections[idx + 1].href : null
  }, [draft, vertical])

  const [saving, startSaving] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)

  // Render the full structure even before localStorage hydrates so the
  // server-rendered <main> matches the client tree (the previous
  // `<div p-8 aria-hidden />` placeholder created a hydration mismatch).
  // Mutations are gated on `hydrated` so a click before useEffect runs
  // can't clobber localStorage with the empty default.
  const team = hydrated ? draft.team : []

  // Freshest team for async callbacks (avatar uploads resolve after the
  // closure that started them has gone stale). Synced in an effect so we don't
  // write a ref during render; async uploads resolve well after commit.
  const teamRef = useRef(team)
  useEffect(() => {
    teamRef.current = team
  }, [team])

  // Per-member avatar upload state + a shared error line.
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set())
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const setUploading = (id: string, on: boolean) =>
    setUploadingIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  // Hydrate from the DB (source of truth) when the local draft is empty —
  // a fresh device / cleared storage / admin-approved vendor would otherwise
  // see no team members despite having saved some. Seeding only when empty
  // avoids clobbering unsaved edits made on this device. Avatars are
  // session-only blobs that were never persisted, so seeded members have none.
  const seeded = useRef(false)
  useEffect(() => {
    if (!hydrated || seeded.current) return
    seeded.current = true
    if (draft.team.length > 0) return
    void loadTeam().then((res) => {
      if (res.ok && res.team.length > 0) {
        update({
          team: res.team.map((m) =>
            newMember({
              name: m.name ?? '',
              role: m.role ?? '',
              bio: m.bio ?? '',
              avatar: m.avatar,
            }),
          ),
        })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  const updateMember = (id: string, patch: Partial<TeamMember>) => {
    if (!hydrated) return
    // Patch off teamRef so an async avatar upload completing later doesn't
    // clobber edits made while it was in flight.
    update({
      team: teamRef.current.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })
  }

  const addMember = () => {
    if (!hydrated) return
    update({ team: [...team, newMember()] })
  }

  const removeMember = (id: string) => {
    if (!hydrated) return
    const removed = team.find((m) => m.id === id)
    if (removed?.avatarUrl) URL.revokeObjectURL(removed.avatarUrl)
    update({ team: team.filter((m) => m.id !== id) })
  }

  const setAvatar = (id: string, file: File | null) => {
    const member = team.find((m) => m.id === id)
    // Revoke the previous blob if there was one — new file or clearing both
    // need cleanup.
    if (member?.avatarUrl) URL.revokeObjectURL(member.avatarUrl)
    setAvatarError(null)
    if (!file) {
      updateMember(id, { avatarUrl: undefined, avatar: undefined })
      return
    }
    if (!file.type.startsWith('image/')) {
      setAvatarError(t('avatar_invalid_file_error'))
      return
    }
    // Show the picked image immediately as a blob preview, then upload it to
    // storage so we get a permanent URL that persists to the DB (and therefore
    // shows on admin + the public storefront). Before this, the avatar was a
    // blob-only preview that was stripped on save and never stored anywhere.
    const url = URL.createObjectURL(file)
    objectUrlsRef.current.push(url)
    updateMember(id, { avatarUrl: url })

    setUploading(id, true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', 'avatar')
    uploadStorefrontPhoto(fd)
      .then((res) => {
        setUploading(id, false)
        if (!res.ok) {
          setAvatarError(res.error)
          return
        }
        // Persist the permanent URL; keep the blob preview until the next save
        // /reload (display prefers `avatar` once it's set).
        updateMember(id, { avatar: res.url })
      })
      .catch((err) => {
        setUploading(id, false)
        setAvatarError(
          err instanceof Error ? err.message : 'Photo upload failed. Try again.',
        )
      })
  }

  const onNext = () => {
    if (nextHref) router.push(nextHref)
  }

  const completeMembers = team.filter((m) => m.name.trim() && m.role.trim()).length

  // Persist to the database. Avatar `avatarUrl` is a blob: URL only the
  // current browser tab can resolve, so we strip it before sending — image
  // upload to a real CDN URL is a separate flow handled by the photo step.
  const onSave = () => {
    setSaveError(null)
    setSaveOk(false)
    startSaving(async () => {
      const res = await saveTeam(
        team.map(({ avatarUrl: _avatarUrl, ...rest }) => rest),
      )
      if (!res.ok) {
        setSaveError(res.error)
        return
      }
      setSaveOk(true)
    })
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 px-6 lg:px-10 pt-4 lg:pt-5 pb-6">
        <div className="max-w-4xl">
          {team.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-[#F0DFF6] text-[#7E5896] flex items-center justify-center">
                <User className="w-6 h-6" />
              </div>
              <p className="text-sm text-gray-700 mt-5 max-w-md mx-auto leading-relaxed">
                {t('empty_team_desc')}
              </p>
              <button
                type="button"
                onClick={addMember}
                className="inline-flex items-center gap-2 mt-5 bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-gray-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t('add_team_member_button')}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {team.map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  uploading={uploadingIds.has(member.id)}
                  onChange={(patch) => updateMember(member.id, patch)}
                  onSetAvatar={(file) => setAvatar(member.id, file)}
                  onRemove={() => removeMember(member.id)}
                />
              ))}

              <button
                type="button"
                onClick={addMember}
                className="w-full bg-white rounded-2xl border border-dashed border-gray-300 hover:border-gray-500 hover:bg-gray-50 transition-colors py-5 inline-flex items-center justify-center gap-2 text-sm font-semibold text-gray-900"
              >
                <Plus className="w-4 h-4" />
                {t('add_another_member_button')}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-gray-100 bg-white/95 backdrop-blur z-30">
        <div className="px-6 lg:px-10 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="text-xs text-gray-500">
            {t('team_counts_complete_total', { complete: completeMembers, total: team.length })}
            {avatarError && (
              <span className="ml-3 text-rose-700">{avatarError}</span>
            )}
            {saveError && (
              <span className="ml-3 text-rose-700">{saveError}</span>
            )}
            {saveOk && !saveError && (
              <span className="ml-3 text-emerald-700">{t('saved_label')}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={saving || uploadingIds.size > 0}
              className="inline-flex items-center gap-2 bg-white border border-gray-300 text-gray-900 text-sm font-semibold px-4 py-2 rounded-full hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {saving
                ? t('saving_label')
                : uploadingIds.size > 0
                  ? t('uploading_photo_label')
                  : t('save_button')}
            </button>
            <button
              type="button"
              onClick={onNext}
              className="inline-flex items-center gap-2 bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-gray-800 transition-colors"
            >
              {t('next_button')}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MemberCard({
  member,
  uploading,
  onChange,
  onSetAvatar,
  onRemove,
}: {
  member: TeamMember
  uploading: boolean
  onChange: (patch: Partial<TeamMember>) => void
  onSetAvatar: (file: File | null) => void
  onRemove: () => void
}) {
  const t = usePortalT('storefront-photos-team')
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-6 lg:p-7">
      <div className="flex items-start gap-5">
        <Avatar member={member} uploading={uploading} onSetFile={onSetAvatar} />

        <div className="flex-1 min-w-0 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel required>{t('field_full_name_label')}</FieldLabel>
              <TextInput
                placeholder={t('field_full_name_placeholder')}
                value={member.name}
                onChange={(e) => onChange({ name: e.target.value })}
              />
            </div>
            <div>
              <FieldLabel required>{t('field_role_label')}</FieldLabel>
              <TextInput
                placeholder={t('field_role_placeholder')}
                value={member.role}
                onChange={(e) => onChange({ role: e.target.value })}
              />
            </div>
          </div>
          <div>
            <FieldLabel>{t('field_short_bio_label')}</FieldLabel>
            <TextArea
              placeholder={t('field_short_bio_placeholder')}
              value={member.bio}
              onChange={(e) => onChange({ bio: e.target.value })}
              rows={3}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={onRemove}
          aria-label={t('remove_member_aria')}
          className="-mr-2 -mt-2 p-2 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-100 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function Avatar({
  member,
  uploading,
  onSetFile,
}: {
  member: TeamMember
  uploading: boolean
  onSetFile: (file: File | null) => void
}) {
  const t = usePortalT('storefront-photos-team')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const initials = initialsFor(member.name)
  // Prefer the persisted public URL; fall back to the in-flight blob preview.
  const avatarSrc = member.avatar || member.avatarUrl
  const hasAvatar = Boolean(avatarSrc)
  const hasName = member.name.trim().length > 0

  return (
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files?.[0]
        if (file && file.type.startsWith('image/')) onSetFile(file)
      }}
      aria-label={hasAvatar ? t('avatar_replace_photo_aria') : t('avatar_upload_photo_aria')}
      className={cn(
        'shrink-0 relative w-20 h-20 rounded-2xl overflow-hidden group transition-all',
        // The empty state uses a dashed border so the dropzone affordance is
        // obvious without the floating pip cluttering the corner.
        !hasAvatar && 'border-2 border-dashed border-[#D4B6E0] hover:border-[#7E5896]',
        dragOver && 'border-solid border-gray-900 ring-2 ring-gray-900 ring-offset-2',
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onSetFile(file)
          e.target.value = ''
        }}
      />

      {hasAvatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarSrc}
          alt={member.name || 'Team member'}
          className="w-full h-full object-cover"
        />
      ) : hasName ? (
        <div className="w-full h-full bg-[#F0DFF6] text-[#7E5896] flex items-center justify-center font-bold text-xl">
          {initials}
        </div>
      ) : (
        // Truly empty: a centered Camera icon reads as "drop a photo here"
        // far better than a placeholder "?" character.
        <div className="w-full h-full bg-[#FAF1FD] text-[#7E5896] flex flex-col items-center justify-center gap-0.5">
          <Camera className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase tracking-wider">{t('avatar_photo_label')}</span>
        </div>
      )}

      {/* Uploading spinner — shown while the picked photo uploads to storage. */}
      {uploading && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white">
          <Loader2 className="w-5 h-5 animate-spin" />
        </span>
      )}

      {/* Hover overlay — only shown when an avatar or initials exist; the
          empty state already telegraphs uploadability via the dashed border. */}
      {!uploading && (hasAvatar || hasName) && (
        <span
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity',
            hasAvatar ? 'bg-black/55 text-white' : 'bg-black/15 text-[#7E5896]',
          )}
          aria-hidden
        >
          <Camera className="w-4 h-4" />
          <span className="text-[10px] font-bold uppercase tracking-wider">
            {hasAvatar ? t('avatar_replace_label') : t('avatar_upload_label')}
          </span>
        </span>
      )}

      {/* Remove pip (only when populated) — moved inside the avatar so it
          doesn't overhang the corner. */}
      {hasAvatar ? (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation()
            onSetFile(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              onSetFile(null)
            }
          }}
          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white/95 text-gray-700 hover:text-rose-600 flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          aria-label={t('avatar_remove_photo_aria')}
          title={t('avatar_remove_photo_aria')}
        >
          <X className="w-3 h-3" />
        </span>
      ) : null}
    </button>
  )
}
