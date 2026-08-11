'use client'

import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  index: number
  title: string
  subtitle?: string
  collapsed: boolean
  onToggle: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onRemove?: () => void
  disableMoveUp?: boolean
  disableMoveDown?: boolean
  children: ReactNode
}

/**
 * Card with a header bar (toggle chevron + numbered title + reorder/remove
 * actions) and a collapsible body. Header actions never overlap title because
 * the header is a flex row, not a `<fieldset legend>` + absolute-positioned
 * div (which used to crash into long titles like "#1 · SAVE THE DATE").
 */
export function CollapsibleCard({
  index,
  title,
  subtitle,
  collapsed,
  onToggle,
  onMoveUp,
  onMoveDown,
  onRemove,
  disableMoveUp,
  disableMoveDown,
  children,
}: Props) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-stretch bg-gray-50">
        <button data-opus-button="control"
          type="button"
          onClick={onToggle}
          className="flex items-center gap-2 flex-1 min-w-0 text-left px-3 py-2 hover:bg-gray-100 transition-colors"
          aria-expanded={!collapsed}
        >
          <ChevronRight
            className={cn(
              'w-4 h-4 text-gray-500 transition-transform shrink-0',
              !collapsed && 'rotate-90',
            )}
          />
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 shrink-0">
            #{index + 1}
          </span>
          <span className="text-sm font-medium text-gray-900 truncate">{title || 'New item'}</span>
          {subtitle && (
            <span className="text-xs text-gray-500 font-normal truncate hidden sm:inline">
              · {subtitle}
            </span>
          )}
        </button>
        <div className="flex items-center gap-0.5 shrink-0 pr-1.5">
          {onMoveUp && (
            <button data-opus-button="control"
              type="button"
              onClick={onMoveUp}
              disabled={disableMoveUp}
              className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:hover:text-gray-400 rounded hover:bg-gray-200/60 transition-colors"
              aria-label="Move up"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          )}
          {onMoveDown && (
            <button data-opus-button="control"
              type="button"
              onClick={onMoveDown}
              disabled={disableMoveDown}
              className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:hover:text-gray-400 rounded hover:bg-gray-200/60 transition-colors"
              aria-label="Move down"
            >
              <ArrowDown className="w-4 h-4" />
            </button>
          )}
          {onRemove && (
            <button data-opus-button="control"
              type="button"
              onClick={onRemove}
              className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
              aria-label="Remove"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      {!collapsed && <div className="p-4 space-y-3 bg-white">{children}</div>}
    </div>
  )
}
