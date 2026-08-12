import { z } from 'zod'

import { newDocumentId, newElementId, newPageId } from './ids'
import { SHAPE_KINDS, type ShapeKind } from './shape-geometry'

export type { ShapeKind }

/** Schema version of persisted Design Documents. Bump on breaking changes. */
export const DESIGN_DOCUMENT_SCHEMA_VERSION = 1

export const designUnitSchema = z.enum(['px', 'mm', 'cm', 'in'])
export type DesignUnit = z.infer<typeof designUnitSchema>

export const fitPolicySchema = z.enum([
  'none',
  'shrink',
  'wrap',
  'shrink_wrap',
  'truncate',
  'block',
])
export type FitPolicy = z.infer<typeof fitPolicySchema>

export const overflowPolicySchema = z.enum(['block', 'warn', 'ellipsis', 'overflow'])
export type OverflowPolicy = z.infer<typeof overflowPolicySchema>

export const imageFitSchema = z.enum(['fill', 'fit', 'crop', 'original'])
export type ImageFit = z.infer<typeof imageFitSchema>

export const textAlignSchema = z.enum(['left', 'center', 'right', 'justify'])
export type TextAlign = z.infer<typeof textAlignSchema>

export const transformSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().default(0),
  scaleX: z.number().default(1),
  scaleY: z.number().default(1),
})
export type DesignTransform = z.infer<typeof transformSchema>

export const strokeAlignSchema = z.enum(['inside', 'center', 'outside'])
export type StrokeAlign = z.infer<typeof strokeAlignSchema>

export const designEffectSchema = z.object({
  id: z.string(),
  type: z.enum(['drop_shadow', 'inner_shadow', 'layer_blur']),
  visible: z.boolean().default(true),
  color: z.string().default('#000000'),
  opacity: z.number().min(0).max(1).default(0.25),
  offsetX: z.number().default(0),
  offsetY: z.number().default(4),
  blur: z.number().min(0).default(8),
  spread: z.number().default(0),
})
export type DesignEffect = z.infer<typeof designEffectSchema>

export const cornerRadiiSchema = z.object({
  tl: z.number().min(0).default(0),
  tr: z.number().min(0).default(0),
  br: z.number().min(0).default(0),
  bl: z.number().min(0).default(0),
})
export type CornerRadii = z.infer<typeof cornerRadiiSchema>

export const layoutGuideSchema = z.object({
  enabled: z.boolean().default(false),
  columns: z.number().int().min(1).max(24).default(12),
  gutter: z.number().min(0).default(20),
  margin: z.number().min(0).default(40),
  rows: z.number().int().min(0).max(24).default(0),
})
export type LayoutGuide = z.infer<typeof layoutGuideSchema>

export const autoLayoutSchema = z.object({
  enabled: z.boolean().default(false),
  direction: z.enum(['vertical', 'horizontal', 'wrap']).default('vertical'),
  gap: z.number().min(0).default(10),
  paddingX: z.number().min(0).default(10),
  paddingY: z.number().min(0).default(10),
  align: z.enum(['start', 'center', 'end']).default('start'),
  clipContent: z.boolean().default(false),
})
export type AutoLayout = z.infer<typeof autoLayoutSchema>

/** Shared visual props for shapes / frames / images. */
const visualStyleFields = {
  strokeAlign: strokeAlignSchema.optional(),
  effects: z.array(designEffectSchema).optional(),
  cornerRadii: cornerRadiiSchema.optional(),
}

export const typographySchema = z.object({
  fontFamily: z.string().default('Cormorant Garamond'),
  fontWeight: z.number().int().min(100).max(900).default(400),
  fontSize: z.number().positive().default(32),
  lineHeight: z.number().positive().default(1.2),
  letterSpacing: z.number().default(0),
  textAlign: textAlignSchema.default('center'),
  color: z.string().default('#1a1a1a'),
  opacity: z.number().min(0).max(1).default(1),
  uppercase: z.boolean().default(false),
  italic: z.boolean().default(false),
  underline: z.boolean().default(false),
  /** Pinned font asset / card_fonts id when known. */
  fontAssetId: z.string().nullable().optional(),
  fontVersion: z.string().nullable().optional(),
})
export type DesignTypography = z.infer<typeof typographySchema>

export const textLayoutSchema = z.object({
  fit: fitPolicySchema.default('shrink_wrap'),
  minFontSize: z.number().positive().default(18),
  maxLines: z.number().int().positive().default(3),
  overflow: overflowPolicySchema.default('block'),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).default('middle'),
})
export type TextLayout = z.infer<typeof textLayoutSchema>

export const bindingSchema = z
  .object({
    type: z.enum(['none', 'variable', 'asset']).default('none'),
    path: z.string().nullable().optional(),
    role: z.string().nullable().optional(),
    fallback: z.string().nullable().optional(),
  })
  .default({ type: 'none' })
export type DesignBinding = z.infer<typeof bindingSchema>

export const visibilityRuleSchema = z.object({
  path: z.string(),
  op: z.enum(['present', 'absent', 'equals', 'not_equals']),
  value: z.string().optional(),
})
export type VisibilityRule = z.infer<typeof visibilityRuleSchema>

export const assetRefSchema = z.object({
  assetId: z.string(),
  version: z.number().int().positive().default(1),
})
export type AssetRef = z.infer<typeof assetRefSchema>

const baseElementFields = {
  id: z.string().min(1),
  name: z.string().min(1),
  locked: z.boolean().default(false),
  visible: z.boolean().default(true),
  opacity: z.number().min(0).max(1).default(1),
  transform: transformSchema,
  binding: bindingSchema.optional(),
  visibility: visibilityRuleSchema.nullable().optional(),
  /** Illustrator-style tree: null/undefined = direct child of the artboard. */
  parentId: z.string().nullable().optional(),
}

export const textElementSchema = z.object({
  ...baseElementFields,
  type: z.literal('text'),
  content: z.string().default(''),
  typography: typographySchema.default({}),
  layout: textLayoutSchema.default({}),
})
export type TextElement = z.infer<typeof textElementSchema>

export const imageElementSchema = z.object({
  ...baseElementFields,
  type: z.literal('image'),
  asset: assetRefSchema.nullable().optional(),
  src: z.string().nullable().optional(),
  fit: imageFitSchema.default('fill'),
  crop: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .nullable()
    .optional(),
  cornerRadius: z.number().min(0).default(0),
  ...visualStyleFields,
  stroke: z.string().nullable().optional(),
  strokeWidth: z.number().min(0).optional(),
  /** Semantic: couple_photo | guest_photo | decorative */
  photoRole: z.enum(['couple_photo', 'guest_photo', 'decorative', 'none']).default('none'),
})
export type ImageElement = z.infer<typeof imageElementSchema>

export const svgGraphicKindSchema = z.enum(['path', 'group', 'shape', 'image', 'fragment'])

export const svgGraphicElementSchema = z.object({
  ...baseElementFields,
  type: z.literal('svg_graphic'),
  asset: assetRefSchema.nullable().optional(),
  /** External SVG/PNG URL (legacy plate-style or linked asset). */
  src: z.string().nullable().optional(),
  /**
   * Inline SVG fragment in source artboard coordinates (path, g, rect, …).
   * Preferred for layered import so each Studio layer stays editable.
   */
  markup: z.string().nullable().optional(),
  /** viewBox used when scaling markup into the element's transform box. */
  viewBox: z.string().nullable().optional(),
  kind: svgGraphicKindSchema.default('fragment'),
  fill: z.string().nullable().optional(),
  stroke: z.string().nullable().optional(),
  strokeWidth: z.number().min(0).default(0),
})
export type SvgGraphicElement = z.infer<typeof svgGraphicElementSchema>

export const iconElementSchema = z.object({
  ...baseElementFields,
  type: z.literal('icon'),
  iconKey: z.string(),
  asset: assetRefSchema.nullable().optional(),
  src: z.string().nullable().optional(),
  fill: z.string().default('#1a1a1a'),
  stroke: z.string().nullable().optional(),
})
export type IconElement = z.infer<typeof iconElementSchema>

export const shapeKindSchema = z.enum(SHAPE_KINDS)

export const shapeElementSchema = z.object({
  ...baseElementFields,
  type: z.literal('shape'),
  shape: shapeKindSchema,
  fill: z.string().default('#c4a484'),
  stroke: z.string().nullable().optional(),
  strokeWidth: z.number().min(0).default(0),
  cornerRadius: z.number().min(0).default(0),
  ...visualStyleFields,
})
export type ShapeElement = z.infer<typeof shapeElementSchema>

export const backgroundElementSchema = z.object({
  ...baseElementFields,
  type: z.literal('artboard_background'),
  fill: z.string().nullable().optional(),
  asset: assetRefSchema.nullable().optional(),
  src: z.string().nullable().optional(),
  /** When true, treated as locked base plate from uploaded artwork. */
  isBasePlate: z.boolean().default(false),
  stroke: z.string().nullable().optional(),
  strokeWidth: z.number().min(0).optional(),
  cornerRadius: z.number().min(0).optional(),
  ...visualStyleFields,
})
export type BackgroundElement = z.infer<typeof backgroundElementSchema>

export const qrElementSchema = z.object({
  ...baseElementFields,
  type: z.literal('qr'),
  binding: bindingSchema.default({
    type: 'variable',
    path: 'guest.admission_token',
    role: 'admission_qr',
  }),
  foreground: z.string().default('#000000'),
  background: z.string().default('#ffffff'),
  errorCorrection: z.enum(['L', 'M', 'Q', 'H']).default('M'),
  quietZone: z.number().min(0).default(4),
  /** Optional data URL / payload for preview only — production binds at render. */
  previewPayload: z.string().nullable().optional(),
})
export type QrElement = z.infer<typeof qrElementSchema>

export const groupElementSchema = z.object({
  ...baseElementFields,
  type: z.literal('group'),
  children: z.array(z.string()).default([]),
})
export type GroupElement = z.infer<typeof groupElementSchema>

export const designElementSchema = z.discriminatedUnion('type', [
  textElementSchema,
  imageElementSchema,
  svgGraphicElementSchema,
  iconElementSchema,
  shapeElementSchema,
  backgroundElementSchema,
  qrElementSchema,
  groupElementSchema,
])
export type DesignElement = z.infer<typeof designElementSchema>

export const designPageSchema = z.object({
  id: z.string(),
  name: z.string().default('Page 1'),
  width: z.number().positive(),
  height: z.number().positive(),
  unit: designUnitSchema.default('px'),
  background: z.string().default('#ffffff'),
  bleedMm: z.number().min(0).default(0),
  safeMm: z.number().min(0).default(0),
  /** Canvas placement for the multi-artboard editor (ignored by production render). */
  frameX: z.number().default(0),
  frameY: z.number().default(0),
  layoutGuide: layoutGuideSchema.optional(),
  autoLayout: autoLayoutSchema.optional(),
  elements: z.array(designElementSchema).default([]),
})
export type DesignPage = z.infer<typeof designPageSchema>

const ARTBOARD_GAP = 80

/** Place a new artboard to the right of the rightmost existing page. */
export function nextArtboardFrame(
  pages: Array<{ frameX?: number; frameY?: number; width: number; height: number }>,
): { frameX: number; frameY: number } {
  if (pages.length === 0) return { frameX: 0, frameY: 0 }
  let maxRight = 0
  let top = 0
  for (const p of pages) {
    const x = p.frameX ?? 0
    const y = p.frameY ?? 0
    maxRight = Math.max(maxRight, x + p.width)
    top = Math.min(top, y)
  }
  return { frameX: maxRight + ARTBOARD_GAP, frameY: top }
}

/** Ensure older documents without frameX/frameY get a horizontal layout. */
export function layoutArtboardsIfNeeded<T extends DesignPage>(pages: T[]): T[] {
  const needsLayout = pages.every((p) => (p.frameX ?? 0) === 0 && (p.frameY ?? 0) === 0) && pages.length > 1
  if (!needsLayout) {
    return pages.map((p) => ({
      ...p,
      frameX: p.frameX ?? 0,
      frameY: p.frameY ?? 0,
    }))
  }
  let x = 0
  return pages.map((p) => {
    const next = { ...p, frameX: x, frameY: 0 }
    x += p.width + ARTBOARD_GAP
    return next
  })
}

export const designDocumentSchema = z.object({
  documentId: z.string(),
  schemaVersion: z.literal(DESIGN_DOCUMENT_SCHEMA_VERSION).or(z.number()),
  name: z.string().default('Untitled card'),
  pages: z.array(designPageSchema).min(1),
  swatches: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        hex: z.string(),
        role: z.string().nullable().optional(),
      }),
    )
    .default([]),
  meta: z
    .object({
      kind: z.enum(['master', 'event']).default('master'),
      presetKey: z.string().nullable().optional(),
      starterKey: z.string().nullable().optional(),
      cardType: z.enum(['invitation', 'save_the_date', 'contribution', 'pass']).nullable().optional(),
      eventType: z
        .enum(['wedding', 'send_off', 'kitchen_party', 'bridal_shower', 'generic'])
        .nullable()
        .optional(),
      importedFrom: z.enum(['blank', 'svg', 'png', 'starter']).nullable().optional(),
      importMode: z.enum(['layered', 'plate_plus_text']).nullable().optional(),
    })
    .default({ kind: 'master' }),
})
export type DesignDocument = z.infer<typeof designDocumentSchema>

export function parseDesignDocument(input: unknown): DesignDocument {
  return designDocumentSchema.parse(input)
}

export function safeParseDesignDocument(input: unknown) {
  return designDocumentSchema.safeParse(input)
}

export type ArtboardPresetCategory =
  | 'invitation'
  | 'social'
  | 'paper'
  | 'phone'
  | 'tablet'
  | 'desktop'
  | 'presentation'

export type ArtboardPreset = {
  key: string
  name: string
  width: number
  height: number
  unit: DesignUnit
  description: string
  category: ArtboardPresetCategory
}

export const ARTBOARD_PRESET_CATEGORIES: { key: ArtboardPresetCategory; label: string }[] = [
  { key: 'invitation', label: 'Invitation' },
  { key: 'social', label: 'Social' },
  { key: 'paper', label: 'Paper' },
  { key: 'phone', label: 'Phone' },
  { key: 'tablet', label: 'Tablet' },
  { key: 'desktop', label: 'Desktop' },
  { key: 'presentation', label: 'Presentation' },
]

export const ARTBOARD_PRESETS: ArtboardPreset[] = [
  {
    key: 'digital_1080_1350',
    name: 'Digital invitation',
    width: 1080,
    height: 1350,
    unit: 'px',
    description: 'WhatsApp / social portrait',
    category: 'invitation',
  },
  {
    key: 'digital_1080_1080',
    name: 'Square social',
    width: 1080,
    height: 1080,
    unit: 'px',
    description: 'Square feed card',
    category: 'social',
  },
  {
    key: 'digital_1080_1920',
    name: 'Story',
    width: 1080,
    height: 1920,
    unit: 'px',
    description: 'Full-bleed story',
    category: 'social',
  },
  {
    key: 'digital_1200_630',
    name: 'Landscape card',
    width: 1200,
    height: 630,
    unit: 'px',
    description: 'Wide share image',
    category: 'social',
  },
  {
    key: 'ig_post',
    name: 'Instagram post',
    width: 1080,
    height: 1080,
    unit: 'px',
    description: 'Instagram feed',
    category: 'social',
  },
  {
    key: 'ig_story',
    name: 'Instagram story',
    width: 1080,
    height: 1920,
    unit: 'px',
    description: 'Instagram / WhatsApp story',
    category: 'social',
  },
  {
    key: 'fb_post',
    name: 'Facebook post',
    width: 1200,
    height: 630,
    unit: 'px',
    description: 'Facebook / Open Graph',
    category: 'social',
  },
  {
    key: 'print_a6',
    name: 'A6',
    width: 1240,
    height: 1748,
    unit: 'px',
    description: 'Approx A6 at 300 DPI',
    category: 'paper',
  },
  {
    key: 'print_a5',
    name: 'A5',
    width: 1748,
    height: 2480,
    unit: 'px',
    description: 'Approx A5 at 300 DPI',
    category: 'paper',
  },
  {
    key: 'print_a4',
    name: 'A4',
    width: 2480,
    height: 3508,
    unit: 'px',
    description: 'Approx A4 at 300 DPI',
    category: 'paper',
  },
  {
    key: 'print_5x7',
    name: '5×7"',
    width: 1500,
    height: 2100,
    unit: 'px',
    description: 'Classic invitation at 300 DPI',
    category: 'paper',
  },
  {
    key: 'print_letter',
    name: 'Letter',
    width: 2550,
    height: 3300,
    unit: 'px',
    description: 'US Letter at 300 DPI',
    category: 'paper',
  },
  {
    key: 'phone_390_844',
    name: 'iPhone',
    width: 390,
    height: 844,
    unit: 'px',
    description: 'Modern iPhone logical size',
    category: 'phone',
  },
  {
    key: 'phone_393_852',
    name: 'iPhone Pro',
    width: 393,
    height: 852,
    unit: 'px',
    description: 'iPhone Pro logical size',
    category: 'phone',
  },
  {
    key: 'phone_412_917',
    name: 'Android compact',
    width: 412,
    height: 917,
    unit: 'px',
    description: 'Android compact',
    category: 'phone',
  },
  {
    key: 'tablet_820_1180',
    name: 'iPad mini',
    width: 820,
    height: 1180,
    unit: 'px',
    description: 'iPad mini-class',
    category: 'tablet',
  },
  {
    key: 'tablet_1024_1366',
    name: 'iPad',
    width: 1024,
    height: 1366,
    unit: 'px',
    description: 'iPad portrait',
    category: 'tablet',
  },
  {
    key: 'desktop_1440_1024',
    name: 'Desktop',
    width: 1440,
    height: 1024,
    unit: 'px',
    description: 'Standard desktop frame',
    category: 'desktop',
  },
  {
    key: 'desktop_1512_982',
    name: 'MacBook Pro 14"',
    width: 1512,
    height: 982,
    unit: 'px',
    description: '14″ laptop',
    category: 'desktop',
  },
  {
    key: 'slide_16_9',
    name: 'Slide 16:9',
    width: 1920,
    height: 1080,
    unit: 'px',
    description: 'Presentation widescreen',
    category: 'presentation',
  },
  {
    key: 'slide_4_3',
    name: 'Slide 4:3',
    width: 1024,
    height: 768,
    unit: 'px',
    description: 'Presentation classic',
    category: 'presentation',
  },
]

/** Built-in elevation / shadow presets (Material-inspired). */
export const EFFECT_STYLE_PRESETS: Array<{
  id: string
  name: string
  group: string
  effect: Omit<DesignEffect, 'id'>
}> = [
  {
    id: 'elev_1',
    name: 'Elevation 1',
    group: 'Elevation',
    effect: {
      type: 'drop_shadow',
      visible: true,
      color: '#000000',
      opacity: 0.12,
      offsetX: 0,
      offsetY: 1,
      blur: 3,
      spread: 0,
    },
  },
  {
    id: 'elev_2',
    name: 'Elevation 2',
    group: 'Elevation',
    effect: {
      type: 'drop_shadow',
      visible: true,
      color: '#000000',
      opacity: 0.16,
      offsetX: 0,
      offsetY: 2,
      blur: 6,
      spread: 0,
    },
  },
  {
    id: 'elev_3',
    name: 'Elevation 3',
    group: 'Elevation',
    effect: {
      type: 'drop_shadow',
      visible: true,
      color: '#000000',
      opacity: 0.2,
      offsetX: 0,
      offsetY: 4,
      blur: 12,
      spread: 0,
    },
  },
  {
    id: 'elev_4',
    name: 'Elevation 4',
    group: 'Elevation',
    effect: {
      type: 'drop_shadow',
      visible: true,
      color: '#000000',
      opacity: 0.22,
      offsetX: 0,
      offsetY: 8,
      blur: 20,
      spread: 0,
    },
  },
  {
    id: 'elev_5',
    name: 'Elevation 5',
    group: 'Elevation',
    effect: {
      type: 'drop_shadow',
      visible: true,
      color: '#000000',
      opacity: 0.25,
      offsetX: 0,
      offsetY: 12,
      blur: 28,
      spread: 0,
    },
  },
]

export const LAYOUT_GUIDE_PRESETS: Array<{
  id: string
  name: string
  group: string
  guide: LayoutGuide
}> = [
  {
    id: 'guide_12_40',
    name: '12 columns',
    group: 'Columns',
    guide: { enabled: true, columns: 12, gutter: 20, margin: 40, rows: 0 },
  },
  {
    id: 'guide_8_32',
    name: '8 columns',
    group: 'Columns',
    guide: { enabled: true, columns: 8, gutter: 24, margin: 32, rows: 0 },
  },
  {
    id: 'guide_4_24',
    name: '4 columns',
    group: 'Columns',
    guide: { enabled: true, columns: 4, gutter: 16, margin: 24, rows: 0 },
  },
  {
    id: 'guide_safe_card',
    name: 'Card safe grid',
    group: 'Invitation',
    guide: { enabled: true, columns: 6, gutter: 16, margin: 48, rows: 8 },
  },
]

export const DEFAULT_SWATCHES = [
  { id: 'sw_ink', name: 'Ink', hex: '#1a1a1a', role: 'ink' },
  { id: 'sw_ivory', name: 'Ivory', hex: '#f7f1e8', role: 'background' },
  { id: 'sw_gold', name: 'Gold', hex: '#c4a484', role: 'accent' },
  { id: 'sw_blush', name: 'Blush', hex: '#e8c4c4', role: 'accent' },
  { id: 'sw_forest', name: 'Forest', hex: '#2f4f3e', role: 'accent' },
]

export function createBlankDocument(options?: {
  name?: string
  presetKey?: string
  kind?: 'master' | 'event'
}): DesignDocument {
  const preset =
    ARTBOARD_PRESETS.find((p) => p.key === (options?.presetKey ?? 'digital_1080_1350')) ??
    ARTBOARD_PRESETS[0]

  const pageId = newPageId()
  const bgId = newElementId()

  return {
    documentId: newDocumentId(),
    schemaVersion: DESIGN_DOCUMENT_SCHEMA_VERSION,
    name: options?.name ?? 'Untitled card',
    swatches: DEFAULT_SWATCHES,
    meta: {
      kind: options?.kind ?? 'master',
      presetKey: preset.key,
      importedFrom: 'blank',
    },
    pages: [
      {
        id: pageId,
        name: 'Invitation',
        width: preset.width,
        height: preset.height,
        unit: preset.unit,
        background: '#ffffff',
        bleedMm: 0,
        safeMm: 0,
        frameX: 0,
        frameY: 0,
        elements: [
          backgroundElementSchema.parse({
            id: bgId,
            type: 'artboard_background',
            name: 'Background',
            locked: true,
            visible: true,
            opacity: 1,
            transform: {
              x: 0,
              y: 0,
              width: preset.width,
              height: preset.height,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
            },
            fill: '#ffffff',
            isBasePlate: false,
          }),
        ],
      },
    ],
  }
}

export function createTextElement(
  partial?: Partial<TextElement> & { transform?: Partial<DesignTransform> },
): TextElement {
  return textElementSchema.parse({
    id: partial?.id ?? newElementId(),
    type: 'text',
    name: partial?.name ?? 'Text',
    locked: partial?.locked ?? false,
    visible: partial?.visible ?? true,
    opacity: partial?.opacity ?? 1,
    content: partial?.content ?? 'Your text',
    typography: partial?.typography ?? {},
    layout: partial?.layout ?? {},
    binding: partial?.binding,
    visibility: partial?.visibility,
    transform: {
      x: 140,
      y: 200,
      width: 800,
      height: 80,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      ...partial?.transform,
    },
  })
}

export function createShapeElement(
  shape: ShapeKind,
  partial?: Partial<ShapeElement>,
): ShapeElement {
  return shapeElementSchema.parse({
    id: partial?.id ?? newElementId(),
    type: 'shape',
    shape,
    name: partial?.name ?? shape.charAt(0).toUpperCase() + shape.slice(1),
    locked: partial?.locked ?? false,
    visible: partial?.visible ?? true,
    opacity: partial?.opacity ?? 1,
    fill: partial?.fill ?? '#c4a484',
    stroke: partial?.stroke,
    strokeWidth: partial?.strokeWidth ?? 0,
    cornerRadius: partial?.cornerRadius ?? 0,
    transform: {
      x: 200,
      y: 400,
      width: shape === 'line' ? 400 : 200,
      height: shape === 'line' ? 2 : 200,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      ...partial?.transform,
    },
  })
}

export function createImageElement(partial?: Partial<ImageElement>): ImageElement {
  return imageElementSchema.parse({
    id: partial?.id ?? newElementId(),
    type: 'image',
    name: partial?.name ?? 'Photo',
    locked: false,
    visible: true,
    opacity: 1,
    asset: partial?.asset,
    src: partial?.src,
    fit: partial?.fit ?? 'fill',
    photoRole: partial?.photoRole ?? 'none',
    cornerRadius: partial?.cornerRadius ?? 0,
    transform: {
      x: 290,
      y: 360,
      width: 500,
      height: 500,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      ...partial?.transform,
    },
  })
}

export function createSvgGraphicElement(partial?: Partial<SvgGraphicElement>): SvgGraphicElement {
  return svgGraphicElementSchema.parse({
    ...partial,
    id: partial?.id ?? newElementId(),
    type: 'svg_graphic',
    name: partial?.name ?? 'Graphic',
    locked: partial?.locked ?? false,
    visible: partial?.visible ?? true,
    opacity: partial?.opacity ?? 1,
    parentId: partial?.parentId ?? null,
    asset: partial?.asset,
    src: partial?.src ?? null,
    markup: partial?.markup ?? null,
    viewBox: partial?.viewBox ?? null,
    kind: partial?.kind ?? 'fragment',
    fill: partial?.fill ?? null,
    stroke: partial?.stroke ?? null,
    strokeWidth: partial?.strokeWidth ?? 0,
    transform: {
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      ...partial?.transform,
    },
  })
}

export function createIconElement(iconKey: string, partial?: Partial<IconElement>): IconElement {
  return iconElementSchema.parse({
    id: partial?.id ?? newElementId(),
    type: 'icon',
    iconKey,
    name: partial?.name ?? iconKey,
    locked: false,
    visible: true,
    opacity: 1,
    fill: partial?.fill ?? '#c4a484',
    src: partial?.src,
    asset: partial?.asset,
    transform: {
      x: 490,
      y: 180,
      width: 100,
      height: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      ...partial?.transform,
    },
  })
}

export function createQrElement(partial?: Partial<QrElement>): QrElement {
  return qrElementSchema.parse({
    id: partial?.id ?? newElementId(),
    type: 'qr',
    name: partial?.name ?? 'Entrance QR',
    locked: false,
    visible: true,
    opacity: 1,
    previewPayload: partial?.previewPayload ?? 'opuspass:preview',
    transform: {
      x: 440,
      y: 1050,
      width: 200,
      height: 200,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      ...partial?.transform,
    },
    ...partial,
  })
}

export function createGroupElement(partial?: Partial<GroupElement>): GroupElement {
  return groupElementSchema.parse({
    id: partial?.id ?? newElementId(),
    type: 'group',
    name: partial?.name ?? 'Group',
    locked: partial?.locked ?? false,
    visible: partial?.visible ?? true,
    opacity: partial?.opacity ?? 1,
    parentId: partial?.parentId ?? null,
    children: partial?.children ?? [],
    transform: {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      ...partial?.transform,
    },
  })
}

export function newEffectId() {
  return `fx_${Math.random().toString(36).slice(2, 10)}`
}

export function createDropShadowEffect(
  partial?: Partial<DesignEffect>,
): DesignEffect {
  return designEffectSchema.parse({
    id: partial?.id ?? newEffectId(),
    type: 'drop_shadow',
    visible: partial?.visible ?? true,
    color: partial?.color ?? '#000000',
    opacity: partial?.opacity ?? 0.25,
    offsetX: partial?.offsetX ?? 0,
    offsetY: partial?.offsetY ?? 4,
    blur: partial?.blur ?? 8,
    spread: partial?.spread ?? 0,
  })
}

/** Reposition content elements using page auto-layout (simple stack/flow). */
export function applyAutoLayoutToPage(page: DesignPage): DesignPage {
  const layout = page.autoLayout
  if (!layout?.enabled) return page
  const content = page.elements.filter((el) => el.type !== 'artboard_background' && el.visible)
  if (content.length === 0) return page

  let cursorX = layout.paddingX
  let cursorY = layout.paddingY
  let rowH = 0
  const maxW = page.width - layout.paddingX
  const nextElements = page.elements.map((el) => {
    if (el.type === 'artboard_background' || !el.visible) return el
    const t = el.transform
    let x = cursorX
    let y = cursorY

    if (layout.direction === 'vertical') {
      if (layout.align === 'center') x = (page.width - t.width) / 2
      else if (layout.align === 'end') x = page.width - layout.paddingX - t.width
      else x = layout.paddingX
      y = cursorY
      cursorY += t.height + layout.gap
    } else if (layout.direction === 'horizontal') {
      x = cursorX
      if (layout.align === 'center') y = (page.height - t.height) / 2
      else if (layout.align === 'end') y = page.height - layout.paddingY - t.height
      else y = layout.paddingY
      cursorX += t.width + layout.gap
    } else {
      // wrap
      if (cursorX + t.width > maxW && cursorX > layout.paddingX) {
        cursorX = layout.paddingX
        cursorY += rowH + layout.gap
        rowH = 0
      }
      x = cursorX
      y = cursorY
      cursorX += t.width + layout.gap
      rowH = Math.max(rowH, t.height)
    }

    return { ...el, transform: { ...t, x, y } }
  })

  return { ...page, elements: nextElements }
}
