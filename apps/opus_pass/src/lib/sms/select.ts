import { BeemSmsProvider, type BeemConfig } from './beem'
import { StubSmsProvider } from './stub'
import type { SmsPurpose } from './purpose'
import type { SmsProvider } from './types'

/**
 * Which implementation handles a purpose, given an already-resolved gate and
 * config.
 *
 * Split out of `./index` (which is `server-only`, and so cannot be imported by
 * a test) purely so this decision is asserted rather than assumed. It reads no
 * environment of its own: the caller passes in what it found.
 */
export function selectSmsProvider(
  purpose: SmsPurpose,
  opts: { enabled: boolean; config: BeemConfig | null },
): SmsProvider {
  if (!opts.enabled) return new StubSmsProvider(purpose)
  // Flag on but credentials missing or partial: stay on the stub rather than
  // returning a provider that reports itself live and then fails every send.
  if (!opts.config) {
    console.warn('[sms] Beem is enabled for this purpose but not configured; using stub', { purpose })
    return new StubSmsProvider(purpose)
  }
  return new BeemSmsProvider(opts.config, purpose)
}
