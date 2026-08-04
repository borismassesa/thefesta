// Work module failures, translated.
//
// The database functions raise ERRCODE P0001 with stable dotted tokens, read
// here under an exact-match whitelist. We render text WE wrote, keyed by a token
// WE defined; a PostgREST message can carry a row value, and task titles carry
// client names and commercial detail.

export const WORK_ERROR_TOKENS = [
  'task.not_found',
  'task.not_assigned',
  'task.not_permitted',
  'task.already_closed',
  'task.blocker_reason_required',
  'task.blocked_by_dependency',
  'task.dependency_cycle',
  'task.reason_required',
  'task.activity_immutable',
  'project.not_visible',
] as const

export type WorkErrorToken = (typeof WORK_ERROR_TOKENS)[number]

const MESSAGES: Record<WorkErrorToken, string> = {
  // Deliberately the same message as a genuinely missing task: telling somebody
  // "you lack permission" confirms the task exists, which is itself a leak.
  'task.not_found': 'That task is not available to you.',
  'task.not_assigned':
    'You can see this task but not change it. Ask the owner to assign it to you.',
  'task.not_permitted': 'You do not have permission to do that to this task.',
  'task.already_closed':
    'This task is closed. Reopen it to in progress first if it needs more work.',
  'task.blocker_reason_required': 'Say what is blocking it, so somebody can unblock it.',
  'task.blocked_by_dependency':
    'Something this task depends on is not finished yet. Close that first, or unlink it.',
  'task.dependency_cycle':
    'That would make two tasks depend on each other, and neither could ever be completed.',
  'task.reason_required': 'Give a reason. It stays on the record.',
  'task.activity_immutable': 'Task history cannot be edited.',
  'project.not_visible': 'That project is not available to you.',
}

const GENERIC = 'That could not be saved right now. Try again in a moment.'

const TOKEN_SET = new Set<string>(WORK_ERROR_TOKENS)

export function workErrorToken(error: unknown): WorkErrorToken | null {
  if (!error || typeof error !== 'object') return null
  const message = (error as { message?: unknown }).message
  if (typeof message !== 'string') return null
  const trimmed = message.trim()
  return TOKEN_SET.has(trimmed) ? (trimmed as WorkErrorToken) : null
}

export function workMessage(error: unknown): string {
  const token = workErrorToken(error)
  return token ? MESSAGES[token] : GENERIC
}

export function messageForToken(token: WorkErrorToken): string {
  return MESSAGES[token]
}
