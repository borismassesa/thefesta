import { Star } from 'lucide-react'
import {
  loadHomepageTestimonialsContent,
  type HomepageTestimonialItem,
  type HomepageTestimonialsContent,
} from '@/lib/cms/homepage-testimonials'
import { getLocale } from '@/lib/cms/locale'
import { assetPath } from '@/lib/asset-path'

// Match the testimonial card design from /websites — dark/purple alternating
// cards with a divider line, sans-serif quote and a role pill on the right.
// Variant is derived from the card's column index so cards alternate visually.
function TestimonialCard({ t, index }: { t: HomepageTestimonialItem; index: number }) {
  const isDark = index % 2 === 0
  return (
    <div
      className={`rounded-2xl p-4 sm:p-6 lg:p-7 flex flex-col shadow-sm ${
        isDark ? 'bg-[#1A1A1A] text-white' : 'bg-[var(--accent)] text-[#1A1A1A]'
      }`}
    >
      {/* Stars */}
      <div className="flex items-center gap-0.5 text-amber-400 mb-3 sm:mb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} size={16} className="fill-current" strokeWidth={0} />
        ))}
      </div>

      {/* Quote */}
      <p className="text-[13px] sm:text-[15px] lg:text-base font-semibold leading-snug flex-1">
        “{t.quote}”
      </p>

      {/* Divider */}
      <div className={`mt-4 sm:mt-5 h-px ${isDark ? 'bg-white/15' : 'bg-black/15'}`} />

      {/* Footer: avatar + name + location + role pill. The pill yields to the
          name on phones — in the 2-col marquee each card is only ~160px wide. */}
      <div className="mt-3 sm:mt-4 flex items-center gap-2.5 sm:gap-3">
        <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetPath(t.avatar)} alt="" className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] sm:text-sm font-bold leading-tight truncate">{t.name}</p>
          <p className={`text-xs mt-0.5 truncate ${isDark ? 'text-white/55' : 'text-[#1A1A1A]/60'}`}>
            {t.location}
          </p>
        </div>
        <span
          className={`hidden sm:inline-block shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold ${
            isDark
              ? 'bg-[var(--accent)] text-[var(--on-accent)]'
              : 'bg-white text-[#1A1A1A]'
          }`}
        >
          Couple
        </span>
      </div>
    </div>
  )
}

function VerticalMarquee({ items, reverse = false }: { items: HomepageTestimonialItem[]; reverse?: boolean }) {
  // Stamp each testimonial with its original index BEFORE tripling so the same
  // testimonial keeps its variant across marquee loop repeats.
  const stamped = items.map((t, idx) => ({ t, idx }))
  const tripled = [...stamped, ...stamped, ...stamped]
  return (
    <div className="relative h-full overflow-hidden">
      <div
        className="flex flex-col gap-3 sm:gap-4 lg:gap-6 animate-marquee-vertical"
        style={reverse ? { animationDirection: 'reverse' } : undefined}
      >
        {tripled.map(({ t, idx }, i) => (
          <TestimonialCard key={`${t.id}-${i}`} t={t} index={idx} />
        ))}
      </div>
    </div>
  )
}

export async function DigitalCardShowcase({
  content: contentProp,
}: {
  content?: HomepageTestimonialsContent
} = {}) {
  // Most pages share the homepage testimonial wall; the Guests & RSVPs page
  // passes its own CMS-managed content so it can be edited independently.
  const content = contentProp ?? (await loadHomepageTestimonialsContent(await getLocale()))
  return (
    <div className="py-10 lg:py-12 w-full">
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12 items-center">
          <div className="lg:pr-8 flex flex-col justify-center text-center lg:text-left">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif font-bold text-gray-900 mb-5 leading-tight">
              {content.headline}
            </h2>
            <p className="text-base lg:text-lg text-gray-600 leading-relaxed max-w-md mx-auto lg:mx-0">
              {content.description}
            </p>
          </div>

          <div
            className="grid grid-cols-2 gap-3 sm:gap-4 lg:gap-6 h-[360px] sm:h-[420px] lg:h-[480px]"
            style={{
              maskImage: 'linear-gradient(to bottom, transparent 0%, #000 3%, #000 97%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, #000 3%, #000 97%, transparent 100%)',
            }}
          >
            <VerticalMarquee items={content.column1} />
            <VerticalMarquee items={content.column2} reverse />
          </div>
        </div>
      </div>
    </div>
  )
}
