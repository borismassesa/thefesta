import 'server-only'
import { createSupabaseAdminClient } from '@/lib/supabase'

/**
 * Commission analytics.
 * Specs: OP-CCS-PRD-001 §9 (success metrics); OP-CCS-TDD-001 §11 step 11.
 *
 * PRD §4.1 makes the point that decides what this page is for: margin is a
 * function of designer throughput against a salary cost, so TURNAROUND TIME IS
 * THE PROFITABILITY LEVER. These are commercial instruments, not an ops
 * dashboard — which is why every metric below is shown against the target the
 * PRD actually committed to, rather than as a bare number that could be good
 * or bad depending on who is reading it.
 */

export type MetricRow = {
  key: string
  label: string
  /** Null when there is not enough data yet to say anything honest. */
  value: number | null
  target: number
  /** 'pct' renders 0-100 with a % sign, 'hours' as durations, 'count' raw. */
  unit: 'pct' | 'hours' | 'count'
  /** Higher is better for most; false for forfeiture and manual-intervention rates. */
  higherIsBetter: boolean
  /** How many orders the figure is computed from — a 100% on n=1 means nothing. */
  sample: number
  note?: string
}

export type DesignerStat = {
  displayName: string
  grade: string
  delivered: number
  /** Median hours from accepting a task to submitting the first version. */
  medianFirstDraftHours: number | null
  /** Share of their orders that met the package's first-draft promise. */
  slaAttainmentPct: number | null
  avgRevisionRounds: number | null
  openTasks: number
  capacity: number
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null
  return Math.round((numerator / denominator) * 1000) / 10
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10
    : Math.round(sorted[mid] * 10) / 10
}

type OrderStat = {
  id: string
  status: string
  package_id: string
  created_at: string
  assigned_at: string | null
  accepted_at: string | null
  approved_at: string | null
  balance_invoiced_at: string | null
  settled_at: string | null
  delivered_at: string | null
  sla_due_at: string | null
  revisions_used: number
  assigned_designer_id: string | null
  user_id: string | null
}

const HOURS = 3_600_000

export async function getCommissionMetrics(sinceDays = 90): Promise<{
  metrics: MetricRow[]
  designers: DesignerStat[]
  totalOrders: number
}> {
  const supabase = createSupabaseAdminClient()
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString()

  const { data: orders, error } = await supabase
    .from('card_orders')
    .select('id, status, package_id, created_at, assigned_at, accepted_at, approved_at, balance_invoiced_at, settled_at, delivered_at, sla_due_at, revisions_used, assigned_designer_id, user_id')
    .gte('created_at', since)
    .returns<OrderStat[]>()
  if (error) throw new Error(`getCommissionMetrics failed: ${error.message}`)

  const all = orders ?? []
  const [{ data: packages }, { data: versions }, { data: profiles }] = await Promise.all([
    supabase
      .from('card_packages')
      .select('id, first_draft_hours')
      .returns<{ id: string; first_draft_hours: number }[]>(),
    all.length
      ? supabase
          .from('design_versions')
          .select('order_id, designer_id, version_no, submitted_at')
          .in('order_id', all.map((o) => o.id))
          .returns<{ order_id: string; designer_id: string | null; version_no: number; submitted_at: string }[]>()
      : Promise.resolve({ data: [] as { order_id: string; designer_id: string | null; version_no: number; submitted_at: string }[] }),
    supabase
      .from('designer_profiles')
      .select('employee_id, display_name, studio_grade, capacity')
      .returns<{ employee_id: string; display_name: string; studio_grade: string; capacity: number }[]>(),
  ])

  const slaHours = new Map((packages ?? []).map((p) => [p.id, p.first_draft_hours]))
  const firstVersionAt = new Map<string, string>()
  for (const v of versions ?? []) {
    if (v.version_no !== 1) continue
    firstVersionAt.set(v.order_id, v.submitted_at)
  }

  // ── Funnel (PRD §9) ─────────────────────────────────────────────────────
  const depositPaid = all.filter((o) =>
    !['draft', 'awaiting_deposit', 'deposit_review', 'deposit_rejected', 'cancelled'].includes(o.status),
  )
  const approved = all.filter((o) => o.approved_at !== null)
  const settled = all.filter((o) => o.settled_at !== null)
  const forfeited = all.filter((o) => o.status === 'forfeited')

  // Approved → balance collected inside 72h. The single most commercially
  // important number here: the work is already paid for in salary by this
  // point, so anything uncollected is pure loss.
  const collectedIn72h = approved.filter((o) => {
    if (!o.settled_at || !o.balance_invoiced_at) return false
    return new Date(o.settled_at).getTime() - new Date(o.balance_invoiced_at).getTime() <= 72 * HOURS
  })

  const firstDraftOnTime = all.filter((o) => {
    const submitted = firstVersionAt.get(o.id)
    if (!submitted || !o.accepted_at) return false
    const promised = slaHours.get(o.package_id)
    if (!promised) return false
    return new Date(submitted).getTime() - new Date(o.accepted_at).getTime() <= promised * HOURS
  })
  const withFirstDraft = all.filter((o) => firstVersionAt.has(o.id) && o.accepted_at)

  const approvedWithin2Rounds = approved.filter((o) => o.revisions_used <= 2)
  const unclaimedOver7Days = all.filter(
    (o) =>
      o.user_id === null &&
      Date.now() - new Date(o.created_at).getTime() > 7 * 86_400_000,
  )

  const metrics: MetricRow[] = [
    {
      key: 'checkout_to_deposit',
      label: 'Checkout → deposit paid',
      value: pct(depositPaid.length, all.length),
      target: 60,
      unit: 'pct',
      higherIsBetter: true,
      sample: all.length,
    },
    {
      key: 'balance_72h',
      label: 'Approved → balance collected within 72h',
      value: pct(collectedIn72h.length, approved.length),
      target: 85,
      unit: 'pct',
      higherIsBetter: true,
      sample: approved.length,
      note: 'The work is already paid for in salary by this point. Anything uncollected here is loss, not delay.',
    },
    {
      key: 'forfeited',
      label: 'Orders forfeited at the balance gate',
      value: pct(forfeited.length, approved.length),
      target: 3,
      unit: 'pct',
      higherIsBetter: false,
      sample: approved.length,
    },
    {
      key: 'deposit_to_settled',
      label: 'Deposit paid → eventually settled',
      value: pct(settled.length, depositPaid.length),
      target: 92,
      unit: 'pct',
      higherIsBetter: true,
      sample: depositPaid.length,
    },
    {
      key: 'first_draft_sla',
      label: 'First draft delivered within the package SLA',
      value: pct(firstDraftOnTime.length, withFirstDraft.length),
      target: 90,
      unit: 'pct',
      higherIsBetter: true,
      sample: withFirstDraft.length,
      note: 'Missing this by more than 100% of the window entitles the customer to a full refund on salaried work.',
    },
    {
      key: 'two_rounds',
      label: 'Orders approved within 2 revision rounds',
      value: pct(approvedWithin2Rounds.length, approved.length),
      target: 85,
      unit: 'pct',
      higherIsBetter: true,
      sample: approved.length,
    },
    {
      key: 'unclaimed_7d',
      label: 'Unclaimed orders still unclaimed after 7 days',
      value: pct(unclaimedOver7Days.length, all.length),
      target: 5,
      unit: 'pct',
      higherIsBetter: false,
      sample: all.length,
      note: 'An unclaimed order can be designed but never delivered — delivery is the one step that needs an account.',
    },
  ]

  // ── Per-designer ────────────────────────────────────────────────────────
  const byDesigner = new Map<string, OrderStat[]>()
  for (const o of all) {
    if (!o.assigned_designer_id) continue
    const list = byDesigner.get(o.assigned_designer_id) ?? []
    list.push(o)
    byDesigner.set(o.assigned_designer_id, list)
  }

  const designers: DesignerStat[] = await Promise.all(
    (profiles ?? []).map(async (p) => {
      const mine = byDesigner.get(p.employee_id) ?? []
      const draftHours: number[] = []
      let onTime = 0
      let measured = 0

      for (const o of mine) {
        const submitted = firstVersionAt.get(o.id)
        if (!submitted || !o.accepted_at) continue
        const hours = (new Date(submitted).getTime() - new Date(o.accepted_at).getTime()) / HOURS
        draftHours.push(hours)
        const promised = slaHours.get(o.package_id)
        if (promised) {
          measured++
          if (hours <= promised) onTime++
        }
      }

      const { data: openCount } = await supabase
        .rpc('designer_open_task_count', { p_employee_id: p.employee_id })
        .returns<number>()

      const withRounds = mine.filter((o) => o.approved_at)
      return {
        displayName: p.display_name,
        grade: p.studio_grade,
        delivered: mine.filter((o) => o.delivered_at !== null).length,
        medianFirstDraftHours: median(draftHours),
        slaAttainmentPct: pct(onTime, measured),
        avgRevisionRounds:
          withRounds.length > 0
            ? Math.round((withRounds.reduce((n, o) => n + o.revisions_used, 0) / withRounds.length) * 10) / 10
            : null,
        openTasks: Number(openCount ?? 0),
        capacity: p.capacity,
      }
    }),
  )

  designers.sort((a, b) => b.delivered - a.delivered)
  return { metrics, designers, totalOrders: all.length }
}
