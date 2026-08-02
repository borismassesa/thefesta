// Recipient resolution decides who receives someone's report. The failure that
// matters is sending it to the wrong person, so these tests are mostly about
// who must NOT be resolved: a departed manager, the author themselves, and a
// rule that quietly resolves to nobody.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  RECIPIENT_SOURCES,
  RECIPIENT_SOURCE_LABELS,
  blockingFailures,
  parseRecipientRules,
  resolveRecipients,
  type DirectoryContext,
  type DirectoryPerson,
} from './recipients'

function person(over: Partial<DirectoryPerson> & Pick<DirectoryPerson, 'id' | 'name'>): DirectoryPerson {
  return {
    email: `${over.id}@opusfesta.com`,
    department: 'Technology',
    jobTitle: 'Engineer',
    managerId: null,
    status: 'Active',
    ...over,
  }
}

const AUTHOR = person({ id: 'emp-author', name: 'Amina', managerId: 'emp-manager' })
const MANAGER = person({ id: 'emp-manager', name: 'Boaz', jobTitle: 'Manager' })
const LEAD = person({ id: 'emp-lead', name: 'Chidi', jobTitle: 'Head of Technology' })
const PM = person({ id: 'emp-pm', name: 'Dalia', jobTitle: 'Project Manager' })
const CFO = person({ id: 'emp-cfo', name: 'Esi', department: 'Finance & Accountings' })

function ctx(over: Partial<DirectoryContext> = {}): DirectoryContext {
  return {
    author: AUTHOR,
    people: new Map([AUTHOR, MANAGER, LEAD, PM, CFO].map((p) => [p.id, p])),
    departmentLeads: new Map([['Technology', LEAD.id]]),
    projectManagers: new Map([['proj-1', PM.id]]),
    roleHolders: new Map([['role-finance', [CFO.id]]]),
    distributionGroups: new Map([['group-leads', [LEAD.id, MANAGER.id]]]),
    ...over,
  }
}

describe('the six sources', () => {
  it('labels all of them', () => {
    assert.equal(RECIPIENT_SOURCES.length, 6)
    for (const s of RECIPIENT_SOURCES) assert.ok(RECIPIENT_SOURCE_LABELS[s].length > 0)
  })

  it('resolves the direct manager from the author record', () => {
    const result = resolveRecipients([{ source: 'direct_manager' }], ctx())
    assert.deepEqual(
      result.recipients.map((r) => r.employeeId),
      [MANAGER.id],
    )
  })

  it('resolves the department lead, defaulting to the author’s department', () => {
    const result = resolveRecipients([{ source: 'department_lead' }], ctx())
    assert.deepEqual(result.recipients.map((r) => r.employeeId), [LEAD.id])
  })

  it('resolves a named department lead when the rule names one', () => {
    const result = resolveRecipients(
      [{ source: 'department_lead', department: 'Finance & Accountings' }],
      ctx({ departmentLeads: new Map([['Finance & Accountings', CFO.id]]) }),
    )
    assert.deepEqual(result.recipients.map((r) => r.employeeId), [CFO.id])
  })

  it('resolves a project manager, a role holder, a named employee and a group', () => {
    const result = resolveRecipients(
      [
        { source: 'project_manager', projectId: 'proj-1' },
        { source: 'role_holder', roleId: 'role-finance' },
        { source: 'named_employee', employeeId: MANAGER.id },
        { source: 'distribution_group', groupId: 'group-leads' },
      ],
      ctx(),
    )
    const ids = result.recipients.map((r) => r.employeeId).sort()
    assert.deepEqual(ids, [CFO.id, LEAD.id, MANAGER.id, PM.id].sort())
    assert.deepEqual(result.unresolved, [])
  })
})

describe('who must not receive a report', () => {
  it('never sends the author their own report', () => {
    // The commonest accident: a department lead filing their own department's
    // report and being resolved as its recipient.
    const result = resolveRecipients(
      [{ source: 'department_lead' }],
      ctx({
        author: person({ id: LEAD.id, name: 'Chidi', department: 'Technology' }),
      }),
    )
    assert.deepEqual(result.recipients, [])
    assert.equal(result.unresolved.length, 1)
  })

  it('never sends to someone who has left', () => {
    const result = resolveRecipients(
      [{ source: 'direct_manager' }],
      ctx({
        people: new Map([
          [AUTHOR.id, AUTHOR],
          [MANAGER.id, { ...MANAGER, status: 'Resigned' }],
        ]),
      }),
    )
    assert.deepEqual(result.recipients, [])
    assert.equal(result.unresolved[0].source, 'direct_manager')
  })

  it('never sends to a suspended or terminated person', () => {
    for (const status of ['Suspended', 'Terminated']) {
      const result = resolveRecipients(
        [{ source: 'direct_manager' }],
        ctx({
          people: new Map([
            [AUTHOR.id, AUTHOR],
            [MANAGER.id, { ...MANAGER, status }],
          ]),
        }),
      )
      assert.deepEqual(result.recipients, [], status)
    }
  })

  it('does send to someone on leave, who is still employed', () => {
    const result = resolveRecipients(
      [{ source: 'direct_manager' }],
      ctx({
        people: new Map([
          [AUTHOR.id, AUTHOR],
          [MANAGER.id, { ...MANAGER, status: 'On Leave' }],
        ]),
      }),
    )
    assert.deepEqual(result.recipients.map((r) => r.employeeId), [MANAGER.id])
  })
})

describe('deduplication', () => {
  it('sends one copy to a person named by several rules', () => {
    const result = resolveRecipients(
      [
        { source: 'direct_manager' },
        { source: 'named_employee', employeeId: MANAGER.id },
        { source: 'distribution_group', groupId: 'group-leads' },
      ],
      ctx(),
    )
    const managerEntries = result.recipients.filter((r) => r.employeeId === MANAGER.id)
    assert.equal(managerEntries.length, 1)
  })

  it('lets a primary rule outrank a copy rule, whatever the order', () => {
    const asCcFirst = resolveRecipients(
      [
        { source: 'distribution_group', groupId: 'group-leads', cc: true },
        { source: 'direct_manager' },
      ],
      ctx(),
    )
    assert.equal(asCcFirst.recipients.find((r) => r.employeeId === MANAGER.id)?.cc, false)

    const asPrimaryFirst = resolveRecipients(
      [
        { source: 'direct_manager' },
        { source: 'distribution_group', groupId: 'group-leads', cc: true },
      ],
      ctx(),
    )
    assert.equal(asPrimaryFirst.recipients.find((r) => r.employeeId === MANAGER.id)?.cc, false)
  })
})

describe('rules that resolve to nobody', () => {
  it('explains why rather than silently dropping them', () => {
    const result = resolveRecipients(
      [
        { source: 'direct_manager' },
        { source: 'project_manager', projectId: 'proj-missing' },
        { source: 'role_holder', roleId: 'role-empty' },
        { source: 'distribution_group', groupId: 'group-empty' },
      ],
      ctx({ author: { ...AUTHOR, managerId: null } }),
    )
    assert.deepEqual(result.recipients, [])
    assert.equal(result.unresolved.length, 4)
    for (const u of result.unresolved) {
      assert.ok(u.reason.length > 0, `${u.source} needs a reason`)
      assert.ok(!u.reason.includes('undefined'))
    }
    assert.match(
      result.unresolved.find((u) => u.source === 'direct_manager')!.reason,
      /no manager/i,
    )
  })

  it('separates the failures that must block submission', () => {
    const result = resolveRecipients(
      [
        { source: 'direct_manager', required: true },
        { source: 'project_manager', projectId: 'proj-missing' },
      ],
      ctx({ author: { ...AUTHOR, managerId: null } }),
    )
    const blocking = blockingFailures(result)
    assert.equal(blocking.length, 1)
    assert.equal(blocking[0].source, 'direct_manager')
  })

  it('reports nothing to block when every required rule resolved', () => {
    const result = resolveRecipients([{ source: 'direct_manager', required: true }], ctx())
    assert.deepEqual(blockingFailures(result), [])
  })
})

describe('parseRecipientRules', () => {
  it('survives whatever is in the jsonb column', () => {
    assert.deepEqual(parseRecipientRules(null), [])
    assert.deepEqual(parseRecipientRules({ source: 'direct_manager' }), [])
    assert.deepEqual(parseRecipientRules(['nope']), [])
  })

  it('discards a rule with an unknown source instead of trusting it', () => {
    const rules = parseRecipientRules([
      { source: 'direct_manager' },
      { source: 'everyone_in_the_company' },
    ])
    assert.equal(rules.length, 1)
    assert.equal(rules[0].source, 'direct_manager')
  })
})
