import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Transpile the shared workspace package (TS source, not pre-built).
  transpilePackages: ['@opusfesta/lib'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      // Clerk — user profile photos and OAuth provider avatars
      { protocol: 'https', hostname: 'img.clerk.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  // ── opus_pass now lives at its own subdomain root (opuspass.opusfesta.com) ──
  // It no longer uses a /opuspass basePath, so there is no multi-zone proxy. The
  // navbar links straight to the subdomain; the redirects below keep the legacy
  // opusfesta.com paths (the old /opuspass/* proxy URLs + the retired product
  // pages) alive as 308s to the subdomain so inbound links and SEO don't break.
  // Target set in prod via NEXT_PUBLIC_OPUS_PASS_URL (https://opuspass.opusfesta.com);
  // falls back to the local dev port 3008.
  async redirects() {
    const opusPass = process.env.NEXT_PUBLIC_OPUS_PASS_URL ?? 'http://localhost:3008'
    return [
      // Old multi-zone proxy URLs → subdomain (strip the /opuspass prefix).
      { source: '/opuspass', destination: opusPass, permanent: true },
      { source: '/opuspass/:path*', destination: `${opusPass}/:path*`, permanent: true },

      // ── Canonical product pages live in opus_pass (on the subdomain) ──
      // Invitations, Guests & RSVP and Wedding Websites are CMS-managed inside
      // opus_pass. opus_website's old copies are retired; these 308s send the
      // legacy URLs to the subdomain so there is a single source of truth and no
      // duplicate content. Order matters: most specific first, catch-all last.
      { source: '/invitations', destination: `${opusPass}/digital-cards`, permanent: true },
      { source: '/invitations/:path*', destination: `${opusPass}/digital-cards/:path*`, permanent: true },
      { source: '/websites', destination: `${opusPass}/websites`, permanent: true },
      { source: '/websites/:path*', destination: `${opusPass}/websites/:path*`, permanent: true },

      // Legacy /guests* paths. Invitation deep-links (formerly nested under
      // /guests) go to the catalog; everything else to Guests & RSVP.
      // /my/guests is a separate user-dashboard route and is NOT matched — Next.js
      // redirect `source` matches the full path, not a prefix of a different one.
      { source: '/guests/invitations', destination: `${opusPass}/digital-cards/catalog`, permanent: true },
      { source: '/guests/invitations/:path*', destination: `${opusPass}/digital-cards/catalog/:path*`, permanent: true },
      { source: '/guests', destination: `${opusPass}/guests-and-rsvp`, permanent: true },
      { source: '/guests/:path*', destination: `${opusPass}/guests-and-rsvp`, permanent: true },
    ]
  },
}

export default nextConfig
