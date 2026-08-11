import { Heart } from 'lucide-react'
import { loadAttireLocalShopsContent } from '@/lib/cms/attire-local-shops'

export async function LocalShops() {
  const content = await loadAttireLocalShopsContent()

  return (
    <div className="bg-[#f7f7f9] py-16 my-8">
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="lg:w-1/4 flex flex-col items-start justify-center">
            <span className="text-gray-500 font-medium mb-2 text-sm">{content.eyebrow}</span>
            <h2 className="text-3xl lg:text-4xl font-serif font-medium text-gray-900 leading-tight mb-8">
              {content.heading}
            </h2>
            <button data-opus-button="neutral" data-opus-button-size="large" className="bg-white border text-gray-900 border-gray-300 px-6 py-3 rounded-full font-medium hover:bg-gray-50 transition drop-shadow-sm shadow-sm ring-1 ring-gray-900">
              {content.cta_label}
            </button>
          </div>

          <div className="lg:w-3/4 grid grid-cols-1 md:grid-cols-3 gap-6">
            {content.shops.map((shop) => (
              <div key={shop.id} className="group relative cursor-pointer flex flex-col h-full bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="relative aspect-[4/5] overflow-hidden bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={shop.img} alt={shop.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <button data-opus-button="control" className="absolute top-3 right-3 p-2 bg-white rounded-full shadow-sm text-gray-700 hover:text-red-500 transition-colors z-10" aria-label="Favourite">
                    <Heart size={18} />
                  </button>
                </div>

                <div className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-gray-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={shop.avatar} alt="Shop avatar" className="w-full h-full object-cover" />
                  </div>
                  <span className="font-medium text-gray-900 flex-1 truncate">{shop.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
