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
  started_at: string | null
  assigned_to: string | null
  requested_fields: string[] | null
  field_values: Record<string, unknown> | null
  change_requested_at: string | null
}

/**
 * Every card line on an order that finance has approved.
 *
 * "Approved" is `status = 'paid'` AND `reviewed_at` set — a paid-but-unreviewed
 * order is still with finance and must not reach a designer.
 *
 * Top-ups are excluded, and the exclusion belongs HERE rather than in the list
 * rendering. A job's existence in this queue is derived from the ABSENCE of an
 * invitation_card_designs row, and a top-up never has one — so a top-up left in
 * this result would appear as a permanently unstarted job, be counted in the
 * summary tiles, and accrue an SLA breach for design work that does not exist.
 * Every count, filter and badge on the designer surface reads this one query,
 * so excluding it once excludes it everywhere.
 */
export async function getDesignQueue(): Promise<DesignJob[]> {
  const supabase = createSupabaseAdminClient()

  const { data: orderData, error: orderError } = await supabase
    .from('invitation_orders')
    .select('id, ref, items, contact_name, contact_email, contact_phone, event_date, paid_at, reviewed_at')
    .eq('status', 'paid')
    .eq('order_kind', 'purchase')
    .not('reviewed_at', 'is', null)
    .order('paid_at', { ascending: true })
  if (orderError) throw orderError

  const orders = (orderData ?? []) as OrderRow[]
  if (orders.length === 0) return []

  const [{ data: designData, error: designError }, productMap] = await Promise.all([
    supabase
      .from('invitation_card_designs')
      .select(
        'id, order_id, line_index, status, started_at, assigned_to, requested_fields, field_values, change_requested_at',
      )
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
      // A row is no longer proof a designer has begun. The couple creates one
      // by sending their card content from the Card details tab, so "started"
      // reads the column that only startDesignJob writes.
      const started = Boolean(design?.started_at)

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
        sla: buildSla(
          order.reviewed_at,
          started ? (design!.status as DesignStatus) : 'not_started',
          now,
        ),

        designId: design?.id ?? null,
        startedAt: design?.started_at ?? null,
        status: started ? (design!.status as DesignStatus) : 'not_started',
        assignedTo: design?.assigned_to ?? null,
        changeRequestedAt: design?.change_requested_at ?? null,
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

/**
 * Everyone a card can be handed to.
 *
 * Dashboard access is the filter, not a permission check: someone without it
 * cannot open the job at all, so offering them in the picker would only park
 * cards with people unable to touch them. It is a superset of "can design" —
 * narrowing further would need per-employee permission resolution, which is a
 * query per row.
 */
export async function getAssignableDesigners(): Promise<{ id: string; name: string }[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_employees')
    .select('id, full_name')
    .eq('dashboard_access', true)
    .order('full_name')
  if (error) throw error
  return ((data ?? []) as { id: string; full_name: string | null }[]).map((e) => ({
    id: e.id,
    name: e.full_name?.trim() || 'Unnamed',
  }))
}

/** One design job as the catalogue card behind it wants to show it. */
export type CardProductionJob = {
  designId: string
  status: string
  orderRef: string
  coupleName: string | null
  assigneeName: string | null
  updatedAt: string | null
}

/**
 * Every design job personalising this catalogue card.
 *
 * The missing half of the link the job page now has. A catalogue admin about to
 * re-export artwork, re-map a layer or unpublish a card has no way to ask "is
 * anyone mid-flight on this?" — and the answer matters, because a released card
 * is frozen against the artwork and bindings as they were at release, so
 * changing them under an in-progress job silently changes what that couple ends
 * up with.
 *
 * Joined on product_id, which is TEXT and NOT a foreign key (the id is a
 * mutable slug and a job must survive it being renamed). So a card renamed
 * after an order was placed will not list that order's jobs here. That is the
 * same trade-off the schema already made deliberately; this query does not get
 * to un-make it.
 */
export async function getJobsForProduct(productId: string): Promise<CardProductionJob[]> {
  const supabase = createSupabaseAdminClient()

  const { data, error } = await supabase
    .from('invitation_card_designs')
    .select('id, order_id, status, assigned_to, updated_at')
    .eq('product_id', productId)
    .order('updated_at', { ascending: false })
    .limit(50)
  if (error) throw error

  const rows = (data ?? []) as {
    id: string
    order_id: string
    status: string
    assigned_to: string | null
    updated_at: string | null
  }[]
  if (rows.length === 0) return []

  const [{ data: orders }, assigneeNames] = await Promise.all([
    supabase
      .from('invitation_orders')
      .select('id, ref, contact_name')
      .in('id', [...new Set(rows.map((r) => r.order_id))]),
    loadAssigneeNames(
      supabase,
      rows.map((r) => r.assigned_to).filter((id): id is string => Boolean(id)),
    ),
  ])
  const orderById = new Map(
    ((orders ?? []) as { id: string; ref: string; contact_name: string | null }[]).map((o) => [
      o.id,
      o,
    ]),
  )

  return rows.map((row) => ({
    designId: row.id,
    status: row.status,
    orderRef: orderById.get(row.order_id)?.ref ?? '',
    coupleName: orderById.get(row.order_id)?.contact_name ?? null,
    assigneeName: row.assigned_to ? assigneeNames.get(row.assigned_to) ?? null : null,
    updatedAt: row.updated_at,
  }))
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
