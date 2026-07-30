import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// TEMPORARY: when DISABLE_ADMIN_AUTH=true the whole sign-in/role gate is
// bypassed so we can develop the dashboard without auth. The Clerk wiring is
// left fully intact — flip the flag (or remove it) to restore enforcement.
// Hard-gated to non-production builds so the flag can NEVER open the admin in
// prod even if the env var leaks into a deployed environment.
// See also getAdminAccessRole() in lib/admin-auth.ts.
const AUTH_DISABLED =
  process.env.DISABLE_ADMIN_AUTH === 'true' &&
  process.env.NODE_ENV !== 'production'

// Public routes — sign-in/sign-up pages, Clerk's own callback handling, and
// webhook endpoints (which are authenticated by their own signing secrets).
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/auth-callback(.*)',
  // Workforce invitation landing page renders before sign-in: if the
  // visitor is unauthenticated it bounces to /sign-up itself, preserving
  // the token in redirect_url. Routing it through Clerk's default redirect
  // would drop the token and break the acceptance flow.
  '/accept-invite(.*)',
  '/contribute/invite(.*)',
  '/api/webhooks/(.*)',
])

// API routes should fail closed with a status code, never a redirect to an
// HTML sign-in page that the caller cannot use.
const isApiRoute = createRouteMatcher(['/api/(.*)', '/trpc/(.*)'])

export default clerkMiddleware(
  async (auth, req) => {
    if (AUTH_DISABLED) return
    if (isPublicRoute(req)) return
    if (isApiRoute(req)) {
      const { userId } = await auth()
      if (!userId) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
      }
      return
    }
    // Without an explicit unauthenticatedUrl, protect() rewrites signed-out
    // page requests to /_not-found. Staff following a link from an alert email
    // then hit a bare 404 instead of being asked to sign in. Send them to
    // /sign-in and carry the destination so they land where they were headed.
    // The path is relative on purpose: the sign-in page rejects absolute
    // redirect_url values to avoid an open redirect.
    const signInUrl = new URL('/sign-in', req.nextUrl)
    signInUrl.searchParams.set('redirect_url', `${req.nextUrl.pathname}${req.nextUrl.search}`)
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
