'use client'

import { useSetPageHeading } from '@/components/PageHeading'

// Pushes the title into the global admin Header — same pattern as
// AuditPageHeading. Renders nothing visible.

export default function NotificationHealthHeading() {
  useSetPageHeading({
    title: 'Notification delivery',
    subtitle: 'Queue health for staff notifications. Counts only, no message contents.',
  })
  return null
}
