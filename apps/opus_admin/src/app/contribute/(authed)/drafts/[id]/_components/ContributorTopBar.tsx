'use client'

import Link from 'next/link'
import { ChevronLeft, Send } from 'lucide-react'
import StatusPill from '@/app/(admin)/operations/_shared/StatusPill'
import { cn } from '@/lib/utils'

type SaveState = 'saved' | 'saving' | 'failed'

export default function ContributorTopBar({
  saveState,
  savedLabel,
  onRetry,
  onPreview,
  onSubmit,
  lockedStatus,
}: {
  saveState: SaveState
  savedLabel: string
  onRetry: () => void
  onPreview: () => void
  onSubmit: () => void
  lockedStatus?: 'pending' | 'approved' | 'rejected' | 'published'
}) {
  const dot =
    saveState === 'failed' ? 'bg-red-500' : saveState === 'saving' ? 'bg-amber-500' : 'bg-emerald-500'
  const text =
    saveState === 'failed' ? 'Save failed - retry' : saveState === 'saving' ? 'Saving...' : savedLabel

  return (
    <div className="sticky top-0 z-30 border-b border-gray-200/80 bg-white">
      <div className="mx-auto flex min-h-16 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 text-sm">
          <Link
            href="/contribute"
            className="inline-flex items-center gap-1 font-semibold text-gray-700 hover:text-gray-950"
          >
            <ChevronLeft className="h-4 w-4" />
            Drafts
          </Link>
          <span className="h-5 w-px bg-gray-200" aria-hidden />
          <button data-opus-button="control"
            type="button"
            onClick={saveState === 'failed' ? onRetry : undefined}
            className={cn(
              'inline-flex items-center gap-2 text-sm font-medium text-gray-600',
              saveState === 'failed' && 'text-red-700 underline-offset-2 hover:underline'
            )}
          >
            <span className={cn('h-2 w-2 rounded-full', dot)} />
            <span className="truncate">{text}</span>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <button data-opus-button="control"
            type="button"
            onClick={onPreview}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            Preview
          </button>
          {lockedStatus ? (
            <StatusPill
              variant={lockedStatus === 'approved' || lockedStatus === 'published' ? 'published' : lockedStatus === 'rejected' ? 'rejected' : 'pending'}
              label={lockedStatus === 'pending' ? 'In review' : lockedStatus === 'rejected' ? 'Not accepted' : 'Published'}
            />
          ) : (
            <button data-opus-button="control"
              type="button"
              onClick={onSubmit}
              className="inline-flex items-center gap-2 rounded-xl bg-[#5B2D8E] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#4D247A]"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Submit for review</span>
              <span className="sm:hidden">Submit</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
