'use client'

import type { AdviceIdeasBodySection } from '@/lib/cms/advice-ideas'

// Live preview of the article's sections — what the reader will see in the
// floating right-rail TOC on the published page. Each "Heading 2" the author
// inserts in the editor body becomes one section here, numbered 1, 2, 3…
//
// Click a row to jump to that H2 in the editor — the heading scrolls into
// view and briefly flashes lavender so the author sees where the cursor
// landed. Mirrors how the live article TOC behaves on the public site.
//
// Used in both the contributor RightRail and the admin PostEditor so writers
// always have a visible mapping between "I just added an H2" → "I just added
// section N to the TOC".
export default function SectionsCard({
  body,
}: {
  body: AdviceIdeasBodySection[]
}) {
  // Only headings count as TOC entries — bare-paragraph sections (no H2) are
  // valid in the data model but don't get a TOC entry on the live site.
  const sections = body.filter((s) => s.heading?.trim())
  const hasUnnamed = body.some((s) => !s.heading?.trim() && s.blocks.length > 0)

  // Jump target: the Nth h2 inside the .article-editor surface. The editor
  // is mounted as a sibling of this rail, so the document-level query is
  // safe — there's only one editor per page.
  const jumpToSection = (index: number) => {
    const h2s = document.querySelectorAll<HTMLHeadingElement>(
      '.article-editor h2'
    )
    const target = h2s[index]
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // Flash the target so the author sees where they landed. Removing the
    // class after the animation lets it re-trigger on the next click.
    target.classList.remove('section-flash')
    void target.offsetWidth // force reflow so the animation restarts
    target.classList.add('section-flash')
    window.setTimeout(() => target.classList.remove('section-flash'), 1500)
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3.5">
      <header className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-gray-500">
          Sections
        </p>
        <span className="text-[11px] tabular-nums text-gray-400">
          {sections.length}
        </span>
      </header>

      {sections.length === 0 ? (
        <p className="mt-3 text-[11px] leading-5 text-gray-500">
          Insert a{' '}
          <span className="font-semibold text-gray-700">Heading&nbsp;2</span>{' '}
          in the body to start a new section. Each one becomes a numbered
          entry in the table of contents on the live article.
        </p>
      ) : (
        <ol className="mt-3 space-y-0.5">
          {sections.map((section, index) => (
            <li key={section.id}>
              <button data-opus-button="neutral" data-opus-button-size="small"
                type="button"
                onClick={() => jumpToSection(index)}
                className="group flex w-full gap-2 rounded-md py-1 pl-1 pr-2 text-left text-[12px] leading-5 text-gray-700 transition-colors hover:bg-[#FAF5FA] focus:bg-[#FAF5FA] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7E5896]/30"
              >
                <span className="w-5 shrink-0 font-semibold tabular-nums text-gray-400 group-hover:text-[#7E5896]">
                  {index + 1}.
                </span>
                <span className="line-clamp-2 break-words group-hover:text-gray-950">
                  {section.heading}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {hasUnnamed && (
        <p className="mt-3 border-t border-dashed border-gray-200 pt-2 text-[11px] leading-5 text-amber-700">
          Some content sits before the first Heading&nbsp;2 — it will render
          on the page but won&apos;t appear in the TOC.
        </p>
      )}
    </section>
  )
}
