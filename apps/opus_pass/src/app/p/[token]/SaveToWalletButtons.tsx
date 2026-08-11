'use client'

import { useState } from 'react'

/**
 * The "add to wallet" controls on a guest's pass page.
 *
 * A client component only because issuing has to be a POST and the guest then
 * has to be sent to the provider. Device detection here orders the buttons and
 * nothing else: which provider a guest may use is decided on the server by
 * whether its credentials exist, never by what their user agent claims.
 */

type ProviderId = 'google' | 'apple'

const LABELS: Record<ProviderId, string> = {
  google: 'Add to Google Wallet',
  apple: 'Add to Apple Wallet',
}

export function SaveToWalletButtons({
  token,
  providers,
  language,
}: {
  token: string
  providers: ProviderId[]
  language: 'en' | 'sw'
}) {
  const [busy, setBusy] = useState<ProviderId | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (providers.length === 0) return null

  // Presentation only: lead with the wallet the guest's phone actually has.
  const ordered = [...providers].sort((a, b) => rank(a) - rank(b))

  async function save(provider: ProviderId) {
    setBusy(provider)
    setError(null)
    try {
      const res = await fetch(`/p/${encodeURIComponent(token)}/${provider}`, { method: 'POST' })
      const body = (await res.json().catch(() => null)) as { saveUrl?: string } | null

      if (!res.ok || !body?.saveUrl) {
        // Three of these are permanent, and telling a guest to "try again" for
        // a permanent failure sends them tapping instead of doing the one
        // thing that works: the scannable code is already on screen above.
        setError(
          res.status === 503
            ? language === 'sw'
              ? 'Kuhifadhi kwenye Wallet hakupatikani kwa tukio hili. Onyesha msimbo ulio hapo juu mlangoni.'
              : 'Wallet saving is unavailable for this event. Show the code above at the door.'
            : res.status === 404
              ? language === 'sw'
                ? 'Kiungo hiki hakitumiki tena. Waombe wenyeji wakutumie kipya.'
                : 'This pass link is no longer active. Ask the couple to send you a new one.'
              : language === 'sw'
                ? 'Imeshindikana kuhifadhi. Onyesha msimbo ulio hapo juu mlangoni, au jaribu tena.'
                : "Couldn't add the pass. Show the code above at the door, or try again."
        )
        return
      }
      // Full navigation, not a new tab: the provider page is a handoff, and a
      // popup here is the thing mobile browsers block most eagerly.
      window.location.assign(body.saveUrl)
    } catch {
      setError(
        language === 'sw'
          ? 'Hakuna mtandao. Jaribu tena.'
          : 'No connection. Please try again.'
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ marginTop: 28, display: 'grid', gap: 12 }}>
      {ordered.map((provider) => (
        <button data-opus-button="control"
          key={provider}
          type="button"
          onClick={() => void save(provider)}
          disabled={busy !== null}
          style={{
            width: '100%',
            padding: '16px 20px',
            borderRadius: 14,
            border: 'none',
            background: '#000',
            color: '#FFF',
            fontSize: 16,
            fontWeight: 600,
            cursor: busy ? 'progress' : 'pointer',
            opacity: busy && busy !== provider ? 0.5 : 1,
          }}
        >
          {busy === provider
            ? language === 'sw'
              ? 'Inahifadhi...'
              : 'Adding...'
            : LABELS[provider]}
        </button>
      ))}

      {error ? (
        <p role="alert" style={{ margin: 0, color: '#FFB4AB', fontSize: 14 }}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** iOS leads with Apple, everything else leads with Google. */
function rank(provider: ProviderId): number {
  if (typeof navigator === 'undefined') return provider === 'google' ? 0 : 1
  const isApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)
  if (isApple) return provider === 'apple' ? 0 : 1
  return provider === 'google' ? 0 : 1
}
