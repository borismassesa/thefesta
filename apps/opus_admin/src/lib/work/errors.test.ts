// Task titles carry client names and commercial detail, so the whitelist is a
// leak guard as much as a translation layer.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { WORK_ERROR_TOKENS, messageForToken, workErrorToken, workMessage } from './errors'

const LEAKY_PG_ERROR = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "uniq_task_assignment_active"',
  details: 'Key (title)=(Renegotiate the Serengeti Lodge contract) already exists.',
  hint: null,
}

describe('workErrorToken', () => {
  it('recognises every declared token', () => {
    for (const token of WORK_ERROR_TOKENS) {
      assert.equal(workErrorToken({ message: token }), token)
    }
  })

  it('refuses a message that merely contains a token', () => {
    assert.equal(workErrorToken({ message: 'ERROR: task.not_found for Serengeti Lodge' }), null)
  })

  it('refuses anything not on the list', () => {
    assert.equal(workErrorToken(LEAKY_PG_ERROR), null)
    assert.equal(workErrorToken({ message: 'task.invented' }), null)
    assert.equal(workErrorToken(null), null)
  })
})

describe('workMessage', () => {
  it('never lets a database message through', () => {
    const out = workMessage(LEAKY_PG_ERROR)
    assert.ok(!out.includes('Serengeti'), 'a client name must never reach the browser')
    assert.ok(!out.includes('uniq_task_assignment_active'))
  })

  it('gives every token a sentence, not an identifier', () => {
    for (const token of WORK_ERROR_TOKENS) {
      const text = messageForToken(token)
      assert.ok(text.length > 15, `${token} needs a real message`)
      assert.ok(!text.includes('_'), `${token} reads like an identifier`)
    }
  })

  it('does NOT confirm a task exists to somebody who may not see it', () => {
    // "You lack permission" tells an outsider the task is real. The message for
    // a hidden task must be indistinguishable from one for a missing task.
    assert.equal(messageForToken('task.not_found'), 'That task is not available to you.')
    assert.ok(!messageForToken('task.not_found').match(/permission|denied/i))
  })

  it('tells an assignee-less viewer what to actually do', () => {
    assert.match(messageForToken('task.not_assigned'), /ask the owner/i)
  })
})
