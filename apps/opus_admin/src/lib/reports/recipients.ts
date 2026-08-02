// Recipient resolution — pure, no I/O.
//
// A template version declares WHO a report goes to as rules, not as a list of
// people. "Send to my direct manager" keeps working when someone changes team;
// a hard-coded list quietly keeps mailing the previous manager for a year.
//
// The I/O layer loads a directory snapshot and hands it here; this decides. That
// split is what makes six resolution sources testable without a database.

export const RECIPIENT_SOURCES = [
  'direct_manager',
  'department_lead',
  'project_manager',
  'role_holder',
  'named_employee',
  'distribution_group',
] as const

export type RecipientSource = (typeof RECIPIENT_SOURCES)[number]

export const RECIPIENT_SOURCE_LABELS: Record<RecipientSource, string> = {
  direct_manager: 'Direct manager',
  department_lead: 'Department lead',
  project_manager: 'Project manager',
  role_holder: 'Role holder',
  named_employee: 'Named employee',
  distribution_group: 'Distribution group',
}

export type RecipientRule = {
  source: RecipientSource
  /** named_employee */
  employeeId?: string
  /** department_lead — defaults to the author's own department. */
  department?: string
  /** project_manager */
  projectId?: string
  /** role_holder */
  roleId?: string
  /** distribution_group */
  groupId?: string
  /** Copy rather than primary recipient. Both are resolved; the distinction
   *  drives the To/Cc split on the emailed copy. */
  cc?: boolean
  /** When true, failing to resolve this rule blocks submission. Used for the
   *  manager on an appraisal-style report, where sending it to nobody is worse
   *  than refusing to send it. */
  required?: boolean
}

export type DirectoryPerson = {
  id: string
  name: string
  email: string
  department: string
  jobTitle: string
  managerId: string | null
  status: string
}

/**
 * Everything resolution needs, loaded once by the caller.
 *
 * Snapshot, not live lookups: resolving eight rules must not be eight
 * round-trips, and every rule should see the same directory.
 */
export type DirectoryContext = {
  /** The report's author. */
  author: DirectoryPerson
  /** Keyed by employee id. Must contain at least everyone reachable. */
  people: Map<string, DirectoryPerson>
  /** Department name -> employee id of its lead. */
  departmentLeads: Map<string, string>
  /** Project id -> employee id of its manager. */
  projectManagers: Map<string, string>
  /** Role id -> employee ids holding it. */
  roleHolders: Map<string, string[]>
  /** Group id -> employee ids. */
  distributionGroups: Map<string, string[]>
}

export type ResolvedRecipient = {
  employeeId: string
  name: string
  email: string
  /** Which rule produced them. Stored on the submission so "why did I get this"
   *  is answerable a year later. */
  source: RecipientSource
  cc: boolean
}

export type ResolutionResult = {
  recipients: ResolvedRecipient[]
  /** Rules that resolved to nobody. */
  unresolved: { source: RecipientSource; reason: string; required: boolean }[]
}

/** Employment states that must never receive a report. */
function isReachable(person: DirectoryPerson | undefined): person is DirectoryPerson {
  if (!person) return false
  // A resigned or terminated manager should not keep receiving their old
  // team's reports. Suspended is excluded too: they have no Workspace access.
  return person.status === 'Active' || person.status === 'On Leave' || person.status === 'Onboarding'
}

function idsFor(rule: RecipientRule, ctx: DirectoryContext): { ids: string[]; reason?: string } {
  switch (rule.source) {
    case 'direct_manager': {
      if (!ctx.author.managerId) return { ids: [], reason: 'no manager is set on your record' }
      return { ids: [ctx.author.managerId] }
    }
    case 'department_lead': {
      const department = rule.department ?? ctx.author.department
      const lead = ctx.departmentLeads.get(department)
      return lead ? { ids: [lead] } : { ids: [], reason: `no lead is set for ${department}` }
    }
    case 'project_manager': {
      if (!rule.projectId) return { ids: [], reason: 'no project was chosen' }
      const manager = ctx.projectManagers.get(rule.projectId)
      return manager ? { ids: [manager] } : { ids: [], reason: 'that project has no manager' }
    }
    case 'role_holder': {
      if (!rule.roleId) return { ids: [], reason: 'no role was chosen' }
      const holders = ctx.roleHolders.get(rule.roleId) ?? []
      return holders.length > 0 ? { ids: holders } : { ids: [], reason: 'nobody holds that role' }
    }
    case 'named_employee': {
      if (!rule.employeeId) return { ids: [], reason: 'no person was chosen' }
      return { ids: [rule.employeeId] }
    }
    case 'distribution_group': {
      if (!rule.groupId) return { ids: [], reason: 'no group was chosen' }
      const members = ctx.distributionGroups.get(rule.groupId) ?? []
      return members.length > 0 ? { ids: members } : { ids: [], reason: 'that group is empty' }
    }
  }
}

/**
 * Resolve rules to people.
 *
 * Deduplicated by employee: one person named by three rules receives one copy.
 * The author is dropped — a report addressed to yourself is noise, and it is
 * the commonest accident when a department lead files their own department's
 * report.
 *
 * A rule that resolves to nobody is reported rather than silently dropped, so
 * the submit screen can say "your manager is not set" instead of sending the
 * report into a void.
 */
export function resolveRecipients(
  rules: RecipientRule[],
  ctx: DirectoryContext,
): ResolutionResult {
  const byEmployee = new Map<string, ResolvedRecipient>()
  const unresolved: ResolutionResult['unresolved'] = []

  for (const rule of rules) {
    const { ids, reason } = idsFor(rule, ctx)
    const reachable = ids
      .map((id) => ctx.people.get(id))
      .filter(isReachable)
      .filter((person) => person.id !== ctx.author.id)

    if (reachable.length === 0) {
      unresolved.push({
        source: rule.source,
        reason:
          reason ??
          (ids.length > 0
            ? 'the person it resolved to has left or has no access'
            : 'it resolved to nobody'),
        required: rule.required ?? false,
      })
      continue
    }

    for (const person of reachable) {
      const existing = byEmployee.get(person.id)
      if (existing) {
        // Named as both primary and copy: primary wins. Being cc'd should never
        // downgrade someone the template explicitly addressed.
        if (existing.cc && !(rule.cc ?? false)) {
          byEmployee.set(person.id, { ...existing, cc: false, source: rule.source })
        }
        continue
      }
      byEmployee.set(person.id, {
        employeeId: person.id,
        name: person.name,
        email: person.email,
        source: rule.source,
        cc: rule.cc ?? false,
      })
    }
  }

  return { recipients: [...byEmployee.values()], unresolved }
}

/** Rules that failed and were marked required. Submission is blocked on these. */
export function blockingFailures(result: ResolutionResult): ResolutionResult['unresolved'] {
  return result.unresolved.filter((u) => u.required)
}

/** Parse stored recipient rules from jsonb, discarding anything malformed. */
export function parseRecipientRules(value: unknown): RecipientRule[] {
  if (!Array.isArray(value)) return []
  const rules: RecipientRule[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const rule = item as Record<string, unknown>
    if (!RECIPIENT_SOURCES.includes(rule.source as RecipientSource)) continue
    rules.push(rule as unknown as RecipientRule)
  }
  return rules
}
