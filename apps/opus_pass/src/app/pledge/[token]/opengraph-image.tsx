import { ImageResponse } from 'next/og'
import { getPublicPledgeCouple } from '@/lib/dashboard/queries'
import { isVideoCoverUrl } from '@/lib/dashboard/pledge-page'

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Pledge card'

interface Props {
  params: Promise<{ token: string }>
  searchParams?: Promise<{ event?: string }>
}

function dotDate(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

export default async function PledgeOgImage({ params, searchParams }: Props) {
  const { token } = await params
  const { event: eventId } = searchParams ? await searchParams : {}
  const couple = await getPublicPledgeCouple(token, eventId ?? null)

  const coupleName = couple?.coupleName ?? 'OpusPass'
  const dateLabel = dotDate(couple?.weddingDate ?? null)
  const city = couple?.city ?? ''
  const cover = couple?.pageConfig.coverImageUrl ?? null
  const canRenderCover = Boolean(cover && !isVideoCoverUrl(cover))
  const isFullTemplate = canRenderCover && couple?.pageConfig.coverIsFullTemplate

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          background: '#F5F0E6',
          fontFamily: 'serif',
        }}
      >
        {isFullTemplate ? (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 430,
                height: '100%',
                background: '#ECE3D3',
                padding: 34,
              }}
            >
              <img
                src={cover!}
                alt=""
                width={360}
                height={540}
                style={{
                  width: 360,
                  height: 540,
                  objectFit: 'contain',
                  borderRadius: 24,
                  boxShadow: '0 24px 60px rgba(0,0,0,0.24)',
                }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                width: 770,
                height: '100%',
                padding: '70px 80px',
                background: '#FFFFFF',
              }}
            >
              <div style={{ display: 'flex', fontSize: 24, letterSpacing: 7, color: '#947D65' }}>
                PLEDGE CARD
              </div>
              <div
                style={{
                  display: 'flex',
                  marginTop: 24,
                  fontSize: 42,
                  lineHeight: 1.12,
                  color: '#403D39',
                  fontWeight: 700,
                }}
              >
                {coupleName}
              </div>
              <div style={{ display: 'flex', marginTop: 20, fontFamily: 'sans-serif', fontSize: 26, color: '#63594F' }}>
                Open the pledge page
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  alignSelf: 'flex-start',
                  marginTop: 44,
                  borderRadius: 18,
                  background: '#9FE870',
                  color: '#14342B',
                  fontFamily: 'sans-serif',
                  fontSize: 24,
                  fontWeight: 700,
                  padding: '13px 24px',
                }}
              >
                Contribute now
              </div>
            </div>
          </>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              width: '100%',
              height: '100%',
              background: canRenderCover
                ? `linear-gradient(rgba(20,12,28,0.45),rgba(20,12,28,0.58)), url("${cover}")`
                : 'linear-gradient(135deg,#F7F0E4,#DFD2B9)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              color: canRenderCover ? '#FFFFFF' : '#403D39',
              textAlign: 'center',
              padding: 72,
            }}
          >
            <div style={{ display: 'flex', fontSize: 24, letterSpacing: 8, opacity: 0.78 }}>
              TO CELEBRATE THE WEDDING OF
            </div>
            <div
              style={{
                display: 'flex',
                marginTop: 28,
                fontSize: 88,
                lineHeight: 1,
                letterSpacing: 4,
                fontWeight: 700,
              }}
            >
              {coupleName}
            </div>
            {dateLabel ? (
              <div style={{ display: 'flex', marginTop: 36, fontSize: 38, letterSpacing: 8 }}>
                {dateLabel}
              </div>
            ) : null}
            {city ? (
              <div style={{ display: 'flex', marginTop: 16, fontSize: 24, letterSpacing: 7, opacity: 0.76 }}>
                {city}
              </div>
            ) : null}
          </div>
        )}
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
