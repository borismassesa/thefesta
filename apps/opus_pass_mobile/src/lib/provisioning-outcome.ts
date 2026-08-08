export type ProvisionOutcome = 'already-provisioned' | 'provisioned' | 'unresolved';

/**
 * Whether the account ended up usable, given what we saw.
 *
 * Kept in its own import-free module so it stays testable: the test runner is
 * `tsx --test` on plain Node, which can't transform anything that reaches
 * react-native — and `provisioning.ts` does, via the Supabase and Clerk
 * clients it needs.
 *
 * The rule is easy to get wrong, which is why it's worth isolating: the HTTP
 * status is *not* the answer. The edge function answers non-2xx when it can't
 * write Clerk metadata, and the response can be lost outright on a flaky
 * connection, while the `public.users` row it was asked to create is sitting
 * there working fine. The row is what the app needs, so the row decides.
 */
export function decideOutcome(input: {
  hadRowBefore: boolean;
  httpOk: boolean;
  rowAfter: string | null;
}): ProvisionOutcome {
  if (input.hadRowBefore) return 'already-provisioned';
  return input.rowAfter ? 'provisioned' : 'unresolved';
}
