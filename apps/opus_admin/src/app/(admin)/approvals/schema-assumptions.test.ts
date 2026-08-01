import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { describe, it } from 'node:test'

// The Approvals release blocker was not a bug in any function. It was that the
// repository could not build the database the code requires.
//
// `approval_categories` existed only in production, applied through MCP and
// never committed. Three code comments asserted a foreign key that no repo
// migration created. Production worked, so nothing surfaced; a staging
// environment provisioned from migrations had no catalog table, which meant
// listApprovalCategories() returned empty, isValidCategory() rejected every
// input, and no employee could raise a request at all.
//
// These tests fail if the code starts depending on schema the repo cannot
// provision. They are cheap because they are textual, and they are worth
// having because the failure they catch is invisible in every environment
// that was set up by hand.

const MIGRATIONS = new URL('../../../../../../supabase/migrations/', import.meta.url)
const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))
const allMigrations = files.map((f) => readFileSync(new URL(f, MIGRATIONS), 'utf8')).join('\n')

const HERE = new URL('./', import.meta.url)
const moduleSrc = ['queries.ts', 'actions.ts', 'category-actions.ts']
  .map((f) => readFileSync(new URL(f, HERE), 'utf8'))
  .join('\n')

describe('every table the module reads is created by a repo migration', () => {
  // Tables reached through the Supabase client anywhere in the approvals
  // module. Derived from source rather than hardcoded, so a newly referenced
  // table is covered the moment someone adds it.
  const referenced = new Set(
    [...moduleSrc.matchAll(/\.from\('(\w+)'\)/g)].map((m) => m[1]),
  )

  it('finds the tables it is meant to be checking', () => {
    assert.ok(referenced.has('approval_requests'), 'expected approval_requests to be referenced')
    assert.ok(referenced.has('approval_categories'), 'expected approval_categories to be referenced')
  })

  for (const table of [...referenced].sort()) {
    it(`${table} has a CREATE TABLE in supabase/migrations`, () => {
      const created = new RegExp(`CREATE TABLE (IF NOT EXISTS )?${table}\\b`)
      assert.match(
        allMigrations,
        created,
        `${table} is read by the approvals module but no repo migration creates it. ` +
          'A clean environment provisioned from migrations will not work.',
      )
    })
  }
})

describe('every rpc the module calls is created by a repo migration', () => {
  const called = new Set([...moduleSrc.matchAll(/\.rpc\('(\w+)'/g)].map((m) => m[1]))

  it('finds the functions it is meant to be checking', () => {
    assert.ok(called.size >= 4, `expected >=4 rpc calls, found ${[...called].join(', ')}`)
  })

  for (const fn of [...called].sort()) {
    it(`${fn} is defined in a migration`, () => {
      assert.match(
        allMigrations,
        new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`),
        `actions.ts calls ${fn}() but no repo migration defines it`,
      )
    })
  }
})

describe('the constraints the code comments rely on actually exist', () => {
  it('the category foreign key is created, not just described', () => {
    // category-actions.ts justifies retire-instead-of-delete with "the FK is
    // ON DELETE RESTRICT", and actions.ts calls the FK "the real guarantee"
    // behind category validation. Both were true of production and false of
    // the repo for the entire time the module was being reviewed.
    assert.match(
      allMigrations,
      /FOREIGN KEY \(category\) REFERENCES approval_categories\(key\)[\s\S]{0,80}ON DELETE RESTRICT/,
      'no migration creates the approval_requests.category FK the code documents',
    )
  })

  it('the superseded nine-key CHECK is dropped', () => {
    // Left in place, an admin-created request type passes isValidCategory()
    // and then fails at INSERT with a 23514.
    assert.match(
      allMigrations,
      /DROP CONSTRAINT IF EXISTS approval_requests_category_check/,
      'the hardcoded category CHECK is never dropped, so admin-created types cannot be used',
    )
  })

  it('the catalog is seeded before the foreign key is added', () => {
    const src = readFileSync(
      new URL('20260801165207_approval_categories_admin_managed.sql', MIGRATIONS),
      'utf8',
    )
    const seed = src.indexOf('INSERT INTO approval_categories')
    const fk = src.indexOf('ADD CONSTRAINT approval_requests_category_fkey')
    assert.ok(seed > 0 && fk > 0, 'seed or FK statement missing')
    assert.ok(
      seed < fk,
      'the FK is added before the built-in keys are seeded, so existing rows would violate it',
    )
  })
})

describe('migrations captured from production stay verbatim', () => {
  // These three were applied through MCP and recovered from
  // supabase_migrations.schema_migrations. Editing them in place would make
  // the repo diverge from a database that has already run them, which is the
  // exact failure being fixed. Changes belong in a new migration.
  for (const name of [
    '20260801161831_cms_svg_upload_permission.sql',
    '20260801163640_workflow_events_service_role_only.sql',
    '20260801165207_approval_categories_admin_managed.sql',
  ]) {
    it(`${name} is present and marked as captured`, () => {
      assert.ok(files.includes(name), `${name} is missing from supabase/migrations`)
      const src = readFileSync(new URL(name, MIGRATIONS), 'utf8')
      assert.match(src, /CAPTURED FROM PRODUCTION/, `${name} lost its provenance header`)
    })
  }

  it('the audit migration applies after the catalog it depends on', () => {
    const sorted = [...files].sort()
    assert.ok(
      sorted.indexOf('20260801175357_approvals_audit_durability.sql') >
        sorted.indexOf('20260801165207_approval_categories_admin_managed.sql'),
      'audit durability must apply after the catalog migration',
    )
  })
})
