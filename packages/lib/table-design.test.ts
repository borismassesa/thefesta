import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { opusTableClass } from './table-design'

const css = readFileSync(new URL('./styles/tables.css', import.meta.url), 'utf8')

test('returns the shared table class', () => {
  assert.equal(opusTableClass(), 'opus-table')
})

test('keeps the compact admin table contract and OpusFesta colours', () => {
  assert.match(css, /--opus-table-shell: #ffffff;/)
  assert.match(css, /--opus-table-hover: #fbf8fd;/)
  assert.match(css, /--opus-table-selected: #f0dff6;/)
  assert.match(css, /--opus-table-selection-accent: #7e5896;/)
  assert.match(css, /--opus-table-focus: #c9a0dc;/)
  assert.match(css, /--opus-table-heading: #6b7280;/)
  assert.match(css, /--opus-table-divider: #f3f4f6;/)
  assert.match(css, /font-size: 0\.75rem;/)
  assert.match(css, /border-collapse: collapse;/)
  assert.match(css, /padding: 0\.5rem 0\.75rem;/)
  assert.doesNotMatch(css, /height: 4\.75rem;/)
  assert.doesNotMatch(css, /font-family: Inter/)
})

test('allows row backgrounds while keeping shared hover and selected states', () => {
  assert.match(css, /--opus-table-row-background, var\(--opus-table-surface\)/)
  assert.match(css, /background-color: inherit;/)
  assert.match(css, /\[data-highlighted='true'\]/)
})
