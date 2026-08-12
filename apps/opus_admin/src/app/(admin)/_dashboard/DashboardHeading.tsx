'use client'

import { useSetPageHeading } from '@/components/PageHeading'

// Tiny client-only component that pushes "Welcome, <name>" into the
// PageHeading context so the global Header renders the personalised
// greeting. Renders nothing visible — keeps the dashboard page itself
// a server component.
//
// Name comes from the server (workforce profile / auth bypass profile),
// not Clerk's useUser(). That hook throws outside <ClerkProvider /> and
// is useless under DISABLE_ADMIN_AUTH where there is no Clerk session.

export default function DashboardHeading({
  subtitle,
  name,
}: {
  subtitle?: string
  name?: string | null
}) {
  const first = name?.trim().split(/\s+/).filter(Boolean)[0]
  useSetPageHeading({
    title: first ? `Welcome, ${first}` : 'Welcome',
    subtitle,
  })
  return null
}
