/** Stable element / page ids. Never reuse after delete. */
export function createId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return `${prefix}_${rand}`
}

export const newElementId = () => createId('el')
export const newPageId = () => createId('page')
export const newDocumentId = () => createId('doc')
