import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { opusRadiusClass, type OpusRadiusSize } from './radius-design'

const css = readFileSync(new URL('./styles/radius.css', import.meta.url), 'utf8')
const workspaceRoot = new URL('../../', import.meta.url)

test('exposes the approved four-step radius scale plus round geometry', () => {
  assert.match(css, /--opus-radius-small: 0\.5rem;/)
  assert.match(css, /--opus-radius-medium: 1rem;/)
  assert.match(css, /--opus-radius-large: 1\.5rem;/)
  assert.match(css, /--opus-radius-xlarge: 2rem;/)
  assert.match(css, /--opus-radius-round: 9999px;/)
})

test('returns stable shared radius classes', () => {
  const sizes: OpusRadiusSize[] = ['small', 'medium', 'large', 'xlarge', 'round']
  for (const size of sizes) assert.equal(opusRadiusClass(size), `opus-radius--${size}`)
})

test('maps Tailwind radius names onto the approved scale', () => {
  assert.match(css, /--radius-lg: var\(--opus-radius-small\);/)
  assert.match(css, /--radius-2xl: var\(--opus-radius-medium\);/)
  assert.match(css, /--radius-3xl: var\(--opus-radius-large\);/)
  assert.match(css, /--radius-4xl: var\(--opus-radius-xlarge\);/)
})

test('all four product apps import the shared radius stylesheet', () => {
  const globalStyles = [
    'apps/opus_admin/src/app/globals.css',
    'apps/opus_website/src/app/globals.css',
    'apps/opus_pass/src/app/globals.css',
    'apps/vendors_portal/src/app/globals.css',
  ]

  for (const file of globalStyles) {
    const appCss = readFileSync(new URL(file, workspaceRoot), 'utf8')
    assert.match(appCss, /@opusfesta\/lib\/styles\/radius\.css/, file)
  }
})

test('product UI does not reintroduce deprecated container radius values', () => {
  const appRoots = [
    'apps/opus_admin/src',
    'apps/opus_website/src',
    'apps/opus_pass/src',
    'apps/vendors_portal/src',
  ]
  const files = execFileSync('rg', [
    '--files',
    ...appRoots,
    '-g', '*.tsx',
    '-g', '*.jsx',
    '-g', '*.css',
    '-g', '*.scss',
  ], { cwd: workspaceRoot, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  const deprecated = /rounded-\[(?:10|12|18|20|24|28|30|32|36|40|60)px\]|rounded-\[2rem\]/
  const violations: string[] = []
  const legacyCssRadius = /border-radius:\s*(?:[5-9]|[1-5][0-9])(?:px|rem)\b/

  for (const file of files) {
    const source = readFileSync(new URL(file, workspaceRoot), 'utf8')
    if (deprecated.test(source)) violations.push(file)
    if (!file.includes('/tiptap-') && legacyCssRadius.test(source)) violations.push(file)
  }

  assert.deepEqual(violations, [])
})
