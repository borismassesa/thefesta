import { ImageResponse } from 'next/og'
import { getPublicInvite } from '@/lib/dashboard/queries'
import { formatLongDate } from '@/lib/dashboard/share'

// Reuse the service-role query (Node) to read the couple's public details.
export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = "You're invited"

interface Props {
  params: Promise<{ slug: string }>
}

export default async function OgImage({ params }: Props) {
  const { slug } = await params
  const data = await getPublicInvite(slug)

  const coupleName = data?.coupleName ?? "You're invited"
  const dateLabel = formatLongDate(data?.weddingDate)
  const city = data?.city ?? ''
  const cover = data?.coverImageUrl ?? null

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          background: '#FAF7F2',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            flex: 1,
            padding: '76px',
          }}
        >
          <div style={{ display: 'flex', fontSize: 26, letterSpacing: 6, color: '#14342B' }}>
            KARIBU • YOU&apos;RE INVITED
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 82,
              fontWeight: 700,
              color: '#14342B',
              marginTop: 22,
              lineHeight: 1.05,
            }}
          >
            {coupleName}
          </div>
          {dateLabel ? (
            <div style={{ display: 'flex', fontSize: 38, color: '#1A1A1A', marginTop: 22 }}>{dateLabel}</div>
          ) : null}
          {city ? (
            <div style={{ display: 'flex', fontSize: 30, color: '#6B6B6B', marginTop: 6 }}>{city}</div>
          ) : null}
          <div style={{ display: 'flex', marginTop: 44 }}>
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
              }}
            >
              <span style={{ display: 'flex' }}>Powered with</span>
              <span style={{ display: 'flex', color: '#C9A0DC' }}>&#10084;</span>
              <span style={{ display: 'flex' }}>by OpusPass</span>
            </div>
          </div>
        </div>
        {cover ? (
          <div style={{ display: 'flex', width: 470, height: '100%' }}>
            <img src={cover} alt="" width={470} height={630} style={{ width: 470, height: 630, objectFit: 'cover' }} />
          </div>
        ) : null}
      </div>
    ),
    {
      ...size,
      headers: {
        'cache-control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400',
      },
    },
  )
}
