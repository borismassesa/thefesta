'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

// Shared layout for the long-form legal pages (Terms, Privacy, Cookies,
// Copyright). Renders a centered serif title and a two-column body: the
// content on the left and a sticky Table of Contents on the right that
// highlights the section currently in view.

export type LegalSection = { id: string; title: string; body: ReactNode }

export default function LegalDoc({
  eyebrow,
  title,
  updated,
  intro,
  sections,
  labels,
}: {
  eyebrow?: string
  title: string
  updated?: string
  intro?: ReactNode
  sections: LegalSection[]
  labels?: {
    lastUpdated?: string
    tableOfContents?: string
  }
}) {
  const [active, setActive] = useState(sections[0]?.id)
  const lastUpdatedLabel = labels?.lastUpdated ?? 'Last updated'
  const tableOfContentsLabel = labels?.tableOfContents ?? 'Table of Contents'

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-15% 0px -75% 0px', threshold: 0 },
    )

    sections.forEach((s) => {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [sections])

  return (
    <section className="px-4 sm:px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl">
        {eyebrow && (
          <p className="text-center text-[12px] uppercase tracking-[0.2em] text-gray-400 mb-4">
            {eyebrow}
          </p>
        )}
        <h1 className="text-center font-serif text-4xl sm:text-5xl lg:text-6xl tracking-tight text-[#403d39]">
          {title}
        </h1>
        {updated && (
          <p className="text-center text-[13px] text-gray-400 mt-5">
            {lastUpdatedLabel} {updated}
          </p>
        )}

        <div className="mt-14 grid gap-10 lg:gap-14 lg:grid-cols-[minmax(0,1fr)_220px]">
          {/* Body */}
          <div className="order-2 lg:order-1 max-w-2xl">
            {intro && (
              <div className="text-[15px] sm:text-base text-gray-600 leading-relaxed space-y-4 mb-12">
                {intro}
              </div>
            )}
            <div className="space-y-12">
              {sections.map((s) => (
                <section key={s.id} id={s.id} className="scroll-mt-24">
                  <h2 className="font-serif text-2xl sm:text-3xl text-[#403d39] tracking-tight">
                    {s.title}
                  </h2>
                  <div className="mt-4 text-[15px] text-gray-700 leading-relaxed space-y-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_strong]:font-semibold [&_strong]:text-[#403d39] [&_a]:font-medium [&_a]:text-[#8350E8] [&_a:hover]:underline">
                    {s.body}
                  </div>
                </section>
              ))}
            </div>
          </div>

          {/* Table of Contents */}
          <aside className="order-1 lg:order-2">
            <div className="lg:sticky lg:top-10">
              <p className="text-[13px] font-bold text-[#1A1A1A] mb-4">
                {tableOfContentsLabel}
              </p>
              <nav>
                <ul className="border-l border-gray-200 text-[13.5px]">
                  {sections.map((s) => {
                    const isActive = active === s.id
                    return (
                      <li key={s.id}>
                        <a
                          href={`#${s.id}`}
                          className={`-ml-px block border-l-2 py-1.5 pl-4 transition-colors ${
                            isActive
                              ? 'border-(--accent) font-medium text-[#1A1A1A]'
                              : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-[#1A1A1A]'
                          }`}
                        >
                          {s.title}
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </nav>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
