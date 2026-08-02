import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Clock3, ShieldCheck } from 'lucide-react'
import JobApplicationForm from '@/components/careers/JobApplicationForm'
import { loadOpenJobBySlug } from '@/lib/careers-db'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const job = await loadOpenJobBySlug(slug)
  return { title: job ? `Apply for ${job.title} | OpusFesta` : 'Role not found | OpusFesta', robots: { index: false, follow: false } }
}

export default async function ApplyPage({ params }: Props) {
  const { slug } = await params
  const job = await loadOpenJobBySlug(slug)
  if (!job) notFound()

  return (
    <main className="bg-[#F4F4F0]">
      <div className="mx-auto max-w-[920px] px-6 py-12 md:py-20">
        <Link href={`/careers/jobs/${job.slug}`} className="inline-flex items-center gap-2 text-sm font-semibold text-black/55 hover:text-black"><ArrowLeft className="h-4 w-4" /> Back to role</Link>
        <header className="mt-10 border-b border-black/10 pb-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-black/45">Application · {job.department}</p>
          <h1 className="mt-4 text-4xl font-medium leading-tight tracking-[-0.045em] md:text-6xl">{job.title}</h1>
          <div className="mt-6 flex flex-wrap gap-5 text-sm text-black/55"><span>{job.location}</span><span>{job.workplaceType}</span><span>{job.employmentType}</span></div>
          <div className="mt-7 flex flex-wrap gap-3"><span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-medium"><Clock3 className="h-4 w-4" /> About 10 minutes</span><span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-medium"><ShieldCheck className="h-4 w-4" /> Private and secure</span></div>
        </header>
        <div className="mt-10"><JobApplicationForm job={job} /></div>
      </div>
    </main>
  )
}
