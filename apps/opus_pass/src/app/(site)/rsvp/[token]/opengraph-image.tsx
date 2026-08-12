import { ImageResponse } from 'next/og'
import { getPublicRsvpData } from '@/lib/dashboard/queries'
import { formatLongDate } from '@/lib/dashboard/share'

// Personal RSVP links unfurl too — but the preview shows ONLY the couple +
// date. The guest's name is PII and the link can be re-forwarded, so it must
// never appear in the OG card.
export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = "You're invited"

interface Props {
  params: Promise<{ token: string }>
}

export default async function OgImage({ params }: Props) {
  const { token } = await params
  const data = await getPublicRsvpData(token)

  const coupleName = data?.coupleName ?? "You're invited"
  const dateLabel = formatLongDate(data?.weddingDate)

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          width: '100%',
          height: '100%',
          background: '#FAF7F2',
          border: '14px solid #14342B',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 28, letterSpacing: 6, color: '#14342B' }}>
          KARIBU • YOU&apos;RE INVITED
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 88,
            fontWeight: 700,
            color: '#14342B',
            marginTop: 24,
            textAlign: 'center',
            lineHeight: 1.05,
            padding: '0 60px',
          }}
        >
          {coupleName}
        </div>
        {dateLabel ? (
          <div style={{ display: 'flex', fontSize: 40, color: '#1A1A1A', marginTop: 24 }}>{dateLabel}</div>
        ) : null}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#9FE870',
            color: '#14342B',
            fontSize: 24,
            fontWeight: 600,
            padding: '12px 24px',
            borderRadius: 999,
            marginTop: 48,
          }}
        >
          <span style={{ display: 'flex' }}>Powered with</span>
          <span style={{ display: 'flex', color: '#C9A0DC' }}>&#10084;</span>
          <span style={{ display: 'flex' }}>by OpusPass</span>
        </div>
      </div>
    ),
    { ...size },
  )
}
