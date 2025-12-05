'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ShareIcon,
  HeartIcon,
  MapPinIcon,
  ChevronLeftIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import VendorPageWrapper from './vendor-page-wrapper';
import VendorStickyNav from './vendor-sticky-nav';

interface VendorProfileLayoutProps {
  category: string;
  businessName: string;
  bio: string;
  location: { city: string; country: string };
  stats: { averageRating: number; reviewCount: number };
  priceRangeDisplay: string;
  photoGallery: ReactNode;
  children: ReactNode;
  sidebar: ReactNode;
}

const VendorProfileLayout = ({
  category,
  businessName,
  bio,
  location,
  stats,
  priceRangeDisplay,
  photoGallery,
  children,
  sidebar,
}: VendorProfileLayoutProps) => {
  const [isNavHidden, setIsNavHidden] = useState(false);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <VendorPageWrapper isNavHidden={isNavHidden}>
        {/* Breadcrumb and Search Bar */}
        <div className="border-b border-gray-200 dark:border-slate-800">
          <div className="mx-auto max-w-7xl px-4 lg:px-8 py-4">
            <div className="flex items-center justify-between gap-4">
              {/* Breadcrumb */}
              <Link
                href="/vendors"
                className="flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900 dark:text-slate-300 dark:hover:text-white transition-colors"
              >
                <ChevronLeftIcon className="h-4 w-4" />
                <span>{category}</span>
              </Link>

              {/* Search Bar */}
              <div className="flex items-center gap-2 flex-1 max-w-2xl">
                <div className="relative flex-1">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search vendors, styles, details"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:border-gray-900 dark:focus:border-white dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder={`${location.city}, ${location.country}`}
                    className="w-40 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:border-gray-900 dark:focus:border-white dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <button className="px-4 py-2 bg-dribbble-pink hover:bg-dribbble-pink/90 text-white rounded-md text-sm font-medium transition-colors">
                  Search
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Photo Gallery */}
        {photoGallery}

        {/* Vendor Header Info */}
        <div className="mx-auto max-w-7xl px-4 lg:px-8 py-6 border-b border-gray-200 dark:border-slate-800">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{businessName}</h1>
              <h2 className="text-lg text-gray-600 dark:text-slate-400 mb-3">{bio}</h2>
              <div className="flex items-center gap-4 flex-wrap">
                {/* Rating */}
                <div className="flex items-center gap-2">
                  <div className="flex text-dribbble-pink">
                    {[...Array(5)].map((_, i) => (
                      <StarSolidIcon key={i} className="w-5 h-5" />
                    ))}
                  </div>
                  <span className="font-bold text-gray-900 dark:text-white">{stats.averageRating || 5.0}</span>
                  <span className="text-gray-600 dark:text-slate-400">
                    · {stats.reviewCount || 0} reviews
                  </span>
                </div>
                {/* Location */}
                <div className="flex items-center gap-1 text-gray-600 dark:text-slate-400">
                  <MapPinIcon className="w-4 h-4" />
                  <Link href={`#contact`} className="hover:text-gray-900 dark:hover:text-white underline">
                    {location.city}, {location.country}
                  </Link>
                </div>
              </div>

              {/* Pricing Info */}
              <div className="mt-6 space-y-4">
                <div className="flex items-center gap-8">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">$</span>
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">{priceRangeDisplay} starting price</p>
                      <Link href="#pricing" className="text-sm text-gray-600 dark:text-slate-400 underline hover:text-gray-900 dark:hover:text-white">
                        See details
                      </Link>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">👥</span>
                    <p className="text-gray-900 dark:text-white font-medium">300+ guests</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-gray-700 dark:text-slate-300">
                  <span className="text-xl">🏛️</span>
                  <p>Holds ceremonies and receptions</p>
                </div>
              </div>
            </div>

            {/* Share and Save buttons */}
            <div className="hidden md:flex gap-2">
              <button className="p-3 rounded-full border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                <ShareIcon className="w-6 h-6 text-gray-700 dark:text-slate-300" />
              </button>
              <button className="p-3 rounded-full border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                <HeartIcon className="w-6 h-6 text-gray-700 dark:text-slate-300" />
              </button>
            </div>
          </div>
        </div>

        {/* Sticky Navigation Tabs */}
        <VendorStickyNav onStickyChange={setIsNavHidden} />

        {/* Main Content Area */}
        <div className="mx-auto max-w-7xl px-4 lg:px-8 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Content Sections */}
            <div className="lg:col-span-2 space-y-10">{children}</div>

            {/* Right Column - Sticky Sidebar */}
            <div className="lg:col-span-1 hidden lg:block">
              <div className="sticky top-20">{sidebar}</div>
            </div>
          </div>
        </div>
      </VendorPageWrapper>
    </div>
  );
};

export default VendorProfileLayout;
