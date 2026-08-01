import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { describe, it } from 'node:test'

// A signed URL is a bearer token. Whoever holds it can fetch the object,
// regardless of who they are or what they can still see.
//
// This bug class has now appeared twice in this codebase: a server action
// taking a storage path from the caller and signing it after checking only a
// broad permission. Storage paths follow documented, guessable conventions
// (`{employee_id}/{record_kind}/{record_id}/…`), so that turns a read
// permission into "read any object in the bucket". Both instances are fixed;
// this test exists so the third one fails CI instead of shipping.
//
// The rule: resolve the object from a row the caller is provably entitled to.
// Never from a string they handed you.

// Every file that mints a signed URL, found rather than listed, so a new one
// is covered the day it is written.
function filesThatSign(): string[] {
  const out = execFileSync(
    'grep',
    ['-rl', '--include=*.ts', '--include=*.tsx', 'createSignedUrl', 'src'],
    { encoding: 'utf8', cwd: process.cwd() },
  )
  return out.split('\n').filter(Boolean)
}

const SIGNERS = filesThatSign()

describe('signed URL minting is not reachable with a caller-supplied path', () => {
  it('finds the files it is meant to be checking', () => {
    assert.ok(SIGNERS.length >= 2, `expected >=2 signing sites, found ${SIGNERS.join(', ')}`)
  })

  for (const file of SIGNERS) {
    it(`${file} exposes no action taking a storage path`, () => {
      const src = readFileSync(file, 'utf8')
      // Server actions are the reachable surface: anything exported from a
      // 'use server' module is callable from the browser by name.
      if (!src.startsWith("'use server'") && !src.includes("\n'use server'")) return

      for (const [, name, params] of src.matchAll(
        /export async function (\w+)\(([\s\S]*?)\)\s*:/g,
      )) {
        // `path` on its own belongs in this list. Leaving it out is how the
        // first version of this test passed while
        // signCommissionAsset(bucket, path) sat one directory away, doing
        // exactly what the test was written to forbid.
        assert.ok(
          !/\b(path|storagePath|storage_path|filePath|objectPath|objectKey|key)\s*:\s*string/.test(params),
          `${name}() in ${file} accepts a caller-supplied storage path. ` +
            'Take a row id instead, re-read the row scoped to its owner, and derive ' +
            'the path from it. See getApprovalAttachmentUrl in approvals/attachment-actions.ts.',
        )
      }
    })

    it(`${file} does not return the provider message to the browser`, () => {
      const src = readFileSync(file, 'utf8')
      // Supabase storage errors can echo the object key, which hands back the
      // exact string the signature change above refuses to accept.
      assert.ok(
        !/error:\s*(`[^`]*\$\{[^}]*(storagePath|storage_path|path)[^}]*\}|error\?\.message)/.test(src),
        `${file} returns a raw provider message or a storage path in a client-facing error`,
      )
    })
  }
})

describe('the fixed call sites resolve the object from a scoped row', () => {
  const cases = [
    {
      file: 'src/app/(admin)/workforce/employees/[id]/record-actions.ts',
      fn: 'getRecordAttachmentUrl',
      scope: /\.eq\('id', recordId\)\s*\n?\s*\.eq\('employee_id', employeeId\)/,
    },
    {
      file: 'src/app/(admin)/operations/vendors/actions.ts',
      fn: 'generateVendorFileUrl',
      scope: /\.eq\('id', rowId\)\s*\n?\s*\.eq\('vendor_id', vendorId\)/,
    },
  ]

  for (const { file, fn, scope } of cases) {
    it(`${fn} scopes its lookup to the owning record`, () => {
      const src = readFileSync(file, 'utf8')
      assert.ok(src.includes(`export async function ${fn}(`), `${fn} is gone or renamed`)
      assert.match(src, scope, `${fn} reads a row without scoping it to its owner`)
    })

    it(`${fn} reads the row before it signs anything`, () => {
      const src = readFileSync(file, 'utf8')
      const body = src.slice(src.indexOf(`export async function ${fn}(`))
      const lookup = body.indexOf('.maybeSingle')
      const sign = body.indexOf('createSignedUrl')
      assert.ok(lookup > 0 && sign > 0, 'expected both a lookup and a signing call')
      assert.ok(sign > lookup, `${fn} signs before it has verified entitlement`)
    })
  }
})
