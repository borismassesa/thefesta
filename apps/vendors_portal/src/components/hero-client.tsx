'use client'

import { useState, useRef, useEffect } from 'react'
import { Play, Pause } from 'lucide-react'
import { motion } from 'motion/react'
import { ease, duration as dur, drift } from '@/lib/motion'
import type { HeroContent } from '@/lib/cms/hero'

export default function HeroClient({ content }: { content: HeroContent }) {
  const [isPlaying, setIsPlaying] = useState(true)
  const [mounted, setMounted] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const timeout = setTimeout(() => setMounted(true), 300)
    document.fonts.ready
      .then(() => { clearTimeout(timeout); setMounted(true) })
      .catch(() => { /* font load failure — timeout fallback handles mount */ })
    return () => clearTimeout(timeout)
  }, [])

  const togglePlay = () => {
    if (!videoRef.current) return
    if (isPlaying) videoRef.current.pause()
    else videoRef.current.play().catch(() => { /* play blocked by browser policy */ })
  }

  const anim = (delay: number, dy = drift.md) => ({
    initial: { opacity: 0, y: dy },
    animate: mounted ? { opacity: 1, y: 0 } : { opacity: 0, y: dy },
    transition: { duration: dur.lg, delay, ease },
  })

  return (
    <section className="px-4 sm:px-6 pt-20 sm:pt-24 md:pt-32 pb-12 sm:pb-16 md:pb-20 text-center max-w-6xl mx-auto">

      <h1 className="text-[1.6rem] sm:text-5xl md:text-6xl lg:text-[72px] font-black uppercase tracking-tighter leading-[1.05] md:leading-[0.92] lg:leading-[0.9] max-w-5xl mx-auto text-[#1A1A1A]">
        {[content.headline_line_1, content.headline_line_2, content.headline_line_3]
          .filter((line) => line && line.trim().length > 0)
          .map((line, i) => (
            <motion.span key={i} className="block" {...anim(0.08 + i * 0.08, drift.lg)}>
              {line}
            </motion.span>
          ))}
      </h1>

      <motion.p
        className="mt-8 sm:mt-10 text-base sm:text-lg md:text-xl lg:text-2xl text-gray-600 max-w-xl sm:max-w-2xl mx-auto font-medium leading-relaxed px-1 sm:px-0"
        {...anim(0.26, drift.sm)}
      >
        {content.subheadline}
      </motion.p>

      <motion.div
        className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-3 sm:mt-10 sm:gap-x-6"
        {...anim(0.36, drift.sm)}
      >
        <a
          href={content.primary_cta_href}
          className="bg-(--accent) hover:bg-(--accent-hover) text-(--on-accent) px-6 sm:px-7 py-3.5 rounded-full font-bold text-[15px] transition-colors whitespace-nowrap"
        >
          {content.primary_cta_label}
        </a>
        <a
          href={content.secondary_cta_href}
          className="text-[#1A1A1A] font-bold text-[15px] underline underline-offset-4 hover:text-gray-600 transition-colors whitespace-nowrap"
        >
          {content.secondary_cta_label}
        </a>
      </motion.div>

      <motion.div
        className="mt-10 sm:mt-14 md:mt-16 rounded-[var(--opus-radius-medium)] sm:rounded-[var(--opus-radius-large)] md:rounded-[var(--opus-radius-xlarge)] overflow-hidden w-full mx-auto relative aspect-4/5 sm:aspect-4/3 md:aspect-video bg-gray-100 shadow-2xl"
        {...anim(0.48, drift.md)}
      >
        {content.media_type === 'video' ? (
          <>
            <video
              ref={videoRef}
              key={content.media_url}
              src={content.media_url}
              autoPlay
              loop
              muted
              playsInline
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              className="w-full h-full object-cover"
            />
            <button data-opus-button="control"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause video' : 'Play video'}
              className="absolute top-4 right-4 sm:top-6 sm:right-6 w-9 h-9 sm:w-10 sm:h-10 bg-white rounded-full flex items-center justify-center cursor-pointer shadow-sm text-[#1A1A1A] hover:bg-gray-50 transition-colors z-10"
            >
              {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
            </button>
          </>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={content.media_url} alt="" className="w-full h-full object-cover" />
        )}
      </motion.div>

    </section>
  )
}
