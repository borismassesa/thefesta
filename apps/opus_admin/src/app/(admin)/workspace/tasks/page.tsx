import { createSupabaseAdminClient } from '@/lib/supabase'
import { getSelfIdentity } from '@/lib/workforce/identity'
import { getAssignedTasksForEmployee } from '../../workforce/_lib/queries'
import MyTasksHeading from './MyTasksHeading'
import MyTasksList from './MyTasksList'
import { completeTask, reopenTask, startTask } from './actions'

export const dynamic = 'force-dynamic'

// "My tasks" — every workforce member can land here from their dashboard
// lane. Shows the caller's own tasks from two sources, merged:
//   - intern_tasks    (onboarding / shadowing checklist)
//   - workforce_tasks (instances generated from admin assignments)
// grouped by status, with mark complete / start / reopen via the server
// actions. The `source` on each task routes the action to the right table.
//
// Auth: covered by the (admin)/workforce layout (workforce.read). The
// actions enforce per-row ownership of their own.

export type MyTask = {
  id: string
  source: 'intern' | 'assigned'
  title: string
  description: string | null
  status: 'Todo' | 'In Progress' | 'Done' | 'Skipped'
  category: string
  cadence: string | null
  due_date: string | null
  completed_at: string | null
}

export default async function MyTasksPage() {
  // The Workspace layout has already resolved and gated identity; this reuses
  // the same per-request cached result rather than re-querying by email.
  const identity = await getSelfIdentity()
  const employee = identity.ok ? identity.employee : null

  const supabase = createSupabaseAdminClient()

  if (!employee) {
    return (
      <div className="pb-12">
        <MyTasksHeading
          title="My tasks"
          subtitle="No workforce record yet — ask an admin to add you."
        />
      </div>
    )
  }

  const { data: internRows, error: internError } = await supabase
    .from('intern_tasks')
    .select('id, title, description, status, category, due_date, completed_at')
    .eq('employee_id', employee.id)
    .limit(200)
  if (internError) throw internError

  const assigned = await getAssignedTasksForEmployee(employee.id)

  const tasks: MyTask[] = [
    ...(internRows ?? []).map((r) => ({
      id: r.id as string,
      source: 'intern' as const,
      title: r.title as string,
      description: (r.description ?? null) as string | null,
      status: r.status as MyTask['status'],
      category: r.category as string,
      cadence: null,
      due_date: (r.due_date ?? null) as string | null,
      completed_at: (r.completed_at ?? null) as string | null,
    })),
    ...assigned.map((t) => ({
      id: t.id,
      source: 'assigned' as const,
      title: t.title,
      description: t.description,
      status: t.status,
      category: t.category,
      cadence: t.cadence,
      due_date: t.dueDate,
      completed_at: t.completedAt,
    })),
  ]

  // Merging two sources loses the per-query ordering, so sort the combined
  // list by due date (soonest/overdue first, undated last). The open/done
  // groups below derive from this order via filter, so both stay sorted.
  tasks.sort((a, b) => {
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
    if (a.due_date) return -1
    if (b.due_date) return 1
    return 0
  })

  const open = tasks.filter((t) => t.status === 'Todo' || t.status === 'In Progress')
  const done = tasks.filter((t) => t.status === 'Done')

  return (
    <div className="pb-12">
      <MyTasksHeading
        title="My tasks"
        subtitle={`${open.length} open · ${done.length} done`}
      />
      <div className="mx-auto max-w-[1000px] px-2 pt-6">
        <MyTasksList
          tasks={tasks}
          actions={{ start: startTask, complete: completeTask, reopen: reopenTask }}
        />
      </div>
    </div>
  )
}
