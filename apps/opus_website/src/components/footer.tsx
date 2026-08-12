'use client'

import Link from 'next/link'
import { useState, useRef } from 'react'
import { MapPin } from 'lucide-react'
import { motion, useScroll, useTransform } from 'motion/react'
import Reveal from '@/components/ui/Reveal'
import { adviceIdeasFooterLinks } from '@/lib/advice-ideas'

const CATEGORIES = ['Venues', 'Photographers', 'Videographers', 'Caterers', 'DJs & Bands', 'Florists', 'Wedding Planners', 'Hair & Makeup', 'Wedding Cakes', 'Bridal Salons', 'Photo Booths', 'Rentals', 'Transportation', 'Jewellers', 'MC & Officiants']
const FOOTER_VENDOR_LINKS = ['Venues', 'Photographers', 'Videographers', 'Wedding Planners', 'Caterers', 'Hair & Makeup']

const cities = [
  'Dar es Salaam',
  'Zanzibar',
  'Arusha',
  'Moshi',
  'Mwanza',
  'Dodoma',
  'Tanga',
  'Morogoro',
]

export default function Footer() {
  const [activeCategory, setActiveCategory] = useState('Venues')
  const watermarkRef = useRef(null)
  const { scrollYProgress } = useScroll({ target: watermarkRef, offset: ['start end', 'end start'] })
  // Parallax: moves up to 60px max — bounded within footer
  const y = useTransform(scrollYProgress, [0, 1], [30, -30])

  return (
    <footer className="bg-[#FFFFFF] pt-24 pb-12 px-6 border-t border-gray-200">
      <div className="max-w-6xl mx-auto">

        {/* Vendor city finder */}
        <Reveal direction="up" margin="-40px">
          <h2 className="text-3xl font-black tracking-tighter mb-8 text-[#1A1A1A]">Find vendors across Tanzania</h2>

          <div className="flex gap-3 mb-10 overflow-x-auto pb-2 hide-scrollbar">
            {CATEGORIES.map((cat) => (
              <button data-opus-button="neutral" data-opus-button-size="medium"
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-5 py-2 rounded-full font-bold text-sm whitespace-nowrap transition-colors ${activeCategory === cat ? 'bg-[#1A1A1A] text-white' : 'bg-white text-[#1A1A1A] border border-gray-200 hover:bg-gray-50'}`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-y-6 gap-x-4 mb-20">
            {cities.map((city) => (
              <a key={city} href="#" className="flex items-center gap-3 hover:underline text-sm font-medium text-gray-600">
                <MapPin size={16} className="text-(--accent)" />
                {activeCategory} in {city}
              </a>
            ))}
          </div>
        </Reveal>

        {/* Links grid */}
        <Reveal direction="none" margin="-40px" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-8 mb-16 text-sm">
          <div>
            <h4 className="font-bold mb-4 text-[#1A1A1A]">Planning Tools</h4>
            <ul className="space-y-3 text-gray-500">
              <li><a href="#" className="hover:text-[#1A1A1A] transition-colors">Wedding Website</a></li>
              <li><a href="#" className="hover:text-[#1A1A1A] transition-colors">Registry</a></li>
              <li><a href="#" className="hover:text-[#1A1A1A] transition-colors">Guest List</a></li>
              <li><a href="#" className="hover:text-[#1A1A1A] transition-colors">Checklist</a></li>
              <li><a href="#" className="hover:text-[#1A1A1A] transition-colors">Budget Planner</a></li>
              <li><a href="#" className="hover:text-[#1A1A1A] transition-colors">Vendor Manager</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-[#1A1A1A]">Find Vendors</h4>
            <ul className="space-y-3 text-gray-500">
              {FOOTER_VENDOR_LINKS.map((label) => (
                <li key={label}>
                  <Link
                    href={`/vendors/browse?category=${label.toLowerCase().replace(/\s+&\s+/g, '-').replace(/\s+/g, '-')}`}
                    className="hover:text-[#1A1A1A] transition-colors"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-[#1A1A1A]">Ideas & Advice</h4>
            <ul className="space-y-3 text-gray-500">
              {adviceIdeasFooterLinks.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="hover:text-[#1A1A1A] transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-[#1A1A1A]">Company</h4>
            <ul className="space-y-3 text-gray-500">
              <li><a href="#" className="hover:text-[#1A1A1A] transition-colors">About Us</a></li>
              <li><Link href="/careers" className="hover:text-[#1A1A1A] transition-colors">Careers</Link></li>
              <li><a href="#" className="hover:text-[#1A1A1A] transition-colors">Contact Us</a></li>
              <li><a href="#" className="hover:text-[#1A1A1A] transition-colors">For Vendors</a></li>
              <li><a href="#" className="hover:text-[#1A1A1A] transition-colors">Vendor Dashboard</a></li>
            </ul>
          </div>
        </Reveal>

        {/* Watermark — parallax bounded within footer, ±30px */}
        <div ref={watermarkRef} className="mb-8 py-8 -mx-6 overflow-hidden flex justify-center">
          <motion.p
            style={{ y }}
            aria-hidden="true"
            className="pointer-events-none whitespace-nowrap select-none text-center text-[14vw] md:text-[11vw] lg:text-[9vw] xl:text-[8.2vw] 2xl:text-[7.4vw] font-black tracking-tighter uppercase leading-none text-gray-100"
          >
            OpusFesta
          </motion.p>
        </div>

        <div className="flex flex-col items-center gap-4 md:flex-row md:justify-between md:gap-0 mt-8 pt-8 border-t border-gray-100 text-xs text-gray-400">
          <div className="flex gap-6">
            <a href="#" className="hover:text-[#1A1A1A] transition-colors">Terms of Use</a>
            <a href="#" className="hover:text-[#1A1A1A] transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-[#1A1A1A] transition-colors">Accessibility</a>
          </div>
          <span>© 2026 OpusFesta. All rights reserved.</span>
          <div className="flex gap-4">
            {/* Facebook */}
            <a href="#" className="text-gray-400 hover:text-[#1A1A1A] transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
            </a>
            {/* TikTok */}
            <a href="#" className="text-gray-400 hover:text-[#1A1A1A] transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/></svg>
            </a>
            {/* Instagram */}
            <a href="#" className="text-gray-400 hover:text-[#1A1A1A] transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
            </a>
            {/* YouTube */}
            <a href="#" className="text-gray-400 hover:text-[#1A1A1A] transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.95C5.12 20 12 20 12 20s6.88 0 8.59-.47a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="white"/></svg>
            </a>
            {/* LinkedIn */}
            <a href="#" className="text-gray-400 hover:text-[#1A1A1A] transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg>
            </a>
          </div>
        </div>

      </div>
    </footer>
  )
}
