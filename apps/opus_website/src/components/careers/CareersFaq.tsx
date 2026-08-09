const FAQS = [
  ['How long does recruitment take?', 'Most processes take two to four weeks. The role page shows the actual stages, and we will tell you if timing changes.'],
  ['Can I apply for more than one role?', 'Yes. Apply where your experience genuinely fits; each application is reviewed separately.'],
  ['Do you accept internships and graduate applications?', 'Yes. Early-career roles are published alongside permanent openings, and you can also join the talent community.'],
  ['Will I receive feedback?', 'Every applicant receives a closing update. More detailed feedback depends on how far you progressed and the nature of the assessment.'],
  ['Does OpusFesta support remote work?', 'Some product and technology roles can be remote or hybrid. Operations and studio roles are often on-site or field-based; each vacancy is explicit.'],
  ['Does OpusFesta charge recruitment fees?', 'Never. OpusFesta does not ask candidates to pay application, interview, placement or processing fees.'],
]

export default function CareersFaq() {
  return (
    <section id="faq" className="bg-white">
      <div className="mx-auto max-w-[1100px] px-6">
        <hr className="border-black/10" />
      </div>
      <div className="mx-auto grid max-w-[1100px] gap-12 px-6 py-24 md:grid-cols-[0.65fr_1.35fr] md:py-32">
        <div>
          <span className="mb-7 inline-block rounded-full border border-black/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">Candidate FAQ</span>
          <h2 className="text-4xl font-medium tracking-[-0.04em] md:text-5xl">Good questions, answered plainly.</h2>
        </div>
        <div className="border-t border-black/15">
          {FAQS.map(([question, answer]) => (
            <details key={question} className="group border-b border-black/15 py-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-lg font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
                {question}<span className="text-2xl font-light transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="max-w-2xl pt-4 leading-7 text-black/60">{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
