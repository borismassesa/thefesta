import type { NextConfig } from 'next'

/**
 * DEPRECATED — door scanner UI now lives in apps/opus_pass at
 * `/entrance-card-scanner`.
 *
 * This app only exists so old bookmarks / WhatsApp links aimed at the former
 * scanner origin (dev :3111, or a retired scanner subdomain) still land on the
 * real UI. Prefer linking to opus_pass directly:
 *   {OPUS_PASS}/entrance-card-scanner/event/{eventId}?token=…
 */
const OPUS_PASS_URL = (process.env.OPUS_PASS_URL ?? 'http://localhost:3008').replace(/\/$/, '')

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: '/',
        destination: `${OPUS_PASS_URL}/entrance-card-scanner`,
        permanent: true,
      },
      {
        source: '/event/:path*',
        destination: `${OPUS_PASS_URL}/entrance-card-scanner/event/:path*`,
        permanent: true,
      },
      {
        source: '/:path*',
        destination: `${OPUS_PASS_URL}/entrance-card-scanner`,
        permanent: false,
      },
    ]
  },
}

export default nextConfig
