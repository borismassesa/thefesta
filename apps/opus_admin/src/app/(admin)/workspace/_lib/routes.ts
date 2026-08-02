import type { WorkspaceNavItem } from '@/lib/workforce/scope'

// ---------------------------------------------------------------------------
// Workspace route table — the single place PR C has to edit.
// ---------------------------------------------------------------------------
// The personal surfaces still live at their ORIGINAL paths. PR C moves them
// under /workspace and adds the 308 redirects; until then Workspace Home and
// the sidebar link to where the pages actually are, so nothing 404s in the
// window between PR B and PR C.
//
// Keeping this in one table means the move is a one-file change plus the
// redirect config, rather than a hunt through every component.
//
// PR C target paths, for reference:
//   /me/timeclock            -> /workspace/time-clock
//   /me/reports              -> /workspace/reports
//   /workforce/my-tasks      -> /workspace/tasks
//   /workforce/daily-tracker -> /workspace/tracker

export const WORKSPACE_ROUTES: Record<WorkspaceNavItem, string> = {
  home: '/workspace',
  'time-clock': '/workspace/time-clock',
  leave: '/workspace/leave',
  tasks: '/workspace/tasks',
  reports: '/workspace/reports',
  tracker: '/workspace/tracker',
  calendar: '/workspace/calendar',
  documents: '/workspace/documents',
}

export const WORKSPACE_LABELS: Record<WorkspaceNavItem, string> = {
  home: 'Home',
  'time-clock': 'Time Clock',
  leave: 'My Leave',
  tasks: 'My Tasks',
  reports: 'My Reports',
  tracker: 'My Tracker',
  calendar: 'Calendar',
  documents: 'Documents',
}

// Surfaces that do not exist yet. Phase 3 builds leave, Phase 5 calendar,
// Phase 6 documents. Listed so the sidebar can render them as visibly
// "coming soon" rather than as links that 404.
export const WORKSPACE_NOT_BUILT: readonly WorkspaceNavItem[] = [
  'leave',
  'calendar',
  'documents',
]

export function isWorkspaceRouteLive(item: WorkspaceNavItem): boolean {
  return !WORKSPACE_NOT_BUILT.includes(item)
}
