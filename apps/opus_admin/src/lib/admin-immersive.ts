/**
 * Full-bleed admin workspaces that own their own chrome.
 * The global Header and Sidebar step aside on these routes.
 */
export function isImmersiveWorkspace(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  // /opus-pass/design-studio/[projectId] — Opus Card Design Studio editor
  return /^\/opus-pass\/design-studio\/[^/]+/.test(pathname)
}
