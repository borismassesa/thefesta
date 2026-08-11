'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { Upload, Trash2, Loader2 } from 'lucide-react'
import { uploadCmsMedia } from '@/lib/cms/upload-client'
import { resolveOpusPassAssetUrl } from '@/lib/cms/opus-pass-asset-url'

type Props = {
  label: string
  value: string
  onChange: (next: string) => void
  /** Supabase Storage path prefix — e.g. 'opus-pass/hero'. Lowercase, no leading slash. */
  pathPrefix: string
  /** Preview aspect ratio (Tailwind aspect-* utility). Defaults to 4/3. */
  previewAspect?: string
  /** Preview max width (Tailwind w-* utility). Defaults to max-w-sm. */
  previewWidth?: string
  /** Which file kind to accept. 'svg' restricts to SVG only. 'raster' excludes SVG. Defaults to 'image'. */
  accept?: 'image' | 'svg' | 'raster'
}

const ACCEPT_ATTR: Record<'image' | 'svg' | 'raster', string> = {
  image: 'image/jpeg,image/png,image/webp,image/gif,image/avif,image/svg+xml',
  svg: 'image/svg+xml,.svg',
  raster: 'image/jpeg,image/png,image/webp,image/gif,image/avif',
}

const FILE_NOUN: Record<'image' | 'svg' | 'raster', string> = {
  image: 'image',
  svg: 'SVG',
  raster: 'image',
}

const RASTER_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])

const inputCls =
  'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all'

export function ImageUploadField({
  label,
  value,
  onChange,
  pathPrefix,
  previewAspect = 'aspect-[4/3]',
  previewWidth = 'max-w-sm',
  accept = 'image',
}: Props) {
  const id = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const pickFile = () => fileRef.current?.click()

  const handleFile = (file: File) => {
    setError(null)
    if (accept === 'svg' && file.type !== 'image/svg+xml' && !file.name.toLowerCase().endsWith('.svg')) {
      setError('Please choose an SVG file.')
      return
    }
    if (accept === 'raster' && !RASTER_MIME.has(file.type)) {
      setError('Please choose a JPEG, PNG, WebP, GIF, or AVIF image.')
      return
    }
    startTransition(async () => {
      try {
        const { url } = await uploadCmsMedia(file, pathPrefix, accept)
        onChange(url)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  const noun = FILE_NOUN[accept]

  return (
    <div className="block space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-gray-600">{label}</span>
        {error && <span className="text-[11px] text-red-600 truncate max-w-[60%]" title={error}>{error}</span>}
      </div>

      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolveOpusPassAssetUrl(value)}
          alt=""
          className={`block ${previewWidth} w-full ${previewAspect} object-cover rounded-md border border-gray-200 bg-gray-50`}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button data-opus-button="neutral" data-opus-button-size="small"
          type="button"
          onClick={pickFile}
          disabled={pending}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#7E5896] hover:text-[#5d3a78] px-3 py-1.5 rounded-lg border border-[#C9A0DC] hover:bg-[#F0DFF6] transition-colors disabled:opacity-50"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {pending ? 'Uploading…' : value ? `Replace ${noun}` : `Upload ${noun}`}
        </button>
        {value && (
          <button data-opus-button="danger" data-opus-button-size="small"
            type="button"
            onClick={() => onChange('')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-red-600 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
        <input
          ref={fileRef}
          id={id}
          type="file"
          accept={ACCEPT_ATTR[accept]}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ''
          }}
        />
      </div>

      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={accept === 'svg' ? 'Or paste an SVG URL / asset path' : 'Or paste an image URL / asset path'}
        className={inputCls}
      />
    </div>
  )
}
