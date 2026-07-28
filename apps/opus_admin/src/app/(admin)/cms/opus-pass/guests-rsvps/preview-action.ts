'use server'

const ALLOWED_REDIRECTS = new Set(['/', '/digital-cards', '/guests-and-rsvp', '/websites'])

export async function getOpusPassGuestsPreviewUrl(
  redirectPath: string = '/guests-and-rsvp',
): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_OPUS_PASS_URL ?? 'http://localhost:3008'
  const token = process.env.OPUS_PASS_PREVIEW_TOKEN
  if (!token) return null
  const safePath = ALLOWED_REDIRECTS.has(redirectPath) ? redirectPath : '/guests-and-rsvp'
  // opus_pass runs under basePath '/opuspass' — the preview API lives there.
  return `${url}/api/preview/enable?token=${encodeURIComponent(token)}&redirect=${encodeURIComponent(safePath)}`
}
