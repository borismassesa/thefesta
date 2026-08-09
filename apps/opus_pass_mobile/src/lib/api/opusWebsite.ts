/**
 * Shared transport for opus_website's `/api/my/*` routes.
 *
 * A handful of couple-facing actions live on opus_website rather than in
 * Supabase, because RLS gives couples no write path for them and that app
 * already owns the server-side logic (the proposal state machine, account
 * deletion). Both apps sit on the same Clerk instance, so the default session
 * token authenticates a mobile caller exactly like a browser cookie would.
 *
 * Auth is the default Clerk session token — NOT the `supabase` JWT template
 * the data layer uses. Sending the wrong one reads as signed-out.
 */

/** Defaults to production, matching how src/lib/share.ts resolves its origin. */
export function baseUrl(): string {
  return (process.env.EXPO_PUBLIC_OPUS_WEBSITE_URL || 'https://www.opusfesta.com').replace(
    /\/$/,
    '',
  );
}

/**
 * Carries the HTTP status so callers can map specific codes to their own
 * errors (the proposal routes turn 409 into a conflict the UI explains)
 * without every caller reimplementing the fetch below.
 */
export class OpusWebsiteApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'OpusWebsiteApiError';
    this.status = status;
  }
}

/**
 * opus_website protects /api/my/* with `auth.protect({ unauthenticatedUrl })`,
 * which redirects rather than returning 401 — a rejected token comes back as
 * an HTML sign-in page, not JSON. Parse defensively so that surfaces as a
 * clear auth error instead of a JSON parse crash.
 */
export async function requestOpusWebsite<T>(
  path: string,
  token: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const response = await fetch(`${baseUrl()}/api/my${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    redirect: 'manual',
  });

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new OpusWebsiteApiError(
      response.status === 0 || response.status >= 300
        ? 'Could not sign in to your OpusFesta account. Please try again.'
        : 'Unexpected response from the server.',
      response.status,
    );
  }

  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new OpusWebsiteApiError(payload.error || 'Request failed.', response.status);
  }
  return payload;
}
