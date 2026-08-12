import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import {
  Check,
  ArrowRight,
  Sparkles,
  PartyPopper,
  Gem,
  Crown,
  ShieldCheck,
  Lock,
  PhoneCall,
  Printer,
  Globe,
  ScanLine,
  Gift,
  CalendarHeart,
  BookOpen,
  Package,
} from 'lucide-react'
import { loadPackagesContent, type PackageAddon, type PackageTier } from '@/lib/cms/packages'
import { FAQItem } from '@/app/digital-cards/FAQAccordion'
import { getLocale } from '@/lib/cms/locale'
import { loadUiStrings } from '@/lib/cms/ui-strings'

// Tier data comes from the per-guest packages CMS (loadPackagesContent); the
// page's own chrome (headings, badges, FAQ, security copy) comes from the Site UI
// "pricing" area, resolved per-locale from the locale cookie — so the page must
// never be baked into a shared cache (which would serve one visitor's language to
// all). force-dynamic replaces the previous ISR revalidate.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Pricing | OpusPass',
  description:
    'Simple per-guest pricing. Choose Essential, Classic, Elegant or Signature — every package includes the digital card, ticket, delivery and door check-in. Pay by mobile money or card.',
}

const tzs = (n: number) => `TZS ${n.toLocaleString('en-US')}`

// Tier card treatment — one pastel-tinted card per tier (slate / lavender /
// blush / gold, same family as the package selector on the product detail
// page), so Signature reads as the top of one consistent set rather than a
// different product. Classic gets a ring as the "most popular" pick.
const CARD_STYLES: Record<
  string,
  { card: string; ring: string; name: string; desc: string; price: string; check: string; cta: string }
> = {
  lite: {
    card: 'bg-[#E1E8F0] border-[#D3DBE5]',
    ring: '',
    name: 'text-[#403d39]',
    desc: 'text-gray-600',
    price: 'text-[#475569]',
    check: 'text-[#5C6B4D]',
    cta: 'bg-[#1A1A1A] text-white hover:bg-gray-800',
  },
  classic: {
    card: 'bg-[#ECDDF7] border-[#E3D2F2]',
    ring: 'ring-2 ring-[var(--accent)]',
    name: 'text-[#403d39]',
    desc: 'text-gray-600',
    price: 'text-[#403d39]',
    check: 'text-[#5C6B4D]',
    cta: 'bg-[#1A1A1A] text-white hover:bg-gray-800',
  },
  elegant: {
    card: 'bg-[#F4E3EC] border-[#ECD3DF]',
    ring: '',
    name: 'text-[#403d39]',
    desc: 'text-gray-600',
    price: 'text-[#8A4E68]',
    check: 'text-[#5C6B4D]',
    cta: 'bg-[#1A1A1A] text-white hover:bg-gray-800',
  },
  signature: {
    card: 'bg-[#F5E7BF] border-[#EBDCAE]',
    ring: '',
    name: 'text-[#403d39]',
    desc: 'text-gray-600',
    price: 'text-[#7A6418]',
    check: 'text-[#5C6B4D]',
    cta: 'bg-[#1A1A1A] text-white hover:bg-gray-800',
  },
}
const DEFAULT_CARD_STYLE = CARD_STYLES.lite

// Small bilingual UI-chrome labels introduced purely for this layout (not
// content, so not worth a new CMS row) — everything else on the page still
// comes from the "pricing" Site UI area / packages CMS.
function pageMicrocopy(locale: string) {
  const sw = locale === 'sw'
  return {
    features: sw ? 'Vipengele' : 'Features',
    addonsTitle: sw ? 'Nyongeza za hiari' : 'Optional add-ons',
    addonsIntro: sw
      ? 'Ongeza kwenye kifurushi chochote — muulize timu yetu wakati wa malipo.'
      : 'Layer these onto any package — ask our team when you check out.',
  }
}

// The CMS `addons` array only carries a label, no stable id → icon mapping
// (admin-added rows aren't guaranteed to keep the fallback's 'a1'/'a2' ids), so
// both the icon and the one-line explainer below are picked from keywords in
// the label itself rather than the id — falls back to a generic treatment for
// anything unrecognised (e.g. a new add-on typed into the admin CMS).
function addonCategory(label: string): keyof typeof ADDON_ICON_BY_CATEGORY {
  const s = label.toLowerCase()
  if (s.includes('print')) return 'print'
  if (s.includes('scan') || s.includes('check-in') || s.includes('check in')) return 'scan'
  if (s.includes('call') || s.includes('phone')) return 'call'
  if (s.includes('website')) return 'website'
  if (s.includes('gift')) return 'gift'
  if (s.includes('save-the-date') || s.includes('save the date')) return 'save-date'
  if (s.includes('guestbook')) return 'guestbook'
  return 'other'
}

const ADDON_ICON_BY_CATEGORY = {
  print: Printer,
  scan: ScanLine,
  call: PhoneCall,
  website: Globe,
  gift: Gift,
  'save-date': CalendarHeart,
  guestbook: BookOpen,
  other: Package,
}

const ADDON_CAPTION_BY_CATEGORY: Record<keyof typeof ADDON_ICON_BY_CATEGORY, { en: string; sw: string }> = {
  scan: {
    en: 'A dedicated attendant checks each guest’s QR code at the door on your event day.',
    sw: 'Mhudumu maalum anakagua msimbo wa QR wa kila mgeni mlangoni siku ya tukio lako.',
  },
  print: {
    en: 'Printed versions of your digital card design, delivered anywhere in Tanzania.',
    sw: 'Nakala zilizochapishwa za muundo wako wa kidijitali, zinazoletwa popote Tanzania.',
  },
  website: {
    en: 'A simple site with your event details, schedule and directions for guests.',
    sw: 'Tovuti rahisi yenye taarifa za tukio lako, ratiba na maelekezo kwa wageni.',
  },
  gift: {
    en: 'Guests can browse and contribute toward the gifts you’d like for your big day.',
    sw: 'Wageni wanaweza kuona na kuchangia zawadi unazotaka kwa siku yako kuu.',
  },
  'save-date': {
    en: 'An early digital announcement sent to guests ahead of your full digital card.',
    sw: 'Tangazo la awali la kidijitali linalotumwa kwa wageni kabla ya mwaliko wako kamili.',
  },
  guestbook: {
    en: 'Messages and memories your guests leave for you, yours to keep after the day.',
    sw: 'Salamu na kumbukumbu wanazoacha wageni wako, ni zako kuweka baada ya siku.',
  },
  call: {
    en: 'We phone guests who haven’t responded until your RSVP list is complete.',
    sw: 'Tunapiga simu wageni wasiojibu hadi orodha yako ya RSVP ikamilike.',
  },
  other: {
    en: 'Ask our team to add this to your order at checkout or afterwards.',
    sw: 'Muulize timu yetu kuongeza hii kwenye oda yako wakati wa malipo au baadaye.',
  },
}

// Per-tier CTA button copy — Source: OpusPass_Packages_final.xlsx, "Get
// started" row. Each tier uses a distinct verb rather than one generic
// "Choose {name}" pattern, matched exactly to the sheet's English/Kiswahili
// wording. Falls back to a generic "Choose {name}" for any tier id the sheet
// doesn't cover (e.g. a 5th tier added later via the admin CMS).
const CTA_LABELS: Record<string, { en: string; sw: string }> = {
  lite: { en: 'Start with Essential', sw: 'Anza na Essential' },
  classic: { en: 'Choose Classic', sw: 'Chagua Classic' },
  elegant: { en: 'Select Elegant', sw: 'Teua Elegant' },
  signature: { en: 'Book Signature', sw: 'Agiza Signature' },
}

// Bullets unique to this tier vs. the previous one, matched by label (bullet
// ids are per-call-site and don't dedupe across common()/*Extras() helpers —
// see packages.ts). Powers the compact "FEATURES" list shown on each card.
function ownBullets(tier: PackageTier, prev: PackageTier | undefined) {
  const prevLabels = new Set((prev?.includes ?? []).map((b) => b.label))
  return tier.includes.filter((b) => !prevLabels.has(b.label))
}

// Logo chips mirror the cart page so checkout feels consistent end-to-end.
const PAYMENT_METHODS = [
  { id: 'mpesa', label: 'M-Pesa', src: '/assets/payment-logos/m-pesa-logo.png', width: 600, height: 400, className: 'h-[26px] w-auto' },
  { id: 'airtel', label: 'Airtel Money', src: '/assets/payment-logos/airtel-money.png', width: 390, height: 230, className: 'h-[24px] w-auto' },
  { id: 'mixx', label: 'Mixx by Yas (Tigo Pesa)', src: '/assets/payment-logos/mixx-by-yass-tigo-pesa.png', width: 600, height: 400, className: 'h-[28px] w-auto' },
  { id: 'selcom', label: 'Selcom Pesa', src: '/assets/payment-logos/selcom.png', width: 385, height: 200, className: 'h-[22px] w-auto' },
  { id: 'visa', label: 'Visa', src: '/assets/payment-logos/visa.svg', width: 1000, height: 325, className: 'h-[17px] w-auto' },
  { id: 'mastercard', label: 'Mastercard', src: '/assets/payment-logos/mastercard.svg', width: 1000, height: 618, className: 'h-[20px] w-auto' },
] as const

export default async function PricingPage() {
  const locale = await getLocale()
  const t = await loadUiStrings('pricing', locale)
  const { tiers, addons } = await loadPackagesContent(locale)
  const copy = pageMicrocopy(locale)

  const pricingFaqs: { id: string; q: string; a: string }[] = [
    { id: 'how-charged', q: t.faq_how_charged_q, a: t.faq_how_charged_a },
    { id: 'large-events', q: t.faq_large_events_q, a: t.faq_large_events_a },
    { id: 'payment', q: t.faq_payment_q, a: t.faq_payment_a },
    { id: 'paper', q: t.faq_paper_q, a: t.faq_paper_a },
    { id: 'addons', q: t.faq_addons_q, a: t.faq_addons_a },
    { id: 'upgrade', q: t.faq_upgrade_q, a: t.faq_upgrade_a },
  ]

  return (
    <>
      {/* Hero */}
      <section className="px-4 sm:px-6 pt-20 sm:pt-28 pb-12 text-center">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-serif text-5xl sm:text-6xl tracking-tight text-[#403d39]">
            {t.hero_title}
          </h1>
          <p className="mt-5 text-[15px] sm:text-base text-gray-600 leading-relaxed mx-auto max-w-2xl">
            {t.hero_subtitle}
          </p>
        </div>
      </section>

      {/* Tier cards */}
      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:items-stretch">
          {tiers.map((tier, i) => {
            const card = CARD_STYLES[tier.id] ?? DEFAULT_CARD_STYLE
            const own = ownBullets(tier, tiers[i - 1])
            const cta = CTA_LABELS[tier.id]
            const ctaLabel = cta ? (locale === 'sw' ? cta.sw : cta.en) : `${t.choose_prefix} ${tier.name}`
            return (
              <div
                key={tier.id}
                className={`relative flex flex-col rounded-2xl border p-6 shadow-sm ${card.card} ${card.ring}`}
              >
                {tier.id === 'lite' && (
                  <span className="absolute -top-2.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-[#475569] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                    <Sparkles size={12} strokeWidth={2.5} aria-hidden="true" />
                    {t.badge_basic}
                  </span>
                )}
                {tier.featured && (
                  <span className="absolute -top-2.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-[var(--accent)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--on-accent)] shadow-sm">
                    <PartyPopper size={12} strokeWidth={2.5} aria-hidden="true" />
                    {t.badge_popular}
                  </span>
                )}
                {tier.id === 'elegant' && (
                  <span className="absolute -top-2.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-[#C98BA8] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                    <Gem size={12} strokeWidth={2.5} aria-hidden="true" />
                    {t.badge_premium}
                  </span>
                )}
                {tier.id === 'signature' && (
                  <span className="absolute -top-2.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-gradient-to-b from-[#E6C66E] to-[#C9A84C] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#3A2C06] shadow-sm">
                    <Crown size={12} strokeWidth={2.5} aria-hidden="true" />
                    {t.badge_luxury}
                  </span>
                )}

                <h2 className={`mt-2 font-serif text-xl ${card.name}`}>{tier.name}</h2>
                <p className={`mt-1 text-[13px] ${card.desc}`}>{tier.best_for}</p>
                <p className="mt-5 whitespace-nowrap">
                  <span className={`font-serif text-3xl ${card.price}`}>{tzs(tier.price_per_guest)}</span>
                  <span className="text-[14px] text-gray-500"> {t.per_guest_suffix}</span>
                </p>
                <Link
                  href="/digital-cards/catalog"
                  className={`mt-6 inline-flex items-center justify-center gap-1.5 rounded-full px-6 py-3 text-[14px] font-bold transition-colors ${card.cta}`}
                >
                  {ctaLabel}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>

                <div className="mt-6 border-t border-gray-100 pt-5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                    {copy.features}
                  </p>
                  <ul className="mt-3 space-y-2.5">
                    {own.map((b) => (
                      <li key={b.id} className="flex items-start gap-2 text-[13px] leading-snug">
                        <Check className={`mt-0.5 h-[15px] w-[15px] shrink-0 ${card.check}`} aria-hidden="true" />
                        <span className="text-gray-700">{b.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Optional add-ons */}
      {addons.length > 0 && (
        <section className="px-4 sm:px-6 pt-14 pb-16 sm:pt-20 sm:pb-24">
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <h2 className="font-serif text-3xl tracking-tight text-[#403d39]">{copy.addonsTitle}</h2>
              <p className="mx-auto mt-3 max-w-xl text-[14px] text-gray-600">{copy.addonsIntro}</p>
            </div>
            <div className="mx-auto mt-10 grid max-w-4xl gap-x-10 gap-y-8 sm:grid-cols-2">
              {addons.map((addon: PackageAddon) => {
                const category = addonCategory(addon.label)
                const Icon = ADDON_ICON_BY_CATEGORY[category]
                const caption = ADDON_CAPTION_BY_CATEGORY[category]
                return (
                  <div key={addon.id} className="flex items-start gap-3.5">
                    <span className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-[#5C6B4D]">
                      <Icon className="h-[19px] w-[19px]" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="font-serif text-[16px] leading-snug text-[#403d39]">{addon.label}</h3>
                      <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
                        {locale === 'sw' ? caption.sw : caption.en}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Payment methods */}
      <section className="px-4 sm:px-6 pb-16 sm:pb-20">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <h2 className="font-serif text-3xl tracking-tight text-[#403d39]">{t.pay_title}</h2>
            <p className="mx-auto mt-3 max-w-xl text-[14px] text-gray-600">{t.pay_intro}</p>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
            {PAYMENT_METHODS.map((m) => (
              <span
                key={m.id}
                className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 shadow-sm"
                aria-label={m.label}
                title={m.label}
                role="img"
              >
                <Image src={m.src} alt="" width={m.width} height={m.height} className={m.className} />
              </span>
            ))}
          </div>

          {/* Security reassurance */}
          <div className="mx-auto mt-10 grid max-w-2xl gap-x-10 gap-y-6 sm:grid-cols-2">
            <div className="flex items-center gap-3.5">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-[#5C6B4D]">
                <Lock className="h-[19px] w-[19px]" aria-hidden="true" />
              </span>
              <p className="text-[13px] text-gray-600 leading-relaxed">{t.security_encrypted}</p>
            </div>
            <div className="flex items-center gap-3.5">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-[#5C6B4D]">
                <ShieldCheck className="h-[19px] w-[19px]" aria-hidden="true" />
              </span>
              <p className="text-[13px] text-gray-600 leading-relaxed">{t.security_receipt}</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-4 sm:px-6 py-16 sm:py-20">
        <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[5fr_7fr] lg:gap-14">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <h2 className="font-serif text-3xl sm:text-4xl tracking-tight text-[#403d39]">
              {t.faq_title}
            </h2>
            <p className="mt-3 text-[15px] text-gray-600 leading-relaxed">
              {t.faq_intro}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link
                href="/contact"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#1A1A1A] px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-gray-800"
              >
                {t.contact_cta}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/help"
                className="text-[14px] font-bold text-[#5C6B4D] underline-offset-4 hover:underline"
              >
                {t.help_link}
              </Link>
            </div>
          </div>
          <div>
            {pricingFaqs.map((f) => (
              <FAQItem key={f.id} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

    </>
  )
}
