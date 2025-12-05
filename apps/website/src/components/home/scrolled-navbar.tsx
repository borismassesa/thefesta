'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { NAV_LINKS } from '../../app/home-data';

type ScrolledNavbarProps = {
  isVisible: boolean;
};

const ScrolledNavbar = ({ isVisible }: ScrolledNavbarProps) => {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-[60] border-b border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-950 transition-transform duration-300 ${
        isVisible ? 'translate-y-0' : '-translate-y-full'
      }`}
    >
      <div className="mx-auto max-w-[1400px] px-6 py-4">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <Link href="/" className="font-display text-2xl text-gray-900 hover:text-gray-700 dark:text-white dark:hover:text-slate-300">
            TheFesta
          </Link>

          {/* Navigation */}
          <nav className="hidden items-center gap-4 text-sm font-medium text-gray-700 dark:text-slate-300 lg:flex xl:gap-6">
            {NAV_LINKS.map(link => (
              <a key={link.label} href={link.href} className="whitespace-nowrap py-2 transition-colors hover:text-gray-900 dark:hover:text-white">
                {link.label}
              </a>
            ))}
          </nav>

          {/* Search Bar */}
          <div className="relative ml-auto max-w-sm w-80">
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
  );
};

export default ScrolledNavbar;
