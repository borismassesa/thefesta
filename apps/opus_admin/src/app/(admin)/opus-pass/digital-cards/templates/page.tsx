import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertTriangle, CheckCircle2, ChevronRight, FileImage, PenTool } from 'lucide-react'
import { hasPermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { resolveOpusPassAssetUrl } from '@/lib/cms/opus-pass-asset-url'
import {
  CARD_FIELD_ROLES,
  assessBindings,
  type CardFieldBinding,
} from '@/lib/cms/card-field-roles'
import DigitalCardsNavTabs from '../DigitalCardsNavTabs'
import SetDigitalCardsHeading from '../SetDigitalCardsHeading'

export const dynamic = 'force-dynamic'

const BASE = '/opus-pass/digital-cards/templates'

type Row = {
  id: string
  name: string
  category: string
  image_url: string | null
  field_bindings: CardFieldBinding[] | null
}

/** Whether a card's artwork can even be scanned for text layers. */
function artworkKind(imageUrl: string | null): 'svg' | 'raster' | 'none' {
  const url = (imageUrl ?? '').trim()
  if (!url) return 'none'
  return /\.svg(\?|#|$)/i.test(url) ? 'svg' : 'raster'
}

export default async function CardDesignerPage() {
  if (!(await hasPermission('cms.read'))) redirect('/')

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('website_invitations_products')
    .select('id, name, category, image_url, field_bindings')
    .order('name', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as Row[]
  const svgCards = rows.filter((r) => artworkKind(r.image_url) === 'svg')
  const otherCards = rows.filter((r) => artworkKind(r.image_url) !== 'svg')

  return (
    <>
      <SetDigitalCardsHeading />
      <DigitalCardsNavTabs />

      <div className="px-8 pt-6 pb-6 space-y-6">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <div className="flex items-start gap-3">
            <PenTool className="mt-0.5 h-5 w-5 shrink-0 text-[#7E5896]" />
            <div className="min-w-0 space-y-1">
              <h2 className="text-sm font-bold text-gray-900">Map a card&apos;s text layers to fields</h2>
              <p className="text-sm text-gray-500">
                A card can only be personalised once its artwork layers are matched to the{' '}
                {CARD_FIELD_ROLES.length} card fields. That mapping is what lets us ask a couple for
                their details and place the answers into the design.
              </p>
            </div>
          </div>
        </div>

        <section className="space-y-3">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
            SVG artwork — mappable ({svgCards.length})
          </h3>
          {svgCards.length === 0 ? (
            <p className="rounded-2xl border border-gray-100 bg-white p-6 text-sm text-gray-400">
              No cards have SVG artwork yet.
            </p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
              <ul className="divide-y divide-gray-100">
                {svgCards.map((card) => {
                  const bindings = card.field_bindings ?? []
                  const readiness = assessBindings(bindings)
                  const unmapped = bindings.length === 0
                  return (
                    <li key={card.id}>
                      <Link
                        href={`${BASE}/${card.id}`}
                        className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-gray-50/60"
                      >
                        <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-gray-100 ring-1 ring-gray-200">
                          {card.image_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={resolveOpusPassAssetUrl(card.image_url)}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-gray-900 group-hover:text-[#7E5896]">
                            {card.name}
                          </p>
                          <p className="truncate text-xs text-gray-400">{card.category}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          {unmapped ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">
                              Not mapped
                            </span>
                          ) : readiness.canFulfilOrders ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Ready for orders
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {readiness.blocked.length} field
                              {readiness.blocked.length === 1 ? '' : 's'} blocked
                            </span>
                          )}
                          {!unmapped && (
                            <p className="mt-1 text-[11px] text-gray-400 tabular-nums">
                              {readiness.ready.length}/{CARD_FIELD_ROLES.length} fields live
                            </p>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 group-hover:text-[#7E5896]" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
            Flat artwork — cannot be personalised ({otherCards.length})
          </h3>
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <div className="flex items-start gap-3">
              <FileImage className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
              <p className="text-sm text-gray-500">
                {otherCards.length} card{otherCards.length === 1 ? '' : 's'} have PNG/JPG artwork.
                Flat images hold no text layers, so nothing on them can be changed per couple. They
                need SVG artwork before they can go through the design pipeline.
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
