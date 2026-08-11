'use client'

import { useClerk } from '@clerk/nextjs'
import { ArrowRight } from 'lucide-react'

export default function SwitchAccountButton() {
  const { signOut } = useClerk()
  return (
    <button data-opus-button="primary" data-opus-button-size="medium"
      type="button"
      onClick={() => signOut({ redirectUrl: '/sign-in?redirect_url=%2Fcontribute' })}
      className="inline-flex items-center gap-2 rounded-lg bg-[#C9A0DC] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#b97fd0]"
    >
      Switch account
      <ArrowRight className="h-4 w-4" />
    </button>
  )
}
