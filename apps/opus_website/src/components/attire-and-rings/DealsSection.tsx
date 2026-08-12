import { Star, ChevronLeft, ChevronRight } from 'lucide-react'
import { loadAttireDealsContent } from '@/lib/cms/attire-deals'

export async function DealsSection() {
  const content = await loadAttireDealsContent()

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-12 w-full bg-[#faeddf]/40 my-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-serif font-medium text-gray-900">{content.heading}</h2>
          <div className="flex items-center gap-1 text-gray-600 bg-white px-3 py-1 rounded-full text-sm font-medium shadow-sm border border-gray-100">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            Fresh deals daily
          </div>
        </div>
        <div className="hidden md:flex gap-2">
          <button data-opus-button="control" className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center hover:bg-white bg-gray-50 transition cursor-not-allowed text-gray-400" aria-label="Previous">
            <ChevronLeft size={20} />
          </button>
          <button data-opus-button="control" className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center hover:bg-white bg-gray-50 transition drop-shadow-sm text-gray-700" aria-label="Next">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="flex -mx-4 px-4 lg:mx-0 lg:px-0 overflow-x-auto gap-4 snap-x hide-scrollbar">
        {content.items.map((deal) => (
          <div key={deal.id} className="flex-none w-64 md:w-72 snap-start group cursor-pointer bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden border border-gray-100 flex flex-col">
            <div className="aspect-[4/3] bg-gray-100 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={deal.img} alt={deal.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            </div>
            <div className="p-4 flex flex-col flex-grow">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-medium text-gray-900 line-clamp-1">{deal.name}</h3>
                <span className="flex items-center text-sm font-medium text-gray-700 whitespace-nowrap ml-2">
                  {deal.rating} <Star size={14} className="ml-1 fill-gray-900 border-none text-gray-900" />
                </span>
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-bold text-lg text-gray-900">{deal.price}</span>
                <span className="text-sm text-gray-500 line-through">{deal.old_price}</span>
                <span className="bg-green-100 text-green-800 text-xs font-bold px-1.5 py-0.5 rounded ml-auto">
                  {deal.discount}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-auto">{deal.badge_text}</p>
            </div>
          </div>
        ))}

        <div className="flex-none w-32 snap-start cursor-pointer flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-full border-2 border-gray-200 flex items-center justify-center hover:border-violet-600 hover:bg-violet-50 transition text-gray-500">
            <ChevronRight size={24} />
          </div>
          <span className="mt-3 text-sm font-medium text-gray-700">View more</span>
        </div>
      </div>
    </div>
  )
}
