'use client'

import { useRef, useState, useTransition } from 'react'
import {
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Trash2,
  Upload,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getRecordAttachmentUrl,
  removeRecordAttachment,
  uploadRecordAttachment,
  type RecordKind,
} from '../record-actions'
import type { RecordAttachment } from '../../../_lib/types'

// Compact attachment widget shared by every record tab on the employee
// detail page (Resume / Certifications / Badges / Documents).
//
// Two visual states:
//   * No attachment   → "Attach file" button that opens the file picker.
//   * Has attachment  → File chip with name, size, download / view buttons
//                       and a remove control. Hovering shows actions.
//
// All flows funnel through the three record-actions: uploadRecordAttachment,
// removeRecordAttachment, getRecordAttachmentUrl. The component never
// touches Supabase directly so we keep the trust boundary clean.

const ACCEPT =
  'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp'

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function isImageMime(mime: string | null): boolean {
  return Boolean(mime && mime.startsWith('image/'))
}

export function AttachmentControl({
  employeeId,
  recordKind,
  recordId,
  attachment,
  compact = false,
}: {
  employeeId: string
  recordKind: RecordKind
  recordId: string
  attachment: RecordAttachment | null
  // Compact mode hides the size label and uses smaller paddings for use
  // inside dense row layouts (e.g. resume rows). Default false = full pill.
  compact?: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function pickFile() {
    setError(null)
    fileInputRef.current?.click()
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append('employeeId', employeeId)
    formData.append('recordKind', recordKind)
    formData.append('recordId', recordId)
    formData.append('file', file)
    startTransition(async () => {
      try {
        await uploadRecordAttachment(formData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed.')
      } finally {
        // Reset the input so picking the same file twice re-triggers
        // the change event (browsers debounce identical selections).
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    })
  }

  function remove() {
    setError(null)
    startTransition(async () => {
      try {
        await removeRecordAttachment(employeeId, recordKind, recordId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Remove failed.')
      }
    })
  }

  async function openSignedUrl(mode: 'view' | 'download') {
    if (!attachment) return
    setError(null)
    try {
      // Pass the record identity, not the storage path — the action
      // re-reads the row and derives the key server-side.
      const result = await getRecordAttachmentUrl(employeeId, recordKind, recordId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      // For download, force browser save by appending the original
      // filename via the `download` attribute on a temporary anchor.
      const a = document.createElement('a')
      a.href = result.url
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      if (mode === 'download' && attachment.fileName) {
        a.download = attachment.fileName
      }
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open file.')
    }
  }

  return (
    <div className={cn('flex flex-col gap-1', compact ? 'text-[11px]' : 'text-xs')}>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={onFileChange}
      />

      {attachment ? (
        <div
          className={cn(
            'group flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50/60',
            compact ? 'px-2 py-1.5' : 'px-2.5 py-2',
          )}
        >
          <span
            className={cn(
              'inline-flex shrink-0 items-center justify-center rounded-md bg-white text-gray-500 shadow-sm',
              compact ? 'h-6 w-6' : 'h-7 w-7',
            )}
          >
            {isImageMime(attachment.mimeType) ? (
              <ImageIcon className="h-3.5 w-3.5" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <button data-opus-button="control"
              type="button"
              onClick={() => openSignedUrl('view')}
              className="truncate text-left font-semibold text-gray-800 hover:text-[#5B2D8E]"
              disabled={pending}
              title={attachment.fileName ?? attachment.storagePath}
            >
              {attachment.fileName ?? 'Attached file'}
            </button>
            {!compact && (
              <p className="text-[10px] text-gray-400 tabular-nums">
                {formatBytes(attachment.fileSizeBytes)}
                {attachment.mimeType ? ` · ${attachment.mimeType}` : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <IconAction
              label="Open in new tab"
              icon={<ExternalLink className="h-3 w-3" />}
              onClick={() => openSignedUrl('view')}
              disabled={pending}
            />
            <IconAction
              label="Download"
              icon={<Download className="h-3 w-3" />}
              onClick={() => openSignedUrl('download')}
              disabled={pending}
            />
            <IconAction
              label="Replace"
              icon={<Upload className="h-3 w-3" />}
              onClick={pickFile}
              disabled={pending}
            />
            <IconAction
              label="Remove file"
              icon={<Trash2 className="h-3 w-3" />}
              onClick={remove}
              tone="rose"
              disabled={pending}
            />
          </div>
        </div>
      ) : (
        <button data-opus-button="neutral" data-opus-button-size="small"
          type="button"
          onClick={pickFile}
          disabled={pending}
          className={cn(
            'inline-flex items-center gap-1.5 self-start rounded-lg border border-dashed border-gray-300 bg-white font-semibold text-gray-600 transition-colors hover:border-[#7E5896] hover:text-[#5B2D8E] disabled:opacity-50',
            compact ? 'px-2 py-1' : 'px-3 py-1.5',
          )}
        >
          <Paperclip className="h-3 w-3" />
          {pending ? 'Uploading…' : 'Attach file'}
        </button>
      )}

      {error && (
        <p className="text-[11px] font-medium text-rose-700">{error}</p>
      )}
    </div>
  )
}

function IconAction({
  label,
  icon,
  onClick,
  tone = 'purple',
  disabled,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  tone?: 'purple' | 'rose'
  disabled?: boolean
}) {
  return (
    <button data-opus-button="danger" data-opus-button-size="medium"
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'rounded-md p-1 text-gray-500 transition-colors hover:bg-white disabled:opacity-50',
        tone === 'purple' ? 'hover:text-[#5B2D8E]' : 'hover:text-rose-700',
      )}
    >
      {icon}
    </button>
  )
}
