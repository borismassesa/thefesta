import type { Metadata } from 'next'
import Navbar from '@/components/navbar'
import Hero from '@/components/hero'
import Trust from '@/components/trust'
import VendorSearch from '@/components/vendor-search'
import PricingComparison from '@/components/pricing-comparison'
import DoMore from '@/components/do-more'
import Business from '@/components/business'
import CategoryMarquee from '@/components/category-marquee'
import Testimonials from '@/components/testimonials'
import Features from '@/components/features'
import Faq from '@/components/faq'
import Cta from '@/components/cta'
import Footer from '@/components/footer'

export const metadata: Metadata = {
  title: 'OpusFesta — Plan Your Perfect Wedding',
  description:
    'Everything you need to plan your wedding, all in one place. Discover venues, connect with vendors, and manage your digital cards in Tanzania.',
  openGraph: {
    title: 'OpusFesta — Plan Your Perfect Wedding',
    description:
      'Discover venues, connect with vendors, and manage your wedding in Tanzania — all in one place.',
    images: [{ url: '/assets/images/coupleswithpiano.jpg', width: 1200, height: 630, alt: 'OpusFesta — Wedding Planning in Tanzania' }],
    type: 'website',
  },
}

// Sections load from website_page_sections via Supabase (service-role client,
// no per-request state) so this page is safely cacheable. ISR instead of
// force-dynamic: served from the CDN and regenerated at most hourly, while the
// admin's "Publish" flow busts it instantly via POST /api/revalidate?path=/.
export const revalidate = 3600

export default function Home() {
  return (
    <div className="font-sans text-[#1A1A1A] bg-[#FFFFFF] selection:bg-[var(--accent)] selection:text-[var(--on-accent)]">
      <Navbar />
      <Hero />
      <Trust />
      <CategoryMarquee />
      <VendorSearch />
      <PricingComparison />
      <DoMore />
      <Business />
      <Features />
      <Testimonials />
      <Faq />
      <Cta />
      <Footer />
    </div>
  )
}
