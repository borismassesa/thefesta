'use client'

import { useEffect } from 'react'

/**
 * Unregisters the legacy offline service worker (/sw.js) shipped by the
 * previous version of this app. The scanner is online-only now — matching the
 * mobile app, which deliberately caches no roster or QR tokens on door
 * devices — so a stale worker intercepting fetches would serve last night's
 * shell at tonight's event.
 *
 * This stays until every door device that ever installed the PWA has loaded
 * the site once. Removing it later is safe; leaving it forever is harmless.
 */
export default function ServiceWorkerCleanup() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
      .catch(() => {
        // Non-fatal — an old worker may linger one more load on that device.
      })
  }, [])
  return null
}
