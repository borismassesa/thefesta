import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

export const metadata: Metadata = {
  title: 'OpusFesta Admin',
  description: 'OpusFesta admin console — CMS, operations, workforce, and finance.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default function RootLayout({ children }: { children: ReactNode }) {
  // ClerkProvider must wrap client hooks (useClerk / useUser) but stay inside
  // <body> — wrapping <html> breaks the provider context under Next App Router
  // streaming / long SSR, which surfaces as "useClerk can only be used within
  // the <ClerkProvider />" from Sidebar / Header / DashboardHeading.
  return (
    <html lang="en">
      <body>
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  )
}
