/**
 * Adversarial test suite for the commission SVG validator.
 *
 *   npx tsx scripts/test-commission-svg.ts
 *
 * This file is mostly attacks. The validator is a trust boundary — the files it
 * passes get served to hundreds of wedding guests — so proving it accepts a
 * good card is the small half of the job. Proving it FAILS CLOSED against
 * script injection, exfiltration, entity expansion and parser-differential
 * tricks is the point.
 *
 * Every attack case asserts a specific error code, not merely "rejected". A
 * payload rejected for the wrong reason is a payload that will slip through the
 * moment that unrelated reason stops applying.
 */

import {
  MAX_SVG_BYTES,
  blockingErrors,
  validateCommissionSvg,
  watermarkSvg,
} from '../packages/lib/commission-svg'

let passed = 0
const failures: string[] = []

function ok(condition: boolean, label: string): void {
  if (condition) {
    passed++
    console.log(`  PASS  ${label}`)
  } else {
    failures.push(label)
    console.log(`  FAIL  ${label}`)
  }
}

/** Assert the payload is rejected, AND rejected for the stated reason. */
function rejects(svg: string, code: string, label: string): void {
  const report = validateCommissionSvg(svg)
  const codes = blockingErrors(report).map((f) => f.code)
  ok(!report.ok && codes.includes(code), `${label} → ${code}${report.ok ? ' (WAS ACCEPTED)' : ` (got: ${codes.join(', ') || 'none'})`}`)
}

const FONT = '@font-face{font-family:"Playfair";src:url(data:font/woff2;base64,AAAA)}'

/** A minimal card that must pass, so the suite proves the validator is usable. */
function goodCard(extra = '', opts = { font: true }): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350"
     data-op-card-version="1" data-op-category="wedding">
  <defs>${opts.font ? `<style>${FONT}</style>` : ''}</defs>
  <rect x="0" y="0" width="1080" height="1350" fill="#FDF8F5"/>
  <text data-op-field="guest_name" data-op-max-chars="28" data-op-fit="shrink" x="540" y="700">Guest Name</text>
  <text data-op-field="event_date" data-op-max-chars="24" x="540" y="800">14 Machi 2027</text>
  <rect data-op-slot="qr" x="430" y="1000" width="220" height="220"/>
  <g data-op-swatches><rect data-op-swatch="primary" fill="#4A2D5C"/></g>
  ${extra}
</svg>`
}

console.log('\n─── the happy path ───')
{
  const report = validateCommissionSvg(goodCard(), { requireQrSlot: true })
  ok(report.ok, `a well-formed card passes${report.ok ? '' : ` — ${blockingErrors(report).map((f) => f.code).join(', ')}`}`)
  ok(report.schema.fields.length === 2, 'both fields are extracted into the layer schema')
  ok(report.schema.viewBox?.width === 1080, 'the viewBox is parsed')
  ok(report.schema.slots.includes('qr'), 'the QR slot is recorded')
  ok(report.schema.swatches.length === 1, 'colour swatches are recorded')
  ok(report.schema.embeddedFonts === 1, 'the embedded font is counted')
  ok(report.schema.cardVersion === '1', 'the card version is read')
}

console.log('\n─── script execution (L10) ───')
rejects(goodCard('<script>alert(1)</script>'), 'forbidden_element', 'a <script> element')
rejects(goodCard('<ScRiPt>alert(1)</ScRiPt>'), 'forbidden_element', 'a case-mangled <ScRiPt>')
rejects(goodCard('<foreignObject><body/></foreignObject>'), 'forbidden_element', 'HTML smuggled via <foreignObject>')
rejects(goodCard('<rect onload="alert(1)" x="0" y="0" width="1" height="1"/>'), 'event_handler', 'an onload handler')
rejects(goodCard('<rect ONLOAD="alert(1)" x="0" y="0" width="1" height="1"/>'), 'event_handler', 'an uppercase ONLOAD handler')
rejects(goodCard('<rect onmouseover="x()" x="0" y="0" width="1" height="1"/>'), 'event_handler', 'an onmouseover handler')
rejects(goodCard('<animate attributeName="x" onbegin="x()"/>'), 'forbidden_element', 'an <animate> element')
rejects(goodCard('<use href="javascript:alert(1)"/>'), 'external_reference', 'a javascript: URL')
rejects(
  goodCard('<use href="&#106;avascript:alert(1)"/>'),
  'external_reference',
  'a numerically-encoded javascript: URL',
)
rejects(goodCard('<image href="data:text/html,<script>alert(1)</script>" width="1" height="1"/>'),
  'html_data_uri', 'a data:text/html payload')

console.log('\n─── exfiltration and phone-home ───')
rejects(goodCard('<image href="https://evil.example/track.png" width="1" height="1"/>'),
  'external_reference', 'an external image')
rejects(goodCard('<use xlink:href="http://evil.example/x.svg"/>'),
  'external_reference', 'an external xlink:href')
rejects(goodCard('<rect style="fill:url(https://evil.example/a.png)" x="0" y="0" width="1" height="1"/>'),
  'external_reference', 'an external url() in an inline style')
rejects(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350">
     <defs><style>@import url("https://evil.example/x.css");</style></defs>
     <text data-op-field="guest_name" data-op-max-chars="28">x</text></svg>`,
  'style_import', 'an @import in a <style> block',
)
rejects(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350">
     <defs><style>@font-face{font-family:"X";src:url(https://fonts.example/x.woff2)}</style></defs>
     <text data-op-field="guest_name" data-op-max-chars="28">x</text></svg>`,
  'external_font', 'an externally-hosted font',
)

console.log('\n─── entity expansion and XXE ───')
rejects(
  `<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350">
     <text data-op-field="guest_name" data-op-max-chars="28">&xxe;</text></svg>`,
  'unparseable', 'an XXE entity declaration',
)
rejects(
  `<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;">]>
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350"/>`,
  'unparseable', 'a billion-laughs expansion',
)

console.log('\n─── parser-differential tricks ───')
rejects(goodCard('<rect x=0 y=0 width=1 height=1/>'), 'unparseable', 'an unquoted attribute value')
rejects(
  goodCard('<image href="#safe" href="https://evil.example/x.png" width="1" height="1"/>'),
  'unparseable', 'a duplicated attribute smuggling a second value',
)
rejects(goodCard('<rect x="0" y="0" width="1" height="1"'), 'unparseable', 'an unterminated tag')
rejects(goodCard('<!-- unterminated'), 'unparseable', 'an unterminated comment')
rejects(goodCard('<blink/>'), 'unknown_element', 'an element that is simply not on the allow-list')
rejects(goodCard('<rect data-evil="1" x="0" y="0" width="1" height="1"/>'), 'unknown_attribute',
  'an attribute that is not on the allow-list')

console.log('\n─── the correctness rules (TDD §6.2) ───')
rejects(
  `<svg xmlns="http://www.w3.org/2000/svg"><text data-op-field="guest_name" data-op-max-chars="28">x</text></svg>`,
  'no_viewbox', 'a card with no viewBox',
)
rejects(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">
     <text data-op-field="guest_name" data-op-max-chars="28">x</text></svg>`,
  'bad_aspect', 'a square card (must be 4:5)',
)
rejects(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350"><rect x="0" y="0" width="1" height="1"/></svg>`,
  'no_guest_name', 'a card with no guest_name anchor',
)
rejects(
  goodCard('<text data-op-field="guest_name" data-op-max-chars="10" x="0" y="0">dup</text>'),
  'duplicate_guest_name', 'two guest_name anchors',
)
rejects(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350">
     <text data-op-field="guest_name">x</text></svg>`,
  'missing_max_chars', 'a field with no data-op-max-chars',
)
{
  const noQr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350">
     <text data-op-field="guest_name" data-op-max-chars="28">x</text></svg>`
  const ticketed = validateCommissionSvg(noQr, { requireQrSlot: true })
  ok(
    blockingErrors(ticketed).some((f) => f.code === 'no_qr_slot'),
    'a ticketed category without a QR slot → no_qr_slot',
  )
  const untickted = validateCommissionSvg(noQr, { requireQrSlot: false })
  ok(
    !blockingErrors(untickted).some((f) => f.code === 'no_qr_slot'),
    'a non-ticketed category does not require a QR slot',
  )
}
{
  const huge = goodCard(`<!--${'x'.repeat(MAX_SVG_BYTES + 10)}-->`)
  const report = validateCommissionSvg(huge)
  ok(
    blockingErrors(report).some((f) => f.code === 'file_too_large'),
    'a file over 4 MB is rejected',
  )
}

console.log('\n─── warnings do not block ───')
{
  const report = validateCommissionSvg(goodCard('', { font: false }), { requireQrSlot: true })
  ok(report.ok, 'a card with no embedded font still passes')
  ok(
    report.findings.some((f) => f.severity === 'warning' && f.code === 'no_embedded_font'),
    'but it warns, because the compositor will substitute a different face',
  )
}

console.log('\n─── watermarking (L14) ───')
{
  const marked = watermarkSvg(goodCard())
  ok(marked.includes('data-op-watermark="true"'), 'the watermark layer is injected')
  ok(marked.endsWith('</svg>'), 'the document stays well-formed')
  ok(
    (marked.match(/<pattern/g) ?? []).length === 1,
    'the mark is a repeating pattern across the artwork, not a corner stamp',
  )
  ok(
    validateCommissionSvg(marked, { requireQrSlot: true }).ok,
    'a watermarked card still validates, so previews can be re-checked',
  )
  const injected = watermarkSvg(goodCard(), '</text><script>alert(1)</script>')
  ok(
    !injected.includes('<script>'),
    'a hostile watermark label cannot inject markup',
  )
}

console.log('')
if (failures.length > 0) {
  console.error(`SVG validator: ${failures.length} FAILED of ${passed + failures.length}`)
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log(`SVG validator: all ${passed} assertions passed.`)
