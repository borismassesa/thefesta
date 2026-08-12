import type { DesignDocument, DesignElement, DesignPage } from './schema'
import { parseDesignDocument } from './schema'

/**
 * Render Plan — production contract stripped of editor chrome.
 * Both Studio preview and server renderer consume this shape.
 */
export type RenderPlanElement = {
  id: string
  name: string
  type: DesignElement['type']
  visible: boolean
  opacity: number
  transform: DesignElement['transform']
  /** Element-specific payload for the renderer. */
  props: Record<string, unknown>
  binding?: DesignElement['binding']
  visibility?: DesignElement['visibility']
}

export type RenderPlanPage = {
  id: string
  name: string
  width: number
  height: number
  unit: string
  background: string
  elements: RenderPlanElement[]
}

export type RenderPlan = {
  schemaVersion: number
  documentId: string
  name: string
  engineVersion: string
  compiledAt: string
  pages: RenderPlanPage[]
  fonts: { family: string; fontAssetId?: string | null; fontVersion?: string | null }[]
  assets: { assetId: string; version: number }[]
}

export const DESIGN_ENGINE_VERSION = '0.1.0'

function elementProps(el: DesignElement): Record<string, unknown> {
  switch (el.type) {
    case 'text':
      return {
        content: el.content,
        typography: el.typography,
        layout: el.layout,
      }
    case 'image':
      return {
        asset: el.asset,
        src: el.src,
        fit: el.fit,
        crop: el.crop,
        cornerRadius: el.cornerRadius,
        cornerRadii: el.cornerRadii,
        stroke: el.stroke,
        strokeWidth: el.strokeWidth,
        strokeAlign: el.strokeAlign,
        effects: el.effects,
        photoRole: el.photoRole,
      }
    case 'svg_graphic':
      return {
        asset: el.asset,
        src: el.src,
        markup: el.markup,
        viewBox: el.viewBox,
        kind: el.kind,
        fill: el.fill,
        stroke: el.stroke,
        strokeWidth: el.strokeWidth,
      }
    case 'icon':
      return {
        iconKey: el.iconKey,
        asset: el.asset,
        src: el.src,
        fill: el.fill,
        stroke: el.stroke,
      }
    case 'shape':
      return {
        shape: el.shape,
        fill: el.fill,
        stroke: el.stroke,
        strokeWidth: el.strokeWidth,
        strokeAlign: el.strokeAlign,
        cornerRadius: el.cornerRadius,
        cornerRadii: el.cornerRadii,
        effects: el.effects,
      }
    case 'artboard_background':
      return {
        fill: el.fill,
        asset: el.asset,
        src: el.src,
        isBasePlate: el.isBasePlate,
        stroke: el.stroke,
        strokeWidth: el.strokeWidth,
        strokeAlign: el.strokeAlign,
        cornerRadius: el.cornerRadius,
        cornerRadii: el.cornerRadii,
        effects: el.effects,
      }
    case 'qr':
      return {
        foreground: el.foreground,
        background: el.background,
        errorCorrection: el.errorCorrection,
        quietZone: el.quietZone,
        previewPayload: el.previewPayload,
      }
    case 'group':
      return { children: el.children }
    default:
      return {}
  }
}

function compilePage(page: DesignPage): RenderPlanPage {
  const elements: RenderPlanElement[] = page.elements
    .filter((el) => el.type !== 'group')
    .map((el) => ({
      id: el.id,
      name: el.name,
      type: el.type,
      visible: el.visible,
      opacity: el.opacity,
      transform: el.transform,
      props: elementProps(el),
      binding: el.binding,
      visibility: el.visibility ?? null,
    }))

  return {
    id: page.id,
    name: page.name,
    width: page.width,
    height: page.height,
    unit: page.unit,
    background: page.background,
    elements,
  }
}

function collectFonts(doc: DesignDocument) {
  const seen = new Map<string, { family: string; fontAssetId?: string | null; fontVersion?: string | null }>()
  for (const page of doc.pages) {
    for (const el of page.elements) {
      if (el.type !== 'text') continue
      const key = `${el.typography.fontFamily}::${el.typography.fontAssetId ?? ''}::${el.typography.fontVersion ?? ''}`
      if (!seen.has(key)) {
        seen.set(key, {
          family: el.typography.fontFamily,
          fontAssetId: el.typography.fontAssetId,
          fontVersion: el.typography.fontVersion,
        })
      }
    }
  }
  return [...seen.values()]
}

function collectAssets(doc: DesignDocument) {
  const seen = new Map<string, { assetId: string; version: number }>()
  for (const page of doc.pages) {
    for (const el of page.elements) {
      const asset =
        el.type === 'image' ||
        el.type === 'svg_graphic' ||
        el.type === 'icon' ||
        el.type === 'artboard_background'
          ? el.asset
          : null
      if (asset?.assetId) {
        seen.set(`${asset.assetId}@${asset.version}`, asset)
      }
    }
  }
  return [...seen.values()]
}

/** Compile a Design Document into a production Render Plan. */
export function compileDocument(input: DesignDocument | unknown): RenderPlan {
  const doc = parseDesignDocument(input)
  return {
    schemaVersion: 1,
    documentId: doc.documentId,
    name: doc.name,
    engineVersion: DESIGN_ENGINE_VERSION,
    compiledAt: new Date().toISOString(),
    pages: doc.pages.map(compilePage),
    fonts: collectFonts(doc),
    assets: collectAssets(doc),
  }
}
