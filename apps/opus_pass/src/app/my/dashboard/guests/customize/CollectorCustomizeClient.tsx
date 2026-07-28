'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, Check, Copy, ClipboardSignature, ExternalLink, MessageCircle, QrCode } from 'lucide-react'
import QRCodeLib from 'qrcode'
import { Button } from '@/components/dashboard/controls'
import { PageConfigFields, DeviceToggle, PREVIEW_DEVICES, type PreviewDevice } from '@/components/dashboard/page-customizer'
import { EventSwitcher } from '@/components/dashboard/EventScope'
import { updateCollectorEventContent } from '@/lib/dashboard/actions'
import { collectorShareMessage, collectorUrl } from '@/lib/dashboard/share'
import {
  PLEDGE_PREVIEW_MESSAGE,
  PLEDGE_PREVIEW_READY,
  resolveCollectorEventContent,
  type CollectorEventContent,
  type PledgePageConfig,
} from '@/lib/dashboard/pledge-page'
import type { DashboardEventScopeStrings } from '@/lib/cms/ui-strings-fallback'

export default function CollectorCustomizeClient({
  collectorToken,
  initialConfig,
  coupleName,
  events,
  selectedEventId,
  scopeStrings,
}: {
  collectorToken: string | null
  initialConfig: PledgePageConfig
  coupleName: string
  events: { id: string; name: string }[]
  /** Event this collector page is scoped to (null only when the couple has no events). */
  selectedEventId: string | null
  scopeStrings: DashboardEventScopeStrings
}) {
  // Editable state starts from this event's own content layered over the RAW
  // stored config — not the English-resolved page. An untouched field must
  // stay unset (undefined) so it keeps following the guest's own locale (see
  // resolveCollectorPage); resolveCollectorEventContent also makes sure the
  // cover/wording/questions shown here are this event's own, not a generic
  // page shared across every event (see resolveCollectorEventContent).
  const initialCfg: PledgePageConfig = {
    ...initialConfig,
    ...resolveCollectorEventContent(initialConfig, selectedEventId),
  }
  const [cfg, setCfg] = useState<PledgePageConfig>(initialCfg)
  // The last successfully-saved (or initial) config — compared against `cfg`
  // to know whether there's anything worth saving. Updated from the save()
  // handler itself, never from an effect.
  const [baseline, setBaseline] = useState<PledgePageConfig>(initialCfg)
  const [device, setDevice] = useState<PreviewDevice>('desktop')
  const [pending, startTransition] = useTransition()
  const [hasSaved, setHasSaved] = useState(false)
  const dirty = JSON.stringify(cfg) !== JSON.stringify(baseline)

  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  // Multi-event couples share an event-tagged link so guests land on that
  // event's own cover/wording/questions; single-event links stay clean.
  const shareEventId = events.length > 1 ? selectedEventId : null
  const previewUrl = collectorToken && origin ? collectorUrl(origin, collectorToken, shareEventId) : null
  const waHref = previewUrl
    ? `https://wa.me/?text=${encodeURIComponent(collectorShareMessage(coupleName, previewUrl))}`
    : null

  async function copyLink() {
    if (!previewUrl) return
    try {
      await navigator.clipboard.writeText(previewUrl)
      toast.success('Collector link copied')
    } catch {
      toast.error('Could not copy link')
    }
  }

  // QR for the link — printable for a table card at the venue.
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => {
    if (!previewUrl) {
      setQr(null)
      return
    }
    let cancelled = false
    QRCodeLib.toDataURL(previewUrl, { margin: 1, width: 200, color: { dark: '#1A1A1A', light: '#00000000' } })
      .then((url) => {
        if (!cancelled) setQr(url)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [previewUrl])

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  const postConfig = useCallback((c: PledgePageConfig) => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: PLEDGE_PREVIEW_MESSAGE, config: c },
      window.location.origin,
    )
  }, [])

  useEffect(() => {
    postConfig(cfg)
  }, [cfg, postConfig])

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return
      if (e.data?.type === PLEDGE_PREVIEW_READY) postConfig(cfgRef.current)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [postConfig])

  function save() {
    startTransition(async () => {
      try {
        // Only this event's content is written — cover/wording/questions for
        // every other event stay untouched (see updateCollectorEventContent).
        const content: CollectorEventContent = {
          headingLine2: cfg.headingLine2,
          intro: cfg.intro,
          buttonLabel: cfg.buttonLabel,
          privacyNote: cfg.privacyNote,
          coverImageUrl: cfg.coverImageUrl,
          coverIsFullTemplate: cfg.coverIsFullTemplate,
          questions: cfg.questions,
        }
        await updateCollectorEventContent(selectedEventId, content)
        toast.success('Collector page saved')
        setBaseline(cfg)
        setHasSaved(true)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not save changes')
      }
    })
  }

  return (
    // Pinned to exactly 100vh with overflow-hidden so the page body is never
    // itself a scroll candidate alongside the editor column below it.
    <div className="-mx-3 -my-6 bg-[#FBF7F2] sm:-mx-4 lg:-mx-6 lg:-my-8 lg:h-screen lg:overflow-hidden">
      <div className="grid lg:h-full lg:grid-cols-[minmax(0,440px)_1fr]">
        {/* Editor column. data-lenis-prevent: the root SmoothScrollProvider
            (Lenis) hijacks wheel events on the whole app and calls
            preventDefault on them unless the target is inside an
            opted-out element — without this, mouse-wheel scrolling here
            does nothing and only dragging the native scrollbar works. */}
        <div
          data-lenis-prevent
          className="border-b border-black/[0.06] bg-white lg:h-full lg:overflow-y-auto lg:border-b-0 lg:border-r"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-black/[0.06] bg-white/90 px-5 py-3.5 backdrop-blur">
            <Link
              href="/my/dashboard/guests"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1A1A1A]/60 hover:text-[#1A1A1A]"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
            <div className="flex items-center gap-2">
              {previewUrl ? (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#1A1A1A]/25 bg-white px-4 py-2 text-sm font-bold text-[#1A1A1A] hover:bg-black/[0.03]"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Preview as guest
                </a>
              ) : null}
              <Button onClick={save} disabled={pending || !dirty}>
                {pending ? (
                  'Saving…'
                ) : hasSaved && !dirty ? (
                  <>
                    <Check className="h-4 w-4" /> Saved
                  </>
                ) : (
                  'Save'
                )}
              </Button>
            </div>
          </div>

          <div className="px-5 py-6">
            <h1 className="font-serif text-2xl text-[#1A1A1A]">Customize your collector page</h1>
            <p className="mt-1 text-sm text-[#1A1A1A]/55">
              Edit the wording and look on the left — the preview updates as you type.
            </p>

            {events.length > 1 ? (
              <div className="mt-4">
                <EventSwitcher
                  events={events}
                  selectedId={selectedEventId ?? ''}
                  strings={scopeStrings}
                  disabled={pending}
                />
              </div>
            ) : null}

            {previewUrl ? (
              <div className="mt-5 overflow-hidden rounded-2xl border border-black/[0.08]">
                <div className="flex items-start gap-3 bg-gradient-to-br from-[#F0DFF6] via-[#F0DFF6]/60 to-white p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70">
                    <ClipboardSignature className="h-4.5 w-4.5 text-[#8e57b3]" strokeWidth={1.5} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-[#1A1A1A]">Share your link</h2>
                    <p className="mt-0.5 text-xs text-[#1A1A1A]/60">
                      Don&apos;t have everyone&apos;s contact info yet? Share this link — friends and family fill
                      in their own details and land straight on your guest list.
                    </p>
                  </div>
                </div>

                <div className="space-y-3 bg-white p-4">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 truncate rounded-xl border border-black/[0.12] bg-white px-3 py-2 text-xs text-[#1A1A1A]/80">
                      {previewUrl.replace(/^https?:\/\//, '')}
                    </div>
                    <button
                      type="button"
                      onClick={copyLink}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-black/[0.18] bg-white px-3 py-2 text-xs font-semibold text-[#1A1A1A] hover:bg-black/[0.03]"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={waHref ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-3 py-2 text-xs font-semibold text-white hover:brightness-95"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </a>

                    {qr ? (
                      <div className="ml-auto flex shrink-0 items-center gap-2.5 rounded-xl border border-black/[0.1] bg-black/[0.015] p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qr} alt="QR code for the Contact Collector link" className="h-12 w-12 shrink-0" />
                        <div className="space-y-0.5 text-[11px] text-[#1A1A1A]/55">
                          <p className="flex items-center gap-1 font-semibold text-[#1A1A1A]">
                            <QrCode className="h-3 w-3" /> Scan to open
                          </p>
                          <p>For a printed table card</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-6">
              <PageConfigFields
                cfg={cfg}
                setCfg={setCfg}
                headingPlaceholder="Would Love Your Details"
                buttonPlaceholder="Send my details"
              />
            </div>
          </div>
        </div>

        {/* Live preview column */}
        <div className="lg:h-full">
          <div className="dash-header-safe flex min-h-[58px] flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] bg-white/70 px-5 py-3 backdrop-blur">
            <p className="text-xs font-medium uppercase tracking-wide text-[#1A1A1A]/45">Live preview</p>
            <div className="shrink-0">
              <DeviceToggle device={device} onChange={setDevice} />
            </div>
          </div>
          <div data-lenis-prevent className="flex justify-center overflow-auto p-4 sm:p-6 lg:h-[calc(100%-58px)]">
            {previewUrl ? (
              <div
                className="mx-auto w-full self-start overflow-hidden rounded-2xl border border-black/[0.12] bg-white shadow-[0_24px_60px_-30px_rgba(0,0,0,0.4)] transition-all duration-300"
                style={{ maxWidth: PREVIEW_DEVICES[device].width }}
              >
                <div className="flex items-center gap-2 border-b border-black/[0.08] bg-[#F3F1EE] px-4 py-2.5">
                  <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
                  <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
                  <span className="h-3 w-3 rounded-full bg-[#28C840]" />
                  <div className="ml-3 hidden min-w-0 flex-1 truncate rounded-md bg-white px-3 py-1 text-xs text-[#1A1A1A]/50 ring-1 ring-black/[0.06] sm:block">
                    {previewUrl.replace(/^https?:\/\//, '')}
                  </div>
                </div>
                <iframe
                  ref={iframeRef}
                  src={previewUrl}
                  title="Collector page preview"
                  onLoad={() => postConfig(cfgRef.current)}
                  className="w-full bg-white"
                  style={{ height: 'calc(100vh - 138px)' }}
                />
              </div>
            ) : (
              <p className="mt-10 text-sm text-[#1A1A1A]/50">No collector link yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
