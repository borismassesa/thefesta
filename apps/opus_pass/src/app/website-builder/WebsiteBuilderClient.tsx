'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  X,
  Palette,
  LayoutGrid,
  Files,
  Sparkles,
  Settings as SettingsIcon,
  Monitor,
  Smartphone,
  Mail,
  Eye,
  Check,
  Loader2,
  Globe,
  Copy,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { FONT_STACKS, type BuilderMeta } from '@/lib/builder/types'
import { composeDoc, formatLongDate, getPreset, type DesignPreset } from '@/lib/builder/presets'
import type { GiftRegistryItemWithClaims } from '@/lib/dashboard/queries'
import type { GuestbookEntry } from '@/lib/dashboard/types'
import { publishWebsite } from './actions'
import { useBuilder } from './useBuilder'
import { SiteRenderer } from './components/SiteRenderer'
import { DesignPanel, LayoutPanel, PagesPanel, AnimationPanel, SettingsPanel, type DesignView } from './components/Panels'

type Tab = 'Design' | 'Layout' | 'Pages' | 'Animation' | 'Settings'
type Device = 'desktop' | 'mobile' | 'invite'

const TABS: { key: Tab; icon: LucideIcon }[] = [
  { key: 'Design', icon: Palette },
  { key: 'Layout', icon: LayoutGrid },
  { key: 'Pages', icon: Files },
  { key: 'Animation', icon: Sparkles },
  { key: 'Settings', icon: SettingsIcon },
]

export default function WebsiteBuilderClient({
  registryItems = [],
  guestbookEntries = [],
}: {
  /** The couple's real gift-registry items — Zambarau's Registry tab renders
   *  these (falling back to sample items when the registry is still empty)
   *  instead of static placeholders. */
  registryItems?: GiftRegistryItemWithClaims[]
  /** The couple's real guestbook entries — Zambarau's Guest Book tab renders
   *  the actual GuestbookPublicClient with these instead of a static message. */
  guestbookEntries?: GuestbookEntry[]
}) {
  const api = useBuilder()
  const [tab, setTab] = useState<Tab>('Design')
  const [designView, setDesignView] = useState<DesignView>('summary')
  const [device, setDevice] = useState<Device>('desktop')
  const [showPreview, setShowPreview] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)

  const handlePublish = async () => {
    setPublishing(true)
    setPublishError(null)
    try {
      const { slug } = await publishWebsite(api.doc)
      setPublishedUrl(`opuspass.opusfesta.com/w/${slug}`)
    } catch (err) {
      // requireDashboardUser() redirects to /sign-in when signed out; any other
      // failure surfaces here so the couple isn't left thinking it published.
      console.error('[publish] failed', err)
      setPublishError("Couldn't publish — please make sure you're signed in and try again.")
    } finally {
      setPublishing(false)
    }
  }

  const meta = api.doc.meta
  const rendered = useMemo(() => composeDoc(api.doc), [api.doc])

  // Re-key the preview so the CSS transition replays whenever a visual choice
  // changes. Animation only runs when the couple has picked a style.
  const animClass =
    meta.animationStyle === 'none' ? '' : `wb-anim-${meta.transition || 'rise'}`
  const animKey = `${meta.presetId}-${meta.layoutId}-${meta.animationStyle}-${meta.transition}-${meta.accentOverride ?? ''}`

  // Design-mode confirm flow: snapshot the design on entering the tab so Cancel
  // can revert; "Use this design" commits by re-snapshotting.
  const [designBaseline, setDesignBaseline] = useState(() => ({
    presetId: meta.presetId,
    accentOverride: meta.accentOverride,
  }))
  useEffect(() => {
    if (tab === 'Design' && designView === 'grid') {
      setDesignBaseline({ presetId: api.doc.meta.presetId, accentOverride: api.doc.meta.accentOverride })
    }
    // Snapshot only when entering the grid, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, designView])

  const designPreset = getPreset(meta.presetId)
  const accentOptions = Array.from(
    new Set([designPreset.palette.accent, ...designPreset.swatches.filter((c) => !isLightHex(c))]),
  ).slice(0, 5)
  const currentAccent = meta.accentOverride || designPreset.palette.accent

  return (
    <div
      data-lenis-prevent
      className="fixed inset-x-0 top-0 flex h-[100dvh] flex-col overflow-hidden bg-[#EFEDE8] text-[#1A1A1A] font-sans"
    >
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <header className="relative flex h-14 shrink-0 items-center justify-between border-b border-black/8 bg-white px-3 sm:px-5">
        <Link
          href="/websites"
          aria-label="Close editor"
          className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-black/5 hover:text-[#1A1A1A]"
        >
          <X size={20} />
        </Link>

        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-3 md:flex">
          <span className="text-[14px] text-gray-700">
            opuspass.opusfesta.com/i/<span className="font-semibold text-[#1A1A1A]">{meta.slug || 'our-wedding'}</span>
          </span>
          <button data-opus-button="control"
            type="button"
            onClick={() => setTab('Settings')}
            className="text-[14px] font-semibold text-[#7A3FB8] underline-offset-2 hover:underline"
          >
            Get a custom URL
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 text-[12.5px] text-gray-400 sm:flex">
            {api.saveStatus === 'saving' ? (
              <>
                <Loader2 size={13} className="animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Check size={13} className="text-[#3FA34D]" /> Saved
              </>
            )}
          </span>
          <button data-opus-button="primary" data-opus-button-size="small"
            type="button"
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-1.5 rounded-full border border-black/15 px-4 py-1.5 text-[13.5px] font-semibold text-[#1A1A1A] transition-colors hover:bg-black/5"
          >
            <Eye size={15} /> Preview
          </button>
          <button data-opus-button="primary" data-opus-button-size="small"
            type="button"
            onClick={handlePublish}
            disabled={publishing}
            className="flex items-center gap-1.5 rounded-full bg-[#1A1A1A] px-5 py-1.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-60"
          >
            {publishing ? <Loader2 size={15} className="animate-spin" /> : <Globe size={15} />}
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── Left rail ──────────────────────────────────────────────── */}
        <nav className="flex w-[64px] shrink-0 flex-col gap-1 border-r border-black/8 bg-white py-3 sm:w-[124px] sm:px-2">
          {TABS.map(({ key, icon: Icon }) => (
            <button data-opus-button="control"
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition-colors sm:px-3',
                tab === key ? 'bg-[#F3EAFA] text-[#7A3FB8]' : 'text-gray-500 hover:bg-black/5 hover:text-gray-800',
              )}
            >
              <Icon size={18} className="shrink-0" />
              <span className="hidden sm:inline">{key}</span>
            </button>
          ))}
        </nav>

        {/* ── Middle panel ───────────────────────────────────────────── */}
        <section className="hide-scrollbar min-h-0 w-full max-w-[520px] shrink-0 overflow-y-auto border-r border-black/8 bg-white px-5 py-6 sm:px-7">
          {tab === 'Design' && <DesignPanel api={api} view={designView} onViewChange={setDesignView} />}
          {tab === 'Layout' && <LayoutPanel api={api} />}
          {tab === 'Pages' && <PagesPanel api={api} />}
          {tab === 'Animation' && <AnimationPanel api={api} />}
          {tab === 'Settings' && <SettingsPanel api={api} />}
        </section>

        {/* ── Live preview ───────────────────────────────────────────── */}
        <main className="relative hidden min-w-0 flex-1 flex-col bg-white lg:flex">
          <div className="hide-scrollbar flex flex-1 flex-col overflow-y-auto px-8 pb-24 pt-6">
          {tab === 'Design' && designView === 'grid' && (
            <div className="mb-5 flex w-full items-center justify-between">
              <div className="flex items-center gap-2">
                {accentOptions.map((c) => (
                  <button data-opus-button="control"
                    key={c}
                    type="button"
                    aria-label={`Use accent ${c}`}
                    onClick={() => api.updateMeta({ accentOverride: c })}
                    className={cn(
                      'h-8 w-8 rounded-full ring-1 ring-black/10 transition-all',
                      currentAccent.toLowerCase() === c.toLowerCase() && 'ring-2 ring-[#1A1A1A] ring-offset-2',
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2.5">
                <button data-opus-button="danger" data-opus-button-size="medium"
                  type="button"
                  onClick={() =>
                    api.updateMeta({ presetId: designBaseline.presetId, accentOverride: designBaseline.accentOverride })
                  }
                  className="rounded-full border border-black/15 bg-white px-5 py-2 text-[13.5px] font-semibold text-[#DC2626] transition-colors hover:bg-red-50"
                >
                  Cancel
                </button>
                <button data-opus-button="primary" data-opus-button-size="medium"
                  type="button"
                  onClick={() => setDesignBaseline({ presetId: meta.presetId, accentOverride: meta.accentOverride })}
                  className="rounded-full bg-[#1A1A1A] px-5 py-2 text-[13.5px] font-semibold text-white transition-colors hover:bg-black"
                >
                  Use this design
                </button>
              </div>
            </div>
          )}

          {device === 'invite' ? (
            <MatchingCards preset={designPreset} meta={meta} />
          ) : (
            <ScaledPreview device={device} announcement={meta.announcement}>
              <div key={animKey} className={animClass}>
                <SiteRenderer doc={rendered} editable={false} compact={device !== 'desktop'} registryItems={registryItems} guestbookEntries={guestbookEntries} />
              </div>
            </ScaledPreview>
          )}
          </div>

          {/* Device toggle — pinned to the bottom-centre of the preview panel */}
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center">
            <div className="pointer-events-auto flex items-center gap-1 rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-black/10">
            {([
              { key: 'desktop', icon: Monitor, label: 'Desktop' },
              { key: 'mobile', icon: Smartphone, label: 'Mobile' },
              { key: 'invite', icon: Mail, label: 'Save the date' },
            ] as { key: Device; icon: LucideIcon; label: string }[]).map(({ key, icon: Icon, label }) => (
              <button data-opus-button="control"
                key={key}
                type="button"
                aria-label={label}
                aria-pressed={device === key}
                onClick={() => setDevice(key)}
                className={cn(
                  'flex h-9 w-11 items-center justify-center rounded-lg transition-colors',
                  device === key ? 'bg-[#F2F0EB] text-[#1A1A1A]' : 'text-gray-400 hover:text-gray-700',
                )}
              >
                <Icon size={18} />
              </button>
            ))}
            </div>
          </div>
        </main>
      </div>

      {showPreview && (
        <PreviewOverlay onClose={() => setShowPreview(false)}>
          <SiteRenderer doc={rendered} editable={false} compact={false} registryItems={registryItems} guestbookEntries={guestbookEntries} />
        </PreviewOverlay>
      )}

      {publishedUrl && <PublishedModal url={publishedUrl} onClose={() => setPublishedUrl(null)} />}

      {publishError && (
        <div className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-[#1A1A1A] px-5 py-3 text-[13.5px] font-medium text-white shadow-xl">
          {publishError}
          <button data-opus-button="control" type="button" onClick={() => setPublishError(null)} className="text-white/70 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Published confirmation ───────────────────────────────────────────────────

function PublishedModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#9FE870]">
          <Check size={28} className="text-[#1A1A1A]" strokeWidth={2.5} />
        </span>
        <h3 className="text-[22px] font-bold tracking-tight">Your website is live!</h3>
        <p className="mt-2 text-[14px] text-gray-600">Share this link with your guests — they can view every detail and RSVP.</p>
        <div className="mt-5 flex items-center gap-2 rounded-xl border border-black/10 bg-[#F7F6F2] px-3 py-2.5">
          <span className="flex-1 truncate text-left text-[13.5px] font-medium text-gray-800">{url}</span>
          <button data-opus-button="primary" data-opus-button-size="small"
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(`https://${url}`).catch(() => {})
              setCopied(true)
            }}
            className="flex items-center gap-1 rounded-lg bg-[#1A1A1A] px-3 py-1.5 text-[12.5px] font-semibold text-white"
          >
            <Copy size={13} /> {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <div className="mt-5 flex items-center justify-center gap-4">
          <a
            href={`https://${url}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13.5px] font-semibold text-[#7A3FB8] hover:underline"
          >
            Open site →
          </a>
          <button data-opus-button="control" type="button" onClick={onClose} className="text-[13.5px] font-semibold text-gray-500 hover:text-gray-800">
            Keep editing
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Matching digital cards (the "Save the date" preview) ──────────────────
//  A flat-lay of the couple's DIGITAL cards that mirrors the chosen
//  website design's palette, fonts and motif — so the wedding website and the
//  digital cards share one look. OpusFesta is digital-first; this is about the
//  matching card suite, not paper prints.

function MatchingCards({ preset, meta }: { preset: DesignPreset; meta: BuilderMeta }) {
  const a = meta.partnerA.trim().split(/\s+/)[0] || meta.partnerA
  const b = meta.partnerB.trim().split(/\s+/)[0] || meta.partnerB
  const names = `${a} & ${b}`
  return (
    <div className="mx-auto w-full max-w-[600px]">
      <div className="rounded-2xl bg-[#E7E4DF] p-5 shadow-[0_24px_70px_-24px_rgba(0,0,0,0.4)] sm:p-7">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex w-[27%] flex-col gap-3 pt-6">
            <CardMock preset={preset} title="Save the Date" names={names} sub={shortDate(meta.date)} />
            <CardMock preset={preset} title="RSVP" lines={6} />
          </div>
          <div className="w-[46%]">
            <CardMock preset={preset} title="Together with their families" names={names} sub={formatLongDate(meta.date)} lines={5} big />
          </div>
          <div className="flex w-[27%] flex-col gap-3">
            <CardMock preset={preset} title="Save the Date" names={names} sub={shortDate(meta.date)} />
            <CardMock preset={preset} title="The Details" lines={5} landscape />
            <CardMock preset={preset} title="Thank You" names={names} landscape />
          </div>
        </div>
      </div>
      <h3 className="mt-8 text-center text-[26px] font-bold tracking-tight text-[#1A1A1A]">
        Your website matches your digital cards, too
      </h3>
      <p className="mx-auto mt-2 max-w-md text-center text-[15px] text-[#1A1A1A]/55">
        Your digital cards carry the same palette, fonts and feel — one style across your whole celebration.
      </p>
      <Link
        href="/digital-cards/catalog"
        className="mx-auto mt-5 block w-fit rounded-full bg-[#1A1A1A] px-8 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-black"
      >
        See matching digital cards
      </Link>
    </div>
  )
}

function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const [, y, mm, dd] = m
  return `${mm} | ${dd} | ${y.slice(2)}`
}

function CardMock({
  preset,
  title,
  names,
  sub,
  lines = 4,
  big = false,
  landscape = false,
}: {
  preset: DesignPreset
  title: string
  names?: string
  sub?: string
  lines?: number
  big?: boolean
  landscape?: boolean
}) {
  const p = preset.palette
  return (
    <div
      className="overflow-hidden rounded-[3px] bg-white shadow-[0_8px_20px_-8px_rgba(0,0,0,0.4)] ring-1 ring-black/5"
      style={{ aspectRatio: landscape ? '7 / 5' : '5 / 7' }}
    >
      <div className="flex h-full flex-col">
        <div className="flex flex-1 flex-col items-center gap-[3px] px-2 pt-2.5 text-center">
          <span
            className="uppercase tracking-[0.16em] text-gray-500"
            style={{ fontSize: big ? 6 : 5, fontFamily: FONT_STACKS[preset.bodyFont] }}
          >
            {title}
          </span>
          {names && (
            <span
              className="leading-tight"
              style={{ fontFamily: FONT_STACKS[preset.headingFont], color: p.ink, fontSize: big ? 11 : 8 }}
            >
              {names}
            </span>
          )}
          {sub && <span className="text-[4.5px] uppercase tracking-[0.12em] text-gray-400">{sub}</span>}
          <span className="mt-1 flex w-full flex-col items-center gap-[2px]">
            {Array.from({ length: lines }).map((_, i) => (
              <span
                key={i}
                className="h-[1.5px] rounded-full bg-black/10"
                style={{ width: `${[60, 72, 48, 66, 54, 70][i % 6]}%` }}
              />
            ))}
          </span>
        </div>
        <PaperArt preset={preset} />
      </div>
    </div>
  )
}

/** The bottom illustration band — greenery for floral designs, otherwise a
 *  watercolour wash drawn from the design's palette. */
function PaperArt({ preset }: { preset: DesignPreset }) {
  const p = preset.palette
  if (preset.thumb === 'floral') {
    return (
      <div className="relative h-[34%] w-full overflow-hidden">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
          {[12, 30, 50, 70, 88].map((cx, i) => (
            <g key={i} transform={`translate(${cx} ${40 - (i % 2 === 0 ? 14 : 9)})`}>
              <path d="M0 14 Q3 4 0 -6" stroke="#6E7A56" strokeWidth="1.2" fill="none" />
              {[-4, 0, 4, 8].map((dy, j) => (
                <ellipse key={j} cx={j % 2 ? 3 : -3} cy={10 - dy} rx="2.6" ry="4.4" fill={j % 2 ? '#7E8C5A' : '#5C6B4D'} transform={`rotate(${j % 2 ? 35 : -35} ${j % 2 ? 3 : -3} ${10 - dy})`} />
              ))}
            </g>
          ))}
        </svg>
      </div>
    )
  }
  return (
    <div
      className="h-[34%] w-full"
      style={{
        background: `linear-gradient(180deg, transparent 0%, ${p.accent}1F 35%, ${p.accent}66 70%, ${p.accent}A6 100%)`,
      }}
    />
  )
}

/** True for very light colours — excluded from the accent palette so names stay legible. */
function isLightHex(hex: string): boolean {
  const h = hex.replace('#', '')
  if (h.length < 6) return /f{3}/i.test(h)
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.75
}

// ── Scale-to-fit preview frame (browser chrome) ──────────────────────────────
//  Renders the site at a fixed device width, then scales it down to fit the
//  available column and centres it — so a full desktop layout is always visible
//  (never clipped) and mobile sits in a phone-width card, mirroring Zola.

const DEVICE_WIDTH: Record<Device, number> = { desktop: 1240, mobile: 412, invite: 460 }

function ScaledPreview({
  device,
  announcement,
  children,
}: {
  device: Device
  announcement: boolean
  children: React.ReactNode
}) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState<number | undefined>(undefined)
  const width = DEVICE_WIDTH[device]

  useEffect(() => {
    const compute = () => {
      const avail = outerRef.current?.clientWidth ?? width
      const s = Math.min(1, avail / width)
      setScale(s)
      const h = innerRef.current?.offsetHeight
      if (h) setHeight(h * s)
    }
    compute()
    const ro = new ResizeObserver(compute)
    if (outerRef.current) ro.observe(outerRef.current)
    if (innerRef.current) ro.observe(innerRef.current)
    return () => ro.disconnect()
  }, [width, children])

  return (
    <div ref={outerRef} className="flex w-full flex-1 justify-center">
      {/* Placeholder reserves the post-scale footprint so the column scrolls right. */}
      <div style={{ width: width * scale, height }}>
        <div
          ref={innerRef}
          className="overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_-24px_rgba(0,0,0,0.4)] ring-1 ring-black/5"
          style={{ width, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
          {announcement && (
            <div className="bg-gradient-to-r from-[#3FA9C9] to-[#8350E8] px-5 py-3 text-center text-[14px] font-medium text-white">
              A note from the couple — see you there! 💌
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  )
}

// ── Full-screen preview overlay ──────────────────────────────────────────────

function PreviewOverlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const [device, setDevice] = useState<Device>('desktop')
  const width = device === 'mobile' ? 390 : 1040
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1A1A1A]/90 backdrop-blur-sm">
      <div className="flex h-14 shrink-0 items-center justify-between px-5 text-white">
        <span className="text-[14px] font-semibold">Preview</span>
        <div className="flex items-center gap-1 rounded-full bg-white/10 p-1">
          {([
            { key: 'desktop', icon: Monitor },
            { key: 'mobile', icon: Smartphone },
          ] as { key: Device; icon: LucideIcon }[]).map(({ key, icon: Icon }) => (
            <button data-opus-button="control"
              key={key}
              type="button"
              onClick={() => setDevice(key)}
              aria-label={key}
              className={cn('flex h-8 w-10 items-center justify-center rounded-full', device === key ? 'bg-white text-[#1A1A1A]' : 'text-white/70')}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>
        <button data-opus-button="control" type="button" onClick={onClose} className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#1A1A1A]">
          <X size={15} /> Close
        </button>
      </div>
      <div className="flex flex-1 justify-center overflow-auto p-5">
        <div className="h-fit overflow-hidden rounded-2xl bg-white shadow-2xl" style={{ width }}>
          {children}
        </div>
      </div>
    </div>
  )
}
