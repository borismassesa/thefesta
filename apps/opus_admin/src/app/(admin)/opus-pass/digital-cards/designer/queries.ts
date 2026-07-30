import 'server-only'

import { createSupabaseAdminClient } from '@/lib/supabase'
import { readOrderLine, type OrderLineItem } from '@/lib/cms/order-add-ons'
import { slaApplies, slaState } from '@/lib/cms/design-sla'
import type { DesignJob, DesignStatus, JobSla } from './types'

type OrderRow = {
  id: string
  ref: string
  items: OrderLineItem[] | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  event_date: string | null
  paid_at: string | null
  reviewed_at: string | null
}

type DesignRow = {
  id: string
  order_id: string
  line_index: number
  status: string
  assigned_to: string | null
  requested_fields: string[] | null
  field_values: Record<string, unknown> | null
}

/**
 * Every card line on an order that finance has approved.
 *
 * "Approved" is `status = 'paid'` AND `reviewed_at` set — a paid-but-unreviewed
 * order is still with finance and must not reach a designer.
 */
export async function getDesignQueue(): Promise<DesignJob[]> {
  const supabase = createSupabaseAdminClient()

  const { data: orderData, error: orderError } = await supabase
    .from('invitation_orders')
    .select('id, ref, items, contact_name, contact_email, contact_phone, event_date, paid_at, reviewed_at')
    .eq('status', 'paid')
    .not('reviewed_at', 'is', null)
    .order('paid_at', { ascending: true })
  if (orderError) throw orderError

  const orders = (orderData ?? []) as OrderRow[]
  if (orders.length === 0) return []

  const [{ data: designData, error: designError }, productMap] = await Promise.all([
    supabase
      .from('invitation_card_designs')
      .select('id, order_id, line_index, status, assigned_to, requested_fields, field_values')
      .in('order_id', orders.map((o) => o.id)),
    loadCardImages(supabase, orders),
  ])
  if (designError) throw designError

  const designs = new Map<string, DesignRow>()
  for (const row of (designData ?? []) as DesignRow[]) {
    designs.set(`${row.order_id}:${row.line_index}`, row)
  }

  const assigneeNames = await loadAssigneeNames(
    supabase,
    [...designs.values()].map((d) => d.assigned_to).filter((id): id is string => Boolean(id)),
  )

  // One clock reading for the whole page, so every ring on it agrees.
  const now = new Date()

  const jobs: DesignJob[] = []
  for (const order of orders) {
    const items = Array.isArray(order.items) ? order.items : []
    items.forEach((item, i) => {
      // 1-based to match SQL ordinality and the line_index stored on the job.
      const lineIndex = i + 1
      const quantities = readOrderLine(item)
      const design = designs.get(`${order.id}:${lineIndex}`)

      jobs.push({
        orderId: order.id,
        orderRef: order.ref,
        lineIndex,
        productId: item.id ?? '',
        productName: item.name ?? 'Untitled card',
        cardImage: productMap.get(item.id ?? '') ?? null,

        digitalQty: quantities.digitalCards,
        printQty: quantities.printedCards,
        tier: item.tier ?? null,
        tierId: item.tierId ?? null,
        addOns: quantities.addOns,
        inferred: quantities.inferred,
        unparsed: quantities.unparsed,

        coupleName: order.contact_name,
        coupleEmail: order.contact_email,
        couplePhone: order.contact_phone,
        eventDate: order.event_date,
        paidAt: order.paid_at,
        approvedAt: order.reviewed_at,
        sla: buildSla(order.reviewed_at, (design?.status as DesignStatus) ?? 'not_started', now),

        designId: design?.id ?? null,
        status: (design?.status as DesignStatus) ?? 'not_started',
        assignedTo: design?.assigned_to ?? null,
        assigneeName: design?.assigned_to ? assigneeNames.get(design.assigned_to) ?? null : null,
        requestedFields: design?.requested_fields ?? [],
        fieldValueCount: Object.keys(design?.field_values ?? {}).length,
      })
    })
  }

  return jobs
}

/** Card thumbnails, keyed by product id, for the ids actually on these orders. */
async function loadCardImages(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  orders: OrderRow[],
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      orders.flatMap((o) => (Array.isArray(o.items) ? o.items : []).map((i) => i.id ?? '')),
    ),
  ].filter(Boolean)
  if (ids.length === 0) return new Map()

  const { data } = await supabase
    .from('website_invitations_products')
    .select('id, image_url')
    .in('id', ids)

  return new Map(
    ((data ?? []) as { id: string; image_url: string | null }[])
      .filter((p) => p.image_url)
      .map((p) => [p.id, p.image_url as string]),
  )
}

async function loadAssigneeNames(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const { data } = await supabase
    .from('workforce_employees')
    .select('id, full_name')
    .in('id', unique)
  return new Map(
    ((data ?? []) as { id: string; full_name: string | null }[]).map((e) => [
      e.id,
      e.full_name ?? 'Unnamed',
    ]),
  )
}

/** Server-side SLA snapshot for one job. Null when the clock doesn't apply. */
function buildSla(approvedAt: string | null, status: DesignStatus, now: Date): JobSla | null {
  // Submitted work is genuinely off the clock — nothing to show.
  if (!slaApplies(status)) return null

  const sla = slaState(approvedAt, now)
  if (!sla) {
    // No deadline, but the job is still open. Either it predates tracking or
    // it has no approval date; both are "not measured", not "no data".
    return {
      tone: 'untracked',
      short: '—',
      label: approvedAt
        ? 'Approved before design tracking started, so no 48h deadline applies'
        : 'No approval date, so no deadline could be set',
      elapsedFraction: 0,
      dueAtLabel: '',
    }
  }
  return {
    tone: sla.tone,
    short: sla.short,
    label: sla.label,
    elapsedFraction: sla.elapsedFraction,
    dueAtLabel: sla.dueAt.toISOString(),
  }
}
