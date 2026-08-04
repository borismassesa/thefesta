'use client'

import { useState } from 'react'
import { CAREERS_ACTIONS, CAREERS_DNA, CAREERS_PILLARS, CAREERS_VALUES } from '@/lib/careers'

const TABS = [
  { id: 'dna', label: 'DNA', cards: CAREERS_DNA },
  { id: 'values', label: 'Values', cards: CAREERS_VALUES },
  { id: 'actions', label: 'Daily Actions', cards: CAREERS_ACTIONS },
] as const

export default function CareersOperatingSystem() {
  const [active, setActive] = useState<(typeof TABS)[number]['id']>('dna')
  const cards = TABS.find((tab) => tab.id === active)!.cards

  return (
    <section className="mx-auto max-w-[1440px] px-6 py-24">
      <div className="mb-24 grid gap-6 md:mb-32 md:grid-cols-3">
        {CAREERS_PILLARS.map((pillar) => (
          <div
            key={pillar.id}
            className="flex min-h-[320px] flex-col justify-between rounded-[40px] p-10 md:p-12"
            style={{ backgroundColor: pillar.bg }}
          >
            <span className="inline-block w-max rounded-full border border-black/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest">
              {pillar.eyebrow}
            </span>
            <p className="mt-12 text-[1.75rem] font-medium leading-tight tracking-tight">
              {pillar.copy}
            </p>
          </div>
        ))}
      </div>

      <div className="-mx-6 rounded-none bg-gradient-to-br from-[#DCF0C0] via-[#F7F5E8] to-[#EBD6FD] px-6 py-24 text-center md:mx-0 md:rounded-[60px] md:px-16 md:text-left">
        <div className="mx-auto mb-16 grid max-w-[1200px] items-center gap-8 md:grid-cols-2 md:gap-16">
          <h2 className="text-4xl font-medium tracking-tight md:text-6xl">
            How we operate
          </h2>
          <p className="text-lg text-gray-800 md:pl-12">
            Who we are, what we hold to, and what that looks like on an ordinary Tuesday.
          </p>
        </div>

        <div className="mx-auto mb-16 flex max-w-[1200px] flex-wrap justify-center gap-3">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActive(tab.id)}
              aria-pressed={active === tab.id}
              className={`rounded-full px-6 py-2.5 text-sm font-medium transition-colors ${
                active === tab.id
                  ? 'bg-[#1A1A1A] text-white'
                  : 'border border-black/20 hover:bg-black/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mx-auto grid max-w-[1200px] gap-6 text-left md:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.id}
              className="flex flex-col rounded-[40px] bg-white/80 p-10 backdrop-blur-sm md:p-12"
            >
              <span className="mb-12 inline-block w-max rounded-full border border-black/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest">
                {card.eyebrow}
              </span>
              <h3 className="mb-6 text-3xl font-medium tracking-tight">{card.title}</h3>
              <p className="leading-relaxed text-gray-700">{card.copy}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
