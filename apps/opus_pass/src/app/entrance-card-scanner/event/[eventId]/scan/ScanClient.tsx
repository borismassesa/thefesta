'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import jsQR from 'jsqr'
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CircleCheck,
  CloudOff,
  DoorOpen,
  Loader2,
  PenLine,
  QrCode,
  User,
  Users,
  UtensilsCrossed,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { CountSegments } from '@/components/scanner/CountSegments'
import { PartySizeSheet } from '@/components/scanner/PartySizeSheet'
import { ScanTipsBanner, ScanTipsModal } from '@/components/scanner/ScanTipsModal'
import { ScannerLocaleToggle } from '@/components/scanner/ScannerLocaleToggle'
import { SessionGate } from '@/components/scanner/SessionGate'
import { amendPartySize, submitScan, validateScannerSession } from '@/lib/scanner/api/checkin'
import { getErrorMessage } from '@/lib/scanner/errors'
import type { ScannerStringKey } from '@/lib/scanner/i18n'
import { vibrateForResult } from '@/lib/scanner/haptics'
import { shouldPromptForParty } from '@/lib/scanner/partyPrompt'
import { arrivedHeads } from '@/lib/scanner/roster'
import { useScannerSession } from '@/hooks/useScannerSession'
import { useScannerT } from '@/hooks/useScannerT'
import { useScannerTips } from '@/hooks/useScannerTips'
import type { CheckinScanResult } from '@/types/scanner-checkin'

/** Ignore repeat decodes of the same code for this long — a QR held in frame
 *  fires continuously, and without this every guest triggers a burst of
 *  identical requests that all resolve as "duplicate". */
const RESCAN_COOLDOWN_MS = 2500

/** Side of the square scan target the corner brackets frame. */
const RETICLE_SIZE = 256

/** Decode cadence. Native CameraView scans every frame; jsQR on a
 *  downscaled frame is fast enough that ~7 looks a second feels the same. */
const DECODE_INTERVAL_MS = 140

const RESULT_STYLES: Record<
  CheckinScanResult['status'],
  { bg: string; icon: LucideIcon; titleKey: ScannerStringKey }
> = {
  success: { bg: '#1B7F4C', icon: CircleCheck, titleKey: 'checked_in_title' },
  duplicate: { bg: '#B4751A', icon: AlertCircle, titleKey: 'already_scanned' },
  invalid: { bg: '#B3261E', icon: XCircle, titleKey: 'not_valid' },
  error: { bg: '#5A5A5A', icon: CloudOff, titleKey: 'couldnt_check_in' },
}

export default function ScanClient({ eventId }: { eventId: string }) {
  const router = useRouter()
  const { session } = useScannerSession()
  const tips = useScannerTips()
  const queryClient = useQueryClient()
  const t = useScannerT()

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [cameraState, setCameraState] = useState<'starting' | 'live' | 'denied' | 'error'>('starting')
  const [result, setResult] = useState<CheckinScanResult | null>(null)
  const [pending, setPending] = useState(false)
  /** Party-size prompt, shown only when the guest RSVP'd for more than one.
   *  Identified by QR token after a camera scan, or by invitation id after a
   *  typed-code admission — the amend endpoint accepts either. */
  const [partyPrompt, setPartyPrompt] = useState<{
    qrToken?: string
    invitationId?: string
    guestName: string
    partySize: number
    groupTag: string | null
  } | null>(null)
  // Refs, not state: the decode loop fires many times a second and must read
  // the latest value without re-subscribing or re-rendering.
  const lastScanRef = useRef<{ token: string; at: number; requestId: string } | null>(null)
  /** The scan whose party size has already been asked about, so one scan asks
   *  once however many times the result re-renders. */
  const promptedForScanRef = useRef<string | null>(null)
  const busyRef = useRef(false)
  /** Outcome of the last attempt, so the decode loop can tell a retry of a
   *  failed scan from a deliberate second admission. */
  const lastResultRef = useRef<CheckinScanResult['status'] | null>(null)

  const sessionReady = session !== null && session.eventId === eventId

  /**
   * Arrival progress for the header. Shares a cache key with the guest-list
   * screen, so moving between the two doesn't refetch, and one invalidation
   * after a scan updates both.
   */
  const rosterQuery = useQuery({
    queryKey: ['scanner', 'roster', eventId],
    enabled: sessionReady,
    queryFn: async () => {
      const validated = await validateScannerSession(session!.eventId, session!.accessToken)
      if (!validated.ok) throw new Error(validated.error)
      return validated.roster
    },
  })

  const roster = rosterQuery.data ?? []
  const totalGuests = roster.length
  const arrivedGuests = roster.filter((g) => g.checkedInAt).length
  const headsIn = arrivedHeads(roster)

  // ── Camera ──────────────────────────────────────────────────────────────

  const startCamera = useCallback(() => {
    setCameraState('starting')
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      .then((stream) => {
        // A newer start (or unmount) already owns the camera — don't let a
        // late answer from an abandoned call replace it.
        if (streamRef.current) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          video.play().catch(() => {})
        }
        setCameraState('live')
      })
      .catch((err) => {
        setCameraState(err instanceof DOMException && err.name === 'NotAllowedError' ? 'denied' : 'error')
      })
  }, [])

  useEffect(() => {
    if (!sessionReady) return
    startCamera()
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [sessionReady, startCamera])

  // ── Scan submission ─────────────────────────────────────────────────────

  const runScan = useCallback(
    async (args: { qrToken: string; checkedInPartySize?: number; requestId: string }) => {
      if (!session) return
      busyRef.current = true
      setPending(true)
      try {
        const scanResult = await submitScan({
          eventId: session.eventId,
          accessToken: session.accessToken,
          qrToken: args.qrToken,
          checkedInPartySize: args.checkedInPartySize,
          requestId: args.requestId,
          doorLabel: session.doorLabel,
          attendantName: session.attendantName ?? undefined,
        })
        setResult(scanResult)
        lastResultRef.current = scanResult.status
        if (scanResult.status === 'success') {
          // Keep the header count honest without blocking the next scan.
          void queryClient.invalidateQueries({ queryKey: ['scanner', 'roster', eventId] })
          // A successful scan is proof the coaching worked: retire the tips
          // banner on its own rather than leaving it to fight the reticle
          // for attention all night.
          if (tips.bannerVisible) tips.dismissBanner()
        }
        // Haptics matter here: attendants work in the dark, often not looking
        // at the screen between guests.
        vibrateForResult(scanResult.status)
      } catch (err) {
        setResult({ status: 'error', message: getErrorMessage(err, 'Network error') })
        // The request may still have landed. Marking the attempt as failed is
        // what lets the next scan of this pass reuse its id and be replayed
        // rather than admitting the party twice.
        lastResultRef.current = 'error'
        vibrateForResult('error')
      } finally {
        setPending(false)
        busyRef.current = false
      }
    },
    [session, queryClient, eventId, tips],
  )

  /**
   * Correct the headcount after the pass is already scanned in.
   *
   * Uses the amend endpoint rather than re-scanning: a re-scan admits MORE of
   * the party (or reports the pass exhausted) and can never lower a headcount.
   * Only the amend path is allowed to reduce it, and only with a reason.
   */
  const correctPartySize = useCallback(
    async (target: { qrToken?: string; invitationId?: string }, arrived: number) => {
      // Always leave the party sheet first — a hung amend must never pin the
      // attendant on a dialog they cannot dismiss.
      setPartyPrompt(null)
      if (!session) return
      setPending(true)
      try {
        const amended = await amendPartySize({
          eventId: session.eventId,
          accessToken: session.accessToken,
          qrToken: target.qrToken,
          invitationId: target.invitationId,
          checkedInPartySize: arrived,
          reason: 'Attendant confirmed how many of the party actually arrived',
          requestId: crypto.randomUUID(),
          doorLabel: session.doorLabel,
        })
        setResult(amended)
        lastResultRef.current = amended.status
      } catch (err) {
        setResult({ status: 'error', message: getErrorMessage(err, 'Network error') })
        // Same reasoning as runScan, and it matters more here: the amend may
        // well have landed and freed headroom. Without this, the next re-scan
        // of the pass mints a fresh id and re-admits the heads this correction
        // just released — silently undoing it, and reporting success.
        lastResultRef.current = 'error'
        // The headcount question has to come back with it. The line above
        // points the retry rule at the ORIGINAL scan's request id, so
        // re-scanning this pass replays the original success: the party size
        // from BEFORE the correction. Left set, that replay counts as a scan
        // already asked about, the sheet stays shut, and the correction the
        // attendant just made vanishes with nothing on screen to say so.
        promptedForScanRef.current = null
      } finally {
        setPending(false)
      }
    },
    [session],
  )

  // ── Decode loop ─────────────────────────────────────────────────────────

  /** Anything covering the camera also has to stop it decoding: the feed keeps
   *  running behind a sheet, and a code drifting through frame while the
   *  attendant is reading a result would fire a scan they never asked for. */
  const cameraBlocked = Boolean(result || partyPrompt || tips.showTips)
  const cameraBlockedRef = useRef(cameraBlocked)
  cameraBlockedRef.current = cameraBlocked

  useEffect(() => {
    if (cameraState !== 'live') return
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    const handleDecoded = (data: string) => {
      if (!data || busyRef.current || cameraBlockedRef.current) return

      const now = Date.now()
      const last = lastScanRef.current
      if (last && last.token === data && now - last.at < RESCAN_COOLDOWN_MS) return

      // Reuse the previous attempt's id when re-scanning the same pass after
      // an ERROR. That attempt may well have admitted the party before the
      // response was lost, and admission is a counter now: a fresh id would
      // let a family of four walk in twice on one pass. Any other re-scan is a
      // deliberate new admission (the rest of the party arriving) and gets a
      // new id.
      const retrying = last?.token === data && lastResultRef.current === 'error'
      const requestId = retrying && last ? last.requestId : crypto.randomUUID()
      lastScanRef.current = { token: data, at: now, requestId }

      // We can't know the party size until the server resolves the token, so
      // scan first and let the result drive whether we need to ask.
      void runScan({ qrToken: data, requestId })
    }

    const timer = window.setInterval(() => {
      const video = videoRef.current
      if (!video || video.readyState < 2 || video.videoWidth === 0) return
      if (busyRef.current || cameraBlockedRef.current) return

      // Decode at a capped width: full 1080p frames make jsQR the bottleneck,
      // and a QR at arm's length survives the downscale easily.
      const scale = Math.min(1, 640 / video.videoWidth)
      canvas.width = Math.round(video.videoWidth * scale)
      canvas.height = Math.round(video.videoHeight * scale)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      try {
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' })
        if (code?.data) handleDecoded(code.data)
      } catch {
        // A partial frame during camera warmup — ignore this tick.
      }
    }, DECODE_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [cameraState, runScan])

  // Once a successful scan comes back for a multi-person party, offer the
  // correction step rather than assuming everyone arrived together.
  //
  // Keyed on the scan, never on whether the sheet is open. Answering the
  // question closes the sheet without changing the result that prompted it,
  // so a rule phrased as "success, party > 1, and no sheet showing" is true
  // again the moment the sheet closes: the sheet reopened on every Done and
  // every close, and a Double could not be admitted by scan at all.
  useEffect(() => {
    const scan = lastScanRef.current
    if (
      !shouldPromptForParty({
        status: result?.status ?? null,
        partySize: result?.partySize ?? null,
        scanRequestId: scan?.requestId ?? null,
        promptedRequestId: promptedForScanRef.current,
      })
    ) {
      return
    }
    promptedForScanRef.current = scan!.requestId
    setPartyPrompt({
      qrToken: scan!.token,
      guestName: result?.guestName ?? 'Guest',
      partySize: result?.partySize ?? 1,
      groupTag: result?.groupTag ?? null,
    })
  }, [result])

  const dismiss = () => {
    setResult(null)
    setPartyPrompt(null)
  }

  const resultStyle = result ? RESULT_STYLES[result.status] : null

  return (
    <SessionGate eventId={eventId}>
      {(gateSession) => (
        <main className="relative h-dvh w-full overflow-hidden bg-black">
          {/* Live camera feed. Never unmounted while this screen is up — a
              sheet over it must not tear the camera down. */}
          <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" />

          {cameraState !== 'live' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white px-10 text-center">
              {cameraState === 'starting' ? (
                <Loader2 className="h-6 w-6 animate-spin text-[#8e57b3]" />
              ) : (
                <>
                  <Camera size={32} className="text-[#1A1A1A]/40" />
                  <p className="mt-3 text-sm text-[#1A1A1A]/60">
                    {cameraState === 'denied' ? t('camera_blocked') : t('camera_needed')}
                  </p>
                  <button
                    type="button"
                    onClick={startCamera}
                    className="mt-5 rounded-full bg-[#1A1A1A] px-6 py-3 text-xs font-bold tracking-[1px] text-white uppercase"
                  >
                    {t('allow_camera')}
                  </button>
                </>
              )}
            </div>
          ) : null}

          {/* Header. A scrim, not per-button pills: white text over a live
              camera feed is unreadable the moment someone walks past in a
              light shirt, and a gradient keeps it legible without boxing in
              every element. */}
          <div className="pointer-events-none absolute top-0 right-0 left-0 bg-linear-to-b from-black/80 via-black/45 to-transparent">
            <div className="pointer-events-auto px-4 pt-[max(env(safe-area-inset-top),0.5rem)] pb-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label={t('go_back')}
                  onClick={() => router.push('/entrance-card-scanner')}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/16 text-white transition-colors hover:bg-white/25"
                >
                  <ArrowLeft size={20} />
                </button>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-center text-sm font-bold text-white">
                    {gateSession.eventName ?? t('check_in')}
                  </p>
                  {/* Icon-led facts rather than a dot-joined string, matching
                      the shift card on the entry screen. */}
                  <div className="mt-1 flex items-center justify-center gap-3">
                    <span className="flex items-center gap-1">
                      <DoorOpen size={12} className="text-white/65" />
                      <span className="max-w-32 truncate text-[11px] text-white/65">{gateSession.doorLabel}</span>
                    </span>
                    {gateSession.attendantName ? (
                      <span className="flex items-center gap-1">
                        <User size={11} className="text-white/65" />
                        <span className="max-w-32 truncate text-[11px] text-white/65">{gateSession.attendantName}</span>
                      </span>
                    ) : null}
                  </div>
                </div>

                <ScannerLocaleToggle className="shrink-0" />

                <button
                  type="button"
                  aria-label={t('open_guest_list')}
                  onClick={() => router.push(`/entrance-card-scanner/event/${eventId}/guests`)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/16 text-white transition-colors hover:bg-white/25"
                >
                  {/* Not a magnifier: over a camera that reads as zoom. */}
                  <Users size={20} />
                </button>
              </div>

              {/* The state of the door in three numbers. Every one is a way
                  in to the matching list, so the counts an attendant is asked
                  for all night double as the navigation to answer follow-ups. */}
              {totalGuests > 0 ? (
                <div className="-mt-1 px-0 pb-2">
                  <CountSegments
                    tone="camera"
                    segments={[
                      {
                        key: 'pending',
                        icon: 'time',
                        label: t('still_to_arrive'),
                        caption: t('caption_waiting'),
                        count: totalGuests - arrivedGuests,
                      },
                      {
                        key: 'arrived',
                        icon: 'check',
                        label: t('filter_in_full'),
                        caption: t('caption_in'),
                        count: arrivedGuests,
                      },
                      {
                        key: 'all',
                        icon: 'people',
                        label: t('on_the_list'),
                        caption: t('caption_invited'),
                        count: totalGuests,
                      },
                    ]}
                    onSelect={(key) => {
                      if (key === 'arrived') router.push(`/entrance-card-scanner/event/${eventId}/arrivals`)
                      else router.push(`/entrance-card-scanner/event/${eventId}/guests?filter=${key}`)
                    }}
                  />
                  {/* Headcount only once there is one: at zero it's a third
                      row of chrome saying nothing the bar doesn't. */}
                  {headsIn > 0 ? (
                    <p className="mt-1.5 text-center text-[11px] text-white/65">
                      {t('through_the_door', {
                        n: headsIn,
                        people: headsIn === 1 ? t('person') : t('people'),
                      })}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {tips.ready && tips.bannerVisible ? (
                <div className="pt-1 pb-2">
                  <ScanTipsBanner onOpen={tips.openTips} onDismiss={tips.dismissBanner} />
                </div>
              ) : null}
            </div>
          </div>

          {/* Reticle. Dimming everything outside it both aims the attendant
              at the right spot and stops a busy venue background reading as
              part of the UI. */}
          {!cameraBlocked && cameraState === 'live' ? (
            <>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="relative" style={{ width: RETICLE_SIZE, height: RETICLE_SIZE }}>
                  {/* Corner brackets rather than a full box: they frame the
                      target without drawing a hard edge across the ticket. */}
                  <span className="absolute top-0 left-0 h-11 w-11 rounded-tl-[20px] border-t-[3px] border-l-[3px] border-white" />
                  <span className="absolute top-0 right-0 h-11 w-11 rounded-tr-[20px] border-t-[3px] border-r-[3px] border-white" />
                  <span className="absolute bottom-0 left-0 h-11 w-11 rounded-bl-[20px] border-b-[3px] border-l-[3px] border-white" />
                  <span className="absolute right-0 bottom-0 h-11 w-11 rounded-br-[20px] border-b-[3px] border-r-[3px] border-white" />
                </div>
                <p className="mt-7 text-sm text-white/85">{t('point_at_qr')}</p>
              </div>

              {/* Manual fallback, always visible rather than hidden behind
                  the header icon: a QR that won't scan is exactly when the
                  attendant is under pressure and shouldn't hunt for it. */}
              <div className="absolute right-0 bottom-0 left-0 bg-linear-to-t from-black/85 to-transparent">
                <div className="px-5 pt-10 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
                  <button
                    type="button"
                    onClick={() => router.push(`/entrance-card-scanner/event/${eventId}/manual`)}
                    className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-white/16 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/25"
                  >
                    <PenLine size={17} />
                    {t('qr_not_working')}
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {pending ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="h-9 w-9 animate-spin text-white" />
            </div>
          ) : null}

          {/* Party-size correction — portaled sheet; closing always reveals
              the result overlay below so a Double never dead-ends the door. */}
          <PartySizeSheet
            visible={Boolean(partyPrompt)}
            guestName={partyPrompt?.guestName ?? ''}
            partySize={partyPrompt?.partySize ?? 1}
            groupTag={partyPrompt?.groupTag}
            busy={pending}
            // Closing without a number keeps the full party the scan already
            // recorded, which is the common case — a family walking in together.
            onCancel={() => setPartyPrompt(null)}
            onSubmit={(arrived) => {
              if (!partyPrompt) return
              // An unchanged count is already what the server stored; sending
              // it back would be a round trip that changes nothing, so drop
              // straight to the result overlay instead.
              if (arrived === partyPrompt.partySize) setPartyPrompt(null)
              else void correctPartySize({ qrToken: partyPrompt.qrToken, invitationId: partyPrompt.invitationId }, arrived)
            }}
          />

          {/* Scan result — a full-screen colour the whole door can read from
              metres away, up until the attendant moves to the next guest. */}
          {result && resultStyle && !partyPrompt ? (
            <div
              role="alert"
              onClick={dismiss}
              className="absolute inset-0 z-40 flex flex-col items-center justify-center px-8"
              style={{ backgroundColor: resultStyle.bg }}
            >
              <resultStyle.icon size={72} color="#FFFFFF" />
              <p className="mt-4 text-center text-3xl font-bold text-white">{t(resultStyle.titleKey)}</p>
              {result.guestName ? (
                <p className="mt-2 text-center text-xl font-bold text-white">{result.guestName}</p>
              ) : null}
              {result.isVip ? (
                <span className="mt-3 rounded-full bg-white/25 px-3 py-1 text-[11px] font-bold tracking-[1px] text-white uppercase">
                  {result.groupTag || t('vip')}
                </span>
              ) : null}
              {/* Where this guest sits — so the attendant can point them
                  straight to their table on arrival. */}
              {result.table ? (
                <span className="mt-3 flex items-center gap-1.5 rounded-full bg-white/25 px-3.5 py-1.5">
                  <UtensilsCrossed size={14} color="#FFFFFF" />
                  <span className="text-sm font-bold text-white">{result.table}</span>
                </span>
              ) : null}
              {result.status === 'success' &&
              result.checkedInPartySize &&
              result.partySize != null ? (
                <p className="mt-3 text-center text-base text-white/90">
                  {t('admitted_of', {
                    a: result.checkedInPartySize,
                    b: result.partySize,
                  })}
                </p>
              ) : null}
              {result.message ? <p className="mt-3 text-center text-sm text-white/90">{result.message}</p> : null}

              {/* An explicit control, not just tap-anywhere: at a busy door
                  the attendant needs an obvious, thumb-sized target to move
                  to the next guest. */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  dismiss()
                }}
                className="mt-9 flex h-14 w-full max-w-80 items-center justify-center gap-2 rounded-full bg-white"
              >
                <QrCode size={17} color={resultStyle.bg} />
                <span className="text-sm font-bold tracking-[1px] uppercase" style={{ color: resultStyle.bg }}>
                  {t('scan_next_guest')}
                </span>
              </button>

              {/* The manual path stays reachable without going back to the
                  camera first — a guest whose pass just failed is still
                  standing there. */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  dismiss()
                  router.push(`/entrance-card-scanner/event/${eventId}/manual?mode=name`)
                }}
                className="mt-3 flex items-center gap-1.5 py-2 text-sm font-medium text-white/85"
              >
                <Users size={15} />
                {t('find_guest_by_name')}
              </button>
            </div>
          ) : null}

          <ScanTipsModal visible={tips.showTips} onClose={tips.closeTips} />
        </main>
      )}
    </SessionGate>
  )
}
