import { NextResponse } from 'next/server'
import { getDashboardUser } from '@/lib/dashboard/auth'
import { listFavoriteProductIds, addFavorite, removeFavorite } from '@/lib/dashboard/favorites'

export const dynamic = 'force-dynamic'

/** GET /api/favorites → { ids, count } of saved designs for the signed-in couple. */
export async function GET() {
  const user = await getDashboardUser()
  if (!user) return NextResponse.json({ ids: [], count: 0 })
  const ids = await listFavoriteProductIds(user.id)
  return NextResponse.json({ ids, count: ids.length })
}

/**
 * POST /api/favorites → save or remove a design.
 * Body: { productId, favorited } — `favorited: true` saves, `false` removes.
 */
export async function POST(req: Request) {
  const user = await getDashboardUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as {
    productId?: string
    favorited?: boolean
  }
  if (!body.productId) return NextResponse.json({ ok: false }, { status: 400 })
  if (body.favorited) {
    await addFavorite(user.id, body.productId)
  } else {
    await removeFavorite(user.id, body.productId)
  }
  return NextResponse.json({ ok: true, favorited: Boolean(body.favorited) })
}
