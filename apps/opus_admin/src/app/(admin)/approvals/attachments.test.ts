import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { describe, it } from 'node:test'

// Attachments are the highest-risk surface in the module: a receipt carries a
// payee, an amount and often a bank reference, and a signed URL is a bearer
// token that works for anyone holding it.
//
// The failure mode being guarded against is the one already present elsewhere
// in this app, where a helper signs whatever storage path the caller passes
// after checking only a broad permission. Storage paths are predictable, so
// that turns a read permission into "read any file in the bucket".

const HERE = new URL('./', import.meta.url)
const src = readFileSync(new URL('attachment-actions.ts', HERE), 'utf8')
const queriesSrc = readFileSync(new URL('queries.ts', HERE), 'utf8')
const typesSrc = readFileSync(new URL('types.ts', HERE), 'utf8')

const MIGRATIONS = new URL('../../../../../../supabase/migrations/', import.meta.url)
const migration = readFileSync(
  new URL('20260801181509_approval_attachments.sql', MIGRATIONS),
  'utf8',
)

describe('attachment access is authorized per call, never by path', () => {
  it('no exported action accepts a storage path', () => {
    // The whole IDOR class starts with a `storagePath: string` parameter.
    const exported = [...src.matchAll(/export async function (\w+)\(([\s\S]*?)\)/g)]
    assert.ok(exported.length >= 3, 'expected the three attachment actions')
    for (const [, name, params] of exported) {
      assert.ok(
        !/storagePath|storage_path|path\s*:/.test(params),
        `${name} takes a caller-supplied storage path`,
      )
    }
  })

  it('every action re-reads the request and checks participation', () => {
    // getApprovalRequest + isRelevantTo, in each of upload, url and remove.
    const guards = src.match(/!request \|\| !isRelevantTo\(request, actor\.email\)/g)
    assert.ok(
      (guards?.length ?? 0) >= 3,
      `expected 3 participation guards, found ${guards?.length ?? 0}`,
    )
  })

  it('a signed url is only minted after the participation check', () => {
    const check = src.indexOf('!isRelevantTo(request, actor.email)')
    const sign = src.indexOf('createSignedUrl')
    assert.ok(check > 0 && sign > 0, 'expected both a check and a signing call')
    assert.ok(sign > check, 'the URL is signed before participation is verified')
  })

  it('non-participants cannot distinguish a real attachment from a fake id', () => {
    // Same collapse the rest of the module uses. A distinct "no such file"
    // would confirm which ids exist.
    const returns = src.match(/return \{ ok: false, error: NOT_VISIBLE \}/g)
    assert.ok(
      (returns?.length ?? 0) >= 5,
      `expected the not-visible collapse throughout, found ${returns?.length ?? 0}`,
    )
  })

  it('the signed url expires quickly', () => {
    const ttl = src.match(/SIGNED_URL_TTL_SECONDS\s*=\s*(\d+)/)
    assert.ok(ttl, 'no TTL constant found')
    assert.ok(
      Number(ttl[1]) <= 300,
      `signed URLs live ${ttl[1]}s; a bearer token for a receipt should be short`,
    )
  })
})

describe('uploads are validated on content, not on their name', () => {
  it('the declared type is checked against an allowlist', () => {
    assert.match(src, /ALLOWED\.has\(declared\)/)
    for (const mime of ['application/pdf', 'image/jpeg', 'image/png']) {
      assert.ok(src.includes(mime), `${mime} missing from the allowlist`)
    }
  })

  it('no office or executable formats are accepted', () => {
    // The employees bucket takes Word documents. A receipt does not need to be
    // a macro-capable format.
    for (const bad of ['msword', 'officedocument', 'application/zip', 'x-msdownload']) {
      assert.ok(!src.includes(bad), `${bad} should not be an accepted attachment type`)
      assert.ok(!migration.includes(bad), `${bad} should not be in the bucket allowlist`)
    }
  })

  it('magic bytes are sniffed and compared to the declared type', () => {
    assert.match(src, /function sniff\(/, 'no content sniffing')
    assert.ok(src.includes('0x25, 0x50, 0x44, 0x46'), 'PDF signature not checked')
    assert.ok(src.includes('0xff, 0xd8, 0xff'), 'JPEG signature not checked')
    assert.match(src, /if \(!actual\)/, 'an unrecognised file is not rejected')
  })

  it('the storage key is generated, not built from the filename', () => {
    // A filename can carry path separators or unicode that changes how a key
    // reads. The original name is kept for display only.
    assert.match(src, /function storageKey\([\s\S]{0,200}randomUUID\(\)/)
    assert.ok(
      !/storageKey[\s\S]{0,300}file\.name/.test(src),
      'the storage key is derived from the uploaded filename',
    )
  })

  it('a size limit is enforced before the file is read', () => {
    const limit = src.indexOf('MAX_FILE_BYTES')
    const read = src.indexOf('arrayBuffer()')
    assert.ok(limit > 0 && read > 0)
    assert.ok(limit < read, 'the whole file is buffered before its size is checked')
  })
})

describe('attachments follow the module rules', () => {
  it('a decided request cannot take new attachments', () => {
    assert.match(src, /'Approved' \|\| request\.status === 'Refused'/)
  })

  it('only the owner may remove one, and only while it is a draft', () => {
    assert.match(src, /!isOwnedBy\(request, actor\.email\)/)
    assert.match(src, /request\.status !== 'To Submit'/)
  })

  it('removal is a soft delete so the audit entry stays resolvable', () => {
    assert.match(migration, /deleted_at timestamptz/)
    assert.match(migration, /SET deleted_at = now\(\)/)
  })

  it('the row and its audit entry are written atomically', () => {
    assert.match(src, /\.rpc\('approval_attachment_add'/)
    assert.match(src, /\.rpc\('approval_attachment_remove'/)
    assert.match(migration, /approval_activity_write\(/)
  })

  it('a failed record drops the uploaded object', () => {
    // Otherwise a rolled-back attach leaves an unreferenced file in a bucket
    // nobody is listing.
    assert.match(src, /remove\(\[key\]\)/)
  })

  it('the audit vocabulary covers attachments', () => {
    assert.match(migration, /'attachment_added', 'attachment_removed'/)
  })
})

describe('attachment metadata does not leak into page payloads', () => {
  it('the client type carries no path and no url', () => {
    const block = typesSrc.slice(
      typesSrc.indexOf('export type ApprovalAttachment'),
      typesSrc.indexOf('// The logged-in admin acting on a request'),
    )
    assert.ok(block.length > 0, 'ApprovalAttachment type not found')
    for (const leak of ['storagePath', 'storage_path', 'url', 'signedUrl']) {
      assert.ok(!block.includes(leak), `ApprovalAttachment exposes ${leak}`)
    }
  })

  it('queries never select the storage path', () => {
    assert.ok(
      !/ATTACHMENT_COLUMNS[^\n]*storage_path/.test(queriesSrc),
      'the storage path is selected into request payloads',
    )
  })

  it('deleted attachments are filtered out of both read paths', () => {
    const filters = queriesSrc.match(/\.is\('deleted_at', null\)/g)
    assert.ok(
      (filters?.length ?? 0) >= 2,
      `expected the list and by-id reads to hide removed files, found ${filters?.length ?? 0}`,
    )
  })
})

describe('purging stays governed', () => {
  it('the purge function demands a reason and logs before destroying', () => {
    const fn = migration.slice(migration.indexOf('approval_request_purge'))
    assert.match(fn, /length\(btrim\(p_reason\)\) < 8/, 'no reason is required')
    const log = fn.indexOf('INSERT INTO audit_log')
    const del = fn.indexOf('DELETE FROM approval_request')
    assert.ok(log > 0 && del > 0, 'expected both a log write and a delete')
    assert.ok(log < del, 'the audit_log entry is written after the delete')
  })

  it('the append-only bypass is transaction-scoped', () => {
    // A session-level set would leak onto the next request sharing the
    // pooled connection.
    assert.match(
      migration,
      /set_config\('approvals\.allow_activity_maintenance', 'on', true\)/,
      'the bypass is not scoped to the transaction',
    )
  })

  it('every new function is revoked from public roles', () => {
    const created = [...migration.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)]
      .map((m) => m[1])
    assert.ok(created.length >= 3, `expected >=3 functions, found ${created.join(', ')}`)
    for (const name of new Set(created)) {
      assert.match(
        migration,
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon, authenticated`),
        `${name} is callable by unauthorized roles`,
      )
    }
  })
})

describe('the attachment migration is present and ordered', () => {
  it('applies after the audit-durability migration it extends', () => {
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
    assert.ok(
      files.indexOf('20260801181509_approval_attachments.sql') >
        files.indexOf('20260801175357_approvals_audit_durability.sql'),
      'attachments must apply after the audit columns and approval_activity_write exist',
    )
  })
})
