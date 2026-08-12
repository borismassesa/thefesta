import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { loadDigitalCardProduct } from '@/lib/cms/digital-cards-products'
import { getDashboardUser } from '@/lib/dashboard/auth'
import { createDashboardClient } from '@/lib/dashboard/supabase'
import CustomiseClient, { type CoupleProfile } from './CustomiseClient'

export const dynamic = 'force-dynamic'

type Params = { id: string }

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params
  const product = await loadDigitalCardProduct(id)
  if (!product) return { title: 'Product not found | OpusFesta' }
  return {
    title: `Customise ${product.name} | OpusFesta`,
    description: `Personalise ${product.name} — add your names, date, venue, colours and message, then send it to every guest by WhatsApp or SMS.`,
  }
}

async function loadCoupleProfile(userId: string): Promise<CoupleProfile | null> {
  const supabase = createDashboardClient()

  const [profileResult, eventResult] = await Promise.all([
    supabase
      .from('couple_profiles')
      .select('partner1_name, partner2_name, wedding_date, city')
      .eq('user_id', userId)
      .maybeSingle<{
        partner1_name: string | null
        partner2_name: string | null
        wedding_date: string | null
        city: string | null
      }>(),
    // Fetch the ceremony event for venue, time, and dress code
    supabase
      .from('wedding_events')
      .select('venue_name, city, starts_at, dress_code')
      .eq('user_id', userId)
      .eq('event_type', 'ceremony')
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle<{
        venue_name: string | null
        city: string | null
        starts_at: string | null
        dress_code: string | null
      }>(),
  ])

  const profile = profileResult.data
  const ceremony = eventResult.data

  if (!profile && !ceremony) return null

  const names = [profile?.partner1_name, profile?.partner2_name].filter(Boolean)
  if (!names.length && !profile?.wedding_date && !profile?.city && !ceremony) return null

  return {
    coupleNames: names.join(' & ') || null,
    weddingDate: profile?.wedding_date ?? null,
    venue: ceremony?.venue_name ?? ceremony?.city ?? profile?.city ?? null,
    ceremonyStartsAt: ceremony?.starts_at ?? null,
    dressCode: ceremony?.dress_code ?? null,
  }
}

export default async function CustomiseProductPage({ params }: { params: Promise<Params> }) {
  const { id } = await params
  const [product, ticketProduct, user] = await Promise.all([
    loadDigitalCardProduct(id),
    loadDigitalCardProduct('p23'),
    getDashboardUser(),
  ])
  if (!product) return notFound()

  const ticketAccentOptions =
    ticketProduct && ticketProduct.palettes.length > 0
      ? ticketProduct.palettes.map((p) => ({ name: p.name ?? p.accent, value: p.accent }))
      : undefined

  const coupleProfile = user ? await loadCoupleProfile(user.id) : null

  return (
    <CustomiseClient
      product={product}
      ticketAccentOptions={ticketAccentOptions}
      coupleProfile={coupleProfile}
    />
  )
}
