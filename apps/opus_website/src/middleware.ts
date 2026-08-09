import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'

const isProtected = createRouteMatcher([
  '/onboarding(.*)',
  '/my(.*)',
  '/api/my/(.*)',
])

const candidateAuthMiddleware = clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) await auth.protect({ unauthenticatedUrl: new URL('/sign-in', req.url).toString() })
}, { signInUrl: '/sign-in' })

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  const recruitmentE2eAuthDisabled =
    process.env.NODE_ENV !== 'production' &&
    Boolean(process.env.RECRUITMENT_E2E_CANDIDATE_EMAIL?.trim())

  if (recruitmentE2eAuthDisabled) return NextResponse.next()
  return candidateAuthMiddleware(req, event)
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
