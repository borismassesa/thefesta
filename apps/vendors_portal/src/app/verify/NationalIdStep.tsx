'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import { Camera, Check, Lock, RefreshCw, ScanFace, Smartphone, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import CameraCapture from '@/components/CameraCapture'
import { usePortalT } from '@/components/providers/PortalUIStringsProvider'
import {
  createNationalIdCaptureToken,
  getNationalIdProgressAction,
  uploadNationalIdShot,
} from './actions'

type Kind = 'front' | 'back' | 'selfie'

// Matches storeVerificationShot's server-side cap so the gallery-upload
// fallback rejects oversized files before encoding them into a data URL.
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

// Desktop identity capture: National ID front + back, then a liveness selfie
// (Uber-style). Camera-only (no file upload) on this device, OR scan a QR with
// a phone and capture there. Polls the server so phone uploads light up live.
export default function NationalIdStep({
  initialFront,
  initialBack,
  initialSelfie,
}: {
  initialFront: boolean
  initialBack: boolean
  initialSelfie: boolean
}) {
  const t = usePortalT('verify')
  const router = useRouter()
  const [front, setFront] = useState(initialFront)
  const [back, setBack] = useState(initialBack)
  const [selfie, setSelfie] = useState(initialSelfie)
  const [capturing, setCapturing] = useState<Kind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [qr, setQr] = useState<string | null>(null)
  const [qrError, setQrError] = useState<string | null>(null)

  const idDone = front && back
  const allDone = front && back && selfie

  // Mint a capture token + render it as a QR for the phone handoff. Tokens
  // expire after 15 min, so we re-mint every 12 min while the desktop waits —
  // otherwise a vendor who takes their time hits an unrecoverable "expired"
  // loop. Any failure (incl. a rejected server action) sets a clear message
  // instead of leaving the QR spinner stuck forever.
  useEffect(() => {
    if (allDone) return
    let cancelled = false
    const mint = async () => {
      try {
        const res = await createNationalIdCaptureToken()
        if (cancelled) return
        if (!res.ok) {
          setQrError(res.error)
          return
        }
        // The phone scanning the QR must reach this URL. In production that's
        // the real origin. In dev, `localhost` is the phone itself (and HTTP
        // blocks the camera) — set NEXT_PUBLIC_CAPTURE_BASE_URL to an HTTPS
        // tunnel (e.g. an ngrok URL) so the QR points somewhere reachable.
        const base =
          process.env.NEXT_PUBLIC_CAPTURE_BASE_URL?.trim() ||
          window.location.origin
        const url = `${base.replace(/\/$/, '')}/verify/capture/${res.token}`
        const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 220 })
        if (!cancelled) {
          setQr(dataUrl)
          setQrError(null)
        }
      } catch {
        if (!cancelled) {
          setQrError(t('id_qr_mint_error'))
        }
      }
    }
    void mint()
    const id = setInterval(() => void mint(), 12 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [allDone])

  // Poll for phone uploads until everything is captured.
  useEffect(() => {
    if (allDone) return
    const id = setInterval(() => {
      getNationalIdProgressAction().then((p) => {
        setFront((v) => v || p.front)
        setBack((v) => v || p.back)
        setSelfie((v) => v || p.selfie)
        if (p.front && p.back && p.selfie) router.refresh()
      })
    }, 4000)
    return () => clearInterval(id)
  }, [allDone, router])

  const persistShot = (kind: Kind, dataUrl: string) => {
    startTransition(async () => {
      const res = await uploadNationalIdShot(kind, dataUrl)
      if (!res.ok) {
        setError(res.error)
        return
      }
      if (kind === 'front') setFront(true)
      else if (kind === 'back') setBack(true)
      else setSelfie(true)
      setCapturing(null)
      router.refresh()
    })
  }

  const handleCapture = (kind: Kind) => (dataUrl: string) => {
    setError(null)
    persistShot(kind, dataUrl)
  }

  // Fallback for vendors whose camera is blocked — denied permission, no
  // camera, or an in-app browser (WhatsApp/Instagram) that disables
  // getUserMedia. They pick a photo from their gallery instead; admin review
  // is still the backstop for every National ID. Reuses the same server action
  // as the camera path by reading the file into a data URL.
  const handleFile = (kind: Kind) => (file: File) => {
    setError(null)
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setError(t('id_error_bad_type'))
      return
    }
    if (file.size === 0) {
      setError(t('id_error_empty_file'))
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(t('id_error_too_large'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      if (!dataUrl) {
        setError(t('id_error_read_failed'))
        return
      }
      persistShot(kind, dataUrl)
    }
    reader.onerror = () => setError(t('id_error_read_failed'))
    reader.readAsDataURL(file)
  }

  if (capturing) {
    const isSelfie = capturing === 'selfie'
    return (
      <div className="mt-3">
        <CameraCapture
          label={
            capturing === 'front'
              ? t('id_step_front')
              : capturing === 'back'
                ? t('id_step_back')
                : t('id_step_selfie')
          }
          hint={
            isSelfie
              ? t('id_capture_hint_selfie')
              : t('id_capture_hint_card')
          }
          onCapture={handleCapture(capturing)}
          onCancel={() => setCapturing(null)}
          busy={pending}
          facingMode={isSelfie ? 'user' : 'environment'}
          guide={isSelfie ? 'face' : 'card'}
        />
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-4">
      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
          {error}
        </p>
      )}

      {/* National ID — front / back */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CaptureTile
          icon={Camera}
          label={t('id_step_front')}
          done={front}
          onTake={() => setCapturing('front')}
          onUpload={handleFile('front')}
          disabled={pending}
        />
        <CaptureTile
          icon={Camera}
          label={t('id_step_back')}
          done={back}
          onTake={() => setCapturing('back')}
          onUpload={handleFile('back')}
          disabled={pending}
        />
      </div>

      {/* Liveness selfie — unlocks once both ID sides are captured */}
      <CaptureTile
        icon={ScanFace}
        label={t('id_step_selfie')}
        sublabel={
          selfie
            ? undefined
            : idDone
              ? t('id_selfie_hint_ready')
              : t('id_selfie_hint_locked')
        }
        done={selfie}
        // An already-captured selfie stays shown as captured even if one ID
        // side was sent back for re-upload (it only locks before it exists).
        locked={!idDone && !selfie}
        onTake={() => setCapturing('selfie')}
        onUpload={handleFile('selfie')}
        disabled={pending}
      />

      {/* QR phone handoff */}
      {!allDone && (
        <div className="flex items-start gap-4 rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
          <div className="shrink-0">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qr}
                alt={t('id_qr_alt')}
                className="h-28 w-28 rounded-lg bg-white p-1"
              />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-400">
                <Smartphone className="h-6 w-6" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
              <Smartphone className="h-4 w-4 text-gray-500" />
              {t('id_qr_heading')}
            </p>
            <p className="mt-1 text-sm text-gray-600">
              {t('id_qr_description')}
            </p>
            {qrError && <p className="mt-1 text-xs text-amber-700">{qrError}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

function CaptureTile({
  icon: Icon,
  label,
  sublabel,
  done,
  locked = false,
  onTake,
  onUpload,
  disabled,
}: {
  icon: typeof Camera
  label: string
  sublabel?: string
  done: boolean
  locked?: boolean
  onTake: () => void
  onUpload?: (file: File) => void
  disabled: boolean
}) {
  const t = usePortalT('verify')
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-xl border p-3.5',
        done
          ? 'border-emerald-200 bg-emerald-50/60'
          : locked
            ? 'border-gray-200 bg-gray-50/60'
            : 'border-gray-200 bg-white',
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={cn(
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            done
              ? 'bg-emerald-500 text-white'
              : locked
                ? 'bg-gray-100 text-gray-400'
                : 'bg-gray-100 text-gray-500',
          )}
        >
          {done ? (
            <Check className="h-4 w-4" strokeWidth={3} />
          ) : locked ? (
            <Lock className="h-4 w-4" />
          ) : (
            <Icon className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{label}</p>
          <p className="text-xs text-gray-500">
            {sublabel ?? (done ? t('id_tile_captured') : t('id_tile_not_captured'))}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <button data-opus-button="neutral" data-opus-button-size="small"
          type="button"
          onClick={onTake}
          disabled={disabled || locked}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            done
              ? 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              : 'bg-[#1A1A1A] text-white hover:bg-black',
          )}
        >
          {done ? (
            <>
              <RefreshCw className="h-3.5 w-3.5" />
              {t('id_step_retake')}
            </>
          ) : (
            <>
              <Camera className="h-3.5 w-3.5" />
              {t('id_step_capture')}
            </>
          )}
        </button>
        {/* Gallery-upload fallback for when the camera is unavailable (denied
            permission, no camera, or an in-app browser that blocks it). */}
        {onUpload && !locked && (
          <label
            className={cn(
              'inline-flex shrink-0 cursor-pointer items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-800',
              disabled && 'pointer-events-none opacity-50',
            )}
          >
            <Upload className="h-3 w-3" />
            {done ? t('id_tile_replace_by_upload') : t('id_tile_upload_instead')}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={disabled}
              onChange={(e) => {
                const file = e.target.files?.[0]
                // Reset the value so picking the same file again still fires.
                e.target.value = ''
                if (file) onUpload(file)
              }}
            />
          </label>
        )}
      </div>
    </div>
  )
}
