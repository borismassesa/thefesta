'use client'

import Link from 'next/link'
import { useState } from 'react'
import { LayoutDashboard, Menu, X } from 'lucide-react'
import { SignedIn, SignedOut, UserButton } from '@clerk/nextjs'
import Logo from '@/components/ui/Logo'
import { LocaleToggle } from '@/components/LocaleToggle'

const navLinks: Array<{ label: string; href: string }> = []

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const closeMobile = () => setMobileOpen(false)

  return (
    <div
      className="relative border-b border-gray-100 bg-white"
      onKeyDown={(e) => {
        if (e.key === 'Escape') closeMobile()
      }}
    >
      <nav className="relative z-50 mx-auto flex max-w-344 items-center justify-between bg-white px-3 py-3.5 sm:px-4 sm:py-4 lg:px-6 xl:px-8">
        <div className="flex min-w-0 items-center gap-3 sm:gap-6 lg:gap-8">
          <Link href="/" aria-label="OpusFesta home" className="shrink-0">
            <Logo className="h-8 w-auto sm:h-10" />
          </Link>

          <div className="hidden lg:flex gap-1 font-semibold text-[15px]">
            {navLinks.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="px-4 py-2.5 rounded-full transition-colors whitespace-nowrap text-gray-700 hover:bg-gray-100"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 font-semibold text-sm sm:gap-3 lg:text-[15px]">
          <LocaleToggle className="hidden sm:inline-flex" />
          <SignedOut>
            <Link
              href="/sign-in"
              className="hidden lg:block text-gray-700 hover:text-[#1A1A1A] transition-colors whitespace-nowrap px-4 py-2.5 rounded-full hover:bg-gray-100"
            >
              Log in
            </Link>
            <Link
              href="/sign-up"
              className="shrink-0 rounded-full bg-(--accent) px-3.5 py-2 text-xs font-bold whitespace-nowrap text-(--on-accent) transition-colors hover:bg-(--accent-hover) sm:px-5 sm:text-sm lg:px-5.5 lg:py-2.5 lg:text-[15px]"
            >
              Sign up free
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="hidden lg:inline-flex items-center gap-2 rounded-full bg-(--accent) px-4 py-2 text-sm font-bold whitespace-nowrap text-(--on-accent) transition-colors hover:bg-(--accent-hover) lg:px-5 lg:py-2.5"
            >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </Link>
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: { avatarBox: 'w-9 h-9' },
              }}
            />
          </SignedIn>
          <button data-opus-button="control"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-gray-100 lg:hidden sm:h-10 sm:w-10"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      <div
        className={`lg:hidden fixed inset-0 bg-white z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          mobileOpen ? 'translate-y-0' : '-translate-y-full'
        }`}
        aria-label="Navigation menu"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <Link href="/" aria-label="OpusFesta home" onClick={closeMobile}>
            <Logo className="h-8 w-auto" />
          </Link>
          <button data-opus-button="control"
            onClick={closeMobile}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3 px-3">
          {navLinks.map((item) => (
            <a
              key={item.label}
              href={item.href}
              onClick={closeMobile}
              className="w-full flex items-center justify-between px-4 py-4 rounded-xl font-semibold text-base text-gray-800 hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              <span>{item.label}</span>
            </a>
          ))}
        </div>

        <div className="shrink-0 px-4 py-5 border-t border-gray-100 flex flex-col gap-2.5">
          <div className="flex items-center justify-between pb-1">
            <span className="text-sm font-semibold text-gray-500">Language</span>
            <LocaleToggle />
          </div>
          <SignedOut>
            <Link
              href="/sign-in"
              onClick={closeMobile}
              className="w-full text-center py-3 rounded-full border-2 border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/sign-up"
              onClick={closeMobile}
              className="w-full text-center bg-(--accent) hover:bg-(--accent-hover) text-(--on-accent) py-3 rounded-full font-bold text-sm transition-colors"
            >
              Sign up, it&apos;s free
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              onClick={closeMobile}
              className="w-full text-center inline-flex items-center justify-center gap-2 bg-(--accent) hover:bg-(--accent-hover) text-(--on-accent) py-3 rounded-full font-bold text-sm transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              Go to dashboard
            </Link>
            <div className="w-full flex items-center justify-center pt-1">
              <UserButton afterSignOutUrl="/" />
            </div>
          </SignedIn>
        </div>
      </div>
    </div>
  )
}
