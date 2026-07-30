'use client'

import Link from 'next/link'
import Image from 'next/image'
import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { CheckCircle2, CreditCard, Users, CalendarCheck, MessageCircle, Clock } from 'lucide-react'
import { ease, duration as dur, drift } from '@/lib/motion'

/** Flat white canvas, matching the rest of opusfesta.com. */
const CANVAS = '#FFFFFF'
const BAND = '#FAFAFA'
const MARQUEE = '#0D99FF'

/** Handles straddle the frame edge, so each is inset by half its 7px size. */
const HANDLE_CORNERS = [
  '-left-[3px] -top-[3px]',
  '-right-[3px] -top-[3px]',
  '-left-[3px] -bottom-[3px]',
  '-right-[3px] -bottom-[3px]',
]

/** Every artifact dimension is expressed as `art(px)` so the whole decorative layer
 *  scales off one variable per breakpoint, instead of hand-tuning six shapes x four
 *  screen sizes. */
const art = (px: number) => `calc(${px}px * var(--art))`

/** Unframed wrapper. Keeps the same breathing room as Selection so positions
 *  tuned against a framed artifact still hold. */
function Artifact({ children }: { children: ReactNode }) {
  return <div className="relative" style={{ padding: art(14) }}>{children}</div>
}

/** Dashed selection frame with corner handles, mimicking a design-tool marquee. */
function Selection({ children }: { children: ReactNode }) {
  return (
    <Artifact>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 border border-dashed"
        style={{ borderColor: MARQUEE }}
      />
      {HANDLE_CORNERS.map((corner) => (
        <span
          key={corner}
          aria-hidden
          className={`pointer-events-none absolute size-[7px] ${corner}`}
          style={{ backgroundColor: MARQUEE }}
        />
      ))}
      {children}
    </Artifact>
  )
}

const PALETTE = [
  { color: '#141414', label: 'Ink' },
  { color: '#E9A8E9', label: 'Blush lilac' },
  { color: '#9B2242', label: 'Deep wine' },
  { color: '#E8B923', label: 'Gold' },
]

const GUESTS = [
  { src: '/assets/images/beautiful_bride.jpg', alt: '' },
  { src: '/assets/images/churchcouples.jpg', alt: '' },
  { src: '/assets/images/mauzo_crew.jpg', alt: '' },
]

const TOOLS = [
  { Icon: CheckCircle2, label: 'Checklist' },
  { Icon: CreditCard, label: 'Budget' },
  { Icon: Users, label: 'Guest List' },
  { Icon: CalendarCheck, label: 'Seating Chart' },
  { Icon: MessageCircle, label: 'Vendor Manager' },
  { Icon: Clock, label: 'Timeline' },
]

export default function PlanningToolsHero() {
  const reduceMotion = useReducedMotion()

  const rise = (delay: number, dy = drift.md) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: dy },
          animate: { opacity: 1, y: 0 },
          transition: { duration: dur.lg, delay, ease },
        }

  const float = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, scale: 0.94 },
          animate: { opacity: 1, scale: 1 },
          transition: { duration: dur.md, delay, ease },
        }

  return (
    <section style={{ backgroundColor: CANVAS }} className="text-[#1A1A1A]">
      {/* Canvas */}
      <div
        // --hero-pt drives both the content's top padding and the artifact layer's
        // offset, so raising it pushes the shapes down with the text instead of
        // leaving them pinned to the top edge.
        style={{ ['--hero-pt' as string]: '10rem' }}
        className="relative isolate overflow-hidden px-5 pt-24 pb-20 sm:px-6 sm:pt-28 lg:min-h-[720px] lg:pt-(--hero-pt) lg:pb-24"
      >

        {/* ---- Scattered artifacts (decorative) ---- */}
        {/* Starts partway into the hero's top padding so the shapes sit above the eyebrow
            while still tracking --hero-pt. --art shrinks the whole set on smaller screens
            so it still clears the headline on iPad and laptops. The three inner shapes
            wait for lg: below that the headline leaves no side room and they land on the
            text. Only the two bleeding tiles and the Aa survive at md. */}
        <div
          aria-hidden
          style={{ top: 'calc(var(--hero-pt) * 0.6)' }}
          className="pointer-events-none absolute inset-x-0 bottom-0 hidden [--art:0.62] md:block lg:[--art:0.72] xl:[--art:0.85] 2xl:[--art:1]"
        >

          {/* Illustration tile, bleeding off the left edge. Square box matches the
              source's 500x500 artboard. Unframed, unlike the other artifacts. */}
          <motion.div className="absolute -top-[2%]" style={{ left: art(-64) }} {...float(0.5)}>
            <Artifact>
              <div
                className="relative overflow-hidden rounded-xl"
                style={{ width: art(260), height: art(260) }}
              >
                <Image
                  src="/assets/images/planning-hero.avif"
                  alt=""
                  fill
                  sizes="(min-width: 1536px) 260px, 200px"
                  className="object-cover"
                  priority
                />
              </div>
            </Artifact>
          </motion.div>

          {/* Empty pill component */}
          <motion.div className="absolute left-[28%] -top-[3%] hidden lg:block" {...float(0.62)}>
            <Selection>
              <div
                className="rounded-full border-[1.5px] border-[#141414]"
                style={{ width: art(176), height: art(46) }}
              />
            </Selection>
          </motion.div>

          {/* Type specimen */}
          <motion.div className="absolute right-[9%] top-[2%]" {...float(0.7)}>
            <Selection>
              <div
                className="flex items-center justify-center font-medium leading-none tracking-tight"
                style={{ width: art(116), height: art(92), fontSize: art(68) }}
              >
                Aa
              </div>
            </Selection>
          </motion.div>

          {/* Palette swatches, parked just left of the headline's second line. */}
          <motion.div className="absolute top-[36%] hidden lg:block" style={{ left: art(238) }} {...float(0.78)}>
            <Selection>
              <div className="grid grid-cols-2" style={{ gap: art(10) }}>
                {PALETTE.map((swatch) => (
                  <span
                    key={swatch.label}
                    className="block rounded-full"
                    style={{ width: art(44), height: art(44), backgroundColor: swatch.color }}
                  />
                ))}
              </div>
            </Selection>
          </motion.div>

          {/* Guest avatars */}
          <motion.div className="absolute top-[24%] hidden lg:block" style={{ right: art(186) }} {...float(0.86)}>
            <Selection>
              <div className="flex">
                {GUESTS.map((guest, i) => (
                  <span
                    key={guest.src}
                    className="relative block overflow-hidden rounded-full ring-2"
                    style={{
                      width: art(54),
                      height: art(54),
                      marginLeft: i === 0 ? 0 : art(-12),
                      ['--tw-ring-color' as string]: CANVAS,
                    }}
                  >
                    <Image src={guest.src} alt={guest.alt} fill sizes="54px" className="object-cover" />
                  </span>
                ))}
              </div>
            </Selection>
          </motion.div>

          {/* Gradient tile, bleeding off the right edge */}
          <motion.div className="absolute top-[32%]" style={{ right: art(-128) }} {...float(0.94)}>
            <Selection>
              <div
                className="rounded-xl"
                style={{
                  width: art(260),
                  height: art(300),
                  backgroundImage: 'linear-gradient(145deg, #5B7CF0 0%, #A45BE0 45%, #E356C4 100%)',
                }}
              />
            </Selection>
          </motion.div>
        </div>

        {/* ---- Centre column ---- */}
        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <motion.p className="text-[15px] font-medium" {...rise(0.06, drift.sm)}>
            Tools for couples
          </motion.p>

          {/* Climbs in steps so the artifact layer keeps side room at each breakpoint. */}
          <h1 className="mt-8 text-[2.4rem] font-extrabold leading-[1.15] tracking-[-0.035em] sm:text-5xl lg:text-[54px] lg:leading-[1.4] xl:text-[62px] 2xl:text-[72px]">
            <motion.span className="block" {...rise(0.14, drift.lg)}>
              Plan the real day,
            </motion.span>
            <motion.span className="block" {...rise(0.22, drift.lg)}>
              not the mood board
            </motion.span>
          </h1>

          <motion.p
            className="mx-auto mt-7 max-w-md text-[15px] font-medium leading-relaxed text-[#1A1A1A] sm:text-base lg:mt-6"
            {...rise(0.3, drift.sm)}
          >
            Checklists, budgets, guest lists and seating.
            <br className="hidden sm:block" /> Every moving piece in one place.
          </motion.p>

          <motion.div className="mt-8 lg:mt-10" {...rise(0.38, drift.sm)}>
            <Link
              href="/my/planning"
              className="inline-flex items-center rounded-lg bg-[#1A1A1A] px-[18px] py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-black"
            >
              Get started
            </Link>
          </motion.div>
        </div>
      </div>

      {/* ---- Tool strip ---- */}
      <div style={{ backgroundColor: BAND }} className="border-t border-black/5">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-6 lg:py-16">
          <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-7 sm:gap-x-14 lg:justify-between">
            {TOOLS.map(({ Icon, label }) => (
              <li key={label} className="flex items-center gap-2.5 text-[#1A1A1A]/45">
                <Icon size={20} strokeWidth={2} />
                <span className="text-[15px] font-semibold tracking-tight whitespace-nowrap">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
