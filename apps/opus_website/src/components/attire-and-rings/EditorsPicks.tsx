import { Play, Heart } from 'lucide-react'
import { loadAttireEditorsPicksContent, type AttirePickItem } from '@/lib/cms/attire-editors-picks'

function PickCard({ pick }: { pick: AttirePickItem }) {
  return (
    <div className="relative overflow-hidden group cursor-pointer aspect-square">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pick.img} alt="Editor pick" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
      {pick.has_heart && (
        <button data-opus-button="control" className="absolute top-3 right-3 w-9 h-9 bg-white rounded-full shadow-sm flex items-center justify-center text-gray-700 hover:text-red-500 transition-colors z-10" aria-label="Favourite">
          <Heart size={16} />
        </button>
      )}
      {pick.price && (
        <span className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-full text-xs font-bold text-gray-900 shadow-sm z-10">
          {pick.price}
        </span>
      )}
      {pick.has_video && (
        <div className="absolute bottom-3 right-3 bg-white/90 backdrop-blur text-gray-900 w-8 h-8 rounded-full shadow-md flex items-center justify-center">
          <Play size={14} className="ml-0.5" />
        </div>
      )}
    </div>
  )
}

export async function EditorsPicks() {
  const content = await loadAttireEditorsPicksContent()

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-12 w-full">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        <div className="col-span-2 lg:col-span-1 flex flex-col justify-start lg:pr-4">
          <span className="text-gray-500 font-medium mb-2 uppercase text-xs tracking-wider">{content.eyebrow}</span>
          <h2 className="text-3xl lg:text-4xl font-serif font-medium text-gray-900 mb-6 leading-tight">
            {content.heading}
          </h2>
          <a href="#" className="font-medium text-gray-900 hover:text-gray-600 underline underline-offset-4 decoration-2 decoration-gray-900 flex items-center gap-1 group transition-colors w-fit">
            {content.cta_label}
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </a>
        </div>

        {content.row1.map((pick) => (
          <PickCard key={pick.id} pick={pick} />
        ))}

        {content.row2.map((pick) => (
          <PickCard key={pick.id} pick={pick} />
        ))}

        <div className="col-span-2 lg:col-span-1 flex items-center text-gray-700 text-base lg:text-lg leading-relaxed lg:pl-2">
          {content.footer_text}
        </div>
      </div>
    </div>
  )
}
