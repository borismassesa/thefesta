import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { STAFF_SESSION_COOKIE } from '@/lib/dashboard/staff-session-cookie'

// Routes that require a signed-in user. Clerk middleware bounces unauthenticated
// visitors to /sign-in with the original URL preserved as redirect_url, so the
// post-sign-in landing returns them to where they were headed.
//
// - /my            — the couple dashboard.
// - the cart + checkout funnel — a customer must be signed in to open their cart
//   or pay, so every order is tied to a real account (order history, RSVP/guest
//   management, and the couple dashboard all key off the signed-in user).
const isProtectedRoute = createRouteMatcher([
  '/my(.*)',
  '/digital-cards/cart(.*)',
  '/digital-cards/address(.*)',
  '/digital-cards/checkout(.*)',
])

// The staff-cookie bypass below is sound only where something downstream
// re-verifies. /my is that place: its layout calls requireDashboardUser(), so an
// unverifiable cookie still ends at /sign-in. The shopping funnel has no such
// guard — checkout resolves its events to [] for an unknown user rather than
// redirecting — so the bypass must not reach it, or setting the cookie to any
// value at all would open a route that is supposed to require a sign-in.
const isCoupleDashboard = createRouteMatcher(['/my(.*)'])

export default clerkMiddleware(async (auth, req) => {
  // An OpusFesta admin acting for a couple (see lib/dashboard/staff-session.ts)
  // holds no Clerk session on this instance, so auth.protect() would bounce them
  // to /sign-in. Presence of the cookie skips that redirect and buys nothing
  // else: the token inside it is re-verified server-side on every read by
  // getStaffSession(), and requireDashboardUser() still redirects to /sign-in
  // when it does not resolve. Verifying the HMAC here too would mean a second,
  // edge-runtime copy of the signing code for no security gain.
  const staffSession = Boolean(req.cookies.get(STAFF_SESSION_COOKIE)?.value)

  if (isProtectedRoute(req) && !(staffSession && isCoupleDashboard(req))) {
    await auth.protect({
      unauthenticatedUrl: new URL('/sign-in', req.url).toString(),
    })
  }
})

export const config = {
  matcher: [
    // Skip Next internals and static assets unless they appear in search params.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes.
    '/(api|trpc)(.*)',
  ],
}
