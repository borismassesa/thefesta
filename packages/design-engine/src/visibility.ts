import { getByPath } from './variables'
import type { VisibilityRule } from './schema'

export function evaluateVisibility(
  rule: VisibilityRule | null | undefined,
  data: Record<string, unknown>,
): boolean {
  if (!rule) return true
  const value = getByPath(data, rule.path)
  const present = value != null && String(value).length > 0

  switch (rule.op) {
    case 'present':
      return present
    case 'absent':
      return !present
    case 'equals':
      return String(value ?? '') === (rule.value ?? '')
    case 'not_equals':
      return String(value ?? '') !== (rule.value ?? '')
    default:
      return true
  }
}
