'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check } from 'lucide-react'
import Logo from '@/components/ui/Logo'
import { LocaleToggle } from '@/components/LocaleToggle'
import { OnboardHeading } from '@/components/onboard/OnboardHeading'
import { useOnboardingDraft } from '@/lib/onboarding/draft'
import { VERTICAL_OPTIONS, type VendorVertical } from '@/lib/onboarding/verticals'
import { pick } from '@/lib/onboarding/localize'
import { useOnboardT } from '@/lib/onboarding/strings'
import { cn } from '@/lib/utils'

// Step zero of onboarding. Everything downstream branches off this answer, so
// it is asked before the business category rather than inferred from it: a
// vendor who picks "Décor & gifts" from a flat list has no way of knowing they
// just opted out of the vendor directory and into the gift registry.
//
// Changing the answer clears `categoryId` — the previously chosen category
// almost certainly belongs to the vertical they just left, and carrying it
// forward would submit a mismatched vertical/category pair.
export default function VerticalChooserClient() {
  const router = useRouter()
  const { draft, update, hydrated } = useOnboardingDraft()
  const { locale } = useOnboardT()

  const choose = (id: VendorVertical) => {
    update(
      draft.vertical === id
        ? { vertical: id }
        : { vertical: id, categoryId: null, customCategoryLabel: '' },
    )
    router.push('/onboard/category')
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="bg-white border-b border-gray-100">
        <div className="px-6 lg:px-12 py-4 flex items-center justify-between">
          <Link href="/" aria-label="OpusFesta" className="shrink-0">
            <Logo className="h-7 w-auto text-gray-900" />
          </Link>
          <LocaleToggle />
        </div>
      </header>

      <main className="px-6 lg:px-12 py-10 lg:py-14">
        <div className="max-w-5xl mx-auto pb-24">
          <OnboardHeading
            title={pick(
              locale,
              'What do you offer couples?',
              'Unatoa nini kwa wanandoa?',
            )}
            description={pick(
              locale,
              'This decides where your business appears on OpusFesta and what we ask you next. Pick one. If you do more than one, you can add another business later.',
              'Hii inaamua biashara yako itaonekana wapi kwenye OpusFesta na tutakuuliza nini baadaye. Chagua moja tu. Ukifanya zaidi ya moja, unaweza kuongeza biashara nyingine baadaye.',
            )}
          />

          <div className="grid gap-4 md:grid-cols-3">
            {VERTICAL_OPTIONS.map((option) => {
              const Icon = option.icon
              const selected = hydrated && draft.vertical === option.id
              const examples = locale === 'sw' ? option.examplesSw : option.examples

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => choose(option.id)}
                  aria-pressed={selected}
                  className={cn(
                    'group relative flex flex-col rounded-2xl border bg-white p-6 text-left transition-all',
                    'shadow-[0_1px_2px_-1px_rgba(0,0,0,0.06),0_2px_8px_-3px_rgba(0,0,0,0.08)]',
                    'hover:-translate-y-0.5 hover:shadow-[0_4px_20px_-8px_rgba(0,0,0,0.18)]',
                    selected
                      ? 'border-gray-900 ring-1 ring-gray-900'
                      : 'border-gray-200 hover:border-gray-400',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'inline-flex size-11 items-center justify-center rounded-xl transition-colors',
                      selected ? 'bg-[#1A1A1A] text-white' : 'bg-gray-100 text-gray-900',
                    )}
                  >
                    {selected ? (
                      <Check className="h-5 w-5" strokeWidth={3} />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </span>

                  <span className="mt-4 block text-lg font-semibold leading-snug text-gray-900">
                    {pick(locale, option.label, option.labelSw)}
                  </span>
                  <span className="mt-2 block text-sm leading-relaxed text-gray-600">
                    {pick(locale, option.description, option.descriptionSw)}
                  </span>

                  <span className="mt-4 flex flex-wrap gap-1.5">
                    {examples.map((example) => (
                      <span
                        key={example}
                        className="rounded-full bg-[#9FE870]/25 px-2.5 py-1 text-xs font-medium text-[#3f6b1f]"
                      >
                        {example}
                      </span>
                    ))}
                  </span>

                  <span className="mt-5 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
                    <span className="text-xs leading-snug text-gray-500">
                      {pick(locale, option.surface, option.surfaceSw)}
                    </span>
                    <ArrowRight
                      aria-hidden
                      className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                </button>
              )
            })}
          </div>

          <p className="mt-6 text-sm text-gray-500">
            {pick(
              locale,
              'Not sure? Pick the one that describes most of your income. Our team can move you after review.',
              'Huna uhakika? Chagua ile inayoelezea sehemu kubwa ya mapato yako. Timu yetu inaweza kukuhamisha baada ya ukaguzi.',
            )}
          </p>
        </div>
      </main>
    </div>
  )
}
