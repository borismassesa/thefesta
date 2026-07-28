'use client'

import { useSetPageHeading } from '@/components/PageHeading'

export default function SupportAnalyticsHeading() {
  useSetPageHeading({
    title: 'Support analytics',
    subtitle: 'Opus volume, deflection, escalation and satisfaction',
    back: { href: '/support', label: 'Support' },
  })
  return null
}
