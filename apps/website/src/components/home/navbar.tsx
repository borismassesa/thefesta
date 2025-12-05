'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { NAV_LINKS } from '../../app/home-data';

const Navbar = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const updateNavbarHeight = () => {
      if (containerRef.current) {
        const height = containerRef.current.offsetHeight;
        document.documentElement.style.setProperty('--navbar-height', `${height}px`);
      }
    };

    updateNavbarHeight();
    window.addEventListener('resize', updateNavbarHeight);
    return () => {
      window.removeEventListener('resize', updateNavbarHeight);
    };
  }, []);

  return (
    <nav ref={containerRef} className="sticky top-0 z-50 flex w-full flex-col bg-festa-base text-gray-900">

      <div className="flex w-full items-center justify-between border-b border-gray-100 bg-festa-base px-6 py-4 md:px-8 md:py-5 lg:px-12">
        <div className="flex items-center gap-4 lg:gap-8">
          <button
            type="button"
            className="text-gray-900 lg:hidden"
            onClick={() => setIsMenuOpen(open => !open)}
            aria-expanded={isMenuOpen}
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
          </button>

          <Link href="/" className="select-none font-display text-2xl text-gray-900 transition-colors hover:text-gray-700 md:text-3xl">
            TheFesta
          </Link>

          <ul className="hidden items-center gap-4 text-sm font-medium text-gray-600 lg:flex xl:gap-6">
            {NAV_LINKS.map(link => (
              <li key={link.label}>
                <a href={link.href} className="whitespace-nowrap py-2 transition-colors hover:text-gray-900">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          <a
            href="#"
            className="rounded-full border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800 hover:border-gray-800"
          >
            Log In
          </a>
          <a
            href="#"
            className="beam-button group relative hidden items-center justify-center rounded-full px-8 py-3 text-xs font-mono font-semibold uppercase tracking-[0.14em] text-white sm:inline-flex"
            style={
              {
                '--shimmer-color': 'rgba(106,27,154,0.85)',
                '--bg': 'rgba(106,27,154,0.14)',
                '--icon-bg': 'rgba(106,27,154,0.18)',
                '--icon-ring': 'rgba(106,27,154,0.35)',
                '--beam-glow': 'rgba(106,27,154,0.4)',
              } as CSSProperties
            }
          >
            <span className="beam-border" aria-hidden />
            <span className="beam-inner" aria-hidden />
            <span className="beam-dots" aria-hidden />
            <span className="beam-glow" aria-hidden />
            <span className="relative z-10">Sign Up</span>
          </a>
        </div>
      </div>

      {isMenuOpen && (
        <div className="absolute left-0 top-full z-40 w-full max-h-[80vh] overflow-y-auto border-b border-gray-200 bg-white p-4 shadow-xl animate-fade-in lg:hidden">
          {NAV_LINKS.map(link => (
            <a key={link.label} href={link.href} className="border-b border-gray-50 py-3 text-base font-medium text-gray-700">
              {link.label}
            </a>
          ))}
          <div className="flex flex-col gap-3 pt-4">
            <a
              href="#"
              className="rounded-full border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800 hover:border-gray-800"
            >
              Log In
            </a>
            <a
              href="#"
              className="beam-button group relative inline-flex items-center justify-center rounded-full px-8 py-3 text-xs font-mono font-semibold uppercase tracking-[0.14em] text-white"
              style={
                {
                  '--shimmer-color': 'rgba(106,27,154,0.85)',
                  '--bg': 'rgba(106,27,154,0.14)',
                  '--icon-bg': 'rgba(106,27,154,0.18)',
                  '--icon-ring': 'rgba(106,27,154,0.35)',
                  '--beam-glow': 'rgba(106,27,154,0.4)',
                } as CSSProperties
              }
            >
              <span className="beam-border" aria-hidden />
              <span className="beam-inner" aria-hidden />
              <span className="beam-dots" aria-hidden />
              <span className="beam-glow" aria-hidden />
              <span className="relative z-10">Sign Up</span>
            </a>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
