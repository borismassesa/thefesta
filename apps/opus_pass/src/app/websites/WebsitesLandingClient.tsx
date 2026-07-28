'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowRight,
  ChevronDown,
  Link as LinkIcon,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { LandingHero } from '@/components/LandingHero'
import type { WebsitesHeroContent } from '@/lib/cms/websites-hero'
import type {
  WebsitesDesignsContent,
  WebsitesDesignItem,
} from '@/lib/cms/websites-designs'
import type { WebsitesSellingPointsContent } from '@/lib/cms/websites-selling-points'
import type {
  WebsitesFeaturesContent,
  WebsitesFeatureIcon,
} from '@/lib/cms/websites-features'
import type { WebsitesFaqsContent } from '@/lib/cms/websites-faqs'

type DesignTemplate = WebsitesDesignItem

const FEATURE_ICONS: Record<WebsitesFeatureIcon, LucideIcon> = {
  sparkles: Sparkles,
  users: Users,
  link: LinkIcon,
}

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function WebsitesLandingClient({
  hero,
  designs,
  sellingPoints,
  features,
  faqs,
  testimonials,
}: {
  hero: WebsitesHeroContent
  designs: WebsitesDesignsContent
  sellingPoints: WebsitesSellingPointsContent
  features: WebsitesFeaturesContent
  faqs: WebsitesFaqsContent
  testimonials?: React.ReactNode
}) {
  return (
    <div className="bg-white text-[#1A1A1A]">
      <LandingHero content={hero} />
      <DesignsPicker content={designs} />
      <SellingPoints content={sellingPoints} />
      <FeatureRow content={features} />
      {testimonials}
      <FAQs content={faqs} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  DESIGNS PICKER — tabbed template grid (echoes The Knot's design picker)
// ─────────────────────────────────────────────────────────────────────────────

function DesignsPicker({ content }: { content: WebsitesDesignsContent }) {
  const DESIGN_TABS = content.tabs
  const DESIGNS = content.designs
  const [activeTab, setActiveTab] = useState<string>(DESIGN_TABS[0] ?? 'Most Popular')
  const visible = DESIGNS.filter((d) => d.tags.includes(activeTab))

  return (
    <section id="designs" className="px-4 sm:px-6">
      <div className="mx-auto max-w-7xl pt-12 sm:pt-16">
        <div className="text-center mb-6 sm:mb-8">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-serif font-medium text-gray-900">
            {content.heading}
          </h2>
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-center gap-1 sm:gap-2 mb-8 sm:mb-10 overflow-x-auto px-2 [&::-webkit-scrollbar]:hidden">
          {DESIGN_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                'whitespace-nowrap px-3 sm:px-4 py-2 text-[12px] sm:text-[13px] font-semibold transition-colors',
                activeTab === tab
                  ? 'text-[#1A1A1A] border-b-2 border-[#1A1A1A]'
                  : 'text-gray-500 hover:text-[#1A1A1A] border-b-2 border-transparent',
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 sm:gap-x-5 gap-y-8 sm:gap-y-10">
          {visible.map((d) => {
            const T = TREATMENTS[d.treatment]
            const palette = [T.heroBg, T.accent, T.btnBg]
            return (
              <Link
                key={d.id}
                href="/website-builder"
                className="group block"
              >
                <div className="relative aspect-[3/2] overflow-hidden rounded-md shadow-sm ring-1 ring-black/5">
                  <WebsitePreview treatment={d.treatment} photo={d.photo} />
                  {/* "Free" badge — top-right corner */}
                  <span className="absolute top-3 right-3 z-10 rounded-full bg-white/95 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-[#1A1A1A] shadow-sm">
                    Free
                  </span>
                </div>

                {/* Card metadata: name on the left, palette on the right */}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="min-w-0 text-[14px] font-semibold text-[#1A1A1A] flex items-center gap-1">
                    {d.name}
                    <ArrowRight size={13} className="shrink-0" aria-hidden="true" />
                  </p>
                  <div className="flex items-center gap-1 shrink-0">
                    {palette.map((color, i) => (
                      <span
                        key={i}
                        aria-hidden
                        className="block h-3 w-3 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  FEATURE ROW — clean icon columns (echoes /digital-cards FeatureRow)
// ─────────────────────────────────────────────────────────────────────────────

function FeatureRow({ content }: { content: WebsitesFeaturesContent }) {
  return (
    <section className="px-4 sm:px-6">
      <div className="mx-auto max-w-7xl pt-16 sm:pt-24">
        <div className="text-center mb-10 sm:mb-14">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-serif font-medium text-gray-900">
            {content.heading}
          </h2>
          {content.description && (
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-gray-600 md:text-base">
              {content.description}
            </p>
          )}
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-3">
          {content.items.map((card) => {
            const Icon = FEATURE_ICONS[card.icon] ?? Sparkles
            return (
              <div key={card.id} className="flex flex-col items-center px-2 text-center">
                <Icon className="h-8 w-8 text-[#1A1A1A]" strokeWidth={1.5} aria-hidden="true" />
                <h3 className="mt-5 text-[18px] font-extrabold tracking-tight text-[#1A1A1A] sm:text-[20px]">
                  {card.title}
                </h3>
                <p className="mt-3 max-w-[280px] text-[13px] leading-relaxed text-[#1A1A1A]/65 sm:text-sm">
                  {card.body}
                </p>
                <Link
                  href={card.cta_href}
                  className="mt-4 inline-flex items-center gap-1 text-[13px] font-bold text-[#1A1A1A] underline underline-offset-4 hover:text-[var(--accent-hover)]"
                >
                  {card.cta_label}
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  SELLING POINTS — magazine grid with title/subtitle and generous whitespace
//  between rows. Each row is a rounded 2-column unit (photo + text panel)
//  that alternates left/right.
// ─────────────────────────────────────────────────────────────────────────────

function SellingPoints({ content }: { content: WebsitesSellingPointsContent }) {
  return (
    <section className="px-4 sm:px-6">
      <div className="mx-auto max-w-7xl pt-12 sm:pt-20">
        <div className="text-center mb-12 sm:mb-16 max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif font-medium text-gray-900 mb-4">
            {content.heading}
          </h2>
          <p className="text-sm md:text-base text-gray-700 leading-relaxed">
            {content.description}
          </p>
        </div>

        <div className="space-y-14 sm:space-y-20 md:space-y-24">
          {content.items.map((block, idx) => {
            const reverse = idx % 2 === 1
            return (
              <div
                key={block.id}
                className="grid grid-cols-1 md:grid-cols-2 overflow-hidden rounded-2xl bg-white ring-1 ring-gray-100"
              >
                {/* Photo cell */}
                <div
                  className={cn(
                    'relative aspect-[4/3] md:aspect-auto md:min-h-[440px]',
                    reverse && 'md:order-2',
                  )}
                >
                  <Image
                    src={block.image}
                    alt=""
                    fill
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>

                {/* Text cell */}
                <div
                  className={cn(
                    'flex flex-col justify-center px-6 py-10 sm:px-10 sm:py-14 md:px-14 md:py-16 lg:px-16',
                    reverse && 'md:order-1',
                  )}
                >
                  <h3 className="text-3xl md:text-4xl lg:text-[40px] font-bold tracking-tight leading-[1.15] text-gray-900 max-w-md">
                    {block.headline}
                  </h3>
                  <p className="mt-5 text-[15px] sm:text-base text-gray-700 leading-relaxed max-w-md">
                    {block.body}
                  </p>
                  <div className="mt-7">
                    <Link
                      href={block.cta_href}
                      className="inline-flex items-center rounded-full bg-[#1A1A1A] hover:bg-black text-white px-6 py-3 text-[14px] font-semibold"
                    >
                      {block.cta_label}
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
//  FAQS — accordion (identical pattern to /digital-cards FAQs)
// ─────────────────────────────────────────────────────────────────────────────

function FAQs({ content }: { content: WebsitesFaqsContent }) {
  return (
    <section className="px-4 sm:px-6 pb-20 sm:pb-28">
      <div className="mx-auto max-w-4xl pt-24 sm:pt-32 md:pt-40">
        <div className="text-center mb-8 sm:mb-10">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-serif font-medium text-gray-900 mb-4">
            {content.heading}
          </h2>
          <p className="max-w-2xl mx-auto text-sm md:text-base text-gray-700 leading-relaxed">
            {content.description}
          </p>
        </div>
        <div className="border-y border-gray-200">
          {content.items.map((item) => (
            <FAQItem key={item.id} q={item.question} a={item.answer} />
          ))}
        </div>
      </div>
    </section>
  )
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-gray-200 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-5 sm:py-6 text-left"
      >
        <span className="text-[15px] sm:text-[17px] font-medium text-gray-900">{q}</span>
        <ChevronDown
          className={cn(
            'h-5 w-5 text-gray-600 shrink-0 transition-transform duration-200',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>
      {open && (
        <p className="pb-5 sm:pb-6 pr-12 text-[14px] sm:text-[15px] text-gray-700 leading-relaxed">
          {a}
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHARED — Section divider
// ─────────────────────────────────────────────────────────────────────────────

function SectionDivider() {
  return (
    <div className="px-4 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="border-t border-gray-200 mt-12 sm:mt-16" />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  VISUAL PRIMITIVES — purely CSS website mockups so we don't depend on
//  uploaded screenshots. Each treatment maps to a colour-and-type combo.
// ─────────────────────────────────────────────────────────────────────────────

function WebsitePreview({
  treatment,
  photo,
  compact = false,
}: {
  treatment: DesignTemplate['treatment']
  photo?: string
  compact?: boolean
}) {
  const T = TREATMENTS[treatment]
  const onPhoto = Boolean(photo)
  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ backgroundColor: T.bg }}
    >
      {/* Hero band — real couple photo when provided, otherwise the motif */}
      <div
        className="absolute inset-x-0 top-0 h-[58%] overflow-hidden"
        style={{ backgroundColor: T.heroBg }}
      >
        {onPhoto ? (
          <>
            <Image
              src={photo!}
              alt=""
              fill
              sizes="(min-width: 768px) 33vw, 50vw"
              className="object-cover"
            />
            {/* Subtle vignette so the names overlay is always legible */}
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(180deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.18) 40%, rgba(0,0,0,0.45) 100%)',
              }}
            />
          </>
        ) : (
          <>
            {/* Decorative motif */}
            <div className="absolute inset-0 flex items-center justify-center">
              <T.Motif color={T.motif} />
            </div>
            {/* Couple silhouette card */}
            {!compact && (
              <div
                className="absolute left-[6%] top-[18%] w-[28%] aspect-square rounded-full overflow-hidden ring-2 shadow-sm"
                style={{ borderColor: T.accent }}
              >
                <div className="h-full w-full" style={{ backgroundColor: T.accent, opacity: 0.4 }} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Names — sit over the photo with white text + shadow for legibility */}
      <div
        className={cn(
          'absolute left-0 right-0 text-center',
          compact ? 'top-[22%]' : 'top-[28%]',
        )}
      >
        <p
          className={cn(
            'font-serif leading-tight',
            compact ? 'text-[10px]' : 'text-[13px] sm:text-[15px]',
          )}
          style={{
            color: onPhoto ? '#FFFFFF' : T.fg,
            fontStyle: T.italic ? 'italic' : 'normal',
            textShadow: onPhoto ? '0 1px 3px rgba(0,0,0,0.45)' : undefined,
          }}
        >
          Neema &amp; Amani
        </p>
        <p
          className={cn(
            'mt-0.5 uppercase tracking-[0.22em]',
            compact ? 'text-[5px]' : 'text-[7px] sm:text-[8px]',
          )}
          style={{
            color: onPhoto ? 'rgba(255,255,255,0.92)' : T.fg,
            opacity: onPhoto ? 1 : 0.65,
            textShadow: onPhoto ? '0 1px 2px rgba(0,0,0,0.45)' : undefined,
          }}
        >
          22 · 08 · 2026 · Bagamoyo
        </p>
      </div>

      {/* Nav row */}
      <div
        className={cn(
          'absolute left-0 right-0 flex justify-center gap-3',
          compact ? 'bottom-[34%]' : 'bottom-[36%]',
        )}
      >
        {['Our Story', 'RSVP', 'Travel', 'Registry'].map((l) => (
          <span
            key={l}
            className={cn('uppercase tracking-[0.18em] font-bold', compact ? 'text-[4px]' : 'text-[6px] sm:text-[7px]')}
            style={{ color: T.fg }}
          >
            {l}
          </span>
        ))}
      </div>

      {/* CTA pill */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[16%]">
        <span
          className={cn(
            'inline-block uppercase font-bold tracking-[0.18em] rounded-full',
            compact ? 'text-[5px] px-2 py-[3px]' : 'text-[7px] sm:text-[8px] px-3 py-1',
          )}
          style={{ backgroundColor: T.btnBg, color: T.btnFg }}
        >
          RSVP
        </span>
      </div>

      {/* Bottom strip */}
      <div
        className="absolute inset-x-0 bottom-0 h-[6%]"
        style={{ backgroundColor: T.accent, opacity: 0.4 }}
      />
    </div>
  )
}

type Treatment = {
  bg: string
  heroBg: string
  fg: string
  accent: string
  motif: string
  btnBg: string
  btnFg: string
  italic?: boolean
  Motif: (props: { color: string }) => React.ReactElement
}

const TREATMENTS: Record<DesignTemplate['treatment'], Treatment> = {
  'floral-cream': {
    bg: '#FBF7EF',
    heroBg: '#F5E6D3',
    fg: '#1A1A1A',
    accent: '#C49A6C',
    motif: '#C49A6C',
    btnBg: '#1A1A1A',
    btnFg: '#FFFFFF',
    italic: true,
    Motif: FlowerMotif,
  },
  'botanical-sage': {
    bg: '#F1EFE8',
    heroBg: '#D6E0CC',
    fg: '#2F3B2A',
    accent: '#5C6B4D',
    motif: '#5C6B4D',
    btnBg: '#2F3B2A',
    btnFg: '#FFFFFF',
    italic: true,
    Motif: LeafMotif,
  },
  'modern-blush': {
    bg: '#FFFFFF',
    heroBg: '#FAE6E9',
    fg: '#1A1A1A',
    accent: '#C9A0DC',
    motif: '#C9A0DC',
    btnBg: '#1A1A1A',
    btnFg: '#FFFFFF',
    Motif: BlockMotif,
  },
  'classic-serif': {
    bg: '#F8F4ED',
    heroBg: '#FFFFFF',
    fg: '#1A1A1A',
    accent: '#7A1F2B',
    motif: '#7A1F2B',
    btnBg: '#7A1F2B',
    btnFg: '#FFFFFF',
    italic: true,
    Motif: MonogramMotif,
  },
  'coastal-blue': {
    bg: '#F2F6F8',
    heroBg: '#CADFE6',
    fg: '#1B3A47',
    accent: '#4F7E94',
    motif: '#4F7E94',
    btnBg: '#1B3A47',
    btnFg: '#FFFFFF',
    italic: true,
    Motif: WaveMotif,
  },
  'minimal-cream': {
    bg: '#FFFFFF',
    heroBg: '#F2EDE3',
    fg: '#1A1A1A',
    accent: '#1A1A1A',
    motif: '#1A1A1A',
    btnBg: '#1A1A1A',
    btnFg: '#FFFFFF',
    Motif: BarMotif,
  },
  'twilight-navy': {
    bg: '#0F1A30',
    heroBg: '#172846',
    fg: '#F4E9C6',
    accent: '#E8D9A7',
    motif: '#E8D9A7',
    btnBg: '#E8D9A7',
    btnFg: '#0F1A30',
    italic: true,
    Motif: StarMotif,
  },
  'rose-garden': {
    bg: '#FBF1F2',
    heroBg: '#F2C8CB',
    fg: '#5A2A35',
    accent: '#A04450',
    motif: '#A04450',
    btnBg: '#5A2A35',
    btnFg: '#FFFFFF',
    italic: true,
    Motif: RoseMotif,
  },
}

function FlowerMotif({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 100 100" className="h-[55%] w-[55%] opacity-50" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <ellipse
          key={i}
          cx="50"
          cy="30"
          rx="6"
          ry="14"
          fill={color}
          transform={`rotate(${(360 / 6) * i} 50 50)`}
        />
      ))}
      <circle cx="50" cy="50" r="5" fill={color} />
    </svg>
  )
}

function LeafMotif({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 100 100" className="h-[60%] w-[60%] opacity-50" aria-hidden="true">
      <path
        d="M50 10 Q70 30 70 50 Q70 70 50 90 Q30 70 30 50 Q30 30 50 10 Z"
        fill={color}
      />
      <path d="M50 10 L50 90" stroke="#fff" strokeWidth="1.5" opacity="0.5" />
    </svg>
  )
}

function BlockMotif({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 100 100" className="h-[55%] w-[55%] opacity-40" aria-hidden="true">
      <rect x="20" y="20" width="60" height="60" stroke={color} strokeWidth="2" fill="none" />
      <rect x="32" y="32" width="36" height="36" stroke={color} strokeWidth="1" fill="none" />
    </svg>
  )
}

function MonogramMotif({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 100 100" className="h-[55%] w-[55%] opacity-50" aria-hidden="true">
      <text
        x="50"
        y="62"
        textAnchor="middle"
        fontFamily="serif"
        fontStyle="italic"
        fontSize="48"
        fill={color}
      >
        N&amp;A
      </text>
    </svg>
  )
}

function WaveMotif({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 100 100" className="h-[55%] w-[55%] opacity-50" aria-hidden="true">
      {[20, 40, 60].map((y) => (
        <path
          key={y}
          d={`M0 ${y} Q25 ${y - 10} 50 ${y} T100 ${y}`}
          stroke={color}
          strokeWidth="1.5"
          fill="none"
        />
      ))}
    </svg>
  )
}

function BarMotif({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 100 100" className="h-[45%] w-[45%] opacity-40" aria-hidden="true">
      <line x1="10" y1="50" x2="90" y2="50" stroke={color} strokeWidth="1.5" />
      <line x1="40" y1="30" x2="60" y2="30" stroke={color} strokeWidth="1" />
      <line x1="40" y1="70" x2="60" y2="70" stroke={color} strokeWidth="1" />
    </svg>
  )
}

function StarMotif({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 100 100" className="h-[60%] w-[60%] opacity-60" aria-hidden="true">
      {[
        [25, 25, 1.5],
        [70, 18, 2.5],
        [50, 45, 1],
        [80, 60, 1.8],
        [20, 65, 1.2],
        [60, 75, 2],
      ].map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill={color} />
      ))}
    </svg>
  )
}

function RoseMotif({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 100 100" className="h-[55%] w-[55%] opacity-50" aria-hidden="true">
      <circle cx="50" cy="50" r="22" fill={color} opacity="0.3" />
      <circle cx="50" cy="50" r="14" fill={color} opacity="0.4" />
      <circle cx="50" cy="50" r="7" fill={color} opacity="0.6" />
      <path
        d="M28 70 Q40 80 50 70"
        stroke={color}
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  )
}


