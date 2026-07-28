import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

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

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
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
