import { Suspense } from 'react'
import type { Metadata } from 'next'
import GuestsClient from './GuestsClient'

export const metadata: Metadata = {
  title: 'Guest list — OpusPass Entrance Card Scanner',
}

export default async function GuestsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return (
    // useSearchParams (the ?filter= seed from the scan screen's count bar)
    // bails out of prerendering without a boundary around it.
    <Suspense>
      <GuestsClient eventId={eventId} />
    </Suspense>
  )
}
