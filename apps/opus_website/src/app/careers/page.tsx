import type { Metadata } from 'next'
import CareersHero from '@/components/careers/CareersHero'
import CareersStory from '@/components/careers/CareersStory'
import CareersOperatingSystem from '@/components/careers/CareersOperatingSystem'
import CareersOpenRoles from '@/components/careers/CareersOpenRoles'
import CareersOffices from '@/components/careers/CareersOffices'
import CareersPathways from '@/components/careers/CareersPathways'
import CareersTalentCommunity from '@/components/careers/CareersTalentCommunity'
import CareersManagedContent from '@/components/careers/CareersManagedContent'
import { loadCareersCms, loadOpenJobs } from '@/lib/careers-db'

// Roles are published from the admin Workforce console, so the list has to be
// fresh rather than baked in at build time.
export const dynamic = 'force-dynamic'

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const locale = (await searchParams).lang === 'sw' ? 'sw' : 'en'
  const cms = await loadCareersCms(locale)
  const title = cms?.page.seoTitle || 'Careers | OpusFesta'
  const description = cms?.page.seoDescription || 'Join the team building the way Tanzania celebrates. Open roles across engineering, design, studio, operations and growth in Tanzania.'
  return { title, description, openGraph: { title, description, url: '/careers' } }
}

export default async function CareersPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale = (await searchParams).lang === 'sw' ? 'sw' : 'en'
  const [jobs, cms] = await Promise.all([loadOpenJobs(locale), loadCareersCms(locale)])

  return (
    <main>
      <nav aria-label="Careers language" className="mx-auto flex max-w-[1200px] justify-end gap-2 px-6 pt-4 text-sm"><a href="/careers?lang=en" aria-current={locale === 'en' ? 'page' : undefined} className="rounded-full border px-3 py-1.5 font-semibold">English</a><a href="/careers?lang=sw" aria-current={locale === 'sw' ? 'page' : undefined} className="rounded-full border px-3 py-1.5 font-semibold">Kiswahili</a></nav>
      {cms?.blocks.length ? <CareersManagedContent content={cms} /> : <><CareersHero /><CareersStory /><CareersOperatingSystem /><CareersPathways /></>}
      <CareersOpenRoles jobs={jobs} />
      <CareersTalentCommunity />
      {!cms?.blocks.length && <CareersOffices />}
    </main>
  )
}
