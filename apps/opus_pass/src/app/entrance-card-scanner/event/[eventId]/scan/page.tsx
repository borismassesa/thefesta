import type { Metadata } from 'next'
import ScanClient from './ScanClient'

export const metadata: Metadata = {
  title: 'Scan — OpusPass Entrance Card Scanner',
}

export default async function ScanPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <ScanClient eventId={eventId} />
}
