'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useClerk } from '@clerk/nextjs'

// Shown on the sign-in / sign-up pages when a visitor already has an active
// Clerk session (the apex session is shared across every *.opusfesta.com app).
// Instead of silently keeping the old account, let them either continue or sign
// out to use a different one — this is what was making people who tried to sign
// in as a different Google account stay logged in as the previous one.
export default function AlreadySignedIn({ email }: { email: string }) {
  const { signOut } = useClerk()
  const [signingOut, setSigningOut] = useState(false)

  return (
    <div className="mt-6 space-y-3">
      <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-[14px] text-gray-700">
        You&rsquo;re signed in as{' '}
        <span className="font-semibold text-[#1A1A1A]">{email}</span>.
      </p>
      <Link
        href="/my/dashboard"
        className="block w-full rounded-lg bg-[#1A1A1A] py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-black"
      >
        Continue to dashboard
      </Link>
      <button data-opus-button="control"
        type="button"
        disabled={signingOut}
        onClick={() => {
          setSigningOut(true)
          void signOut({ redirectUrl: '/sign-in' })
        }}
        className="block w-full rounded-lg border border-gray-300 py-3 text-center text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
      >
        {signingOut ? 'Signing out…' : 'Sign out & use a different account'}
      </button>
    </div>
  )
}
