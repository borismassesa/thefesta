'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ImageIcon,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  ADVICE_IDEAS_SECTION_IDS,
  type AdviceIdeasSectionId,
  type AdviceTopicItem,
  type AdviceTopicsContent,
} from '@/lib/cms/advice-ideas'
import { cn } from '@/lib/utils'
import { useEditorActions } from '../EditorActionsContext'
import { Card, Field, inputCls } from '../_ui'
import { resolveMediaUrl } from '../_media'
import { discardAdvicePageDraft, publishAdvicePage, saveAdvicePageDraft } from '../page-actions'
import { uploadAdviceMedia } from '@/app/(admin)/operations/articles/actions'

type Props = { initial: AdviceTopicsContent; hasDraft: boolean }

export default function TopicsEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [items, setItems] = useState<AdviceTopicItem[]>(initial.items)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const { bind, unbind } = useEditorActions()

  const update = (idx: number, patch: Partial<AdviceTopicItem>) =>
    setItems((list) => list.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  const remove = (idx: number) =>
    setItems((list) => list.filter((_, i) => i !== idx))
  const move = (idx: number, dir: -1 | 1) => {
    const t = idx + dir
    if (t < 0 || t >= items.length) return
    const next = [...items]
    ;[next[idx], next[t]] = [next[t], next[idx]]
    setItems(next)
    // Keep the moved row's expanded state, since identity follows the index
    // we use for openIdx.
    if (openIdx === idx) setOpenIdx(t)
    else if (openIdx === t) setOpenIdx(idx)
  }
  const add = () => {
    const unused = ADVICE_IDEAS_SECTION_IDS.find(
      (id) => !items.some((it) => it.id === id)
    )
    setItems((list) => {
      const next = [
        ...list,
        {
          id: (unused ?? 'planning-guides') as AdviceIdeasSectionId,
          label: 'New topic',
          description: 'Short description of this topic.',
          cover_image_url: '',
        },
      ]
      // Auto-open the freshly added row.
      setOpenIdx(next.length - 1)
      return next
    })
  }

  const handleSaveDraft = () =>
    startTransition(async () => {
      await saveAdvicePageDraft('topics', { items })
      setHasDraft(true)
      setMessage('Draft saved.')
    })
  const handlePublish = () =>
    startTransition(async () => {
      await saveAdvicePageDraft('topics', { items })
      await publishAdvicePage('topics')
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })
  const handleDiscard = () =>
    startTransition(async () => {
      await discardAdvicePageDraft('topics')
      setItems(initial.items)
      setHasDraft(false)
      setMessage('Draft discarded.')
      setOpenIdx(null)
    })

  useEffect(() => {
    bind({
      hasDraft,
      pending,
      message,
      onSaveDraft: handleSaveDraft,
      onPublish: handlePublish,
      onDiscard: handleDiscard,
    })
    return () => unbind()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDraft, pending, message, items])

  return (
    <Card
      title={`Topics (${items.length})`}
      action={
        <button data-opus-button="control"
          type="button"
          onClick={add}
          className="flex items-center gap-1.5 rounded-md border border-[#E7D5EE] px-2.5 py-1.5 text-xs font-semibold text-[#7E5896] transition-colors hover:bg-[#F8F0FB] hover:text-[#5c3f72]"
        >
          <Plus className="h-3.5 w-3.5" />
          Add topic
        </button>
      }
    >
      <div className="overflow-hidden rounded-lg border border-gray-200">
        {items.map((it, idx) => (
          <TopicRow
            key={`${it.id}-${idx}`}
            idx={idx}
            total={items.length}
            item={it}
            open={openIdx === idx}
            onToggle={() => setOpenIdx(openIdx === idx ? null : idx)}
            onUpdate={(patch) => update(idx, patch)}
            onRemove={() => {
              if (openIdx === idx) setOpenIdx(null)
              remove(idx)
            }}
            onMove={(dir) => move(idx, dir)}
            disabled={pending}
            onUploadDone={(url) => update(idx, { cover_image_url: url })}
          />
        ))}
        {items.length === 0 && (
          <div className="border-t border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-400">
            No topics yet — add one above.
          </div>
        )}
      </div>
    </Card>
  )
}

function TopicRow({
  idx,
  total,
  item,
  open,
  onToggle,
  onUpdate,
  onRemove,
  onMove,
  disabled,
  onUploadDone,
}: {
  idx: number
  total: number
  item: AdviceTopicItem
  open: boolean
  onToggle: () => void
  onUpdate: (patch: Partial<AdviceTopicItem>) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
  disabled: boolean
  onUploadDone: (url: string) => void
}) {
  return (
    <div
      className={cn(
        'border-b border-gray-100 last:border-b-0',
        open && 'bg-[#FAF5FB]/50'
      )}
    >
      {/* Compact row — click to expand */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button data-opus-button="control"
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? 'Collapse topic' : 'Expand topic'}
          className="flex flex-1 items-center gap-3 rounded-md text-left transition-colors hover:bg-white/60"
        >
          <span className="text-gray-400">
            {open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
          <span className="relative h-10 w-14 shrink-0 overflow-hidden rounded bg-gray-100">
            {item.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolveMediaUrl(item.cover_image_url)}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-gray-300">
                <ImageIcon className="h-4 w-4" />
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-gray-900">
              {item.label || <em className="font-normal italic text-gray-400">Untitled topic</em>}
            </span>
            <span className="block truncate text-xs text-gray-500">
              <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700">
                #{item.id}
              </code>
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-0.5">
          <IconBtn
            title="Move up"
            onClick={() => onMove(-1)}
            disabled={idx === 0}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            title="Move down"
            onClick={() => onMove(1)}
            disabled={idx === total - 1}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn title="Remove" onClick={onRemove} danger>
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </div>

      {/* Expanded edit form */}
      {open && (
        <div className="border-t border-gray-100 bg-white px-4 py-4">
          <ExpandedFields
            item={item}
            disabled={disabled}
            onUpdate={onUpdate}
            onUploadDone={onUploadDone}
          />
        </div>
      )}
    </div>
  )
}

function ExpandedFields({
  item,
  disabled,
  onUpdate,
  onUploadDone,
}: {
  item: AdviceTopicItem
  disabled: boolean
  onUpdate: (patch: Partial<AdviceTopicItem>) => void
  onUploadDone: (url: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('slug', `topic-${item.id}`)
    try {
      setUploading(true)
      const { url } = await uploadAdviceMedia(fd)
      onUploadDone(url)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[180px_1fr]">
      {/* Cover preview + upload */}
      <div className="space-y-2">
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
          {item.cover_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolveMediaUrl(item.cover_image_url)}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xs text-gray-400">
              No cover
            </span>
          )}
        </div>
        <button data-opus-button="control"
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? 'Uploading…' : 'Upload cover'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onUpload}
        />
      </div>

      {/* Fields */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
          <Field label="Section">
            <select
              value={item.id}
              onChange={(e) => onUpdate({ id: e.target.value as AdviceIdeasSectionId })}
              className={inputCls}
            >
              {ADVICE_IDEAS_SECTION_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Label">
            <input
              type="text"
              value={item.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              className={inputCls}
            />
          </Field>
        </div>
        <Field label="Short description">
          <input
            type="text"
            value={item.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Cover image URL">
          <input
            type="text"
            value={item.cover_image_url}
            onChange={(e) => onUpdate({ cover_image_url: e.target.value })}
            className={inputCls}
            placeholder="/assets/images/… or https://…"
          />
        </Field>
      </div>
    </div>
  )
}

function IconBtn({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button data-opus-button="danger" data-opus-button-size="medium"
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-md p-1.5 transition-colors disabled:opacity-30 disabled:hover:bg-transparent',
        danger
          ? 'text-gray-500 hover:bg-red-50 hover:text-red-600'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
      )}
    >
      {children}
    </button>
  )
}
