'use client'

import type { ReactNode } from 'react'
import { Check, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

type BaseProps = {
  label: string
  description?: ReactNode
  icon?: ReactNode
  selected: boolean
  onToggle: () => void
  hint?: string
  variant?: 'checkbox' | 'radio' | 'plain'
  disabled?: boolean
}

export function OptionCard({
  label,
  description,
  icon,
  selected,
  onToggle,
  hint,
  variant = 'checkbox',
  disabled,
}: BaseProps) {
  return (
    <button data-opus-button="control"
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'group w-full text-left bg-white rounded-xl border transition-all',
        'shadow-[0_1px_2px_-1px_rgba(0,0,0,0.06),0_2px_8px_-3px_rgba(0,0,0,0.08)]',
        'px-5 py-4 lg:px-6 lg:py-5 flex items-start gap-4',
        selected
          ? 'border-gray-900 bg-gray-50 ring-1 ring-gray-900'
          : 'border-gray-200 hover:border-gray-400',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      {variant !== 'plain' ? (
        <span
          aria-hidden
          className={cn(
            'mt-0.5 shrink-0 flex items-center justify-center transition-colors',
            variant === 'radio'
              ? 'w-5 h-5 rounded-full border'
              : 'w-5 h-5 rounded-md border',
            selected ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white' : 'border-gray-300 bg-white',
          )}
        >
          {selected ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : null}
        </span>
      ) : null}

      {icon ? <span className="mt-0.5 text-gray-900 shrink-0">{icon}</span> : null}

      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-semibold text-gray-900">{label}</span>
        {description ? (
          <span className="block mt-1 text-sm text-gray-600 leading-snug">{description}</span>
        ) : null}
      </span>

      {hint ? (
        <span
          aria-label={hint}
          title={hint}
          className="mt-0.5 shrink-0 text-gray-400"
        >
          <Info className="w-4 h-4" />
        </span>
      ) : null}
    </button>
  )
}
