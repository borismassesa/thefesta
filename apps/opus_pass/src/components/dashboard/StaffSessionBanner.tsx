import { ShieldAlert } from 'lucide-react'

/**
 * Shown on every dashboard page while an OpusFesta admin is acting for a
 * couple. Loud on purpose: whoever is looking at this screen must never be in
 * any doubt that changes they make land on a real couple's account.
 *
 * The "Leave" control posts to /api/staff-access/exit, which drops the cookie.
 * A plain form, so it works with JavaScript disabled and needs no client
 * component.
 */
export default function StaffSessionBanner({
  coupleName,
  coupleEmail,
  adminEmail,
  expiresAt,
}: {
  coupleName: string
  coupleEmail: string
  adminEmail: string
  expiresAt: Date
}) {
  const until = expiresAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  return (
    // `dash-header-safe` reserves the same right-hand clearance every page title
    // does: the account and cart icons are overlaid absolutely in the top-right
    // of the content area (DashboardShell), and without this they sit on top of
    // the Leave button and swallow the click.
    <div className="dash-header-safe mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ShieldAlert className="h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm text-amber-900">
          <span className="font-semibold">Staff session.</span> You are signed in as{' '}
          <span className="font-semibold">{coupleName || coupleEmail}</span>
          {coupleEmail && coupleName ? ` (${coupleEmail})` : ''}, opened by {adminEmail}. Anything you
          change here changes their real account. Access ends at {until}.
        </p>
        <form action="/api/staff-access/exit" method="post" className="shrink-0">
          <button
            type="submit"
            className="rounded-xl bg-amber-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-800"
          >
            Leave this account
          </button>
        </form>
      </div>
    </div>
  )
}
