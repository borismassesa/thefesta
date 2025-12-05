'use client';

import { useEffect, useState } from 'react';
import { ShareIcon, HeartIcon } from '@heroicons/react/24/outline';

const sections = ['photos', 'deals', 'about', 'pricing', 'amenities', 'availability', 'reviews', 'contact'];

interface VendorStickyNavProps {
  onStickyChange?: (isSticky: boolean) => void;
}

const VendorStickyNav = ({ onStickyChange }: VendorStickyNavProps) => {
  const [activeSection, setActiveSection] = useState('about');
  const [isSticky, setIsSticky] = useState(false);

  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: '-100px 0px -66%',
      threshold: 0,
    };

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const sectionId = entry.target.id;
          if (sections.includes(sectionId)) {
            setActiveSection(sectionId);
          }
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);

    // Observe all sections
    sections.forEach((sectionId) => {
      const element = document.getElementById(sectionId);
      if (element) {
        observer.observe(element);
      }
    });

    // Handle sticky behavior
    const handleScroll = () => {
      const navElement = document.getElementById('vendor-sticky-nav');
      if (navElement) {
        const rect = navElement.getBoundingClientRect();
        const shouldBeSticky = rect.top <= 0;

        if (shouldBeSticky !== isSticky) {
          setIsSticky(shouldBeSticky);
          onStickyChange?.(shouldBeSticky);
        }
      }
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll);

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleScroll);
    };
  }, [isSticky, onStickyChange]);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const headerOffset = isSticky ? 60 : 140;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    }
  };

  // Only show the nav when it's sticky
  if (!isSticky) {
    return <div id="vendor-sticky-nav" className="h-0" />;
  }

  return (
    <div
      id="vendor-sticky-nav"
      className="sticky top-0 z-50 bg-white border-b border-gray-200 dark:bg-slate-950 dark:border-slate-800 shadow-md transition-all"
    >
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="flex items-center justify-between">
          <nav className="flex items-center gap-6 overflow-x-auto no-scrollbar">
            {sections.map((section) => (
              <button
                key={section}
                onClick={() => scrollToSection(section)}
                className={`whitespace-nowrap text-sm font-medium transition-colors py-4 border-b-2 capitalize ${
                  activeSection === section
                    ? 'border-dribbble-pink text-gray-900 dark:text-white'
                    : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-300 dark:hover:border-slate-600'
                }`}
              >
                {section}
              </button>
            ))}
          </nav>

          {/* Share and Save buttons */}
          <div className="hidden md:flex gap-2 ml-4">
            <button className="p-2 rounded-full border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
              <ShareIcon className="w-5 h-5 text-gray-700 dark:text-slate-300" />
            </button>
            <button className="p-2 rounded-full border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
              <HeartIcon className="w-5 h-5 text-gray-700 dark:text-slate-300" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VendorStickyNav;
