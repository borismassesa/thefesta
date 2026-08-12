import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

const root = new URL('../../', import.meta.url)

async function source(path: string): Promise<string> {
  return readFile(new URL(path, root), 'utf8')
}

describe('leave uses one operational workflow', () => {
  it('redirects the legacy Workforce route to ledger-backed Workspace Leave', async () => {
    const page = await source('app/(admin)/workforce/leave/page.tsx')
    assert.match(page, /redirect\('\/workspace\/leave'\)/)
    assert.doesNotMatch(page, /from\('workforce_leave_requests'\)/)
  })

  it('keeps employee and approver links on the canonical route', async () => {
    const files = await Promise.all([
      source('app/(admin)/workspace/_components/HomeView.tsx'),
      source('app/(admin)/_dashboard/queries.ts'),
      source('app/(admin)/_dashboard/ActionQueue.tsx'),
      source('components/Sidebar.tsx'),
    ])
    for (const file of files) assert.doesNotMatch(file, /href:\s*['"]\/workforce\/leave/)
  })

  it('counts operational approvals from the ledger-backed request table', async () => {
    const dashboard = await source('app/(admin)/_dashboard/queries.ts')
    assert.doesNotMatch(dashboard, /from\('workforce_leave_requests'\)/)
    assert.match(dashboard, /from\('leave_requests'\)/)
    assert.match(dashboard, /\.in\('state', \['submitted', 'under_review'\]\)/)
  })

  it('loads the Workspace home leave card from the canonical tables', async () => {
    const home = await source('app/(admin)/workspace/_lib/home.ts')
    assert.match(home, /from\('leave_requests'\)/)
    assert.match(home, /from\('leave_balances'\)/)
    assert.doesNotMatch(home, /from\('workforce_leave_requests'\)/)
  })
})
