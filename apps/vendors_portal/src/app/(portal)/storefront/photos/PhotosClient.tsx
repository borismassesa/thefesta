'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Camera,
  ChevronsUpDown,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  UploadCloud,
  Video as VideoIcon,
  X,
} from 'lucide-react'
import { FieldLabel, TextInput } from '@/components/onboard/FormField'
import { getStorefrontSections } from '@/lib/storefront/completion'
import { useVendorVertical } from '@/lib/onboarding/vertical-context'
import { useOnboardingDraft } from '@/lib/onboarding/draft'
import { cn } from '@/lib/utils'
import {
  createStorefrontVideoUploadUrl,
  loadStorefrontPhotos,
  savePhotos,
  uploadStorefrontPhoto,
  type StorefrontPhotos,
} from '../sections/actions'
import { compressImage } from '@/lib/compress-image'
import { usePortalT, type Translator } from '@/components/providers/PortalUIStringsProvider'

type Photo = {
  id: string
  url: string
  caption: string
}

// Cover slots are positional — index drives orientation (3 landscape + 1
// portrait) and the per-slot pro-tip copy. `null` means the slot is empty.
type CoverSlot = { id: string; url: string } | null

const COVER_SLOT_COUNT = 4
type CoverOrientation = 'landscape' | 'portrait'
const COVER_ORIENTATIONS: CoverOrientation[] = ['landscape', 'landscape', 'landscape', 'portrait']

type VideoReel = {
  id: string
  // 'upload' = file blob URL the browser plays inline; 'embed' = YouTube/Vimeo
  // link that we render via a static thumbnail until the vendor opens it.
  kind: 'upload' | 'embed'
  url: string
  title: string
  thumbnailUrl?: string
}

// All four cover slots start empty so vendors hit the "Required" state and
// can see what the upload affordance looks like by default.
const EMPTY_COVERS: CoverSlot[] = Array(COVER_SLOT_COUNT).fill(null)

const MIN_PORTFOLIO = 6

function newId() {
  return `p_${Math.random().toString(36).slice(2, 9)}`
}

// Derive the persisted shape from editor state. Cover slot 0 is the
// cover_image; the remaining cover slots + every portfolio photo go into
// gallery_urls. Only http(s) URLs survive (blob: previews from in-flight
// uploads are dropped). Shared by the autosave effect and the manual Save.
function buildPhotosPayload(
  covers: CoverSlot[],
  photos: Photo[],
  videos: VideoReel[],
): StorefrontPhotos {
  const coverUrls = covers
    .filter((c): c is { id: string; url: string } => !!c)
    .map((c) => c.url)
  const portfolioUrls = photos.map((p) => p.url)
  const videoUrls = videos.map((v) => v.url).filter((u) => /^https?:\/\//i.test(u))
  return {
    coverImage: coverUrls[0] ?? null,
    galleryUrls: Array.from(new Set([...coverUrls.slice(1), ...portfolioUrls])),
    videoUrls,
  }
}

export default function PhotosClient() {
  const router = useRouter()
  const t = usePortalT('storefront-photos-team')
  const { draft, update, hydrated } = useOnboardingDraft()
  const photoInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const coverBulkInputRef = useRef<HTMLInputElement>(null)

  const [covers, setCovers] = useState<CoverSlot[]>(EMPTY_COVERS)
  // Vendors start with a clean grid — we previously seeded SAMPLE_PHOTOS so
  // the editor wasn't visually empty in the mock, but real vendors should
  // never see fake stock photography.
  const [photos, setPhotos] = useState<Photo[]>([])
  const [videos, setVideos] = useState<VideoReel[]>([])
  // Rehydrate from the database once on mount so a vendor who returns to
  // this page sees the gallery they previously saved. Without this, the
  // page reads empty on every reload and the vendor has to re-upload.
  const [hydratedFromDb, setHydratedFromDb] = useState(false)
  // Signature of the gallery state last persisted to the DB. Seeded from the
  // hydrated DB state so the autosave effect doesn't immediately re-write what
  // it just loaded; updated on every successful save (auto or manual).
  const lastPersistedRef = useRef<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await loadStorefrontPhotos()
      if (cancelled) return
      if (res.ok) {
        const { coverImage, galleryUrls, videoUrls } = res.data
        // Split the persisted gallery back into cover slots + portfolio.
        // We stored slot 0 in cover_image and slots 1..3 plus every
        // portfolio photo in gallery_urls (see onSave below). Assume the
        // first three gallery entries were the remaining cover slots,
        // which matches how onSave concatenates them.
        const remainingCovers = galleryUrls.slice(0, COVER_SLOT_COUNT - 1)
        const portfolioFromDb = galleryUrls.slice(COVER_SLOT_COUNT - 1)
        const restoredCovers: CoverSlot[] = Array(COVER_SLOT_COUNT).fill(null)
        if (coverImage) restoredCovers[0] = { id: newId(), url: coverImage }
        remainingCovers.forEach((url, i) => {
          restoredCovers[i + 1] = { id: newId(), url }
        })
        const restoredPhotos: Photo[] = portfolioFromDb.map((url) => ({
          id: newId(),
          url,
          caption: '',
        }))
        const restoredVideos: VideoReel[] = videoUrls.map((url) => ({
          id: newId(),
          kind: isEmbedUrl(url) ? 'embed' : 'upload',
          url,
          title: '',
        }))
        setCovers(restoredCovers)
        setPhotos(restoredPhotos)
        setVideos(restoredVideos)
        lastPersistedRef.current = JSON.stringify(
          buildPhotosPayload(restoredCovers, restoredPhotos, restoredVideos),
        )
      }
      setHydratedFromDb(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])
  const [editingCaptionId, setEditingCaptionId] = useState<string | null>(null)
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [videoTitle, setVideoTitle] = useState('')
  const [photoDragOver, setPhotoDragOver] = useState(false)
  const [videoDragOver, setVideoDragOver] = useState(false)
  const [coverDragOverIdx, setCoverDragOverIdx] = useState<number | null>(null)

  // Object URLs created from File uploads — revoked on unmount to avoid leaks.
  const objectUrlsRef = useRef<string[]>([])
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  // Mirror counts to the draft so the storefront sidebar can mark this section
  // complete. Only sync after hydration to avoid clobbering with the initial
  // empty default before persisted state loads.
  const filledCovers = covers.filter(Boolean).length
  useEffect(() => {
    // Wait for *both* the localStorage draft hydration and the DB read so
    // we don't clobber persisted counts with the empty initial state.
    if (!hydrated || !hydratedFromDb) return
    if (
      draft.photoCount !== photos.length ||
      draft.videoCount !== videos.length ||
      draft.coverPhotoCount !== filledCovers
    ) {
      update({
        photoCount: photos.length,
        videoCount: videos.length,
        coverPhotoCount: filledCovers,
      })
    }
  }, [
    hydrated,
    hydratedFromDb,
    photos.length,
    videos.length,
    filledCovers,
    draft.photoCount,
    draft.videoCount,
    draft.coverPhotoCount,
    update,
  ])

  const portfolio = photos
  const portfolioRemaining = Math.max(0, MIN_PORTFOLIO - photos.length)

  const vertical = useVendorVertical()
  const nextHref = useMemo(() => {
    const sections = getStorefrontSections(draft, vertical)
    const idx = sections.findIndex((s) => s.id === 'photos')
    return idx >= 0 && idx < sections.length - 1 ? sections[idx + 1].href : null
  }, [draft, vertical])

  // Track in-flight uploads so the user gets a visible loading state and
  // can't double-pick the same slot.
  const [uploadingCovers, setUploadingCovers] = useState<Set<number>>(new Set())
  const [portfolioUploads, setPortfolioUploads] = useState(0)
  const [videoUploads, setVideoUploads] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Persist cover + portfolio URLs to the DB. Cover photo is the first
  // populated cover slot; the rest of the cover slots are appended to
  // gallery_urls so admins + couples see every uploaded image.
  const [saving, startSaving] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)

  // Auto-persist the gallery whenever it changes after hydration, so a vendor
  // who uploads photos/videos and then navigates away WITHOUT clicking "Save
  // photos" doesn't lose them (the original report: uploads landed in storage
  // but the vendor row stayed null). Waits for in-flight uploads to finish so
  // a half-uploaded set is never persisted, debounces bursts, and skips writes
  // that match what's already saved.
  useEffect(() => {
    if (!hydratedFromDb) return
    if (portfolioUploads > 0 || videoUploads > 0 || uploadingCovers.size > 0) return
    const payload = buildPhotosPayload(covers, photos, videos)
    const sig = JSON.stringify(payload)
    if (sig === lastPersistedRef.current) return
    const handle = setTimeout(() => {
      lastPersistedRef.current = sig
      void savePhotos(payload).then((res) => {
        if (!res.ok) {
          setSaveError(res.error)
          lastPersistedRef.current = null // allow a retry on the next change
        } else {
          setSaveOk(true)
        }
      })
    }, 1000)
    return () => clearTimeout(handle)
  }, [
    covers,
    photos,
    videos,
    hydratedFromDb,
    portfolioUploads,
    videoUploads,
    uploadingCovers,
  ])

  if (!hydrated) {
    return <div className="p-8" aria-hidden />
  }

  // Uploads a single file. Returns either a URL (success) or an error
  // message (failure). NEVER throws — a thrown server-action rejection
  // would orphan the loop's progress counter and strand the UI on
  // "Uploading…" indefinitely.
  const uploadFile = async (
    file: File,
    kind: 'cover' | 'gallery',
  ): Promise<{ url: string } | { error: string }> => {
    if (!file.type.startsWith('image/')) {
      return { error: t('error_only_images') }
    }
    // Compress before checking size — we routinely cut 6–12 MB phone
    // photos down to <2 MB, which keeps everything under the
    // server-action body limit even with multipart-encoding overhead.
    let toUpload = file
    try {
      toUpload = await compressImage(file)
    } catch {
      // Compression is best-effort; fall back to the original file. Only
      // common cause is a corrupt image, which the server will reject
      // cleanly anyway.
    }
    if (toUpload.size > 10 * 1024 * 1024) {
      return {
        error: t('error_file_too_large', { filename: file.name }),
      }
    }
    try {
      const fd = new FormData()
      fd.append('file', toUpload)
      fd.append('kind', kind)
      const res = await uploadStorefrontPhoto(fd)
      if (!res.ok) return { error: t('error_file_message', { filename: file.name, message: res.error }) }
      return { url: res.url }
    } catch (err) {
      // Server-action rejections (e.g. body-size guard, network drop) land
      // here. Surface a useful message instead of leaving the spinner.
      const message = err instanceof Error ? err.message : t('error_upload_failed_generic')
      return { error: t('error_file_message', { filename: file.name, message }) }
    }
  }

  // Concurrency-limited batch upload. 13 photos in series at 5 s each is a
  // 65-second hang; 3-at-a-time keeps per-request work small while letting
  // the network do real parallel work.
  const UPLOAD_CONCURRENCY = 3

  const addPhotoFiles = async (files: FileList | File[]) => {
    setUploadError(null)
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (list.length === 0) return
    setPortfolioUploads((n) => n + list.length)

    let queueIndex = 0
    // Sparse arrays parallel to `list`, populated by index — so "first
    // error" and "uploaded photos" stay in user-selected order regardless
    // of which worker finishes first.
    const errors: Array<string | null> = new Array(list.length).fill(null)
    const results: Array<Photo | null> = new Array(list.length).fill(null)

    const worker = async () => {
      while (true) {
        const idx = queueIndex++
        if (idx >= list.length) return
        const file = list[idx]
        const outcome = await uploadFile(file, 'gallery')
        if ('url' in outcome) {
          results[idx] = {
            id: newId(),
            url: outcome.url,
            caption: file.name.replace(/\.[^.]+$/, ''),
          }
        } else {
          errors[idx] = outcome.error
        }
        // Decrement per file so the spinner reflects real progress.
        setPortfolioUploads((n) => n - 1)
      }
    }

    const workers = Array.from(
      { length: Math.min(UPLOAD_CONCURRENCY, list.length) },
      worker,
    )
    await Promise.all(workers)

    const successes = results.filter((p): p is Photo => p !== null)
    if (successes.length > 0) {
      setPhotos((prev) => [...prev, ...successes])
    }
    const errorMessages = errors.filter((e): e is string => e !== null)
    if (errorMessages.length > 0) {
      setUploadError(
        errorMessages.length === 1
          ? errorMessages[0]
          : t('portfolio_partial_fail', {
              success: successes.length,
              total: list.length,
              failed: errorMessages.length,
              firstError: errorMessages[0],
              more: errorMessages.length > 1 ? t('more_errors_suffix') : '',
            }),
      )
    }
  }

  // Cover slot operations — uploads target a specific index, replacing whatever
  // was there. We upload the file to the storage bucket immediately so the
  // URL we hold is a real CDN URL that survives reload + admin review.
  const setCoverFromFile = async (idx: number, file: File) => {
    if (!file.type.startsWith('image/')) return
    setUploadError(null)
    setUploadingCovers((s) => new Set(s).add(idx))
    const outcome = await uploadFile(file, 'cover')
    setUploadingCovers((s) => {
      const next = new Set(s)
      next.delete(idx)
      return next
    })
    if ('error' in outcome) {
      setUploadError(outcome.error)
      return
    }
    setCovers((prev) => {
      const next = prev.slice()
      next[idx] = { id: newId(), url: outcome.url }
      return next
    })
  }

  // Bulk cover upload — drag a stack of files at once, they fill the empty
  // cover slots in order. Anything left over after the 4 slots are full
  // overflows into the portfolio so no upload is wasted.
  const addCoverFilesBulk = async (files: FileList | File[]) => {
    setUploadError(null)
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (list.length === 0) return

    // Snapshot the empty slot indices at call time so concurrent uploads
    // don't fight over the same slot. Filling left-to-right matches the
    // landscape/portrait orientation hints below each slot.
    const emptyIndices: number[] = []
    covers.forEach((slot, i) => {
      if (!slot) emptyIndices.push(i)
    })

    const coverAssignments = list
      .slice(0, emptyIndices.length)
      .map((file, i) => ({ file, idx: emptyIndices[i] }))
    const overflowFiles = list.slice(emptyIndices.length)

    if (coverAssignments.length > 0) {
      setUploadingCovers((s) => {
        const next = new Set(s)
        for (const { idx } of coverAssignments) next.add(idx)
        return next
      })
      // Upload covers in parallel — keeps the UX snappy when filling all
      // 4 slots from one drop. Each result lands in its assigned slot.
      const errors: string[] = []
      await Promise.all(
        coverAssignments.map(async ({ file, idx }) => {
          const outcome = await uploadFile(file, 'cover')
          setUploadingCovers((s) => {
            const next = new Set(s)
            next.delete(idx)
            return next
          })
          if ('error' in outcome) {
            errors.push(outcome.error)
            return
          }
          setCovers((prev) => {
            const next = prev.slice()
            next[idx] = { id: newId(), url: outcome.url }
            return next
          })
        }),
      )
      if (errors.length > 0) {
        setUploadError(
          errors.length === 1
            ? errors[0]
            : t('cover_partial_fail', {
                success: coverAssignments.length - errors.length,
                total: coverAssignments.length,
                firstError: errors[0],
                more: errors.length > 1 ? t('more_errors_suffix') : '',
              }),
        )
      }
    }

    // Spillover goes to the portfolio so the vendor doesn't have to re-pick
    // the leftover files.
    if (overflowFiles.length > 0) {
      await addPhotoFiles(overflowFiles)
    }
  }

  const handleCoverBulkInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void addCoverFilesBulk(e.target.files)
    e.target.value = ''
  }

  const handleCoverBulkDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    setCoverDragOverIdx(null)
    if (e.dataTransfer.files) void addCoverFilesBulk(e.dataTransfer.files)
  }

  const clearCover = (idx: number) => {
    setCovers((prev) => {
      const before = prev[idx]
      if (before) URL.revokeObjectURL(before.url)
      const next = prev.slice()
      next[idx] = null
      return next
    })
  }

  const moveCover = (idx: number, dir: -1 | 1) => {
    setCovers((prev) => {
      const swap = idx + dir
      if (swap < 0 || swap >= prev.length) return prev
      const next = prev.slice()
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  // Uploads land in Supabase Storage via a signed PUT URL — server actions
  // top out around 1 MB request bodies, but a typical 30-90s wedding reel
  // is 30-100 MB. The signed URL bypasses the Next.js function entirely.
  const addVideoFiles = async (files: FileList | File[]) => {
    setUploadError(null)
    const list = Array.from(files).filter((f) => f.type.startsWith('video/'))
    if (list.length === 0) return

    // Optimistic placeholders so the vendor sees progress per file.
    const placeholders: VideoReel[] = list.map((file) => {
      const previewUrl = URL.createObjectURL(file)
      objectUrlsRef.current.push(previewUrl)
      return {
        id: newId(),
        kind: 'upload' as const,
        url: previewUrl,
        title: file.name.replace(/\.[^.]+$/, ''),
      }
    })
    setVideos((prev) => [...prev, ...placeholders])
    setVideoUploads((n) => n + list.length)

    // Upload sequentially. Wedding reels are large; running them concurrently
    // saturates the vendor's upstream and tanks throughput more than it
    // parallelizes. One at a time keeps the UI responsive and predictable.
    const errors: string[] = []
    for (let i = 0; i < list.length; i++) {
      const file = list[i]
      const placeholder = placeholders[i]
      const minted = await createStorefrontVideoUploadUrl({
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      })
      if (!minted.ok) {
        errors.push(t('error_file_message', { filename: file.name, message: minted.error }))
        setVideos((prev) => prev.filter((v) => v.id !== placeholder.id))
        setVideoUploads((n) => n - 1)
        continue
      }
      try {
        const put = await fetch(minted.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type, 'x-upsert': 'false' },
          body: file,
        })
        if (!put.ok) {
          const body = await put.text().catch(() => '')
          errors.push(
            t('error_storage_rejected', {
              filename: file.name,
              status: put.status,
              body: body ? `: ${body.slice(0, 120)}` : '',
            }),
          )
          setVideos((prev) => prev.filter((v) => v.id !== placeholder.id))
        } else {
          // Swap the blob URL for the durable public URL.
          setVideos((prev) =>
            prev.map((v) =>
              v.id === placeholder.id
                ? { ...v, url: minted.publicUrl, kind: 'upload' as const }
                : v,
            ),
          )
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : t('error_upload_failed_generic')
        errors.push(t('error_file_message', { filename: file.name, message }))
        setVideos((prev) => prev.filter((v) => v.id !== placeholder.id))
      } finally {
        setVideoUploads((n) => n - 1)
      }
    }
    if (errors.length > 0) {
      setUploadError(
        errors.length === 1
          ? errors[0]
          : t(errors.length === 1 ? 'video_partial_fail_singular' : 'video_partial_fail_plural', {
              count: errors.length,
              firstError: errors[0],
              more: errors.length > 1 ? t('more_errors_suffix') : '',
            }),
      )
    }
  }

  const handlePhotoInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addPhotoFiles(e.target.files)
    e.target.value = ''
  }

  const handleVideoInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void addVideoFiles(e.target.files)
    e.target.value = ''
  }

  const handlePhotoDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    setPhotoDragOver(false)
    if (e.dataTransfer.files) addPhotoFiles(e.dataTransfer.files)
  }

  const handleVideoDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    setVideoDragOver(false)
    if (e.dataTransfer.files) void addVideoFiles(e.dataTransfer.files)
  }

  const removePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id))
  }

  const updateCaption = (id: string, caption: string) => {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, caption } : p)))
  }

  const movePhoto = (id: string, dir: -1 | 1) => {
    setPhotos((prev) => {
      const idx = prev.findIndex((p) => p.id === id)
      if (idx < 0) return prev
      const swap = idx + dir
      if (swap < 0 || swap >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  const addVideoUrl = () => {
    const url = videoUrl.trim()
    if (!url) return
    const title = videoTitle.trim() || extractVideoTitle(url, t)
    setVideos((prev) => [
      ...prev,
      {
        id: `v_${Math.random().toString(36).slice(2, 9)}`,
        kind: 'embed',
        url,
        title,
        thumbnailUrl:
          'https://images.unsplash.com/photo-1519741497674-611481863552?w=800&h=450&fit=crop',
      },
    ])
    setVideoUrl('')
    setVideoTitle('')
  }

  const removeVideo = (id: string) => setVideos((prev) => prev.filter((v) => v.id !== id))

  const updateVideoTitle = (id: string, title: string) => {
    setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, title } : v)))
  }

  const moveVideo = (id: string, dir: -1 | 1) => {
    setVideos((prev) => {
      const idx = prev.findIndex((v) => v.id === id)
      if (idx < 0) return prev
      const swap = idx + dir
      if (swap < 0 || swap >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  const onNext = () => {
    if (nextHref) router.push(nextHref)
  }

  const onSave = () => {
    setSaveError(null)
    setSaveOk(false)
    const payload = buildPhotosPayload(covers, photos, videos)
    startSaving(async () => {
      const res = await savePhotos(payload)
      if (!res.ok) {
        setSaveError(res.error)
        return
      }
      // Keep the autosave signature in sync so it doesn't immediately re-fire.
      lastPersistedRef.current = JSON.stringify(payload)
      setSaveOk(true)
    })
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 px-6 lg:px-10 pt-4 lg:pt-5 pb-6">
        <div className="grid grid-cols-1 gap-6">
          {/* 1. Cover photos — 4 fixed slots that drive listing card carousels */}
          <Section
            title={t('cover_title')}
            hint={t('cover_hint', { count: COVER_SLOT_COUNT })}
            right={
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-gray-700 tabular-nums">
                  {filledCovers} / {COVER_SLOT_COUNT}
                </span>
                {filledCovers < COVER_SLOT_COUNT && (
                  <button data-opus-button="primary" data-opus-button-size="small"
                    type="button"
                    onClick={() => coverBulkInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    {t('cover_upload_button')}
                  </button>
                )}
              </div>
            }
          >
            <input
              ref={coverBulkInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleCoverBulkInput}
              className="hidden"
            />

            {/* Rules callout */}
            <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 mb-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                {t('cover_rules_header')}
              </p>
              <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside leading-relaxed">
                <li>{t('cover_rule_1')}</li>
                <li>{t('cover_rule_2')}</li>
                <li>{t('cover_rule_3')}</li>
                <li>{t('cover_rule_4')}</li>
                <li>{t('cover_rule_5')}</li>
              </ul>
            </div>

            <div
              className={cn(
                'rounded-xl border bg-white transition-colors',
                coverDragOverIdx === -1
                  ? 'border-gray-900 ring-2 ring-gray-900/30'
                  : 'border-gray-100',
              )}
              onDragOver={(e) => {
                // Only treat as a bulk drop if no specific slot is hovered.
                if (coverDragOverIdx === null) {
                  e.preventDefault()
                  setCoverDragOverIdx(-1)
                }
              }}
              onDragLeave={() => {
                if (coverDragOverIdx === -1) setCoverDragOverIdx(null)
              }}
              onDrop={(e) => {
                if (coverDragOverIdx === -1) handleCoverBulkDrop(e)
              }}
            >
              <p className="text-[11px] font-medium text-gray-500 px-4 py-3 border-b border-gray-100">
                {t('cover_display_hint')}
              </p>
              <ul className="divide-y divide-gray-100">
                {covers.map((slot, idx) => (
                  <li key={idx} className="flex items-center gap-4 p-4">
                    <CoverReorder
                      idx={idx}
                      total={COVER_SLOT_COUNT}
                      onUp={() => moveCover(idx, -1)}
                      onDown={() => moveCover(idx, 1)}
                    />
                    <CoverSlotView
                      slot={slot}
                      orientation={COVER_ORIENTATIONS[idx]}
                      dragOver={coverDragOverIdx === idx}
                      onPickFile={(file) => setCoverFromFile(idx, file)}
                      onDragOver={() => setCoverDragOverIdx(idx)}
                      onDragLeave={() => setCoverDragOverIdx(null)}
                      onClear={() => clearCover(idx)}
                    />
                    <p className="text-xs text-gray-700 leading-relaxed flex-1 min-w-0">
                      {t('cover_pro_tip_prefix')}{' '}
                      <span className="text-gray-900 font-semibold">
                        {t('cover_pro_tip_text', {
                          orientation: t(COVER_ORIENTATIONS[idx] === 'landscape' ? 'orientation_landscape' : 'orientation_portrait'),
                        })}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </Section>

          {/* 2. Portfolio grid */}
          <Section
            title={t('portfolio_title')}
            hint={t('portfolio_hint', { min: MIN_PORTFOLIO })}
            right={
              <button data-opus-button="primary" data-opus-button-size="small"
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                {t('portfolio_upload_button')}
              </button>
            }
          >
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoInput}
              className="hidden"
            />

            {/* Photo quality rules — mirrors the Cover photos callout. */}
            <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 mb-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                {t('portfolio_rules_header')}
              </p>
              <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside leading-relaxed">
                <li>{t('portfolio_rule_1')}</li>
                <li>{t('portfolio_rule_2')}</li>
                <li>{t('portfolio_rule_3')}</li>
                <li>{t('portfolio_rule_4')}</li>
                <li>{t('portfolio_rule_5')}</li>
              </ul>
            </div>

            {portfolioRemaining > 0 ? (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5">
                <span className="text-xs text-amber-900">
                  <span className="font-semibold">
                    {t(portfolioRemaining === 1 ? 'portfolio_remaining_singular' : 'portfolio_remaining_plural', { remaining: portfolioRemaining })}
                  </span>{' '}
                  {t('portfolio_remaining_suffix', { min: MIN_PORTFOLIO })}
                </span>
              </div>
            ) : null}

            <div
              className={cn(
                'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 rounded-xl transition-colors',
                photoDragOver && 'bg-gray-50 ring-2 ring-gray-900 ring-offset-4 ring-offset-white',
              )}
              onDragOver={(e) => {
                e.preventDefault()
                setPhotoDragOver(true)
              }}
              onDragLeave={() => setPhotoDragOver(false)}
              onDrop={handlePhotoDrop}
            >
              {portfolio.map((photo, i) => (
                <PhotoTile
                  key={photo.id}
                  photo={photo}
                  index={i}
                  total={portfolio.length}
                  editing={editingCaptionId === photo.id}
                  onDelete={() => removePhoto(photo.id)}
                  onMoveUp={() => movePhoto(photo.id, -1)}
                  onMoveDown={() => movePhoto(photo.id, 1)}
                  onEditCaption={() => setEditingCaptionId(photo.id)}
                  onSaveCaption={(c) => {
                    updateCaption(photo.id, c)
                    setEditingCaptionId(null)
                  }}
                  onCancelCaption={() => setEditingCaptionId(null)}
                />
              ))}
              <AddTile
                onClick={() => photoInputRef.current?.click()}
                icon={<ImageIcon className="w-5 h-5" />}
                label={t('add_photo_label')}
              />
            </div>
          </Section>

          {/* 3. Video reels */}
          <Section
            title={t('video_title')}
            hint={t('video_hint')}
            right={
              <button data-opus-button="primary" data-opus-button-size="small"
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                {t('video_upload_button')}
              </button>
            }
          >
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              multiple
              onChange={handleVideoInput}
              className="hidden"
            />

            {/* Video quality rules — mirrors the Photos / Cover callouts. */}
            <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 mb-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                {t('video_rules_header')}
              </p>
              <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside leading-relaxed">
                <li>{t('video_rule_1')}</li>
                <li>{t('video_rule_2')}</li>
                <li>{t('video_rule_3')}</li>
                <li>{t('video_rule_4')}</li>
                <li>{t('video_rule_5')}</li>
              </ul>
            </div>

            <div
              className={cn(
                'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 rounded-xl transition-colors mb-6',
                videoDragOver && 'bg-gray-50 ring-2 ring-gray-900 ring-offset-4 ring-offset-white',
              )}
              onDragOver={(e) => {
                e.preventDefault()
                setVideoDragOver(true)
              }}
              onDragLeave={() => setVideoDragOver(false)}
              onDrop={handleVideoDrop}
            >
              {videos.map((v, i) => (
                <VideoTile
                  key={v.id}
                  video={v}
                  index={i}
                  total={videos.length}
                  editing={editingVideoId === v.id}
                  onDelete={() => removeVideo(v.id)}
                  onMoveUp={() => moveVideo(v.id, -1)}
                  onMoveDown={() => moveVideo(v.id, 1)}
                  onEditTitle={() => setEditingVideoId(v.id)}
                  onSaveTitle={(title) => {
                    updateVideoTitle(v.id, title)
                    setEditingVideoId(null)
                  }}
                  onCancelTitle={() => setEditingVideoId(null)}
                />
              ))}
              <AddTile
                onClick={() => videoInputRef.current?.click()}
                aspect="aspect-video"
                icon={<VideoIcon className="w-5 h-5" />}
                label={t('add_video_label')}
              />
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                {t('video_link_header')}
              </p>
              <div className="grid sm:grid-cols-[1fr_220px_auto] gap-3 items-end">
                <div>
                  <FieldLabel>{t('field_video_url_label')}</FieldLabel>
                  <TextInput
                    type="url"
                    placeholder={t('field_video_url_placeholder')}
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel>{t('field_video_title_label')}</FieldLabel>
                  <TextInput
                    placeholder={t('field_video_title_placeholder')}
                    value={videoTitle}
                    onChange={(e) => setVideoTitle(e.target.value)}
                  />
                </div>
                <button data-opus-button="primary" data-opus-button-size="medium"
                  type="button"
                  onClick={addVideoUrl}
                  disabled={!videoUrl.trim()}
                  className="inline-flex items-center justify-center gap-1.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
                >
                  {t('add_reel_button')}
                </button>
              </div>
            </div>
          </Section>
        </div>
      </div>

      {/* Inline save banner — sits above the sticky bar so an error or
          confirmation is impossible to miss after clicking Save. The thin
          text inside the bar is fine for in-progress upload chatter, but
          a save failure or success deserves a more visible affordance. */}
      {(saveError || saveOk) && (
        <div className="px-6 lg:px-10">
          <div
            className={cn(
              'rounded-lg border px-3 py-2 mb-2 text-xs',
              saveError
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800',
            )}
            role={saveError ? 'alert' : 'status'}
          >
            {saveError
              ? `${t('save_error_prefix')} ${saveError}`
              : t('save_success_photos_videos')}
          </div>
        </div>
      )}

      {/* Sticky bottom bar — Save + Next */}
      <div className="sticky bottom-0 border-t border-gray-100 bg-white/95 backdrop-blur z-30">
        <div className="px-6 lg:px-10 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="text-xs text-gray-500">
            <span className="font-semibold text-gray-900 tabular-nums">{photos.length}</span>{' '}
            {photos.length === 1 ? t('footer_photo_singular') : t('footer_photo_plural')} ·{' '}
            <span className="font-semibold text-gray-900 tabular-nums">{videos.length}</span>{' '}
            {videos.length === 1 ? t('footer_video_singular') : t('footer_video_plural')}
            {portfolioUploads > 0 && (
              <span className="ml-3 inline-flex items-center gap-1 text-amber-700">
                <Loader2 className="w-3 h-3 animate-spin" />{' '}
                {t(portfolioUploads === 1 ? 'uploading_photos_singular' : 'uploading_photos_plural', { count: portfolioUploads })}
              </span>
            )}
            {videoUploads > 0 && (
              <span className="ml-3 inline-flex items-center gap-1 text-amber-700">
                <Loader2 className="w-3 h-3 animate-spin" />{' '}
                {t(videoUploads === 1 ? 'uploading_videos_singular' : 'uploading_videos_plural', { count: videoUploads })}
              </span>
            )}
            {uploadError && (
              <span className="ml-3 text-rose-700">{uploadError}</span>
            )}
            {saveError && <span className="ml-3 text-rose-700">{saveError}</span>}
            {saveOk && !saveError && (
              <span className="ml-3 text-emerald-700">{t('saved_label')}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button data-opus-button="neutral" data-opus-button-size="medium"
              type="button"
              onClick={onSave}
              disabled={
                saving ||
                portfolioUploads > 0 ||
                videoUploads > 0 ||
                uploadingCovers.size > 0
              }
              className="inline-flex items-center gap-2 bg-white border border-gray-300 text-gray-900 text-sm font-semibold px-4 py-2 rounded-full hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? t('saving_label') : t('save_photos_button')}
            </button>
            <button data-opus-button="primary" data-opus-button-size="medium"
              type="button"
              onClick={onNext}
              className="inline-flex items-center gap-2 bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-gray-800 transition-colors"
            >
              {t('next_button')}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  hint,
  right,
  children,
}: {
  title: string
  hint?: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-6 lg:p-7">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900 tracking-tight">{title}</h2>
          {hint ? <p className="text-xs text-gray-500 mt-0.5">{hint}</p> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      {children}
    </section>
  )
}

function PhotoTile({
  photo,
  index,
  total,
  editing,
  onDelete,
  onMoveUp,
  onMoveDown,
  onEditCaption,
  onSaveCaption,
  onCancelCaption,
}: {
  photo: Photo
  index: number
  total: number
  editing: boolean
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onEditCaption: () => void
  onSaveCaption: (caption: string) => void
  onCancelCaption: () => void
}) {
  const t = usePortalT('storefront-photos-team')
  const [draftCaption, setDraftCaption] = useState(photo.caption)

  useEffect(() => {
    if (editing) setDraftCaption(photo.caption)
  }, [editing, photo.caption])

  return (
    <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 group">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt={photo.caption} className="w-full h-full object-cover" />

      {/* Caption pill (bottom) */}
      {!editing && photo.caption ? (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-3 pt-6 pb-2">
          <p className="text-[11px] text-white font-medium line-clamp-1 drop-shadow-sm">
            {photo.caption}
          </p>
        </div>
      ) : null}

      {/* Hover overlay actions */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 flex flex-col">
        <div className="flex items-start justify-between gap-1 p-2">
          <div className="flex flex-col gap-1">
            <IconButton
              label={t('move_up_aria')}
              disabled={index === 0}
              onClick={onMoveUp}
              icon={<ArrowUp className="w-3.5 h-3.5" />}
            />
            <IconButton
              label={t('move_down_aria')}
              disabled={index === total - 1}
              onClick={onMoveDown}
              icon={<ArrowDown className="w-3.5 h-3.5" />}
            />
          </div>
          <div className="flex flex-col gap-1">
            <IconButton
              label={t('edit_caption_aria')}
              onClick={onEditCaption}
              icon={<Pencil className="w-3.5 h-3.5" />}
            />
            <IconButton
              label={t('delete_aria')}
              onClick={onDelete}
              icon={<Trash2 className="w-3.5 h-3.5" />}
              tone="danger"
            />
          </div>
        </div>
      </div>

      {/* Caption editor (replaces overlay when active) */}
      {editing ? (
        <div className="absolute inset-x-2 bottom-2 bg-white rounded-lg shadow-lg p-2 flex items-center gap-1.5">
          <input
            autoFocus
            value={draftCaption}
            onChange={(e) => setDraftCaption(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveCaption(draftCaption)
              if (e.key === 'Escape') onCancelCaption()
            }}
            placeholder={t('caption_placeholder')}
            className="flex-1 min-w-0 text-xs bg-transparent text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
          <button data-opus-button="control"
            type="button"
            onClick={() => onSaveCaption(draftCaption)}
            className="text-[10px] font-bold uppercase tracking-wider text-gray-900 hover:text-gray-700"
          >
            {t('save_button')}
          </button>
          <button data-opus-button="control"
            type="button"
            onClick={onCancelCaption}
            className="text-gray-400 hover:text-gray-700"
            aria-label={t('cancel_aria')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  )
}

function IconButton({
  label,
  icon,
  onClick,
  disabled,
  tone = 'default',
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  tone?: 'default' | 'danger'
}) {
  return (
    <button data-opus-button="danger" data-opus-button-size="small"
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'w-7 h-7 rounded-md flex items-center justify-center transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed',
        tone === 'danger'
          ? 'bg-white/95 text-rose-600 hover:bg-rose-50'
          : 'bg-white/95 text-gray-900 hover:bg-white',
      )}
    >
      {icon}
    </button>
  )
}

function VideoTile({
  video,
  index,
  total,
  editing,
  onDelete,
  onMoveUp,
  onMoveDown,
  onEditTitle,
  onSaveTitle,
  onCancelTitle,
}: {
  video: VideoReel
  index: number
  total: number
  editing: boolean
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onEditTitle: () => void
  onSaveTitle: (title: string) => void
  onCancelTitle: () => void
}) {
  const t = usePortalT('storefront-photos-team')
  const [draftTitle, setDraftTitle] = useState(video.title)

  useEffect(() => {
    if (editing) setDraftTitle(video.title)
  }, [editing, video.title])

  return (
    <div className="relative aspect-video rounded-xl overflow-hidden bg-gray-900 group">
      {video.kind === 'upload' ? (
        <video
          src={video.url}
          className="w-full h-full object-cover bg-black"
          // preload="metadata" loads enough for the browser to show the first
          // frame as a poster without auto-playing.
          preload="metadata"
          controls
          playsInline
        />
      ) : (
        <>
          {video.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={video.thumbnailUrl}
              alt={video.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gray-200" />
          )}
          <a
            href={video.url}
            target="_blank"
            rel="noreferrer"
            className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
            aria-label={t('open_video_aria', { title: video.title })}
          >
            <span className="w-12 h-12 rounded-full bg-white/95 text-gray-900 flex items-center justify-center shadow">
              <VideoIcon className="w-5 h-5" />
            </span>
          </a>
        </>
      )}

      {/* Title pill (bottom) */}
      {!editing ? (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pt-8 pb-2 pointer-events-none">
          <p className="text-xs text-white font-semibold line-clamp-1 drop-shadow-sm">
            {video.title}
          </p>
        </div>
      ) : null}

      {/* Hover overlay actions */}
      <div className="absolute inset-x-0 top-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-start justify-between gap-1 pointer-events-none">
        <div className="flex flex-col gap-1 pointer-events-auto">
          <IconButton
            label={t('move_up_aria')}
            disabled={index === 0}
            onClick={onMoveUp}
            icon={<ArrowUp className="w-3.5 h-3.5" />}
          />
          <IconButton
            label={t('move_down_aria')}
            disabled={index === total - 1}
            onClick={onMoveDown}
            icon={<ArrowDown className="w-3.5 h-3.5" />}
          />
        </div>
        <div className="flex flex-col gap-1 pointer-events-auto">
          <IconButton
            label={t('edit_title_aria')}
            onClick={onEditTitle}
            icon={<Pencil className="w-3.5 h-3.5" />}
          />
          <IconButton
            label={t('delete_aria')}
            onClick={onDelete}
            icon={<Trash2 className="w-3.5 h-3.5" />}
            tone="danger"
          />
        </div>
      </div>

      {/* Title editor */}
      {editing ? (
        <div className="absolute inset-x-2 bottom-2 bg-white rounded-lg shadow-lg p-2 flex items-center gap-1.5 z-10">
          <input
            autoFocus
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveTitle(draftTitle)
              if (e.key === 'Escape') onCancelTitle()
            }}
            placeholder={t('title_placeholder')}
            className="flex-1 min-w-0 text-xs bg-transparent text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
          <button data-opus-button="control"
            type="button"
            onClick={() => onSaveTitle(draftTitle)}
            className="text-[10px] font-bold uppercase tracking-wider text-gray-900 hover:text-gray-700"
          >
            {t('save_button')}
          </button>
          <button data-opus-button="control"
            type="button"
            onClick={onCancelTitle}
            className="text-gray-400 hover:text-gray-700"
            aria-label={t('cancel_aria')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  )
}

function AddTile({
  onClick,
  icon,
  label,
  aspect = 'aspect-square',
}: {
  onClick: () => void
  icon: React.ReactNode
  label: string
  aspect?: string
}) {
  return (
    <button data-opus-button="control"
      type="button"
      onClick={onClick}
      className={cn(
        aspect,
        'rounded-xl border-2 border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50 bg-gray-50/50 flex flex-col items-center justify-center gap-2 transition-colors text-gray-500 hover:text-gray-700',
      )}
    >
      {icon}
      <span className="text-xs font-semibold">{label}</span>
    </button>
  )
}

function CoverReorder({
  idx,
  total,
  onUp,
  onDown,
}: {
  idx: number
  total: number
  onUp: () => void
  onDown: () => void
}) {
  const t = usePortalT('storefront-photos-team')
  return (
    <div className="flex flex-col items-center text-gray-400 shrink-0">
      <button data-opus-button="control"
        type="button"
        onClick={onUp}
        disabled={idx === 0}
        aria-label={t('move_up_aria')}
        className="p-0.5 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ArrowUp className="w-3.5 h-3.5" />
      </button>
      <ChevronsUpDown className="w-3.5 h-3.5 text-gray-300" aria-hidden />
      <button data-opus-button="control"
        type="button"
        onClick={onDown}
        disabled={idx === total - 1}
        aria-label={t('move_down_aria')}
        className="p-0.5 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ArrowDown className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function CoverSlotView({
  slot,
  orientation,
  dragOver,
  onPickFile,
  onDragOver,
  onDragLeave,
  onClear,
}: {
  slot: { id: string; url: string } | null
  orientation: CoverOrientation
  dragOver: boolean
  onPickFile: (file: File) => void
  onDragOver: () => void
  onDragLeave: () => void
  onClear: () => void
}) {
  const t = usePortalT('storefront-photos-team')
  const inputRef = useRef<HTMLInputElement>(null)
  const aspectClass = orientation === 'landscape' ? 'aspect-[16/9] w-44' : 'aspect-[3/4] w-28'

  return (
    <div
      className={cn(
        'relative shrink-0 rounded-xl overflow-hidden transition-colors',
        aspectClass,
        slot
          ? 'border border-gray-200 bg-gray-100'
          : 'border-2 border-dashed border-gray-300 bg-gray-50/40 hover:border-gray-400 hover:bg-gray-50',
        dragOver && 'border-solid border-gray-900 ring-2 ring-gray-900 ring-offset-2 bg-gray-50',
      )}
      onDragOver={(e) => {
        e.preventDefault()
        onDragOver()
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault()
        onDragLeave()
        const file = e.dataTransfer.files?.[0]
        if (file) onPickFile(file)
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPickFile(file)
          e.target.value = ''
        }}
      />

      {slot ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slot.url} alt={t('cover_photo_alt')} className="w-full h-full object-cover" />
          <button data-opus-button="control"
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute inset-0 bg-black/45 text-white flex flex-col items-center justify-center gap-0.5 opacity-0 hover:opacity-100 transition-opacity"
            aria-label={t('replace_label')}
          >
            <UploadCloud className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-wider">{t('replace_label')}</span>
          </button>
          <button data-opus-button="control"
            type="button"
            onClick={onClear}
            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/95 text-gray-700 hover:text-rose-600 flex items-center justify-center shadow-sm"
            aria-label={t('remove_cover_aria')}
            title={t('remove_title_attr')}
          >
            <X className="w-3 h-3" />
          </button>
        </>
      ) : (
        <button data-opus-button="control"
          type="button"
          onClick={() => inputRef.current?.click()}
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors"
          aria-label={t('upload_cover_aria')}
        >
          <span className="relative">
            <Camera className="w-6 h-6" />
            <Plus className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
            {t('required_badge')}
          </span>
        </button>
      )}
    </div>
  )
}

// A persisted video URL is treated as an embed if it points at a known
// video host (YouTube/Vimeo). Otherwise we assume it's an upload from our
// Supabase Storage bucket and render it with a native <video> tag.
function isEmbedUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (
      u.hostname.includes('youtube.com') ||
      u.hostname.includes('youtu.be') ||
      u.hostname.includes('vimeo.com')
    )
  } catch {
    return false
  }
}

// Best-effort title extraction so a paste-only workflow still produces a label.
function extractVideoTitle(url: string, t: Translator): string {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      return t('fallback_youtube_title')
    }
    if (u.hostname.includes('vimeo.com')) return t('fallback_vimeo_title')
    return u.hostname
  } catch {
    return t('fallback_video_title')
  }
}
