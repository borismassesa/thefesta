'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Check, RefreshCw, X } from 'lucide-react'

// Live camera capture for a single photo (e.g. front of a National ID). Opens
// the device camera via getUserMedia, lets the user snap a still, preview it,
// and either retake or confirm. No file picker — capture only. The captured
// frame is downscaled and returned as a JPEG data URL via `onCapture`.
//
// getUserMedia requires a secure context (HTTPS or localhost). When the camera
// is unavailable or blocked, we surface a clear message and the `onUnavailable`
// hook so the caller can steer the user to the QR-to-phone option.

const MAX_WIDTH = 1600

export default function CameraCapture({
  label,
  hint,
  onCapture,
  onCancel,
  busy = false,
  facingMode = 'environment',
  guide = 'card',
}: {
  label: string
  hint?: string
  onCapture: (dataUrl: string) => void
  onCancel?: () => void
  busy?: boolean
  facingMode?: 'environment' | 'user'
  /** Framing overlay: a card rectangle (IDs) or a face oval (selfie). */
  guide?: 'card' | 'face'
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setPreview(null)
    setReady(false)
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError(
        'This device or browser can’t open the camera. Use the “Scan with phone” option instead.',
      )
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play().catch(() => {})
      }
      setReady(true)
    } catch {
      setError(
        'Camera access was blocked. Allow the camera in your browser, or use the “Scan with phone” option.',
      )
    }
  }, [facingMode])

  useEffect(() => {
    // Defer to a microtask so the initial state resets inside start() don't
    // run synchronously during the effect (avoids cascading-render warnings).
    const t = setTimeout(() => {
      void start()
    }, 0)
    return () => {
      clearTimeout(t)
      stop()
    }
  }, [start, stop])

  const shoot = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const scale = Math.min(1, MAX_WIDTH / video.videoWidth)
    const w = Math.round(video.videoWidth * scale)
    const h = Math.round(video.videoHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, w, h)
    setPreview(canvas.toDataURL('image/jpeg', 0.85))
    stop()
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">{label}</p>
          {hint && <p className="text-xs text-gray-500">{hint}</p>}
        </div>
        {onCancel && (
          <button data-opus-button="control"
            type="button"
            onClick={() => {
              stop()
              onCancel()
            }}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-xl bg-black">
          {/* Preview takes over once a shot is taken */}
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt={`${label} preview`}
              className="block max-h-[60vh] w-full object-contain"
            />
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                className="block max-h-[60vh] w-full object-contain"
              />
              {/* Framing guide — card rectangle or face oval */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <div
                  className={
                    guide === 'face'
                      ? 'h-[80%] w-[62%] rounded-[50%] border-2 border-dashed border-white/80'
                      : 'h-[58%] w-[86%] rounded-xl border-2 border-dashed border-white/80'
                  }
                />
              </div>
            </>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-center gap-2">
        {preview ? (
          <>
            <button data-opus-button="neutral" data-opus-button-size="medium"
              type="button"
              onClick={start}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              Retake
            </button>
            <button data-opus-button="primary" data-opus-button-size="medium"
              type="button"
              onClick={() => preview && onCapture(preview)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#1A1A1A] px-5 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-60"
            >
              <Check className="h-4 w-4" />
              {busy ? 'Saving…' : 'Use this photo'}
            </button>
          </>
        ) : !error ? (
          <button data-opus-button="primary" data-opus-button-size="medium"
            type="button"
            onClick={shoot}
            disabled={!ready || busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#1A1A1A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Camera className="h-4 w-4" />
            {ready ? 'Take photo' : 'Starting camera…'}
          </button>
        ) : (
          <button data-opus-button="neutral" data-opus-button-size="medium"
            type="button"
            onClick={start}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Try the camera again
          </button>
        )}
      </div>
    </div>
  )
}
