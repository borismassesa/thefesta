import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Escape hatch so a verification build can be run without writing over the
  // .next a running `next dev` is using. Same pattern as apps/opus_pass.
  distDir: process.env.ADMIN_DIST_DIR || '.next',
  // Transpile the shared workspace package (TS source, not pre-built).
  transpilePackages: ['@opusfesta/lib'],
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
