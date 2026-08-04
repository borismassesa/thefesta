'use client'

import {
  Download,
  FileArchive,
  FileAudio,
  FileSpreadsheet,
  FileText,
  FileVideo,
  File as FileIcon,
  Presentation,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBytes } from './lib'
import type { AttachmentKind, CaseAttachment } from './types'

export function attachmentIcon(kind: AttachmentKind) {
  switch (kind) {
    case 'pdf':
      return { Icon: FileText, color: '#E15656', tint: '#FCDDDD' }
    case 'sheet':
      return { Icon: FileSpreadsheet, color: '#1F8A4C', tint: '#DCF3E4' }
    case 'slide':
      return { Icon: Presentation, color: '#E97B2A', tint: '#FCE6D4' }
    case 'doc':
      return { Icon: FileText, color: '#4A90E2', tint: '#E1ECF9' }
    case 'audio':
      return { Icon: FileAudio, color: '#7E5896', tint: '#F0DFF6' }
    case 'video':
      return { Icon: FileVideo, color: '#7E5896', tint: '#F0DFF6' }
    case 'archive':
      return { Icon: FileArchive, color: '#7A7A7A', tint: '#EFEFEF' }
    default:
      return { Icon: FileIcon, color: '#7A7A7A', tint: '#EFEFEF' }
  }
}

export function AttachmentGallery({ attachments }: { attachments: CaseAttachment[] }) {
  const images = attachments.filter((a) => a.kind === 'image' && (a.thumbUrl || a.url))
  const files = attachments.filter((a) => !(a.kind === 'image' && (a.thumbUrl || a.url)))

  return (
    <div className="mt-3 space-y-2">
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {images.map((a) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="group relative block aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-100 hover:border-[#C9A0DC] transition"
              title={`${a.name} · ${formatBytes(a.size)}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.thumbUrl || a.url}
                alt={a.name}
                className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                loading="lazy"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-[10px] font-semibold text-white truncate">{a.name}</p>
                <p className="text-[9px] text-white/80 tabular-nums">{formatBytes(a.size)}</p>
              </div>
            </a>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((a) => (
            <FileChip key={a.id} attachment={a} />
          ))}
        </div>
      )}
    </div>
  )
}

export function FileChip({ attachment }: { attachment: CaseAttachment }) {
  const { Icon, color, tint } = attachmentIcon(attachment.kind)
  const downloadable = Boolean(attachment.url)

  return (
    <a
      href={attachment.url || '#'}
      target={attachment.url ? '_blank' : undefined}
      rel="noreferrer"
      onClick={(e) => {
        if (!attachment.url) e.preventDefault()
      }}
      className={cn(
        'group flex items-center gap-2.5 pl-2 pr-3 py-2 rounded-xl border border-gray-100 bg-white max-w-[260px]',
        downloadable
          ? 'hover:border-[#C9A0DC] hover:shadow-[0_1px_6px_-2px_rgba(0,0,0,0.08)] transition cursor-pointer'
          : 'cursor-default',
      )}
      title={attachment.name}
    >
      <span
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: tint, color }}
      >
        <Icon className="w-4 h-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold text-gray-900 truncate">
          {attachment.name}
        </span>
        <span className="block text-[11px] text-gray-400 tabular-nums">
          {attachment.kind.toUpperCase()} · {formatBytes(attachment.size)}
        </span>
      </span>
      {downloadable && (
        <Download className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#7E5896] shrink-0" />
      )}
    </a>
  )
}

export function StagedChip({
  attachment,
  onRemove,
}: {
  attachment: CaseAttachment
  onRemove: () => void
}) {
  const { Icon, color, tint } = attachmentIcon(attachment.kind)
  const isImage = attachment.kind === 'image' && attachment.thumbUrl

  return (
    <div className="group relative flex items-center gap-2 pl-1.5 pr-2 py-1.5 rounded-xl border border-gray-100 bg-gray-50 max-w-[220px]">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={attachment.thumbUrl} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" />
      ) : (
        <span
          className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
          style={{ background: tint, color }}
        >
          <Icon className="w-3.5 h-3.5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-gray-800 truncate">{attachment.name}</p>
        <p className="text-[10px] text-gray-400 tabular-nums">{formatBytes(attachment.size)}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        title="Remove"
        aria-label={`Remove ${attachment.name}`}
        className="w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#E15656] transition-colors shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
