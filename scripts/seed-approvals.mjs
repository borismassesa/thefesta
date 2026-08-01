#!/usr/bin/env node
/**
 * Seed the Approvals module with a representative spread of requests so the
 * populated states (attention queue, ageing bands, catalogue metrics,
 * analytics panels, activity feed) can be exercised without waiting for real
 * traffic.
 *
 * THIS WRITES REAL ROWS. The pre-flight guard lives in
 * scripts/lib/dev-guard.mjs and is shared with every other destructive
 * script, so there is exactly one implementation of "am I allowed to write
 * here". It refuses unless ALL of:
 *
 *   1. NODE_ENV=development
 *   2. ALLOW_DEV_SEED=true
 *   3. SUPABASE_DEV_PROJECT_REF is set
 *   4. SUPABASE_DEV_URL's ref matches it exactly
 *   5. SUPABASE_DEV_SERVICE_ROLE_KEY is set
 *   6. the resolved ref is not the production project (hard denylist, not
 *      overridable by any env var)
 *
 * Usage:
 *   NODE_ENV=development ALLOW_DEV_SEED=true \
 *   SUPABASE_DEV_PROJECT_REF=<ref> \
 *   SUPABASE_DEV_URL=https://<ref>.supabase.co \
 *   SUPABASE_DEV_SERVICE_ROLE_KEY=<key> \
 *   node scripts/seed-approvals.mjs [--clean]
 *
 * `--clean` removes previously seeded rows and exits. Everything this script
 * writes is prefixed with SEED_MARKER in the subject, so cleanup is exact and
 * can never touch a real request.
 */

import { createClient } from '@supabase/supabase-js'
import { requireDevProjectOrExit } from './lib/dev-guard.mjs'

const SEED_MARKER = '[DEV SEED]'

// Synthetic identities only. Never a real employee id or a real inbox — a
// seed that emails actual staff during a retry test is a seed that gets you
// shouted at.
const OWNER = {
  name: 'Seed Requester',
  email: 'seed.requester@example.test',
  initials: 'SR',
}

// example.test is reserved by RFC 6761 and cannot resolve, so the failing
// address stays permanently failing without depending on anyone's mail server.
const APPROVERS = [
  { id: 'app_owner', name: 'Seed Approver One', role: 'Approver', email: 'seed.approver1@example.test' },
  { id: 'app_timothy', name: 'Seed Approver Two', role: 'Approver', email: 'seed.approver2@example.test' },
]

function daysAgo(n) {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

// One row per state the UI needs to render. Ages are chosen to land in each
// band defined by the module's ageing.ts (0-1 normal, 2-3 attention, 4+ delayed).
function buildRequests() {
  return [
    {
      category: 'business-trip',
      subject: `${SEED_MARKER} Mwanza vendor visit`,
      status: 'To Submit',
      submitted_at: null,
      created_at: daysAgo(1),
      updated_at: daysAgo(1),
      approvers: [],
      fields: { period: `${daysAgo(-14).slice(0, 10)}/${daysAgo(-11).slice(0, 10)}`, location: 'Mwanza', description: 'Quarterly vendor review.' },
    },
    {
      category: 'payment-application',
      subject: `${SEED_MARKER} Catering invoice INV-2291`,
      status: 'Submitted',
      submitted_at: daysAgo(0.4),
      created_at: daysAgo(1),
      updated_at: daysAgo(0.4),
      approvers: [APPROVERS[1]],
      fields: { payee: 'Karibu Catering', amount: 'TZS 1,850,000', reference: 'INV-2291', description: 'Launch event catering.' },
    },
    {
      category: 'procurement',
      subject: `${SEED_MARKER} Studio lighting rig`,
      status: 'Submitted',
      submitted_at: daysAgo(4.2),
      created_at: daysAgo(5),
      updated_at: daysAgo(4.2),
      approvers: [APPROVERS[0], APPROVERS[1]],
      fields: { vendor: 'Lumen AV', products: 'Key light x2\nSoftbox x2', amount: 'TZS 4,200,000', description: 'Replacing the failing rig in studio B.' },
    },
    {
      category: 'contract-approval',
      subject: `${SEED_MARKER} Venue partnership agreement`,
      status: 'Approved',
      submitted_at: daysAgo(9),
      created_at: daysAgo(10),
      updated_at: daysAgo(7),
      approvers: [APPROVERS[0]],
      fields: { contact: 'Serena Hotels', amount: 'TZS 12,000,000', reference: 'OF-LGL-2026-014', description: 'Twelve-month preferred venue rate.' },
    },
    {
      category: 'car-rental',
      subject: `${SEED_MARKER} Airport transfers, media week`,
      status: 'Refused',
      submitted_at: daysAgo(6),
      created_at: daysAgo(6),
      updated_at: daysAgo(5),
      approvers: [APPROVERS[1]],
      fields: { period: `${daysAgo(2).slice(0, 10)}/${daysAgo(0).slice(0, 10)}`, pickup: 'JNIA Airport', dropoff: 'Serena Hotel', amount: 'TZS 340,000', description: 'Ferrying press between venues.' },
    },
    // Repeat history so the catalogue metrics ("this year", "avg decision",
    // "usually reviewed by") have more than one sample to average over.
    ...[12, 20, 33].map((age, i) => ({
      category: 'payment-application',
      subject: `${SEED_MARKER} Historical payment ${i + 1}`,
      status: 'Approved',
      submitted_at: daysAgo(age),
      created_at: daysAgo(age + 1),
      updated_at: daysAgo(age - 1 - i),
      approvers: [APPROVERS[1]],
      fields: { payee: 'Assorted', amount: 'TZS 500,000', description: 'Backfill for catalogue metrics.' },
    })),
  ].map((r) => ({
    ...r,
    owner_name: OWNER.name,
    owner_email: OWNER.email,
    owner_initials: OWNER.initials,
    owner_clerk_id: null,
  }))
}

function buildActivity(requestId, status, submittedAt, updatedAt) {
  const rows = [
    {
      request_id: requestId,
      kind: 'system',
      author: OWNER.name,
      author_initials: OWNER.initials,
      author_color: '#10B981',
      body: 'Request created.',
      created_at: submittedAt ?? updatedAt,
    },
  ]
  if (status !== 'To Submit' && submittedAt) {
    rows.push({
      request_id: requestId,
      kind: 'system',
      author: OWNER.name,
      author_initials: OWNER.initials,
      author_color: '#10B981',
      body: 'Submitted for approval.',
      created_at: submittedAt,
    })
  }
  if (status === 'Approved' || status === 'Refused') {
    rows.push({
      request_id: requestId,
      kind: 'system',
      author: APPROVERS[1].name,
      author_initials: 'SA',
      author_color: '#5B2D8E',
      body: status === 'Approved' ? 'Approved.' : 'Refused — budget already committed elsewhere.',
      created_at: updatedAt,
    })
  }
  return rows
}

async function clean(supabase) {
  const { data, error } = await supabase
    .from('approval_requests')
    .delete()
    .like('subject', `${SEED_MARKER}%`)
    .select('id')
  if (error) throw error
  // approval_request_activity cascades on request delete.
  console.log(`  removed ${data?.length ?? 0} seeded request(s)`)
}

async function main() {
  const target = requireDevProjectOrExit('seed-approvals')
  const supabase = createClient(target.url, target.serviceRoleKey, {
    auth: { persistSession: false },
  })

  if (process.argv.includes('--clean')) {
    await clean(supabase)
    console.log('  done\n')
    return
  }

  // Always clear prior seed rows first so repeated runs stay idempotent.
  await clean(supabase)

  const { data: inserted, error } = await supabase
    .from('approval_requests')
    .insert(buildRequests())
    .select('id, status, submitted_at, updated_at')
  if (error) throw error

  const activity = inserted.flatMap((r) =>
    buildActivity(r.id, r.status, r.submitted_at, r.updated_at),
  )
  const { error: activityError } = await supabase
    .from('approval_request_activity')
    .insert(activity)
  if (activityError) throw activityError

  console.log(`  inserted ${inserted.length} request(s), ${activity.length} activity row(s)`)
  console.log(`  run with --clean to remove them\n`)
}

main().catch((err) => {
  console.error('\n  seed failed:', err.message ?? err, '\n')
  process.exit(1)
})
