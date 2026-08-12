import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import { opusButtonClass, type OpusButtonSize, type OpusButtonVariant } from './button-design'

const buttonCss = readFileSync(new URL('./styles/buttons.css', import.meta.url), 'utf8')
const workspaceRoot = new URL('../../', import.meta.url)
const appRoots = [
  'apps/opus_admin/src',
  'apps/opus_website/src',
  'apps/opus_pass/src',
  'apps/vendors_portal/src',
]

test('uses the medium lavender primary button by default', () => {
  assert.equal(opusButtonClass(), 'opus-button opus-button--primary opus-button--medium')
})

test('returns every supported variant and size as stable design-system classes', () => {
  const variants: OpusButtonVariant[] = ['primary', 'secondary', 'neutral', 'danger', 'warning', 'tertiary']
  const sizes: OpusButtonSize[] = ['large', 'medium', 'small', 'icon-medium', 'icon-small']

  for (const variant of variants) {
    for (const size of sizes) {
      assert.equal(
        opusButtonClass({ variant, size }),
        `opus-button opus-button--${variant} opus-button--${size}`,
      )
    }
  }
})

test('supports shared action attributes and specialized control buttons', () => {
  assert.match(buttonCss, /button\[data-opus-button='primary'\]/)
  assert.match(buttonCss, /button\[data-opus-button='control'\]/)
  assert.match(buttonCss, /button\[data-opus-button-size='icon-small'\]/)
})

test('all four product apps import the shared button stylesheet', () => {
  const globalStyles = [
    'apps/opus_admin/src/app/globals.css',
    'apps/opus_website/src/app/globals.css',
    'apps/opus_pass/src/app/globals.css',
    'apps/vendors_portal/src/app/globals.css',
  ]

  for (const file of globalStyles) {
    const css = readFileSync(new URL(file, workspaceRoot), 'utf8')
    assert.match(css, /@opusfesta\/lib\/styles\/buttons\.css/, file)
  }
})

test('every native product button is explicitly classified by the shared system', () => {
  const files = execFileSync('rg', ['--files', ...appRoots, '-g', '*.tsx', '-g', '*.jsx'], {
    cwd: workspaceRoot,
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean)
  const missing: string[] = []

  for (const file of files) {
    const source = readFileSync(new URL(file, workspaceRoot), 'utf8')
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

    function visit(node: ts.Node) {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        node.tagName.getText(sourceFile) === 'button'
      ) {
        const opening = node.getText(sourceFile)
        if (!/(?:data-opus-button|opusButtonClass|buttonVariants)/.test(opening)) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
          missing.push(`${file}:${position.line + 1}`)
        }
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }

  assert.deepEqual(missing, [])
})
