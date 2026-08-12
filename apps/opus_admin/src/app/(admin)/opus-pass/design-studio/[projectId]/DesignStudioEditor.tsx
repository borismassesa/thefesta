'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  Check,
  Eye,
  LayoutTemplate,
  Link2,
  Lock,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Redo2,
  Save,
  Share2,
  Shapes,
  Trash2,
  Type,
  Undo2,
  Unlock,
  Upload,
  Variable,
  Rocket,
  Users,
} from 'lucide-react'

import {
  ARTBOARD_PRESETS,
  DESIGN_ICON_LIBRARY,
  ELEMENTS_CATALOG,
  TEST_DATA_PRESETS,
  alignElementsToBounds,
  applyAutoLayoutToPage,
  applyCardStarterToPage,
  applySolidFillToSvgMarkup,
  applySolidStrokeToSvgMarkup,
  ARTBOARD_SAFE_INSET,
  createIconElement,
  createImageElement,
  createQrElement,
  createShapeElement,
  createTextElement,
  enrichCardData,
  getByPath,
  getIcon,
  layoutArtboardsIfNeeded,
  resolveCardField,
  nextArtboardFrame,
  newPageId,
  placementForField,
  recenterContentAfterResize,
  resolveTemplateString,
  searchIcons,
  selectionBounds,
  setDataPath,
  ungroupSvgGraphic,
  type AlignMode,
  type ArtboardPreset,
  type CardFieldDef,
  type CardStarter,
  type CardType,
  type CatalogElement,
  type DesignElement,
  type DesignPage,
  type LayerViewMode,
  type PreflightResult,
  type RegistryEventType,
  type TextElement,
  type SvgGraphicElement,
  isLayerVisibleInView,
} from '@opusfesta/design-engine'

import {
  addDesignSwatchAction,
  createBulkRenderJobAction,
  deleteDesignProjectAction,
  previewDesignSvgAction,
  releaseDesignTemplateAction,
  runDesignPreflightAction,
  saveDesignDocumentAction,
  saveGuestOverrideAction,
  uploadDesignAssetAction,
  type DesignStudioLoad,
} from '@/lib/design-studio/actions'
import { useFocusMode } from '@/components/SidebarFocus'
import ConfirmDialog from '@/app/(admin)/operations/_shared/ConfirmDialog'

import { PropertiesInspector } from './PropertiesInspector'
import { StudioBrandPanel } from './StudioBrandPanel'
import { StudioCanvas } from './StudioCanvas'
import { StudioDataPanel, boundTextLayers } from './StudioDataPanel'
import type { StudioTool } from './StudioFloatingToolbar'
import { StudioTemplatesPanel } from './StudioTemplatesPanel'
import { StudioTextPanel } from './StudioTextPanel'
import { useDesignHistory } from './useDesignHistory'

/** Left library tabs — one job each, no duplicates of the bottom draw toolbar. */
type RailTab =
  | 'templates'
  | 'elements'
  | 'text'
  | 'media'
  | 'brand'
  | 'data'
  | 'publish'

type Props = {
  initial: DesignStudioLoad
  canWrite: boolean
  canPublish: boolean
}

export function DesignStudioEditor({ initial, canWrite, canPublish }: Props) {
  const history = useDesignHistory(initial.document)
  const { document, setDocument, replaceDocument, undo, redo, canUndo, canRedo } = history
  // Immersive workspace: admin Sidebar + Header are hidden via
  // isImmersiveWorkspace (see lib/admin-immersive.ts). Focus mode kept as a
  // belt-and-suspenders collapse if the shell ever renders the rail again.
  useFocusMode(true)
  const router = useRouter()
  const [version, setVersion] = useState(initial.version)
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const frame = initial.document.pages[0]?.elements.find((el) => el.type === 'artboard_background')
    return frame ? [frame.id] : []
  })
  const [rail, setRail] = useState<RailTab>('templates')
  const [libraryOpen, setLibraryOpen] = useState(true)
  const [iconQuery, setIconQuery] = useState('')
  const [conflict, setConflict] = useState<number | null>(null)
  const [testKey, setTestKey] = useState('example')
  const [sampleOverrides, setSampleOverrides] = useState<Record<string, string>>({})
  const [preflight, setPreflight] = useState<PreflightResult | null>(null)
  const [previewSvg, setPreviewSvg] = useState<string | null>(null)
  const [swatches, setSwatches] = useState(initial.swatches)
  const [assets, setAssets] = useState(initial.assets)
  const [releases, setReleases] = useState(initial.releases)
  const [bulkResult, setBulkResult] = useState<string | null>(null)
  const [importNotice, setImportNotice] = useState<string | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [dirty, setDirty] = useState(false)
  /** Quiet toolbar status — never drives a loud/layout-shifting button. */
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('saved')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<
    null | { type: 'clear-artboard'; index: number } | { type: 'delete-project' }
  >(null)
  const [tool, setTool] = useState<StudioTool>('select')
  const [layerView, setLayerView] = useState<LayerViewMode>({
    hideArtwork: false,
    soloId: null,
  })
  const [pending, startTransition] = useTransition()
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shareMenuRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  const page = document.pages[pageIndex] ?? document.pages[0]
  const selected = page.elements.find((el) => el.id === selectedIds[0]) ?? null

  const pruneSelectionToView = (view: LayerViewMode, elements = page.elements) => {
    setSelectedIds((prev) => {
      const kept = prev.filter((id) => {
        const el = elements.find((e) => e.id === id)
        if (!el) return false
        if (el.type === 'artboard_background') return true
        return isLayerVisibleInView(el, elements, page.width, page.height, view)
      })
      if (kept.length === prev.length && kept.every((id, i) => id === prev[i])) return prev
      if (kept.length === 0) {
        const frame = elements.find((el) => el.type === 'artboard_background')
        return frame ? [frame.id] : []
      }
      return kept
    })
  }

  const onToggleHideArtwork = () => {
    const next: LayerViewMode = {
      hideArtwork: !layerView.hideArtwork,
      soloId: null,
    }
    setLayerView(next)
    pruneSelectionToView(next)
  }

  const onSoloLayer = (id: string | null) => {
    const next: LayerViewMode = { hideArtwork: false, soloId: id }
    setLayerView(next)
    if (id) setSelectedIds([id])
    else pruneSelectionToView(next)
  }

  const testPreset = TEST_DATA_PRESETS.find((p) => p.key === testKey)
  const testData = useMemo(() => {
    let data = structuredClone(testPreset?.data ?? {}) as Record<string, unknown>
    for (const [path, value] of Object.entries(sampleOverrides)) {
      data = setDataPath(data, path, value)
    }
    return enrichCardData(data)
  }, [testPreset, sampleOverrides])

  const setTestKeyAndResetSamples = (key: string) => {
    setTestKey(key)
    setSampleOverrides({})
  }

  // Card studio always keeps a frame selected (Figma/Canva): empty Design panel is never useful.
  useEffect(() => {
    const frame = page.elements.find((el) => el.type === 'artboard_background')
    if (!frame) return
    setSelectedIds((prev) => {
      const stillOnPage = prev.filter((id) => page.elements.some((el) => el.id === id))
      if (stillOnPage.length > 0) {
        if (
          stillOnPage.length === prev.length &&
          stillOnPage.every((id, i) => id === prev[i])
        ) {
          return prev
        }
        return stillOnPage
      }
      return [frame.id]
    })
  }, [pageIndex, page.elements])

  // Normalize ivory blanks → white, and lay out artboards on one canvas if needed.
  useEffect(() => {
    let changed = false
    setDocument((doc) => {
      const laidOut = layoutArtboardsIfNeeded(doc.pages)
      const layoutChanged = laidOut.some(
        (p, i) => p.frameX !== (doc.pages[i].frameX ?? 0) || p.frameY !== (doc.pages[i].frameY ?? 0),
      )
      const pages = laidOut.map((p) => {
        const bg = p.elements.find((el) => el.type === 'artboard_background')
        const fillOnly =
          bg?.type === 'artboard_background' && !bg.src && (bg.fill === '#f7f1e8' || bg.fill == null)
        if (p.background !== '#f7f1e8' && !fillOnly) return p
        changed = true
        return {
          ...p,
          background: p.background === '#f7f1e8' ? '#ffffff' : p.background,
          elements: p.elements.map((el) => {
            if (el.type !== 'artboard_background' || el.src) return el
            if (el.fill !== '#f7f1e8' && el.fill != null) return el
            return { ...el, fill: '#ffffff' }
          }),
        }
      })
      if (layoutChanged) changed = true
      return changed ? { ...doc, pages } : doc
    })
    if (changed) setDirty(true)
  }, [setDocument])

  const applyArtboardPreset = useCallback(
    (presetOrKey: string | ArtboardPreset) => {
      const preset =
        typeof presetOrKey === 'string'
          ? ARTBOARD_PRESETS.find((p) => p.key === presetOrKey)
          : presetOrKey
      if (!preset) return
      setDirty(true)
      setDocument((doc) => ({
        ...doc,
        meta: { ...doc.meta, presetKey: preset.key },
        pages: doc.pages.map((p, i) => {
          if (i !== pageIndex) return p
          const elements = recenterContentAfterResize(
            p.elements.map((el) => {
              if (el.type !== 'artboard_background' || el.src) return el
              if (el.fill !== '#f7f1e8' && el.fill != null) return el
              return { ...el, fill: '#ffffff' }
            }),
            { width: p.width, height: p.height },
            { width: preset.width, height: preset.height },
          )
          return {
            ...p,
            width: preset.width,
            height: preset.height,
            unit: preset.unit,
            background: p.background === '#f7f1e8' ? '#ffffff' : p.background,
            elements,
          }
        }),
      }))
    },
    [pageIndex, setDocument],
  )

  const applyCardStarter = useCallback(
    (starter: CardStarter) => {
      setDirty(true)
      setTestKey('example')
      const cardType: CardType =
        starter.eventType === 'save_the_date'
          ? 'save_the_date'
          : starter.eventType === 'contribution'
            ? 'contribution'
            : 'invitation'
      const eventType: RegistryEventType =
        starter.eventType === 'save_the_date' || starter.eventType === 'contribution'
          ? 'generic'
          : starter.eventType
      setDocument((doc) => ({
        ...doc,
        meta: {
          ...doc.meta,
          presetKey: 'digital_1080_1350',
          starterKey: starter.key,
          cardType,
          eventType,
          importedFrom: 'starter',
        },
        pages: doc.pages.map((p, i) => {
          if (i !== pageIndex) return p
          const next = applyCardStarterToPage(p, starter)
          const frame = next.elements.find((el) => el.type === 'artboard_background')
          if (frame) {
            queueMicrotask(() => setSelectedIds([frame.id]))
          }
          return next
        }),
      }))
    },
    [pageIndex, setDocument],
  )

  const onChangePage = useCallback(
    (patch: Partial<DesignPage>) => {
      setDirty(true)
      setDocument((doc) => ({
        ...doc,
        pages: doc.pages.map((p, i) => {
          if (i !== pageIndex) return p
          let next: DesignPage = { ...p, ...patch }
          if (patch.autoLayout?.enabled) {
            next = applyAutoLayoutToPage(next)
          }
          // Keep frame element transform in sync when renaming via page is N/A;
          // frameX/Y are page-level canvas placement.
          return next
        }),
      }))
    },
    [pageIndex, setDocument],
  )

  const onApplyAutoLayout = useCallback(() => {
    setDirty(true)
    setDocument((doc) => ({
      ...doc,
      pages: doc.pages.map((p, i) => {
        if (i !== pageIndex) return p
        const autoLayout = {
          direction: 'vertical' as const,
          gap: 10,
          paddingX: 10,
          paddingY: 10,
          align: 'start' as const,
          clipContent: false,
          ...p.autoLayout,
          enabled: true,
        }
        return applyAutoLayoutToPage({ ...p, autoLayout })
      }),
    }))
  }, [pageIndex, setDocument])

  const exportSelection = useCallback(
    async (opts: { scale: number; format: 'png' | 'svg' }) => {
      const result = await previewDesignSvgAction({ document, data: testData })
      if (!result.ok || !result.svg) return
      const browserDoc = globalThis.document
      if (opts.format === 'svg') {
        const blob = new Blob([result.svg], { type: 'image/svg+xml' })
        const url = URL.createObjectURL(blob)
        const a = browserDoc.createElement('a')
        a.href = url
        a.download = `${page.name || 'frame'}.svg`
        a.click()
        URL.revokeObjectURL(url)
        return
      }
      const img = new Image()
      const svgUrl = URL.createObjectURL(new Blob([result.svg], { type: 'image/svg+xml' }))
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('image load failed'))
        img.src = svgUrl
      })
      const canvasEl = browserDoc.createElement('canvas')
      canvasEl.width = Math.round(page.width * opts.scale)
      canvasEl.height = Math.round(page.height * opts.scale)
      const ctx = canvasEl.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvasEl.width, canvasEl.height)
      ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height)
      URL.revokeObjectURL(svgUrl)
      const pngUrl = canvasEl.toDataURL('image/png')
      const a = browserDoc.createElement('a')
      a.href = pngUrl
      a.download = `${page.name || 'frame'}@${opts.scale}x.png`
      a.click()
    },
    [document, page.height, page.name, page.width, testData],
  )

  const resolveText = useCallback(
    (el: DesignElement) => {
      if (el.type !== 'text') return ''
      if (el.binding?.type === 'variable') {
        const fromContent = el.content.match(/^\{\{\s*([^}]+)\s*\}\}$/)?.[1]?.trim()
        const candidates = [
          el.binding.path,
          el.binding.role,
          fromContent,
          fromContent === 'phone' || el.binding.path === 'phone' ? 'contact.phone' : null,
          fromContent === 'phone' || el.binding.path === 'phone' ? 'rsvp_contacts_line' : null,
          fromContent === 'phone' || el.binding.path === 'phone' ? 'contact_1' : null,
        ].filter((k): k is string => Boolean(k))

        for (const key of candidates) {
          const resolved = resolveCardField(testData, key)
          if (resolved && !resolved.startsWith('{{')) return resolved
          const v = getByPath(testData, key)
          if (v != null && v !== '') return String(v)
        }
        return el.binding.fallback || resolveTemplateString(el.content, testData)
      }
      return resolveTemplateString(el.content, testData)
    },
    [testData],
  )

  const updatePageElements = useCallback(
    (updater: (els: DesignElement[]) => DesignElement[]) => {
      setDirty(true)
      setDocument((doc) => ({
        ...doc,
        pages: doc.pages.map((p, i) =>
          i === pageIndex ? { ...p, elements: updater(p.elements) } : p,
        ),
      }))
    },
    [setDocument, pageIndex],
  )

  const addElement = (el: DesignElement) => {
    updatePageElements((els) => {
      // Keep artboard as document root (index 0); new layers stack on top.
      const frame = els.find((e) => e.type === 'artboard_background')
      const rest = els.filter((e) => e.type !== 'artboard_background')
      return frame ? [frame, ...rest, el] : [...els, el]
    })
    setSelectedIds([el.id])
  }

  const brandFont =
    initial.fonts.find((f) => f.familyName)?.familyName ?? 'Cormorant Garamond'

  const addTextBox = (opts: {
    name: string
    content: string
    fontSize?: number
    fontWeight?: number
    height?: number
    fontFamily?: string
    italic?: boolean
    uppercase?: boolean
    color?: string
    letterSpacing?: number
    binding?: TextElement['binding']
    transform?: Partial<TextElement['transform']>
  }) => {
    const fontSize = opts.fontSize ?? 32
    const height = opts.height ?? Math.max(40, Math.round(fontSize * 1.4))
    const width = opts.transform?.width ?? Math.round(page.width * 0.8)
    addElement(
      createTextElement({
        name: opts.name,
        content: opts.content,
        binding: opts.binding,
        typography: {
          fontFamily: opts.fontFamily ?? brandFont,
          fontWeight: opts.fontWeight ?? 400,
          fontSize,
          lineHeight: 1.15,
          letterSpacing: opts.letterSpacing ?? 0,
          textAlign: 'center',
          color: opts.color ?? '#1a1a1a',
          opacity: 1,
          uppercase: opts.uppercase ?? false,
          italic: opts.italic ?? false,
          underline: false,
        },
        layout: {
          fit: 'shrink_wrap',
          minFontSize: Math.max(14, Math.round(fontSize * 0.45)),
          maxLines: 3,
          overflow: 'block',
          verticalAlign: 'middle',
        },
        transform: {
          x: opts.transform?.x ?? Math.round((page.width - width) / 2),
          y: opts.transform?.y ?? Math.round(page.height * 0.35),
          width,
          height: opts.transform?.height ?? height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
      }),
    )
  }

  const insertVariableField = (field: CardFieldDef) => {
    const place = placementForField(field, page)
    if (field.kind === 'template') {
      addTextBox({
        name: field.label,
        content: field.templateText ?? field.sample,
        fontSize: place.fontSize,
        fontWeight: place.fontWeight,
        height: place.height,
        transform: { x: place.x, y: place.y, width: place.width, height: place.height },
      })
      return
    }
    addTextBox({
      name: field.label,
      content: `{{${field.path}}}`,
      fontSize: place.fontSize,
      fontWeight: place.fontWeight,
      height: place.height,
      binding: {
        type: 'variable',
        path: field.path,
        role: field.role ?? field.key,
        fallback: field.sample,
      },
      transform: { x: place.x, y: place.y, width: place.width, height: place.height },
    })
  }

  const bindVariableToSelection = (field: CardFieldDef) => {
    if (!selected || selected.type !== 'text') return
    if (field.kind === 'template') {
      onChangeElement(selected.id, {
        name: selected.name || field.label,
        content: field.templateText ?? field.sample,
        binding: { type: 'none' },
      })
      return
    }
    onChangeElement(selected.id, {
      name: selected.name || field.label,
      content: `{{${field.path}}}`,
      binding: {
        type: 'variable',
        path: field.path,
        role: field.role ?? field.key,
        fallback: field.sample,
      },
    })
  }

  const insertCatalogItem = (item: CatalogElement) => {
    if (item.action.type === 'shape') {
      addElement(
        createShapeElement(item.action.shape, {
          name: item.name,
          fill: item.action.fill ?? '#c4a484',
          stroke: item.action.stroke,
          strokeWidth: item.action.strokeWidth ?? 0,
          cornerRadius: item.action.cornerRadius ?? 0,
          transform:
            item.action.shape === 'line'
              ? { x: 190, y: 640, width: 700, height: 3, rotation: 0, scaleX: 1, scaleY: 1 }
              : undefined,
        }),
      )
      return
    }
    if (item.action.type === 'qr') {
      addElement(createQrElement())
      return
    }
    if (item.action.type === 'icon') {
      addElement(
        createIconElement(item.action.iconKey, {
          name: item.name,
          fill: item.action.fill ?? swatches[2]?.hex ?? '#c4a484',
        }),
      )
      return
    }
    if (item.action.type === 'frame') {
      const variant = item.action.variant
      const size =
        variant === 'circle'
          ? { x: 340, y: 360, width: 400, height: 400, radius: 999 }
          : variant === 'arch'
            ? { x: 315, y: 280, width: 450, height: 560, radius: 225 }
            : variant === 'polaroid'
              ? { x: 290, y: 300, width: 500, height: 580, radius: 8 }
              : variant === 'soft'
                ? { x: 290, y: 360, width: 500, height: 500, radius: 48 }
                : { x: 290, y: 360, width: 500, height: 500, radius: 24 }
      addElement(
        createImageElement({
          name: item.name,
          photoRole: 'couple_photo',
          cornerRadius: size.radius,
          transform: {
            x: size.x,
            y: size.y,
            width: size.width,
            height: size.height,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
          },
        }),
      )
      return
    }
    if (item.action.type === 'divider') {
      if (
        item.action.variant === 'ornament' ||
        item.action.variant === 'flourish' ||
        item.action.variant === 'dots' ||
        item.action.variant === 'diamonds'
      ) {
        const iconKey =
          item.action.variant === 'ornament' || item.action.variant === 'flourish'
            ? 'divider_ornament'
            : item.action.variant === 'diamonds'
              ? 'star_ornament'
              : 'divider_ornament'
        addElement(
          createIconElement(iconKey, {
            name: item.name,
            fill: '#c4a484',
            transform: { x: 340, y: 620, width: 400, height: 40, rotation: 0, scaleX: 1, scaleY: 1 },
          }),
        )
        return
      }
      addElement(
        createShapeElement('line', {
          name: item.name,
          fill: '#1a1a1a',
          strokeWidth: item.action.variant === 'double' ? 3 : 1,
          transform: {
            x: 190,
            y: 640,
            width: 700,
            height: item.action.variant === 'double' ? 4 : 2,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
          },
        }),
      )
    }
  }

  const onChangeElement = (id: string, patch: Partial<DesignElement> & Record<string, unknown>) => {
    setDirty(true)
    setDocument((doc) => ({
      ...doc,
      pages: doc.pages.map((p, i) => {
        if (i !== pageIndex) return p
        const target = p.elements.find((el) => el.id === id)

        const recolorOne = (el: DesignElement, hex: string): DesignElement => {
          if (el.type === 'text') {
            return {
              ...el,
              typography: { ...el.typography, color: hex },
            }
          }
          if (el.type === 'svg_graphic') {
            const g = el as SvgGraphicElement
            return {
              ...g,
              fill: hex,
              markup: g.markup ? applySolidFillToSvgMarkup(g.markup, hex) : g.markup,
            }
          }
          if (
            el.type === 'shape' ||
            el.type === 'icon' ||
            el.type === 'artboard_background'
          ) {
            return { ...el, fill: hex } as DesignElement
          }
          return el
        }

        const descendantIds = (rootId: string): Set<string> => {
          const ids = new Set<string>()
          const walk = (pid: string) => {
            for (const el of p.elements) {
              if (el.parentId === pid) {
                ids.add(el.id)
                walk(el.id)
              }
              if (el.type === 'group' && el.id === pid) {
                for (const cid of el.children) {
                  ids.add(cid)
                  walk(cid)
                }
              }
            }
          }
          walk(rootId)
          return ids
        }

        let elements = p.elements.map((el) => {
          if (el.id !== id) return el
          const next = { ...el, ...patch } as DesignElement
          if (patch.transform) {
            next.transform = { ...el.transform, ...patch.transform }
          }
          if (el.type === 'text' && patch.typography) {
            ;(next as TextElement).typography = {
              ...el.typography,
              ...(patch.typography as TextElement['typography']),
            }
          }
          if (el.type === 'text' && patch.layout) {
            ;(next as TextElement).layout = {
              ...el.layout,
              ...(patch.layout as TextElement['layout']),
            }
          }
          // Solid fill on imported SVG must rewrite baked markup fills
          if (el.type === 'svg_graphic' && typeof patch.fill === 'string') {
            const g = next as SvgGraphicElement
            const srcMarkup = (el as SvgGraphicElement).markup
            return {
              ...g,
              fill: patch.fill,
              markup: srcMarkup ? applySolidFillToSvgMarkup(srcMarkup, patch.fill) : g.markup,
            }
          }
          if (el.type === 'svg_graphic' && typeof patch.stroke === 'string') {
            const g = next as SvgGraphicElement
            const srcMarkup = (el as SvgGraphicElement).markup
            return {
              ...g,
              stroke: patch.stroke,
              markup: srcMarkup ? applySolidStrokeToSvgMarkup(srcMarkup, patch.stroke) : g.markup,
            }
          }
          return next
        })

        // Group fill → recolour every descendant that can take a solid colour
        if (target?.type === 'group' && typeof patch.fill === 'string') {
          const kids = descendantIds(id)
          elements = elements.map((el) => (kids.has(el.id) ? recolorOne(el, patch.fill as string) : el))
        }

        // Frame (artboard) edits sync page size + canvas background.
        // Size changes recenter content (Canva/Figma card resize behavior).
        if (target?.type === 'artboard_background') {
          const bg = elements.find((el) => el.id === id)
          const width = patch.transform?.width ?? bg?.transform.width ?? p.width
          const height = patch.transform?.height ?? bg?.transform.height ?? p.height
          const fill =
            typeof patch.fill === 'string'
              ? patch.fill
              : bg?.type === 'artboard_background'
                ? bg.fill ?? p.background
                : p.background
          const resize = width !== p.width || height !== p.height
          let nextElements = resize
            ? recenterContentAfterResize(
                elements,
                { width: p.width, height: p.height },
                { width, height },
              )
            : elements

          nextElements = nextElements.map((el) => {
            if (el.type !== 'artboard_background') return el
            return {
              ...el,
              ...(typeof fill === 'string' && fill ? { fill } : {}),
              transform: resize
                ? el.transform
                : { ...el.transform, x: 0, y: 0, width, height },
            }
          })

          return {
            ...p,
            width,
            height,
            background: typeof fill === 'string' && fill ? fill : p.background,
            elements: nextElements,
          }
        }

        return { ...p, elements }
      }),
    }))
  }

  const persist = useCallback(
    (summary?: string) => {
      if (!canWrite) {
        setSaveError('You do not have permission to save.')
        return
      }
      setSaveStatus('saving')
      setSaveError(null)
      startTransition(async () => {
        const result = await saveDesignDocumentAction({
          projectId: initial.projectId,
          documentId: initial.documentId,
          baseVersion: version,
          document,
          changeSummary: summary,
        })
        if (!result.ok) {
          if (result.code === 'CONFLICT') {
            setConflict(result.currentVersion ?? null)
          }
          setSaveError(result.message ?? 'Save failed. Try again.')
          setSaveStatus('idle')
          return
        }
        setVersion(result.version)
        setConflict(null)
        setDirty(false)
        setSaveStatus('saved')
        setSaveError(null)
      })
    },
    [canWrite, document, initial.documentId, initial.projectId, version],
  )

  const clearArtboardAt = useCallback(
    (index: number) => {
      setDirty(true)
      setDocument((doc) => ({
        ...doc,
        pages: doc.pages.map((p, i) => {
          if (i !== index) return p
          const frame = p.elements.find((el) => el.type === 'artboard_background')
          const nextFrame = frame
            ? {
                ...frame,
                src: null,
                fill: '#ffffff',
                isBasePlate: false,
                name: 'Background',
                locked: true,
                visible: true,
                opacity: 1,
                transform: {
                  ...frame.transform,
                  x: 0,
                  y: 0,
                  width: p.width,
                  height: p.height,
                  rotation: 0,
                },
              }
            : p.elements[0]
          return {
            ...p,
            background: '#ffffff',
            elements: nextFrame ? [nextFrame as DesignElement] : [],
          }
        }),
      }))
      setSelectedIds([])
    },
    [setDocument],
  )

  /** Remove a page, or prompt to clear the only artboard back to a blank frame. */
  const removeOrClearArtboard = useCallback(
    (index: number) => {
      if (!canWrite) return
      if (document.pages.length > 1) {
        setDirty(true)
        setDocument((doc) => ({
          ...doc,
          pages: doc.pages.filter((_, i) => i !== index),
        }))
        setPageIndex((prev) => {
          if (index < prev) return prev - 1
          if (index === prev) return Math.max(0, prev - 1)
          return prev
        })
        setSelectedIds([])
        return
      }
      setConfirmDialog({ type: 'clear-artboard', index })
    },
    [canWrite, document.pages.length, setDocument],
  )

  const deleteSelection = useCallback(() => {
    if (!canWrite || selectedIds.length === 0) return
    const onlyArtboard =
      selectedIds.length === 1 &&
      page.elements.some((el) => el.id === selectedIds[0] && el.type === 'artboard_background')
    if (onlyArtboard) {
      removeOrClearArtboard(pageIndex)
      return
    }
    updatePageElements((els) =>
      els.filter((el) => {
        if (!selectedIds.includes(el.id)) return true
        if (el.type === 'artboard_background') return true
        if (el.locked) return true
        return false
      }),
    )
    setSelectedIds((prev) =>
      prev.filter((id) => {
        const el = page.elements.find((e) => e.id === id)
        return el?.type === 'artboard_background' || el?.locked
      }),
    )
  }, [
    canWrite,
    page.elements,
    pageIndex,
    removeOrClearArtboard,
    selectedIds,
    updatePageElements,
  ])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if (meta && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
        return
      }
      if (meta && e.key === 's') {
        e.preventDefault()
        persist('Manual save')
        return
      }
      if (meta && e.key === 'd' && selected) {
        e.preventDefault()
        const clone = {
          ...structuredClone(selected),
          id: `el_${Math.random().toString(36).slice(2, 10)}`,
          name: `${selected.name} copy`,
          transform: {
            ...selected.transform,
            x: selected.transform.x + 24,
            y: selected.transform.y + 24,
          },
        } as DesignElement
        addElement(clone)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length) {
        e.preventDefault()
        deleteSelection()
        return
      }
      if (selected && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        for (const id of selectedIds) {
          const el = page.elements.find((x) => x.id === id)
          if (!el || el.locked) continue
          onChangeElement(id, {
            transform: { ...el.transform, x: el.transform.x + dx, y: el.transform.y + dy },
          })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    undo,
    redo,
    persist,
    selected,
    selectedIds,
    page.elements,
    addElement,
    deleteSelection,
    onChangeElement,
  ])

  // Autosave
  useEffect(() => {
    if (!canWrite) return
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => persist('Autosave'), 2500)
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    }
  }, [document, canWrite, persist])

  useEffect(() => {
    if (!shareOpen) return
    const onPointer = (e: MouseEvent) => {
      if (!shareMenuRef.current?.contains(e.target as Node)) setShareOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShareOpen(false)
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [shareOpen])

  const icons = useMemo(() => searchIcons(iconQuery), [iconQuery])

  const alignSelected = (mode: AlignMode) => {
    if (!selected) return
    const artboardBounds = { x: 0, y: 0, width: page.width, height: page.height }

    setDirty(true)
    setDocument((doc) => ({
      ...doc,
      pages: doc.pages.map((p, i) => {
        if (i !== pageIndex) return p

        const targets = p.elements.filter(
          (el) => selectedIds.includes(el.id) && el.type !== 'artboard_background',
        )

        if (selected.type === 'artboard_background' && targets.length === 0) {
          return {
            ...p,
            elements: alignElementsToBounds(
              p.elements,
              mode,
              artboardBounds,
              ARTBOARD_SAFE_INSET,
            ),
          }
        }
        if (targets.length === 0) return p

        const bounds = targets.length > 1 ? selectionBounds(targets) : artboardBounds
        if (!bounds) return p

        const inset = targets.length > 1 ? 0 : ARTBOARD_SAFE_INSET
        const byId = new Map(
          alignElementsToBounds(targets, mode, bounds, inset).map((el) => [el.id, el]),
        )
        return {
          ...p,
          elements: p.elements.map((el) => byId.get(el.id) ?? el),
        }
      }),
    }))
  }

  const contentSelectionCount = selectedIds.filter((id) => {
    const el = page.elements.find((x) => x.id === id)
    return el != null && el.type !== 'artboard_background'
  }).length

  function alignTargetHintForSelection(): 'frame' | 'selection' | 'artboard' {
    if (selected?.type === 'artboard_background' && contentSelectionCount === 0) return 'frame'
    if (contentSelectionCount > 1) return 'selection'
    return 'artboard'
  }

  const onUpload = async (file: File, opts: { asBasePlate?: boolean; kind?: string }) => {
    // Leave headroom under the 50mb Next proxy/serverAction body limit
    // (multipart boundaries + form fields add overhead).
    const maxBytes = 45 * 1024 * 1024
    if (file.size > maxBytes) {
      setImportNotice(
        `File is ${(file.size / (1024 * 1024)).toFixed(1)}MB — max is 45MB. In Illustrator: File → Export → Export As → SVG, and uncheck “Preserve Illustrator Editing Capabilities” / avoid embedding huge linked images.`,
      )
      setRail('media')
      return
    }
    setImportNotice('Uploading…')
    const fd = new FormData()
    fd.set('file', file)
    fd.set('projectId', initial.projectId)
    fd.set('kind', opts.kind ?? 'upload')
    if (opts.asBasePlate) {
      fd.set('asBasePlate', '1')
      fd.set('replaceDocument', '1')
    }
    try {
      const result = await uploadDesignAssetAction(fd)
      if (!result.ok) {
        setImportNotice(result.error || 'Upload failed')
        setRail('media')
        return
      }
      setAssets((a) => [
        {
          id: result.asset.id,
          kind: result.asset.kind,
          name: result.asset.name,
          publicUrl: result.asset.publicUrl,
          storagePath: result.asset.storagePath,
          tags: [],
          version: result.asset.version,
        },
        ...a,
      ])
      if (result.document) {
        replaceDocument(result.document)
        if (result.importReport) {
          const r = result.importReport
          const bits = [
            r.mode === 'layered' ? 'Layered import' : 'Plate import',
            r.layers != null ? `${r.layers} layers` : null,
            r.paths ? `${r.paths} paths` : null,
            r.groups ? `${r.groups} groups` : null,
            r.textObjects ? `${r.textObjects} text` : null,
            r.unsupported?.length ? `unsupported: ${r.unsupported.join(', ')}` : null,
          ].filter(Boolean)
          setImportNotice(bits.join(' · '))
          setRail('media')
        } else {
          setImportNotice(null)
        }
      } else if (opts.kind === 'photo') {
        setImportNotice(null)
        addElement(
          createImageElement({
            name: 'Couple photo',
            src: result.asset.publicUrl ?? undefined,
            asset: { assetId: result.asset.id, version: result.asset.version },
            photoRole: 'couple_photo',
          }),
        )
      } else {
        setImportNotice(null)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setImportNotice(
        msg.includes('Unexpected end of form') || msg.includes('body')
          ? 'Upload was truncated (file too large for the server). Re-export a leaner SVG, or restart the admin app after the 50MB limit bump.'
          : msg || 'Upload failed',
      )
      setRail('media')
    }
  }

  const railItems: {
    id: RailTab
    label: string
    hint: string
    icon: React.ReactNode
  }[] = [
    {
      id: 'templates',
      label: 'Templates',
      hint: 'Browse starters or describe the card you want',
      icon: <LayoutTemplate className="h-5 w-5" />,
    },
    {
      id: 'elements',
      label: 'Elements',
      hint: 'Shapes, ornaments & QR for the card',
      icon: <Shapes className="h-5 w-5" />,
    },
    { id: 'text', label: 'Text', hint: 'Add type, styles & invitation phrases', icon: <Type className="h-5 w-5" /> },
    { id: 'media', label: 'Uploads', hint: 'Base artwork, photos & icons', icon: <Upload className="h-5 w-5" /> },
    { id: 'brand', label: 'Brand', hint: 'Colours and fonts for the card', icon: <Palette className="h-5 w-5" /> },
    { id: 'data', label: 'Data', hint: 'Card Field Registry — bind semantic keys', icon: <Variable className="h-5 w-5" /> },
    { id: 'publish', label: 'Publish', hint: 'Release & bulk render', icon: <Rocket className="h-5 w-5" /> },
  ]

  const activeRail = railItems.find((r) => r.id === rail) ?? railItems[0]

  const openRail = (id: RailTab) => {
    setRail(id)
    setLibraryOpen(true)
  }

  return (
    <div className="flex h-dvh flex-col bg-[#F0F0F0] text-gray-900">
      <header className="z-30 flex h-11 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3">
        <Link
          href="/opus-pass/design-studio"
          className="rounded-md px-1.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900"
        >
          Cards
        </Link>
        <span className="text-gray-300">/</span>
        <input
          value={document.name}
          onChange={(e) => {
            setDirty(true)
            setDocument((doc) => ({ ...doc, name: e.target.value }))
          }}
          className="min-w-0 max-w-50 truncate bg-transparent text-sm font-semibold text-gray-900 outline-none"
        />
        <span className="text-[11px] tabular-nums text-gray-400">v{version}</span>
        {conflict != null ? (
          <button
            type="button"
            className="text-xs font-medium text-amber-700 underline"
            onClick={() => window.location.reload()}
          >
            Reload latest
          </button>
        ) : null}

        <div className="ml-1 flex items-center gap-0.5 border-l border-gray-200 pl-2">
          <IconBtn title="Undo (⌘Z)" disabled={!canUndo} onClick={undo}>
            <Undo2 className="h-4 w-4" />
          </IconBtn>
          <IconBtn title="Redo" disabled={!canRedo} onClick={redo}>
            <Redo2 className="h-4 w-4" />
          </IconBtn>
          {selected?.type === 'artboard_background' ? (
            <>
              <span className="mx-0.5 h-4 w-px bg-gray-200" />
              <IconBtn
                title={selected.locked ? 'Unlock artboard' : 'Lock artboard'}
                disabled={!canWrite}
                onClick={() => onChangeElement(selected.id, { locked: !selected.locked })}
              >
                {selected.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
              </IconBtn>
              <IconBtn
                title="Delete artboard"
                disabled={!canWrite}
                danger
                onClick={() => removeOrClearArtboard(pageIndex)}
              >
                <Trash2 className="h-4 w-4" />
              </IconBtn>
            </>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Fixed-width quiet status — autosave must not resize neighboring controls */}
          <span
            className="hidden w-19 shrink-0 text-right text-[11px] text-gray-400 sm:inline"
            aria-live="polite"
          >
            {saveStatus === 'saving' ? 'Saving…' : dirty ? 'Unsaved' : 'Autosaved'}
          </span>
          {saveError ? (
            <span className="hidden max-w-40 truncate text-[11px] text-red-600 sm:inline" title={saveError}>
              {saveError}
            </span>
          ) : null}
          <select
            value={testKey}
            onChange={(e) => setTestKeyAndResetSamples(e.target.value)}
            title="Guest preview data"
            className="hidden rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[11px] font-medium text-gray-700 sm:block"
          >
            {TEST_DATA_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              startTransition(async () => {
                const result = await previewDesignSvgAction({ document, data: testData })
                if (!result.ok || result.blocked) {
                  setPreviewSvg(null)
                  return
                }
                setPreviewSvg(result.svg)
              })
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Eye className="h-3.5 w-3.5" />
            Preview
          </button>
          <button
            type="button"
            disabled={!canWrite || saveStatus === 'saving'}
            onClick={() => persist('Manual save')}
            title="Save now (⌘S)"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" />
            Save
          </button>
          <div className="relative" ref={shareMenuRef}>
            <button
              type="button"
              onClick={() => setShareOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </button>
            {shareOpen ? (
              <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(window.location.href)
                      setShareCopied(true)
                      window.setTimeout(() => setShareCopied(false), 1600)
                    } catch {
                      setSaveError('Could not copy link')
                    }
                  }}
                >
                  {shareCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Link2 className="h-3.5 w-3.5" />}
                  {shareCopied ? 'Link copied' : 'Copy editor link'}
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
                  onClick={() => {
                    setShareOpen(false)
                    void exportSelection({ scale: 2, format: 'png' })
                  }}
                >
                  Download PNG
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
                  onClick={() => {
                    setShareOpen(false)
                    void exportSelection({ scale: 1, format: 'svg' })
                  }}
                >
                  Download SVG
                </button>
                {canPublish ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
                    onClick={() => {
                      setShareOpen(false)
                      openRail('publish')
                    }}
                  >
                    Publish release…
                  </button>
                ) : null}
                {canWrite ? (
                  <>
                    <div className="my-1 border-t border-gray-100" />
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-700 hover:bg-red-50"
                      onClick={() => {
                        setShareOpen(false)
                        setConfirmDialog({ type: 'delete-project' })
                      }}
                    >
                      Delete project…
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
          {canPublish ? (
            <button
              type="button"
              className="hidden rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 md:inline-flex"
              onClick={() => openRail('publish')}
            >
              Publish
            </button>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Library icon rail — match inspector: white, quiet, clear active */}
        <nav className="flex w-16 shrink-0 flex-col border-r border-gray-200 bg-white py-2">
          <div className="flex flex-1 flex-col gap-0.5 px-1.5">
            {railItems.map((item) => {
              const active = rail === item.id && libraryOpen
              return (
                <button
                  key={item.id}
                  type="button"
                  title={`${item.label} — ${item.hint}`}
                  onClick={() => openRail(item.id)}
                  className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2.5 ${
                    active
                      ? 'bg-[#F0DFF6] text-[#7E5896]'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {item.icon}
                  <span className="max-w-full truncate text-center text-[9px] font-medium leading-tight">
                    {item.label}
                  </span>
                </button>
              )
            })}
          </div>
          <button
            type="button"
            title={libraryOpen ? 'Hide library' : 'Show library'}
            onClick={() => setLibraryOpen((v) => !v)}
            className="mx-1.5 mt-1 flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
          >
            {libraryOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
            <span className="text-[10px] font-medium">{libraryOpen ? 'Hide' : 'Show'}</span>
          </button>
        </nav>

        {/* Library panel */}
        {libraryOpen ? (
        <aside
          className={`flex shrink-0 flex-col border-r border-gray-200 bg-white ${
            rail === 'templates' || rail === 'text' ? 'w-[320px]' : 'w-70'
          }`}
        >
          {rail === 'templates' || rail === 'text' ? null : (
          <div className="border-b border-gray-100 px-3 py-2.5">
            <div className="text-[13px] font-semibold text-gray-900">{activeRail.label}</div>
            <p className="mt-0.5 text-[11px] leading-snug text-gray-500">{activeRail.hint}</p>
          </div>
          )}
          <div
            className={`no-scrollbar flex-1 overflow-y-auto text-sm ${
              rail === 'templates' || rail === 'text' ? 'p-3 pt-3.5' : 'p-3'
            }`}
          >
            {rail === 'templates' ? (
              <StudioTemplatesPanel
                currentPresetKey={document.meta.presetKey}
                currentWidth={page.width}
                currentHeight={page.height}
                activeStarterKey={document.meta.starterKey}
                onApplyStarter={applyCardStarter}
                onApplyFramePreset={applyArtboardPreset}
              />
            ) : null}

            {rail === 'elements' ? (
              <div className="space-y-4">
                {(['Shapes', 'Frames', 'Dividers', 'Ornaments', 'Credentials'] as const).map((cat) => {
                  const items = ELEMENTS_CATALOG.filter((e) => e.category === cat)
                  return (
                    <div key={cat}>
                      <div className="mb-1.5 text-[11px] font-semibold text-gray-800">{cat}</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {items.map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => insertCatalogItem(item)}
                            className="flex flex-col items-center gap-1.5 rounded-lg border border-gray-200 bg-[#F5F5F5] px-2 py-3 text-center hover:border-gray-300 hover:bg-gray-100"
                          >
                            <svg viewBox="0 0 48 48" className="h-9 w-9 text-gray-800">
                              <path
                                d={item.previewPath}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            <span className="text-[11px] font-medium text-gray-700">{item.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : null}

            {rail === 'text' ? (
              <StudioTextPanel
                brandFont={brandFont}
                fonts={initial.fonts.map((f) => ({
                  id: f.id,
                  familyName: f.familyName,
                }))}
                selectedText={selected?.type === 'text' ? selected : null}
                onAddEmpty={() =>
                  addTextBox({ name: 'Text', content: 'Your text', fontSize: 32, fontWeight: 400 })
                }
                onAddStyle={(style) =>
                  addTextBox({
                    name: style.name,
                    content: style.content,
                    fontSize: style.fontSize,
                    fontWeight: style.fontWeight,
                    height: style.height,
                    fontFamily: style.fontFamily,
                    italic: style.italic,
                    uppercase: style.uppercase,
                    color: style.color,
                    letterSpacing: style.letterSpacing,
                  })
                }
                onAddPhrase={(phrase) =>
                  addTextBox({
                    name: phrase.label,
                    content: phrase.content,
                    fontSize: 24,
                    fontWeight: 400,
                    height: 44,
                  })
                }
                onAddCombination={(combo) => {
                  const baseY = Math.round(page.height * 0.32)
                  const width = Math.round(page.width * 0.78)
                  const x = Math.round((page.width - width) / 2)
                  combo.lines.forEach((line, i) => {
                    const fontSize = Math.round(line.fontSize * 2.4)
                    const height = Math.max(36, Math.round(fontSize * 1.35))
                    addTextBox({
                      name: `${combo.label} · ${i + 1}`,
                      content: line.content.replace(/\n/g, ' '),
                      fontSize,
                      fontWeight: line.fontWeight,
                      height,
                      fontFamily: line.fontFamily,
                      italic: line.italic,
                      uppercase: line.uppercase,
                      color: line.color,
                      letterSpacing: line.letterSpacing,
                      transform: {
                        x,
                        y: baseY + i * Math.round(height + 12),
                        width,
                        height,
                      },
                    })
                  })
                }}
                onApplyFont={(family) => {
                  if (selected?.type === 'text') {
                    onChangeElement(selected.id, {
                      typography: { ...selected.typography, fontFamily: family },
                    })
                  }
                }}
              />
            ) : null}

            {rail === 'media' ? (
              <div className="space-y-4">
                <div>
                  <div className="mb-1.5 text-[11px] font-semibold text-gray-800">Artwork import</div>
                  <button
                    type="button"
                    className="w-full rounded-lg border border-dashed border-gray-300 bg-[#F5F5F5] px-3 py-3 text-left hover:border-gray-400 hover:bg-gray-100"
                    onClick={() => fileRef.current?.click()}
                  >
                    <div className="text-xs font-semibold text-gray-900">Upload SVG / PNG</div>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      SVG keeps paths &amp; groups as layers. Max ~45MB. EPS: convert to SVG first.
                    </p>
                  </button>
                  {importNotice ? (
                    <p
                      className={`mt-2 text-[11px] leading-snug ${
                        importNotice.startsWith('Layered') || importNotice.startsWith('Plate')
                          ? 'text-emerald-800'
                          : importNotice === 'Uploading…'
                            ? 'text-gray-500'
                            : 'text-red-700'
                      }`}
                    >
                      {importNotice}
                    </p>
                  ) : null}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/svg+xml,image/png,image/jpeg,.svg"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void onUpload(f, { asBasePlate: true })
                    }}
                  />
                </div>
                <div>
                  <div className="mb-1.5 text-[11px] font-semibold text-gray-800">Couple photo</div>
                  <div className="flex gap-1.5">
                    <ToolBtn
                      label="Add frame"
                      onClick={() =>
                        addElement(
                          createImageElement({
                            name: 'Couple photo',
                            photoRole: 'couple_photo',
                          }),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      onClick={() => photoRef.current?.click()}
                    >
                      Upload
                    </button>
                  </div>
                  <input
                    ref={photoRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void onUpload(f, { kind: 'photo' })
                    }}
                  />
                  <div className="mt-2 space-y-1">
                    {assets
                      .filter((a) => a.kind === 'photo' || a.kind === 'upload')
                      .slice(0, 8)
                      .map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white p-1.5 text-left text-xs hover:bg-gray-50"
                          onClick={() =>
                            addElement(
                              createImageElement({
                                name: a.name,
                                src: a.publicUrl ?? undefined,
                                asset: { assetId: a.id, version: a.version },
                                photoRole: 'couple_photo',
                              }),
                            )
                          }
                        >
                          {a.publicUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.publicUrl} alt="" className="h-8 w-8 rounded object-cover" />
                          ) : (
                            <div className="h-8 w-8 rounded bg-gray-100" />
                          )}
                          <span className="truncate">{a.name}</span>
                        </button>
                      ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-[11px] font-semibold text-gray-800">Icons</div>
                  <input
                    value={iconQuery}
                    onChange={(e) => setIconQuery(e.target.value)}
                    placeholder="Search floral, rings…"
                    className="mb-2 w-full rounded-md border border-gray-200 bg-[#F5F5F5] px-2.5 py-1.5 text-xs text-gray-900 outline-none focus:border-gray-300 focus:bg-white"
                  />
                  <div className="grid grid-cols-3 gap-1.5">
                    {(icons.length ? icons : DESIGN_ICON_LIBRARY).map((icon) => {
                      const meta = getIcon(icon.key)
                      return (
                        <button
                          key={icon.key}
                          type="button"
                          title={icon.name}
                          onClick={() =>
                            addElement(
                              createIconElement(icon.key, {
                                name: icon.name,
                                fill: swatches[2]?.hex ?? '#c4a484',
                              }),
                            )
                          }
                          className="flex flex-col items-center rounded-lg border border-gray-200 bg-[#F5F5F5] p-2 hover:bg-gray-100"
                        >
                          <svg viewBox="0 0 24 24" className="h-7 w-7 text-gray-700">
                            <path d={meta?.svgPath ?? ''} fill="currentColor" />
                          </svg>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            {rail === 'brand' ? (
              <StudioBrandPanel
                swatches={swatches}
                fonts={initial.fonts}
                selected={
                  selected
                    ? {
                        type: selected.type,
                        typography: selected.type === 'text' ? selected.typography : undefined,
                        fill:
                          selected.type === 'text'
                            ? selected.typography.color
                            : selected.type === 'shape' ||
                                selected.type === 'icon' ||
                                selected.type === 'artboard_background' ||
                                selected.type === 'svg_graphic'
                              ? selected.fill
                              : null,
                      }
                    : null
                }
                canWrite={canWrite}
                onApplyColor={(hex) => {
                  if (!selected) return
                  onChangeElement(selected.id, {
                    ...(selected.type === 'text'
                      ? { typography: { ...selected.typography, color: hex } }
                      : { fill: hex }),
                  })
                }}
                onApplyFont={(family, fontAssetId) => {
                  if (selected?.type === 'text') {
                    onChangeElement(selected.id, {
                      typography: {
                        ...selected.typography,
                        fontFamily: family,
                        fontAssetId,
                      },
                    })
                  }
                }}
                onAddSwatch={(hex, name) => {
                  startTransition(async () => {
                    const result = await addDesignSwatchAction({
                      projectId: initial.projectId,
                      name: name ?? 'Custom',
                      hex,
                    })
                    if (result.ok) {
                      setSwatches((prev) => [
                        ...prev,
                        { id: result.id, name: name ?? 'Custom', hex, role: null },
                      ])
                    }
                  })
                }}
              />
            ) : null}

            {rail === 'data' ? (
              <StudioDataPanel
                testKey={testKey}
                testData={testData}
                cardType={(document.meta.cardType as CardType | null) ?? 'all'}
                eventType={(document.meta.eventType as RegistryEventType | null) ?? 'all'}
                pageElements={page.elements}
                onTestKeyChange={setTestKeyAndResetSamples}
                onCardTypeChange={(type) => {
                  setDirty(true)
                  setDocument((doc) => ({
                    ...doc,
                    meta: {
                      ...doc.meta,
                      cardType: type === 'all' ? null : type,
                    },
                  }))
                }}
                onEventTypeChange={(type) => {
                  setDirty(true)
                  setDocument((doc) => ({
                    ...doc,
                    meta: {
                      ...doc.meta,
                      eventType: type === 'all' ? null : type,
                    },
                  }))
                }}
                onSampleChange={(path, value) => {
                  setSampleOverrides((prev) => ({ ...prev, [path]: value }))
                }}
                selectedText={selected?.type === 'text' ? selected : null}
                boundLayers={boundTextLayers(page.elements, testData)}
                preflight={preflight}
                onInsertField={insertVariableField}
                onBindSelection={bindVariableToSelection}
                onSelectLayer={(id) => setSelectedIds([id])}
                onRunStressTest={() => {
                  startTransition(async () => {
                    const result = await runDesignPreflightAction(document)
                    setPreflight(result)
                  })
                }}
              />
            ) : null}

            {rail === 'publish' ? (
              <div className="space-y-3">
                <ol className="list-decimal space-y-1 pl-4 text-[11px] text-gray-500">
                  <li>Design the card</li>
                  <li>Test long guest names</li>
                  <li>Publish an immutable release</li>
                  <li>Bulk-render guests</li>
                </ol>
                {canPublish ? (
                  <button
                    type="button"
                    disabled={pending}
                    className="w-full rounded-xl bg-[#7E5896] px-3 py-2.5 text-xs font-semibold text-white hover:bg-[#6b4a80] disabled:opacity-40"
                    onClick={() => {
                      startTransition(async () => {
                        const result = await releaseDesignTemplateAction({
                          projectId: initial.projectId,
                          documentId: initial.documentId,
                          document,
                          baseVersion: version,
                        })
                        if (!result.ok) {
                          setPreflight(result.preflight ?? null)
                          return
                        }
                        setReleases((r) => [
                          {
                            id: result.releaseId,
                            documentVersion: version + 1,
                            status: 'released',
                            releasedAt: new Date().toISOString(),
                          },
                          ...r.map((x) =>
                            x.status === 'released' ? { ...x, status: 'superseded' } : x,
                          ),
                        ])
                        setPreflight(result.preflight)
                        setDirty(false)
                      })
                    }}
                  >
                    Publish release
                  </button>
                ) : (
                  <p className="text-xs text-gray-500">Needs digitalcards.publish</p>
                )}

                <div className="space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Releases
                  </div>
                  {releases.length === 0 ? (
                    <p className="text-xs text-gray-400">None yet</p>
                  ) : (
                    releases.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1.5 text-[11px]"
                      >
                        v{r.documentVersion} · {r.status}
                      </div>
                    ))
                  )}
                </div>

                {releases[0] && canWrite ? (
                  <button
                    type="button"
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-2.5 py-2 text-xs font-medium"
                    onClick={() => {
                      startTransition(async () => {
                        const guests = TEST_DATA_PRESETS.map((p, i) => ({
                          guestId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
                          guestKey: p.key,
                          data: p.data,
                        }))
                        const result = await createBulkRenderJobAction({
                          projectId: initial.projectId,
                          releaseId: releases[0].id,
                          guests,
                        })
                        if (!result.ok) return
                        setBulkResult(
                          `${result.completed} ready · ${result.warning} warn · ${result.failed} blocked`,
                        )
                      })
                    }}
                  >
                    <Users className="h-3.5 w-3.5" />
                    Bulk render test guests
                  </button>
                ) : null}
                {bulkResult ? <p className="text-xs text-gray-600">{bulkResult}</p> : null}
                {preflight && !preflight.releasable ? (
                  <ul className="no-scrollbar max-h-40 space-y-1 overflow-auto text-[11px] text-red-700">
                    {preflight.issues
                      .filter((i) => i.severity === 'error')
                      .slice(0, 12)
                      .map((issue, i) => (
                        <li key={`${issue.code}-${i}`}>{issue.message}</li>
                      ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>
        ) : null}

        {/* Canvas */}
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <StudioCanvas
              document={document}
              pageIndex={pageIndex}
              onPageChange={(i) => {
                setPageIndex(i)
                setSelectedIds([])
                setLayerView({ hideArtwork: false, soloId: null })
              }}
              onAddPage={() => {
                setDirty(true)
                setDocument((doc) => {
                  const base = doc.pages[pageIndex] ?? doc.pages[0]
                  const frame = nextArtboardFrame(doc.pages)
                  const nextPage = {
                    ...structuredClone(base),
                    id: newPageId(),
                    name: `Artboard ${doc.pages.length + 1}`,
                    frameX: frame.frameX,
                    frameY: frame.frameY,
                    elements: base.elements
                      .filter((el) => el.type === 'artboard_background')
                      .map((el) => ({
                        ...structuredClone(el),
                        id: `el_${Math.random().toString(36).slice(2, 10)}`,
                      })),
                  }
                  return { ...doc, pages: [...doc.pages, nextPage] }
                })
                setPageIndex(document.pages.length)
                setSelectedIds([])
              }}
              onRemovePage={(index) => removeOrClearArtboard(index)}
              onMovePage={(index, frameX, frameY) => {
                setDirty(true)
                setDocument((doc) => ({
                  ...doc,
                  pages: doc.pages.map((p, i) =>
                    i === index ? { ...p, frameX, frameY } : p,
                  ),
                }))
              }}
              onRenamePage={(index, name) => {
                setDirty(true)
                setDocument((doc) => ({
                  ...doc,
                  pages: doc.pages.map((p, i) => {
                    if (i !== index) return p
                    return {
                      ...p,
                      name,
                      elements: p.elements.map((el) =>
                        el.type === 'artboard_background' ? { ...el, name } : el,
                      ),
                    }
                  }),
                }))
              }}
              selectedIds={selectedIds}
              tool={tool}
              onToolChange={setTool}
              onOpenAssets={() => openRail('media')}
              onDrawCreate={({ kind, x, y, width, height }) => {
                if (kind === 'rect') {
                  addElement(
                    createShapeElement('rect', {
                      name: 'Rectangle',
                      fill: '#c4a484',
                      transform: { x, y, width, height, rotation: 0, scaleX: 1, scaleY: 1 },
                    }),
                  )
                } else if (kind === 'ellipse') {
                  addElement(
                    createShapeElement('ellipse', {
                      name: 'Ellipse',
                      fill: '#c4a484',
                      transform: { x, y, width, height, rotation: 0, scaleX: 1, scaleY: 1 },
                    }),
                  )
                } else if (kind === 'text') {
                  addElement(
                    createTextElement({
                      name: 'Text',
                      content: 'Your text',
                      typography: {
                        fontFamily: brandFont,
                        fontWeight: 500,
                        fontSize: Math.max(18, Math.min(48, Math.round(height * 0.7))),
                        lineHeight: 1.2,
                        letterSpacing: 0,
                        textAlign: 'left',
                        color: '#1a1a1a',
                        opacity: 1,
                        uppercase: false,
                        italic: false,
                        underline: false,
                      },
                      layout: {
                        fit: 'shrink_wrap',
                        minFontSize: 14,
                        maxLines: 4,
                        overflow: 'block',
                        verticalAlign: 'middle',
                      },
                      transform: { x, y, width, height, rotation: 0, scaleX: 1, scaleY: 1 },
                    }),
                  )
                } else if (kind === 'frame') {
                  addElement(
                    createImageElement({
                      name: 'Photo frame',
                      photoRole: 'couple_photo',
                      cornerRadius: 16,
                      transform: { x, y, width, height, rotation: 0, scaleX: 1, scaleY: 1 },
                    }),
                  )
                  openRail('media')
                }
              }}
              onSelect={(ids, additive) => {
                if (additive) {
                  setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])))
                  return
                }
                if (ids.length === 0) {
                  const frame = page.elements.find((el) => el.type === 'artboard_background')
                  setSelectedIds(frame ? [frame.id] : [])
                  return
                }
                setSelectedIds(ids)
              }}
              onChangeElement={onChangeElement}
              resolveText={resolveText}
              artboardPresetKey={document.meta.presetKey}
              onArtboardPresetChange={applyArtboardPreset}
              fonts={initial.fonts.map((f) => ({
                id: f.id,
                familyName: f.familyName,
              }))}
              swatches={swatches}
              layerView={layerView}
              onToggleHideArtwork={onToggleHideArtwork}
              onClearSolo={() => onSoloLayer(null)}
              onDuplicateElement={(id) => {
                const el = page.elements.find((e) => e.id === id)
                if (!el || el.locked) return
                const clone = {
                  ...structuredClone(el),
                  id: `el_${Math.random().toString(36).slice(2, 10)}`,
                  name: `${el.name} copy`,
                  transform: {
                    ...el.transform,
                    x: el.transform.x + 24,
                    y: el.transform.y + 24,
                  },
                } as DesignElement
                addElement(clone)
              }}
              onDeleteElements={(ids) => {
                const hitsArtboard = page.elements.some(
                  (el) => ids.includes(el.id) && el.type === 'artboard_background',
                )
                if (hitsArtboard) {
                  removeOrClearArtboard(pageIndex)
                  return
                }
                updatePageElements((els) =>
                  els.filter((el) => {
                    if (!ids.includes(el.id)) return true
                    if (el.type === 'artboard_background') return true
                    if (el.locked) return true
                    return false
                  }),
                )
                setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)))
              }}
              onReorderElement={(id, dir) => {
                updatePageElements((els) =>
                  reorderLayer(els, id, dir === 'forward' ? 'forward' : 'backward'),
                )
              }}
            />
            {previewSvg ? (
              <div className="no-scrollbar absolute inset-4 z-10 overflow-auto rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
                <div className="mb-2 flex justify-between text-xs font-medium text-gray-700">
                  <span>Preview</span>
                  <button type="button" className="text-gray-500 hover:text-gray-900" onClick={() => setPreviewSvg(null)}>
                    Close
                  </button>
                </div>
                <iframe
                  title="Preview"
                  className="mx-auto h-[70vh] w-full max-w-lg rounded bg-white"
                  sandbox=""
                  srcDoc={previewSvg}
                />
              </div>
            ) : null}
          </div>
        </main>

        <PropertiesInspector
          element={selected}
          page={page}
          artboardName={page.name}
          swatches={swatches}
          artboardPresetKey={document.meta.presetKey}
          selectionCount={contentSelectionCount}
          alignTarget={alignTargetHintForSelection()}
          selectedIds={selectedIds}
          onAlign={alignSelected}
          onChange={(patch) => selected && onChangeElement(selected.id, patch)}
          onChangePage={onChangePage}
          onApplyAutoLayout={onApplyAutoLayout}
          onArtboardPresetChange={applyArtboardPreset}
          onExport={exportSelection}
          onRename={(name) => {
            if (!selected) return
            const next = name.trim() || (selected.type === 'artboard_background' ? 'Artboard' : selected.name)
            if (selected.type === 'artboard_background') {
              // Page name is the artboard title shown on canvas + tabs.
              onChangePage({ name: next })
              onChangeElement(selected.id, { name: next })
              return
            }
            onChangeElement(selected.id, { name: next })
          }}
          onToggleLock={() => selected && onChangeElement(selected.id, { locked: !selected.locked })}
          onToggleVisible={() =>
            selected && onChangeElement(selected.id, { visible: !selected.visible })
          }
          onDelete={() => {
            if (!selected) return
            if (selected.type === 'artboard_background') {
              removeOrClearArtboard(pageIndex)
              return
            }
            if (selected.locked) return
            updatePageElements((els) => els.filter((el) => el.id !== selected.id))
            setSelectedIds([])
          }}
          onReorder={(dir) => {
            if (!selected || selected.type === 'artboard_background') return
            updatePageElements((els) => reorderLayer(els, selected.id, dir === 'up' ? 'forward' : 'backward'))
          }}
          onSelectLayer={(id) => setSelectedIds([id])}
          onToggleLayerVisible={(id, visible) => onChangeElement(id, { visible })}
          onToggleLayerLock={(id, locked) => onChangeElement(id, { locked })}
          onReorderLayer={(id, action) => {
            updatePageElements((els) => reorderLayer(els, id, action))
          }}
          onMoveLayerToIndex={(id, toIndex) => {
            updatePageElements((els) => moveLayerToIndex(els, id, toIndex))
          }}
          onRenameLayer={(id, name) => {
            const el = page.elements.find((e) => e.id === id)
            if (!el) return
            if (el.type === 'artboard_background') {
              onChangePage({ name })
              onChangeElement(id, { name })
              return
            }
            onChangeElement(id, { name })
          }}
          onUngroupLayer={(id) => {
            const el = page.elements.find((e) => e.id === id)
            if (!el || el.type !== 'svg_graphic' || el.locked) return
            const kids = ungroupSvgGraphic(el, page.width, page.height)
            if (!kids?.length) return
            updatePageElements((els) => {
              const idx = els.findIndex((e) => e.id === id)
              if (idx < 0) return els
              const next = [...els]
              next.splice(idx, 1, ...kids)
              return next
            })
            setSelectedIds(kids.map((k) => k.id))
          }}
          layerView={layerView}
          onToggleHideArtwork={onToggleHideArtwork}
          onSoloLayer={onSoloLayer}
        />
      </div>

      <ConfirmDialog
        open={confirmDialog != null}
        variant="danger"
        title={
          confirmDialog?.type === 'delete-project' ? 'Delete this project?' : 'Clear this artboard?'
        }
        body={
          confirmDialog?.type === 'delete-project'
            ? 'This removes the entire design project and cannot be undone.'
            : 'All layers on the design will be removed. You can undo afterward.'
        }
        confirmLabel={confirmDialog?.type === 'delete-project' ? 'Delete project' : 'Clear artboard'}
        cancelLabel="Cancel"
        pending={confirmDialog?.type === 'delete-project' ? pending : false}
        onCancel={() => {
          if (pending) return
          setConfirmDialog(null)
        }}
        onConfirm={() => {
          if (!confirmDialog) return
          if (confirmDialog.type === 'clear-artboard') {
            clearArtboardAt(confirmDialog.index)
            setConfirmDialog(null)
            return
          }
          startTransition(async () => {
            const result = await deleteDesignProjectAction(initial.projectId)
            if (!result.ok) {
              setSaveError(result.error)
              setConfirmDialog(null)
              return
            }
            setConfirmDialog(null)
            router.push('/opus-pass/design-studio')
          })
        }}
      />
    </div>
  )
}

function reorderLayer(
  els: DesignElement[],
  id: string,
  action: 'forward' | 'backward' | 'front' | 'back',
): DesignElement[] {
  const idx = els.findIndex((el) => el.id === id)
  if (idx < 0) return els
  const el = els[idx]!
  if (el.type === 'artboard_background') return els

  const frameIdx = els.findIndex((e) => e.type === 'artboard_background')
  const minIdx = frameIdx >= 0 ? frameIdx + 1 : 0
  const next = [...els]

  if (action === 'forward') {
    if (idx >= next.length - 1) return els
    ;[next[idx], next[idx + 1]] = [next[idx + 1]!, next[idx]!]
    return next
  }
  if (action === 'backward') {
    if (idx <= minIdx) return els
    ;[next[idx], next[idx - 1]] = [next[idx - 1]!, next[idx]!]
    return next
  }
  if (action === 'front') {
    next.splice(idx, 1)
    next.push(el)
    return next
  }
  // back — just above artboard root
  next.splice(idx, 1)
  next.splice(minIdx, 0, el)
  return next
}

function moveLayerToIndex(
  els: DesignElement[],
  id: string,
  toIndex: number,
): DesignElement[] {
  const from = els.findIndex((el) => el.id === id)
  if (from < 0) return els
  const el = els[from]!
  if (el.type === 'artboard_background') return els

  const frameIdx = els.findIndex((e) => e.type === 'artboard_background')
  const minIdx = frameIdx >= 0 ? frameIdx + 1 : 0
  let target = Math.max(minIdx, Math.min(els.length - 1, toIndex))
  if (els[target]?.type === 'artboard_background') target = minIdx

  const next = [...els]
  next.splice(from, 1)
  // After removal, adjust target if we removed an item before it
  const adjusted = from < target ? target - 1 : target
  next.splice(Math.max(minIdx, adjusted), 0, el)
  return next
}

function IconBtn({
  children,
  onClick,
  disabled,
  title,
  danger,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  title?: string
  danger?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-xs disabled:opacity-30 ${
        danger
          ? 'text-red-600 hover:bg-red-50'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  )
}

function ToolBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50"
    >
      {label}
    </button>
  )
}
