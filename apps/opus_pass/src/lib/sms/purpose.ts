/**
 * Which outbound surface an SMS belongs to, and whether the live gateway is
 * switched on for it.
 *
 * Free of `server-only` so the gating rules can be unit tested — this is the
 * control that decides whether real money is spent, so it is asserted rather
 * than assumed.
 *
 * The reason this exists: `getSmsProvider()` used to take no arguments, so the
 * moment it returned a live provider *every* existing SMS surface went live at
 * once — couples' pledge nudges and staff-triggered sends included. Purpose is
 * passed in explicitly by the caller; nothing here inspects routes, stacks or
 * request context, because a mis-detected surface fails open.
 */

export type SmsPurpose =
  /** Guest-facing event invitations and their entrance-code follow-ups. */
  | 'invitation'
  /** A couple nudging their own guests about a pledge, from their dashboard. */
  | 'pledge'
  /** OpusFesta staff sending a pledge request/reminder on a couple's behalf. */
  | 'admin_pledge'
  /** Commission-service status notifications from the dispatcher. */
  | 'commission'

export const SMS_PURPOSES: readonly SmsPurpose[] = [
  'invitation',
  'pledge',
  'admin_pledge',
  'commission',
]

/**
 * Each purpose gets its own flag rather than sharing one. Pledge sends ask a
 * guest for money and staff sends act on someone else's roster; neither should
 * be switched on as a side effect of turning invitations on.
 */
const PURPOSE_FLAG: Record<SmsPurpose, string> = {
  invitation: 'SMS_BEEM_INVITATIONS_ENABLED',
  pledge: 'SMS_BEEM_PLEDGES_ENABLED',
  admin_pledge: 'SMS_BEEM_ADMIN_PLEDGES_ENABLED',
  commission: 'SMS_BEEM_COMMISSIONS_ENABLED',
}

/** The env var gating live sends for a purpose. Exported for docs and tests. */
export function purposeFlagName(purpose: SmsPurpose): string {
  return PURPOSE_FLAG[purpose]
}

/** Only an explicit `true` opts in. Unset, empty, `false`, `0` all stay off. */
function isEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true'
}

/**
 * Whether the Beem gateway is permitted for this purpose.
 *
 * Two independent switches must both be on: `SMS_PROVIDER=beem` selects the
 * gateway for the app, and the per-purpose flag opts that one surface in. A
 * purpose that is off falls back to the dry-run stub — it is never an error,
 * so a disabled surface keeps working exactly as it does today.
 */
export function isBeemEnabledForPurpose(
  purpose: SmsPurpose,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.SMS_PROVIDER?.trim().toLowerCase() !== 'beem') return false
  return isEnabled(env[PURPOSE_FLAG[purpose]])
}
