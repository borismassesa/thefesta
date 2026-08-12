'use client'

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Shared query cache for the scanner screens. The roster query is keyed
 * ['scanner', 'roster', eventId] exactly like the mobile app, so moving
 * between scan / guests / arrivals doesn't refetch, and one invalidation
 * after a scan updates all three.
 */
export default function ScannerProviders({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient())
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
