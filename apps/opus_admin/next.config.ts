import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Escape hatch so a verification build can be run without writing over the
  // .next a running `next dev` is using. Same pattern as apps/opus_pass.
  distDir: process.env.ADMIN_DIST_DIR || '.next',
  // Transpile the shared workspace package (TS source, not pre-built).
  transpilePackages: ['@opusfesta/lib'],
  // Personal surfaces moved out of /me and /workforce into /workspace when
  // Workspace and Workforce were split into two perspectives rather than two
  // modules. These keep old bookmarks, in-app links and anything already
  // pasted into Slack working.
  //
  // Next preserves the query string across a redirect automatically, which
  // matters here: /workspace/reports?type=monthly and
  // /workspace/tracker?week=2026-07-27 are both real in-app links, and losing
  // the parameter would silently drop the user on the wrong week or filter.
  //
  // permanent: true issues a 308, which also preserves the request METHOD.
  // A 301/302 would rewrite a POST to GET and quietly break any form still
  // targeting an old path.
  async redirects() {
    return [
      { source: '/me/timeclock', destination: '/workspace/time-clock', permanent: true },
      { source: '/me/reports', destination: '/workspace/reports', permanent: true },
      { source: '/workforce/my-tasks', destination: '/workspace/tasks', permanent: true },
      { source: '/workforce/daily-tracker', destination: '/workspace/tracker', permanent: true },
      // /me had no index page of its own; anything else under it belonged to
      // the two surfaces above.
      { source: '/me', destination: '/workspace', permanent: true },
      { source: '/me/:path*', destination: '/workspace/:path*', permanent: true },
    ]
  },
  experimental: {
    serverActions: {
      // Article & contributor uploads buffer the file through a server
      // action before forwarding to Supabase. The platform default is
      // 1MB which 413s any real phone photo; 25MB gives room for HEIC
      // originals while staying inside Vercel's per-function payload
      // cap. Larger videos use the dedicated signed-URL upload paths.
      bodySizeLimit: '25mb',
    },
  },
}

export default nextConfig
