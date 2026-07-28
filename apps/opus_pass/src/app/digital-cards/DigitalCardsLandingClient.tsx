import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, ClipboardCheck, Globe, Heart, Mail, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { InvitationVisual } from '@/components/guests/InvitationVisual'
import { ProductInfo, type Product } from '@/components/guests/productInfo'
import { FAQItem } from './FAQAccordion'
import type { DigitalCardsStyleStripContent } from '@/lib/cms/digital-cards-style-strip'
import type { DigitalCardsFeaturesContent, DigitalCardsFeatureCard } from '@/lib/cms/digital-cards-features'
import type { DigitalCardsFaqsContent } from '@/lib/cms/digital-cards-faqs'
import type {
  DigitalCardsEditorsPicksContent,
  DigitalCardsEditorsPicksPick,
  DigitalCardsEditorsPicksTreatment,
} from '@/lib/cms/digital-cards-editors-picks'

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function DigitalCardsLandingClient({
  styleStrip,
  heroHeading,
  heroDescription,
  features,
  faqs,
  editorsPicks,
  fromGuestPrice,
  perGuestLabel,
  perDesignLabel,
  fromLabel,
  testimonials,
}: {
  styleStrip: DigitalCardsStyleStripContent
  /** Bilingual hero heading/description — sourced from the digital-cards-categories
   *  CMS content (same section that backs the category grid below), resolved
   *  for the current locale by the server. */
  heroHeading: string
  heroDescription: string
  features: DigitalCardsFeaturesContent
  faqs: DigitalCardsFaqsContent
  editorsPicks: DigitalCardsEditorsPicksContent
  /** Lowest per-guest package price — shown as the digital "from" anchor on real products. */
  fromGuestPrice?: number
  perGuestLabel?: string
  perDesignLabel?: string
  fromLabel?: string
  testimonials?: React.ReactNode
}) {
  return (
    <div className="bg-white text-[#1A1A1A]">
      <SuiteHero heading={heroHeading} description={heroDescription} items={styleStrip.items} />
      <EditorsPicks
        rows={editorsPicks.rows}
        exploreLabel={editorsPicks.exploreLabel}
        fromGuestPrice={fromGuestPrice}
        perGuestLabel={perGuestLabel}
        perDesignLabel={perDesignLabel}
        fromLabel={fromLabel}
      />
      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-7xl pt-16 sm:pt-24">
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-serif font-medium text-gray-900">
              {features.heading}
            </h2>
            {features.subheading && (
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-gray-600 md:text-base">
                {features.subheading}
              </p>
            )}
          </div>
          <FeatureRow cards={features.cards} />
        </div>
      </section>
      <SectionDivider />
      {testimonials}
      <FAQs content={faqs} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  SUITE HERO — "shop by moment" heading + category circles (static, no morph)
// ─────────────────────────────────────────────────────────────────────────────

function SuiteHero({
  heading,
  description,
  items,
}: {
  heading: string
  description: string
  items: DigitalCardsStyleStripContent['items']
}) {
  return (
    <section className="bg-white px-4 pb-10 pt-8 sm:px-6 sm:pb-14 sm:pt-12 lg:pb-16 lg:pt-16">
      <div className="mx-auto max-w-7xl text-center">
        <h2 className="font-serif text-2xl font-medium text-gray-900 sm:text-3xl lg:text-4xl">
          {heading}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-gray-700 md:text-base">
          {description}
        </p>
      </div>

      {/* Single horizontal row: 3 circles in view on phones (4 on sm, 6 on lg),
          the rest reached by horizontal scroll. */}
      <div className="mx-auto mt-8 max-w-7xl sm:mt-10">
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((cat) => (
            <Link
              key={cat.id}
              href={cat.href ?? '/digital-cards/catalog'}
              className="group flex shrink-0 snap-start basis-[calc((100%-2rem)/3)] flex-col items-center text-center sm:basis-[calc((100%-3rem)/4)] lg:basis-[calc((100%-5rem)/6)]"
            >
              <div className="relative mb-3 aspect-square w-full overflow-hidden rounded-full bg-white ring-1 ring-gray-200 transition-shadow group-hover:shadow-md">
                <Image
                  src={cat.img}
                  alt={cat.alt}
                  fill
                  sizes="(min-width: 1024px) 16vw, (min-width: 640px) 25vw, 33vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-medium leading-tight text-gray-800 group-hover:underline md:text-sm">
                {cat.label}
                <ArrowRight
                  size={14}
                  className="shrink-0 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION SHELL + DIVIDER
// ─────────────────────────────────────────────────────────────────────────────

function SectionDivider() {
  return (
    <div className="px-4 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="border-t border-gray-200 mt-10 sm:mt-14" />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  FEATURE COLUMNS — line-art icon + bold title + muted blurb (no card chrome)
// ─────────────────────────────────────────────────────────────────────────────

const FEATURE_ICONS: Record<DigitalCardsFeatureCard['visual'], typeof ClipboardCheck> = {
  invitations: ClipboardCheck,
  phone: Globe,
  envelope: Mail,
}

function FeatureRow({ cards }: { cards: DigitalCardsFeatureCard[] }) {
  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-3">
      {cards.map((c) => {
        const Icon = FEATURE_ICONS[c.visual] ?? ClipboardCheck
        return (
          <div key={c.id} className="flex flex-col items-center px-2 text-center">
            <Icon className="h-8 w-8 text-[#1A1A1A]" strokeWidth={1.5} aria-hidden="true" />
            <h3 className="mt-5 text-[18px] font-extrabold tracking-tight text-[#1A1A1A] sm:text-[20px]">
              {c.title}
            </h3>
            <p className="mt-3 max-w-[280px] text-[13px] leading-relaxed text-[#1A1A1A]/65 sm:text-sm">
              {c.body}
            </p>
            <Link
              href={c.cta_href}
              className="mt-4 inline-flex items-center gap-1 text-[13px] font-bold text-[#1A1A1A] underline underline-offset-4 hover:text-[var(--accent-hover)]"
            >
              {c.cta_label}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  EDITORS' PICKS — 4 editorial rows; alternating title + 3 picks per row
// ─────────────────────────────────────────────────────────────────────────────

function PickVisual({ pick }: { pick: DigitalCardsEditorsPicksPick }) {
  if (pick.media_url && pick.media_type === 'video') {
    return (
      <video
        src={pick.media_url}
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover"
      />
    )
  }
  if (pick.media_url) {
    return (
      <Image
        src={pick.media_url}
        alt={pick.name}
        fill
        sizes="(min-width: 768px) 25vw, 50vw"
        className="object-cover"
      />
    )
  }
  if (!pick.treatment) return null
  if (pick.treatment === 'flat-lay-stationery') return <FlatLayStationery />
  if (pick.treatment === 'menu-card') return <MenuCardVisual />
  const visual = (
    <InvitationVisual treatment={pick.treatment as Exclude<DigitalCardsEditorsPicksTreatment, 'flat-lay-stationery' | 'menu-card'>} />
  )
  if (pick.centered) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-[58%] aspect-[5/7] shadow-lg">{visual}</div>
      </div>
    )
  }
  return visual
}

function pickToProduct(pick: DigitalCardsEditorsPicksPick): Product {
  return {
    id: pick.product_id ?? pick.id,
    category: pick.category,
    categoryLabel: pick.categoryLabel,
    name: pick.name,
    priceWas: pick.price_was,
    priceNow: pick.price_now,
    digitalUnitPrice: pick.digital_unit_price,
    swatches: pick.swatches,
  }
}

function EditorsPicks({
  rows: cmsRows,
  exploreLabel,
  fromGuestPrice,
  perGuestLabel,
  perDesignLabel,
  fromLabel,
}: {
  rows: DigitalCardsEditorsPicksContent['rows']
  exploreLabel: string
  fromGuestPrice?: number
  perGuestLabel?: string
  perDesignLabel?: string
  fromLabel?: string
}) {
  // Keep the first catalog section close to the page chrome now that the landing
  // hero has been removed.
  return (
    <section className="relative z-10 px-4 sm:px-6">
      <div className="mx-auto max-w-7xl pt-4 sm:pt-6 space-y-12 sm:space-y-14 md:space-y-16">
        {cmsRows.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-6 sm:gap-x-6 sm:gap-y-10"
          >
            {/* Title is always first in DOM order (mobile reads top-to-bottom);
                on desktop, right-aligned rows move the title to the end via md:order-last.
                Two pick columns on phones keep the cards browsable without the
                page stretching to ~12k px of single-column squares. */}
            <div className={cn('col-span-2 md:col-span-1', row.align === 'right' && 'md:order-last')}>
              <EditorialTitleCell
                title={
                  <>
                    {row.title_line_1} <br className="hidden md:block" />
                    {row.title_line_2}
                  </>
                }
                align={row.align}
                exploreLabel={exploreLabel}
              />
            </div>
            {row.picks.map((p, i) => {
              const productHref = `/digital-cards/p/${p.product_id ?? p.id}`
              return (
                <Link
                  key={p.id}
                  href={productHref}
                  // Phones show a clean 2-up grid (title spans both columns, then
                  // two picks). Any 3rd+ pick is hidden on mobile to avoid a lonely
                  // half-row, and reappears at md where the row is title + 3 cards.
                  className={cn('flex flex-col group/pick', i >= 2 && 'hidden md:flex')}
                >
                  <PickCard
                    overlay={p.overlay === 'play' ? <PlayIcon /> : p.overlay === 'heart' ? <HeartIcon /> : undefined}
                    background={p.background}
                    badge={p.badge}
                  >
                    <PickVisual pick={p} />
                  </PickCard>
                  <ProductInfo product={pickToProduct(p)} href={productHref} fromGuestPrice={fromGuestPrice} perGuestLabel={perGuestLabel} perDesignLabel={perDesignLabel} fromLabel={fromLabel} />
                </Link>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}

function EditorialTitleCell({
  title,
  align,
  exploreLabel,
}: {
  title: React.ReactNode
  align: 'left' | 'right'
  exploreLabel: string
}) {
  return (
    <div
      className={cn(
        // Phones: title on the left, button on the right (one row). Desktop keeps
        // the original stacked column.
        'flex h-full flex-row items-start justify-between gap-3 md:flex-col md:items-start md:justify-center',
        align === 'left' ? 'md:pr-2' : 'md:pl-2',
      )}
    >
      <h3 className="min-w-0 font-serif text-[24px] sm:text-[30px] md:text-[34px] lg:text-[38px] leading-[1.05] text-[#1A1A1A]">
        {title}
      </h3>
      <Link
        href="/digital-cards/catalog"
        className="inline-flex w-fit shrink-0 items-center rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--on-accent)] px-4 py-2 sm:px-5 sm:py-2.5 text-[11px] sm:text-[12px] font-extrabold uppercase tracking-[0.1em] sm:tracking-[0.12em] md:mt-5"
      >
        {exploreLabel}
      </Link>
    </div>
  )
}

function MenuCardVisual() {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4">
      <div className="relative w-[68%] h-[90%] bg-white shadow-md rounded-sm overflow-hidden flex flex-col items-center justify-center p-3 text-[#1A1A1A] rotate-[-2deg]">
        <p className="text-[8px] uppercase tracking-[0.32em] text-[#1A1A1A]/60">Menu</p>
        <div className="my-2 h-px w-6 bg-[#A6B89A]" />
        <p className="font-serif italic text-[12px] leading-tight text-center">
          Wali wa Nazi<br />
          Kuku Choma<br />
          Mishkaki<br />
          Mandazi
        </p>
        <div className="mt-2 h-px w-4 bg-[#A6B89A]" />
        <p className="mt-2 text-[7px] uppercase tracking-[0.22em] text-[#5C6B4D]">A &amp; N · Bagamoyo</p>
      </div>
    </div>
  )
}

function PickCard({
  children,
  overlay,
  badge,
  background,
}: {
  children: React.ReactNode
  overlay?: React.ReactNode
  badge?: string
  background?: string
}) {
  return (
    <div
      className="group relative aspect-[5/7] overflow-hidden rounded-sm bg-[#FAF7F2]"
      style={background ? { backgroundColor: background } : undefined}
    >
      {children}
      {badge && (
        <span className="absolute left-2.5 bottom-2.5 rounded-sm bg-white/95 px-2 py-1 text-[10px] font-bold tracking-wide text-[#1A1A1A] shadow-sm">
          {badge}
        </span>
      )}
      {overlay}
    </div>
  )
}

function PlayIcon() {
  return (
    <span className="absolute right-2.5 bottom-2.5 grid h-8 w-8 place-items-center rounded-full bg-white/90 shadow-sm transition group-hover:bg-white">
      <Play className="h-3.5 w-3.5 fill-[#1A1A1A] text-[#1A1A1A]" />
    </span>
  )
}

function HeartIcon() {
  return (
    <span className="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full bg-white/90 shadow-sm transition group-hover:bg-white">
      <Heart className="h-3.5 w-3.5 text-[#1A1A1A]" />
    </span>
  )
}

function FlatLayStationery() {
  // CSS mock — stationery flat-lay in a neutral frame
  return (
    <div className="absolute inset-0">
      {/* Envelope */}
      <div className="absolute left-[10%] top-[14%] w-[42%] aspect-[3/2] bg-[#F5EFE3] rounded-sm shadow-md rotate-[-6deg]">
        <div
          className="absolute inset-x-0 top-0 h-[55%]"
          style={{
            background: 'linear-gradient(180deg, #FBF7F2 0%, #F5EFE3 100%)',
            clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
          }}
        />
      </div>
      {/* Digital card */}
      <div className="absolute right-[8%] top-[8%] w-[36%] aspect-[3/4] shadow-md rotate-[5deg]">
        <InvitationVisual treatment="classic-serif" />
      </div>
      {/* Tag */}
      <div className="absolute right-[14%] bottom-[12%] w-[22%] aspect-[3/2] bg-white rounded-sm shadow-md rotate-[-3deg] flex items-center justify-center">
        <span className="text-[7px] uppercase tracking-[0.22em] font-bold text-[#1A1A1A]">A &amp; N</span>
      </div>
      {/* Wax-seal dot */}
      <span className="absolute left-[42%] bottom-[20%] h-5 w-5 rounded-full bg-[#7A1F2B] shadow-md" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  FAQS — accordion-style frequently asked questions
// ─────────────────────────────────────────────────────────────────────────────

function FAQs({ content }: { content: DigitalCardsFaqsContent }) {
  return (
    <section className="px-4 sm:px-6">
      <div className="mx-auto max-w-4xl pt-10 sm:pt-14">
        <div className="text-center mb-8 sm:mb-10">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-serif font-medium text-gray-900 mb-4">
            {content.heading}
          </h2>
          <p className="max-w-2xl mx-auto text-sm md:text-base text-gray-700 leading-relaxed">
            {content.description}
          </p>
        </div>
        <div className="border-y border-gray-200">
          {content.items.map((item) => (
            <FAQItem key={item.id} q={item.question} a={item.answer} />
          ))}
        </div>
      </div>
    </section>
  )
}

