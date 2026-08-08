/**
 * Splits a typed full name into the first/last pair Clerk requires.
 *
 * The OpusFesta Clerk instance has both `first_name` and `last_name` marked
 * required, and a `signUp.create()` missing either sits at
 * `status: 'missing_requirements'` forever — the email code arrives but can
 * never complete the sign-up. So a single-token name has to be rejected in the
 * form rather than discovered as a dead end after verification.
 *
 * Returns null when there aren't at least two tokens.
 */
export function splitFullName(input: string): { firstName: string; lastName: string } | null {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;

  return { firstName: tokens[0], lastName: tokens.slice(1).join(' ') };
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Best available human name for a Clerk user.
 *
 * Used as `partner1_name` when provisioning after a Google or Apple sign-in,
 * where there is no form to ask. Apple in particular hands back a name only on
 * the very first authorisation and may withhold it entirely, so the email
 * local-part and a generic label are real fallbacks, not defensive padding.
 */
export function displayNameFor(user: {
  fullName?: string | null;
  firstName?: string | null;
  email?: string | null;
}): string {
  const fullName = user.fullName?.trim();
  if (fullName) return fullName;

  const firstName = user.firstName?.trim();
  if (firstName) return firstName;

  const localPart = user.email?.trim().split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  if (localPart) return titleCase(localPart);

  return 'Partner 1';
}
