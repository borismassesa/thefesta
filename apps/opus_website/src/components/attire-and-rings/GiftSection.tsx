import { loadAttireGiftSectionContent } from '@/lib/cms/attire-gift-section'

export async function GiftSection() {
  const content = await loadAttireGiftSectionContent()

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-12 w-full">
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="lg:w-1/4 flex flex-col items-start justify-center">
          <h2 className="text-3xl lg:text-4xl font-serif font-medium text-gray-900 leading-tight mb-6">
            {content.heading}
          </h2>
          <button data-opus-button="neutral" data-opus-button-size="large" className="bg-white border-2 border-gray-900 text-gray-900 px-6 py-3 rounded-full font-medium hover:bg-gray-50 transition drop-shadow-sm">
            {content.cta_label}
          </button>
        </div>

        <div className="lg:w-3/4 grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
          {content.gifts.map((gift) => (
            <div key={gift.id} className="relative rounded-2xl overflow-hidden aspect-[4/3] group cursor-pointer shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={gift.img} alt={gift.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
              <div className="absolute bottom-4 left-4 right-4 z-10 text-white font-medium text-lg leading-tight">
                {gift.name}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
