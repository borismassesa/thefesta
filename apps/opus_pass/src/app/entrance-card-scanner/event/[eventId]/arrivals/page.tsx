import type { Metadata } from 'next'
import ArrivalsClient from './ArrivalsClient'

export const metadata: Metadata = {
  title: 'Arrivals — OpusPass Entrance Card Scanner',
}

export default async function ArrivalsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <ArrivalsClient eventId={eventId} />
}
