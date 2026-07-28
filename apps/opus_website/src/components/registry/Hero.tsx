import Link from 'next/link'

const CHECKLIST_IMG = 'https://images.unsplash.com/photo-1630527152680-500b5453fb04?auto=format&fit=crop&w=1200&q=80'
const CASH_FUNDS_IMG = 'https://images.unsplash.com/photo-1603477849227-705c424d1d80?auto=format&fit=crop&w=1200&q=80'

export function Hero() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        <div className="overflow-hidden rounded-2xl bg-[#f3ecf7] shadow-sm md:rounded-3xl lg:col-span-2">
          <div className="grid h-full grid-cols-1 md:grid-cols-[3fr_2fr]">
            <div className="flex flex-col items-start justify-center px-8 py-12 md:px-10 md:py-16 lg:px-14">
              <h1 className="mb-5 text-3xl font-serif font-medium leading-tight text-gray-900 md:text-4xl lg:text-5xl">
                First stop: your registry checklist
              </h1>
              <p className="mb-7 text-base leading-relaxed text-gray-700 lg:text-lg">
                Browse curated collections and add your favourite gifts — guests give exactly what you need.
              </p>
              <Link
                href="/registry/kitchen-dining"
                className="inline-flex items-center rounded-full bg-gray-900 px-6 py-3 font-medium text-white shadow-sm transition hover:bg-gray-800"
              >
                Start browsing
              </Link>
            </div>
            <div className="relative h-64 md:h-auto md:min-h-[360px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={CHECKLIST_IMG} alt="Table set for a couple" className="absolute inset-0 h-full w-full object-cover" />
            </div>
          </div>
        </div>

        <Link
          href="/registry/gifts-keepsakes"
          className="group relative block aspect-[4/3] cursor-pointer overflow-hidden rounded-2xl shadow-sm md:rounded-3xl lg:aspect-auto lg:min-h-[360px]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={CASH_FUNDS_IMG}
            alt="Honeymoon destination"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
          <div className="absolute bottom-6 left-6 right-6 z-10 text-white">
            <h3 className="mb-1 text-xl font-serif font-medium leading-tight md:text-2xl">
              Think outside the box with cash funds
            </h3>
            <span className="text-sm font-medium underline underline-offset-4">Explore cash funds</span>
          </div>
        </Link>
      </div>
    </div>
  )
}
