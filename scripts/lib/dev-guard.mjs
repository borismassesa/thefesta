// Shared pre-flight guard for every script that writes to or destroys data in
// the Supabase development project.
//
// One implementation on purpose. When the guard was inlined in the seed
// script, the next script that needed it would have copied a slightly weaker
// version — and the weakest copy is the one that decides whether production
// gets written to.
//
// Enforces, in order:
//   1. NODE_ENV=development
//   2. ALLOW_DEV_SEED=true
//   3. SUPABASE_DEV_PROJECT_REF is set
//   4. SUPABASE_DEV_URL's project ref matches it EXACTLY
//   5. SUPABASE_DEV_SERVICE_ROLE_KEY is set
//   6. the resolved ref is not the production project, under any configuration

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Hardcoded denylist. No combination of environment variables can defeat this.
export const PRODUCTION_PROJECT_REF = 'ppdapuqehwlfwofbpbvb'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ENV_FILE = resolve(REPO_ROOT, '.env.development.local')

// Load the dev credentials from a gitignored file rather than requiring them
// on the command line. A service-role key typed into a shell ends up in
// ~/.zsh_history, and one pasted into a chat log lives there forever. Real
// environment variables still win, so CI can override.
function loadEnvFile() {
  if (!existsSync(ENV_FILE)) return
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    // Strip one layer of matching quotes; keys often get pasted quoted.
    const value = trimmed.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
    if (!(key in process.env)) process.env[key] = value
  }
}

class GuardError extends Error {}

function fail(message) {
  throw new GuardError(message)
}

function refFromUrl(url) {
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(url.trim())
  return match ? match[1] : null
}

/**
 * Resolves and validates the development target.
 * Throws GuardError with an actionable message if anything is off.
 * @returns {{ url: string, serviceRoleKey: string, anonKey: string|null, ref: string }}
 */
export function requireDevProject() {
  loadEnvFile()
  const nodeEnv = process.env.NODE_ENV
  const allow = process.env.ALLOW_DEV_SEED
  const declaredRef = (process.env.SUPABASE_DEV_PROJECT_REF ?? '').trim()
  const url = (process.env.SUPABASE_DEV_URL ?? '').trim()
  const serviceRoleKey = (process.env.SUPABASE_DEV_SERVICE_ROLE_KEY ?? '').trim()
  const anonKey = (process.env.SUPABASE_DEV_ANON_KEY ?? '').trim() || null

  if (nodeEnv !== 'development') {
    fail(`NODE_ENV must be "development" (got ${nodeEnv ?? 'unset'})`)
  }
  if (allow !== 'true') {
    fail('ALLOW_DEV_SEED must be exactly "true"')
  }
  if (!declaredRef) fail('SUPABASE_DEV_PROJECT_REF is not set')
  if (!url) fail('SUPABASE_DEV_URL is not set')
  if (!serviceRoleKey) fail('SUPABASE_DEV_SERVICE_ROLE_KEY is not set')

  const actualRef = refFromUrl(url)
  if (!actualRef) {
    fail(`SUPABASE_DEV_URL is not a Supabase project URL: ${url}`)
  }
  if (actualRef !== declaredRef) {
    fail(
      `SUPABASE_DEV_URL points at "${actualRef}" but SUPABASE_DEV_PROJECT_REF says ` +
        `"${declaredRef}". Refusing to touch a project you did not name.`,
    )
  }

  // Last line of defence, checked against both values independently so a
  // mismatch between them cannot slip production through either side.
  if (actualRef === PRODUCTION_PROJECT_REF || declaredRef === PRODUCTION_PROJECT_REF) {
    fail(
      `"${PRODUCTION_PROJECT_REF}" is the production project. This script will never ` +
        'write to it. Point SUPABASE_DEV_* at a dedicated development project.',
    )
  }

  return { url, serviceRoleKey, anonKey, ref: actualRef }
}

/** Resolves the target and prints it, or exits(1) with the reason. */
export function requireDevProjectOrExit(scriptName) {
  try {
    const target = requireDevProject()
    console.log(`\n  ${scriptName}`)
    console.log(`  target project: ${target.ref} (development)\n`)
    return target
  } catch (err) {
    if (err instanceof GuardError) {
      console.error(`\n  ${scriptName} refusing to run: ${err.message}\n`)
      process.exit(1)
    }
    throw err
  }
}
