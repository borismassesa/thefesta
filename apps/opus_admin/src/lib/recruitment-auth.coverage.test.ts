import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard coverage for recruitment server actions.
 *
 * The denial matrix in supabase/tests/51_recruitment_authorization_test.sql
 * proves that the scope function refuses the right principals. It cannot prove
 * that an action bothered to ask. An exported server action that simply never
 * calls a guard is reachable by anyone who can reach the route, and no amount
 * of scope testing below it will catch that.
 *
 * So this test asserts a structural property instead: every exported server
 * action in the recruitment module reaches an authorization guard before it
 * can do anything. It is deliberately a whole-directory sweep rather than a
 * list of known actions, because the failure mode is a NEW action added
 * without a guard, and a hand-maintained list would not include it.
 */

const RECRUITMENT_ACTIONS_DIR = join(
  process.cwd(),
  'src/app/(admin)/workforce/recruitment',
)

/** Calling any of these is, by itself, sufficient authorization plumbing. */
const DIRECT_GUARDS = [
  'requireRecruitmentAccess',
  'requirePermission',
  'getRecruitmentWorkspaceAccess',
] as const

function findActionFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) found.push(...findActionFiles(full))
    else if (entry === 'actions.ts') found.push(full)
  }
  return found.sort()
}

/**
 * Finds the `{` that opens a function body, given the index of the `(` that
 * opens its parameter list.
 *
 * Naively taking the next `{` is wrong, and wrong in the direction that
 * matters: these actions routinely have inline object types in their
 * parameters and return types (`input: { jobId: string }`,
 * `Promise<{ id: string }>`), so the first `{` is often a type rather than the
 * body. That truncates the body to a type literal, the guard call falls
 * outside it, and a properly guarded action gets reported as unguarded. So
 * skip the parameter list by paren depth, then skip any generic return type
 * by angle depth.
 */
function bodyBraceIndex(source: string, parenIndex: number): number {
  let depth = 0
  let i = parenIndex
  for (; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1
    else if (source[i] === ')') {
      depth -= 1
      if (depth === 0) {
        i += 1
        break
      }
    }
  }
  let angle = 0
  for (; i < source.length; i += 1) {
    const char = source[i]
    if (char === '<') angle += 1
    else if (char === '>') angle -= 1
    else if (char === '{' && angle <= 0) return i
  }
  return -1
}

/** Body of the function whose opening brace is at `openBrace`. */
function bodyFrom(source: string, openBrace: number): string {
  let depth = 0
  for (let i = openBrace; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(openBrace, i + 1)
    }
  }
  return source.slice(openBrace)
}

type FnDecl = { name: string; exported: boolean; body: string }

function parseFunctions(source: string): FnDecl[] {
  const decls: FnDecl[] = []
  const pattern = /(export\s+)?async\s+function\s+([A-Za-z0-9_]+)\s*\(/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    const parenIndex = match.index + match[0].length - 1
    const openBrace = bodyBraceIndex(source, parenIndex)
    if (openBrace === -1) continue
    decls.push({
      name: match[2],
      exported: Boolean(match[1]),
      body: bodyFrom(source, openBrace),
    })
  }
  return decls
}

/**
 * A function reaches a guard if it calls one directly, or calls a local
 * helper that reaches one. Several action files funnel their authorization
 * through a small local `actor()` helper, so a direct-call-only check would
 * report false failures for them.
 */
function guardedNames(decls: FnDecl[]): Set<string> {
  const guarded = new Set<string>()
  for (const decl of decls) {
    if (DIRECT_GUARDS.some((guard) => decl.body.includes(`${guard}(`))) {
      guarded.add(decl.name)
    }
  }
  let grew = true
  while (grew) {
    grew = false
    for (const decl of decls) {
      if (guarded.has(decl.name)) continue
      const callsGuardedHelper = decls.some(
        (other) => guarded.has(other.name) && decl.body.includes(`${other.name}(`),
      )
      if (callsGuardedHelper) {
        guarded.add(decl.name)
        grew = true
      }
    }
  }
  return guarded
}

const actionFiles = findActionFiles(RECRUITMENT_ACTIONS_DIR)

describe('recruitment server action guard coverage', () => {
  it('finds the recruitment action files', () => {
    // If the module is ever moved, every assertion below would vacuously pass
    // on an empty list. Fail loudly instead.
    assert.ok(
      actionFiles.length >= 10,
      `expected the recruitment action files, found ${actionFiles.length}`,
    )
  })

  for (const file of actionFiles) {
    const relative = file.slice(file.indexOf('src/'))
    const source = readFileSync(file, 'utf8')
    const decls = parseFunctions(source)
    const guarded = guardedNames(decls)
    const exported = decls.filter((decl) => decl.exported)

    it(`${relative} exports at least one action`, () => {
      assert.ok(exported.length > 0, `no exported actions parsed from ${relative}`)
    })

    for (const action of exported) {
      it(`${relative}: ${action.name} reaches an authorization guard`, () => {
        assert.ok(
          guarded.has(action.name),
          `${action.name} in ${relative} never reaches one of ` +
            `[${DIRECT_GUARDS.join(', ')}]. A server action without an ` +
            `authorization guard is callable by anyone who can reach the route.`,
        )
      })
    }
  }
})

/**
 * Record-scoped surfaces must not settle for a capability check.
 *
 * `requirePermission` proves the caller holds a permission; it says nothing
 * about whether this particular record is theirs. For entity-scoped surfaces
 * that is the difference between "a recruiter" and "the recruiter on this
 * requisition". Settings, templates, career content and workforce planning are
 * genuinely organization-wide and are excluded deliberately.
 */
const RECORD_SCOPED_FILES = [
  'applications/actions.ts',
  'candidates/actions.ts',
  'interviews/actions.ts',
  'offers/actions.ts',
  'requisitions/actions.ts',
  'assessments/actions.ts',
]

describe('record-scoped recruitment surfaces use record scope', () => {
  for (const suffix of RECORD_SCOPED_FILES) {
    const file = actionFiles.find((candidate) => candidate.endsWith(suffix))

    it(`${suffix} exists`, () => {
      assert.ok(file, `expected a recruitment action file at ${suffix}`)
    })

    if (!file) continue
    const source = readFileSync(file, 'utf8')

    it(`${suffix} scopes to a record, not just a capability`, () => {
      assert.ok(
        source.includes('requireRecruitmentAccess('),
        `${suffix} handles record-scoped data but never calls ` +
          `requireRecruitmentAccess, so it can only be checking capability.`,
      )
      assert.ok(
        /entityType:\s*'(requisition|job|candidate|application|interview|assessment|offer)'/.test(
          source,
        ),
        `${suffix} calls requireRecruitmentAccess without naming an entity ` +
          `type, which skips the record-scope branch entirely.`,
      )
    })
  }
})
