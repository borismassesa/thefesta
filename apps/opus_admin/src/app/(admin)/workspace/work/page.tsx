import { hasPermission } from '@/lib/admin-auth'
import { workspaceErrorCode } from '@/lib/workspace/errors'
import { requireWorkspaceCapability } from '@/lib/workspace/guards'
import {
  getCalendar,
  getDependencies,
  getMeetings,
  getMilestones,
  getMyProjects,
  getMyTasks,
} from '@/lib/work/queries'
import { addDays } from '@/lib/work/calendar'
import AccessNotice from '../_components/AccessNotice'
import WorkspaceHeading from '../_components/WorkspaceHeading'
import WorkClient from './WorkClient'
import {
  addProgressNote,
  createTask,
  deleteTask,
  flagBlocker,
  setTaskStatus,
} from './actions'

export const dynamic = 'force-dynamic'

// My Work: tasks, projects, calendar, meetings, checklists, dependencies and
// blockers.
//
// Every list here goes through task_visible_ids() or project_is_visible_to().
// Nothing is fetched and then filtered, so a task the employee is not entitled
// to never reaches this process.
export default async function WorkPage() {
  let context
  try {
    context = await requireWorkspaceCapability('tools.use', { action: 'work.view' })
  } catch (error) {
    return (
      <>
        <WorkspaceHeading title="My work" />
        <AccessNotice code={workspaceErrorCode(error)} />
      </>
    )
  }

  const { employee } = context
  const isAdmin = await hasPermission('workforce.write')
  const timeZone = 'Africa/Dar_es_Salaam'
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

  const [tasks, projects, dependencies, calendar, meetings, milestones] = await Promise.all([
    getMyTasks(employee, { isAdmin }),
    getMyProjects(employee, isAdmin),
    getDependencies(employee, isAdmin),
    getCalendar(employee, addDays(today, -3), addDays(today, 24), timeZone, isAdmin),
    getMeetings(employee),
    getMilestones(employee, isAdmin),
  ])

  return (
    <>
      <WorkspaceHeading
        title="My work"
        subtitle="Your tasks, the projects you are on, and what is coming up."
      />
      <WorkClient
        today={today}
        timeZone={timeZone}
        employeeId={employee.id}
        tasks={tasks}
        projects={projects}
        dependencies={dependencies}
        calendar={calendar}
        meetings={meetings}
        milestones={milestones}
        actions={{ setTaskStatus, addProgressNote, flagBlocker, createTask, deleteTask }}
      />
    </>
  )
}
