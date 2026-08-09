const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Returns a deterministic candidate identity only for an explicitly configured
 * non-production E2E run. Production always ignores the override, even if the
 * environment variable is accidentally present.
 */
export function candidatePortalTestEmail(
  nodeEnv: string | undefined,
  configuredEmail: string | undefined,
): string | null {
  if (nodeEnv === 'production') return null
  const email = configuredEmail?.trim().toLowerCase() ?? ''
  return EMAIL_PATTERN.test(email) ? email : null
}
