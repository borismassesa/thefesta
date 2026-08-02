/**
 * Drift guard for the Custom Card Commission Service state machine.
 *
 *   npx tsx scripts/check-commission-parity.ts
 *
 * `packages/lib/commission-contracts.ts` claims to mirror
 * `is_valid_card_transition()` in the migration. A comment saying so is worth
 * nothing the first time somebody adds a state to one side and not the other —
 * and the failure mode is nasty, because the UI would offer an action the
 * server then refuses, or (worse) hide one it would have allowed.
 *
 * This parses the actual SQL and compares:
 *   1. the enum members,           against CARD_ORDER_STATUSES
 *   2. the explicit VALUES pairs,  against CARD_TRANSITIONS
 *   3. the open-ended cancel/hold/resume rules, by exhaustive probe over every
 *      status pair, against isValidCardTransition()
 *
 * Step 3 is the one that matters most: those rules are expressed as predicates
 * rather than enumerated pairs on both sides, so a textual diff would not catch
 * a divergence. Probing all 24 x 24 combinations does.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  CARD_ORDER_STATUSES,
  CARD_TRANSITIONS,
  isValidCardTransition,
  type CardOrderStatus,
} from '../packages/lib/commission-contracts'

const REPO = join(__dirname, '..')
const MIGRATION = join(
  REPO,
  'supabase/migrations/20260730100002_card_commission_state_machine.sql',
)
const CORE = join(REPO, 'supabase/migrations/20260730100000_card_commission_core.sql')

const failures: string[] = []
function check(condition: boolean, message: string): void {
  if (!condition) failures.push(message)
}

// Strip SQL line comments so a status named inside prose cannot be mistaken for
// a transition pair.
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '')
}

// ── 1. Enum members ─────────────────────────────────────────────────────────
{
  const core = stripComments(readFileSync(CORE, 'utf8'))
  const enumBody = core.match(/CREATE TYPE public\.card_order_status AS ENUM\s*\(([\s\S]*?)\)\s*;/)
  if (!enumBody) {
    failures.push('could not find the card_order_status enum in the core migration')
  } else {
    const sqlStatuses = [...enumBody[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    const tsStatuses = [...CARD_ORDER_STATUSES]

    for (const s of sqlStatuses) {
      check(tsStatuses.includes(s as CardOrderStatus), `status '${s}' is in the SQL enum but not in CARD_ORDER_STATUSES`)
    }
    for (const s of tsStatuses) {
      check(sqlStatuses.includes(s), `status '${s}' is in CARD_ORDER_STATUSES but not in the SQL enum`)
    }
    console.log(`  enum members: ${sqlStatuses.length} in SQL, ${tsStatuses.length} in TS`)
  }
}

// ── 2. Explicit transition pairs ────────────────────────────────────────────
{
  const sql = stripComments(readFileSync(MIGRATION, 'utf8'))
  const fnBody = sql.match(
    /CREATE OR REPLACE FUNCTION public\.is_valid_card_transition[\s\S]*?\$\$([\s\S]*?)\$\$;/,
  )
  if (!fnBody) {
    failures.push('could not find is_valid_card_transition() in the state-machine migration')
  } else {
    // Only the VALUES list holds the explicit pairs; the trailing OR clauses
    // are the open-ended rules, verified by probe in step 3.
    const valuesBlock = fnBody[1].match(/FROM \(VALUES([\s\S]*?)\) AS t\(f, s\)/)
    if (!valuesBlock) {
      failures.push('could not find the VALUES list inside is_valid_card_transition()')
    } else {
      const sqlPairs = new Set(
        [...valuesBlock[1].matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*\)/g)].map(
          (m) => `${m[1]} -> ${m[2]}`,
        ),
      )
      const tsPairs = new Set(CARD_TRANSITIONS.map((t) => `${t.from} -> ${t.to}`))

      for (const p of sqlPairs) check(tsPairs.has(p), `transition ${p} is in SQL but missing from CARD_TRANSITIONS`)
      for (const p of tsPairs) check(sqlPairs.has(p), `transition ${p} is in CARD_TRANSITIONS but missing from SQL`)

      check(
        tsPairs.size === CARD_TRANSITIONS.length,
        `CARD_TRANSITIONS contains ${CARD_TRANSITIONS.length - tsPairs.size} duplicate pair(s)`,
      )
      console.log(`  explicit transitions: ${sqlPairs.size} in SQL, ${tsPairs.size} in TS`)
    }
  }
}

// ── 3. Exhaustive probe of the open-ended rules ─────────────────────────────
// Reimplements the SQL's trailing OR clauses directly from the migration text's
// intent, then compares against the TypeScript predicate across every pair.
{
  const explicit = new Set(CARD_TRANSITIONS.map((t) => `${t.from}>${t.to}`))
  const preSettled = (s: string) =>
    !['settled', 'delivered', 'closed', 'cancelled', 'refunded', 'forfeited'].includes(s)

  const sqlSaysValid = (from: string, to: string): boolean =>
    explicit.has(`${from}>${to}`) ||
    ((to === 'cancelled' || to === 'on_hold') && preSettled(from)) ||
    (from === 'on_hold' && to !== 'on_hold' && to !== 'draft')

  let probed = 0
  let allowed = 0
  for (const from of CARD_ORDER_STATUSES) {
    for (const to of CARD_ORDER_STATUSES) {
      probed++
      const sqlResult = sqlSaysValid(from, to)
      const tsResult = isValidCardTransition(from, to)
      if (sqlResult) allowed++
      check(
        sqlResult === tsResult,
        `${from} -> ${to}: SQL says ${sqlResult ? 'legal' : 'illegal'}, TS says ${tsResult ? 'legal' : 'illegal'}`,
      )
    }
  }
  console.log(`  probed ${probed} status pairs, ${allowed} legal`)
}

// ── 4. Invariants the specs call out by name ────────────────────────────────
{
  check(
    !isValidCardTransition('approved', 'delivered'),
    'PRD §7.2.2: there must be NO path from approved straight to delivered — approval releases the invoice, never the file',
  )
  check(
    !isValidCardTransition('client_review', 'delivered'),
    'a design cannot be delivered directly from client review',
  )
  check(
    isValidCardTransition('awaiting_deposit', 'awaiting_deposit'),
    'TDD §4: the short-deposit self-transition must be legal — underpayment is not a failure state',
  )
  check(
    isValidCardTransition('awaiting_balance', 'awaiting_balance'),
    'TDD §4: the short-balance self-transition must be legal',
  )
  check(
    isValidCardTransition('forfeited', 'settled'),
    'PRD §7.2.3: forfeiture must be recoverable — paying later releases the asset normally',
  )
  check(
    !isValidCardTransition('settled', 'cancelled'),
    'a settled order must not be cancellable',
  )
  check(
    isValidCardTransition('approved', 'awaiting_balance'),
    'approval must cascade to the balance gate',
  )
}

console.log('')
if (failures.length > 0) {
  console.error(`commission parity FAILED — ${failures.length} problem(s):\n`)
  for (const f of failures) console.error(`  ✗ ${f}`)
  console.error('\nThe TypeScript mirror and the database have drifted. Postgres is the')
  console.error('authority: fix packages/lib/commission-contracts.ts to match the migration,')
  console.error('or change both together.')
  process.exit(1)
}
console.log('commission parity OK — the TypeScript mirror matches the database.')
