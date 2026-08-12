import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  alignElementsToBounds,
  alignTransformInBounds,
  applyCardStarterToPage,
  boundsFromPathD,
  CARD_STARTERS,
  compileDocument,
  createBlankDocument,
  createRegistrySampleData,
  createShapeElement,
  createTextElement,
  filterCardFields,
  fitText,
  getCardStarter,
  importSvgArtwork,
  applySolidFillToSvgMarkup,
  isArtworkRoot,
  isLayerVisibleInView,
  personalizePlan,
  recenterContentAfterResize,
  renderDocumentPreviewSvg,
  resolveCardField,
  selectionBounds,
  ungroupSvgGraphic,
  validateDocument,
  TEST_DATA_PRESETS,
} from './index'

describe('design-engine', () => {
  it('creates a blank document and compiles a render plan', () => {
    const doc = createBlankDocument({ name: 'Test card' })
    doc.pages[0].elements.push(
      createTextElement({
        name: 'Guest',
        content: '{{guest.full_name}}',
        binding: {
          type: 'variable',
          path: 'guest.full_name',
          role: 'guest_name',
          fallback: 'Guest',
        },
        layout: {
          fit: 'shrink_wrap',
          minFontSize: 20,
          maxLines: 2,
          overflow: 'block',
          verticalAlign: 'middle',
        },
        transform: { x: 100, y: 500, width: 880, height: 100, rotation: 0, scaleX: 1, scaleY: 1 },
      }),
    )
    const plan = compileDocument(doc)
    assert.equal(plan.pages.length, 1)
    assert.ok(plan.pages[0].elements.some((e) => e.type === 'text'))
  })

  it('binary-searches font size for long names', () => {
    const result = fitText({
      text: 'Prof. Dr. Emmanuel Christopher Mwakyusa & Family',
      boxWidth: 400,
      boxHeight: 100,
      preferredFontSize: 52,
      minFontSize: 18,
      maxLines: 2,
      lineHeight: 1.1,
      fit: 'shrink_wrap',
      overflow: 'block',
    })
    assert.equal(result.status, 'fit')
    assert.ok(result.fontSize < 52)
    assert.ok(result.fontSize >= 18)
  })

  it('personalizes guest data and blocks unfit names when required', () => {
    const doc = createBlankDocument()
    doc.pages[0].elements.push(
      createTextElement({
        name: 'Guest Name',
        content: '{{guest.full_name}}',
        binding: {
          type: 'variable',
          path: 'guest.full_name',
          role: 'guest_name',
        },
        typography: {
          fontFamily: 'Cormorant Garamond',
          fontWeight: 600,
          fontSize: 48,
          lineHeight: 1.05,
          letterSpacing: 0,
          textAlign: 'center',
          color: '#111',
          opacity: 1,
          uppercase: false,
          italic: false,
          underline: false,
        },
        layout: {
          fit: 'shrink',
          minFontSize: 40,
          maxLines: 1,
          overflow: 'block',
          verticalAlign: 'middle',
        },
        transform: { x: 100, y: 500, width: 200, height: 50, rotation: 0, scaleX: 1, scaleY: 1 },
      }),
    )
    const long = TEST_DATA_PRESETS.find((p) => p.key === 'longest')!.data
    const personalized = personalizePlan(doc, long)
    assert.equal(personalized.blocked, true)
  })

  it('path bounds respect relative h/v (Illustrator outlined text)', () => {
    // Naive "pair every number as x,y" would treat v-.82 / h2.82 as points near 0
    // and inflate the box to cover the top-left of the artboard.
    const d =
      'M473.05,381.31v-.82h2.82v1.12h-.21l-2.62-.3ZM476.09,392.77l2.62.3v.82h-5.67v-.82l2.62-.3h.43z'
    const box = boundsFromPathD(d)
    assert.ok(box)
    assert.ok(box!.x > 450, `expected x near glyph, got ${box!.x}`)
    assert.ok(box!.y > 360, `expected y near glyph, got ${box!.y}`)
    assert.ok(box!.width < 40, `expected tight width, got ${box!.width}`)
    assert.ok(box!.height < 40, `expected tight height, got ${box!.height}`)
  })

  it('recolors baked Illustrator path fills in SVG markup', () => {
    const markup =
      '<path d="M10 10h5" fill="#1a1a1a"/><path d="M20 20h5" style="fill:#c4a484"/><path d="M30 30h5" fill="none"/><path d="M40 40h5" fill="url(#grad)"/>'
    const next = applySolidFillToSvgMarkup(markup, '#7E5896')
    assert.ok(next.includes('fill="#7E5896"'))
    assert.ok(next.includes('fill:#7E5896') || next.includes('fill: #7E5896'))
    assert.ok(next.includes('fill="none"'))
    assert.ok(next.includes('fill="url(#grad)"'))
  })

  it('recolors Illustrator class fills inside <style> blocks', () => {
    const markup = `<svg><style type="text/css">.st0{fill:#1A1A1A;}.st1{fill:none;}.st2{fill:url(#g);}</style><path class="st0" d="M0 0h1v1"/></svg>`
    const next = applySolidFillToSvgMarkup(markup, '#c4a484')
    assert.ok(next.includes('fill: #c4a484') || next.includes('fill:#c4a484'))
    assert.ok(next.includes('fill:none') || next.includes('fill: none'))
    assert.ok(next.includes('url(#g)'))
    // Inline style on the path must win over leftover class rules
    assert.ok(/class="st0"[^>]*style="[^"]*fill:#c4a484/i.test(next) || /style="[^"]*fill:#c4a484[^"]*"[^>]*class="st0"/i.test(next) || next.includes('fill="#c4a484"'))
  })

  it('detects Illustrator background artwork roots and hides them in view mode', () => {
    const pageW = 1024
    const pageH = 1536
    const bg = {
      id: 'bg',
      type: 'group' as const,
      name: 'Background_xA0_Image',
      parentId: null,
      children: ['path1'],
      locked: false,
      visible: true,
      opacity: 1,
      transform: { x: 0, y: 0, width: 1024, height: 1536, rotation: 0, scaleX: 1, scaleY: 1 },
    }
    const path1 = {
      id: 'path1',
      type: 'svg_graphic' as const,
      name: 'Path 1',
      parentId: 'bg',
      kind: 'path' as const,
      locked: false,
      visible: true,
      opacity: 1,
      transform: { x: 10, y: 10, width: 100, height: 100, rotation: 0, scaleX: 1, scaleY: 1 },
    }
    const text = {
      id: 'hosts',
      type: 'group' as const,
      name: 'hosts_x5F_intro',
      parentId: null,
      children: [],
      locked: false,
      visible: true,
      opacity: 1,
      transform: { x: 100, y: 200, width: 400, height: 40, rotation: 0, scaleX: 1, scaleY: 1 },
    }
    const els = [bg, path1, text] as unknown as import('./schema').DesignElement[]
    assert.equal(isArtworkRoot(bg as never, pageW, pageH), true)
    assert.equal(isArtworkRoot(text as never, pageW, pageH), false)
    assert.equal(
      isLayerVisibleInView(path1 as never, els, pageW, pageH, {
        hideArtwork: true,
        soloId: null,
      }),
      false,
    )
    assert.equal(
      isLayerVisibleInView(text as never, els, pageW, pageH, {
        hideArtwork: true,
        soloId: null,
      }),
      true,
    )
    assert.equal(
      isLayerVisibleInView(path1 as never, els, pageW, pageH, {
        hideArtwork: false,
        soloId: 'hosts',
      }),
      false,
    )
    assert.equal(
      isLayerVisibleInView(text as never, els, pageW, pageH, {
        hideArtwork: false,
        soloId: 'hosts',
      }),
      true,
    )
  })

  it('imports outlined-text groups with tight selection boxes', () => {
    const svg = `<svg viewBox="0 0 1024 1536" xmlns="http://www.w3.org/2000/svg">
      <g id="hosts_x5F_intro">
        <g id="Group_5">
          <path d="M473.05,381.31v-.82h2.82v1.12h-.21l-2.62-.3z" fill="#1a1a1a"/>
          <path d="M487.14,388.63c.84-.3,2.11-.66,3.11-.84v.73c-.9.18-2.08.56-2.68.8z" fill="#1a1a1a"/>
        </g>
      </g>
    </svg>`
    const report = importSvgArtwork({ svg, assetUrl: 'https://example.com/ai.svg' })
    const hosts = report.document.pages[0].elements.find(
      (e) => e.type === 'group' && e.name.includes('hosts'),
    )
    assert.ok(hosts)
    assert.ok(hosts!.transform.x > 400, `hosts x=${hosts!.transform.x}`)
    assert.ok(hosts!.transform.y > 350, `hosts y=${hosts!.transform.y}`)
    assert.ok(hosts!.transform.width < 120, `hosts w=${hosts!.transform.width}`)
    assert.ok(hosts!.transform.height < 80, `hosts h=${hosts!.transform.height}`)
  })

  it('imports svg as layered paths, groups, and text', () => {
    const svg = `<svg viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="1080" height="1350" fill="#faf7f2"/>
      <g id="decor">
        <path d="M100 100h200v50H100z" fill="#c4a484"/>
        <path d="M100 200h200v50H100z" fill="#8b6f5c"/>
      </g>
      <path d="M400 400h100v100H400z" fill="#1a1a1a"/>
      <text x="540" y="600" font-size="48">Mr &amp; Mrs Ngando</text>
    </svg>`
    const report = importSvgArtwork({
      svg,
      assetUrl: 'https://example.com/art.svg',
      assetId: 'asset_1',
    })
    assert.equal(report.mode, 'layered')
    assert.equal(report.imported.textObjects, 1)
    assert.ok(report.imported.layers >= 3)
    const els = report.document.pages[0].elements
    assert.ok(els.some((e) => e.type === 'text'))
    // Default: keep Illustrator tree — decor is a Group with nested paths
    const decor = els.find((e) => e.type === 'group' && e.name.includes('decor'))
    assert.ok(decor && decor.type === 'group')
    assert.equal(decor.children.length, 2)
    const nested = els.filter((e) => e.parentId === decor.id && e.type === 'svg_graphic')
    assert.equal(nested.length, 2)
    assert.ok(els.some((e) => e.type === 'svg_graphic' && e.markup?.includes('M400')))
    assert.ok(els.some((e) => e.type === 'artboard_background' && !e.isBasePlate))
  })

  it('can flatten groups when expandGroups is true', () => {
    const svg = `<svg viewBox="0 0 100 100"><g id="bundle"><path d="M0 0h1v1"/><path d="M2 2h1v1"/></g></svg>`
    const report = importSvgArtwork({
      svg,
      assetUrl: 'https://example.com/art.svg',
      expandGroups: true,
    })
    assert.equal(
      report.document.pages[0].elements.filter((e) => e.type === 'group').length,
      0,
    )
    assert.ok(
      report.document.pages[0].elements.filter((e) => e.type === 'svg_graphic').length >= 2,
    )
  })

  it('does not double-paint Illustrator text wrapped in transformed groups', () => {
    const svg = `<svg viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
      <rect x="80" y="120" width="920" height="1100" fill="#faf7f2"/>
      <g transform="matrix(1 0 0 1 540 280)">
        <text font-size="48" text-anchor="middle">Monalisa Samwel</text>
      </g>
      <path d="M100 400h200v40H100z" fill="#c4a484"/>
    </svg>`
    const report = importSvgArtwork({ svg, assetUrl: 'https://example.com/ai.svg' })
    const texts = report.document.pages[0].elements.filter((e) => e.type === 'text')
    assert.equal(texts.length, 1)
    assert.ok(texts[0]!.name.includes('Monalisa'))
    // Must not also keep a graphic that still contains the same <text>
    const graphicsWithText = report.document.pages[0].elements.filter(
      (e) => e.type === 'svg_graphic' && e.markup?.includes('<text'),
    )
    assert.equal(graphicsWithText.length, 0)
    // Position should reflect matrix translate (~540), not the old x-200 hack near 0
    assert.ok(texts[0]!.transform.x > 200)
    assert.ok(texts[0]!.transform.y > 100)
  })

  it('ungroups a kept svg_graphic group into child layers', () => {
    const report = importSvgArtwork({
      svg: `<svg viewBox="0 0 200 200"><g id="bundle"><path d="M10 10h20v20H10z"/><path d="M80 80h30v30H80z"/></g></svg>`,
      assetUrl: 'https://example.com/art.svg',
      expandGroups: true,
    })
    // Build a single svg_graphic group for ungroup helper (legacy path)
    const paths = report.document.pages[0].elements.filter((e) => e.type === 'svg_graphic')
    assert.ok(paths.length >= 2)
    const packed = {
      ...paths[0]!,
      kind: 'group' as const,
      markup: `<g id="bundle">${paths.map((p) => (p.type === 'svg_graphic' ? p.markup : '')).join('')}</g>`,
    }
    const kids = ungroupSvgGraphic(packed, 200, 200)
    assert.ok(kids)
    assert.ok(kids!.length >= 2)
  })

  it('plate_plus_text mode keeps locked base artwork', () => {
    const svg = `<svg viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
      <text x="540" y="600" font-size="48">Hello</text>
      <path d="M0 0h10v10H0z"/>
    </svg>`
    const report = importSvgArtwork({
      svg,
      assetUrl: 'https://example.com/art.svg',
      mode: 'plate_plus_text',
    })
    assert.equal(report.mode, 'plate_plus_text')
    assert.ok(report.document.pages[0].elements.some((e) => e.type === 'artboard_background' && e.isBasePlate))
  })

  it('renders layered svg_graphic markup in production SVG', () => {
    const report = importSvgArtwork({
      svg: `<svg viewBox="0 0 200 200"><path d="M10 10h20v20H10z" fill="red"/><text x="20" y="80" font-size="12">A</text></svg>`,
      assetUrl: 'https://example.com/x.svg',
    })
    const out = renderDocumentPreviewSvg(report.document, {})
    assert.equal(out.blocked, false)
    assert.ok(out.svg.includes('<path d="M10 10h20v20H10z"'))
  })

  it('preflight runs stress cases', () => {
    const doc = createBlankDocument()
    const result = validateDocument(doc)
    assert.ok(result.stress)
    assert.ok((result.stress?.total ?? 0) > 0)
  })

  it('aligns a single layer into frame safe inset', () => {
    const el = createShapeElement('rect', {
      transform: { x: 10, y: 20, width: 100, height: 40, rotation: 0, scaleX: 1, scaleY: 1 },
    })
    const next = alignTransformInBounds(
      el.transform,
      'center',
      { x: 0, y: 0, width: 400, height: 600 },
      48,
    )
    assert.equal(next.x, 48 + (400 - 96 - 100) / 2)
    assert.equal(next.y, 20)
  })

  it('aligns multi-select to selection bounds', () => {
    const a = createShapeElement('rect', {
      transform: { x: 0, y: 0, width: 40, height: 40, rotation: 0, scaleX: 1, scaleY: 1 },
    })
    const b = createShapeElement('rect', {
      transform: { x: 200, y: 10, width: 40, height: 40, rotation: 0, scaleX: 1, scaleY: 1 },
    })
    const box = selectionBounds([a, b])
    assert.ok(box)
    assert.equal(box!.width, 240)
    const aligned = alignElementsToBounds([a, b], 'right', box!, 0)
    assert.equal(aligned[0].transform.x, 200)
    assert.equal(aligned[1].transform.x, 200)
  })

  it('recenters content when the frame resizes', () => {
    const text = createTextElement({
      name: 'Title',
      content: 'Hello',
      transform: { x: 100, y: 200, width: 200, height: 40, rotation: 0, scaleX: 1, scaleY: 1 },
    })
    const bg = createBlankDocument().pages[0].elements.find((e) => e.type === 'artboard_background')!
    const next = recenterContentAfterResize(
      [bg, text],
      { width: 1080, height: 1350 },
      { width: 1080, height: 1920 },
    )
    const moved = next.find((e) => e.id === text.id)!
    assert.equal(moved.transform.x, 100)
    assert.equal(moved.transform.y, 200 + (1920 - 1350) / 2)
    const frame = next.find((e) => e.type === 'artboard_background')!
    assert.equal(frame.transform.height, 1920)
  })

  it('builds card starters with bound fields and no QR', () => {
    assert.ok(CARD_STARTERS.length >= 8)
    const starter = getCardStarter('wedding_ivory')
    assert.ok(starter)
    const page = applyCardStarterToPage(createBlankDocument().pages[0], starter!)
    assert.equal(page.width, 1080)
    assert.equal(page.height, 1350)
    const types = new Set(page.elements.map((e) => e.type))
    assert.equal(types.has('qr'), false)
    const bound = page.elements.filter(
      (e) => e.type === 'text' && e.binding?.type === 'variable' && e.binding.path,
    )
    assert.ok(bound.some((e) => e.type === 'text' && e.binding?.path === 'guest.full_name'))
    assert.ok(bound.some((e) => e.type === 'text' && e.binding?.path === 'couple.display_names'))
    assert.ok(bound.some((e) => e.type === 'text' && e.binding?.path === 'event.date'))
  })

  it('resolves registry fields as source and derived', () => {
    const data = createRegistrySampleData()
    assert.equal(resolveCardField(data, 'guest_name'), 'Mr & Mrs Praygod Mangi')
    assert.equal(resolveCardField(data, 'couple_display_name'), 'Joseph & Noela')
    const filtered = filterCardFields({
      cardType: 'invitation',
      eventType: 'wedding',
      kind: 'source',
    })
    assert.ok(filtered.some((f) => f.key === 'guest_name'))
    assert.ok(filtered.some((f) => f.key === 'groom_first_name'))
    assert.ok(!filtered.some((f) => f.key === 'minimum_contribution'))
  })
})
