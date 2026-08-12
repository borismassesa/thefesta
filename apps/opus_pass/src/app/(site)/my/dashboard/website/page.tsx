import Link from 'next/link'
import { Globe, Palette, ArrowRight } from 'lucide-react'
import { Card, EmptyState } from '@/components/dashboard/primitives'
import { Button } from '@/components/dashboard/controls'
import { DashboardHero } from '@/components/dashboard/DashboardHero'
import { loadDashboardHero } from '@/lib/cms/dashboard-hero'
import { loadDashboardCopy } from '@/lib/cms/dashboard-copy'
import { getLocale } from '@/lib/cms/locale'

export const dynamic = 'force-dynamic'

export default async function WebsitePage() {
  const locale = await getLocale()
  const [hero, copy] = await Promise.all([
    loadDashboardHero('website', locale),
    loadDashboardCopy('website', locale),
  ])

  const benefits = copy.benefits_items
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return (
    <div className="space-y-6">
      <DashboardHero
        content={hero}
        actions={
          <Link
            href="/websites"
            className="inline-flex items-center gap-2 rounded-full bg-black/[0.05] px-3.5 py-2 text-xs font-semibold text-[#1A1A1A] hover:bg-black/[0.08]"
          >
            <Palette className="h-3.5 w-3.5" /> {copy.browse_chip}
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold tracking-tight text-[#1A1A1A]">
            {copy.build_title}
          </h2>
          <p className="mt-1 text-sm text-[#1A1A1A]/60">{copy.build_description}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/websites">
              <Button>
                <Palette className="h-4 w-4" /> {copy.build_primary_cta}{' '}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/my/dashboard/events">
              <Button variant="secondary">{copy.build_secondary_cta}</Button>
            </Link>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-semibold tracking-tight text-[#1A1A1A]">
            {copy.benefits_title}
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-[#1A1A1A]/70">
            {benefits.map((item, i) => (
              <li key={i}>· {item}</li>
            ))}
          </ul>
        </Card>
      </div>

      <EmptyState
        icon={<Globe className="h-7 w-7" />}
        title={copy.coming_soon_title}
        description={copy.coming_soon_description}
      />
    </div>
  )
}
