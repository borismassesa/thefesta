import { BellRing, Lock, ShieldCheck } from 'lucide-react'
import TalentCommunityForm from './TalentCommunityForm'

const PROMISES = [
  [ShieldCheck, 'We never charge recruitment fees.'],
  [Lock, 'We do not sell candidate data.'],
  [BellRing, 'You choose whether to receive updates.'],
] as const

export default function CareersTalentCommunity() {
  return (
    <section id="talent-community" className="scroll-mt-24 border-t border-black/10 bg-[#E3D3EE] text-[#171317]">
      <div className="mx-auto grid max-w-[1240px] gap-12 px-6 py-24 md:py-32 lg:grid-cols-[0.82fr_1.18fr] lg:gap-20">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <span className="mb-7 inline-block rounded-full border border-black/25 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">Talent community</span>
          <h2 className="text-4xl font-medium leading-[1.02] tracking-[-0.045em] md:text-6xl">The right person can arrive before the right role.</h2>
          <p className="mt-7 max-w-lg text-lg leading-8 text-black/65">Tell us what you do well and where you want to grow. This is not a job application; it is a consented profile our People team can revisit when something relevant opens.</p>
          <ul className="mt-10 space-y-3 border-t border-black/15 pt-8">
            {PROMISES.map(([Icon, copy]) => (
              <li key={copy} className="flex items-center gap-3 text-sm leading-6 text-black/70">
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                {copy}
              </li>
            ))}
          </ul>
        </div>
        <TalentCommunityForm />
      </div>
    </section>
  )
}
