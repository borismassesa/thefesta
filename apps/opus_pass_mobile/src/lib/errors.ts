/**
 * Extracts a human-readable message from an unknown thrown value.
 *
 * Handles the two shapes the app actually throws:
 *  - Clerk errors, which carry `errors: [{ message }]`
 *  - standard `Error` (and anything else with a string `message`)
 *
 * Lets call sites use `catch (err)` (typed `unknown` under strict mode)
 * instead of `catch (err: any)`.
 */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (typeof err === 'string') return err;

  if (err && typeof err === 'object') {
    const clerkErrors = (err as { errors?: unknown }).errors;
    if (Array.isArray(clerkErrors)) {
      const first = clerkErrors[0] as { message?: unknown } | undefined;
      if (first && typeof first.message === 'string') return first.message;
    }

    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }

  return fallback;
}

/**
 * Top-level `code` on a thrown value. Native modules use this rather than
 * Clerk's nested shape — `expo-apple-authentication` throws
 * `ERR_REQUEST_CANCELED` when the user dismisses the Apple sheet, which we
 * treat as a non-event rather than an error.
 */
export function getErrorCode(err: unknown): string | null {
  if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return null;
}

/**
 * Clerk's machine-readable error code, from `errors: [{ code }]`.
 *
 * Needed wherever a Clerk failure should drive UI rather than just print a
 * message: `form_identifier_exists` sends you to sign-in instead of
 * dead-ending, `form_identifier_not_found` offers to create an account, and
 * `form_password_pwned` (this instance has HIBP checks on) needs an
 * explanation Clerk's raw string doesn't give.
 */
export function getClerkErrorCode(err: unknown): string | null {
  if (err && typeof err === 'object') {
    const clerkErrors = (err as { errors?: unknown }).errors;
    if (Array.isArray(clerkErrors)) {
      const first = clerkErrors[0] as { code?: unknown } | undefined;
      if (first && typeof first.code === 'string') return first.code;
    }
  }
  return null;
}
