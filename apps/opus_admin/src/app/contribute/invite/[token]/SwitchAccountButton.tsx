'use client'

import { SignOutButton } from '@clerk/nextjs'
import { LogOut } from 'lucide-react'

export default function SwitchAccountButton({ token }: { token: string }) {
  const redirectUrl = `/sign-in?redirect_url=${encodeURIComponent(`/contribute/invite/${token}`)}`
  return (
    <SignOutButton redirectUrl={redirectUrl}>
      <button data-opus-button="primary" data-opus-button-size="medium"
        type="button"
        className="inline-flex items-center gap-2 rounded-lg bg-[#C9A0DC] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#b97fd0]"
      >
        <LogOut className="h-4 w-4" />
        Sign out & switch account
      </button>
    </SignOutButton>
  )
}
