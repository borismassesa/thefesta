import Link from 'next/link'
import Image from 'next/image'
import { Tag } from 'lucide-react'

import { loadHomepageWhyOpusPassContent } from '@/lib/cms/homepage-why-opus-pass'
import { getLocale } from '@/lib/cms/locale'

export async function WhyOpusPass() {
  const locale = await getLocale()
  const content = await loadHomepageWhyOpusPassContent(locale)
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-6xl">
        {/* Headline */}
        <h2 className="mx-auto max-w-3xl text-center text-3xl font-black leading-[1.1] tracking-tight text-[#1A1A1A] sm:text-4xl lg:text-5xl">
          {content.headline}
        </h2>

        {/* Two columns: image left, copy right, gap between */}
        <div className="mt-14 grid items-center gap-12 lg:mt-20 lg:grid-cols-2 lg:gap-20">
          {/* Left: photo card with floating overlays (left-aligned) */}
          <div className="relative mx-auto w-full max-w-[380px] lg:mx-0">
            <div className="relative aspect-[3/4] overflow-hidden rounded-[var(--opus-radius-large)] shadow-[0_30px_70px_-30px_rgba(0,0,0,0.45)] ring-1 ring-black/[0.06]">
              <Image
                src={content.main_image_url}
                alt={content.main_image_alt}
                fill
                sizes="(min-width: 1024px) 24rem, 90vw"
                className="object-cover"
              />
            </div>

            {/* Floating product chip — straddling the top-left edge. On phones the
                card nearly fills the viewport, so cap the overhang at the section
                padding (12px) or the chip gets clipped by the body's overflow clip. */}
            <div className="absolute left-0 top-12 flex -translate-x-3 items-center gap-3 rounded-[var(--opus-radius-medium)] bg-white px-3 py-2.5 shadow-[0_14px_35px_-10px_rgba(0,0,0,0.35)] ring-1 ring-black/[0.05] sm:-translate-x-1/2 sm:px-3.5 sm:py-3">
              <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-gray-100 sm:h-12 sm:w-12">
                <Image
                  src={content.chip_image_url}
                  alt=""
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              </span>
              <span className="pr-1 leading-tight">
                <span className="block text-sm font-extrabold text-[#1A1A1A] sm:text-base">{content.chip_title}</span>
                <span className="block text-xs text-[#1A1A1A]/55 sm:text-sm">{content.chip_subtitle}</span>
              </span>
            </div>

            {/* Floating CTA pill — straddling the bottom edge; same clipped-overhang
                cap on phones as the chip above */}
            <Link
              href={content.floating_cta_href}
              className="absolute bottom-12 right-0 inline-flex translate-x-3 items-center gap-2.5 rounded-full bg-[var(--accent)] px-6 py-3.5 text-sm font-extrabold text-[var(--on-accent)] shadow-[0_16px_35px_-10px_rgba(0,0,0,0.4)] transition-colors hover:bg-[var(--accent-hover)] sm:translate-x-1/2 sm:px-8 sm:py-4 sm:text-base"
            >
              <Tag className="h-5 w-5" />
              {content.floating_cta_label}
            </Link>
          </div>

          {/* Right: copy + buttons */}
          <div className="text-center lg:text-left">
            <h3 className="text-2xl font-black tracking-tight text-[#1A1A1A] sm:text-3xl">
              {content.subheadline}
            </h3>
            <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-[#1A1A1A]/70 sm:text-lg lg:mx-0">
              {content.body}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
              <Link
                href={content.primary_button_href}
                className="inline-flex items-center rounded-full bg-[#1A1A1A] px-7 py-3.5 text-sm font-bold text-white transition-colors hover:bg-black"
              >
                {content.primary_button_label}
              </Link>
              <Link
                href={content.secondary_button_href}
                className="inline-flex items-center rounded-full border border-[#1A1A1A]/20 bg-white px-7 py-3.5 text-sm font-bold text-[#1A1A1A] transition-colors hover:border-[#1A1A1A]"
              >
                {content.secondary_button_label}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
