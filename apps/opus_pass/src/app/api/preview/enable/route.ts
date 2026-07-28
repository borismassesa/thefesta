import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'

const ALLOWED_REDIRECTS = new Set(['/', '/digital-cards', '/guests-and-rsvp', '/websites'])

function safeRedirect(path: string | null): string {
  if (!path) return '/'
  // Only relative same-app paths from our whitelist — never honor absolute URLs
  // (open-redirect prevention).
  return ALLOWED_REDIRECTS.has(path) ? path : '/'
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  const secret = process.env.OPUS_PASS_PREVIEW_TOKEN

  if (!secret || token !== secret) {
    return new Response('Invalid token', { status: 401 })
  }

  const draft = await draftMode()
  draft.enable()

  redirect(safeRedirect(url.searchParams.get('redirect')))
}
