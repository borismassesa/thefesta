'use client'

import { useSetPageHeading } from '@/components/PageHeading'

export default function DetailHeading({ subject }: { subject: string }) {
  useSetPageHeading({
    title: subject,
    subtitle: 'Support conversation',
    back: { href: '/support', label: 'Support' },
  })
  return null
}
