import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

const routes = ['attendance', 'reports', 'tracker', 'leave'] as const

describe('Workspace maintenance routes fail visibly', () => {
  for (const route of routes) {
    it(`${route} uses shared cron auth and reports failed jobs with HTTP 500`, async () => {
      const source = await readFile(
        new URL(`../app/api/${route}/maintenance/route.ts`, import.meta.url),
        'utf8',
      )
      assert.match(source, /isCronAuthorized\(auth, secret\)/)
      assert.match(source, /const failedJobs: string\[\] = \[\]/)
      assert.match(source, /status: failedJobs\.length === 0 \? 200 : 500/)
      assert.doesNotMatch(source, /auth !== `Bearer \$\{secret\}`/)
    })
  }
})
