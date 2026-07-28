import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/sso-callback(.*)',
  '/api/webhooks(.*)',
  // Phone-handoff National ID capture — authorized by a signed token in the
  // URL, not a Clerk session (the phone scanning the QR isn't logged in).
  '/verify/capture(.*)',
  // Admin-requested document upload — authorized by a per-request token in the
  // URL, not a Clerk session. The vendor uploads without logging in.
  '/upload(.*)',
  // Cross-deployment cache bust from the admin's CMS publish flows — authorized
  // by the VENDORS_PORTAL_REVALIDATE_SECRET bearer header the route checks
  // itself, not a Clerk session. Without this the server-to-server POST is
  // bounced to /sign-in, which answers 200, so the admin sees a successful
  // publish while the public page keeps serving stale content.
  '/api/revalidate',
])

export default clerkMiddleware(
  async (auth, req) => {
    if (isPublicRoute(req)) return
    const signInUrl = new URL('/sign-in', req.url)
    signInUrl.searchParams.set(
      'redirect_url',
      `${req.nextUrl.pathname}${req.nextUrl.search}`,
    )
    await auth.protect({ unauthenticatedUrl: signInUrl.toString() })
  },
  { signInUrl: '/sign-in' },
)

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
