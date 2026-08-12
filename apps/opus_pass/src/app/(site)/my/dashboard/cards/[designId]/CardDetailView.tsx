'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock,
  Download,
  History,
  Loader2,
  Maximize2,
  Plus,
  Send,
  Users,
} from 'lucide-react'
import type { CardDetail, CardVersion } from '@/lib/dashboard/released-cards'
import { cardStatusMeta, isReleased } from '@/lib/cards/card-status'
import { downloadReleasedCard } from '@/lib/card-download'
import { cn } from '@/lib/utils'
import CardLightbox from '../CardLightbox'

/**
 * One card, in full.
 *
 * The gallery answers "which cards do I own?"; this answers everything else a
 * couple asks about one of them, in the order they ask it: is it ready, what
 * can I do with it, how many guests does it cover, how did it get here.
 *
 * Every number on this page comes from a real row. Where a figure can only be
 * known for the event rather than for this card (sending draws on one pool per
 * event) it is labelled as an event figure instead of being attributed here.
 */
export default function CardDetailView({ card }: { card: CardDetail }) {
  const [downloading, setDownloading] = useState(false)
  /** null = closed. A version id opens that version, '' opens the current one. */
  const [zoomRelease, setZoomRelease] = useState<string | null>(null)

  const status = cardStatusMeta(card.status)
  const released = isReleased(card.status) && card.hasArtefact

  async function download(releaseId?: string | null) {
    setDownloading(true)
    try {
      await downloadReleasedCard(card.designId, card.cardName, releaseId)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* On a phone this stacks preview, then what to do about it, then the
          history. The timeline is a grid item of its own rather than part of
          the left column so that order holds without moving it on desktop,
          where it belongs under the artwork. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_1fr] lg:gap-10">
        <div className="lg:col-start-1 lg:row-start-1">
          <div className="relative overflow-hidden rounded-[var(--opus-radius-large)] border border-black/[0.06] bg-gradient-to-b from-[#F7F2FA] via-white to-[#FBF8F4] p-5 sm:p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#C9A0DC]/20 blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-20 -left-12 h-48 w-48 rounded-full bg-[#9FE870]/20 blur-3xl"
            />
            {released ? (
              <button data-opus-button="control"
                type="button"
                onClick={() => setZoomRelease('')}
                className="group relative mx-auto flex w-full max-w-[420px] cursor-zoom-in justify-center"
                aria-label={`View ${card.cardName} full size`}
              >
                {/* The real card, served by an ownership-checked route. An <img>
                    renders the SVG as an isolated document, which is exactly why
                    the typefaces were baked into the file at release. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/my/card/${card.designId}`}
                  alt={`${card.cardName}, your finished card`}
                  className="max-h-[62vh] w-auto max-w-full rounded-xl bg-white shadow-[0_24px_60px_-24px_rgba(26,26,26,0.35)] ring-1 ring-black/[0.04] transition-transform duration-300 group-hover:-translate-y-1"
                />
                <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-[#1A1A1A]/70 px-3 py-1.5 text-[11px] font-semibold text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
                  <Maximize2 className="h-3 w-3" />
                  Full size
                </span>
              </button>
            ) : (
              <InProgressStage card={card} />
            )}
          </div>
        </div>

        <div className="space-y-6 lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <div>
            <span
              className={cn(
                'inline-block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide',
                status.className,
              )}
            >
              {status.label}
            </span>
            <p className="mt-3 text-sm text-[#1A1A1A]/65">{status.hint}</p>
          </div>

          <Actions
            card={card}
            released={released}
            downloading={downloading}
            onZoom={() => setZoomRelease('')}
            onDownload={() => download()}
          />

          <GuestUsage card={card} />
          <CardInformation card={card} />
          <NextSteps card={card} released={released} />
          {card.versions.length > 0 && (
            <Versions
              versions={card.versions}
              onView={(v) => setZoomRelease(v.isCurrent ? '' : v.id)}
              onDownload={(v) => download(v.isCurrent ? null : v.id)}
              downloading={downloading}
            />
          )}
          {card.activity.length > 0 && <Activity card={card} />}
        </div>

        <div className="lg:col-start-1 lg:row-start-2">
          <Timeline card={card} />
        </div>
      </div>

      {zoomRelease !== null && (
        <CardLightbox
          designId={card.designId}
          releaseId={zoomRelease || null}
          cardName={card.cardName}
          downloading={downloading}
          onClose={() => setZoomRelease(null)}
          onDownload={() => download(zoomRelease || null)}
        />
      )}
    </div>
  )
}

/** The stage before there is artwork to show, or when the file is missing. */
function InProgressStage({ card }: { card: CardDetail }) {
  const status = cardStatusMeta(card.status)
  const missing = isReleased(card.status) && !card.hasArtefact

  return (
    <div className="mx-auto flex aspect-[5/7] w-full max-w-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-black/10 bg-white/70 px-8 text-center">
      {missing ? (
        <>
          <AlertTriangle className="h-7 w-7 text-amber-500" />
          <p className="mt-3 text-sm text-[#1A1A1A]/70">
            This card was finished before we started keeping a copy here.
          </p>
        </>
      ) : card.cardImage ? (
        <>
          {/* The catalogue hero, which is what they chose in the shop. Their own
              artwork does not exist yet, and showing this one as if it were
              theirs would be a lie the release step exists to prevent. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.cardImage}
            alt=""
            className="h-44 w-auto rounded-lg opacity-60 shadow-sm"
          />
          <p className="mt-4 text-sm font-semibold text-[#1A1A1A]">{status.label}</p>
          <p className="mt-1 text-sm text-[#1A1A1A]/60">{status.hint}</p>
        </>
      ) : (
        <>
          <Clock className="h-7 w-7 text-[#C9A0DC]" />
          <p className="mt-3 text-sm text-[#1A1A1A]/70">{status.hint}</p>
        </>
      )}
    </div>
  )
}

function Actions({
  card,
  released,
  downloading,
  onZoom,
  onDownload,
}: {
  card: CardDetail
  released: boolean
  downloading: boolean
  onZoom: () => void
  onDownload: () => void
}) {
  // Sending is the point of buying a card, so it leads. Downloading is the
  // thing a couple does once; sending is the thing they came here for.
  if (card.status === 'awaiting_info') {
    return (
      <Link
        href="/my/dashboard/card-details"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#7E5896] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(126,88,150,0.9)] transition-colors hover:bg-[#6b4a80]"
      >
        Add your details
        <ArrowRight className="h-4 w-4" />
      </Link>
    )
  }

  if (!released) return null

  return (
    <div className="space-y-2.5">
      <Link
        href="/my/dashboard/invitations"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#7E5896] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(126,88,150,0.9)] transition-colors hover:bg-[#6b4a80]"
      >
        <Send className="h-4 w-4" />
        Send invitations
      </Link>
      <button data-opus-button="neutral" data-opus-button-size="large"
        type="button"
        onClick={onZoom}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white px-4 py-3 text-sm font-semibold text-[#1A1A1A] transition-colors hover:bg-black/[0.03]"
      >
        <Maximize2 className="h-4 w-4" />
        View full size
      </button>
      <button data-opus-button="neutral" data-opus-button-size="large"
        type="button"
        onClick={onDownload}
        disabled={downloading}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white px-4 py-3 text-sm font-semibold text-[#1A1A1A] transition-colors hover:bg-black/[0.03] disabled:opacity-60"
      >
        {downloading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        Download
      </button>
    </div>
  )
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-black/[0.06] bg-white p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#1A1A1A]/45">
        {icon}
        {title}
      </p>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function GuestUsage({ card }: { card: CardDetail }) {
  const { allowance, eventUsage } = card
  if (allowance.total === 0 && !eventUsage) return null

  return (
    <Panel title="Guest allowance" icon={<Users className="h-3.5 w-3.5" />}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Figure value={allowance.total} label="Total" />
        <Figure value={allowance.generated} label="Cards made" />
        <Figure value={Math.max(allowance.total - allowance.generated, 0)} label="Remaining" />
      </div>

      {allowance.toppedUp > 0 && (
        <p className="mt-3 text-xs text-[#1A1A1A]/55">
          Includes {allowance.toppedUp.toLocaleString('en-US')} added by a top-up.
        </p>
      )}

      {eventUsage && (
        // Sends are metered per event and always use the newest approved card,
        // so this cannot honestly be reported as this card's number.
        <p className="mt-3 border-t border-black/[0.06] pt-3 text-xs text-[#1A1A1A]/55">
          Across this whole event: {eventUsage.used.toLocaleString('en-US')} sent,{' '}
          {eventUsage.remaining.toLocaleString('en-US')} left of{' '}
          {eventUsage.purchased.toLocaleString('en-US')}.
        </p>
      )}

      {card.topUpReleaseId && (
        <Link
          href="/my/dashboard/invitations"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#7E5896] hover:underline"
        >
          <Plus className="h-4 w-4" />
          Top up guests
        </Link>
      )}
    </Panel>
  )
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl bg-[#F7F2FA] px-2 py-3">
      <p className="text-lg font-bold text-[#1A1A1A]">{value.toLocaleString('en-US')}</p>
      <p className="mt-0.5 text-[11px] font-medium text-[#1A1A1A]/55">{label}</p>
    </div>
  )
}

function CardInformation({ card }: { card: CardDetail }) {
  const date = (value: string | null) =>
    value
      ? new Date(value).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : null

  const rows: [string, string | null][] = [
    ['Category', card.category],
    ['Designer', card.designer],
    ['Purchased', date(card.purchasedAt)],
    ['Approved', date(card.releasedAt)],
    ['Last updated', date(card.updatedAt)],
    [
      'Version',
      card.versions.length > 0
        ? `${card.versions.find((v) => v.isCurrent)?.number ?? card.versions[0].number} of ${card.versions.length}`
        : null,
    ],
    ['Printed copies', card.printQty > 0 ? card.printQty.toLocaleString('en-US') : null],
  ]
  const present = rows.filter((row): row is [string, string] => Boolean(row[1]))

  return (
    <Panel title="Card information">
      <dl className="space-y-2 text-sm">
        {present.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-[#1A1A1A]/55">{label}</dt>
            <dd className="text-right font-medium text-[#1A1A1A]">{value}</dd>
          </div>
        ))}
      </dl>
      {card.palette.length > 0 && (
        <div className="mt-4 flex items-center gap-2 border-t border-black/[0.06] pt-3">
          <span className="text-sm text-[#1A1A1A]/55">Colours</span>
          <div className="flex gap-1.5">
            {card.palette.map((hex) => (
              <span
                key={hex}
                title={hex}
                className="h-5 w-5 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}

function Timeline({ card }: { card: CardDetail }) {
  return (
    <Panel title="Where this card is">
      {/* A column on a phone, a track across the page on a wide screen: the
          same six steps, laid out the way there is room for. */}
      <ol className="sm:flex sm:items-start">
        {card.timeline.map((step, index) => {
          const last = index === card.timeline.length - 1
          return (
            <li key={step.key} className="flex gap-3 sm:min-w-0 sm:flex-1 sm:flex-col sm:gap-2">
              <div className="flex flex-col items-center sm:w-full sm:flex-row">
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                    step.done ? 'bg-[#7E5896] text-white' : 'bg-black/[0.06] text-[#1A1A1A]/35',
                  )}
                >
                  {step.done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                {!last && (
                  <span
                    className={cn(
                      'w-px flex-1 sm:h-px sm:w-auto sm:self-center',
                      step.done ? 'bg-[#7E5896]/30' : 'bg-black/[0.07]',
                    )}
                  />
                )}
              </div>
              <div className={cn('pb-4 sm:pb-0 sm:pr-3', last && 'pb-0')}>
                <p
                  className={cn(
                    'text-sm font-medium sm:text-[13px] sm:leading-snug',
                    step.done ? 'text-[#1A1A1A]' : 'text-[#1A1A1A]/45',
                  )}
                >
                  {step.label}
                </p>
                {step.at && (
                  <p className="text-xs text-[#1A1A1A]/45">
                    {new Date(step.at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}

function NextSteps({ card, released }: { card: CardDetail; released: boolean }) {
  if (!released) return null

  // Contextual: each step drops off the list once it has actually happened.
  const steps: { href: string; label: string; done: boolean }[] = [
    { href: '/my/dashboard/guests', label: 'Add your guest list', done: card.allowance.generated > 0 },
    {
      href: '/my/dashboard/invitations',
      label: 'Send the invitations',
      done: (card.eventUsage?.used ?? 0) > 0,
    },
    { href: '/my/dashboard/rsvps', label: 'Track the replies', done: false },
  ]

  return (
    <Panel title="Next steps">
      <ul className="space-y-1">
        {steps.map((step) => (
          <li key={step.href}>
            <Link
              href={step.href}
              className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-black/[0.03]"
            >
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                  step.done ? 'bg-[#9FE870] text-[#14361f]' : 'bg-black/[0.06] text-[#1A1A1A]/40',
                )}
              >
                {step.done ? <Check className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
              </span>
              <span className={cn(step.done ? 'text-[#1A1A1A]/50' : 'font-medium text-[#1A1A1A]')}>
                {step.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function Versions({
  versions,
  onView,
  onDownload,
  downloading,
}: {
  versions: CardVersion[]
  onView: (v: CardVersion) => void
  onDownload: (v: CardVersion) => void
  downloading: boolean
}) {
  return (
    <Panel title="Versions" icon={<History className="h-3.5 w-3.5" />}>
      <ul className="space-y-1.5">
        {versions.map((version) => (
          <li
            key={version.id}
            className="flex items-center justify-between gap-2 rounded-xl border border-black/[0.06] px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#1A1A1A]">
                Version {version.number}
                {version.isCurrent && (
                  <span className="ml-2 rounded-full bg-[#9FE870] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#14361f]">
                    Current
                  </span>
                )}
              </p>
              {version.releasedAt && (
                <p className="text-xs text-[#1A1A1A]/45">
                  {new Date(version.releasedAt).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-1">
              <IconButton label={`View version ${version.number}`} onClick={() => onView(version)}>
                <Maximize2 className="h-4 w-4" />
              </IconButton>
              <IconButton
                label={`Download version ${version.number}`}
                onClick={() => onDownload(version)}
                busy={downloading}
              >
                <Download className="h-4 w-4" />
              </IconButton>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function IconButton({
  label,
  onClick,
  busy,
  children,
}: {
  label: string
  onClick: () => void
  busy?: boolean
  children: React.ReactNode
}) {
  return (
    <button data-opus-button="primary" data-opus-button-size="small"
      type="button"
      onClick={onClick}
      disabled={busy}
      title={label}
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#1A1A1A]/60 transition-colors hover:bg-black/[0.05] hover:text-[#1A1A1A] disabled:opacity-50"
    >
      {children}
    </button>
  )
}

function Activity({ card }: { card: CardDetail }) {
  return (
    <Panel title="Activity">
      <ul className="space-y-2.5">
        {card.activity.map((entry) => (
          <li key={entry.id} className="flex justify-between gap-3 text-sm">
            <span className="text-[#1A1A1A]/75">{entry.label}</span>
            <span className="shrink-0 text-xs text-[#1A1A1A]/45">
              {new Date(entry.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
