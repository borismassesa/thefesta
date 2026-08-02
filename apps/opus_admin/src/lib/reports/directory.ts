import 'server-only'
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'
import { logDbError } from '@/lib/log-safe'
import type { WorkspaceEmployee } from '@/lib/workspace/identity'
import type { DirectoryContext, DirectoryPerson, RecipientRule } from './recipients'

// Loads the directory snapshot that recipient resolution runs against.
//
// One snapshot, not per-rule lookups: resolving eight rules must not be eight
// round-trips, and every rule should see the same org chart. Which rules are
// present decides what gets loaded, so a template that only mails your manager
// does not pull every role and group in the platform.

export async function buildDirectoryContext(
  author: WorkspaceEmployee,
  rules: RecipientRule[],
): Promise<DirectoryContext | null> {
  if (!hasSupabaseAdminConfig()) return null

  const empty: DirectoryContext = {
    author: {
      id: author.id,
      name: author.name,
      email: author.email,
      department: author.department,
      jobTitle: author.jobTitle,
      managerId: author.managerId,
      status: author.status,
    },
    people: new Map(),
    departmentLeads: new Map(),
    projectManagers: new Map(),
    roleHolders: new Map(),
    distributionGroups: new Map(),
  }

  try {
    const supabase = createSupabaseAdminClient()
    const sources = new Set(rules.map((r) => r.source))

    // Everyone who could be reached by these rules. Collected as ids first so
    // the people fetch is one query however many rules there are.
    const wanted = new Set<string>([author.id])
    if (author.managerId) wanted.add(author.managerId)
    for (const rule of rules) {
      if (rule.source === 'named_employee' && rule.employeeId) wanted.add(rule.employeeId)
    }

    const departmentLeads = new Map<string, string>()
    const projectManagers = new Map<string, string>()
    const roleHolders = new Map<string, string[]>()
    const distributionGroups = new Map<string, string[]>()

    if (sources.has('department_lead')) {
      const departments = [
        ...new Set(rules.filter((r) => r.source === 'department_lead').map((r) => r.department ?? author.department)),
      ]
      // A department's lead is the employee others in it report to. Derived
      // rather than stored: a `department_leads` table would be a second place
      // for the org chart to be wrong.
      const { data, error } = await supabase
        .from('workforce_employees')
        .select('id, department, job_title, manager_id, status')
        .in('department', departments)
        .in('status', ['Active', 'On Leave', 'Onboarding'])
        .returns<
          { id: string; department: string; job_title: string; manager_id: string | null; status: string }[]
        >()
      if (error) logDbError('reports.directory.department_leads', error)
      for (const department of departments) {
        const members = (data ?? []).filter((p) => p.department === department)
        const memberIds = new Set(members.map((m) => m.id))
        // The lead is the member whose own manager is outside the department.
        const lead =
          members.find((m) => !m.manager_id || !memberIds.has(m.manager_id)) ?? members[0]
        if (lead) {
          departmentLeads.set(department, lead.id)
          wanted.add(lead.id)
        }
      }
    }

    if (sources.has('project_manager')) {
      const projectIds = rules
        .filter((r) => r.source === 'project_manager')
        .map((r) => r.projectId)
        .filter((id): id is string => Boolean(id))
      if (projectIds.length > 0) {
        const { data, error } = await supabase
          .from('projects')
          .select('id, manager_id')
          .in('id', projectIds)
          .returns<{ id: string; manager_id: string | null }[]>()
        if (error) logDbError('reports.directory.projects', error)
        for (const project of data ?? []) {
          if (!project.manager_id) continue
          projectManagers.set(project.id, project.manager_id)
          wanted.add(project.manager_id)
        }
      }
    }

    if (sources.has('role_holder')) {
      const roleIds = rules
        .filter((r) => r.source === 'role_holder')
        .map((r) => r.roleId)
        .filter((id): id is string => Boolean(id))
      if (roleIds.length > 0) {
        const { data, error } = await supabase
          .from('workforce_employees')
          .select('id, dashboard_role_id')
          .in('dashboard_role_id', roleIds)
          .returns<{ id: string; dashboard_role_id: string }[]>()
        if (error) logDbError('reports.directory.roles', error)
        for (const person of data ?? []) {
          const list = roleHolders.get(person.dashboard_role_id) ?? []
          list.push(person.id)
          roleHolders.set(person.dashboard_role_id, list)
          wanted.add(person.id)
        }
      }
    }

    if (sources.has('distribution_group')) {
      const groupIds = rules
        .filter((r) => r.source === 'distribution_group')
        .map((r) => r.groupId)
        .filter((id): id is string => Boolean(id))
      if (groupIds.length > 0) {
        // Groups are project teams today. When a dedicated groups table exists,
        // this is the one place that changes.
        const { data, error } = await supabase
          .from('project_members')
          .select('project_id, employee_id')
          .in('project_id', groupIds)
          .returns<{ project_id: string; employee_id: string }[]>()
        if (error) logDbError('reports.directory.groups', error)
        for (const member of data ?? []) {
          const list = distributionGroups.get(member.project_id) ?? []
          list.push(member.employee_id)
          distributionGroups.set(member.project_id, list)
          wanted.add(member.employee_id)
        }
      }
    }

    const { data: people, error: peopleError } = await supabase
      .from('workforce_employees')
      .select('id, full_name, email, department, job_title, manager_id, status')
      .in('id', [...wanted])
      .returns<
        {
          id: string
          full_name: string
          email: string
          department: string
          job_title: string
          manager_id: string | null
          status: string
        }[]
      >()
    if (peopleError) {
      logDbError('reports.directory.people', peopleError)
      return empty
    }

    const peopleMap = new Map<string, DirectoryPerson>()
    for (const p of people ?? []) {
      peopleMap.set(p.id, {
        id: p.id,
        name: p.full_name,
        email: p.email,
        department: p.department,
        jobTitle: p.job_title,
        managerId: p.manager_id,
        status: p.status,
      })
    }

    return {
      author: peopleMap.get(author.id) ?? empty.author,
      people: peopleMap,
      departmentLeads,
      projectManagers,
      roleHolders,
      distributionGroups,
    }
  } catch (error) {
    logDbError('reports.directory', error, { employeeId: author.id })
    return empty
  }
}
