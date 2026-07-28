'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { UserButton, useUser } from '@clerk/nextjs'
import type { LucideIcon } from 'lucide-react'
import Logo from '@/components/ui/Logo'
import RegistryBagButton from '@/components/registry/RegistryBagButton'
import NotificationBell from '@/components/NotificationBell'
import {
  ADVICE_IDEAS_BASE_PATH,
  adviceIdeasNavLinks,
} from '@/lib/advice-ideas'
import {
  Menu,
  X,
  ChevronDown,
  Heart,
  Users,
  Camera,
  Music,
  MapPin,
  Sparkles,
  MessageCircle,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Link as LinkIcon,
  Shirt,
  Video,
  Utensils,
  Flower2,
  Globe,
  CalendarCheck,
  BookOpen,
  Gem,
  Clock,
  BarChart2,
  FileText,
  Star,
  Tag,
  HelpCircle,
  Building2,
  PenLine,
  Monitor,
  Image,
  Share2,
  Gift,
  PartyPopper,
  ShoppingBag,
  Wallet,
  Home,
  Plane,
  Sofa,
  Bed,
  Wine,
} from 'lucide-react'

type NavLink = { label: string; href?: string; Icon?: LucideIcon; subLinks?: string[] }
type PhotoGridItem = { label: string; image: string; href?: string }

const registryPhotoGrid: PhotoGridItem[] = [
  { label: 'Kitchen & Dining', image: 'https://images.unsplash.com/photo-1556909212-d5b604d0c90d?auto=format&fit=crop&w=400&q=80', href: '/registry/kitchen-dining' },
  { label: 'Tabletop & Bar', image: 'https://images.unsplash.com/photo-1630527152680-500b5453fb04?auto=format&fit=crop&w=400&q=80', href: '/registry/tabletop-bar' },
  { label: 'Bed & Bath', image: 'https://images.unsplash.com/photo-1601276174812-63280a55656e?auto=format&fit=crop&w=400&q=80', href: '/registry/bed-bath' },
  { label: 'Gifts & Keepsakes', image: 'https://images.unsplash.com/photo-1513201099705-a9746e1e201f?auto=format&fit=crop&w=400&q=80', href: '/registry/gifts-keepsakes' },
]

const attirePhotoGrid: PhotoGridItem[] = [
  { label: 'Wedding Dresses', image: 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=400&q=80' },
  { label: 'Engagement Rings', image: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=400&q=80' },
  { label: 'Suits & Tuxedos', image: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=400&q=80' },
  { label: 'Bridesmaid Dresses', image: 'https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=400&q=80' },
]

const planningPhotoGrid: PhotoGridItem[] = [
  { label: 'Checklist', image: '/assets/images/brideincar.jpg' },
  { label: 'Budget', image: '/assets/images/hand_rings.jpg' },
  { label: 'Guest List', image: '/assets/images/mauzo_crew.jpg' },
  { label: 'Seating Chart', image: '/assets/images/churchcouples.jpg' },
]

const guestsPhotoGrid: PhotoGridItem[] = [
  { label: 'Guest List', image: '/assets/images/mauzo_crew.jpg' },
  { label: 'RSVP Tracking', image: '/assets/images/churchcouples.jpg' },
  { label: 'Digital Cards', image: '/assets/images/cutesy_couple.jpg' },
  { label: 'Seating Plan', image: '/assets/images/couples_together.jpg' },
]

const websitesPhotoGrid: PhotoGridItem[] = [
  { label: 'Templates', image: '/assets/images/coupleswithpiano.jpg' },
  { label: 'Photo Gallery', image: '/assets/images/beautiful_bride.jpg' },
  { label: 'RSVPs', image: '/assets/images/authentic_couple.jpg' },
  { label: 'Travel Info', image: '/assets/images/bride_umbrella.jpg' },
]

const vendorPhotoGrid: PhotoGridItem[] = [
  { label: 'Venues',      image: '/assets/images/churchcouples.jpg',  href: '/vendors/browse?category=venues' },
  { label: 'Photography', image: '/assets/images/beautiful_bride.jpg', href: '/vendors/browse?category=photographers' },
  { label: 'Florals',     image: '/assets/images/flowers_pinky.jpg',   href: '/vendors/browse?category=florists' },
  { label: 'Beauty',      image: '/assets/images/beautyinbride.jpg',   href: '/vendors/browse?category=hair-makeup' },
]

const adviceIdeasHrefByLabel = new Map(adviceIdeasNavLinks.map((link) => [link.label, link.href]))

const navItems: Array<{
  label: string
  card: { image: string; title: string; description: string; linkText: string; href?: string }
  columns: Array<{ title: string; links: NavLink[] }>
  photoGridTitle?: string
  photoGrid?: PhotoGridItem[]
}> = [
  {
    label: 'Planning Tools',
    card: {
      image: 'https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?auto=format&fit=crop&w=800&q=80',
      title: 'PLANNING TOOLS',
      description: 'Everything you need to plan your wedding: checklists, budgets, guest lists and more.',
      linkText: 'Explore tools',
      href: '/planning-tools',
    },
    columns: [
      {
        title: 'Features',
        links: [
          { Icon: CheckCircle2, label: 'Wedding Checklist' },
          { Icon: CreditCard, label: 'Budget Planner' },
          { Icon: Users, label: 'Guest List Manager' },
          { Icon: CalendarCheck, label: 'Seating Chart' },
          { Icon: MessageCircle, label: 'Vendor Manager' },
        ],
      },
      {
        title: 'Resources',
        links: [
          { Icon: Clock, label: 'Planning Timeline' },
          { Icon: BarChart2, label: 'Budget Breakdown Guide' },
          { Icon: FileText, label: 'Checklist Templates' },
        ],
      },
    ],
    photoGridTitle: 'Top Tools',
    photoGrid: planningPhotoGrid,
  },
  {
    label: 'Vendors',
    card: {
      image: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=800&q=80',
      title: 'FIND VENDORS',
      description: 'Discover and book verified wedding professionals across Tanzania.',
      linkText: 'Browse all vendors',
      href: '/vendors',
    },
    columns: [
      {
        title: 'Categories',
        links: [
          { Icon: MapPin,   label: 'Venues',       href: '/vendors/browse?category=venues' },
          { Icon: Camera,   label: 'Photographers', href: '/vendors/browse?category=photographers' },
          { Icon: Video,    label: 'Videographers', href: '/vendors/browse?category=videographers' },
          { Icon: Flower2,  label: 'Florists',      href: '/vendors/browse?category=florists' },
          { Icon: Utensils, label: 'Caterers',      href: '/vendors/browse?category=caterers' },
        ],
      },
      {
        title: 'Services',
        links: [
          { Icon: Music,        label: 'DJs & Bands',     href: '/vendors/browse?category=djs-bands' },
          { Icon: Sparkles,     label: 'Hair & Makeup',   href: '/vendors/browse?category=hair-makeup' },
          { Icon: Gift,         label: 'Wedding Cakes',   href: '/vendors/browse?category=wedding-cakes' },
          { Icon: Shirt,        label: 'Bridal Salons',   href: '/vendors/browse?category=bridal-wear' },
          { Icon: PartyPopper,  label: 'MC & Officiants', href: '/vendors/browse?category=officiant-mc' },
        ],
      },
      {
        title: 'Resources',
        links: [
          { Icon: Star,       label: 'Verified Reviews',       href: '/vendors/browse' },
          { Icon: Tag,        label: 'Pricing Guide',          href: '/vendors/browse' },
          { Icon: HelpCircle, label: 'How to Choose a Vendor', href: '/vendors/browse' },
          { Icon: Building2,  label: 'Vendors by City',        href: '/vendors/browse' },
        ],
      },
    ],
    photoGridTitle: 'Popular Picks',
    photoGrid: vendorPhotoGrid,
  },
  {
    label: 'Digital Cards',
    card: {
      image: 'https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=800&q=80',
      title: 'WEDDING DIGITAL CARDS',
      description: 'Designer-worthy digital cards for every wedding moment, sent by WhatsApp or SMS.',
      linkText: 'Browse all designs',
      href: '/opuspass/digital-cards',
    },
    columns: [
      {
        title: 'Browse',
        links: [
          { Icon: Users, label: 'All Designs', href: '/opuspass/digital-cards/catalog' },
          { Icon: CheckCircle2, label: 'Save the Dates', href: '/opuspass/digital-cards/catalog' },
          { Icon: MessageCircle, label: 'Wedding Digital Cards', href: '/opuspass/digital-cards/catalog' },
          { Icon: MapPin, label: 'Send-Off & Kitchen Party', href: '/opuspass/digital-cards/catalog' },
          { Icon: Heart, label: 'Kadi za Michango', href: '/opuspass/digital-cards/catalog' },
        ],
      },
      {
        title: 'Resources',
        links: [
          { Icon: BookOpen, label: 'Invitation Wording', href: '/advice-and-ideas' },
          { Icon: PenLine, label: 'RSVP Wording Ideas', href: '/advice-and-ideas' },
        ],
      },
    ],
    photoGridTitle: 'Wedding Paper',
    photoGrid: guestsPhotoGrid.map((item) => ({ ...item, href: '/opuspass/digital-cards' })),
  },
  {
    label: 'Guests & RSVP',
    card: {
      image: 'https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=800&q=80',
      title: 'GUESTS & RSVP',
      description: 'Collect RSVPs in real time, manage your guest list and track every response in one place.',
      linkText: 'Manage guests & RSVPs',
      href: '/opuspass/guests-and-rsvp',
    },
    columns: [
      {
        title: 'Features',
        links: [
          { Icon: Users, label: 'Guest List Manager', href: '/opuspass/guests-and-rsvp' },
          { Icon: CheckCircle2, label: 'Live RSVP Tracking', href: '/opuspass/guests-and-rsvp' },
          { Icon: MessageCircle, label: 'WhatsApp & SMS Invites', href: '/opuspass/guests-and-rsvp' },
          { Icon: CalendarCheck, label: 'Seating Plan', href: '/opuspass/guests-and-rsvp' },
        ],
      },
      {
        title: 'Resources',
        links: [
          { Icon: PenLine, label: 'RSVP Wording Ideas', href: '/advice-and-ideas' },
          { Icon: BookOpen, label: 'Guest List Tips', href: '/advice-and-ideas' },
        ],
      },
    ],
    photoGridTitle: 'Guest Tools',
    photoGrid: guestsPhotoGrid.map((item) => ({ ...item, href: '/opuspass/guests-and-rsvp' })),
  },
  {
    label: 'Wedding Website',
    card: {
      image: 'https://images.unsplash.com/photo-1461301214746-1e109215d6d3?auto=format&fit=crop&w=800&q=80',
      title: 'WEDDING WEBSITES',
      description: 'Build a beautiful wedding website in minutes and share it with your guests.',
      linkText: 'Create your website',
      href: '/opuspass/websites',
    },
    columns: [
      {
        title: 'Features',
        links: [
          { Icon: Globe, label: 'Free Wedding Website' },
          { Icon: LinkIcon, label: 'Custom Link' },
          { Icon: Heart, label: 'Beautiful Templates' },
          { Icon: CheckCircle2, label: 'RSVP Collection' },
          { Icon: MapPin, label: 'Venue & Travel Info' },
        ],
      },
      {
        title: 'Resources',
        links: [
          { Icon: Monitor, label: 'Website Examples' },
          { Icon: Image, label: 'Photo Gallery Tips' },
          { Icon: Share2, label: 'Sharing with Guests' },
        ],
      },
    ],
    photoGridTitle: 'Website Ideas',
    photoGrid: websitesPhotoGrid.map((item) => ({ ...item, href: '/opuspass/websites' })),
  },
  {
    label: 'Advice & Ideas',
    card: {
      image: 'https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=800&q=80',
      title: 'ADVICE & IDEAS',
      description: 'Browse real weddings, trending themes, and expert advice for every couple.',
      linkText: 'Get inspired',
      href: ADVICE_IDEAS_BASE_PATH,
    },
    columns: [
      {
        title: 'Inspiration',
        links: [
          { Icon: Heart, label: 'Real Weddings', href: adviceIdeasHrefByLabel.get('Real Weddings') },
          { Icon: Sparkles, label: 'Themes & Styles', href: adviceIdeasHrefByLabel.get('Themes & Styles') },
          { Icon: Camera, label: 'Photo & Video Ideas', href: adviceIdeasHrefByLabel.get('Photo & Video Ideas') },
          { Icon: MapPin, label: 'Honeymoon Ideas', href: adviceIdeasHrefByLabel.get('Honeymoon Ideas') },
          { Icon: Globe, label: 'Destination Weddings', href: adviceIdeasHrefByLabel.get('Destination Weddings') },
        ],
      },
      {
        title: 'Advice',
        links: [
          { Icon: CheckCircle2, label: 'Planning Guides', href: adviceIdeasHrefByLabel.get('Planning Guides') },
          { Icon: MessageCircle, label: 'Etiquette & Wording', href: adviceIdeasHrefByLabel.get('Etiquette & Wording') },
          { Icon: Users, label: 'For Families & Guests', href: adviceIdeasHrefByLabel.get('For Families & Guests') },
          { Icon: Gift, label: 'Bridal Shower Ideas', href: adviceIdeasHrefByLabel.get('Bridal Shower Ideas') },
          { Icon: PartyPopper, label: 'Engagement Party Tips', href: adviceIdeasHrefByLabel.get('Engagement Party Tips') },
        ],
      },
    ],
  },
  {
    label: 'Registry',
    card: {
      image: 'https://images.unsplash.com/photo-1630527152680-500b5453fb04?auto=format&fit=crop&w=800&q=80',
      title: 'REGISTRY',
      description: 'Build your gift registry and let guests give exactly what you need.',
      linkText: 'Start your registry',
      href: '/registry',
    },
    columns: [
      {
        title: 'Shop by Room',
        links: [
          { Icon: Utensils, label: 'Kitchen & Dining' },
          { Icon: Wine, label: 'Tabletop & Bar' },
          { Icon: Bed, label: 'Bed & Bath' },
          { Icon: Sofa, label: 'Furniture & Décor' },
        ],
      },
      {
        title: 'More Ways to Give',
        links: [
          { Icon: Home, label: 'Home Essentials' },
          { Icon: Plane, label: 'Experiences & Honeymoon' },
          { Icon: Wallet, label: 'Cash Funds' },
        ],
      },
    ],
    photoGridTitle: 'Popular Picks',
    photoGrid: registryPhotoGrid,
  },
  {
    label: 'Attire & Rings',
    card: {
      image: 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=800&q=80',
      title: 'ATTIRE & RINGS',
      description: 'Find your perfect look from verified local boutiques across East Africa.',
      linkText: 'Explore attire',
      href: '/attire-and-rings',
    },
    columns: [
      {
        title: 'Attire',
        links: [
          { Icon: Heart, label: 'Wedding Dresses' },
          { Icon: Shirt, label: 'Suits & Tuxedos' },
          { Icon: Users, label: 'Bridesmaid Dresses' },
          { Icon: Sparkles, label: 'Mother of the Bride' },
          { Icon: Star, label: 'Flower Girl & Ring Bearer' },
        ],
      },
      {
        title: 'Rings & Jewellery',
        links: [
          { Icon: Gem, label: 'Engagement Rings' },
          { Icon: BookOpen, label: 'Wedding Rings' },
          { Icon: Sparkles, label: 'Wedding Jewellery' },
          { Icon: ShoppingBag, label: 'Wedding Accessories' },
        ],
      },
    ],
    photoGridTitle: 'Get Inspired',
    photoGrid: attirePhotoGrid,
  },
]

// Links into the opus_pass zone (/opuspass/*) must use a plain <a>: it is a
// separate Next.js app behind a rewrite, so client-side <Link> routing cannot
// cross the zone boundary. Internal opus_website links keep using <Link>.
function NavAnchor({
  href,
  className,
  onClick,
  children,
}: {
  href?: string
  className?: string
  onClick?: () => void
  children: ReactNode
}) {
  const target = href ?? '#'
  if (target.startsWith('/opuspass')) {
    return (
      <a href={target} className={className} onClick={onClick}>
        {children}
      </a>
    )
  }
  return (
    <Link href={target} className={className} onClick={onClick}>
      {children}
    </Link>
  )
}

export default function Navbar() {
  const { isSignedIn, isLoaded } = useUser()
  const pathname = usePathname()
  const onRegistry = pathname?.startsWith('/registry') ?? false
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null)
  const activeItem = activeMenu ? navItems.find((i) => i.label === activeMenu) ?? null : null

  const closeMobile = () => {
    setMobileOpen(false)
    setMobileExpanded(null)
  }

  const getNavHref = (href?: string) => href ?? '#'

  return (
    <div
      className="relative border-b border-gray-100 bg-white"
      onMouseLeave={() => setActiveMenu(null)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setActiveMenu(null)
          closeMobile()
        }
      }}
    >
      {/* ── Top bar ── */}
      <nav className="relative z-50 mx-auto flex max-w-[1536px] items-center justify-between bg-white px-4 py-3.5 sm:px-6 sm:py-4 lg:px-8">
        {/* Left: logo + desktop nav */}
        <div className="flex min-w-0 items-center gap-3 sm:gap-6 lg:gap-5">
          <Link href="/" aria-label="OpusFesta home" className="shrink-0">
            <Logo className="h-8 w-auto sm:h-10" />
          </Link>

          <div className="hidden min-[1340px]:flex gap-1 font-semibold text-[15px]">
            {navItems.map((item) => (
              <button
                key={item.label}
                onMouseEnter={() => setActiveMenu(item.label)}
                aria-expanded={activeMenu === item.label}
                aria-haspopup="true"
                className={`relative rounded-md px-4 py-2.5 transition-colors whitespace-nowrap ${
                  activeMenu === item.label ? 'text-gray-900' : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                {item.label}
                <span
                  className={`absolute inset-x-4 bottom-1 h-0.5 rounded-full bg-gray-900 transition-opacity ${
                    activeMenu === item.label ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Right: auth + hamburger */}
        <div className="flex shrink-0 items-center gap-2 font-semibold text-sm sm:gap-3 lg:text-[15px]">
          <NotificationBell />
          {onRegistry && <RegistryBagButton variant="light" />}
          {isLoaded && !isSignedIn ? (
            <>
              <Link
                href="/sign-in"
                className="hidden min-[1340px]:block text-gray-700 hover:text-[#1A1A1A] transition-colors whitespace-nowrap px-4 py-2.5 rounded-full hover:bg-gray-100"
              >
                Log in
              </Link>
              <Link
                href="/sign-up"
                className="shrink-0 rounded-full bg-(--accent) px-3.5 py-2 text-xs font-bold whitespace-nowrap text-(--on-accent) transition-colors hover:bg-(--accent-hover) sm:px-5 sm:text-sm lg:px-5.5 lg:py-2.5 lg:text-[15px]"
              >
                Sign up
              </Link>
            </>
          ) : isLoaded ? (
            <div className="flex items-center gap-3">
              {/* The couple dashboard is unified on OpusPass. "Dashboard" is the
                  single entry to it. NavAnchor uses a plain <a> to cross the
                  /opuspass zone boundary (308 → subdomain); the session is shared
                  (one Clerk apex). */}
              {/* Accent-filled, matching the signed-out "Sign up" CTA: it's the
                  primary destination for a signed-in couple, so it shouldn't
                  read as just another nav link. */}
              <NavAnchor
                href="/opuspass/my/dashboard"
                className="hidden min-[1340px]:flex items-center gap-1.5 shrink-0 rounded-full bg-(--accent) px-5 py-2.5 text-sm font-bold whitespace-nowrap text-(--on-accent) transition-colors hover:bg-(--accent-hover)"
              >
                Dashboard
              </NavAnchor>
              {/* Dashboard also lives in the avatar menu so it stays reachable
                  on mid-size desktops (1340–1535px) where the inline button is
                  hidden for space. It crosses the /opuspass zone boundary, so
                  it uses a full-page nav (Action) rather than Clerk's Link. */}
              <UserButton appearance={{ elements: { avatarBox: 'w-9 h-9' } }}>
                <UserButton.MenuItems>
                  <UserButton.Action
                    label="Dashboard"
                    labelIcon={<Heart size={16} />}
                    onClick={() => {
                      window.location.href = '/opuspass/my/dashboard'
                    }}
                  />
                </UserButton.MenuItems>
              </UserButton>
            </div>
          ) : null}
          <button
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-gray-100 min-[1340px]:hidden sm:h-10 sm:w-10"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* ── Desktop mega-menu dropdown ── */}
      {activeItem && (
        <div className="hidden min-[1340px]:block absolute top-full left-0 w-full bg-white border-b border-gray-200 shadow-lg z-40">
          <div className="max-w-6xl mx-auto px-6 py-8 flex gap-10">

            {/* Featured card */}
            <div className="w-[260px] shrink-0 rounded-2xl overflow-hidden flex flex-col border border-gray-200 shadow-md bg-white">
              <div className="h-36 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeItem.card.image}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-5 flex flex-col flex-1">
                <h3 className="text-base font-bold mb-1.5 text-[#1A1A1A] leading-tight">
                  {activeItem.card.title}
                </h3>
                <p className="text-gray-500 text-xs font-medium mb-5 leading-relaxed">
                  {activeItem.card.description}
                </p>
                <NavAnchor
                  href={getNavHref(activeItem.card.href)}
                  className="mt-auto inline-flex items-center gap-2 text-[#1A1A1A] font-bold text-sm hover:gap-3 transition-all group"
                >
                  {activeItem.card.linkText}
                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </NavAnchor>

              </div>
            </div>

            {/* Link columns */}
            <div className="flex-1 flex gap-10 pt-1">
              {activeItem.columns.map((col, idx) => (
                <div key={idx} className="flex-1 min-w-[180px]">
                  <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 mb-4 pb-3 border-b border-gray-200">
                    {col.title}
                  </h4>
                  <ul className="space-y-0.5">
                    {col.links.map((link, lIdx) => (
                      <li key={lIdx}>
                        <NavAnchor
                          href={getNavHref(link.href)}
                          className="flex items-center gap-3 px-3 py-2 rounded-xl group hover:bg-white transition-colors"
                        >
                          {link.Icon && (
                            <div className="w-7 h-7 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center group-hover:bg-(--accent) group-hover:text-(--on-accent) transition-colors shrink-0">
                              <link.Icon size={13} />
                            </div>
                          )}
                          <span className="font-semibold text-sm text-[#1A1A1A] leading-tight whitespace-nowrap group-hover:text-[#1A1A1A]">
                            {link.label}
                          </span>
                        </NavAnchor>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Visual support grid / vendor CTA */}
            {activeItem.label === 'Vendors' ? (
              <div className="shrink-0 w-[240px] pt-1">
                <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 mb-4 pb-3 border-b border-gray-200">
                  For Professionals
                </h4>
                <Link
                  href="/vendors/join"
                  className="group flex flex-col h-[calc(100%-40px)] min-h-[180px] rounded-2xl overflow-hidden border border-gray-200 hover:border-[#C9A0DC] transition-colors"
                >
                  <div className="relative flex-1 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=400&q=80"
                      alt="Join as a vendor"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent" />
                  </div>
                  <div className="bg-white px-4 py-4 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 mb-0.5">Wedding professional?</p>
                      <p className="text-[13px] font-bold text-[#1A1A1A]">Join as a vendor</p>
                    </div>
                    <ArrowRight size={14} className="shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[#1A1A1A]" />
                  </div>
                </Link>
              </div>
            ) : activeItem.photoGrid ? (
              <div className="shrink-0 w-[240px] pt-1">
                <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 mb-4 pb-3 border-b border-gray-200">
                  {activeItem.photoGridTitle ?? 'Get Inspired'}
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {activeItem.photoGrid.map((item) => (
                    <a key={item.label} href={item.href ?? '#'} className="group flex flex-col gap-1.5">
                      <div className="rounded-xl overflow-hidden h-[88px] border border-gray-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.image}
                          alt={item.label}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                      <span className="font-semibold text-xs text-[#1A1A1A] leading-tight px-0.5">
                        {item.label}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

        </div>
      )}

      {/* ── Mobile: full-screen menu ── */}
      <div
        className={`min-[1340px]:hidden fixed inset-0 bg-white z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          mobileOpen ? 'translate-y-0' : '-translate-y-full'
        }`}
        aria-label="Navigation menu"
      >
        {/* Header — changes based on which panel is active */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          {mobileExpanded ? (
            <button
              onClick={() => setMobileExpanded(null)}
              className="flex items-center gap-2 text-sm font-semibold text-gray-700"
              aria-label="Back to menu"
            >
              <ChevronDown size={18} className="rotate-90" />
              Back
            </button>
          ) : (
            <Link href="/" aria-label="OpusFesta home" onClick={closeMobile}>
              <Logo className="h-8 w-auto" />
            </Link>
          )}
          <button
            onClick={closeMobile}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Sliding panels container */}
        <div className="flex-1 overflow-hidden relative">
          {/* Panel 1 — main nav list */}
          <div
            className={`absolute inset-0 flex flex-col transition-transform duration-300 ease-in-out ${
              mobileExpanded ? '-translate-x-full' : 'translate-x-0'
            }`}
          >
            <div className="flex-1 overflow-y-auto py-3 px-3">
              {navItems.map((item) => (
                <button
                  key={item.label}
                  className="w-full flex items-center justify-between px-4 py-4 rounded-xl font-semibold text-sm text-gray-800 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  onClick={() => setMobileExpanded(item.label)}
                >
                  <span>{item.label}</span>
                  <ChevronDown size={16} className="-rotate-90 text-gray-400 shrink-0" />
                </button>
              ))}
            </div>

            {/* Footer CTA */}
            <div className="shrink-0 px-4 py-5 border-t border-gray-100 flex flex-col gap-2.5">
              {isLoaded && !isSignedIn ? (
                <>
                  <Link
                    href="/sign-in"
                    onClick={() => setMobileOpen(false)}
                    className="w-full text-center py-3 rounded-full border-2 border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/sign-up"
                    onClick={() => setMobileOpen(false)}
                    className="w-full text-center bg-(--accent) hover:bg-(--accent-hover) text-(--on-accent) py-3 rounded-full font-bold text-sm transition-colors"
                  >
                    Sign up, it&apos;s free
                  </Link>
                </>
              ) : isLoaded ? (
                <div className="flex flex-col gap-2.5">
                  {/* Primary destination, matching the desktop nav. */}
                  <NavAnchor
                    href="/opuspass/my/dashboard"
                    onClick={() => setMobileOpen(false)}
                    className="w-full text-center py-3 rounded-full bg-(--accent) hover:bg-(--accent-hover) text-(--on-accent) text-sm font-bold transition-colors"
                  >
                    Dashboard
                  </NavAnchor>
                  <div className="flex items-center justify-center pt-1">
                    <UserButton appearance={{ elements: { avatarBox: 'w-10 h-10' } }} />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Panel 2 — sub-items for the selected section */}
          <div
            className={`absolute inset-0 flex flex-col transition-transform duration-300 ease-in-out ${
              mobileExpanded ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            {(() => {
              const item = navItems.find((i) => i.label === mobileExpanded)
              if (!item) return null
              return (
                <>
                  {/* Section title */}
                  <div className="px-5 pt-3 pb-2 shrink-0">
                    <h2 className="text-xl font-bold text-[#1A1A1A]">
                      {item.label}
                    </h2>
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 pb-6">
                    {/* Featured image banner */}
                    <div className="relative rounded-2xl overflow-hidden h-36 mb-5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.card.image}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 px-4 py-4">
                        <p className="text-white text-xs font-medium leading-snug mb-2 opacity-90">
                          {item.card.description}
                        </p>
                        <NavAnchor
                          href={getNavHref(item.card.href)}
                          onClick={closeMobile}
                          className="inline-flex items-center gap-1.5 bg-white text-[#1A1A1A] text-xs font-bold px-3 py-1.5 rounded-full"
                        >
                          {item.card.linkText}
                          <ArrowRight size={11} />
                        </NavAnchor>
                      </div>
                    </div>

                    {/* Link columns */}
                    {item.columns.map((col, idx) => (
                      <div key={idx} className="mb-5">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400 mb-2 px-1">
                          {col.title}
                        </p>
                        <ul className="flex flex-col gap-0.5">
                          {col.links.map((link, lIdx) => (
                            <li key={lIdx}>
                              <NavAnchor
                                href={getNavHref(link.href)}
                                onClick={closeMobile}
                                className="flex items-center gap-3 px-3 py-3 rounded-xl bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors"
                              >
                                {link.Icon && (
                                  <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-gray-500 shrink-0 shadow-sm">
                                    <link.Icon size={15} />
                                  </div>
                                )}
                                <span className="text-sm font-semibold text-[#1A1A1A] flex-1">{link.label}</span>
                                <ChevronDown size={14} className="-rotate-90 text-gray-300 shrink-0" />
                              </NavAnchor>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}

                    {item.label === 'Vendors' && (
                      <Link
                        href="/vendors/join"
                        onClick={closeMobile}
                        className="mt-2 flex items-center justify-between px-4 py-3.5 rounded-2xl border border-[#C9A0DC] bg-[rgba(201,160,220,0.08)]"
                      >
                        <div>
                          <p className="text-[11px] font-semibold text-gray-500 mb-0.5">Wedding professional?</p>
                          <p className="text-sm font-bold text-[#1A1A1A]">Join as a vendor</p>
                        </div>
                        <ArrowRight size={16} className="text-[#1A1A1A] shrink-0" />
                      </Link>
                    )}
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
