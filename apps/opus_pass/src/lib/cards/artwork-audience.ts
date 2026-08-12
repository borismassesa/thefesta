import 'server-only'
import { cookies } from 'next/headers'
import { auth } from '@clerk/nextjs/server'
import { VISITOR_COOKIE, isVisitorId } from './visitor-cookie'

/**
 * Who the artwork about to be served is being served TO.
 *
 * Feeds both halves of the protection: the signature on the artwork URL and the
 * trace code stamped into the artwork itself, so the permission and the mark
 * always name the same party.
 *
 * Prefers the Clerk id, because a signed-in leak is worth far more to trace than
 * an anonymous one, and a person keeps their id across browsers and devices
 * while the cookie does not.
 *
 * Falls back to `anon` rather than throwing when there is neither. That happens
 * on a request that never passed through middleware — a statically generated
 * page, a build-time render — and a broken storefront would be a much worse
 * answer than a shared stamp on a page nobody is individually identified on.
 */
export async function artworkAudience(): Promise<string> {
  try {
    const { userId } = await auth()
    if (userId) return `u:${userId}`
  } catch {
    // Outside a request scope (build-time render). Fall through to the cookie.
  }

  try {
    const value = (await cookies()).get(VISITOR_COOKIE)?.value
    if (isVisitorId(value)) return `v:${value}`
  } catch {
    // Same reason.
  }

  return 'anon'
}
