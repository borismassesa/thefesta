'use client'

import { motion } from 'motion/react'
import { ease, duration as dur, drift } from '@/lib/motion'
import type { CtaContent } from '@/lib/cms/cta'

export default function CtaClient({ content }: { content: CtaContent }) {
  const fadeUp = (delay: number, dy = drift.sm) => ({
    initial: { opacity: 0, y: dy },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.1 },
    transition: { duration: dur.md, delay, ease },
  })

  return (
    <section className="px-4 sm:px-6 md:px-10 max-w-6xl mx-auto mb-14 sm:mb-20 md:mb-24">
      <motion.div
        className="rounded-[var(--opus-radius-large)] sm:rounded-[var(--opus-radius-xlarge)] md:rounded-[var(--opus-radius-xlarge)] overflow-hidden relative min-h-[500px] sm:min-h-[560px] md:min-h-[600px] flex flex-col items-center justify-center text-center py-16 sm:py-20 md:py-24 px-6 sm:px-10 md:px-16"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.1 }}
        transition={{ duration: dur.md, ease }}
      >
        {/* Full bleed photo */}
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={content.background_image_url}
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/40" />
        </div>

        {/* Content — staggered */}
        <div className="relative z-10 flex flex-col items-center">
          <motion.span
            className="text-[var(--accent)] text-xs font-bold uppercase tracking-widest mb-6 block"
            {...fadeUp(0.1)}
          >
            {content.eyebrow}
          </motion.span>

          <motion.h2
            className="text-[2.4rem] sm:text-5xl md:text-6xl lg:text-[88px] font-black tracking-tighter uppercase leading-[1.0] sm:leading-[0.92] md:leading-[0.85] text-white mb-5 sm:mb-6 max-w-4xl"
            {...fadeUp(0.2, drift.md)}
          >
            {content.headline_line_1}
            <br />
            {content.headline_line_2}
            <br />
            <span className="text-[var(--accent)]">{content.headline_line_3}</span>
          </motion.h2>

          <motion.p
            className="text-white/90 font-medium leading-relaxed mb-8 sm:mb-10 max-w-xs sm:max-w-sm text-sm sm:text-base md:text-lg"
            {...fadeUp(0.3)}
          >
            {content.subheadline}
          </motion.p>

          <motion.a
            href={content.cta_href}
            className="w-full sm:w-auto inline-block bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--on-accent)] px-8 sm:px-10 py-4 sm:py-5 rounded-full font-bold text-base sm:text-lg transition-colors"
            {...fadeUp(0.38)}
          >
            {content.cta_label}
          </motion.a>

          <motion.p
            className="text-white/70 text-xs font-medium mt-4"
            {...fadeUp(0.44)}
          >
            {content.footnote}
          </motion.p>
        </div>
      </motion.div>
    </section>
  )
}
