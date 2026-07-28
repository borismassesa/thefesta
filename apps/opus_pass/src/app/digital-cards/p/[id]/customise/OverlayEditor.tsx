'use client'

import { useRef, useState } from 'react'
import { motion } from 'motion/react'
import {
  Trash2, RotateCcw, RotateCw, ChevronUp, ChevronDown,
  Minus, Plus, Copy,
} from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { cn } from '@/lib/utils'
import type { OverlayItem } from './_overlay-types'

type Props = {
  containerRef: React.RefObject<HTMLDivElement | null>
  items: OverlayItem[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onMove: (id: string, x: number, y: number) => void
  onUpdate: (id: string, patch: Partial<OverlayItem>) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
}

export function OverlayEditor({
  containerRef, items, selectedId, onSelect,
  onMove, onUpdate, onDelete, onDuplicate,
}: Props) {
  const colorInputRef = useRef<HTMLInputElement>(null)

  const selectedItem = items.find((it) => it.id === selectedId)

  const handleDragEnd = (id: string, x: number, y: number) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pct = (v: number, dim: number) => Math.min(100, Math.max(0, (v / dim) * 100))
    onMove(id, pct(x - (rect.left + window.scrollX), rect.width), pct(y - (rect.top + window.scrollY), rect.height))
  }

  return (
    <div
      className="absolute inset-0"
      onClick={() => onSelect(null)}
    >
      {/* Per-item inline toolbar (shown above selected item) */}
      {selectedItem && (
        <div
          className="absolute z-50 pointer-events-auto"
          style={{
            left: `${selectedItem.x}%`,
            top: `${Math.max(0, selectedItem.y - 12)}%`,
            transform: 'translateX(-50%) translateY(-100%)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white px-1.5 py-1 shadow-lg">
            {selectedItem.type !== 'image' && (
              <>
                <ToolbarBtn
                  aria-label="Decrease size"
                  onClick={() => onUpdate(selectedItem.id, { fontSize: Math.max(8, selectedItem.fontSize - 2) })}
                >
                  <Minus size={11} />
                </ToolbarBtn>
                <span className="px-1 text-[10px] font-bold tabular-nums text-gray-700">{selectedItem.fontSize}</span>
                <ToolbarBtn
                  aria-label="Increase size"
                  onClick={() => onUpdate(selectedItem.id, { fontSize: Math.min(60, selectedItem.fontSize + 2) })}
                >
                  <Plus size={11} />
                </ToolbarBtn>
                <div className="mx-1 h-4 w-px bg-gray-200" />
                <div className="relative">
                  <button
                    type="button"
                    aria-label="Change color"
                    onClick={() => colorInputRef.current?.click()}
                    className="h-5 w-5 rounded-full ring-1 ring-black/20 transition hover:scale-110"
                    style={{ backgroundColor: selectedItem.color || '#1A1A1A' }}
                  />
                  <input
                    ref={colorInputRef}
                    type="color"
                    value={selectedItem.color || '#1A1A1A'}
                    onChange={(e) => onUpdate(selectedItem.id, { color: e.target.value })}
                    className="absolute h-0 w-0 opacity-0"
                    aria-hidden="true"
                  />
                </div>
                <div className="mx-1 h-4 w-px bg-gray-200" />
              </>
            )}
            <ToolbarBtn
              aria-label="Rotate counter-clockwise"
              onClick={() => onUpdate(selectedItem.id, { rotation: selectedItem.rotation - 15 })}
            >
              <RotateCcw size={11} />
            </ToolbarBtn>
            <ToolbarBtn
              aria-label="Rotate clockwise"
              onClick={() => onUpdate(selectedItem.id, { rotation: selectedItem.rotation + 15 })}
            >
              <RotateCw size={11} />
            </ToolbarBtn>
            <div className="mx-1 h-4 w-px bg-gray-200" />
            <ToolbarBtn
              aria-label="Bring forward"
              onClick={() => onUpdate(selectedItem.id, { zIndex: selectedItem.zIndex + 1 })}
            >
              <ChevronUp size={11} />
            </ToolbarBtn>
            <ToolbarBtn
              aria-label="Send backward"
              onClick={() => onUpdate(selectedItem.id, { zIndex: Math.max(0, selectedItem.zIndex - 1) })}
            >
              <ChevronDown size={11} />
            </ToolbarBtn>
            <div className="mx-1 h-4 w-px bg-gray-200" />
            <ToolbarBtn aria-label="Duplicate" onClick={() => onDuplicate(selectedItem.id)}>
              <Copy size={11} />
            </ToolbarBtn>
            <ToolbarBtn
              aria-label="Delete"
              onClick={() => onDelete(selectedItem.id)}
              className="text-red-500 hover:bg-red-50"
            >
              <Trash2 size={11} />
            </ToolbarBtn>
          </div>
        </div>
      )}

      {/* Overlay items */}
      {[...items].sort((a, b) => a.zIndex - b.zIndex).map((item) => {
        const isSelected = item.id === selectedId
        return (
          <OverlayItemView
            key={item.id}
            item={item}
            isSelected={isSelected}
            containerRef={containerRef}
            onDragEnd={handleDragEnd}
            onSelect={onSelect}
            onUpdate={onUpdate}
          />
        )
      })}
    </div>
  )
}

function TextOverlayEditor({
  item,
  onUpdate,
  onStopEditing,
}: {
  item: OverlayItem
  onUpdate: (id: string, patch: Partial<OverlayItem>) => void
  onStopEditing: () => void
}) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ bold: false, italic: false, strike: false, code: false, blockquote: false, bulletList: false, orderedList: false, horizontalRule: false, heading: false, codeBlock: false })],
    content: item.content,
    autofocus: true,
    editorProps: {
      attributes: {
        class: 'outline-none min-w-[80px] text-center whitespace-pre-wrap leading-snug',
      },
    },
    onBlur: ({ editor }) => {
      onUpdate(item.id, { content: editor.getText() })
      onStopEditing()
    },
  })

  return (
    <EditorContent
      editor={editor}
      onClick={(e) => e.stopPropagation()}
      style={{ fontSize: item.fontSize, color: item.color, lineHeight: 1.3 }}
    />
  )
}

function OverlayItemView({
  item,
  isSelected,
  containerRef,
  onDragEnd,
  onSelect,
  onUpdate,
}: {
  item: OverlayItem
  isSelected: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
  onDragEnd: (id: string, x: number, y: number) => void
  onSelect: (id: string) => void
  onUpdate: (id: string, patch: Partial<OverlayItem>) => void
}) {
  const [editing, setEditing] = useState(false)

  return (
    <motion.div
      key={`${item.id}-${Math.round(item.x)}-${Math.round(item.y)}`}
      drag={!editing}
      dragMomentum={false}
      dragConstraints={containerRef}
      dragElastic={0}
      onDragEnd={(_, info) => onDragEnd(item.id, info.point.x, info.point.y)}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(item.id)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        if (item.type === 'text') setEditing(true)
      }}
      className={cn(
        'absolute cursor-grab select-none pointer-events-auto active:cursor-grabbing',
        editing && 'cursor-text',
        isSelected && 'outline outline-2 outline-offset-2 outline-[#1A1A1A] rounded-sm',
      )}
      style={{
        left: `${item.x}%`,
        top: `${item.y}%`,
        rotate: item.rotation,
        opacity: item.opacity,
        zIndex: item.zIndex + 10,
      }}
    >
      {/* Inner wrapper handles centering — kept separate so Framer's transform compositing doesn't clobber it */}
      <div style={{ transform: 'translate(-50%, -50%)' }}>
        {item.type === 'text' && (
          editing ? (
            <TextOverlayEditor
              item={item}
              onUpdate={onUpdate}
              onStopEditing={() => setEditing(false)}
            />
          ) : (
            <span
              className="block whitespace-pre-wrap text-center leading-snug"
              style={{ fontSize: item.fontSize, color: item.color }}
            >
              {item.content}
            </span>
          )
        )}
        {item.type === 'sticker' && (
          <span
            className="block leading-none"
            style={{ fontSize: item.fontSize * 2 }}
          >
            {item.content}
          </span>
        )}
        {item.type === 'image' && (
          <img
            src={item.content}
            alt="Overlay image"
            draggable={false}
            className="block max-h-20 max-w-[5rem] rounded object-cover ring-1 ring-black/10"
          />
        )}
      </div>
    </motion.div>
  )
}

function ToolbarBtn({
  children,
  onClick,
  className,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode
  onClick: () => void
  className?: string
  'aria-label': string
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        'grid h-6 w-6 place-items-center rounded text-gray-600 transition hover:bg-gray-100 hover:text-gray-900',
        className,
      )}
    >
      {children}
    </button>
  )
}
