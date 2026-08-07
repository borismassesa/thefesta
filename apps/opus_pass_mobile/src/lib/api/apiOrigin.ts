/**
 * Which origin the check-in API is reached on.
 *
 * Its own module, free of react-native imports, so the rule can be unit
 * tested: getting it wrong takes the door offline with nothing visibly broken
 * on either machine, which is the worst kind of failure to debug at an event.
 */

/** Hosts that only mean anything on the machine or network you are sitting on. */
function isLocalHostname(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    // RFC1918 ranges — an address handed out by the router.
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

/**
 * In production this is simply the app's configured origin. In development it
 * is a LAN address, and a LAN address is exactly the thing that changes
 * without anyone touching the code: the router hands the Mac a new lease, and
 * an EXPO_PUBLIC_OPUS_PASS_URL that was right yesterday now points at
 * whichever device inherited that address. The door then spins until it times
 * out, with nothing wrong on either machine.
 *
 * Metro already knows the answer. The bundle running on this device was
 * served by the dev machine, so Metro's host IS the dev machine's current
 * address; taking the host from there and keeping the configured port means
 * the API follows the Mac around instead of being retyped after every lease.
 *
 * Only the host is replaced, and only when the configured URL is itself
 * local: pointing a dev build at staging or production is a deliberate act
 * and must not be quietly undone.
 */
export function resolveApiOrigin(
  configured: string,
  /** Metro's "host:port", from Constants.expoConfig.hostUri. */
  metroHostUri: string,
  isDev: boolean
): string {
  if (!isDev) return configured;

  const match = /^(https?:)\/\/([^/:]+)(?::(\d+))?$/.exec(configured);
  if (!match || !isLocalHostname(match[2])) return configured;

  const metroHost = metroHostUri.split(':')[0];
  if (!metroHost || metroHost === match[2]) return configured;

  const port = match[3] ? `:${match[3]}` : '';
  return `${match[1]}//${metroHost}${port}`;
}
