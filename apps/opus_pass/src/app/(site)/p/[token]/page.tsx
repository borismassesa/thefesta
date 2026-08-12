import type { Metadata } from 'next'
import { resolveWalletPass, type WalletPassView } from '@/lib/checkin/wallet-tokens'
import { configuredProviders, walletIssuanceReady } from '@/lib/wallet/providers'
import { SaveToWalletButtons } from './SaveToWalletButtons'
import { formatLongDateSw, formatTicketDate } from '@/lib/dashboard/share'

// Per-guest, capability-gated, and it must not be indexed or cached anywhere.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your entry pass',
  // The URL is itself a capability, so it must not travel onward in a Referer
  // header, and it must never be indexed.
  referrer: 'no-referrer',
  robots: { index: false, follow: false, nocache: true },
}

/**
 * The guest's entry-pass surface.
 *
 * Reached with a wallet management token, which is a deliberately narrow
 * capability: it may show this page and (from PR 4) hand the pass to Apple or
 * Google Wallet. It cannot change an RSVP, reveal a phone number or admit
 * anybody. Nothing on this page is an exception to that.
 *
 * Device detection belongs in PR 4 and is presentation only when it arrives:
 * which wallet button to lead with is never an authorisation decision.
 */
export default async function WalletPassPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const resolved = await resolveWalletPass(token)

  if (resolved.state === 'unknown') {
    return (
      <PassShell title="This link isn't valid">
        <p style={COPY}>
          Check the message it came from, or ask the couple to send it again.
        </p>
      </PassShell>
    )
  }

  // Only the 'available' branch is guaranteed a pass, so these two read from
  // the nullable value and the narrowed one is taken after the guards below.
  const coupleName = coupleLabel(resolved.pass)
  const sw = resolved.pass?.ticketLanguage === 'sw'

  if (resolved.state === 'revoked') {
    return (
      <PassShell title={sw ? 'Tiketi hii imezimwa' : 'This pass has been turned off'}>
        <p style={COPY}>
          {sw
            ? 'Wasiliana na wenyeji ili kupata tiketi mpya.'
            : 'Contact the hosts to have a new pass sent to you.'}
        </p>
      </PassShell>
    )
  }

  if (resolved.state === 'not_yet_eligible') {
    return (
      <PassShell title={sw ? 'Bado hujathibitisha' : 'Not confirmed yet'}>
        <p style={COPY}>
          {sw
            ? `Thibitisha kuhudhuria ${coupleName} ili kupata tiketi yako.`
            : `Confirm you're attending ${coupleName} and your pass will appear here.`}
        </p>
      </PassShell>
    )
  }

  if (resolved.state === 'event_over') {
    return (
      <PassShell title={sw ? 'Tukio limekwisha' : 'This event has passed'}>
        <p style={COPY}>
          {sw ? 'Asante kwa kuhudhuria.' : 'Thank you for celebrating with them.'}
        </p>
      </PassShell>
    )
  }

  const pass = resolved.pass
  const dateLabel = sw ? formatLongDateSw(pass.startsAt) : formatTicketDate(pass.startsAt)
  const remaining = Math.max(pass.entryAllowance - pass.checkedInCount, 0)

  return (
    <PassShell title={coupleName} subtitle={pass.guestName}>
      {/* The ticket itself, drawn behind the same capability as this page.
          Deliberately a plain <img>: next/image would proxy this through the
          shared image optimizer, which caches by URL and would put one guest's
          scannable credential into a cache other guests are served from. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/p/${encodeURIComponent(token)}/pass`}
        alt={sw ? 'Tiketi yako' : 'Your entry pass'}
        style={{
          width: '100%',
          maxWidth: 420,
          height: 'auto',
          borderRadius: 18,
          display: 'block',
          margin: '0 auto',
          boxShadow: '0 18px 50px rgba(74, 36, 116, 0.28)',
        }}
      />

      {/* Which providers are offered is decided here, on the server, by
          whether their credentials exist. The client only orders them. */}
      <SaveToWalletButtons
        token={token}
        providers={walletIssuanceReady() ? configuredProviders() : []}
        language={sw ? 'sw' : 'en'}
      />

      <dl style={{ margin: '28px 0 0', display: 'grid', gap: 14 }}>
        <Detail label={sw ? 'Tarehe' : 'Date'} value={dateLabel} />
        <Detail label={sw ? 'Mahali' : 'Venue'} value={pass.venueName} />
        <Detail label={sw ? 'Mji' : 'City'} value={pass.city} />
        <Detail
          label={sw ? 'Wageni' : 'Admits'}
          value={
            pass.checkedInCount > 0
              ? sw
                ? `${remaining} kati ya ${pass.entryAllowance} wamebaki`
                : `${remaining} of ${pass.entryAllowance} remaining`
              : String(pass.entryAllowance)
          }
        />
      </dl>

      <p style={{ ...COPY, marginTop: 26, fontSize: 14 }}>
        {sw
          ? 'Onyesha msimbo huu mlangoni. Usishiriki tiketi hii na mtu mwingine.'
          : 'Show this code at the door. This pass admits the named guest only, so please keep it to yourself.'}
      </p>
    </PassShell>
  )
}

/** The couple this pass is for, falling back through what the event records. */
function coupleLabel(pass: WalletPassView | null): string {
  if (!pass) return 'the celebration'
  const names = [pass.partner1Name, pass.partner2Name].filter(Boolean)
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  return names[0] || pass.eventName || 'the celebration'
}

const COPY = {
  margin: 0,
  color: 'rgba(255,255,255,0.78)',
  fontSize: 16,
  lineHeight: 1.6,
} as const

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <dt style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>{label}</dt>
      <dd style={{ margin: 0, color: '#FFF', fontSize: 15, textAlign: 'right' }}>{value}</dd>
    </div>
  )
}

function PassShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <main
      style={{
        minHeight: '100dvh',
        background: 'linear-gradient(180deg, #2E1650 0%, #4A2472 100%)',
        padding: '48px 20px 64px',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: '100%', maxWidth: 460 }}>
        <p
          style={{
            margin: 0,
            color: '#FFF24D',
            letterSpacing: '0.18em',
            fontSize: 12,
            textTransform: 'uppercase',
          }}
        >
          OpusPass
        </p>
        <h1 style={{ margin: '10px 0 4px', color: '#FFF', fontSize: 30, lineHeight: 1.2 }}>
          {title}
        </h1>
        {subtitle ? (
          <p style={{ margin: '0 0 28px', color: 'rgba(255,255,255,0.7)', fontSize: 16 }}>
            {subtitle}
          </p>
        ) : (
          <div style={{ height: 24 }} />
        )}
        {children}
      </div>
    </main>
  )
}
