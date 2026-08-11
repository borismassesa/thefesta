'use client'

import type { Editor } from '@tiptap/react'
import { useRef, useState } from 'react'
import {
  Bold,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Quote,
  Redo2,
  Undo2,
  Video,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type ToolbarItem =
  | {
      kind: 'button'
      key: string
      label: string
      icon: typeof Bold
      isActive: () => boolean
      isDisabled?: () => boolean
      onClick: () => void
    }
  | { kind: 'divider'; key: string }

export default function EditorToolbar({
  editor,
  onUploadImage,
}: {
  editor: Editor | null
  onUploadImage?: (file: File) => Promise<string>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  if (!editor) return null

  function promptLink() {
    if (!editor) return
    const previous = editor.getAttributes('link').href as string | undefined
    const next = window.prompt('Link URL', previous ?? 'https://')
    if (next === null) return
    if (next === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    const href = next.trim()
    if (!href) return
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
  }

  async function pickImage() {
    if (!onUploadImage) return
    fileRef.current?.click()
  }

  async function handleFile(file: File) {
    if (!onUploadImage || !editor) return
    setUploading(true)
    setUploadError(null)
    try {
      const url = await onUploadImage(file)
      editor
        .chain()
        .focus()
        .setImage({ src: url, alt: file.name.replace(/\.[^.]+$/, '') })
        .run()
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  function promptVideo() {
    if (!editor) return
    const raw = window.prompt(
      'Video URL (YouTube, Vimeo, or any video link)',
      'https://www.youtube.com/watch?v='
    )
    if (raw === null) return
    const src = raw.trim()
    if (!src) return
    const alt = window.prompt('Short description (for accessibility)', '') ?? ''
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'legacyBlock',
        attrs: { data: { type: 'video', src, alt } },
      })
      .run()
  }

  const items: ToolbarItem[] = [
    {
      kind: 'button',
      key: 'bold',
      label: 'Bold',
      icon: Bold,
      isActive: () => editor.isActive('bold'),
      onClick: () => editor.chain().focus().toggleBold().run(),
    },
    {
      kind: 'button',
      key: 'italic',
      label: 'Italic',
      icon: Italic,
      isActive: () => editor.isActive('italic'),
      onClick: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      kind: 'button',
      key: 'link',
      label: 'Link',
      icon: LinkIcon,
      isActive: () => editor.isActive('link'),
      onClick: promptLink,
    },
    { kind: 'divider', key: 'd1' },
    {
      kind: 'button',
      key: 'h2',
      label: 'Heading 2',
      icon: Heading2,
      isActive: () => editor.isActive('heading', { level: 2 }),
      onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      kind: 'button',
      key: 'h3',
      label: 'Heading 3',
      icon: Heading3,
      isActive: () => editor.isActive('heading', { level: 3 }),
      onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    { kind: 'divider', key: 'd2' },
    {
      kind: 'button',
      key: 'bullet',
      label: 'Bulleted list',
      icon: List,
      isActive: () => editor.isActive('bulletList'),
      onClick: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      kind: 'button',
      key: 'ordered',
      label: 'Numbered list',
      icon: ListOrdered,
      isActive: () => editor.isActive('orderedList'),
      onClick: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      kind: 'button',
      key: 'quote',
      label: 'Quote',
      icon: Quote,
      isActive: () => editor.isActive('blockquote'),
      onClick: () => editor.chain().focus().toggleBlockquote().run(),
    },
    { kind: 'divider', key: 'd3' },
    ...(onUploadImage
      ? ([
          {
            kind: 'button',
            key: 'image',
            label: uploading ? 'Uploading image…' : 'Insert image',
            icon: uploading ? Loader2 : ImageIcon,
            isActive: () => false,
            isDisabled: () => uploading,
            onClick: pickImage,
          },
        ] satisfies ToolbarItem[])
      : []),
    {
      kind: 'button',
      key: 'video',
      label: 'Insert video',
      icon: Video,
      isActive: () => false,
      onClick: promptVideo,
    },
    {
      kind: 'button',
      key: 'hr',
      label: 'Divider',
      icon: Minus,
      isActive: () => false,
      onClick: () => editor.chain().focus().setHorizontalRule().run(),
    },
    { kind: 'divider', key: 'd4' },
    {
      kind: 'button',
      key: 'undo',
      label: 'Undo',
      icon: Undo2,
      isActive: () => false,
      isDisabled: () => !editor.can().undo(),
      onClick: () => editor.chain().focus().undo().run(),
    },
    {
      kind: 'button',
      key: 'redo',
      label: 'Redo',
      icon: Redo2,
      isActive: () => false,
      isDisabled: () => !editor.can().redo(),
      onClick: () => editor.chain().focus().redo().run(),
    },
  ]

  return (
    <>
      <div
        role="toolbar"
        aria-label="Writing tools"
        className="mb-4 flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5"
      >
        {items.map((item) => {
          if (item.kind === 'divider') {
            return <span key={item.key} aria-hidden className="mx-1 h-5 w-px bg-gray-200" />
          }
          const Icon = item.icon
          const active = item.isActive()
          const disabled = item.isDisabled?.() ?? false
          const spinning = item.key === 'image' && uploading
          return (
            <button data-opus-button="control"
              key={item.key}
              type="button"
              aria-label={item.label}
              aria-pressed={active}
              title={item.label}
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={item.onClick}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 transition-colors',
                !disabled && 'hover:bg-gray-100 hover:text-gray-950',
                active && 'bg-[#F0DFF6] text-[#7E5896]',
                disabled && 'cursor-not-allowed opacity-40'
              )}
            >
              <Icon className={cn('h-4 w-4', spinning && 'animate-spin')} />
            </button>
          )
        })}
      </div>
      {onUploadImage && (
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleFile(file)
            event.currentTarget.value = ''
          }}
        />
      )}
      {uploadError && (
        <p className="mb-3 -mt-1 text-xs font-medium text-red-700">{uploadError}</p>
      )}
    </>
  )
}
