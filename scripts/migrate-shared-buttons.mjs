import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import ts from 'typescript'

const roots = [
  'apps/opus_admin/src',
  'apps/opus_website/src',
  'apps/opus_pass/src',
  'apps/vendors_portal/src',
]
const refresh = process.argv.includes('--refresh')

const files = execFileSync('rg', ['--files', ...roots, '-g', '*.tsx', '-g', '*.jsx'], {
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter(Boolean)

const controlPattern = /(?:role\s*=\s*['"](?:tab|switch|option|menuitem|radio)['"]|aria-(?:pressed|expanded|haspopup|controls)\s*=|fixed\s+inset-0|\b(?:swatch|toggle|tab|tstat|segmented|segment|sg|xbtn|icon-only|carousel|pagination|stepper|calendar-day)\b)/i
const dangerPattern = /(?:danger|destructive|delete|remove|bg-(?:red|rose)-|text-(?:red|rose)-)/i
const warningPattern = /(?:warning|bg-(?:amber|yellow)-|text-(?:amber|yellow)-)/i
const primaryPattern = /(?:bg-\[#(?:C9A0DC|c9a0dc|1A1A1A|1a1a1a)\]|bg-\(--accent\)|bg-(?:black|gray-900|neutral-900|purple-|violet-)|\b(?:primary|solid|pri|send|save|submit|cta)\b)/i
const secondaryPattern = /(?:bg-\[#(?:F0DFF6|f0dff6)\]|\bsecondary\b)/i
const neutralPattern = /(?:\b(?:outline|neutral)\b|border-\[#(?:C9A0DC|c9a0dc)\]|bg-white[^\n]*(?:border|ring)|(?:border|ring)[^\n]*bg-white)/i
const tertiaryPattern = /(?:\b(?:ghost|linkbtn|tertiary)\b|bg-transparent)/i
const actionGeometryPattern = /(?:\bpx-|\bpy-|\bp-[2-9]|\bh-(?:8|9|10|11|12|13|14|\[)|rounded-(?:md|lg|xl|2xl|full))/i

function staticAttribute(opening, name) {
  const attribute = opening.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.text === name,
  )
  if (!attribute || !ts.isJsxAttribute(attribute) || !attribute.initializer) return null
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text
  return attribute.initializer.getText(opening.getSourceFile())
}

function hasAttribute(opening, name) {
  return opening.attributes.properties.some(
    (property) => ts.isJsxAttribute(property) && property.name.text === name,
  )
}

function visibleContent(opening) {
  const parent = opening.parent
  if (!ts.isJsxElement(parent)) return ''
  return parent.children
    .map((child) => child.getText(opening.getSourceFile()))
    .join(' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function rawContent(opening) {
  const parent = opening.parent
  if (!ts.isJsxElement(parent)) return ''
  return parent.children.map((child) => child.getText(opening.getSourceFile())).join(' ')
}

function classify(opening) {
  const sourceFile = opening.getSourceFile()
  const openingText = opening.getText(sourceFile)
  const className = staticAttribute(opening, 'className') ?? ''
  const type = staticAttribute(opening, 'type')?.replace(/[{}'"`]/g, '')
  const role = staticAttribute(opening, 'role')?.replace(/[{}'"`]/g, '')
  const content = visibleContent(opening)
  const rawChildren = rawContent(opening)
  const labelledIcon = hasAttribute(opening, 'aria-label') && content.length === 0
  const iconOnly = content.length === 0 && /<[A-Z][\w.]*(?:\s|\/|>)/.test(rawChildren)

  if (
    role && ['tab', 'switch', 'option', 'menuitem', 'radio'].includes(role) ||
    labelledIcon ||
    iconOnly ||
    controlPattern.test(openingText)
  ) {
    return { variant: 'control' }
  }

  const explicitFormAction = type === 'submit' || type === 'reset'
  const visuallyActionable = actionGeometryPattern.test(className) &&
    (primaryPattern.test(className) || secondaryPattern.test(className) || neutralPattern.test(className) ||
      tertiaryPattern.test(className) || dangerPattern.test(className) || warningPattern.test(className))

  if (!explicitFormAction && !visuallyActionable) return { variant: 'control' }

  let variant = 'primary'
  if (dangerPattern.test(className + content)) variant = 'danger'
  else if (warningPattern.test(className + content)) variant = 'warning'
  else if (tertiaryPattern.test(className)) variant = 'tertiary'
  else if (neutralPattern.test(className) || type === 'reset') variant = 'neutral'
  else if (secondaryPattern.test(className)) variant = 'secondary'

  let size = 'medium'
  if (iconOnly) size = /\b(?:h-6|w-6|size-6|h-7|w-7|size-7)\b/.test(className) ? 'icon-small' : 'icon-medium'
  else if (/\b(?:h-12|h-13|h-14|py-3|py-3\.5|text-base)\b/.test(className)) size = 'large'
  else if (/\b(?:h-6|h-7|h-8|px-2|py-1|py-1\.5|text-xs)\b/.test(className)) size = 'small'

  return { variant, size }
}

let changedFiles = 0
let classifiedActions = 0
let classifiedControls = 0

for (const file of files) {
  const originalSource = readFileSync(file, 'utf8')
  const source = refresh
    ? originalSource.replace(/ data-opus-button="(?:primary|secondary|neutral|danger|warning|tertiary|control)"(?: data-opus-button-size="(?:large|medium|small|icon-medium|icon-small)")?/g, '')
    : originalSource
  const scriptKind = file.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.TSX
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind)
  const insertions = []

  function visit(node) {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(sourceFile) === 'button' &&
      !hasAttribute(node, 'data-opus-button') &&
      !/(?:opusButtonClass|buttonVariants)/.test(node.getText(sourceFile))
    ) {
      const result = classify(node)
      const marker = result.variant === 'control'
        ? ' data-opus-button="control"'
        : ` data-opus-button="${result.variant}" data-opus-button-size="${result.size}"`
      insertions.push({ position: node.tagName.end, marker })
      if (result.variant === 'control') classifiedControls += 1
      else classifiedActions += 1
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  if (insertions.length === 0) {
    if (source !== originalSource) {
      writeFileSync(file, source)
      changedFiles += 1
    }
    continue
  }

  let next = source
  for (const insertion of insertions.sort((a, b) => b.position - a.position)) {
    next = next.slice(0, insertion.position) + insertion.marker + next.slice(insertion.position)
  }
  if (next !== originalSource) {
    writeFileSync(file, next)
    changedFiles += 1
  }
}

console.log(JSON.stringify({ changedFiles, classifiedActions, classifiedControls }, null, 2))
