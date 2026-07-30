import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { STAFF_SESSION_COOKIE } from '@/lib/dashboard/staff-session'

/**
 * Ends a staff dashboard session by clearing the cookie. Driven by the "Leave"
 * button in the staff banner.
 *
 * POST, not GET: a GET here could be triggered by any image or link on a page
 * the admin happens to be viewing. Nothing is authenticated because there is
 * nothing to protect — the only effect is dropping your own cookie.
 */
export async function POST(request: Request) {
  ;(await cookies()).delete(STAFF_SESSION_COOKIE)
  // 303 so the browser follows with GET rather than re-POSTing.
  return NextResponse.redirect(new URL('/', request.url), 303)
}
