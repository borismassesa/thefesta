import TalentCommunityForm from './TalentCommunityForm'

export default function CareersTalentCommunity() {
  return (
    <section id="talent-community" className="scroll-mt-24 bg-[#C9A0DC] text-[#171317]">
      <div className="mx-auto grid max-w-[1240px] gap-12 px-6 py-24 md:py-32 lg:grid-cols-[0.78fr_1.22fr] lg:gap-20">
        <div>
          <span className="mb-7 inline-block rounded-full border border-black/25 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">Talent community</span>
          <h2 className="text-4xl font-medium leading-[1.02] tracking-[-0.045em] md:text-6xl">The right person can arrive before the right role.</h2>
          <p className="mt-7 max-w-lg text-lg leading-8 text-black/65">Tell us what you do well and where you want to grow. This is not a job application; it is a consented profile our People team can revisit when something relevant opens.</p>
          <div className="mt-10 border-l border-black/25 pl-5 text-sm leading-6 text-black/60">
            We never charge recruitment fees. We do not sell candidate data. You choose whether to receive updates.
          </div>
        </div>
        <TalentCommunityForm />
      </div>
    </section>
  )
}
