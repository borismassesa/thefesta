'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { Upload, Trash2, Loader2 } from 'lucide-react'
import { uploadCmsMedia } from '@/lib/cms/upload-client'
import { resolveOpusPassAssetUrl } from '@/lib/cms/opus-pass-asset-url'

export type MediaKind = 'image' | 'video'

type Props = {
  label: string
  value: string
  mediaType: MediaKind
  onChange: (next: { url: string; type: MediaKind }) => void
  /** Supabase Storage path prefix — e.g. 'opus-pass/editors-picks'. */
  pathPrefix: string
  /** Tailwind aspect-* utility for the preview frame. Defaults to aspect-square. */
  previewAspect?: string
  previewWidth?: string
}

const inputCls =
  'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all'

const ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime'

export function MediaUploadField({
  label,
  value,
  mediaType,
  onChange,
  pathPrefix,
  previewAspect = 'aspect-square',
  previewWidth = 'max-w-sm',
}: Props) {
  const id = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const pickFile = () => fileRef.current?.click()

  const handleFile = (file: File) => {
    setError(null)
    startTransition(async () => {
      try {
        const { url, type } = await uploadCmsMedia(file, pathPrefix, 'media')
        onChange({ url, type })
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  const clear = () => onChange({ url: '', type: mediaType })

  return (
    <div className="block space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-gray-600">{label}</span>
        {error && (
          <span className="text-[11px] text-red-600 truncate max-w-[60%]" title={error}>
            {error}
          </span>
        )}
      </div>

      {value && (
        <div
          className={`block ${previewWidth} w-full ${previewAspect} overflow-hidden rounded-md border border-gray-200 bg-gray-50`}
        >
          {mediaType === 'video' ? (
            <video
              src={resolveOpusPassAssetUrl(value)}
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolveOpusPassAssetUrl(value)}
              alt=""
              className="w-full h-full object-cover"
            />
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button data-opus-button="neutral" data-opus-button-size="small"
          type="button"
          onClick={pickFile}
          disabled={pending}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#7E5896] hover:text-[#5d3a78] px-3 py-1.5 rounded-lg border border-[#C9A0DC] hover:bg-[#F0DFF6] transition-colors disabled:opacity-50"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {pending ? 'Uploading…' : value ? 'Replace media' : 'Upload image or video'}
        </button>
        {value && (
          <button data-opus-button="danger" data-opus-button-size="small"
            type="button"
            onClick={clear}
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
          accept={ACCEPT}
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
        onChange={(e) => onChange({ url: e.target.value, type: mediaType })}
        placeholder="Or paste a media URL / asset path"
        className={inputCls}
      />
    </div>
  )
}
