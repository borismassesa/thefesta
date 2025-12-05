import Image from 'next/image';
import Link from 'next/link';
import venueImage from '../../assets/abstract-3d-stacked-translucent-discs-4k.jpeg';
import photoGalleryImage from '../../assets/abstract-blue-emerald-pebbles-on-soft-gradient-4k.jpeg';
import beautifulDesignsImage from '../../assets/vibrant-abstract-gradient-light-pillars-4k.jpeg';
import registryLinksImage from '../../assets/vibrant-gradient-waves-in-yellow-orange-and-teal-4k.jpeg';
import rsvpTrackingImage from '../../assets/minimalist-blue-arch-with-yellow-sun-4k.jpeg';
import chatAppImage from '../../assets/abstract-chat-app-interface-on-smartphone-4k.jpeg';
import classicTemplateImage from '../../assets/abstract-blue-horizon-glow-background-4k.jpeg';
import fluidGradientImage from '../../assets/vibrant-abstract-fluid-gradient-waves-4k.jpeg';
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CameraIcon,
  ClockIcon,
  CreditCardIcon,
  LockClosedIcon,
  PlusIcon,
  StarIcon,
  ArrowTrendingUpIcon,
  UsersIcon,
  CheckCircleIcon,
  ListBulletIcon,
  CalendarIcon,
  CheckIcon,
  EnvelopeIcon,
  UserPlusIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GlobeAltIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';
import { HeartIcon } from '@heroicons/react/24/solid';
import CategoryBar from '../components/home/category-bar';
import Hero from '../components/home/hero';
import Navbar from '../components/home/navbar';
import ShotGrid from '../components/home/shot-grid';
import IdeasAdvice from '../components/home/ideas-advice';
import CircularGallery from '../components/ui/CircularGallery';
import PageWrapper from '../components/home/page-wrapper';

type Testimonial = {
  name: string;
  role: string;
  location: string;
  quote: string;
  avatar?: string;
  accent?: boolean;
  rating: number;
};

const testimonialsColumns: Array<{
  direction: 'up' | 'down';
  items: Testimonial[];
  visibility?: string;
}> = [
  {
    direction: 'up',
    items: [
      {
        name: 'Amina & Hassan',
        role: 'Couple',
        location: 'Dar es Salaam',
        avatar: 'https://i.pravatar.cc/150?img=32',
        quote: 'We were drowning in spreadsheets and vendor emails. TheFesta saved our sanity—the budget tracker showed us exactly where our money was going, and we stayed under budget by 15%.',
        rating: 5,
      },
      {
        name: 'Neema & David',
        role: 'Couple',
        location: 'Arusha',
        avatar: 'https://i.pravatar.cc/150?img=5',
        quote: 'Finally got our RSVP count two weeks before the wedding instead of three days. The automated reminders were a lifesaver. Only wish the mobile app had more customization options.',
        rating: 4,
      },
      {
        name: 'Juma Photography',
        role: 'Photographer',
        location: 'Zanzibar City',
        avatar: 'https://i.pravatar.cc/150?img=12',
        quote: 'Booked 8 weddings in my first month. The client inquiry system filters out tire-kickers—I only talk to couples who actually have their date and budget sorted.',
        rating: 5,
      },
    ],
  },
  {
    direction: 'down',
    visibility: 'hidden md:flex',
    items: [
      {
        name: 'Elegant Events TZ',
        role: 'Wedding Planner',
        location: 'Dar es Salaam',
        avatar: 'https://i.pravatar.cc/150?img=11',
        quote: 'Managing 12 weddings simultaneously used to mean chaos. Now everything—timelines, vendor contacts, payment schedules—lives in one place. My assistants can access what they need without constant calls to me.',
        rating: 5,
      },
      {
        name: 'TheFesta Team',
        role: 'Platform',
        location: 'Tanzania',
        quote: 'Over 10,000 Tanzanian couples trusted us with their big day. Every review, every suggestion, every feature request shapes what we build next. Thank you for growing with us.',
        avatar: 'https://i.pravatar.cc/150?img=55',
        rating: 5,
      },
      {
        name: 'Zawadi Flowers',
        role: 'Florist',
        location: 'Mwanza',
        avatar: 'https://i.pravatar.cc/150?img=9',
        quote: 'The portfolio gallery shows my arrangements beautifully. Three couples this month specifically mentioned they found me through the "Tropical Florals" search. Direct bookings, no commission fees.',
        rating: 5,
      },
    ],
  },
  {
    direction: 'up',
    visibility: 'hidden lg:flex',
    items: [
      {
        name: 'Grace Makena',
        role: 'Photographer',
        location: 'Dodoma',
        avatar: 'https://i.pravatar.cc/150?img=49',
        quote: 'Couple profiles tell me their story before we even meet—how they met, their style preferences, family dynamics. I walk into consultations actually prepared. Closing rate went from 60% to 85%.',
        rating: 5,
      },
      {
        name: 'Sarah & John',
        role: 'Couple',
        location: 'Mbeya',
        avatar: 'https://i.pravatar.cc/150?img=3',
        quote: 'Planned everything in 4 months while I was finishing my Master\'s. The checklist kept us on track, but I wish the vendor messaging was faster—sometimes took a day to hear back.',
        rating: 4,
      },
      {
        name: 'Harmony Sounds DJ',
        role: 'DJ & Entertainment',
        location: 'Dar es Salaam',
        avatar: 'https://i.pravatar.cc/150?img=68',
        quote: 'The booking calendar syncs with my Google Calendar—no more double-bookings. Couples can see my available dates instantly. Reduced back-and-forth emails by at least 70%.',
        rating: 5,
      },
    ],
  },
];

const footerLinks = [
  {
    title: 'Planning Tools',
    links: [
      { label: 'Checklist', href: '#' },
      { label: 'Budgeter', href: '#' },
      { label: 'Guest List', href: '#' },
    ],
  },
  {
    title: 'Marketplace',
    links: [
      { label: 'Venues', href: '#' },
      { label: 'Photographers', href: '#' },
      { label: 'Florists', href: '#' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About Us', href: '#' },
      { label: 'Careers', href: '#' },
      { label: 'Press', href: '#' },
    ],
  },
];

const ideaCategories = [
  'Planning Basics',
  'Wedding Ceremony',
  'Wedding Reception',
  'Wedding Services',
  'Wedding Fashion',
  'Health and Beauty',
  'Wedding Registry',
];

const featuredArticles = [
  {
    title: 'Wedding Registry 101',
    category: 'Wedding Registry',
    description: 'Start your list with confidence and cover every guest and budget.',
    image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=80',
    readTime: '8 min read',
  },
  {
    title: 'The Ultimate Wedding Registry Checklist',
    category: 'Wedding Registry',
    description: 'A comprehensive guide to gifts you will use long after the big day.',
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1200&q=80',
    readTime: '10 min read',
  },
  {
    title: '25 Awesome Spring Wedding Ideas',
    category: 'Trends & Tips',
    description: 'Fresh palettes, florals, and small delights for a seasonal celebration.',
    image: 'https://images.unsplash.com/photo-1499955085172-a104c9463ece?auto=format&fit=crop&w=1200&q=80',
    readTime: '6 min read',
  },
  {
    title: '50 Things Wedding Guests Should NEVER Do',
    category: 'Etiquette',
    description: 'Essential wedding guest etiquette to ensure a perfect celebration.',
    image: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
    readTime: '12 min read',
  },
];

const vendorTiles = [
  {
    title: 'Venues',
    href: '/venues',
    image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=80',
    layout: 'lg:col-span-2 lg:row-span-2',
  },
  {
    title: 'Photo & Film',
    href: '/photography',
    image: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=1400&q=80',
    layout: 'lg:col-span-2',
  },
  {
    title: 'Planning',
    href: '/planning',
    image: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=80',
    layout: 'lg:row-span-2',
  },
  {
    title: 'Florists',
    href: '/florists',
    image: 'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=1400&q=80',
    layout: 'lg:col-span-2',
  },
  {
    title: 'Invitations',
    href: '/invitations',
    image: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?q=80&w=1000&auto=format&fit=crop',
    layout: 'lg:col-span-2',
  },
  {
    title: 'Catering',
    href: '/catering',
    image: 'https://images.unsplash.com/photo-1624300603538-1207400f4116?q=80&w=800&auto=format&fit=crop',
  },
  {
    title: 'Entertainment',
    href: '/entertainment',
    image: 'https://images.unsplash.com/photo-1507878866276-a947ef722fee?auto=format&fit=crop&w=1200&q=80',
    layout: 'lg:row-span-2',
  },
  {
    title: 'Beauty & Attire',
    href: '/beauty',
    image: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=1000&auto=format&fit=crop',
  },
  {
    title: 'Rentals',
    href: '/rentals',
    image: 'https://images.unsplash.com/photo-1623945037233-0761352e0719?q=80&w=1200&auto=format&fit=crop',
    layout: 'lg:col-span-2',
  },
  {
    title: 'Transport',
    href: '/transportation',
    image: 'https://images.unsplash.com/photo-1563273941-831627255776?q=80&w=800&auto=format&fit=crop',
  },
  {
    title: 'Decorations',
    href: '/decorations',
    image: 'https://images.unsplash.com/photo-1542038784456-1ea8e935640e?q=80&w=1000&auto=format&fit=crop',
  },
  {
    title: 'Officiants',
    href: '/officiants',
    image: 'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?q=80&w=900&auto=format&fit=crop',
  },
];

const previewVendorTiles = [
  'Venues',
  'Photo & Film',
  'Planning',
  'Entertainment',
  'Florists',
]
  .map(title => vendorTiles.find(tile => tile.title === title))
  .filter(Boolean) as typeof vendorTiles;

function TestimonialColumn({ direction, items, visibility }: (typeof testimonialsColumns)[number]) {
  const directionClass = direction === 'up' ? 'animate-marquee-up' : 'animate-marquee-down';

  return (
    <div className={`${visibility ?? 'flex'} flex-col gap-6 ${directionClass} hover:[animation-play-state:paused]`}>
      {[...Array(2)].map((_, loopIndex) =>
        items.map((item, index) => {
          const isAccent = item.accent;
          const avatarSrc = item.avatar ?? 'https://picsum.photos/seed/thefesta-avatar/80/80';
          return (
            <article
              key={`${item.name}-${loopIndex}-${index}`}
              className={`glass-card rounded-2xl border p-6 shadow-sm transition-transform duration-300 will-change-transform relative ${
                isAccent
                  ? 'border-slate-800 text-slate-900 shadow-md dark:border-slate-700 dark:text-white'
                  : 'border-slate-100 text-slate-900 dark:border-slate-800 dark:text-white'
              }`}
            >
              {/* Star Rating Badge - Top Right */}
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/50 dark:to-orange-950/50 border border-amber-200/60 dark:border-amber-800/40 shadow-sm backdrop-blur-sm z-10"
                style={{ position: 'absolute', top: '1.25rem', right: '1.25rem' }}
              >
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <StarIcon
                      key={i}
                      className={`h-3 w-3 transition-all ${
                        i < item.rating
                          ? 'fill-amber-400 text-amber-400 dark:fill-amber-500 dark:text-amber-500'
                          : 'fill-slate-200 text-slate-200 dark:fill-slate-700 dark:text-slate-700'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                  {item.rating}.0
                </span>
              </div>

              <div className="mb-4 flex items-center gap-3">
                {isAccent ? (
                  <div className="flex size-10 items-center justify-center rounded-full bg-sage-500 text-white font-sans italic text-lg font-semibold">
                    TF
                  </div>
                ) : (
                  <Image
                    src={avatarSrc}
                    alt={item.name || 'User testimonial'}
                    width={40}
                    height={40}
                    className="size-10 rounded-full object-cover"
                  />
                )}
                <div className="flex-1 pr-16">
                  <div className="flex items-center gap-1 mb-2">
                    <span className={`text-sm font-medium ${isAccent ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                      {item.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                      isAccent
                        ? 'bg-violet-500/20 text-violet-200 border border-violet-400/30'
                        : 'bg-violet-100 text-violet-700 border border-violet-200/60 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-700/40'
                    }`}>
                      {item.role}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                      isAccent
                        ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700/40'
                    }`}>
                      {item.location}
                    </span>
                  </div>
                </div>
              </div>
              <p
                className={`text-sm font-light leading-relaxed ${
                  isAccent ? 'text-slate-200' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                &ldquo;{item.quote}&rdquo;
              </p>
            </article>
          );
        })
      )}
    </div>
  );
}

const BentoCard = ({
  children,
  className = "",
  title,
  subtitle,
  bullets
}: {
  children?: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  bullets?: string[];
}) => {
  return (
    <div className={`bg-gray-50 rounded-[2rem] p-8 flex flex-col ${className} relative overflow-hidden group hover:shadow-lg transition-shadow duration-500`}>
      {(title || subtitle) && (
        <div className="mb-6 z-10 relative">
          {title && <h3 className="text-xl sm:text-2xl font-medium text-gray-900 mb-2 leading-tight dark:text-white">{title}</h3>}
          {subtitle && <p className="text-sm text-gray-500 leading-relaxed dark:text-slate-400">{subtitle}</p>}
          {bullets && (
            <ul className="mt-4 space-y-2">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300">
                  <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                  {b}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex-1 flex items-center justify-center relative z-10 w-full">
        {children}
      </div>
    </div>
  );
};

export default function HomePage() {
  return (
    <PageWrapper>
      <div className="relative bg-festa-base text-gray-900">
        <Navbar />

        <main className="relative">
          <Hero />

        {/* Features Bento Grid Section */}
        <section className="mx-auto max-w-7xl px-6 py-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[minmax(100px,auto)]">

            {/* Wedding Venues - Info Card */}
            <div className="rounded-2xl overflow-hidden bg-white dark:bg-slate-900/40 shadow-xl" style={{ minHeight: '200px' }}>
              <div className="relative w-full h-full flex">
                {/* Image Section - Left Side with Trapezoid Shape */}
                <div className="relative w-2/5 flex-shrink-0" style={{ clipPath: 'polygon(0 0, 85% 0, 100% 100%, 0 100%)' }}>
                  <Image
                    src={venueImage}
                    alt="Wedding venue"
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 40vw"
                  />
                </div>

                {/* Content Section - Right Side */}
                <div className="flex-1 p-4 flex flex-col justify-center">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                    Wedding Venues
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">
                    Search Tanzania&apos;s finest venues. View photos, read reviews, and connect with venues directly.
                  </p>
                  <Link
                    href={"/venues" as any}
                    className="inline-flex items-center gap-2 text-dribbble-pink hover:text-dribbble-pink/80 font-semibold text-sm hover:gap-3 transition-all group/link mt-2"
                  >
                    Find Your Venue
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 group-hover/link:translate-x-1 transition-transform">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>

            {/* Wedding Venues - Horizontal 3D Gallery Card */}
            <BentoCard
              className="bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 relative overflow-hidden group p-0 md:col-span-2"
              title=""
              subtitle=""
            >
              <div className="w-full h-full" style={{ minHeight: '360px' }}>
                <CircularGallery
                  items={[
                    { image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80', text: 'Sea Cliff Hotel' },
                    { image: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=800&q=80', text: 'Hyatt Regency' },
                    { image: 'https://images.unsplash.com/photo-1478146896981-b80fe463b330?w=800&q=80', text: 'Royal Palm Hotel' },
                    { image: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=80', text: 'Four Points by Sheraton' },
                    { image: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=800&q=80', text: 'Kilimanjaro Hotel' },
                    { image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80', text: 'Southern Sun' },
                  ]}
                  bend={1.5}
                  textColor="#1e293b"
                  borderRadius={0.12}
                  scrollEase={0.08}
                  font="700 18px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
                />
              </div>
            </BentoCard>

            {/* Planning tools */}
            <BentoCard
              className="bg-[#f9f9f9] dark:bg-slate-900/40 max-h-[340px]"
              title="Planning tools"
              subtitle="All under control: Checklist, Budget Planner, Seating Chart and much more!"
            >
              <div className="w-full space-y-3">
                {/* Tool Pills Grid */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-800 px-3 py-1.5 shadow-sm border border-gray-200 dark:border-slate-700">
                    <ListBulletIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Checklist</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-800 px-3 py-1.5 shadow-sm border border-gray-200 dark:border-slate-700">
                    <CreditCardIcon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Budget</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-800 px-3 py-1.5 shadow-sm border border-gray-200 dark:border-slate-700">
                    <UsersIcon className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Guests</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-800 px-3 py-1.5 shadow-sm border border-gray-200 dark:border-slate-700">
                    <ClockIcon className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Timeline</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-800 px-3 py-1.5 shadow-sm border border-gray-200 dark:border-slate-700">
                    <ClipboardDocumentListIcon className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Vendors</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-800 px-3 py-1.5 shadow-sm border border-gray-200 dark:border-slate-700">
                    <CalendarIcon className="h-3.5 w-3.5 text-pink-600 dark:text-pink-400" />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Calendar</span>
                  </div>
                </div>

                {/* Tool Preview Cards */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-white dark:bg-slate-800 p-3 shadow-sm border border-gray-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">Budget</span>
                      <span className="rounded-md bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">On Track</span>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">$28.5k / $42k</div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                      <div className="bg-dribbble-pink h-1.5 rounded-full" style={{ width: '68%' }} />
                    </div>
                  </div>
                  <div className="rounded-xl bg-white dark:bg-slate-800 p-3 shadow-sm border border-gray-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">Checklist</span>
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">68%</span>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300">24 of 35 completed</div>
                  </div>
                </div>
              </div>
            </BentoCard>

            {/* Chat App Interface */}
            <BentoCard className="overflow-hidden bg-white dark:bg-slate-900/40 !p-0 relative max-h-[340px]">
              <Image
                src={chatAppImage}
                alt="Chat interface"
                fill
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                className="object-cover"
              />
            </BentoCard>

            {/* Your free wedding website */}
            <BentoCard
              className="bg-[#f9f9f9] dark:bg-slate-900/40 max-h-[340px]"
              title="Your Free Wedding Website"
              subtitle="Share your love story and wedding details with guests—beautifully designed, completely free, and yours to customize."
            >
              <div className="w-full space-y-3">
                {/* Feature Pills Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-800 px-3 py-1.5 shadow-sm border border-gray-200 dark:border-slate-700">
                    <GlobeAltIcon className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Custom Domain</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-800 px-3 py-1.5 shadow-sm border border-gray-200 dark:border-slate-700">
                    <CameraIcon className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Photo Gallery</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-800 px-3 py-1.5 shadow-sm border border-gray-200 dark:border-slate-700">
                    <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">RSVP Tracking</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-800 px-3 py-1.5 shadow-sm border border-gray-200 dark:border-slate-700">
                    <HeartIcon className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Love Story</span>
                  </div>
                </div>

                {/* Template Preview Cards */}
                <div className="grid grid-cols-1 gap-2">
                  <div className="relative h-14 rounded-lg overflow-hidden bg-gray-200 dark:bg-slate-700">
                    <Image
                      src={fluidGradientImage}
                      alt="Classic template"
                      fill
                      className="object-cover"
                    />
                  </div>
                </div>
              </div>
            </BentoCard>

          </div>
        </section>

        {/* Discover & Get Inspired Section */}
        <section className="mb-24 pt-8">
          <CategoryBar />
          <ShotGrid />
        </section>

        {/* Wedding Planning Tools Section */}
        <section className="mx-auto max-w-7xl px-6 py-20 bg-festa-base">
          {/* Section Header */}
          <div className="mb-12 text-center">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
              Plan Your Perfect Day
            </h2>
            <p className="text-base text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              Everything you need to plan your wedding in one beautiful place. Stay organized, on budget, and stress-free from engagement to &ldquo;I do.&rdquo;
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2 gap-x-6 gap-y-6">
            {/* Card 1: Wedding Budget Planner */}
            <section
              className="animate-in delay-200 overflow-hidden sm:p-8 group bg-white dark:bg-slate-800 rounded-3xl pt-6 pr-6 pb-6 pl-6 relative shadow-lg border border-slate-200 dark:border-slate-700"
              style={{ position: 'relative' }}
            >
              <div
                className="pointer-events-none group-hover:opacity-60 transition-opacity duration-500 opacity-40 absolute top-0 right-0 bottom-0 left-0">
                <div className="absolute -left-24 top-10 h-64 w-64 rounded-full bg-slate-400/10 dark:bg-slate-600/20 blur-3xl animate-pulse"></div>
                <div className="absolute right-0 -bottom-10 h-52 w-52 rounded-full bg-slate-300/10 dark:bg-slate-500/20 blur-3xl"></div>
              </div>

              <div className="relative flex flex-col gap-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-normal uppercase tracking-[0.12em] text-slate-600 dark:text-slate-400">
                      Wedding Budget
                    </p>
                    <div className="mt-2 flex items-end gap-3">
                      <p className="text-4xl font-medium tracking-tight text-slate-900 dark:text-white tabular-nums">
                        $35,000
                      </p>
                      <div className="flex items-center gap-1 rounded-full bg-dribbble-pink/10 px-2 py-0.5">
                        <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="14" height="14"
                          viewBox="0 0 24 24">
                          <path fill="currentColor"
                            d="M2 12c0-4.714 0-7.071 1.464-8.536C4.93 2 7.286 2 12 2s7.071 0 8.535 1.464C22 4.93 22 7.286 22 12s0 7.071-1.465 8.535C19.072 22 16.714 22 12 22s-7.071 0-8.536-1.465C2 19.072 2 16.714 2 12"
                            opacity=".5"></path>
                          <path fill="currentColor"
                            d="M14.5 10.75a.75.75 0 0 1 0-1.5H17a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0v-.69l-2.013 2.013a1.75 1.75 0 0 1-2.474 0l-1.586-1.586a.25.25 0 0 0-.354 0L7.53 14.53a.75.75 0 0 1-1.06-1.06l2.293-2.293a1.75 1.75 0 0 1 2.474 0l1.586 1.586a.25.25 0 0 0 .354 0l2.012-2.013z">
                          </path>
                        </svg>
                        <span className="text-xs font-normal tracking-tight text-dribbble-pink">64% spent</span>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      $22,450 spent • $12,550 remaining
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <button className="inline-flex items-center gap-2 rounded-full bg-dribbble-pink px-3 py-1.5 text-xs font-normal tracking-tight text-white shadow-lg hover:bg-dribbble-pink/90 transition-all hover:scale-105">
                      <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="14" height="14" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10s-4.477 10-10 10m-1-11v6h2v-6h3l-4-5l-4 5z" opacity=".5"></path>
                      </svg>
                      Add Expense
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div
                    className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 group/item cursor-pointer">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-normal tracking-tight text-slate-600 dark:text-slate-400">
                        Venue & Catering
                      </p>
                      <span className="text-[0.7rem] font-normal tracking-tight text-dribbble-pink">40%</span>
                    </div>
                    <p className="mt-2 text-xl font-medium tracking-tight text-slate-900 dark:text-white group-hover/item:translate-x-1 transition-transform">
                      $14,000
                    </p>
                    <div
                      className="mt-3 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full w-[40%] bg-gradient-to-t from-dribbble-pink/20 to-transparent opacity-60 group-hover/item:opacity-80 transition-opacity">
                      </div>
                    </div>
                  </div>
                  <div
                    className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 group/item cursor-pointer">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-normal tracking-tight text-slate-600 dark:text-slate-400">
                        Photography & Video
                      </p>
                      <span className="text-[0.7rem] font-normal tracking-tight text-dribbble-pink">15%</span>
                    </div>
                    <p className="mt-2 text-xl font-medium tracking-tight text-slate-900 dark:text-white group-hover/item:translate-x-1 transition-transform">
                      $5,250
                    </p>
                    <div
                      className="mt-3 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full w-[15%] bg-gradient-to-t from-dribbble-pink/20 to-transparent opacity-70 group-hover/item:opacity-90 transition-opacity">
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>8 categories tracked • 3 pending payments</span>
                  <span className="text-dribbble-pink">On budget</span>
                </div>
              </div>

              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-slate-300 dark:via-slate-600 to-transparent opacity-70">
              </div>

              <div className="relative mt-6 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-medium tracking-tight text-slate-900 dark:text-white">
                    Budget Tracker
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300 font-light">
                    Stay on track with smart spending insights and alerts.
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-2 text-[0.7rem] text-slate-500 dark:text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-dribbble-pink animate-pulse"></span>
                  Updated today
                </div>
              </div>
            </section>

            {/* Card 2: Guest List & RSVP Manager */}
            <section
              className="animate-in delay-300 overflow-hidden sm:p-8 bg-white dark:bg-slate-800 rounded-3xl pt-6 pr-6 pb-6 pl-6 relative shadow-lg border border-slate-200 dark:border-slate-700"
              style={{ position: 'relative' }}
            >
              <div className="pointer-events-none absolute inset-0 opacity-40">
                <div
                  className="absolute right-0 top-0 h-60 w-60 -translate-y-10 translate-x-10 rounded-full bg-slate-400/10 dark:bg-slate-600/20 blur-3xl">
                </div>
                <div className="absolute left-1/4 bottom-0 h-40 w-40 translate-y-1/3 rounded-full bg-slate-300/10 dark:bg-slate-500/20 blur-3xl">
                </div>
              </div>

              <div className="relative flex flex-col gap-5">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs font-normal uppercase tracking-[0.12em] text-slate-600 dark:text-slate-400">
                    Guest List Overview
                  </p>
                  <div className="flex items-center gap-2 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 border border-slate-300 dark:border-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-dribbble-pink animate-ping"></span>
                    <span className="text-[0.7rem] font-normal tracking-tight text-slate-900 dark:text-white">Live updates</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div
                    className="relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3 backdrop-blur-sm transition-all hover:border-slate-300 dark:hover:border-slate-600">
                    <div className="flex flex-col gap-1">
                      <p className="text-xs font-normal tracking-tight text-slate-600 dark:text-slate-400">Invited</p>
                      <p className="text-2xl font-medium tracking-tight text-slate-900 dark:text-white">150</p>
                    </div>
                  </div>

                  <div
                    className="relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3 backdrop-blur-sm transition-all hover:border-slate-300 dark:hover:border-slate-600">
                    <div className="flex flex-col gap-1">
                      <p className="text-xs font-normal tracking-tight text-slate-600 dark:text-slate-400">Confirmed</p>
                      <p className="text-2xl font-medium tracking-tight text-dribbble-pink">127</p>
                    </div>
                  </div>

                  <div
                    className="relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3 backdrop-blur-sm transition-all hover:border-slate-300 dark:hover:border-slate-600">
                    <div className="flex flex-col gap-1">
                      <p className="text-xs font-normal tracking-tight text-slate-600 dark:text-slate-400">Pending</p>
                      <p className="text-2xl font-medium tracking-tight text-amber-500">18</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div
                    className="relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4 backdrop-blur-sm transition-all hover:border-slate-300 dark:hover:border-slate-600">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-dribbble-pink/10">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-dribbble-pink">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium tracking-tight text-slate-900 dark:text-white">Family & Close Friends</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">68 guests • 62 confirmed</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-dribbble-pink font-medium">91%</p>
                      </div>
                    </div>
                  </div>

                  <div
                    className="relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4 backdrop-blur-sm transition-all hover:border-slate-300 dark:hover:border-slate-600">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600 dark:text-slate-400">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium tracking-tight text-slate-900 dark:text-white">Work Colleagues</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">42 guests • 38 confirmed</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">90%</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-1 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                  <span>
                    RSVP deadline: <span className="text-dribbble-pink font-normal tracking-tight">March 15</span>
                  </span>
                  <button className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[0.7rem] font-normal tracking-tight text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-dribbble-pink">
                      <path d="M12 5v14"></path>
                      <path d="M5 12h14"></path>
                    </svg>
                    Add guests
                  </button>
                </div>
              </div>

              <div className="relative mt-6">
                <h2 className="text-lg font-medium tracking-tight text-slate-900 dark:text-white">
                  Guest Manager
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 font-light">
                  Track RSVPs, manage meal preferences, and organize seating.
                </p>
              </div>
            </section>
          </div>

          {/* Second Row: Analytics, Vault, Multi-Currency */}
          <div className="grid gap-6 md:grid-cols-3 mt-6 gap-x-6 gap-y-6">
            {/* Card 3: Wedding Checklist */}
            <section
              className="animate-in delay-400 overflow-hidden sm:p-6 bg-white dark:bg-slate-800 rounded-3xl pt-5 pr-5 pb-5 pl-5 relative hover-card-effect shadow-lg border border-slate-200 dark:border-slate-700"
              style={{ position: 'relative' }}
            >
              <div className="pointer-events-none absolute inset-0 opacity-30">
                <div className="absolute -right-10 top-0 h-40 w-40 rounded-full bg-slate-400/10 dark:bg-slate-600/20 blur-3xl"></div>
              </div>

              <div className="relative h-full flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-normal uppercase tracking-[0.12em] text-slate-600 dark:text-slate-400">
                    Planning Progress
                  </p>
                  <span className="rounded-full bg-dribbble-pink/10 px-2 py-0.5 text-[0.7rem] font-normal tracking-tight text-dribbble-pink">
                    68% done
                  </span>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3 flex-grow flex flex-col">
                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mb-3">
                    <span>Upcoming tasks</span>
                    <span>4 this week</span>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-dribbble-pink">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      </div>
                      <span className="text-xs text-slate-900 dark:text-white line-through">Book photographer</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-dribbble-pink bg-white dark:bg-slate-800"></div>
                      <span className="text-xs text-slate-900 dark:text-white">Send invitations</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"></div>
                      <span className="text-xs text-slate-600 dark:text-slate-400">Order wedding cake</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-1">
                  <h3 className="text-base font-medium tracking-tight text-slate-900 dark:text-white">
                    Wedding Checklist
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 font-light">
                    Stay organized with deadline reminders and task tracking.
                  </p>
                </div>
              </div>
            </section>

            {/* Card 4: Vendor Manager */}
            <section
              className="animate-in delay-500 overflow-hidden sm:p-6 bg-white dark:bg-slate-800 rounded-3xl pt-5 pr-5 pb-5 pl-5 relative hover-card-effect group shadow-lg border border-slate-200 dark:border-slate-700"
              style={{ position: 'relative' }}
            >
              <div className="pointer-events-none absolute inset-0 opacity-40">
                <div className="absolute left-1/2 top-0 h-40 w-40 -translate-x-1/2 rounded-full bg-slate-400/10 dark:bg-slate-600/20 blur-3xl">
                </div>
              </div>

              <div className="relative flex h-full flex-col">
                <div className="flex flex-col items-center gap-3 pt-2">
                  <div
                    className="relative flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 group-hover:border-dribbble-pink transition-colors">
                    <div className="absolute inset-3 rounded-full bg-dribbble-pink/20 blur-md group-hover:blur-lg transition-all">
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-700 group-hover:scale-110 text-dribbble-pink">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                      <circle cx="9" cy="7" r="4"></circle>
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-dribbble-pink animate-pulse"></span>
                    <span className="font-normal tracking-tight">8 vendors booked</span>
                  </div>
                </div>

                <div className="mt-4 space-y-1.5 text-center">
                  <h3 className="text-base font-medium tracking-tight text-slate-900 dark:text-white">
                    Vendor Hub
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 font-light">
                    Track contracts, payments, and communications in one place.
                  </p>
                </div>

                <div className="mt-4 grid gap-3 text-[0.7rem] text-slate-600 dark:text-slate-400">
                  <div
                    className="flex items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 transition-colors hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-dribbble-pink">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                      </svg>
                      <span>Contracts signed</span>
                    </div>
                    <span className="font-normal tracking-tight text-dribbble-pink">5 of 8</span>
                  </div>
                  <div
                    className="flex items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 transition-colors hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-dribbble-pink">
                        <line x1="12" y1="1" x2="12" y2="23"></line>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                      </svg>
                      <span>Payments due</span>
                    </div>
                    <span className="font-normal tracking-tight text-amber-500">$8,200</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Card 5: Wedding Website Stats */}
            <section
              className="animate-in delay-500 overflow-hidden sm:p-6 bg-white dark:bg-slate-800 rounded-3xl pt-5 pr-5 pb-5 pl-5 relative hover-card-effect shadow-lg border border-slate-200 dark:border-slate-700"
              style={{ position: 'relative' }}
            >
              <div className="pointer-events-none absolute inset-0 opacity-40">
                <div
                  className="absolute right-0 bottom-0 h-44 w-44 translate-y-10 translate-x-6 rounded-full bg-slate-400/10 dark:bg-slate-600/20 blur-3xl">
                </div>
              </div>

              <div className="relative flex h-full flex-col">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-normal uppercase tracking-[0.12em] text-slate-600 dark:text-slate-400">
                    Website Activity
                  </p>
                  <span className="text-[0.7rem] font-normal tracking-tight text-dribbble-pink">
                    Live
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  <div
                    className="relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2.5 transition-all hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 hover:scale-[1.02] cursor-pointer">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-dribbble-pink/10">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-dribbble-pink">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        </span>
                        <div>
                          <p className="text-xs font-normal tracking-tight text-slate-600 dark:text-slate-400">Page Views</p>
                          <p className="text-[0.7rem] text-slate-500 dark:text-slate-500">Last 7 days</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium tracking-tight text-dribbble-pink">1,247</p>
                        <p className="text-[0.7rem] text-slate-500 dark:text-slate-500">+12%</p>
                      </div>
                    </div>
                  </div>

                  <div
                    className="relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2.5 transition-all hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 hover:scale-[1.02] cursor-pointer">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600 dark:text-slate-400">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                            <circle cx="8.5" cy="8.5" r="1.5"></circle>
                            <polyline points="21 15 16 10 5 21"></polyline>
                          </svg>
                        </span>
                        <div>
                          <p className="text-xs font-normal tracking-tight text-slate-600 dark:text-slate-400">Gallery Photos</p>
                          <p className="text-[0.7rem] text-slate-500 dark:text-slate-500">Total uploaded</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium tracking-tight text-slate-900 dark:text-white">84</p>
                        <p className="text-[0.7rem] text-slate-500 dark:text-slate-500">3 albums</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-1">
                  <h3 className="text-base font-medium tracking-tight text-slate-900 dark:text-white">
                    Wedding Website
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 font-light">
                    Share your story with beautiful, customizable templates.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </section>

        {/* Wedding Website Builder Section */}
        <section className="overflow-hidden group/section sm:p-10 bg-white max-w-7xl border-slate-200/60 border rounded-[2.5rem] mt-24 mr-auto mb-44 ml-auto pt-6 pr-6 pb-6 pl-6 relative">
          {/* Ambient Background Glow */}
          <div className="pointer-events-none -translate-x-1/2 blur-[100px] w-full h-full max-w-3xl absolute top-0 left-1/2"></div>

          {/* Grid Pattern */}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#cbd5e120_1px,transparent_1px),linear-gradient(to_bottom,#cbd5e120_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>

          <div className="relative z-10 grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            {/* Left Content */}
            <div className="flex h-full flex-col justify-between">
              <div>
                <h2 className="text-4xl font-medium leading-[0.95] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl dark:text-white">
                  Your wedding website, <br />beautifully simple.
                </h2>

                {/* Feature List with Dividers */}
                <div className="relative mt-10">
                  <div className="absolute top-1/2 h-px w-full -translate-y-1/2 bg-slate-200"></div>
                  <div className="relative z-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
                    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white py-2 pr-4 backdrop-blur-sm sm:border-none sm:bg-transparent sm:p-0">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                          <line x1="8" y1="21" x2="16" y2="21"></line>
                          <line x1="12" y1="17" x2="12" y2="21"></line>
                        </svg>
                      </div>
                      <span className="text-sm font-medium text-slate-700">Design Templates</span>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white py-2 pr-4 backdrop-blur-sm sm:border-none sm:bg-transparent sm:p-0">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700">
                        <CheckCircleIcon className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-medium text-slate-700">RSVP Manager</span>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white py-2 pr-4 backdrop-blur-sm sm:border-none sm:bg-transparent sm:p-0">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                          <circle cx="8.5" cy="8.5" r="1.5"></circle>
                          <polyline points="21 15 16 10 5 21"></polyline>
                        </svg>
                      </div>
                      <span className="text-sm font-medium text-slate-700">Photo Gallery</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-10 grid grid-cols-1 gap-8 border-t border-slate-200 pt-8 sm:grid-cols-2">
                <div>
                  <p className="text-base font-light leading-relaxed text-slate-600">
                    Choose a design, share your details, manage RSVPs, and link your registries—all in one easy-to-use place.
                  </p>
                  <button className="group mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-dribbble-pink px-5 text-sm font-medium tracking-tight text-white transition-all hover:scale-105 hover:bg-dribbble-pink/90 active:scale-95">
                    <span>Start your website</span>
                    <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </button>
                </div>

                <div className="hidden border-l border-slate-200 pl-8 sm:block">
                  <div className="flex flex-col gap-4">
                    <div>
                      <div className="text-2xl font-medium tracking-tight text-slate-900">50+</div>
                      <div className="mt-1 text-xs uppercase tracking-wider text-slate-500">Templates</div>
                    </div>
                    <div>
                      <div className="text-2xl font-medium tracking-tight text-slate-900">10K+</div>
                      <div className="mt-1 text-xs uppercase tracking-wider text-slate-500">Active Sites</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Content: Card Grid */}
            <div className="grid grid-cols-2 gap-4 relative">
              {/* Card 1 - Design Templates */}
              <div className="group overflow-hidden transition-all hover:scale-[1.02] bg-white h-[220px] border-slate-200 border rounded-2xl relative shadow-lg hover:shadow-xl">
                <Image
                  src={beautifulDesignsImage}
                  alt="Beautiful wedding designs"
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                />

                <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 to-transparent pt-16 pb-4 px-4">
                  <h3 className="text-lg font-semibold tracking-tight text-white drop-shadow-lg">Beautiful Designs</h3>
                  <p className="mt-0.5 text-xs font-medium text-white/90 drop-shadow">Modern, elegant, rustic & more</p>
                </div>
              </div>

              {/* Card 2 - RSVP Tracking */}
              <div className="group relative h-[220px] overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all hover:scale-[1.02] shadow-lg hover:shadow-xl">
                <Image
                  src={rsvpTrackingImage}
                  alt="RSVP tracking"
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                />

                <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 to-transparent pt-16 pb-4 px-4">
                  <h3 className="text-lg font-semibold tracking-tight text-white drop-shadow-lg">RSVP Tracking</h3>
                  <p className="mt-0.5 text-xs font-medium text-white/90 drop-shadow">Real-time guest responses</p>
                </div>
              </div>

              {/* Card 3 - Photo Gallery */}
              <div className="group overflow-hidden transition-all hover:scale-[1.02] bg-white h-[220px] border-slate-200 border rounded-2xl relative shadow-lg hover:shadow-xl">
                <Image
                  src={photoGalleryImage}
                  alt="Photo gallery"
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                />

                <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 to-transparent pt-16 pb-4 px-4">
                  <h3 className="text-lg font-semibold tracking-tight text-white drop-shadow-lg">Photo Gallery</h3>
                  <p className="mt-0.5 text-xs font-medium text-white/90 drop-shadow">Share your love story</p>
                </div>
              </div>

              {/* Card 4 - Registry Links */}
              <div className="group overflow-hidden transition-all hover:scale-[1.02] bg-white h-[220px] border-slate-200 border rounded-2xl relative shadow-lg hover:shadow-xl">
                <Image
                  src={registryLinksImage}
                  alt="Registry links"
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                />

                <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 to-transparent pt-16 pb-4 px-4">
                  <h3 className="text-lg font-semibold tracking-tight text-white drop-shadow-lg">Registry Links</h3>
                  <p className="mt-0.5 text-xs font-medium text-white/90 drop-shadow">Connect all your registries</p>
                </div>
              </div>
            </div>
          </div>

          <div className="pointer-events-none group-hover:opacity-70 transition-opacity duration-500 opacity-50 absolute top-0 right-0 bottom-0 left-0">
            <div className="absolute -left-24 top-10 h-64 w-64 rounded-full bg-slate-100/30 blur-3xl animate-pulse"></div>
            <div className="absolute right-0 -bottom-10 h-52 w-52 rounded-full bg-slate-100/30 blur-3xl"></div>
          </div>
        </section>

        {/* Ideas & Advice - Instagram Slides Style */}
        <IdeasAdvice />

        {/* Testimonials */}
        <section className="relative mb-24 py-16 bg-festa-base">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-12 flex items-center justify-between">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl dark:text-white">
                  Community <span className="font-normal text-slate-400 dark:text-slate-500">Stories</span>
                </h2>
                <p className="text-base leading-relaxed text-slate-600 dark:text-slate-400">
                  Honest feedback from couples and vendors who&apos;ve been there. The budget wins, the timeline crunches, and who delivered when it mattered.
                </p>
              </div>
              <div className="hidden items-center gap-2 text-slate-400 sm:flex">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                </svg>
                <span className="text-sm">Real feedback</span>
              </div>
            </div>

            <div className="relative h-[520px] overflow-hidden">
              <div className="grid h-full grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {testimonialsColumns.map(column => (
                  <TestimonialColumn key={column.direction + (column.visibility ?? 'all')} {...column} />
                ))}
              </div>
            </div>
          </div>
        </section>

      </main>

      <footer className="border-t border-slate-200/60 bg-slate-900/[0.03] pb-8 pt-16 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/40">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-12 grid grid-cols-2 gap-8 md:grid-cols-4 lg:grid-cols-5">
            <div className="col-span-2 lg:col-span-2">
              <a href="#" className="mb-6 inline-block">
                <span className="font-display text-xl font-medium text-slate-900 dark:text-white">TheFesta</span>
              </a>
              <p className="mb-6 max-w-xs text-sm text-slate-500 dark:text-slate-300">
                The ultimate wedding planning ecosystem. Connecting couples with top-tier vendors for unforgettable
                celebrations.
              </p>
              <div className="flex gap-4 text-slate-400 dark:text-slate-500">
                <a href="#" className="transition-colors hover:text-sage-600 dark:hover:text-sage-400" aria-label="Facebook">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                </a>
                <a href="#" className="transition-colors hover:text-sage-600 dark:hover:text-sage-400" aria-label="X">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
                <a href="#" className="transition-colors hover:text-sage-600 dark:hover:text-sage-400" aria-label="Instagram">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" />
                  </svg>
                </a>
                <a href="#" className="transition-colors hover:text-sage-600 dark:hover:text-sage-400" aria-label="YouTube">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                </a>
                <a href="#" className="transition-colors hover:text-sage-600 dark:hover:text-sage-400" aria-label="TikTok">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                  </svg>
                </a>
              </div>
            </div>

            {footerLinks.map(section => (
              <div key={section.title}>
                <h4 className="mb-4 font-medium text-slate-900 dark:text-white">{section.title}</h4>
                <ul className="space-y-3 text-sm text-slate-500 dark:text-slate-300">
                  {section.links.map(link => (
                    <li key={link.label}>
                      <a href={link.href} className="transition-colors hover:text-sage-600 dark:hover:text-sage-400">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-100 pt-8 dark:border-slate-800">
            <div className="flex flex-col items-center justify-between gap-4 text-xs text-slate-400 md:flex-row">
              {/* Left - Legal Links */}
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 md:justify-start">
                <a href="#" className="text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
                  Privacy Policy
                </a>
                <a href="#" className="text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
                  Terms of Service
                </a>
                <a href="#" className="text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
                  Cookie Policy
                </a>
                <a href="#" className="text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
                  Accessibility
                </a>
                <a href="#" className="text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
                  Sitemap
                </a>
              </div>

              {/* Center - Copyright */}
              <p className="whitespace-nowrap">© 2024 TheFesta Inc. All rights reserved.</p>

              {/* Right - Made with love */}
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span>Made with</span>
                <HeartIcon className="h-3 w-3 text-rose-400" fill="currentColor" />
                <span>for couples everywhere.</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
    </PageWrapper>
  );
}
