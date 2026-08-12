import { SignIn } from '@clerk/nextjs'
import { currentUser } from '@clerk/nextjs/server'
import AuthShell from '@/components/AuthShell'
import { authAppearance } from '@/components/auth-appearance'
import AlreadySignedIn from './AlreadySignedIn'

export const metadata = { title: 'Sign in — OpusPass' }

export default async function SignInPage() {
  // The apex Clerk session is shared across *.opusfesta.com, so a visitor may
  // already be signed in. Don't silently keep the old account (that's how people
  // ended up logged in as a different account than the one they picked) — offer
  // to continue or to sign out and use a different account.
  const user = await currentUser()
  if (user) {
    const email =
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      ''
    return (
      <AuthShell
        panelTitle="Welcome back to OpusPass"
        panelSubtitle="Your invitations, wedding website, guest list and live RSVPs — all in one place."
      >
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[#1A1A1A]">
          You&rsquo;re already signed in
        </h1>
        <p className="mt-2 text-[15px] text-gray-500">
          Continue to your dashboard, or sign out to use a different account.
        </p>
        <AlreadySignedIn email={email} />
      </AuthShell>
    )
  }

  return (
    <AuthShell
      panelTitle="Welcome back to OpusPass"
      panelSubtitle="Your invitations, wedding website, guest list and live RSVPs — all in one place."
    >
      <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[#1A1A1A]">
        Sign in to your account
      </h1>
      <p className="mt-2 text-[15px] text-gray-500">
        Welcome back — sign in to manage your celebration.
      </p>

      {/*
        routing="hash" is required under basePath '/opuspass' (see next.config.ts).
        Clerk's default "path" routing infers its mount path and navigates to
        sub-paths; that inference doesn't account for the basePath prefix, so the
        component mounts at /opuspass/sign-in but expects /sign-in and hangs on a
        blank/loading state. Hash routing keeps every step on the same URL (#/...)
        and ignores the path.

        Same Clerk instance as opus_website + vendors_portal, so this account is
        recognised across the whole OpusFesta ecosystem (shared apex session).
      */}
      <div className="mt-6">
        <SignIn
          routing="hash"
          signUpUrl="/sign-up"
          fallbackRedirectUrl="/my/dashboard"
          appearance={authAppearance}
        />
      </div>
    </AuthShell>
  )
}
