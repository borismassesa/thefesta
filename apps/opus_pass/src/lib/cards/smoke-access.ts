// Who may reach the card-delivery smoke endpoint.
//
// Its own module, with no server-only imports, for two reasons: this is the
// boundary that keeps a diagnostic endpoint out of production, and a boundary
// whose every failure looks identical from outside is one that will not tell you
// when it breaks. So it has to be testable, and importing the route itself pulls
// in the Supabase client and its server-only marker.

/**
 * Environment first, secret second.
 *
 * The ordering is the point: production is refused without consulting the secret
 * at all, so holding the secret is not sufficient to reach it there.
 */
export function smokeAccessPermitted(request: Request): boolean {
  if (process.env.VERCEL_ENV === 'production') return false
  const expected = process.env.CARD_DELIVERY_SMOKE_SECRET
  // Unconfigured is closed, not open.
  if (!expected) return false
  // Deliberately a different secret from the asset-token key: one authenticates
  // this route, the other mints guest URLs, and sharing them would couple two
  // unrelated rotations.
  return request.headers.get('x-smoke-secret') === expected
}
