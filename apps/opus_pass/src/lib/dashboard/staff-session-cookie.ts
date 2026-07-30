/**
 * The staff-session cookie name, in its own module because middleware (edge
 * runtime) needs it and ./staff-session.ts is `server-only` and pulls in
 * node:crypto. Nothing else lives here.
 */
export const STAFF_SESSION_COOKIE = 'of_staff_couple'
