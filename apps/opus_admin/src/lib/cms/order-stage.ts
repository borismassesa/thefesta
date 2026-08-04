/**
 * Order-level fulfilment stage each design status implies, and the source of
 * the status type. One map rather than a parallel list, so a new status cannot
 * be added without deciding what it means for the order the couple is watching.
 */
export const ORDER_STAGE = {
  awaiting_info: 'in_progress',
  in_design: 'in_progress',
  in_review: 'in_progress',
  ready: 'ready',
  delivered: 'delivered',
} as const

export type DesignStatus = keyof typeof ORDER_STAGE
export type OrderStage = (typeof ORDER_STAGE)[DesignStatus]

/**
 * The stage every card in an order has reached.
 *
 * An order can hold six cards. Advancing it the moment one is ready would show
 * the couple "Design ready" while three of theirs are still being drawn, so the
 * least advanced card decides.
 *
 * Returns null for an empty list, and that return is the whole reason this is a
 * function rather than three chained ternaries at the call site. An empty list
 * contains no 'in_progress' and no 'ready', so a plain fall-through lands on
 * 'delivered', the MOST advanced stage. A caller that got an empty list because
 * its read FAILED would then tell the couple their whole order was delivered.
 * Nothing can be concluded from no cards, and null says so.
 */
export function orderStageFor(statuses: readonly string[]): OrderStage | null {
  if (statuses.length === 0) return null
  // An unrecognised status counts as in_progress: a card in a state this map
  // has not been taught about is certainly not finished.
  const stages = statuses.map((status) => ORDER_STAGE[status as DesignStatus] ?? 'in_progress')
  if (stages.includes('in_progress')) return 'in_progress'
  if (stages.includes('ready')) return 'ready'
  return 'delivered'
}
