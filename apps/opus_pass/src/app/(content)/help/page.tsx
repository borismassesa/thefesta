import type { Metadata } from 'next'
import Link from 'next/link'
import {
  PlayCircle,
  CreditCard,
  Mail,
  Users,
  Globe,
  Ticket,
  ArrowRight,
  MessageCircle,
} from 'lucide-react'
import { FAQItem } from '@/app/digital-cards/FAQAccordion'
import { getLocale } from '@/lib/cms/locale'
import { loadUiStrings, type HelpStrings } from '@/lib/cms/ui-strings'

// Per-locale CMS copy is resolved from the locale cookie, so the page must never
// be baked into a shared cache (which would serve one visitor's language to all).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Help Centre | OpusPass',
  description:
    'Find answers about digital cards, RSVPs, payments and your wedding website — or reach the OpusPass team directly. We reply within one business day.',
}

export default async function HelpCentrePage() {
  const locale = await getLocale()
  const t = await loadUiStrings('help', locale)

  // Text comes from the CMS (t.*); icons + hrefs stay hardcoded scalars.
  const topics: { Icon: typeof PlayCircle; titleKey: keyof HelpStrings; bodyKey: keyof HelpStrings; ctaKey: keyof HelpStrings; href: string }[] = [
    { Icon: PlayCircle, titleKey: 'topic_getting_started_title', bodyKey: 'topic_getting_started_body', ctaKey: 'topic_getting_started_cta', href: '/' },
    { Icon: CreditCard, titleKey: 'topic_pricing_title', bodyKey: 'topic_pricing_body', ctaKey: 'topic_pricing_cta', href: '/pricing' },
    { Icon: Ticket, titleKey: 'topic_invitations_title', bodyKey: 'topic_invitations_body', ctaKey: 'topic_invitations_cta', href: '/digital-cards' },
    { Icon: Users, titleKey: 'topic_guests_title', bodyKey: 'topic_guests_body', ctaKey: 'topic_guests_cta', href: '/guests-and-rsvp' },
    { Icon: Globe, titleKey: 'topic_website_title', bodyKey: 'topic_website_body', ctaKey: 'topic_website_cta', href: '/websites' },
    { Icon: Mail, titleKey: 'topic_contact_title', bodyKey: 'topic_contact_body', ctaKey: 'topic_contact_cta', href: '/contact' },
  ]

  const faqs: { id: string; q: string; a: string }[] = [
    { id: 'create-event', q: t.faq_create_event_q, a: t.faq_create_event_a },
    { id: 'cost', q: t.faq_cost_q, a: t.faq_cost_a },
    { id: 'payment-methods', q: t.faq_payment_methods_q, a: t.faq_payment_methods_a },
    { id: 'guest-experience', q: t.faq_guest_experience_q, a: t.faq_guest_experience_a },
    { id: 'rsvp-tracking', q: t.faq_rsvp_tracking_q, a: t.faq_rsvp_tracking_a },
    { id: 'paper', q: t.faq_paper_q, a: t.faq_paper_a },
    { id: 'change-details', q: t.faq_change_details_q, a: t.faq_change_details_a },
    { id: 'support-speed', q: t.faq_support_speed_q, a: t.faq_support_speed_a },
  ]

  return (
    <>
      {/* Hero */}
      <section className="px-4 sm:px-6 pt-20 sm:pt-28 pb-10">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[13px] text-gray-500 mb-3">{t.eyebrow}</p>
          <h1 className="font-serif text-4xl sm:text-5xl tracking-tight text-[#403d39]">
            {t.title}
          </h1>
          <p className="mt-5 text-[15px] sm:text-base text-gray-600 leading-relaxed mx-auto max-w-2xl">
            {t.intro}
          </p>
        </div>
      </section>

      {/* Topic cards */}
      <section className="px-4 sm:px-6 pb-4">
        <div className="mx-auto max-w-5xl grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map(({ Icon, titleKey, bodyKey, ctaKey, href }) => (
            <Link
              key={titleKey}
              href={href}
              className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-6 transition-colors hover:border-gray-300"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-[#5C6B4D]">
                <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-[17px] font-extrabold tracking-tight text-[#1A1A1A]">
                {t[titleKey]}
              </h2>
              <p className="mt-1.5 flex-1 text-[14px] text-gray-600 leading-relaxed">{t[bodyKey]}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-[#1A1A1A]">
                {t[ctaKey]}
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Popular questions */}
      <section className="px-4 sm:px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="font-serif text-3xl sm:text-4xl tracking-tight text-[#403d39]">
            {t.faq_title}
          </h2>
          <p className="mt-3 text-[15px] text-gray-600 leading-relaxed">
            {t.faq_intro}
          </p>
          <div className="mt-8 rounded-2xl border border-gray-200 bg-white px-5 sm:px-7">
            {faqs.map((f) => (
              <FAQItem key={f.id} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      {/* Still need help CTA */}
      <section className="px-4 sm:px-6 pb-24">
        <div className="mx-auto max-w-5xl rounded-3xl bg-[#1A1A1A] px-6 py-12 sm:px-12 sm:py-14 text-center">
          <h2 className="font-serif text-2xl sm:text-3xl tracking-tight text-white">
            {t.cta_title}
          </h2>
          <p className="mt-3 text-[14px] sm:text-[15px] text-gray-300 leading-relaxed mx-auto max-w-xl">
            {t.cta_body}
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-[14px] font-bold text-[#1A1A1A] transition-colors hover:bg-gray-100"
            >
              <Mail className="h-[18px] w-[18px]" aria-hidden="true" />
              {t.cta_contact}
            </Link>
            <a
              href="https://wa.me/255799202171"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 px-7 py-3.5 text-[14px] font-bold text-white transition-colors hover:bg-white/10"
            >
              <MessageCircle className="h-[18px] w-[18px]" aria-hidden="true" />
              {t.cta_whatsapp}
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
