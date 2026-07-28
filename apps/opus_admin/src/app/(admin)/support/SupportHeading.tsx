'use client'

import { useSetPageHeading } from '@/components/PageHeading'

export default function SupportHeading() {
  useSetPageHeading({
    title: 'Support',
    subtitle: 'Opus conversations and live customer handoffs',
  })
  return null
}
