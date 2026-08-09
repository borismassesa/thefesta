import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import CareersTalentCommunity from '@/components/careers/CareersTalentCommunity';

const description =
  'Tell us what you do well and where you want to grow. Join the OpusFesta talent community and our People team will revisit your profile when something relevant opens.';

export const metadata: Metadata = {
  title: 'Talent community | OpusFesta',
  description,
  openGraph: {
    title: 'Talent community | OpusFesta',
    description,
    url: '/careers/talent-community',
  },
};

export default function TalentCommunityPage() {
  return (
    <main>
      <div className="mx-auto max-w-[1240px] px-6 py-8">
        <Link
          href="/careers"
          className="inline-flex items-center gap-2 text-sm font-medium text-black/60 transition-colors hover:text-black"
        >
          <ArrowLeft className="h-4 w-4" /> Back to careers
        </Link>
      </div>
      <CareersTalentCommunity />
    </main>
  );
}
