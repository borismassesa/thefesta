import Image from 'next/image'
import Link from 'next/link'
import { ArrowDown, ArrowUpRight } from 'lucide-react'

// Marquee strip. Rendered twice back to back so the -50% keyframe in
// globals.css loops seamlessly.
const IMAGES = [
  '/assets/images/mauzo_crew.jpg',
  '/assets/images/couples_together.jpg',
  '/assets/images/beautiful_bride.jpg',
  '/assets/images/churchcouples.jpg',
  '/assets/images/flowers_pinky.jpg',
  '/assets/images/coupleswithpiano.jpg',
  '/assets/images/bridewithumbrella.jpg',
]

// Alternating silhouettes: arch tops and full pills, echoing the tall rounded
// shapes used further down the page.
const SHAPES = [
  'w-[240px] md:w-[340px] h-[300px] md:h-[440px] rounded-t-[110px] md:rounded-t-[170px]',
  'w-[200px] md:w-[280px] h-[240px] md:h-[340px] rounded-[80px] md:rounded-[120px] mb-6 md:mb-10',
  'w-[220px] md:w-[300px] h-[280px] md:h-[400px] rounded-t-[90px] md:rounded-t-[140px]',
  'w-[250px] md:w-[350px] h-[300px] md:h-[420px] rounded-[90px] md:rounded-[140px] mb-4 md:mb-8',
  'w-[190px] md:w-[260px] h-[260px] md:h-[360px] rounded-t-[80px] md:rounded-t-[120px]',
]

function Strip({ ariaHidden }: { ariaHidden?: boolean }) {
  return (
    <div className="flex h-full items-end gap-6 pr-6 md:gap-10 md:pr-10" aria-hidden={ariaHidden}>
      {IMAGES.map((src, i) => (
        <div
          key={`${src}-${ariaHidden ? 'b' : 'a'}`}
          className={`relative shrink-0 overflow-hidden bg-gray-200 ${SHAPES[i % SHAPES.length]}`}
        >
          <Image
            src={src}
            alt=""
            fill
            sizes="(max-width: 768px) 350px, 480px"
            className="object-cover"
            priority={i < 2 && !ariaHidden}
          />
        </div>
      ))}
    </div>
  )
}

export default function CareersHero() {
  return (
    <section className="w-full overflow-hidden bg-[#F4F4F0]">
      <div className="mx-auto max-w-[1440px] px-6 pt-10 md:pt-16">
        <div className="mb-10 grid border-x border-black/10 md:mb-14 md:grid-cols-[1.08fr_0.92fr]">
          <div className="border-b border-black/10 px-6 py-10 md:border-b-0 md:border-r md:px-10 md:py-16 lg:px-14">
            <h1 className="max-w-[720px] text-[2.9rem] font-medium leading-[0.98] tracking-[-0.055em] md:text-[5.25rem]">
              Build the way Tanzania celebrates.
            </h1>
          </div>
          <div className="flex flex-col justify-between px-6 py-10 md:px-10 md:py-16 lg:px-14">
            <p className="max-w-[470px] text-[17px] leading-8 text-[#1A1A1A]">
              Join the team building technology, experiences, media and operations for events across Tanzania—and, from here, the region.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <a
                href="#open-roles"
                className="inline-flex w-max items-center gap-2 rounded-full bg-[#1A1A1A] px-6 py-3 text-[15px] font-medium text-white transition-colors hover:bg-black"
              >
                View open roles <ArrowDown className="h-4 w-4" />
              </a>
              <Link
                href="/careers/talent-community"
                className="inline-flex w-max items-center gap-2 rounded-full border border-black/20 px-6 py-3 text-[15px] font-medium transition-colors hover:bg-black/5"
              >
                Join our talent community <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="group relative h-[360px] w-full overflow-hidden md:h-[520px]">
        <div className="flex h-full w-max animate-marquee hover:[animation-play-state:paused] motion-reduce:animate-none">
          <Strip />
          <Strip ariaHidden />
        </div>
      </div>
      <div className="mx-auto mt-10 grid max-w-[1440px] grid-cols-2 border-x border-black/10 md:mt-14 md:grid-cols-4">
        {[
          ['Tanzania-first', 'Built around how events really work here'],
          ['One team', 'Product, studio and operations together'],
          ['Real impact', 'Work visible from your first week'],
          ['Regional ambition', 'Building from Tanzania, outward'],
        ].map(([title, copy], index) => (
          <div key={title} className={`min-h-36 p-5 md:p-7 ${index % 2 === 0 ? 'border-r border-black/10' : ''} ${index < 2 ? 'border-b border-black/10 md:border-b-0' : ''} ${index === 1 ? 'md:border-r' : ''}`}>
            <p className="text-xl font-medium tracking-[-0.02em] md:text-2xl">{title}</p>
            <p className="mt-3 max-w-[220px] text-sm leading-6 text-black/50">{copy}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
