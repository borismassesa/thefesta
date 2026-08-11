'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  EyeOff,
  MessageSquare,
  Plus,
  Save,
  Send,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react'
import {
  ADVICE_BLOCK_TYPES,
  ADVICE_IDEAS_CATEGORIES,
  ADVICE_IDEAS_CATEGORY_GROUPS,
  ADVICE_IDEAS_SECTION_IDS,
  ADVICE_IDEAS_SECTION_LABELS,
  getCategorySection,
  sectionIdForCategory,
  slugify,
  type AdviceIdeasBlock,
  type AdviceIdeasBodySection,
  type AdviceIdeasSectionId,
  type AdviceIdeasSeedComment,
} from '@/lib/cms/advice-ideas'
import { cn } from '@/lib/utils'
import { Card, Field, FieldGroup, inputCls } from '@/app/(admin)/cms/advice-and-ideas/_ui'
import { resolveMediaUrl } from '@/app/(admin)/cms/advice-and-ideas/_media'
import { ArticleEditor } from '@/lib/editor'
import { useSetPageHeading } from '@/components/PageHeading'
import { HeaderActionsSlot } from '@/components/HeaderPortals'
import ArticlePreview from '@/components/article-preview/ArticlePreview'
import SectionsCard from '@/components/article-sections/SectionsCard'
import { createAdvicePost, updateAdvicePost, type PostUpsertInput } from './actions'
import {
  approveAdviceSubmission,
  rejectAdviceSubmission,
  requestAdviceSubmissionCorrections,
  saveContributorSubmission,
  submitContributorSubmission,
  updateAdviceSubmissionAsAdmin,
  uploadContributorMedia,
} from '@/lib/advice-submission-actions'
import {
  statusLabel,
  statusTone,
  type AdviceSubmissionStatus,
} from '@/lib/advice-submissions'

type Props = {
  mode: 'create' | 'edit'
  id?: string
  initial: PostUpsertInput
  workflow?: 'post' | 'contributor-submission' | 'admin-submission'
  submissionStatus?: AdviceSubmissionStatus
  correctionNotes?: string | null
  adminNotes?: string | null
  backHref?: string
  backLabel?: string
}

// Same canonical list the contributor side uses — see ADVICE_IDEAS_CATEGORY_GROUPS
// in lib/cms/advice-ideas. The dropdown renders them grouped by section
// (Inspiration / Advice).
const CATEGORY_OPTIONS = ADVICE_IDEAS_CATEGORIES

function toDateInput(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}
function fromDateInput(v: string): string {
  if (!v) return new Date().toISOString()
  const d = new Date(v + 'T00:00:00.000Z')
  return d.toISOString()
}

// Count visible words across every block so the author gets live feedback
// and so we can auto-compute a read-time estimate (avg ~225 wpm).
function countBodyWords(body: PostUpsertInput['body']): number {
  let n = 0
  for (const s of body) {
    if (s.heading) n += s.heading.trim().split(/\s+/).filter(Boolean).length
    if (s.label) n += s.label.trim().split(/\s+/).filter(Boolean).length
    for (const b of s.blocks) {
      if (b.type === 'paragraph' || b.type === 'subheading') {
        n += b.text.trim().split(/\s+/).filter(Boolean).length
      } else if (b.type === 'list') {
        for (const it of b.items) n += it.trim().split(/\s+/).filter(Boolean).length
      } else if (b.type === 'quote') {
        n += b.quote.trim().split(/\s+/).filter(Boolean).length
        if (b.attribution) n += b.attribution.trim().split(/\s+/).filter(Boolean).length
      } else if (b.type === 'tip') {
        n += b.title.trim().split(/\s+/).filter(Boolean).length
        n += b.text.trim().split(/\s+/).filter(Boolean).length
      } else if (b.type === 'image' || b.type === 'video') {
        if (b.caption) n += b.caption.trim().split(/\s+/).filter(Boolean).length
      }
    }
  }
  return n
}

function estimateReadMinutes(words: number): number {
  return Math.max(1, Math.round(words / 225))
}

async function uploadAdminAdviceMedia(
  file: File,
  slug: string
): Promise<{ url: string; type: 'image' | 'video' }> {
  const form = new FormData()
  form.append('file', file)
  form.append('slug', slug || 'new')
  const response = await fetch('/api/operations/articles/media', {
    method: 'POST',
    body: form,
  })
  const payload = (await response.json().catch(() => ({}))) as {
    url?: string
    type?: 'image' | 'video'
    error?: string
  }
  if (!response.ok || !payload.url || !payload.type) {
    throw new Error(payload.error || 'Upload failed.')
  }
  return { url: payload.url, type: payload.type }
}

function formatRelativeTime(then: number, now: number): string {
  const delta = Math.max(0, now - then)
  const s = Math.round(delta / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return `${h}h ago`
}

// Publish-readiness check — returns human-readable reasons so the UI can
// block publish and tell the author exactly what's missing.
function validateForPublish(draft: PostUpsertInput): string[] {
  const errs: string[] = []
  if (!draft.title.trim()) errs.push('Title is required')
  if (!draft.slug.trim()) errs.push('Slug is required')
  if (!draft.excerpt.trim()) errs.push('Excerpt is required (shown on cards)')
  if (!draft.hero_media_src.trim()) errs.push('Hero media is required')
  if (!draft.hero_media_alt.trim() && draft.hero_media_type === 'image')
    errs.push('Hero image alt text is required')
  if (!draft.author_name.trim()) errs.push('Author name is required')
  if (draft.body.length === 0) errs.push('Add at least one body section')
  return errs
}

const AUTOSAVE_PREFIX = 'opusfesta:advice-post-draft:'
function autosaveKey(mode: 'create' | 'edit', id: string | undefined): string {
  return `${AUTOSAVE_PREFIX}${mode === 'edit' ? (id ?? 'unknown') : 'new'}`
}

export default function PostEditor({
  mode,
  id,
  initial,
  workflow = 'post',
  submissionStatus,
  correctionNotes,
  adminNotes,
  backHref,
  backLabel,
}: Props) {
  const router = useRouter()
  const isContributorSubmission = workflow === 'contributor-submission'
  const isAdminSubmission = workflow === 'admin-submission'
  const isSubmission = workflow !== 'post'
  const showSeedComments = !isContributorSubmission

  // Start from the server `initial` on both server and client so SSR and
  // hydration match. Local-storage recovery happens post-mount in a
  // useEffect below.
  const [draft, setDraft] = useState<PostUpsertInput>(initial)
  const [savedSnapshot, setSavedSnapshot] = useState<PostUpsertInput>(initial)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [nowTick, setNowTick] = useState<number>(() => Date.now())
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [showPublishErrors, setShowPublishErrors] = useState(false)
  const [slugEdited, setSlugEdited] = useState<boolean>(!!initial.slug)
  const [readTimeManual, setReadTimeManual] = useState<boolean>(!!initial.read_time && initial.read_time !== 5)
  const heroInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const summaryRef = useRef<HTMLTextAreaElement>(null)
  const [avatarDragOver, setAvatarDragOver] = useState(false)

  // Auto-grow the borderless title + summary textareas when their values
  // change externally (e.g. loading an existing post). The onChange handlers
  // resize during typing; these effects handle initial render and any
  // server-side autosave restoration.
  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft.title])
  useEffect(() => {
    const el = summaryRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft.excerpt])

  const set = <K extends keyof PostUpsertInput>(key: K, value: PostUpsertInput[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const onTitleChange = (title: string) => {
    setDraft((d) => ({
      ...d,
      title,
      slug: slugEdited ? d.slug : slugify(title),
    }))
  }
  const onSlugChange = (slug: string) => {
    setSlugEdited(true)
    set('slug', slugify(slug))
  }

  // Word count + auto read-time suggestion
  const wordCount = useMemo(() => countBodyWords(draft.body), [draft.body])
  const suggestedReadTime = useMemo(() => estimateReadMinutes(wordCount), [wordCount])
  useEffect(() => {
    if (readTimeManual) return
    if (draft.read_time !== suggestedReadTime) {
      setDraft((d) => ({ ...d, read_time: suggestedReadTime }))
    }
  }, [suggestedReadTime, readTimeManual, draft.read_time])

  // Dirty tracking — true when the in-memory draft diverges from the last
  // thing we persisted to the server.
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(savedSnapshot),
    [draft, savedSnapshot]
  )

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // LocalStorage autosave (debounced) — belt-and-suspenders against lost work
  // on crashes, browser close, or accidental back navigation.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = autosaveKey(mode, id)
    if (!dirty) {
      window.localStorage.removeItem(key)
      return
    }
    const handle = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          key,
          JSON.stringify({ savedAt: Date.now(), draft })
        )
      } catch {
        // Quota exceeded or Safari private mode — fail silent.
      }
    }, 800)
    return () => window.clearTimeout(handle)
  }, [draft, dirty, mode, id])

  // Re-render every 30s so the "Saved X ago" label stays accurate without
  // wasting render cycles per tick.
  useEffect(() => {
    const iv = window.setInterval(() => setNowTick(Date.now()), 30_000)
    return () => window.clearInterval(iv)
  }, [])

  // Post-mount recovery from localStorage — kept out of the useState
  // initializer so SSR and first-client-render agree. If a recent snapshot
  // exists and differs from `initial`, restore it silently. Older-than-7-day
  // snapshots are dropped. Runs exactly once for this mount.
  const recoveredRef = useRef(false)
  useEffect(() => {
    if (recoveredRef.current) return
    recoveredRef.current = true
    try {
      const raw = window.localStorage.getItem(autosaveKey(mode, id))
      if (!raw) return
      const parsed = JSON.parse(raw) as { savedAt: number; draft: PostUpsertInput }
      const weekMs = 7 * 24 * 60 * 60 * 1000
      if (Date.now() - parsed.savedAt > weekMs) {
        window.localStorage.removeItem(autosaveKey(mode, id))
        return
      }
      const recovered: PostUpsertInput = { ...initial, ...parsed.draft }
      if (JSON.stringify(recovered) === JSON.stringify(initial)) return
      setDraft(recovered)
      setMessage('Recovered unsaved changes from your last session.')
    } catch {
      // Ignore — quota, JSON, or storage errors just mean no recovery.
    }
    // Runs once per mount — initial/mode/id are stable for a given route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const publishErrors = useMemo(() => validateForPublish(draft), [draft])
  // Inline preview modal state. Renders the draft via the shared
  // ArticlePreview component so what admins see here matches the public
  // /advice-and-ideas/[slug] layout exactly — and works on unsaved drafts
  // (no need to publish first to preview).
  const [previewOpen, setPreviewOpen] = useState(false)
  const canPreview =
    workflow !== 'contributor-submission' && Boolean(draft.title.trim())

  const headingTitle =
    isContributorSubmission
      ? draft.title.trim() || 'Article submission'
      : isAdminSubmission
        ? draft.title.trim() || 'Review submission'
        : mode === 'create'
          ? 'New article'
          : draft.title.trim() || 'Untitled article'
  const headingSubtitle = draft.slug
    ? `/advice-and-ideas/${draft.slug}`
    : mode === 'create'
      ? 'Draft — not yet saved'
      : undefined
  useSetPageHeading({ title: headingTitle, subtitle: headingSubtitle })

  const uploadHero = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('slug', draft.slug || 'new')
    if (id) fd.append('submissionId', id)
    startTransition(async () => {
      try {
        const { url, type } = isContributorSubmission
          ? await uploadContributorMedia(fd)
          : await uploadAdminAdviceMedia(file, draft.slug || 'new')
        setDraft((d) => ({ ...d, hero_media_src: url, hero_media_type: type }))
        setMessage('Hero media uploaded.')
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Hero media upload failed.')
      }
    })
  }

  const uploadAvatarFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setMessage('Avatar must be an image.')
      return
    }
    const fd = new FormData()
    fd.append('file', file)
    fd.append('slug', draft.slug || 'new')
    if (id) fd.append('submissionId', id)
    startTransition(async () => {
      try {
        const { url } = isContributorSubmission
          ? await uploadContributorMedia(fd)
          : await uploadAdminAdviceMedia(file, draft.slug || 'new')
        setDraft((d) => ({ ...d, author_avatar_url: url }))
        setMessage('Avatar uploaded.')
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Avatar upload failed.')
      }
    })
  }
  const onAvatarFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadAvatarFile(file)
    e.target.value = ''
  }
  const onAvatarDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setAvatarDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) uploadAvatarFile(file)
  }

  const persist = useCallback(
    async (payload: PostUpsertInput): Promise<{ id: string } | null> => {
      try {
        if (workflow === 'contributor-submission') {
          if (!id) throw new Error('Missing submission id.')
          await saveContributorSubmission(id, payload)
          setSavedSnapshot(payload)
          setLastSavedAt(Date.now())
          router.refresh()
          return { id }
        }
        if (workflow === 'admin-submission') {
          if (!id) throw new Error('Missing submission id.')
          await updateAdviceSubmissionAsAdmin(id, payload)
          setSavedSnapshot(payload)
          setLastSavedAt(Date.now())
          router.refresh()
          return { id }
        }
        if (mode === 'create') {
          const { id: newId } = await createAdvicePost(payload)
          setSavedSnapshot(payload)
          setLastSavedAt(Date.now())
          // Clear the 'new' autosave slot — the draft now lives under its id.
          try {
            window.localStorage.removeItem(autosaveKey('create', undefined))
          } catch {}
          router.push(`/operations/articles/${newId}`)
          return { id: newId }
        }
        if (!id) return null
        await updateAdvicePost(id, payload)
        setSavedSnapshot(payload)
        setLastSavedAt(Date.now())
        router.refresh()
        return { id }
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Something went wrong.')
        return null
      }
    },
    [id, mode, router, workflow]
  )

  // "Save draft" — persists the current editor state without publishing. If
  // the post was previously published it stays published; we only flip that
  // bit through the explicit Publish/Unpublish controls.
  const handleSaveDraft = () =>
    startTransition(async () => {
      const result = await persist(draft)
      if (result) setMessage(draft.published ? 'Saved.' : 'Draft saved.')
    })

  const handlePublish = () => {
    if (publishErrors.length > 0) {
      setShowPublishErrors(true)
      setMessage(
        isContributorSubmission
          ? 'Fix the issues below before submitting.'
          : 'Fix the issues below before publishing.'
      )
      return
    }
    startTransition(async () => {
      if (isContributorSubmission) {
        if (!id) return
        try {
          await submitContributorSubmission(id, draft)
          setSavedSnapshot(draft)
          setMessage('Submitted for review.')
          router.push('/contribute/articles')
        } catch (err) {
          setMessage(err instanceof Error ? err.message : 'Submission failed.')
        }
        return
      }
      const payload = { ...draft, published: true }
      setDraft(payload)
      const result = await persist(payload)
      if (result) setMessage('Published — live on the site.')
      setShowPublishErrors(false)
    })
  }

  const handleUnpublish = () =>
    startTransition(async () => {
      const payload = { ...draft, published: false }
      setDraft(payload)
      const result = await persist(payload)
      if (result) setMessage('Unpublished — the article is now a draft.')
    })

  const handleRequestCorrections = () =>
    startTransition(async () => {
      if (!id) return
      const notes = window.prompt('What should the author correct?')
      if (notes == null) return
      const saved = await persist(draft)
      if (!saved) return
      try {
        await requestAdviceSubmissionCorrections(id, notes)
        setMessage('Corrections requested.')
        router.refresh()
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Could not request corrections.')
      }
    })

  const handleRejectSubmission = () =>
    startTransition(async () => {
      if (!id) return
      const notes = window.prompt('Optional rejection note for the record:')
      if (notes == null) return
      try {
        await rejectAdviceSubmission(id, notes)
        setMessage('Submission rejected.')
        router.refresh()
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Could not reject submission.')
      }
    })

  const handleApproveSubmission = (publish: boolean) => {
    if (publishErrors.length > 0) {
      setShowPublishErrors(true)
      setMessage('Fix the issues below before approval.')
      return
    }
    startTransition(async () => {
      if (!id) return
      const saved = await persist(draft)
      if (!saved) return
      try {
        const result = await approveAdviceSubmission(id, publish)
        if (result.revalidationFailures?.length) {
          setMessage(
            (publish ? 'Published from submission' : 'Approved as article draft') +
              ` — but website cache refresh failed: ${result.revalidationFailures.join('; ')}.`
          )
        } else {
          setMessage(publish ? 'Published from submission.' : 'Approved as article draft.')
        }
        router.push(`/operations/articles/${result.postId}`)
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Approval failed.')
      }
    })
  }

  const handleRevert = () => {
    if (!dirty) return
    if (!confirm('Discard unsaved changes?')) return
    setDraft(savedSnapshot)
    setMessage('Unsaved changes discarded.')
    try {
      window.localStorage.removeItem(autosaveKey(mode, id))
    } catch {}
  }

  // ---- Body section handlers ----
  const addSection = () => {
    const newSection: AdviceIdeasBodySection = {
      id: `section-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: '',
      heading: 'New section',
      blocks: [{ type: 'paragraph', text: '' }],
    }
    setDraft((d) => ({ ...d, body: [...d.body, newSection] }))
  }
  const updateSection = (sid: string, patch: Partial<AdviceIdeasBodySection>) =>
    setDraft((d) => ({
      ...d,
      body: d.body.map((s) => (s.id === sid ? { ...s, ...patch } : s)),
    }))
  const removeSection = (sid: string) =>
    setDraft((d) => ({ ...d, body: d.body.filter((s) => s.id !== sid) }))
  const moveSection = (sid: string, dir: -1 | 1) =>
    setDraft((d) => {
      const idx = d.body.findIndex((s) => s.id === sid)
      const t = idx + dir
      if (idx < 0 || t < 0 || t >= d.body.length) return d
      const next = [...d.body]
      ;[next[idx], next[t]] = [next[t], next[idx]]
      return { ...d, body: next }
    })

  const actionControls = (
    <>
      <span
        className={cn(
          'inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full',
          dirty
            ? 'bg-amber-50 text-amber-700'
            : isSubmission && submissionStatus
              ? statusTone(submissionStatus)
              : draft.published
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-gray-100 text-gray-600'
        )}
      >
        {dirty
          ? 'Unsaved changes'
          : isSubmission && submissionStatus
            ? statusLabel(submissionStatus)
            : draft.published
              ? 'Published'
              : 'Draft'}
      </span>

      {message ? (
        <span className="max-w-[24ch] truncate text-xs text-gray-500" title={message}>
          {message}
        </span>
      ) : lastSavedAt ? (
        <span className="whitespace-nowrap text-xs text-gray-500" suppressHydrationWarning>
          Saved {formatRelativeTime(lastSavedAt, nowTick)}
        </span>
      ) : null}

      {dirty && mode === 'edit' && (
        <button data-opus-button="control"
          type="button"
          onClick={handleRevert}
          disabled={pending}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          Discard
        </button>
      )}

      <button data-opus-button="control"
        type="button"
        disabled={pending || (!dirty && mode === 'edit')}
        onClick={handleSaveDraft}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {isAdminSubmission ? 'Save edits' : draft.published ? 'Save' : 'Save draft'}
      </button>

      {isContributorSubmission ? (
        <button data-opus-button="primary" data-opus-button-size="medium"
          type="button"
          disabled={pending}
          onClick={handlePublish}
          className="flex items-center gap-1.5 rounded-lg bg-[#C9A0DC] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#b97fd0] disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          Submit for review
        </button>
      ) : isAdminSubmission ? (
        <>
          <button data-opus-button="warning" data-opus-button-size="medium"
            type="button"
            disabled={pending}
            onClick={handleRequestCorrections}
            className="flex items-center gap-1.5 rounded-lg border border-amber-200 px-3 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50 disabled:opacity-50"
          >
            <MessageSquare className="h-4 w-4" />
            Request corrections
          </button>
          <button data-opus-button="danger" data-opus-button-size="medium"
            type="button"
            disabled={pending}
            onClick={handleRejectSubmission}
            className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" />
            Reject
          </button>
          <button data-opus-button="control"
            type="button"
            disabled={pending}
            onClick={() => handleApproveSubmission(false)}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            Approve draft
          </button>
          <button data-opus-button="primary" data-opus-button-size="medium"
            type="button"
            disabled={pending}
            onClick={() => handleApproveSubmission(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[#C9A0DC] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#b97fd0] disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Publish
          </button>
        </>
      ) : draft.published ? (
        <button data-opus-button="control"
          type="button"
          disabled={pending}
          onClick={handleUnpublish}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          <EyeOff className="h-4 w-4" />
          Unpublish
        </button>
      ) : (
        <button data-opus-button="primary" data-opus-button-size="medium"
          type="button"
          disabled={pending}
          onClick={handlePublish}
          className="flex items-center gap-1.5 rounded-lg bg-[#C9A0DC] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#b97fd0] disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          Publish
        </button>
      )}
    </>
  )

  // === RENDER ===
  // Two-column editor layout. Left column = writing canvas (title, summary,
  // hero, body, seed comments — what the admin is *making*). Right column =
  // metadata rail (slug, category, section, author, dates — what the admin
  // is *configuring*). Mirrors the contributor editor's WritingCanvas +
  // RightRail pattern. On <lg the rail collapses below the canvas.
  return (
    <div className="px-8 pt-8 pb-12">
      {!isContributorSubmission && <HeaderActionsSlot>{actionControls}</HeaderActionsSlot>}

      <div className="max-w-[1280px] mx-auto">
        {isContributorSubmission && (
          <div className="sticky top-0 z-20 -mx-4 mb-6 flex flex-wrap items-center justify-end gap-2 border-b border-gray-100 bg-[#FDFDFD]/95 px-4 py-3 backdrop-blur">
            {actionControls}
          </div>
        )}

        {/* Top row — back link + preview link, full width above the grid */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link
            href={backHref ?? '/operations/articles'}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4" /> {backLabel ?? 'All articles'}
          </Link>

          {canPreview && (
            <button data-opus-button="control"
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              <ExternalLink className="w-4 h-4" />
              Preview
            </button>
          )}
        </div>

        {/* Banners (correction notes / admin notes / publish errors) sit
            above the grid so they get full reading width. */}
        {correctionNotes && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Correction request</p>
            <p className="mt-1 leading-relaxed">{correctionNotes}</p>
          </div>
        )}

        {adminNotes && isAdminSubmission && (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
            <p className="font-semibold text-gray-900">Admin notes</p>
            <p className="mt-1 leading-relaxed">{adminNotes}</p>
          </div>
        )}

        {showPublishErrors && publishErrors.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-800">
                A few things to fix before {isContributorSubmission ? 'submitting' : 'publishing'}
              </p>
              <ul className="mt-1 list-disc pl-4 text-sm text-amber-700 space-y-0.5">
                {publishErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Two-column layout */}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">

          {/* === LEFT: writing canvas === */}
          <div className="min-w-0 space-y-6">

            {/* Document header — borderless title + summary, Notion-style. */}
            <div className="px-1 pt-2 pb-1">
              <textarea
                ref={titleRef}
                aria-label="Article title"
                value={draft.title}
                onChange={(e) => {
                  onTitleChange(e.target.value)
                  e.currentTarget.style.height = 'auto'
                  e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`
                }}
                onKeyDown={(e) => {
                  // Titles are single-paragraph — Enter shouldn't insert a
                  // newline. Wrapping happens automatically as text fills width.
                  if (e.key === 'Enter') e.preventDefault()
                }}
                placeholder="Article title"
                rows={1}
                className="block w-full resize-none border-0 bg-transparent p-0 text-[28px] font-semibold leading-tight tracking-tight text-gray-950 outline-none placeholder:text-gray-400 sm:text-[32px]"
              />
              <textarea
                ref={summaryRef}
                aria-label="Article summary"
                value={draft.excerpt}
                onChange={(e) => {
                  set('excerpt', e.target.value)
                  e.currentTarget.style.height = 'auto'
                  e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`
                }}
                placeholder="Short summary — appears on cards and in search results."
                rows={2}
                className="mt-5 block min-h-[48px] w-full resize-none border-0 bg-transparent p-0 text-base leading-[1.6] text-gray-600 outline-none placeholder:text-gray-400"
              />
              {(() => {
                // Soft word limit — the summary renders unclamped on the
                // /advice-and-ideas trending hero card, so an overly long one
                // pushes layout. Advisory only; doesn't block publishing.
                const SUMMARY_MAX_WORDS = 50
                const trimmed = draft.excerpt.trim()
                const words = trimmed
                  ? trimmed.split(/\s+/).filter(Boolean).length
                  : 0
                const over = words > SUMMARY_MAX_WORDS
                const near = !over && words > SUMMARY_MAX_WORDS * 0.85
                return (
                  <p
                    className={cn(
                      'mt-2 text-[11px] tabular-nums font-medium',
                      over
                        ? 'text-rose-600'
                        : near
                          ? 'text-amber-600'
                          : 'text-gray-400'
                    )}
                  >
                    {words}/{SUMMARY_MAX_WORDS} words
                    {over && ' · trim for cleaner card layout'}
                  </p>
                )
              })()}
            </div>

            {/* Hero media */}
            <Card title="Hero media">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <Field label="Media type">
                    <select
                      value={draft.hero_media_type}
                      onChange={(e) => set('hero_media_type', e.target.value as 'image' | 'video')}
                      className={inputCls}
                    >
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                    </select>
                  </Field>
                  <Field label="Media URL">
                    <input
                      type="text"
                      value={draft.hero_media_src}
                      onChange={(e) => set('hero_media_src', e.target.value)}
                      className={inputCls}
                      placeholder="/assets/images/… or https://…"
                    />
                  </Field>
                  <Field label="Alt text">
                    <input
                      type="text"
                      value={draft.hero_media_alt}
                      onChange={(e) => set('hero_media_alt', e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  {draft.hero_media_type === 'video' && (
                    <Field label="Poster image URL (optional)">
                      <input
                        type="text"
                        value={draft.hero_media_poster}
                        onChange={(e) => set('hero_media_poster', e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                  )}
                  <div className="flex items-center gap-2">
                    <button data-opus-button="control"
                      type="button"
                      onClick={() => heroInputRef.current?.click()}
                      disabled={pending}
                      className="flex items-center gap-2 text-sm font-medium text-gray-700 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      <Upload className="w-4 h-4" />
                      Upload media
                    </button>
                    <input
                      ref={heroInputRef}
                      type="file"
                      accept="image/*,video/*"
                      hidden
                      onChange={uploadHero}
                    />
                  </div>
                </div>
                <div>
                  <div className="rounded-xl overflow-hidden bg-gray-100 aspect-[16/10]">
                    {draft.hero_media_src ? (
                      draft.hero_media_type === 'video' ? (
                        <video src={resolveMediaUrl(draft.hero_media_src)} className="w-full h-full object-cover" autoPlay muted loop playsInline />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={resolveMediaUrl(draft.hero_media_src)} alt="" className="w-full h-full object-cover" />
                      )
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                        No media set
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* Article body — TipTap WYSIWYG editor (same component the
                contributor flow uses, in admin mode). Replaces the legacy
                form-based section/block editor. The data shape on disk is
                still AdviceIdeasBodySection[]; the editor translates to/from
                its internal TipTap doc transparently. */}
            <Card title="Article body">
              <div className="mb-4">
                <SectionsCard body={draft.body} />
              </div>
              <ArticleEditor
                value={draft.body}
                onChange={(body) => setDraft((d) => ({ ...d, body }))}
                mode="admin"
                placeholder="Start writing the article — use the toolbar to add headings, lists, quotes, images, videos…"
                onUploadImage={async (file) => {
                  const fd = new FormData()
                  fd.append('file', file)
                  fd.append('slug', draft.slug || 'new')
                  if (id) fd.append('submissionId', id)
                  const { url } = isContributorSubmission
                    ? await uploadContributorMedia(fd)
                    : await uploadAdminAdviceMedia(file, draft.slug || 'new')
                  return url
                }}
                onUploadVideo={async (file) => {
                  // Same upload path as image — the media endpoints accept
                  // both (already used for hero video uploads).
                  const fd = new FormData()
                  fd.append('file', file)
                  fd.append('slug', draft.slug || 'new')
                  if (id) fd.append('submissionId', id)
                  const { url } = isContributorSubmission
                    ? await uploadContributorMedia(fd)
                    : await uploadAdminAdviceMedia(file, draft.slug || 'new')
                  return url
                }}
              />
            </Card>

            {showSeedComments && (
              <Card
                title={`Seed comments (${draft.seed_comments.length})`}
                action={
                  <button data-opus-button="control"
                    type="button"
                    onClick={() =>
                      set('seed_comments', [
                        ...draft.seed_comments,
                        { id: `c-${Date.now()}`, name: '', body: '', date: new Date().toISOString().slice(0, 10), likes: 0 },
                      ])
                    }
                    className="flex items-center gap-1.5 text-xs font-semibold text-[#7E5896] hover:text-[#5c3f72] px-2.5 py-1.5 rounded-md border border-[#E7D5EE] hover:bg-[#F8F0FB] transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add comment
                  </button>
                }
              >
                <p className="text-xs text-gray-500 -mt-2 mb-2">
                  Seed-populate the article&apos;s comment thread (shown beneath the Author Card).
                </p>
                <div className="space-y-3">
                  {draft.seed_comments.map((c, i) => (
                    <SeedCommentRow
                      key={c.id}
                      index={i}
                      total={draft.seed_comments.length}
                      comment={c}
                      onChange={(patch) =>
                        set(
                          'seed_comments',
                          draft.seed_comments.map((cc, idx) => (idx === i ? { ...cc, ...patch } : cc))
                        )
                      }
                      onRemove={() =>
                        set('seed_comments', draft.seed_comments.filter((_, idx) => idx !== i))
                      }
                      onMove={(dir) => {
                        const t = i + dir
                        if (t < 0 || t >= draft.seed_comments.length) return
                        const next = [...draft.seed_comments]
                        ;[next[i], next[t]] = [next[t], next[i]]
                        set('seed_comments', next)
                      }}
                    />
                  ))}
                  {draft.seed_comments.length === 0 && (
                    <div className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg px-4 py-6 text-center">
                      No seed comments yet — add one above.
                    </div>
                  )}
                </div>
              </Card>
            )}

          </div>

          {/* === RIGHT: metadata rail (sticky on lg+, with internal scroll
                so a tall rail doesn't cut off Essentials when the viewport
                is shorter than the rail's combined card height). === */}
          <aside className="space-y-6 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">

            {/* Author + publication */}
            <Card title="Author & publication">
              <Field label="Author name">
                <input
                  type="text"
                  value={draft.author_name}
                  onChange={(e) => set('author_name', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Author role/title">
                <input
                  type="text"
                  value={draft.author_role}
                  onChange={(e) => set('author_role', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Author avatar (optional)">
                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    setAvatarDragOver(true)
                  }}
                  onDragLeave={() => setAvatarDragOver(false)}
                  onDrop={onAvatarDrop}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border-2 border-dashed p-3 transition-colors',
                    avatarDragOver
                      ? 'border-[#C9A0DC] bg-[#F8F0FB]'
                      : 'border-gray-200 bg-gray-50/40 hover:border-gray-300'
                  )}
                >
                  <div className="w-12 h-12 rounded-full bg-white border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    {draft.author_avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveMediaUrl(draft.author_avatar_url)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>No</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-700">
                      Drag &amp; drop, or{' '}
                      <button data-opus-button="control"
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={pending}
                        className="font-semibold text-[#7E5896] hover:text-[#5c3f72] underline-offset-2 hover:underline disabled:opacity-50"
                      >
                        browse
                      </button>
                      .
                    </p>
                  </div>
                  {draft.author_avatar_url && (
                    <button data-opus-button="danger" data-opus-button-size="small"
                      type="button"
                      onClick={() => set('author_avatar_url', '')}
                      disabled={pending}
                      className="text-xs font-medium text-gray-500 hover:text-gray-900 px-2 py-1 rounded-md hover:bg-white border border-transparent hover:border-gray-200 transition-colors disabled:opacity-50 shrink-0"
                    >
                      Remove
                    </button>
                  )}
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={onAvatarFileInput}
                  />
                </div>
              </Field>
              {!isContributorSubmission && (
                <>
                  <Field label="Published date">
                    <input
                      type="date"
                      value={toDateInput(draft.published_at)}
                      onChange={(e) => set('published_at', fromDateInput(e.target.value))}
                      className={inputCls}
                    />
                  </Field>
                  <label className="flex items-center gap-2 text-sm text-gray-700 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={draft.featured}
                      onChange={(e) => set('featured', e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    Feature on the homepage
                  </label>
                  <p className="text-xs text-gray-500">
                    {isAdminSubmission
                      ? 'Approval and publishing are controlled from the review action bar above.'
                      : 'Publish status is controlled from the action bar above — use '}
                    {!isAdminSubmission && (
                      <>
                        <span className="font-semibold text-gray-700">Publish</span> /{' '}
                        <span className="font-semibold text-gray-700">Unpublish</span>.
                      </>
                    )}
                  </p>
                </>
              )}
            </Card>

            {/* Essentials — without title/excerpt (those live in the writing canvas) */}
            <Card title="Essentials">
              <Field label="Slug (URL)">
                <div className="flex items-stretch">
                  <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-200 bg-gray-50 text-xs text-gray-500">
                    /advice-and-ideas/
                  </span>
                  <input
                    type="text"
                    value={draft.slug}
                    onChange={(e) => onSlugChange(e.target.value)}
                    className={cn(inputCls, 'rounded-l-none')}
                    placeholder="post-slug"
                  />
                </div>
              </Field>
              <Field label="Category">
                <select
                  value={draft.category ?? ''}
                  onChange={(e) => {
                    const next = e.target.value
                    set('category', next)
                    // Auto-derive the hub section so the article lands in the
                    // right bucket. Admin can still override afterwards.
                    const derived = sectionIdForCategory(next)
                    if (derived) set('section_id', derived)
                  }}
                  className={inputCls}
                >
                  <option value="" disabled>
                    Select a category…
                  </option>
                  {draft.category &&
                    !CATEGORY_OPTIONS.includes(draft.category) && (
                      <option value={draft.category}>
                        {draft.category} (legacy)
                      </option>
                    )}
                  {ADVICE_IDEAS_CATEGORY_GROUPS.map((group) => (
                    <optgroup key={group.section} label={group.section}>
                      {group.categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {draft.category && (
                  <p className="mt-1 text-[11px] text-gray-500">
                    {getCategorySection(draft.category)
                      ? `Goes under ${getCategorySection(draft.category)} on the live site.`
                      : 'Legacy category — pick one of the canonical options to map this article to a section.'}
                  </p>
                )}
              </Field>
              <Field label="Hub section">
                <select
                  value={draft.section_id}
                  onChange={(e) =>
                    set('section_id', e.target.value as AdviceIdeasSectionId)
                  }
                  className={inputCls}
                >
                  {ADVICE_IDEAS_SECTION_IDS.map((s) => (
                    <option key={s} value={s}>
                      {ADVICE_IDEAS_SECTION_LABELS[s]}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-gray-500">
                  Which bucket the article appears in on{' '}
                  <span className="font-mono text-gray-600">
                    /advice-and-ideas
                  </span>
                  . Auto-fills from category — change to override (e.g., move
                  to <span className="font-semibold">Featured Stories</span>).
                </p>
              </Field>
              <Field
                label="Read time (minutes)"
                hint={
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {wordCount} word{wordCount === 1 ? '' : 's'}
                    {!readTimeManual ? ' · auto' : ''}
                  </span>
                }
              >
                <div className="flex items-stretch gap-2">
                  <input
                    type="number"
                    min={1}
                    value={draft.read_time}
                    onChange={(e) => {
                      setReadTimeManual(true)
                      set('read_time', parseInt(e.target.value || '1', 10))
                    }}
                    className={inputCls}
                  />
                  {readTimeManual && (
                    <button data-opus-button="control"
                      type="button"
                      onClick={() => {
                        setReadTimeManual(false)
                        set('read_time', suggestedReadTime)
                      }}
                      className="text-xs font-semibold text-[#7E5896] hover:text-[#5c3f72] px-2 rounded-md border border-[#E7D5EE] hover:bg-[#F8F0FB] whitespace-nowrap"
                      title="Reset to estimated read time based on body word count"
                    >
                      Auto
                    </button>
                  )}
                </div>
              </Field>
              <Field label="Description (SEO + meta)">
                <textarea
                  value={draft.description}
                  onChange={(e) => set('description', e.target.value)}
                  rows={2}
                  className={inputCls}
                />
              </Field>
            </Card>

          </aside>

        </div>
      </div>

      {/* Inline preview modal — renders the draft using the shared
          ArticlePreview component so it matches the public article layout. */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-white">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white/95 px-6 py-3 backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
              Preview · matches the live article layout
            </p>
            <button data-opus-button="control"
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="text-sm font-semibold text-[#7E5896] hover:underline"
            >
              Close preview
            </button>
          </div>
          <ArticlePreview
            post={{
              title: draft.title,
              excerpt: draft.excerpt,
              category: draft.category,
              authorName: draft.author_name,
              authorRole: draft.author_role,
              authorAvatarUrl: draft.author_avatar_url
                ? resolveMediaUrl(draft.author_avatar_url)
                : undefined,
              readTime: draft.read_time
                ? `${draft.read_time} min read`
                : undefined,
              date: draft.published_at
                ? new Date(draft.published_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : undefined,
              heroMediaSrc: draft.hero_media_src
                ? resolveMediaUrl(draft.hero_media_src)
                : undefined,
              heroMediaAlt: draft.hero_media_alt,
              heroMediaType: draft.hero_media_type,
              heroMediaPoster: draft.hero_media_poster
                ? resolveMediaUrl(draft.hero_media_poster)
                : undefined,
              body: draft.body,
            }}
          />
        </div>
      )}
    </div>
  )
}

function SeedCommentRow({
  index,
  total,
  comment,
  onChange,
  onRemove,
  onMove,
}: {
  index: number
  total: number
  comment: AdviceIdeasSeedComment
  onChange: (patch: Partial<AdviceIdeasSeedComment>) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/40">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
          Comment {index + 1}
        </span>
        <div className="flex items-center gap-1">
          <IconButton title="Move up" onClick={() => onMove(-1)} disabled={index === 0}>
            <ArrowUp className="w-3.5 h-3.5" />
          </IconButton>
          <IconButton title="Move down" onClick={() => onMove(1)} disabled={index === total - 1}>
            <ArrowDown className="w-3.5 h-3.5" />
          </IconButton>
          <IconButton title="Remove" onClick={onRemove} danger>
            <Trash2 className="w-3.5 h-3.5" />
          </IconButton>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_100px] gap-3">
        <Field label="Name">
          <input
            type="text"
            value={comment.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Date">
          <input
            type="text"
            value={comment.date}
            onChange={(e) => onChange({ date: e.target.value })}
            className={inputCls}
            placeholder="e.g. 2026-03-15 or 1 week ago"
          />
        </Field>
        <Field label="Likes">
          <input
            type="number"
            min={0}
            value={comment.likes}
            onChange={(e) => onChange({ likes: parseInt(e.target.value || '0', 10) })}
            className={inputCls}
          />
        </Field>
      </div>
      <div className="mt-2">
        <Field label="Body">
          <textarea
            value={comment.body}
            onChange={(e) => onChange({ body: e.target.value })}
            rows={2}
            className={inputCls}
          />
        </Field>
      </div>
    </div>
  )
}

// ---------- Body section editor ----------

function BodySectionRow({
  index,
  total,
  section,
  onPatch,
  onRemove,
  onMove,
  uploadWorkflow,
  submissionId,
}: {
  index: number
  total: number
  section: AdviceIdeasBodySection
  onPatch: (patch: Partial<AdviceIdeasBodySection>) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
  uploadWorkflow: Props['workflow']
  submissionId?: string
}) {
  const [open, setOpen] = useState(index === 0)

  const addBlock = (type: AdviceIdeasBlock['type']) => {
    let newBlock: AdviceIdeasBlock
    switch (type) {
      case 'paragraph': newBlock = { type: 'paragraph', text: '' }; break
      case 'subheading': newBlock = { type: 'subheading', text: '' }; break
      case 'list': newBlock = { type: 'list', items: [''], ordered: false }; break
      case 'quote': newBlock = { type: 'quote', quote: '', attribution: '' }; break
      case 'tip': newBlock = { type: 'tip', title: '', text: '' }; break
      case 'image': newBlock = { type: 'image', src: '', alt: '', caption: '' }; break
      case 'video': newBlock = { type: 'video', src: '', poster: '', alt: '', caption: '' }; break
      case 'gallery': newBlock = { type: 'gallery', items: [{ src: '', alt: '' }] }; break
    }
    onPatch({ blocks: [...section.blocks, newBlock] })
  }
  const updateBlock = (i: number, patch: Partial<AdviceIdeasBlock>) => {
    const next = section.blocks.map((b, bi) =>
      bi === i ? ({ ...b, ...patch } as AdviceIdeasBlock) : b
    )
    onPatch({ blocks: next })
  }
  const removeBlock = (i: number) =>
    onPatch({ blocks: section.blocks.filter((_, bi) => bi !== i) })
  const moveBlock = (i: number, dir: -1 | 1) => {
    const t = i + dir
    if (t < 0 || t >= section.blocks.length) return
    const next = [...section.blocks]
    ;[next[i], next[t]] = [next[t], next[i]]
    onPatch({ blocks: next })
  }

  return (
    <div className="border border-gray-200 rounded-xl bg-gray-50/40">
      <div className="flex items-center gap-2 px-3 py-2">
        <button data-opus-button="control"
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-gray-500 hover:text-gray-900 p-1 rounded-md hover:bg-gray-100 transition-colors"
        >
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Section {index + 1}</p>
          <p className="text-sm font-semibold text-gray-900 truncate">{section.heading || '(untitled)'}</p>
        </div>
        <IconButton title="Move up" onClick={() => onMove(-1)} disabled={index === 0}>
          <ArrowUp className="w-3.5 h-3.5" />
        </IconButton>
        <IconButton title="Move down" onClick={() => onMove(1)} disabled={index === total - 1}>
          <ArrowDown className="w-3.5 h-3.5" />
        </IconButton>
        <IconButton title="Remove" onClick={onRemove} danger>
          <Trash2 className="w-3.5 h-3.5" />
        </IconButton>
      </div>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-3">
            <Field label="Label (optional eyebrow)">
              <input
                type="text"
                value={section.label ?? ''}
                onChange={(e) => onPatch({ label: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Heading">
              <input
                type="text"
                value={section.heading}
                onChange={(e) => onPatch({ heading: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>

          <FieldGroup label={`Content blocks (${section.blocks.length})`}>
            <div className="space-y-3">
              {section.blocks.map((block, bi) => (
                <BlockRow
                  key={bi}
                  index={bi}
                  total={section.blocks.length}
                  block={block}
                  onChange={(patch) => updateBlock(bi, patch)}
                  onRemove={() => removeBlock(bi)}
                  onMove={(dir) => moveBlock(bi, dir)}
                  uploadWorkflow={uploadWorkflow}
                  submissionId={submissionId}
                />
              ))}
              {section.blocks.length === 0 && (
                <p className="text-xs text-gray-400">No blocks — add one below.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {ADVICE_BLOCK_TYPES.map((t) => (
                <button data-opus-button="control"
                  key={t}
                  type="button"
                  onClick={() => addBlock(t)}
                  className="text-xs font-semibold text-[#7E5896] hover:text-[#5c3f72] border border-[#E7D5EE] hover:bg-[#F8F0FB] px-2.5 py-1 rounded-md transition-colors inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> {t}
                </button>
              ))}
            </div>
          </FieldGroup>
        </div>
      )}
    </div>
  )
}

function BlockRow({
  index,
  total,
  block,
  onChange,
  onRemove,
  onMove,
  uploadWorkflow,
  submissionId,
}: {
  index: number
  total: number
  block: AdviceIdeasBlock
  onChange: (patch: Partial<AdviceIdeasBlock>) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
  uploadWorkflow: Props['workflow']
  submissionId?: string
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
          #{index + 1} · {block.type}
        </span>
        <div className="flex items-center gap-1">
          <IconButton title="Move up" onClick={() => onMove(-1)} disabled={index === 0}>
            <ArrowUp className="w-3.5 h-3.5" />
          </IconButton>
          <IconButton title="Move down" onClick={() => onMove(1)} disabled={index === total - 1}>
            <ArrowDown className="w-3.5 h-3.5" />
          </IconButton>
          <IconButton title="Remove" onClick={onRemove} danger>
            <Trash2 className="w-3.5 h-3.5" />
          </IconButton>
        </div>
      </div>

      {block.type === 'paragraph' && (
        <textarea
          value={block.text}
          onChange={(e) => onChange({ text: e.target.value } as Partial<AdviceIdeasBlock>)}
          rows={3}
          className={inputCls}
          placeholder="Paragraph text…"
        />
      )}

      {block.type === 'subheading' && (
        <input
          type="text"
          value={block.text}
          onChange={(e) => onChange({ text: e.target.value } as Partial<AdviceIdeasBlock>)}
          className={inputCls}
          placeholder="Subheading text…"
        />
      )}

      {block.type === 'list' && (
        <ListBlockFields block={block} onChange={onChange} />
      )}

      {block.type === 'quote' && (
        <div className="space-y-2">
          <textarea
            value={block.quote}
            onChange={(e) => onChange({ quote: e.target.value } as Partial<AdviceIdeasBlock>)}
            rows={3}
            className={inputCls}
            placeholder="Quote text…"
          />
          <input
            type="text"
            value={block.attribution ?? ''}
            onChange={(e) => onChange({ attribution: e.target.value } as Partial<AdviceIdeasBlock>)}
            className={inputCls}
            placeholder="Attribution (optional)"
          />
        </div>
      )}

      {block.type === 'tip' && (
        <div className="space-y-2">
          <input
            type="text"
            value={block.title}
            onChange={(e) => onChange({ title: e.target.value } as Partial<AdviceIdeasBlock>)}
            className={inputCls}
            placeholder="Tip title (e.g. Editorial takeaway)"
          />
          <textarea
            value={block.text}
            onChange={(e) => onChange({ text: e.target.value } as Partial<AdviceIdeasBlock>)}
            rows={3}
            className={inputCls}
            placeholder="Tip body…"
          />
        </div>
      )}

      {block.type === 'image' && (
        <MediaBlockFields
          block={block}
          onChange={onChange}
          kind="image"
          uploadWorkflow={uploadWorkflow}
          submissionId={submissionId}
        />
      )}

      {block.type === 'video' && (
        <MediaBlockFields
          block={block}
          onChange={onChange}
          kind="video"
          uploadWorkflow={uploadWorkflow}
          submissionId={submissionId}
        />
      )}

      {block.type === 'gallery' && <GalleryBlockFields block={block} onChange={onChange} />}
    </div>
  )
}

function MediaBlockFields({
  block,
  onChange,
  kind,
  uploadWorkflow,
  submissionId,
}: {
  block: Extract<AdviceIdeasBlock, { type: 'image' | 'video' }>
  onChange: (patch: Partial<AdviceIdeasBlock>) => void
  kind: 'image' | 'video'
  uploadWorkflow: Props['workflow']
  submissionId?: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('slug', 'body')
    if (submissionId) fd.append('submissionId', submissionId)
    setUploadError(null)
    try {
      setUploading(true)
      const { url } = uploadWorkflow === 'contributor-submission'
        ? await uploadContributorMedia(fd)
        : await uploadAdminAdviceMedia(file, 'body')
      onChange({ src: url } as Partial<AdviceIdeasBlock>)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-start">
        <input
          type="text"
          value={block.src}
          onChange={(e) => onChange({ src: e.target.value } as Partial<AdviceIdeasBlock>)}
          className={inputCls}
          placeholder={`${kind} URL`}
        />
        <button data-opus-button="control"
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="text-xs font-medium text-gray-700 px-2.5 py-1.5 rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <input ref={fileRef} type="file" accept={`${kind}/*`} hidden onChange={onUpload} />
      </div>
      {uploadError && (
        <p className="text-xs text-red-600">{uploadError}</p>
      )}
      <input
        type="text"
        value={block.alt}
        onChange={(e) => onChange({ alt: e.target.value } as Partial<AdviceIdeasBlock>)}
        className={inputCls}
        placeholder="Alt text (for accessibility)"
      />
      {kind === 'video' && (
        <input
          type="text"
          value={(block as Extract<AdviceIdeasBlock, { type: 'video' }>).poster ?? ''}
          onChange={(e) => onChange({ poster: e.target.value } as Partial<AdviceIdeasBlock>)}
          className={inputCls}
          placeholder="Poster image URL (optional)"
        />
      )}
      <input
        type="text"
        value={block.caption ?? ''}
        onChange={(e) => onChange({ caption: e.target.value } as Partial<AdviceIdeasBlock>)}
        className={inputCls}
        placeholder="Caption (optional — shown beneath the media)"
      />
      {block.src && (
        <div className="rounded-lg overflow-hidden bg-gray-100 aspect-[16/10]">
          {kind === 'video' ? (
            <video src={resolveMediaUrl(block.src)} className="w-full h-full object-cover" muted />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={resolveMediaUrl(block.src)} alt={block.alt} className="w-full h-full object-cover" />
          )}
        </div>
      )}
    </div>
  )
}

function GalleryBlockFields({
  block,
  onChange,
}: {
  block: Extract<AdviceIdeasBlock, { type: 'gallery' }>
  onChange: (patch: Partial<AdviceIdeasBlock>) => void
}) {
  const update = (i: number, patch: Partial<{ src: string; alt: string }>) =>
    onChange({
      items: block.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)),
    } as Partial<AdviceIdeasBlock>)
  const remove = (i: number) =>
    onChange({ items: block.items.filter((_, idx) => idx !== i) } as Partial<AdviceIdeasBlock>)
  const add = () =>
    onChange({ items: [...block.items, { src: '', alt: '' }] } as Partial<AdviceIdeasBlock>)

  return (
    <div className="space-y-2">
      {block.items.map((item, i) => (
        <div key={i} className="grid grid-cols-1 md:grid-cols-[96px_1fr_1fr_auto] gap-2 items-start">
          <div className="rounded-md bg-gray-100 overflow-hidden aspect-square border border-gray-200">
            {item.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resolveMediaUrl(item.src)} alt={item.alt} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">
                #{i + 1}
              </div>
            )}
          </div>
          <input
            type="text"
            value={item.src}
            onChange={(e) => update(i, { src: e.target.value })}
            className={inputCls}
            placeholder="Image URL"
          />
          <input
            type="text"
            value={item.alt}
            onChange={(e) => update(i, { alt: e.target.value })}
            className={inputCls}
            placeholder="Alt text"
          />
          <button data-opus-button="control"
            type="button"
            onClick={() => remove(i)}
            className="text-gray-500 hover:text-red-600 p-2 rounded-md hover:bg-gray-100"
            title="Remove item"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button data-opus-button="control"
        type="button"
        onClick={add}
        className="flex items-center gap-1 text-xs font-semibold text-[#7E5896] hover:text-[#5c3f72]"
      >
        <Plus className="w-3.5 h-3.5" />
        Add image
      </button>
    </div>
  )
}

function ListBlockFields({
  block,
  onChange,
}: {
  block: Extract<AdviceIdeasBlock, { type: 'list' }>
  onChange: (patch: Partial<AdviceIdeasBlock>) => void
}) {
  const update = (i: number, v: string) =>
    onChange({ items: block.items.map((it, idx) => (idx === i ? v : it)) } as Partial<AdviceIdeasBlock>)
  const remove = (i: number) =>
    onChange({ items: block.items.filter((_, idx) => idx !== i) } as Partial<AdviceIdeasBlock>)
  const add = () => onChange({ items: [...block.items, ''] } as Partial<AdviceIdeasBlock>)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={!!block.ordered}
            onChange={(e) => onChange({ ordered: e.target.checked } as Partial<AdviceIdeasBlock>)}
          />
          Ordered list
        </label>
      </div>
      {block.items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <input
            type="text"
            value={item}
            onChange={(e) => update(i, e.target.value)}
            className={inputCls}
            placeholder={`Item ${i + 1}`}
          />
          <button data-opus-button="control"
            type="button"
            onClick={() => remove(i)}
            className="text-gray-500 hover:text-red-600 p-2 rounded-md hover:bg-gray-100 transition-colors"
            title="Remove item"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button data-opus-button="control"
        type="button"
        onClick={add}
        className="flex items-center gap-1 text-xs font-semibold text-[#7E5896] hover:text-[#5c3f72]"
      >
        <Plus className="w-3.5 h-3.5" />
        Add item
      </button>
    </div>
  )
}

function IconButton({
  children,
  title,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button data-opus-button="danger" data-opus-button-size="medium"
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'p-1.5 rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent',
        danger
          ? 'text-gray-500 hover:text-red-600 hover:bg-red-50'
          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
      )}
    >
      {children}
    </button>
  )
}
