import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

const ALLOWED_EXACT = new Set(['/', '/digital-cards', '/digital-cards/catalog', '/guests-and-rsvp', '/websites'])
const ALLOWED_LAYOUT = new Set(['/digital-cards/p'])

function isAllowed(path: string): boolean {
  return ALLOWED_EXACT.has(path) || ALLOWED_LAYOUT.has(path)
}

export async function POST(request: Request) {
  const auth = request.headers.get('authorization')
  const secret = process.env.OPUS_PASS_REVALIDATE_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const path = url.searchParams.get('path') ?? '/'

  if (!isAllowed(path)) {
    console.warn(`[opus-pass revalidate] rejected unknown path: ${path}`)
    return NextResponse.json({ error: 'unknown_path', path }, { status: 400 })
  }

  if (ALLOWED_LAYOUT.has(path)) {
    revalidatePath(path, 'layout')
  } else {
    revalidatePath(path)
  }
  return NextResponse.json({ revalidated: true, path })
}
