'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { ImageUploadField } from '@/components/cms/ImageUploadField'
import { RichTextField } from '@/components/cms/RichTextField'
import {
  PRODUCT_CATEGORIES,
  PRODUCT_BADGES,
  PRODUCT_BADGE_LABELS,
  slugifyProductName,
  type DigitalCardProductRecord,
} from '@/lib/cms/opus-pass-digital-cards-products'
import { deleteDigitalCardProduct, upsertDigitalCardProduct } from '../actions'

const LIST = '/cms/opus-pass/digital-cards/products'
const IMAGE_PREFIX = 'opus-pass/invitations/products'
const MAX_DESIGNS = 5

const inputCls =
  'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all'

export default function ProductEditor({
  initial,
  isNew,
}: {
  initial: DigitalCardProductRecord
  isNew: boolean
}) {
  const router = useRouter()
  const [product, setProduct] = useState<DigitalCardProductRecord>(initial)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof DigitalCardProductRecord>(key: K, value: DigitalCardProductRecord[K]) {
    setProduct((p) => ({ ...p, [key]: value }))
  }

  function onNameChange(name: string) {
    setProduct((p) => ({
      ...p,
      name,
      slug: !p.slug || p.slug === slugifyProductName(p.name) ? slugifyProductName(name) : p.slug,
    }))
  }

  function save() {
    setError(null)
    const slug = product.slug || slugifyProductName(product.name)
    const id = product.id || slug

    if (!product.name.trim()) return setError('Name is required.')
    if (!slug) return setError('Slug is required.')

    const designs = product.designs.filter(Boolean)
    const record: DigitalCardProductRecord = { ...product, id, slug, designs }

    startTransition(async () => {
      try {
        const res = await upsertDigitalCardProduct(record)
        if (!res.ok) {
          setError(res.error)
          return
        }
        router.push(LIST)
        router.refresh()
      } catch (err) {
        // Auth / network failures still throw; DB errors come back via res.error.
        setError(err instanceof Error ? err.message : 'Could not save the card. Please try again.')
      }
    })
  }

  function remove() {
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return
    startTransition(async () => {
      try {
        await deleteDigitalCardProduct(product.id)
        router.push(LIST)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  return (
    <div className="py-2">
      <div className="min-w-0">
        {/* Header bar */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="min-w-0">
            <Link
              href={LIST}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              All cards
            </Link>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight truncate">
              {isNew ? 'New card' : product.name || 'Untitled card'}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {error && (
              <span className="text-xs text-red-600 font-medium max-w-[280px] truncate" title={error}>
                {error}
              </span>
            )}
            {!isNew && (
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-red-600 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="flex items-center gap-1.5 text-sm font-semibold text-white bg-[#C9A0DC] hover:bg-[#b97fd0] px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Basics */}
          <Card title="Basics">
            <Field label="Name (English)">
              <input value={product.name} onChange={(e) => onNameChange(e.target.value)} className={inputCls} placeholder="Botanical Frame Wedding Invitations" />
            </Field>
            <Field label="Name (Kiswahili)" hint="Shown when the visitor picks Swahili. Leave blank to fall back to English.">
              <input value={product.name_sw} onChange={(e) => set('name_sw', e.target.value)} className={inputCls} placeholder="Mwaliko wa Harusi wa Botanical Frame" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Slug" hint="Used in the product URL.">
                <input value={product.slug} onChange={(e) => set('slug', e.target.value)} className={inputCls} placeholder="botanical-frame-wedding-invitations" />
              </Field>
              <Field label="Designer">
                <input value={product.designer} onChange={(e) => set('designer', e.target.value)} className={inputCls} placeholder="Bagamoyo Press" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Category">
                <select value={product.category} onChange={(e) => set('category', e.target.value)} className={inputCls}>
                  {PRODUCT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Sort order" hint="Lower numbers appear first.">
                <input type="number" value={product.sort_order} onChange={(e) => set('sort_order', Number(e.target.value) || 0)} className={inputCls} />
              </Field>
            </div>
            <Field label="Status badge" hint="Promotional pill shown above the card on the storefront.">
              <select
                value={product.badge ?? ''}
                onChange={(e) => set('badge', (e.target.value || null) as DigitalCardProductRecord['badge'])}
                className={inputCls}
              >
                <option value="">No badge</option>
                {PRODUCT_BADGES.map((b) => (
                  <option key={b} value={b}>{PRODUCT_BADGE_LABELS[b]}</option>
                ))}
              </select>
            </Field>
          </Card>

          {/* Description */}
          <Card title="Description">
            <Field
              label="Description (English)"
              hint="Shown as the “Description” section under the card on the product page. Use the toolbar for bold, lists, and links — to leave a list and write a normal paragraph, press Enter on an empty bullet. Leave empty to auto-generate from the name and designer."
            >
              <RichTextField
                value={product.description}
                onChange={(html) => set('description', html)}
                placeholder="Botanical Frame is a Bagamoyo Press signature design — hand-illustrated foliage framing your names. Sent digitally to every guest by WhatsApp or SMS."
              />
            </Field>
            <Field
              label="Description (Kiswahili)"
              hint="Shown when the visitor picks Swahili. Leave blank to fall back to the English description."
            >
              <RichTextField
                value={product.description_sw}
                onChange={(html) => set('description_sw', html)}
                placeholder="Botanical Frame ni muundo maalum wa Bagamoyo Press — majani yaliyochorwa kwa mkono yakizunguka majina yenu. Hutumwa kidijitali kwa kila mgeni kwa WhatsApp au SMS."
              />
            </Field>
          </Card>

          {/* Hero card — the catalog & landing cover (portrait) */}
          <Card title="Hero card">
            <p className="text-[11px] text-gray-500 -mt-2">
              The portrait cover shown on the catalog grid and landing page. Upload it at a{' '}
              <strong>3:4 portrait ratio</strong> (taller than wide) — this is separate from the
              detail-page carousel below, which is landscape.
            </p>
            <ImageUploadField
              label="Hero image"
              value={product.image_url}
              onChange={(v) => set('image_url', v)}
              pathPrefix={IMAGE_PREFIX}
              previewAspect="aspect-[3/4]"
              previewWidth="max-w-[160px]"
              accept="image"
            />
          </Card>

          {/* Card designs — the detail-page carousel (landscape 800×600) */}
          <Card title="Card designs">
            <p className="text-[11px] text-gray-500 -mt-2">
              Up to {MAX_DESIGNS} images for the carousel on the card <em>details</em> page. Design these at{' '}
              <strong>800 × 600 (4:3 landscape)</strong> so they fill the carousel frame cleanly.
            </p>
            <p className="rounded-lg border border-[#F0DFF6] bg-[#FCF7FF] px-3 py-2 text-[11px] text-[#6B4E8C]">
              The three OpusPass ticket mockups (Light, Classic, Signature) are appended to every card&apos;s
              preview carousel automatically — no need to upload them here.
            </p>
            <DesignsEditor value={product.designs} onChange={(v) => set('designs', v)} />
          </Card>

          {/* Visibility */}
          <Card title="Visibility">
            <Toggle label="Published (visible on the site)" checked={product.published} onChange={(v) => set('published', v)} />
          </Card>
        </div>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-4">
      <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      {children}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-gray-600">{label}</span>
      {hint && <span className="block text-[11px] text-gray-400 -mt-1">{hint}</span>}
      {children}
    </label>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-[#7E5896] focus:ring-[#C9A0DC]"
      />
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  )
}

function DesignsEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const update = (i: number, url: string) => onChange(value.map((u, idx) => (idx === i ? url : u)))
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i))
  const add = () => onChange([...value, ''])
  const canAdd = value.length < MAX_DESIGNS

  return (
    <div className="space-y-3">
      {value.map((url, i) => (
        <div key={i} className="flex items-start gap-2 rounded-lg border border-gray-100 p-2">
          <div className="flex-1">
            <ImageUploadField
              label={`Design ${i + 1}`}
              value={url}
              onChange={(v) => update(i, v)}
              pathPrefix={IMAGE_PREFIX}
              previewAspect="aspect-[4/3]"
              previewWidth="max-w-[200px]"
              accept="image"
            />
          </div>
          <button
            type="button"
            onClick={() => remove(i)}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded mt-5"
            aria-label={`Remove design ${i + 1}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      {canAdd ? (
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#7E5896] hover:text-[#5d3a78] px-2.5 py-1.5 rounded-lg border border-[#C9A0DC] hover:bg-[#F0DFF6] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add design
        </button>
      ) : (
        <p className="text-[11px] text-gray-400">Maximum of {MAX_DESIGNS} designs reached.</p>
      )}
    </div>
  )
}
