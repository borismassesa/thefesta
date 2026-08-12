'use client'

import { useState } from 'react'
import {
  ChevronDown,
  FileDown, Printer, Share2, ClipboardCheck, Mail, MessageCircle, Send, CalendarCheck, Users, Heart,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import HeroSection from '@/components/shadcn-studio/blocks/hero-section-01/hero-section-01'
import BentoGrid from '@/components/shadcn-studio/blocks/bento-grid-13/bento-grid-13'
import type { GuestsHeroContent } from '@/lib/cms/guests-hero'
import type { GuestsFeaturesContent } from '@/lib/cms/guests-features'
import type { GuestsSpreadContent, GuestsSpreadIconKey } from '@/lib/cms/guests-spread-the-joy'
import type { GuestsFaqsContent } from '@/lib/cms/guests-faqs'

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function GuestsLandingClient({
  hero,
  features,
  spread,
  faqs,
  testimonials,
}: {
  hero: GuestsHeroContent
  features: GuestsFeaturesContent
  spread: GuestsSpreadContent
  faqs: GuestsFaqsContent
  testimonials?: React.ReactNode
}) {
  return (
    <div className="bg-white text-[#1A1A1A]">
      <HeroSection content={hero} />
      <BentoGrid content={features} />
      <SpreadTheJoy content={spread} />
      {testimonials}
      <FAQs content={faqs} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  SPREAD THE JOY — four ways to share a finished invitation: download, print,
//  share digitally, and manage RSVPs. Centered icon row, digital-first framing.
// ─────────────────────────────────────────────────────────────────────────────

const SPREAD_ICONS: Record<GuestsSpreadIconKey, LucideIcon> = {
  'file-down': FileDown,
  printer: Printer,
  'share-2': Share2,
  'clipboard-check': ClipboardCheck,
  mail: Mail,
  'message-circle': MessageCircle,
  send: Send,
  'calendar-check': CalendarCheck,
  users: Users,
  heart: Heart,
}

function SpreadTheJoy({ content }: { content: GuestsSpreadContent }) {
  return (
    <section className="px-4 sm:px-6 py-12 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif font-medium text-gray-900">
            {content.heading}
          </h2>
          <p className="mt-4 text-sm md:text-base text-gray-600">
            {content.description}
          </p>
        </div>

        <div className="mt-12 sm:mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-12">
          {content.items.map((item) => {
            const Icon = SPREAD_ICONS[item.icon] ?? Share2
            return (
              <div key={item.id} className="flex flex-col items-center text-center">
                <Icon size={30} strokeWidth={1.5} className="text-[#1A1A1A]" aria-hidden="true" />
                <h3 className="mt-5 text-xl font-bold text-gray-900">{item.title}</h3>
                <p className="mt-3 max-w-[15rem] text-[14px] sm:text-[15px] text-gray-600 leading-relaxed">
                  {item.description}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  FAQS
// ─────────────────────────────────────────────────────────────────────────────

function FAQs({ content }: { content: GuestsFaqsContent }) {
  return (
    <section className="px-4 sm:px-6 pb-16 sm:pb-20">
      <div className="mx-auto max-w-4xl pt-12 sm:pt-16">
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

function FAQItem({ q, a }: { q: string; a: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-gray-200 last:border-b-0">
      <button data-opus-button="control"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-5 sm:py-6 text-left"
      >
        <span className="text-[15px] sm:text-[17px] font-medium text-gray-900">
          {q}
        </span>
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
