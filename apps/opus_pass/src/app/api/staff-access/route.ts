import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  STAFF_SESSION_COOKIE,
  remainingSeconds,
  verifyStaffToken,
} from '@/lib/dashboard/staff-session'

/**
 * Entry point for a staff dashboard session. Admin's Couple Accounts console
 * links here with a signed token (see openCoupleDashboard in
 * apps/opus_admin/.../opus-pass/couples/account-actions.ts).
 *
 * The token moves into an httpOnly cookie and out of the URL immediately, so it
 * is not left in browser history, the referer header of the next request, or a
 * screenshot of the address bar. The redirect is always to the dashboard root:
 * there is no caller-supplied path, so this cannot be turned into an open
 * redirect.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')
  const session = token ? verifyStaffToken(token) : null
  if (!token || !session) {
    // No detail on which half failed — an invalid signature and an expired
    // token look identical from outside.
    return new NextResponse(
      'This staff access link is invalid or has expired. Open the couple again from the admin dashboard.',
      { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    )
  }

  const jar = await cookies()
  jar.set(STAFF_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // Never outlives the token it carries.
    maxAge: remainingSeconds(session),
  })

  return NextResponse.redirect(new URL('/my/dashboard', request.url))
}
