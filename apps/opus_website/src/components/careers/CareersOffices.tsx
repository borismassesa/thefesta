import Image from 'next/image'
import { ArrowUpRight } from 'lucide-react'
import { CAREERS_OFFICES } from '@/lib/careers'

export default function CareersOffices() {
  return (
    <section className="mx-auto mt-12 max-w-[1440px] border-t border-black/10 px-6 py-24 text-center">
      <div className="mb-16">
        <span className="mb-8 inline-block rounded-full border border-black/20 px-3 py-1 text-xs font-semibold uppercase tracking-widest">
          Where we work
        </span>
        <h2 className="text-4xl font-medium tracking-tight md:text-[3.5rem]">
          Rooted in Tanzania, open to the region.
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-12 text-left md:grid-cols-2 lg:grid-cols-4">
        {CAREERS_OFFICES.map((office) => (
          <div key={office.id}>
            <div className="relative mb-6 h-[280px] overflow-hidden rounded-[40px]">
              <Image
                src={office.image}
                alt={office.name}
                fill
                sizes="(max-width: 768px) 100vw, 340px"
                className="object-cover"
              />
            </div>
            <h3 className="mb-3 text-2xl font-medium">{office.name}</h3>
            <p className="mb-6 h-[48px] whitespace-pre-line leading-relaxed text-gray-700">
              {office.address}
            </p>
            {office.mapUrl && (
              <a
                href={office.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-black/20 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-black/5"
              >
                View in map <ArrowUpRight className="h-4 w-4" />
              </a>
            )}
          </div>
        ))}
      </div>

      <div className="mt-24 rounded-[40px] bg-[#1A1A1A] px-8 py-16 text-white md:px-16">
        <h3 className="mx-auto mb-4 max-w-2xl text-3xl font-medium tracking-tight md:text-5xl">
          Do not see your role?
        </h3>
        <p className="mx-auto mb-10 max-w-xl leading-relaxed text-white/70">
          Tell us what you would build here. We read every open application and keep
          the good ones close for the next season.
        </p>
        <a
          href="#talent-community"
          className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3 text-[15px] font-medium text-[#1A1A1A] transition-colors hover:bg-white/90"
        >
          Join our talent community <ArrowUpRight className="h-4 w-4" />
        </a>
      </div>
    </section>
  )
}
