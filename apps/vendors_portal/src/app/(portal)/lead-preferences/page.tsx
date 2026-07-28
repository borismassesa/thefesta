import { ChevronRight, Edit3 } from 'lucide-react'
import { redirectProductVendors } from '@/lib/storefront/vertical-guard'

const SECTIONS = [
  {
    title: "Target couple's budget",
    copy: 'Help us match you with couples typically planning in your range.',
  },
  {
    title: 'Your pricing',
    copy: 'Couples are more likely to inquire when vendors are transparent.',
  },
  {
    title: 'Your calendar',
    copy: "Block dates you're unavailable so we only send relevant inquiries.",
  },
  {
    title: 'Your style',
    copy: "Pick the styles you shoot best — we'll match lookalike couples.",
  },
  {
    title: 'Venue type',
    copy: 'Where do you do your strongest work? Beaches, lodges, gardens?',
  },
  {
    title: 'Your personality',
    copy: 'Let couples self-select the working vibe that fits yours.',
  },
  {
    title: 'Listing details',
    copy: 'Confirm your markets and travel radius so search finds you.',
  },
  {
    title: 'Deliverables & packages',
    copy: "Show what's included so quotes come in already aligned.",
  },
  {
    title: 'Say hello, first',
    copy: 'An auto-reply that greets couples within seconds of inquiring.',
  },
]

export default async function LeadPreferencesPage() {
  // These preferences tune which directory leads reach the vendor. Product
  // vendors don't receive directory leads, so there's nothing here to tune.
  await redirectProductVendors()

  return (
    <div className="p-8 pb-12">
      <div className="max-w-[1100px] mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Your lead preferences
          </h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl leading-relaxed">
            Describe your ideal couple. We&apos;ll use this to qualify inquiries so your
            calendar stays full of the right fit.
          </p>
        </div>

        <div className="sticky top-0 z-10 bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] px-5 py-3 flex items-center justify-between mb-6">
          <nav className="flex gap-1 text-sm font-medium overflow-x-auto">
            {['Budget', 'Calendar', 'Style', 'Storefront', 'Auto-reply'].map((l) => (
              <button
                key={l}
                type="button"
                className="px-3 py-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-50 whitespace-nowrap transition-colors"
              >
                {l}
              </button>
            ))}
          </nav>
          <button
            type="button"
            className="bg-gray-900 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-gray-800 transition-colors"
          >
            Save changes
          </button>
        </div>

        <div className="space-y-3">
          {SECTIONS.map((s) => (
            <section
              key={s.title}
              className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-5 flex items-start justify-between gap-4 hover:border-gray-200 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <h2 className="text-[15px] font-semibold text-gray-900">{s.title}</h2>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">{s.copy}</p>
              </div>
              <button
                type="button"
                aria-label={`Edit ${s.title}`}
                className="shrink-0 inline-flex items-center gap-1.5 border border-gray-200 text-gray-700 text-sm font-semibold px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <Edit3 className="w-4 h-4 text-gray-400" />
                Edit
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </button>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
