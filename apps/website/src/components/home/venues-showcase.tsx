'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPinIcon, CheckBadgeIcon, UsersIcon, StarIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import CircularGallery from '../ui/CircularGallery';

const VENUE_STATS = [
  {
    label: 'Verified Venues',
    value: '500+',
    icon: CheckBadgeIcon,
    description: 'Handpicked and verified'
  },
  {
    label: 'Average Rating',
    value: '4.8',
    icon: StarIcon,
    description: 'From real couples'
  },
  {
    label: 'Locations',
    value: '20+',
    icon: MapPinIcon,
    description: 'Across Tanzania'
  }
];

const FEATURED_VENUES = [
  {
    image: 'https://images.unsplash.com/photo-1519167758481-83f29da8c3c1?w=800&q=80',
    text: 'Oceanfront Luxury'
  },
  {
    image: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=800&q=80',
    text: 'Garden Paradise'
  },
  {
    image: 'https://images.unsplash.com/photo-1478146896981-b80fe463b330?w=800&q=80',
    text: 'Historic Elegance'
  },
  {
    image: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=80',
    text: 'Rooftop Romance'
  },
  {
    image: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=800&q=80',
    text: 'Beachside Bliss'
  },
  {
    image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80',
    text: 'Countryside Charm'
  }
];

const VENUE_FEATURES = [
  {
    title: 'Verified Reviews',
    description: 'Read authentic reviews from real couples who celebrated their special day',
    icon: '✓'
  },
  {
    title: 'Smart Filters',
    description: 'Find venues by guest capacity, location, style, and budget',
    icon: '⚡'
  },
  {
    title: 'Direct Contact',
    description: 'Message venue coordinators instantly to check availability and pricing',
    icon: '💬'
  },
  {
    title: 'Virtual Tours',
    description: 'Explore stunning photo galleries and 360° venue tours before you visit',
    icon: '📸'
  }
];

const VenuesShowcase = () => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-white via-slate-50 to-white dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 py-20">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-100/20 via-transparent to-transparent dark:from-purple-900/10" />

      <div className="relative mx-auto max-w-7xl px-6">
        {/* Header Section */}
        <div className="mx-auto max-w-3xl text-center mb-16">
          <span className="inline-block mb-4 px-4 py-1.5 bg-dribbble-pink/10 text-dribbble-pink text-sm font-semibold rounded-full border border-dribbble-pink/20">
            Wedding Venues
          </span>

          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 dark:text-white mb-6">
            Find Your Dream
            <span className="block bg-gradient-to-r from-dribbble-pink via-purple-500 to-pink-500 bg-clip-text text-transparent">
              Wedding Venue
            </span>
          </h2>

          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl mx-auto">
            Browse Tanzania&apos;s finest wedding venues. From stunning beachfront resorts to elegant hotel ballrooms, find the perfect backdrop for your love story.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {VENUE_STATS.map((stat, index) => (
            <div
              key={index}
              className="group relative bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-200 dark:border-slate-700 hover:border-dribbble-pink/50 hover:-translate-y-1"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-dribbble-pink/10 rounded-xl flex items-center justify-center group-hover:bg-dribbble-pink/20 transition-colors">
                  <stat.icon className="w-6 h-6 text-dribbble-pink" />
                </div>
                <div className="flex-1">
                  <div className="text-3xl font-bold text-slate-900 dark:text-white mb-1">
                    {stat.value}
                  </div>
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {stat.label}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {stat.description}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 3D Gallery Section */}
        <div className="mb-16">
          <div className="bg-gradient-to-r from-slate-900 via-purple-900 to-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-700">
            {mounted && (
              <div style={{ height: '500px', position: 'relative' }}>
                <CircularGallery
                  items={FEATURED_VENUES}
                  bend={3}
                  textColor="#ffffff"
                  borderRadius={0.08}
                  scrollEase={0.05}
                  font="700 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
                />
              </div>
            )}

            <div className="px-8 py-6 bg-slate-900/50 backdrop-blur-sm border-t border-white/10">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="text-white">
                  <p className="text-sm font-medium opacity-80 mb-1">Interactive Gallery</p>
                  <p className="text-xs opacity-60">Scroll or drag to explore stunning venues</p>
                </div>
                <Link
                  href={"/venues" as any}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-dribbble-pink hover:bg-dribbble-pink/90 text-white rounded-full font-semibold text-sm transition-all hover:gap-3 shadow-lg hover:shadow-xl"
                >
                  Browse All Venues
                  <ArrowRightIcon className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mb-12">
          <h3 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white text-center mb-10">
            Why Choose TheFesta for Your Venue Search
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {VENUE_FEATURES.map((feature, index) => (
              <div
                key={index}
                className="group relative bg-white dark:bg-slate-800 rounded-xl p-6 hover:shadow-lg transition-all duration-300 border border-slate-200 dark:border-slate-700 hover:border-dribbble-pink/30"
              >
                <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">
                  {feature.icon}
                </div>
                <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                  {feature.title}
                </h4>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-gradient-to-r from-dribbble-pink via-purple-500 to-pink-500 rounded-2xl p-8 md:p-12 text-center shadow-xl">
          <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
            Ready to Find Your Perfect Venue?
          </h3>
          <p className="text-white/90 text-lg mb-8 max-w-2xl mx-auto">
            Join thousands of couples who found their dream wedding venue on TheFesta. Start your journey today.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href={"/venues" as any}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-dribbble-pink rounded-full font-bold text-base hover:bg-slate-50 transition-all hover:gap-3 shadow-lg hover:shadow-2xl"
            >
              Explore All Venues
              <ArrowRightIcon className="w-5 h-5" />
            </Link>
            <Link
              href={"/vendors?category=Venues" as any}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white/10 backdrop-blur-sm text-white border-2 border-white/30 rounded-full font-bold text-base hover:bg-white/20 transition-all"
            >
              Filter by Location
              <MapPinIcon className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default VenuesShowcase;
