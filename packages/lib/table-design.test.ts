import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { opusTableClass } from './table-design'

const css = readFileSync(new URL('./styles/tables.css', import.meta.url), 'utf8')

test('returns the shared table class', () => {
  assert.equal(opusTableClass(), 'opus-table')
})

test('keeps the approved table geometry and OpusFesta colours in the shared contract', () => {
  assert.match(css, /--opus-table-shell: #f7f7f7;/)
  assert.match(css, /--opus-table-hover: #fcf7ff;/)
  assert.match(css, /--opus-table-selected: #f0dff6;/)
  assert.match(css, /--opus-table-selection-accent: #7e5896;/)
  assert.match(css, /--opus-table-focus: #c9a0dc;/)
  assert.match(css, /--opus-table-heading: #1a1a1a;/)
  assert.match(css, /--opus-table-divider: rgb\(26 26 26 \/ 10%\);/)
  assert.match(css, /padding: 0\.5rem;/)
  assert.match(css, /border-radius: var\(--opus-radius-large, 1\.5rem\) !important;/)
  assert.match(css, /height: 3rem;/)
  assert.match(css, /height: 4\.75rem;/)
  assert.match(css, /padding: 1rem 0\.5rem;/)
})

test('allows row backgrounds while keeping shared hover and selected states', () => {
  assert.match(css, /--opus-table-row-background, var\(--opus-table-surface\)/)
  assert.match(css, /background-color: inherit;/)
  assert.match(css, /\[data-highlighted='true'\]/)
  assert.doesNotMatch(css, /background: var\(--opus-table-surface\)/)
})
