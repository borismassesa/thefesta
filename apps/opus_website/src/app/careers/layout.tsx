import type { ReactNode } from 'react'
import Navbar from '@/components/navbar'
import Footer from '@/components/footer'

export default function CareersLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-[#F4F4F0] font-sans text-[#111111] selection:bg-black/10">
      <Navbar />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  )
}
