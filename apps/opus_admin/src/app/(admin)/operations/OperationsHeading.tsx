'use client'

import { useSetPageHeading } from '@/components/PageHeading'

export default function OperationsHeading() {
  useSetPageHeading({
    title: 'Operations command center',
    subtitle: 'Delivery commitments, blockers, decisions, and the work that needs attention now.',
  })
  return null
}
