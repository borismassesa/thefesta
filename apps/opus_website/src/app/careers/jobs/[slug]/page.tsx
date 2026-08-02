import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock3, MapPin } from 'lucide-react'
import JsonLd from '@/components/JsonLd'
import { formatCareerDate, formatSalaryRange } from '@/lib/careers'
import { loadOpenJobBySlug } from '@/lib/careers-db'
import { toggleCandidateSavedJob } from '../../candidate/actions'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const job = await loadOpenJobBySlug(slug, (await searchParams).lang === 'sw' ? 'sw' : 'en')
  if (!job) return { title: 'Role not found | OpusFesta' }
  return {
    title: `${job.title} | Careers at OpusFesta`,
    description: job.summary,
    openGraph: { title: `${job.title} | OpusFesta Careers`, description: job.summary, url: `/careers/jobs/${job.slug}` },
  }
}

export default async function JobDetailPage({ params, searchParams }: Props) {
  const { slug } = await params
  const locale = (await searchParams).lang === 'sw' ? 'sw' : 'en'
  const job = await loadOpenJobBySlug(slug, locale)
  if (!job) notFound()

  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://opusfesta.com'
  const schema = {
    '@context': 'https://schema.org', '@type': 'JobPosting', title: job.title,
    description: job.description, datePosted: job.openedAt, validThrough: job.closingDate ?? undefined,
    employmentType: job.employmentType.toUpperCase().replaceAll(' ', '_'),
    hiringOrganization: { '@type': 'Organization', name: 'OpusFesta', sameAs: base },
    jobLocationType: job.workplaceType === 'Remote' ? 'TELECOMMUTE' : undefined,
    jobLocation: job.workplaceType === 'Remote' ? undefined : { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: job.location, addressCountry: 'TZ' } },
  }

  return (
    <main>
      <JsonLd data={schema} />
      <header className="border-b border-black/10 bg-[#F4F4F0]">
        <div className="mx-auto max-w-[1200px] px-6 py-12 md:py-20">
          <Link href={`/careers?lang=${locale}#open-roles`} className="inline-flex items-center gap-2 text-sm font-semibold text-black/55 hover:text-black"><ArrowLeft className="h-4 w-4" /> All open roles</Link>
          <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_340px] lg:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-black/45">{job.department} · {job.brand}</p>
              <h1 className="mt-5 max-w-4xl text-5xl font-medium leading-[0.98] tracking-[-0.055em] md:text-7xl">{job.title}</h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-black/60">{job.summary}</p>
            </div>
            <Link href={`/careers/jobs/${job.slug}/apply`} className="inline-flex min-h-13 items-center justify-center gap-2 rounded-full bg-black px-7 text-sm font-semibold text-white">Apply for this role <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1200px] gap-14 px-6 py-20 lg:grid-cols-[1fr_330px] lg:gap-20 lg:py-28">
        <div className="space-y-16">
          <ContentSection title="Why this role exists"><p className="text-lg leading-8 text-black/65">{job.description}</p></ContentSection>
          <ContentSection title="What you will own"><BulletList items={job.responsibilities} /></ContentSection>
          <ContentSection title="What we are looking for"><BulletList items={job.requirements} /></ContentSection>
          {job.preferredQualifications.length > 0 && <ContentSection title="Helpful, not essential"><BulletList items={job.preferredQualifications} /></ContentSection>}
          {job.workingConditions.length > 0 && <ContentSection title="Working conditions"><BulletList items={job.workingConditions} /></ContentSection>}
          <ContentSection title="Your hiring journey">
            <ol className="border-t border-black/10">{job.recruitmentProcess.map((step, index) => <li key={step} className="grid grid-cols-[42px_1fr] border-b border-black/10 py-4"><span className="text-xs text-black/35">{String(index + 1).padStart(2, '0')}</span><span className="font-medium">{step}</span></li>)}</ol>
          </ContentSection>
          <section className="rounded-[28px] bg-[#E3F0D6] p-7 md:p-9"><h2 className="text-2xl font-medium tracking-tight">A fair, respectful process</h2><p className="mt-4 leading-7 text-black/65">We hire for skill, judgement and contribution. We do not discriminate on the basis of race, ethnicity, religion, gender, disability, age or any other protected characteristic. Tell us if you need an accommodation at any stage.</p><p className="mt-4 text-sm font-semibold">OpusFesta never charges candidates recruitment fees.</p></section>
        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_18px_50px_rgba(0,0,0,0.06)]">
            <h2 className="text-lg font-medium">Role at a glance</h2>
            <dl className="mt-5 divide-y divide-black/10 text-sm">
              <Fact icon={MapPin} label="Location" value={job.location} />
              <Fact icon={Clock3} label="Workplace" value={job.workplaceType} />
              <Fact icon={CalendarDays} label="Employment" value={job.employmentType} />
              <Fact label="Experience" value={job.experienceLevel} />
              {job.closingDate && <Fact label="Apply by" value={formatCareerDate(job.closingDate)} />}
              {job.showSalary && job.salaryMinTzs !== null && job.salaryMaxTzs !== null && <Fact label="Monthly range" value={formatSalaryRange(job.salaryMinTzs, job.salaryMaxTzs)} />}
              <Fact label="Reference" value={`OF-${job.id.slice(0, 8).toUpperCase()}`} />
            </dl>
            <Link href={`/careers/jobs/${job.slug}/apply`} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-black px-5 text-sm font-semibold text-white">Apply now <ArrowRight className="h-4 w-4" /></Link>
            <form action={toggleCandidateSavedJob.bind(null, job.id, 'save')}><button className="mt-2 min-h-11 w-full rounded-full border border-black/15 px-5 text-sm font-semibold">Save to candidate portal</button></form>
          </div>
        </aside>
      </div>
    </main>
  )
}

function ContentSection({ title, children }: { title: string; children: React.ReactNode }) { return <section><h2 className="mb-6 text-3xl font-medium tracking-[-0.03em] md:text-4xl">{title}</h2>{children}</section> }
function BulletList({ items }: { items: string[] }) { return <ul className="space-y-4">{items.map((item) => <li key={item} className="flex gap-3 leading-7 text-black/65"><Check className="mt-1.5 h-4 w-4 shrink-0" />{item}</li>)}</ul> }
function Fact({ icon: Icon, label, value }: { icon?: typeof MapPin; label: string; value: string }) { return <div className="flex gap-3 py-4">{Icon ? <Icon className="mt-0.5 h-4 w-4 text-black/40" /> : <span className="mt-1 h-2 w-2 rounded-full bg-black/25" />}<div><dt className="text-xs text-black/45">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div></div> }
