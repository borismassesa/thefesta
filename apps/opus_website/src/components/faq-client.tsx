'use client'

import { useState } from 'react'
import Reveal from '@/components/ui/Reveal'
import type { FaqContent } from '@/lib/cms/faq'

export default function FaqClient({ content }: { content: FaqContent }) {
  const [open, setOpen] = useState<string | null>(null)

  return (
    <section className="px-4 sm:px-6 py-14 sm:py-20 md:py-24 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row gap-10 sm:gap-14 md:gap-16">

        {/* Left */}
        <Reveal direction="up" margin="-80px" className="md:w-72 shrink-0 text-center md:text-left">
          <div className="md:sticky md:top-24">
            {content.eyebrow && (
              <span className="text-[var(--accent)] text-xs font-bold uppercase tracking-widest">{content.eyebrow}</span>
            )}
            <h2 className="text-[2.4rem] sm:text-5xl font-black tracking-tighter uppercase leading-[1.0] sm:leading-[0.88] mt-3 mb-5 text-[#1A1A1A]">
              {content.headline_line_1}
              <br />
              {content.headline_line_2}
              <br />
              {content.headline_line_3}
            </h2>
            <div className="w-10 h-1 bg-[var(--accent)] rounded-full mb-4 mx-auto md:mx-0" />
            <p className="text-gray-400 font-medium text-sm leading-relaxed max-w-xs mx-auto md:mx-0">
              {content.subheadline}
            </p>
            <a
              href={content.cta_href}
              className="mt-6 inline-flex items-center gap-2 bg-[#1A1A1A] hover:bg-[#333] text-white text-sm font-bold px-5 py-3 rounded-full transition-colors"
            >
              {content.cta_label}
              <span className="w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center text-[var(--on-accent)] text-xs leading-none">→</span>
            </a>
          </div>
        </Reveal>

        {/* Right — accordion */}
        <Reveal direction="none" margin="-80px" delay={0.1} className="flex-1 flex flex-col gap-2 sm:gap-0 sm:divide-y sm:divide-gray-100">
          {content.items.map((faq) => {
            const isOpen = open === faq.id
            return (
              <div
                key={faq.id}
                className={`rounded-2xl sm:rounded-none transition-colors ${
                  isOpen
                    ? 'bg-gray-50 sm:bg-transparent'
                    : 'bg-gray-50 sm:bg-transparent hover:bg-gray-50 sm:hover:bg-transparent'
                }`}
              >
                <button data-opus-button="control"
                  onClick={() => setOpen(isOpen ? null : faq.id)}
                  className="w-full flex items-center justify-between px-4 sm:px-0 py-4 sm:py-6 text-left gap-4 sm:gap-6 group"
                >
                  <span className={`font-bold text-sm sm:text-base md:text-lg transition-colors leading-snug ${isOpen ? 'text-[#1A1A1A]' : 'text-gray-600 group-hover:text-[#1A1A1A]'}`}>
                    {faq.q}
                  </span>
                  <span className={`shrink-0 w-7 h-7 sm:w-auto sm:h-auto rounded-full sm:rounded-none flex items-center justify-center text-xl sm:text-2xl font-black leading-none transition-all ${
                    isOpen
                      ? 'bg-[var(--accent)] text-[var(--on-accent)] sm:bg-transparent sm:text-[var(--accent)] rotate-45'
                      : 'bg-white sm:bg-transparent text-gray-400 group-hover:text-[#1A1A1A]'
                  }`}>
                    +
                  </span>
                </button>
                {isOpen && (
                  <p className="px-4 sm:px-0 pb-4 sm:pb-6 text-sm sm:text-base text-gray-500 font-medium leading-relaxed">
                    {faq.a}
                  </p>
                )}
              </div>
            )
          })}
        </Reveal>

      </div>
    </section>
  )
}
