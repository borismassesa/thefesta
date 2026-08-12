'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AdviceIdeasBodySection } from '@/lib/cms/advice-ideas'
import { countBodyWords } from '@/lib/contribute/bodyMetrics'
import { validateReadiness } from '@/lib/contribute/validateReadiness'
import {
  displayStatus,
  isEditableContributorStatus,
  type ContributorDraft,
} from '@/lib/contribute/types'
import ContributorTopBar from './_components/ContributorTopBar'
import WritingCanvas from './_components/WritingCanvas'
import RightRail from './_components/RightRail'
import RevisionsBanner from './_components/RevisionsBanner'
import ArticlePreview from '@/components/article-preview/ArticlePreview'

type SaveState = 'saved' | 'saving' | 'failed'

export default function EditorClient({ initialDraft }: { initialDraft: ContributorDraft }) {
  const router = useRouter()
  const [draft, setDraft] = useState<ContributorDraft>(initialDraft)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [savedAt, setSavedAt] = useState<Date>(() => new Date(initialDraft.updated_at))
  const [shaking, setShaking] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirtyRef = useRef(false)
  const draftRef = useRef(draft)
  draftRef.current = draft

  const status = displayStatus(draft.status)
  const readOnly = !isEditableContributorStatus(draft.status)
  const readiness = useMemo(() => validateReadiness(draft), [draft])
  const savedLabel = useSavedLabel(savedAt)

  const markDirty = useCallback((next: Partial<ContributorDraft>) => {
    dirtyRef.current = true
    setDraft((current) => ({ ...current, ...next }))
  }, [])

  const saveNow = useCallback(async () => {
    if (readOnly || !dirtyRef.current) return true
    setSaveState('saving')
    setError(null)
    const snapshot = draftRef.current
    // What we're persisting on disk. If the user keeps typing while this is
    // in flight, we'll compare against this signature when the response lands
    // to know whether to clear the dirty flag.
    const snapshotSignature = JSON.stringify({
      title: snapshot.title,
      summary: snapshot.summary,
      category: snapshot.category,
      cover_image_url: snapshot.cover_image_url,
      cover_image_alt: snapshot.cover_image_alt,
      author_name: snapshot.author_name,
      author_role: snapshot.author_role,
      author_avatar_url: snapshot.author_avatar_url,
      body: snapshot.body,
      word_count: snapshot.word_count,
    })
    const payload = {
      title: snapshot.title,
      summary: snapshot.summary,
      category: snapshot.category,
      cover_image_url: snapshot.cover_image_url,
      cover_image_alt: snapshot.cover_image_alt,
      author_name: snapshot.author_name,
      author_role: snapshot.author_role,
      author_avatar_url: snapshot.author_avatar_url,
      body: snapshot.body,
      word_count: snapshot.word_count,
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(`/api/contribute/drafts/${snapshot.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const result = (await response.json()) as { draft?: ContributorDraft; error?: string }
        if (!response.ok || !result.draft) throw new Error(result.error || 'Save failed.')
        const savedDraft = result.draft
        // If the user kept typing during the round-trip, the local state has
        // moved past what we just persisted. Keep `dirtyRef` true so the next
        // debounce picks up the newer content. If we cleared it unconditionally,
        // those in-flight keystrokes would only get saved on the *next* user
        // edit, which felt like the editor was eating text.
        const live = draftRef.current
        const liveSignature = JSON.stringify({
          title: live.title,
          summary: live.summary,
          category: live.category,
          cover_image_url: live.cover_image_url,
          cover_image_alt: live.cover_image_alt,
          author_name: live.author_name,
          author_role: live.author_role,
          author_avatar_url: live.author_avatar_url,
          body: live.body,
          word_count: live.word_count,
        })
        const userKeptTyping = liveSignature !== snapshotSignature
        if (!userKeptTyping) dirtyRef.current = false
        // Local state is the source of truth for everything the user types.
        // Replacing title/summary/body with the server snapshot here would
        // clobber any edits made during the 1.5s autosave debounce + the
        // network round-trip — which is what was making the editor look like
        // it was eating text (top-of-article deletes appearing to remove the
        // last words, highlights reverting, deletes affecting the wrong
        // position). Only sync server-owned metadata fields.
        setDraft((current) => ({
          ...current,
          id: savedDraft.id,
          status: savedDraft.status,
          updated_at: savedDraft.updated_at,
          submitted_at: savedDraft.submitted_at,
          reviewed_at: savedDraft.reviewed_at,
          review_notes: savedDraft.review_notes,
        }))
        setSavedAt(new Date())
        setSaveState(userKeptTyping ? 'saving' : 'saved')
        return true
      } catch (saveError) {
        if (attempt === 2) {
          setSaveState('failed')
          setError(saveError instanceof Error ? saveError.message : 'Save failed.')
          return false
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
      }
    }
    return false
  }, [readOnly])

  useEffect(() => {
    if (readOnly || !dirtyRef.current) return
    const timer = window.setTimeout(() => {
      void saveNow()
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [draft, readOnly, saveNow])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveNow()
      }
    }
    const onBlur = () => {
      void saveNow()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onBlur)
    }
  }, [saveNow])

  async function submit() {
    if (!readiness.passed) {
      setShaking(true)
      window.setTimeout(() => setShaking(false), 450)
      return
    }
    setConfirmOpen(true)
  }

  async function confirmSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      const saved = await saveNow()
      if (!saved) {
        throw new Error('We could not save your latest changes. Try again in a moment.')
      }
      const response = await fetch(`/api/contribute/drafts/${draftRef.current.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftRef.current),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Submit failed.')
      setConfirmOpen(false)
      router.push('/contribute?submitted=1')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Submit failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FDFDFD]">
      <ContributorTopBar
        saveState={saveState}
        savedLabel={savedLabel}
        onRetry={() => void saveNow()}
        onPreview={() => setPreviewOpen(true)}
        onSubmit={submit}
        lockedStatus={readOnly ? (status as 'pending' | 'approved' | 'rejected' | 'published') : undefined}
      />
      <main className="mx-auto grid max-w-[1200px] grid-cols-[minmax(0,1fr)_280px] gap-8 px-4 py-10 sm:px-6 max-lg:grid-cols-1">
        <div className="min-w-0">
          {status === 'revisions' && (
            <RevisionsBanner notes={draft.review_notes} reviewedAt={draft.reviewed_at} />
          )}
          <WritingCanvas
            draftId={draft.id}
            title={draft.title}
            summary={draft.summary}
            body={draft.body}
            wordCount={draft.word_count}
            readOnly={readOnly}
            saveState={saveState}
            onTitleChange={(title) => markDirty({ title })}
            onSummaryChange={(summary) => markDirty({ summary })}
            onBodyChange={(body) => markDirty({ body, word_count: countBodyWords(body) })}
            onWordCountChange={(word_count) => setDraft((current) => ({ ...current, word_count }))}
          />
          {error && <p className="mt-4 text-sm font-medium text-red-700">{error}</p>}
        </div>
        <RightRail
          draftId={draft.id}
          draftTitle={draft.title}
          category={draft.category}
          body={draft.body}
          coverUrl={draft.cover_image_url}
          coverAlt={draft.cover_image_alt}
          readOnly={readOnly}
          status={status}
          notes={draft.review_notes}
          readinessItems={readiness.items}
          missingCount={readiness.missingCount}
          shaking={shaking}
          onCategoryChange={(category) => markDirty({ category })}
          onCoverChange={(next) => markDirty(next)}
          authorName={draft.author_name}
          authorRole={draft.author_role}
          authorAvatarUrl={draft.author_avatar_url}
          authorBio={draft.author_bio}
          authorInitials={draft.author_initials}
        />
      </main>

      {previewOpen && (
        <PreviewModal draft={draft} onClose={() => setPreviewOpen(false)} />
      )}
      {confirmOpen && (
        <SubmitModal
          submitting={submitting}
          error={error}
          onCancel={() => {
            setConfirmOpen(false)
            setError(null)
          }}
          onSubmit={confirmSubmit}
        />
      )}
    </div>
  )
}

function useSavedLabel(savedAt: Date): string {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])
  const seconds = Math.max(0, Math.round((now - savedAt.getTime()) / 1000))
  if (seconds < 5) return 'Saved just now'
  if (seconds < 60) return `Saved ${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  return `Saved ${minutes}m ago`
}

function SubmitModal({
  submitting,
  error,
  onCancel,
  onSubmit,
}: {
  submitting: boolean
  error: string | null
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-950">Submit this draft for review?</h2>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          An editor will review your piece and either publish it, send notes, or pass. The draft locks
          while it&apos;s being reviewed. You&apos;ll be able to edit again only if revisions are requested.
        </p>
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button data-opus-button="control" type="button" onClick={onCancel} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700">
            Cancel
          </button>
          <button data-opus-button="control"
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="rounded-lg bg-[#5B2D8E] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting ? 'Submitting...' : error ? 'Retry' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Renders the draft using the shared ArticlePreview component so the
// preview matches the public /advice-and-ideas/[slug] layout exactly.
function PreviewModal({ draft, onClose }: { draft: ContributorDraft; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white/95 px-6 py-3 backdrop-blur">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
          Preview · matches the live article layout
        </p>
        <button data-opus-button="control"
          type="button"
          onClick={onClose}
          className="text-sm font-semibold text-[#5B2D8E] hover:underline"
        >
          Close preview
        </button>
      </div>
      <ArticlePreview
        post={{
          title: draft.title,
          excerpt: draft.summary,
          category: draft.category,
          authorName: draft.author_name || 'Author',
          authorRole: draft.author_role,
          authorAvatarUrl: draft.author_avatar_url || undefined,
          readTime: `${Math.max(1, Math.ceil(draft.word_count / 200))} min read`,
          heroMediaSrc: draft.cover_image_url || undefined,
          heroMediaAlt: draft.cover_image_alt || '',
          heroMediaType: 'image',
          body: draft.body,
        }}
      />
    </div>
  )
}
