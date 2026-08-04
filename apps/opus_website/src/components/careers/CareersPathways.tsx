import {
  ArrowDown,
  BadgeCheck,
  BriefcaseBusiness,
  Camera,
  Cpu,
  GraduationCap,
  HeartHandshake,
  Lightbulb,
  MapPin,
  Palette,
  Plane,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'

const TEAMS = [
  { name: 'Technology', copy: 'The platform, infrastructure and tools behind every celebration.', icon: Cpu },
  { name: 'Product & Design', copy: 'Simple, beautiful experiences for couples, vendors and teams.', icon: Palette },
  { name: 'Operations', copy: 'The people and systems that make event days work in the real world.', icon: BriefcaseBusiness },
  { name: 'OpusStudio', copy: 'Photography, video, content and creative production with a local point of view.', icon: Camera },
  { name: 'Growth & Partnerships', copy: 'Bringing venues, vendors, brands and communities into the ecosystem.', icon: HeartHandshake },
  { name: 'Business & People', copy: 'Finance, customer experience, people operations and the foundations for scale.', icon: Users },
]

const PROCESS = [
  ['01', 'Application review', 'We assess your experience and answers against the role—not a generic keyword list.'],
  ['02', 'Introductory conversation', 'A focused conversation about the role, your story and the practical details.'],
  ['03', 'Role assessment', 'A proportionate exercise, portfolio review or working session when the role needs it.'],
  ['04', 'Team interview', 'Meet the people you would work with and explore how you make decisions.'],
  ['05', 'Final decision', 'We close the loop clearly, then move quickly into offer and onboarding.'],
]

const BENEFITS = [
  { title: 'Tools for the craft', copy: 'The equipment, software and practical support required to do excellent work.', icon: Sparkles },
  { title: 'Learning that compounds', copy: 'Mentorship, role-relevant learning and room to take on meaningful ownership.', icon: Lightbulb },
  { title: 'Field and event support', copy: 'Transport, travel and on-site support when the work moves beyond the office.', icon: Plane },
  { title: 'Rest and wellbeing', copy: 'Thoughtful leave, humane working rhythms and recovery after demanding event periods.', icon: HeartHandshake },
]

const FAQS = [
  ['How long does recruitment take?', 'Most processes take two to four weeks. The role page shows the actual stages, and we will tell you if timing changes.'],
  ['Can I apply for more than one role?', 'Yes. Apply where your experience genuinely fits; each application is reviewed separately.'],
  ['Do you accept internships and graduate applications?', 'Yes. Early-career roles are published alongside permanent openings, and you can also join the talent community.'],
  ['Will I receive feedback?', 'Every applicant receives a closing update. More detailed feedback depends on how far you progressed and the nature of the assessment.'],
  ['Does OpusFesta support remote work?', 'Some product and technology roles can be remote or hybrid. Operations and studio roles are often on-site or field-based; each vacancy is explicit.'],
  ['Does OpusFesta charge recruitment fees?', 'Never. OpusFesta does not ask candidates to pay application, interview, placement or processing fees.'],
]

export default function CareersPathways() {
  return (
    <>
      <section id="teams" className="mx-auto max-w-[1240px] scroll-mt-24 px-6 py-24 md:py-32">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <span className="mb-7 inline-block rounded-full border border-black/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">Teams</span>
            <h2 className="max-w-md text-4xl font-medium leading-[1.05] tracking-[-0.04em] md:text-6xl">Many crafts. One celebration.</h2>
            <p className="mt-7 max-w-md text-lg leading-8 text-black/60">You might build the product, make the film, run the venue or grow the partnership. The guest experience connects the work.</p>
            <a href="#open-roles" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold">Explore open roles <ArrowDown className="h-4 w-4" /></a>
          </div>
          <div className="grid gap-px overflow-hidden rounded-[32px] border border-black/10 bg-black/10 sm:grid-cols-2">
            {TEAMS.map(({ name, copy, icon: Icon }) => (
              <article key={name} className="min-h-64 bg-[#F4F4F0] p-7 md:p-9">
                <Icon className="h-6 w-6" strokeWidth={1.6} />
                <h3 className="mt-14 text-2xl font-medium tracking-tight">{name}</h3>
                <p className="mt-3 leading-7 text-black/55">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="process" className="bg-[#191919] text-white">
        <div className="mx-auto max-w-[1240px] px-6 py-24 md:py-32">
          <div className="mb-16 grid gap-8 md:grid-cols-2 md:items-end">
            <div>
              <span className="mb-7 inline-block rounded-full border border-white/25 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Our process</span>
              <h2 className="text-4xl font-medium leading-[1.05] tracking-[-0.04em] md:text-6xl">Clear from hello to offer.</h2>
            </div>
            <p className="max-w-lg text-lg leading-8 text-white/60 md:justify-self-end">The exact stages vary by role. We keep assessments relevant, communication direct and every final decision human.</p>
          </div>
          <ol className="border-t border-white/15">
            {PROCESS.map(([number, title, copy]) => (
              <li key={number} className="grid gap-3 border-b border-white/15 py-7 md:grid-cols-[80px_0.7fr_1fr] md:items-center md:gap-8">
                <span className="text-sm text-white/35">{number}</span>
                <h3 className="text-xl font-medium md:text-2xl">{title}</h3>
                <p className="max-w-xl leading-7 text-white/55">{copy}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 flex items-center gap-3 rounded-2xl border border-white/15 bg-white/5 p-5 text-sm text-white/70">
            <ShieldCheck className="h-5 w-5 shrink-0" /> Automated recommendations never make the final rejection decision.
          </div>
        </div>
      </section>

      <section id="benefits" className="mx-auto max-w-[1240px] px-6 py-24 md:py-32">
        <div className="mb-14 text-center">
          <span className="mb-7 inline-block rounded-full border border-black/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">How we support the work</span>
          <h2 className="mx-auto max-w-3xl text-4xl font-medium leading-[1.05] tracking-[-0.04em] md:text-6xl">Benefits shaped around real work.</h2>
          <p className="mx-auto mt-6 max-w-2xl leading-7 text-black/55">Exact benefits depend on role, contract and location. Your vacancy and offer will always state what applies.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map(({ title, copy, icon: Icon }, index) => (
            <article key={title} className={`min-h-72 rounded-[30px] p-7 ${['bg-[#E3F0D6]', 'bg-[#F4E5F3]', 'bg-[#F8E8CE]', 'bg-[#DDEBF1]'][index]}`}>
              <Icon className="h-6 w-6" strokeWidth={1.6} />
              <h3 className="mt-16 text-xl font-medium tracking-tight">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-black/60">{copy}</p>
            </article>
          ))}
        </div>
        <div className="mt-5 grid gap-4 rounded-[30px] border border-black/10 p-7 md:grid-cols-3 md:items-center md:p-9">
          <div className="flex items-center gap-3"><MapPin className="h-5 w-5" /><span className="font-medium">Tanzania-first</span></div>
          <div className="flex items-center gap-3"><GraduationCap className="h-5 w-5" /><span className="font-medium">Early careers welcome</span></div>
          <div className="flex items-center gap-3"><BadgeCheck className="h-5 w-5" /><span className="font-medium">Skills over pedigree</span></div>
        </div>
      </section>

      <section id="faq" className="border-t border-black/10 bg-white">
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
    </>
  )
}
