import type { Metadata } from 'next'
import Link from 'next/link'
import { PlayCircle, CreditCard, Ticket, Users, Globe, MessageCircle, Mail, Phone, Clock, ArrowRight } from 'lucide-react'
import { getLocale } from '@/lib/cms/locale'
import { loadUiStrings, type HelpStrings } from '@/lib/cms/ui-strings'
import ContactForm from './ContactForm'

// The "Need Help?" grid below reuses the real Help Centre topic copy, which is
// CMS/locale-driven — so this page must stay dynamic rather than get baked
// into a shared cache.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Contact | OpusPass',
  description:
    'Get in touch with the OpusPass team. We’re based in Dar es Salaam and reply within one business day by email or WhatsApp.',
}

const BUSINESS_HOURS = [
  { day: 'Monday', hours: '9am–5pm' },
  { day: 'Tuesday', hours: '9am–5pm' },
  { day: 'Wednesday', hours: '9am–5pm' },
  { day: 'Thursday', hours: '9am–5pm' },
  { day: 'Friday', hours: '9am–5pm' },
  { day: 'Saturday', hours: '9am–5pm' },
]

export default async function ContactPage() {
  const locale = await getLocale()
  const t = await loadUiStrings('help', locale)

  // Same five topics as the Help Centre's own grid (apps/opus_pass/src/app/(content)/help/page.tsx),
  // reused here rather than fabricated — the sixth slot swaps the self-referential
  // "Contact support → /contact" card (we're already on this page) for a direct
  // WhatsApp link instead.
  const topics: { Icon: typeof PlayCircle; titleKey: keyof HelpStrings; bodyKey: keyof HelpStrings; ctaKey: keyof HelpStrings; href: string; external?: boolean }[] = [
    { Icon: PlayCircle, titleKey: 'topic_getting_started_title', bodyKey: 'topic_getting_started_body', ctaKey: 'topic_getting_started_cta', href: '/' },
    { Icon: CreditCard, titleKey: 'topic_pricing_title', bodyKey: 'topic_pricing_body', ctaKey: 'topic_pricing_cta', href: '/pricing' },
    { Icon: Ticket, titleKey: 'topic_invitations_title', bodyKey: 'topic_invitations_body', ctaKey: 'topic_invitations_cta', href: '/digital-cards' },
    { Icon: Users, titleKey: 'topic_guests_title', bodyKey: 'topic_guests_body', ctaKey: 'topic_guests_cta', href: '/guests-and-rsvp' },
    { Icon: Globe, titleKey: 'topic_website_title', bodyKey: 'topic_website_body', ctaKey: 'topic_website_cta', href: '/websites' },
  ]

  return (
    <>
      {/* Hero + form */}
      <section className="px-4 sm:px-6 pt-20 sm:pt-28 pb-16 sm:pb-20">
        <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-2 lg:gap-14 lg:items-start">
          <div>
            <h1 className="font-serif text-5xl sm:text-6xl tracking-tight text-[#403d39]">
              Talk to a real person, fast.
            </h1>
            <p className="mt-5 text-[15px] sm:text-base text-gray-600 leading-relaxed">
              Have a question or need a hand with your event? Fill out the form below and our team
              will reply within one business day.
            </p>

            <div className="mt-9 space-y-6">
              <a href="mailto:hello@opusfesta.com" className="group flex items-start gap-4">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-[#5C6B4D]">
                  <Mail className="h-[20px] w-[20px]" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-[15px] font-bold text-[#403d39] group-hover:underline underline-offset-4">
                    Email support
                  </span>
                  <span className="block text-[14px] text-gray-600">hello@opusfesta.com</span>
                </span>
              </a>

              <div className="flex items-start gap-4">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-[#5C6B4D]">
                  <MessageCircle className="h-[20px] w-[20px]" aria-hidden="true" />
                </span>
                <span>
                  <a
                    href="https://wa.me/255799202171"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-[15px] font-bold text-[#403d39] hover:underline underline-offset-4"
                  >
                    Chat on WhatsApp
                  </a>
                  <span className="block text-[14px] text-gray-600">+255 799 202 171</span>
                </span>
              </div>

              <a href="tel:+255799202171" className="group flex items-start gap-4">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-[#5C6B4D]">
                  <Phone className="h-[20px] w-[20px]" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-[15px] font-bold text-[#403d39] group-hover:underline underline-offset-4">
                    Call us
                  </span>
                  <span className="block text-[14px] text-gray-600">+255 799 202 171</span>
                </span>
              </a>

              <div className="flex items-start gap-4">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-[#5C6B4D]">
                  <Clock className="h-[20px] w-[20px]" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-[15px] font-bold text-[#403d39]">Business hours</span>
                  <span className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[14px] text-gray-600">
                    {BUSINESS_HOURS.map(({ day, hours }) => (
                      <span key={day} className="contents">
                        <span>{day}</span>
                        <span>{hours}</span>
                      </span>
                    ))}
                  </span>
                  <span className="mt-1 block text-[12px] text-gray-400">All times East Africa Time (EAT).</span>
                </span>
              </div>
            </div>
          </div>

          <ContactForm />
        </div>
      </section>

      {/* Need Help? */}
      <section className="px-4 sm:px-6 pb-24">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <h2 className="font-serif text-3xl tracking-tight text-[#403d39]">Need help?</h2>
            <p className="mx-auto mt-3 max-w-xl text-[14px] text-gray-600">
              Want an answer right away? Pick a topic below.
            </p>
          </div>

          <div className="mx-auto mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {topics.map(({ Icon, titleKey, bodyKey, ctaKey, href }) => (
              <Link
                key={titleKey}
                href={href}
                className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-6 transition-colors hover:border-gray-300"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-[#5C6B4D]">
                  <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-[17px] font-extrabold tracking-tight text-[#1A1A1A]">
                  {t[titleKey]}
                </h3>
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
            <a
              href="https://wa.me/255799202171"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-6 transition-colors hover:border-gray-300"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-[#5C6B4D]">
                <MessageCircle className="h-[22px] w-[22px]" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-[17px] font-extrabold tracking-tight text-[#1A1A1A]">
                Chat with the team
              </h3>
              <p className="mt-1.5 flex-1 text-[14px] text-gray-600 leading-relaxed">
                Prefer to talk it through? Message us directly on WhatsApp.
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-[#1A1A1A]">
                Open WhatsApp
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
