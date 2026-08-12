'use client'

import { useRef, useState } from 'react'
import { Camera, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type LogoUploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

/**
 * Circular logo / profile-picture dropzone shared by the onboarding name step
 * and the storefront About editor. The caller supplies the actual `upload`
 * function (onboarding uploads to a user-scoped path; the storefront uploads to
 * the vendor path) so the UI is identical across both surfaces.
 *
 * Shows a blob preview while uploading, then stores the returned public URL via
 * `onChange`. Errors surface inline.
 */
export function LogoUpload({
  value,
  onChange,
  upload,
  disabled,
  label = 'Logo',
  hint = 'Square works best. JPG, PNG, or WebP.',
}: {
  value: string
  onChange: (url: string) => void
  upload: (file: File) => Promise<LogoUploadResult>
  disabled?: boolean
  label?: string
  hint?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const shown = preview ?? (value.trim() ? value : null)

  const handleFile = (file: File) => {
    setError(null)
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file (JPG, PNG, or WebP).')
      return
    }
    const blobUrl = URL.createObjectURL(file)
    setPreview(blobUrl)
    setUploading(true)
    upload(file)
      .then((res) => {
        setUploading(false)
        URL.revokeObjectURL(blobUrl)
        setPreview(null)
        if (!res.ok) {
          setError(res.error)
          return
        }
        onChange(res.url)
      })
      .catch((err) => {
        setUploading(false)
        URL.revokeObjectURL(blobUrl)
        setPreview(null)
        setError(
          err instanceof Error ? err.message : 'Logo upload failed. Try again.',
        )
      })
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <button data-opus-button="control"
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          aria-label={shown ? 'Replace logo' : 'Upload logo'}
          className={cn(
            'relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl transition-all',
            shown
              ? 'border border-gray-200'
              : 'border-2 border-dashed border-[#D4B6E0] hover:border-[#7E5896]',
            (disabled || uploading) && 'opacity-60',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={disabled || uploading}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) handleFile(file)
            }}
          />
          {shown ? (
            // Logos are usually non-square with padding — contain keeps them
            // whole instead of cropping; the white backdrop reads cleanly.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shown}
              alt="Logo"
              className="h-full w-full bg-white object-contain p-1"
            />
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-[#FAF1FD] text-[#7E5896]">
              <Camera className="h-5 w-5" />
              <span className="text-[9px] font-bold uppercase tracking-wider">
                Logo
              </span>
            </span>
          )}
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white">
              <Loader2 className="h-5 w-5 animate-spin" />
            </span>
          )}
        </button>

        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{label}</p>
          <p className="mt-0.5 text-xs text-gray-500">{hint}</p>
          {shown && !uploading && (
            <button data-opus-button="control"
              type="button"
              onClick={() => {
                setPreview(null)
                setError(null)
                onChange('')
              }}
              disabled={disabled}
              className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-rose-600 disabled:opacity-50"
            >
              <X className="h-3 w-3" /> Remove
            </button>
          )}
          {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
        </div>
      </div>
    </div>
  )
}
