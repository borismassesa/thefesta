'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  ExternalLink,
  Save,
  Send,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  VENDOR_BADGES,
  type VendorBadge,
  type VendorCategory,
  type VendorHeroMedia,
  type VendorRecord,
} from '@/lib/cms/vendors'
import { uploadCmsMedia } from '@/lib/cms/upload-client'
import { cn } from '@/lib/utils'
import { deleteVendor, upsertVendor } from '../actions'

type Props = {
  initial: VendorRecord
  categories: VendorCategory[]
  isNew: boolean
}

const EXCERPT_MAX = 500
const NAME_MAX = 80

function slugify(v: string): string {
  return v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

function resolveMediaUrl(url: string): string {
  if (!url) return ''
  if (/^https?:\/\//.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url
  if (url.startsWith('/')) {
    const base = process.env.NEXT_PUBLIC_WEBSITE_URL ?? ''
    return base ? `${base}${url}` : url
  }
  return url
}

export default function VendorEditor({ initial, categories, isNew }: Props) {
  const router = useRouter()
  const [vendor, setVendor] = useState<VendorRecord>(initial)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'http://localhost:3007'

  const set = <K extends keyof VendorRecord>(key: K, value: VendorRecord[K]) =>
    setVendor((v) => ({ ...v, [key]: value }))

  const setHero = (patch: Partial<VendorHeroMedia>) =>
    setVendor((v) => ({ ...v, hero_media: { ...v.hero_media, ...patch } }))

  // Auto-slug on name change for new vendors
  useEffect(() => {
    if (!isNew) return
    setVendor((v) => ({ ...v, slug: slugify(v.name), id: slugify(v.name) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendor.name])

  const handleSave = () => {
    if (!vendor.id || !vendor.slug || !vendor.name) {
      setMessage('Name is required.')
      return
    }
    startTransition(async () => {
      try {
        const { id } = await upsertVendor(vendor)
        setMessage('Saved.')
        if (isNew) router.push(`/cms/vendors/${id}`)
        else router.refresh()
      } catch (e: unknown) {
        setMessage(`Save failed: ${e instanceof Error ? e.message : 'unknown error'}`)
      }
    })
  }

  const handleDelete = () => {
    if (!confirm(`Delete "${vendor.name}"? This cannot be undone.`)) return
    startTransition(async () => {
      try {
        await deleteVendor(vendor.id)
        router.push('/cms/vendors')
      } catch (e: unknown) {
        setMessage(`Delete failed: ${e instanceof Error ? e.message : 'unknown error'}`)
      }
    })
  }

  const handleUpload = (file: File, target: 'hero' | 'gallery') => {
    const prefix = vendor.id ? `vendors/${vendor.id}` : 'vendors/_orphan'
    startTransition(async () => {
      try {
        const { url, type } = await uploadCmsMedia(file, prefix, 'media')
        if (target === 'hero') {
          setHero({ src: url, type: type === 'video' ? 'video' : 'image' })
        } else {
          setVendor((v) => ({ ...v, gallery: [...v.gallery, url] }))
        }
        setMessage('Uploaded.')
      } catch (e: unknown) {
        setMessage(`Upload failed: ${e instanceof Error ? e.message : 'unknown error'}`)
      }
    })
  }

  // Auto-sync category label from category_id
  useEffect(() => {
    if (!vendor.category_id) return
    const cat = categories.find((c) => c.id === vendor.category_id)
    if (cat && cat.label !== vendor.category) {
      setVendor((v) => ({ ...v, category: cat.label }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendor.category_id])

  return (
    <div className="px-8 py-2 pb-12 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <Link
            href="/cms/vendors"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 mb-2"
          >
            <ArrowLeft className="w-3 h-3" />
            All vendors
          </Link>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
            {isNew ? 'New vendor' : vendor.name || 'Untitled vendor'}
          </h2>
          {!isNew && (
            <p className="text-sm text-gray-500 mt-1">
              {vendor.category || 'Uncategorised'}
              {vendor.city ? ` · ${vendor.city}` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {message && <span className="text-xs text-gray-500 mr-1">{message}</span>}
          {!isNew && (
            <>
              <a
                href={`${websiteUrl}/vendors/${vendor.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                View
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button data-opus-button="danger" data-opus-button-size="medium"
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-red-600 px-3 py-2 rounded-lg border border-gray-200 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </>
          )}
          <button data-opus-button="primary" data-opus-button-size="medium"
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-[#C9A0DC] hover:bg-[#b97fd0] px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {isNew ? <Save className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            {isNew ? 'Create vendor' : 'Save'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-4">
          {/* Basics */}
          <Card title="Basics">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Vendor name"
                hint={<CharCount value={vendor.name} max={NAME_MAX} />}
              >
                <input
                  type="text"
                  value={vendor.name}
                  onChange={(e) => set('name', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Slug (URL)">
                <input
                  type="text"
                  value={vendor.slug}
                  onChange={(e) => {
                    const newSlug = slugify(e.target.value)
                    setVendor((v) => ({ ...v, slug: newSlug, id: isNew ? newSlug : v.id }))
                  }}
                  className={cn(inputCls, 'font-mono text-xs')}
                  placeholder="vendor-slug"
                />
              </Field>
              <Field label="Category">
                <select
                  value={vendor.category_id ?? ''}
                  onChange={(e) => set('category_id', e.target.value || null)}
                  className={inputCls}
                >
                  <option value="">— Select —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="City">
                <input
                  type="text"
                  value={vendor.city}
                  onChange={(e) => set('city', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Price range">
                <input
                  type="text"
                  value={vendor.price_range}
                  onChange={(e) => set('price_range', e.target.value)}
                  className={inputCls}
                  placeholder="TZS 5M – 12M"
                />
              </Field>
              <Field label="Starting price (optional)">
                <input
                  type="text"
                  value={vendor.starting_price ?? ''}
                  onChange={(e) => set('starting_price', e.target.value || null)}
                  className={inputCls}
                  placeholder="From TZS 3M"
                />
              </Field>
            </div>

            <Field label="Excerpt" hint={<CharCount value={vendor.excerpt} max={EXCERPT_MAX} />}>
              <textarea
                value={vendor.excerpt}
                onChange={(e) => set('excerpt', e.target.value)}
                rows={3}
                className={inputCls}
                placeholder="Short summary shown in vendor cards…"
              />
            </Field>

            <Field label="About (long-form, optional)">
              <textarea
                value={vendor.about ?? ''}
                onChange={(e) => set('about', e.target.value || null)}
                rows={5}
                className={inputCls}
                placeholder="Extended description for the vendor detail page…"
              />
            </Field>
          </Card>

          {/* Hero media */}
          <Card title="Hero media">
            <HeroMediaField
              value={vendor.hero_media}
              onChange={setHero}
              onUpload={(file) => handleUpload(file, 'hero')}
              pending={pending}
            />
            <Field label="Alt text">
              <input
                type="text"
                value={vendor.hero_media.alt}
                onChange={(e) => setHero({ alt: e.target.value })}
                className={inputCls}
                placeholder="Short description for screen readers"
              />
            </Field>
          </Card>

          {/* Ratings & badge */}
          <Card title="Reputation & badges">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Rating (0–5)">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="5"
                  value={vendor.rating}
                  onChange={(e) => set('rating', parseFloat(e.target.value || '0'))}
                  className={inputCls}
                />
              </Field>
              <Field label="Review count">
                <input
                  type="number"
                  min="0"
                  value={vendor.review_count}
                  onChange={(e) => set('review_count', parseInt(e.target.value || '0', 10))}
                  className={inputCls}
                />
              </Field>
              <Field label="Response time (optional)">
                <input
                  type="text"
                  value={vendor.response_time ?? ''}
                  onChange={(e) => set('response_time', e.target.value || null)}
                  className={inputCls}
                  placeholder="within 2 hrs"
                />
              </Field>
            </div>

            <Field label="Badge">
              <div className="flex flex-wrap gap-2">
                <button data-opus-button="neutral" data-opus-button-size="small"
                  type="button"
                  onClick={() => set('badge', null)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                    vendor.badge === null
                      ? 'border-[#C9A0DC] bg-[#F0DFF6] text-[#7E5896]'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  )}
                >
                  No badge
                </button>
                {VENDOR_BADGES.map((b) => (
                  <button data-opus-button="neutral" data-opus-button-size="small"
                    key={b}
                    type="button"
                    onClick={() => set('badge', b)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                      vendor.badge === b
                        ? 'border-[#C9A0DC] bg-[#F0DFF6] text-[#7E5896]'
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    )}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </Field>
          </Card>

          {/* Contact-ish fields */}
          <Card title="Social links (optional)">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Website">
                <input
                  type="text"
                  value={vendor.social_links?.website ?? ''}
                  onChange={(e) =>
                    set('social_links', {
                      ...(vendor.social_links ?? {}),
                      website: e.target.value || undefined,
                    })
                  }
                  className={inputCls}
                  placeholder="https://…"
                />
              </Field>
              <Field label="Instagram">
                <input
                  type="text"
                  value={vendor.social_links?.instagram ?? ''}
                  onChange={(e) =>
                    set('social_links', {
                      ...(vendor.social_links ?? {}),
                      instagram: e.target.value || undefined,
                    })
                  }
                  className={inputCls}
                  placeholder="@handle"
                />
              </Field>
              <Field label="Facebook">
                <input
                  type="text"
                  value={vendor.social_links?.facebook ?? ''}
                  onChange={(e) =>
                    set('social_links', {
                      ...(vendor.social_links ?? {}),
                      facebook: e.target.value || undefined,
                    })
                  }
                  className={inputCls}
                  placeholder="facebook.com/…"
                />
              </Field>
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-6">
          <Card title="Visibility">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={vendor.published}
                onChange={(e) => set('published', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 mt-0.5"
              />
              <div>
                <p className="text-xs font-semibold text-gray-700">Published</p>
                <p className="text-[11px] text-gray-400">Visible on the public site.</p>
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={vendor.featured}
                onChange={(e) => set('featured', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 mt-0.5"
              />
              <div>
                <p className="text-xs font-semibold text-gray-700">Featured</p>
                <p className="text-[11px] text-gray-400">Appears in featured rows first.</p>
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={vendor.locally_owned ?? false}
                onChange={(e) => set('locally_owned', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 mt-0.5"
              />
              <div>
                <p className="text-xs font-semibold text-gray-700">Locally owned</p>
                <p className="text-[11px] text-gray-400">Signal for search filters.</p>
              </div>
            </label>
          </Card>

          <Card title="Metadata">
            <Field label="Years in business">
              <input
                type="number"
                min="0"
                value={vendor.years_in_business ?? ''}
                onChange={(e) =>
                  set('years_in_business', e.target.value ? parseInt(e.target.value, 10) : null)
                }
                className={inputCls}
              />
            </Field>
            <p className="text-[11px] text-gray-400">
              Pricing packages, availability, gallery, reviews, team, FAQs and capacity are coming
              in the next CMS pass.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function HeroMediaField({
  value, onChange, onUpload, pending,
}: {
  value: VendorHeroMedia
  onChange: (patch: Partial<VendorHeroMedia>) => void
  onUpload: (file: File) => void
  pending: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [errored, setErrored] = useState(false)
  const resolved = resolveMediaUrl(value.src)

  useEffect(() => {
    setErrored(false)
  }, [resolved, value.type])

  return (
    <div className="space-y-2">
      <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-100 aspect-video relative">
        {resolved && !errored ? (
          value.type === 'video' ? (
            <video
              key={resolved}
              src={resolved}
              autoPlay
              muted
              loop
              playsInline
              controls
              onError={() => setErrored(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={resolved}
              src={resolved}
              alt=""
              onError={() => setErrored(true)}
              className="w-full h-full object-cover"
            />
          )
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
              {value.src ? 'Cannot preview' : 'No hero media'}
            </span>
            {value.src && (
              <span className="text-[10px] text-gray-400">
                Browser may not support this file format.
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <select
          value={value.type}
          onChange={(e) => onChange({ type: e.target.value as 'image' | 'video' })}
          className={cn(inputCls, 'w-24 text-xs shrink-0')}
        >
          <option value="image">Image</option>
          <option value="video">Video</option>
        </select>
        <input
          type="text"
          value={value.src}
          onChange={(e) => onChange({ src: e.target.value })}
          className={cn(inputCls, 'text-xs')}
          placeholder="https://… or /assets/…"
        />
        <button data-opus-button="control"
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-700 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50 shrink-0"
        >
          <Upload className="w-4 h-4" />
          Upload
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onUpload(f)
          }}
        />
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-4">
      <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3>
      {children}
    </div>
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
