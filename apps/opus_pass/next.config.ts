import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Shared product/vendor contracts (Zod schemas, formatTzs) consumed as
  // source, same as opus_website and vendors_portal.
  transpilePackages: ['@opusfesta/lib'],

  experimental: {
    // Next's server-action body limit defaults to 1MB. The guestbook's
    // no-auth submitGuestbookEntry action uploads photos/audio/video straight
    // through a server action (up to the 50MB video cap in actions.ts) — the
    // default silently 500s on anything past 1MB, well under every media cap
    // this app already advertises to guests.
    serverActions: {
      bodySizeLimit: '55mb',
    },
    // Clerk's middleware (src/middleware.ts) matches nearly every route,
    // including the public no-auth /guestbook/[slug] page — and having any
    // middleware active on a route makes Next buffer the request body through
    // it, capped at 10MB by default regardless of the serverActions limit
    // above. Without raising this too, any guestbook video (and any voice
    // note or photo over 10MB) throws "Unexpected end of form" instead of
    // hitting the app's own size-limit error message.
    middlewareClientMaxBodySize: '55mb',
  },
  // Lets tooling build/serve from an alternate dist dir (e.g. .next-preview)
  // without fighting a dev server that holds .next. Unset in normal use.
  distDir: process.env.OPUS_PASS_DIST_DIR || '.next',
  // Both entrance-pass image routes read the ticket template + fonts from
  // public/ at runtime (readFile, not URL fetch — next/og needs raw
  // buffers). On Vercel, public/ is only uploaded to the CDN; it is NOT
  // part of a serverless function's bundle, and the dynamic path.join()
  // defeats static file tracing. Without this, the deployed routes 500
  // (the guest ticket with "Ticket temporarily unavailable" — and every
  // WhatsApp entrance-pass send then dies with Meta error 131053; the
  // couple's Pass Ticket preview thumbnail the same way). Both the
  // per-guest route and the event-level preview route need the assets.
  outputFileTracingIncludes: {
    '/entrance-pass/[token]': ['./public/entrance-pass/**', './public/fonts/**'],
    '/entrance-pass/preview': ['./public/entrance-pass/**', './public/fonts/**'],
    // The resvg WebAssembly binary, for the route that rasterises a card. Read
    // at runtime rather than imported, because a static reference makes
    // Turbopack try to instantiate it as a module and the build fails on
    // wasm-bindgen glue. Scoped to the one route: an app-wide glob would ship
    // 2.4 MB into every serverless function.
    '/api/internal/card-delivery-smoke': ['../../node_modules/@resvg/resvg-wasm/index_bg.wasm'],
    // Real preview/test/bulk preparation runs through server actions imported
    // by these dashboard pages, so their functions need the same WASM sibling.
    '/my/dashboard/invitations': ['../../node_modules/@resvg/resvg-wasm/index_bg.wasm'],
    '/my/dashboard/guests': ['../../node_modules/@resvg/resvg-wasm/index_bg.wasm'],
    // The guest's own pass surface draws the same artwork through the same
    // dynamic path.join, so it needs the same entry. Without it this route
    // works in dev and 500s in production, which is the worst shape a bug of
    // this kind can take.
    '/p/[token]/pass': ['./public/entrance-pass/**', './public/fonts/**'],
  },
  // opus_pass is served at the root of its own subdomain (opuspass.opusfesta.com).
  // The marketing site links straight to that subdomain; opusfesta.com/opuspass/*
  // is kept alive as a 308 redirect to the subdomain (see opus_website/next.config.ts),
  // so there is no longer a path prefix and no multi-zone proxy to satisfy.
  images: {
    // The Next dev image optimizer (Turbopack) intermittently 504s even on small,
    // fast-loading remote images. Serve images raw in dev (fast enough — these are
    // already-sized uploads) and let Vercel's robust optimizer handle production.
    unoptimized: process.env.NODE_ENV !== 'production',
    // Next 16 rejects any <Image quality> value not explicitly allowlisted.
    qualities: [75, 85, 90, 100],
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
  // First response headers this app has ever set. Added for card protection,
  // and scoped narrowly for that reason: a broad CSP on an app with Clerk,
  // Supabase, Sonner and next/image would be a large behavioural change
  // smuggled in beside a small one, and would fail in production rather than
  // in review.
  async headers() {
    return [
      {
        // Card artwork. The route itself already sets Cache-Control and CORP
        // per response; these are the ones that make sense as policy rather
        // than as a property of the bytes.
        source: '/api/card-art/:path*',
        headers: [
          // Stops the artwork being framed into another site and presented as
          // that site's own catalogue.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'; sandbox" },
          // Card SVGs are served as image/svg+xml. An SVG opened as a TOP-LEVEL
          // document executes its own script in this origin, so `sandbox`
          // above is load-bearing, not decoration.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      {
        // The guest's personalised card PNG.
        source: '/invite-card/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Deliberately NOT Cross-Origin-Resource-Policy: same-origin here.
          // Meta's servers fetch this URL cross-origin when a WhatsApp template
          // goes out, and refusing them would break invitation delivery
          // outright. See invite-card/[token]/route.ts.
        ],
      },
    ]
  },
  async redirects() {
    return [
      // The guests landing page was renamed /guests -> /guests-and-rsvp.
      // Keep the old path alive for any stored CMS hrefs, bookmarks, and
      // inbound links so they don't 404.
      {
        source: '/guests',
        destination: '/guests-and-rsvp',
        permanent: true,
      },
      // The digital-card storefront was renamed /invitations -> /digital-cards.
      // Keep the old paths alive so stored CMS hrefs, bookmarks, and inbound
      // links (and the installed mobile apps' deep links) don't 404.
      {
        source: '/invitations',
        destination: '/digital-cards',
        permanent: true,
      },
      {
        source: '/invitations/:path*',
        destination: '/digital-cards/:path*',
        permanent: true,
      },
      // Door scanner path renamed for product clarity.
      {
        source: '/scanner',
        destination: '/entrance-card-scanner',
        permanent: true,
      },
      {
        source: '/scanner/:path*',
        destination: '/entrance-card-scanner/:path*',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
