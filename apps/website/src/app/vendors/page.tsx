'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { EyeIcon, AdjustmentsHorizontalIcon, SparklesIcon, MagnifyingGlassIcon, BookmarkIcon } from '@heroicons/react/24/outline';
import { HeartIcon, BookmarkIcon as BookmarkSolidIcon } from '@heroicons/react/24/solid';
import { CATEGORIES, NAV_LINKS } from '../home-data';
import VendorMarquee from '../../components/home/vendor-marquee';
import { getVendors } from '../../lib/db/vendors';
import type { Vendor } from '../../types/database.types';

const VENDOR_CATEGORIES = [
  'All Vendors',
  'Venues',
  'Photographers',
  'Videographers',
  'Caterers',
  'Wedding Planners',
  'Florists',
  'DJs & Music',
  'Beauty & Makeup',
  'Bridal Salons',
  'Cake & Desserts',
  'Decorators',
  'Officiants',
  'Rentals',
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
      { label: 'Contact', href: '#' },
    ],
  },
];

const VendorsPageContent = () => {
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get('category');
  const [activeCategory, setActiveCategory] = useState(categoryParam || 'All Vendors');
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (categoryParam) {
      setActiveCategory(categoryParam);
    }
  }, [categoryParam]);

  useEffect(() => {
    async function fetchVendors() {
      try {
        setLoading(true);
        const data = await getVendors({
          category: activeCategory === 'All Vendors' ? undefined : activeCategory as any,
        });
        setVendors(data);
      } catch (error) {
        console.error('Error fetching vendors:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchVendors();
  }, [activeCategory]);

  const filteredVendors = vendors;

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* Header matching Dribbble style */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto max-w-[1400px] px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Logo */}
            <Link href="/" className="font-display text-2xl text-gray-900 hover:text-gray-700 dark:text-white dark:hover:text-slate-300">
              TheFesta
            </Link>

            {/* Search Bar */}
            <div className="relative flex-1 max-w-sm">
              <input
                type="text"
                placeholder="What are you looking for?"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-full border border-gray-200 bg-gray-50 py-1.5 pl-4 pr-10 text-sm text-gray-900 placeholder-gray-500 transition-colors focus:border-gray-300 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder-slate-400 dark:focus:border-slate-600"
              />
              <button className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-dribbble-pink text-white hover:bg-dribbble-pink/90">
                <MagnifyingGlassIcon className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="hidden items-center gap-4 text-sm font-medium text-gray-700 dark:text-slate-300 lg:flex xl:gap-6">
              {NAV_LINKS.filter(link => link.label !== 'Vendors').map(link => (
                <a key={link.label} href={link.href} className="whitespace-nowrap py-2 transition-colors hover:text-gray-900 dark:hover:text-white">
                  {link.label}
                </a>
              ))}
            </nav>

            {/* Auth Buttons */}
            <div className="flex items-center gap-3">
              <a
                href="#"
                className="text-sm font-semibold text-gray-700 hover:text-gray-900 dark:text-slate-300 dark:hover:text-white"
              >
                Sign up
              </a>
              <a
                href="#"
                className="rounded-full bg-gray-900 px-5 py-2 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-slate-100"
              >
                Log in
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Vendor Type Filter Bar */}
      <div className="border-b border-gray-100 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto max-w-[1400px] px-6">
          <div className="py-4">
            <div className="flex items-center justify-between gap-4">
              {/* Left: All Vendor Type Buttons */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                {VENDOR_CATEGORIES.map((vendorType) => (
                  <button
                    key={vendorType}
                    type="button"
                    onClick={() => setActiveCategory(vendorType)}
                    className={`flex-shrink-0 whitespace-nowrap rounded-full px-5 py-2 text-sm font-medium transition-all ${
                      activeCategory === vendorType
                        ? 'bg-black text-white hover:bg-gray-900 dark:bg-white dark:text-black dark:hover:bg-gray-100'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    {vendorType}
                  </button>
                ))}
              </div>

              {/* Right: Filters Button */}
              <button
                type="button"
                onClick={() => setShowFiltersModal(true)}
                className="flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:shadow dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600"
              >
                <AdjustmentsHorizontalIcon className="h-4 w-4" />
                Filters
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Vendor Grid */}
      <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-gray-500 dark:text-slate-400">Loading vendors...</p>
          </div>
        ) : filteredVendors.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-gray-500 dark:text-slate-400">No vendors found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {filteredVendors.map(vendor => (
              <div key={vendor.id} className="flex flex-col gap-3">
                <Link href={`/vendors/${vendor.slug}`}>
                  <article className="group relative aspect-[4/3] overflow-hidden rounded-[22px] bg-white shadow-sm ring-1 ring-gray-100 transition duration-300 hover:-translate-y-1 hover:shadow-md dark:bg-slate-900/60 dark:ring-slate-800 cursor-pointer">
                    <Image
                      src={vendor.coverImage || 'https://picsum.photos/seed/default/600/450'}
                      alt={vendor.businessName || 'Wedding vendor'}
                      fill
                      sizes="(min-width: 1280px) 24vw, (min-width: 768px) 48vw, 100vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      priority={false}
                    />
                    {/* Hover Overlay with Save & Like Buttons */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                      <div className="absolute bottom-3 right-3 flex gap-2">
                        <button
                          onClick={(e) => e.preventDefault()}
                          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-700 shadow-lg transition-all hover:bg-white hover:scale-110 dark:bg-white dark:text-gray-700">
                          <BookmarkIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={(e) => e.preventDefault()}
                          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-700 shadow-lg transition-all hover:bg-white hover:scale-110 hover:text-rose-500 dark:bg-white dark:text-gray-700">
                          <HeartIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </article>
                </Link>
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <Image
                      src={vendor.logo || `https://ui-avatars.com/api/?name=${encodeURIComponent(vendor.businessName)}&background=random&size=48`}
                      alt={`${vendor.businessName} logo`}
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                    <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{vendor.businessName}</span>
                    {vendor.tier !== 'free' && (
                      <span className="rounded bg-gray-200 px-1.5 text-[10px] font-bold uppercase text-gray-500 dark:bg-slate-800 dark:text-slate-200">
                        {vendor.tier}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs font-semibold text-gray-600 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1">
                      <HeartIcon className="h-3.5 w-3.5 text-gray-400 dark:text-slate-300" />
                      {vendor.stats?.saveCount || 0}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <EyeIcon className="h-3.5 w-3.5" />
                      {((vendor.stats?.viewCount || 0) / 1000).toFixed(1)}k
                    </span>
                  </div>
                </div>
                <div className="px-1">
                  <p className="text-sm text-gray-600 line-clamp-1 dark:text-slate-300">{vendor.category}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sign up CTA */}
      <div className="border-t border-gray-100 bg-white py-16 dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto max-w-[1400px] px-6 text-center">
          <button className="rounded-full bg-gray-900 px-8 py-3.5 text-base font-semibold text-white transition-all hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-slate-100">
            Sign up to continue
          </button>
        </div>
      </div>

      {/* Vendor Marquee */}
      <VendorMarquee />

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-white py-12 dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto max-w-[1400px] px-6">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {footerLinks.map(section => (
              <div key={section.title}>
                <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
                  {section.title}
                </h3>
                <ul className="space-y-3">
                  {section.links.map(link => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
};

const VendorsPage = () => {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VendorsPageContent />
    </Suspense>
  );
};

export default VendorsPage;
