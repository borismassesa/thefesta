import { Suspense } from 'react'
import type { Metadata } from 'next'
import ManualCheckinClient from './ManualCheckinClient'

export const metadata: Metadata = {
  title: 'Manual check-in — OpusPass Entrance Card Scanner',
}

export default async function ManualCheckinPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return (
    // useSearchParams (?mode=code|name) needs a Suspense boundary for prerender.
    <Suspense>
      <ManualCheckinClient eventId={eventId} />
    </Suspense>
  )
}
