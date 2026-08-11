import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const roots = [
  'apps/opus_admin/src',
  'apps/opus_website/src',
  'apps/opus_pass/src',
  'apps/vendors_portal/src',
]

const replacements = new Map([
  ['rounded-[10px]', 'rounded-[var(--opus-radius-small)]'],
  ['rounded-[12px]', 'rounded-[var(--opus-radius-small)]'],
  ['rounded-[18px]', 'rounded-[var(--opus-radius-medium)]'],
  ['rounded-[20px]', 'rounded-[var(--opus-radius-medium)]'],
  ['rounded-[24px]', 'rounded-[var(--opus-radius-large)]'],
  ['rounded-[28px]', 'rounded-[var(--opus-radius-large)]'],
  ['rounded-[30px]', 'rounded-[var(--opus-radius-xlarge)]'],
  ['rounded-[32px]', 'rounded-[var(--opus-radius-xlarge)]'],
  ['rounded-[36px]', 'rounded-[var(--opus-radius-xlarge)]'],
  ['rounded-[40px]', 'rounded-[var(--opus-radius-xlarge)]'],
  ['rounded-[60px]', 'rounded-[var(--opus-radius-xlarge)]'],
  ['rounded-[2rem]', 'rounded-[var(--opus-radius-xlarge)]'],
])

const files = execFileSync('rg', [
  '--files',
  ...roots,
  '-g', '*.tsx',
  '-g', '*.jsx',
  '-g', '*.ts',
  '-g', '*.css',
  '-g', '*.scss',
], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)

let changedFiles = 0
let replacementsMade = 0

function radiusToken(pixelValue) {
  if (pixelValue < 5 || pixelValue > 60) return null
  if (pixelValue <= 12) return '--opus-radius-small'
  if (pixelValue <= 20) return '--opus-radius-medium'
  if (pixelValue <= 28) return '--opus-radius-large'
  return '--opus-radius-xlarge'
}

for (const file of files) {
  const source = readFileSync(file, 'utf8')
  let next = source
  for (const [legacy, tokenized] of replacements) {
    const parts = next.split(legacy)
    if (parts.length === 1) continue
    replacementsMade += parts.length - 1
    next = parts.join(tokenized)
  }

  /* Normalize product-owned CSS and CSS-in-JSX declarations. Tiny decorative
   * particles (1–4px), percentages, and true pill values stay untouched. */
  if (/\.(?:tsx|jsx|css|scss)$/.test(file) && !file.includes('/tiptap-')) {
    next = next.replace(/border-radius:(\s*)(\d+(?:\.\d+)?)(px|rem)\b/g, (match, space, amount, unit) => {
      const pixels = Number(amount) * (unit === 'rem' ? 16 : 1)
      const token = radiusToken(pixels)
      if (!token) return match
      replacementsMade += 1
      return `border-radius:${space}var(${token})`
    })
  }
  if (next === source) continue
  writeFileSync(file, next)
  changedFiles += 1
}

console.log(JSON.stringify({ changedFiles, replacementsMade }, null, 2))
