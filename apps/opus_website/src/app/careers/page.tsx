import type { Metadata } from 'next';
import CareersHero from '@/components/careers/CareersHero';
import CareersStory from '@/components/careers/CareersStory';
import CareersOperatingSystem from '@/components/careers/CareersOperatingSystem';
import CareersOpenRoles from '@/components/careers/CareersOpenRoles';
import CareersPathways from '@/components/careers/CareersPathways';
import CareersFaq from '@/components/careers/CareersFaq';
import CareersManagedContent from '@/components/careers/CareersManagedContent';
import { loadCareersCms, loadOpenJobs } from '@/lib/careers-db';

// Roles are published from the admin Workforce console, so the list has to be
// fresh rather than baked in at build time.
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const locale = (await searchParams).lang === 'sw' ? 'sw' : 'en';
  const cms = await loadCareersCms(locale);
  const title = cms?.page.seoTitle || 'Careers | OpusFesta';
  const description =
    cms?.page.seoDescription ||
    'Join the team building the way Tanzania celebrates. Open roles across engineering, design, studio, operations and growth in Tanzania.';
  return {
    title,
    description,
    openGraph: { title, description, url: '/careers' },
  };
}

export default async function CareersPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const locale = (await searchParams).lang === 'sw' ? 'sw' : 'en';
  const [jobs, cms] = await Promise.all([
    loadOpenJobs(locale),
    loadCareersCms(locale),
  ]);

  return (
    <main>
      {cms?.blocks.length ? (
        <CareersManagedContent content={cms} />
      ) : (
        <>
          <CareersHero />
          <CareersStory />
          <CareersOperatingSystem />
          <CareersPathways />
        </>
      )}
      <CareersOpenRoles jobs={jobs} locale={locale} />
      {!cms?.blocks.length && <CareersFaq />}
    </main>
  );
}
