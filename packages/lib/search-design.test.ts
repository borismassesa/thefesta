import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { opusSearchClass } from './search-design'

const css = readFileSync(new URL('./styles/search.css', import.meta.url), 'utf8')

test('returns the shared search field class by default', () => {
  assert.equal(opusSearchClass(), 'opus-search')
})

test('supports controls that render their own clear action', () => {
  assert.equal(opusSearchClass({ customClear: true }), 'opus-search opus-search--custom-clear')
})

test('keeps the approved search geometry and interaction colours in the shared contract', () => {
  assert.match(css, /--opus-search-border: #868685;/)
  assert.match(css, /--opus-search-focus: #173301;/)
  assert.match(css, /height: 3rem;/)
  assert.match(css, /padding: 0\.75rem 1rem 0\.75rem 3rem;/)
  assert.match(css, /border-radius: var\(--opus-radius-large, 1\.5rem\);/)
  assert.match(css, /font-size: 1rem;/)
  assert.match(css, /line-height: 1\.5rem;/)
  assert.match(css, /border: 3px solid var\(--opus-search-focus\);/)
})
