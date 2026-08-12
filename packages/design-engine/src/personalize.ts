import { compileDocument, type RenderPlan, type RenderPlanElement } from './compile'
import { fitText } from './fit'
import type { DesignDocument } from './schema'
import { getByPath, resolveTemplateString } from './variables'
import { evaluateVisibility } from './visibility'

export type GuestOverride = {
  /** Per-element overrides, e.g. { el_x: { fontSize: 35, content: '...' } } */
  elements?: Record<string, Record<string, unknown>>
  notes?: string
}

export type PersonalizedElement = RenderPlanElement & {
  resolvedContent?: string
  resolvedFontSize?: number
  resolvedLines?: string[]
  fitStatus?: 'fit' | 'warning' | 'blocked'
  fitReason?: string
  hiddenByRule?: boolean
}

export type PersonalizedPage = {
  id: string
  name: string
  width: number
  height: number
  unit: string
  background: string
  elements: PersonalizedElement[]
}

export type PersonalizedPlan = {
  releaseDocumentId: string
  engineVersion: string
  pages: PersonalizedPage[]
  blocked: boolean
  warnings: string[]
  errors: string[]
}

function applyOverride(
  el: RenderPlanElement,
  overrides?: GuestOverride,
): RenderPlanElement {
  const patch = overrides?.elements?.[el.id]
  if (!patch) return el
  return {
    ...el,
    props: { ...el.props, ...patch },
    transform: {
      ...el.transform,
      ...(typeof patch.x === 'number' ? { x: patch.x as number } : {}),
      ...(typeof patch.y === 'number' ? { y: patch.y as number } : {}),
      ...(typeof patch.width === 'number' ? { width: patch.width as number } : {}),
      ...(typeof patch.height === 'number' ? { height: patch.height as number } : {}),
    },
  }
}

function personalizeElement(
  el: RenderPlanElement,
  data: Record<string, unknown>,
  overrides?: GuestOverride,
): PersonalizedElement {
  const base = applyOverride(el, overrides)

  if (!evaluateVisibility(base.visibility ?? null, data)) {
    return { ...base, hiddenByRule: true, visible: false }
  }

  if (base.type === 'text') {
    const typography = base.props.typography as {
      fontSize: number
      lineHeight: number
      letterSpacing: number
    }
    const layout = base.props.layout as {
      fit: 'none' | 'shrink' | 'wrap' | 'shrink_wrap' | 'truncate' | 'block'
      minFontSize: number
      maxLines: number
      overflow: 'block' | 'warn' | 'ellipsis' | 'overflow'
    }

    let content = String(base.props.content ?? '')
    if (base.binding?.type === 'variable' && base.binding.path) {
      const v = getByPath(data, base.binding.path)
      content = v == null || v === '' ? base.binding.fallback ?? '' : String(v)
    } else {
      content = resolveTemplateString(content, data)
    }

    if (typeof overrides?.elements?.[el.id]?.fontSize === 'number') {
      const fontSize = overrides.elements[el.id].fontSize as number
      return {
        ...base,
        resolvedContent: content,
        resolvedFontSize: fontSize,
        resolvedLines: [content],
        fitStatus: 'fit',
        props: {
          ...base.props,
          content,
          typography: { ...typography, fontSize },
        },
      }
    }

    const fit = fitText({
      text: content,
      boxWidth: base.transform.width,
      boxHeight: base.transform.height,
      preferredFontSize: typography.fontSize,
      minFontSize: layout.minFontSize,
      maxLines: layout.maxLines,
      lineHeight: typography.lineHeight,
      letterSpacing: typography.letterSpacing,
      fit: layout.fit,
      overflow: layout.overflow,
    })

    return {
      ...base,
      resolvedContent: content,
      resolvedFontSize: fit.fontSize,
      resolvedLines: fit.lines,
      fitStatus: fit.status,
      fitReason: fit.reason,
      props: {
        ...base.props,
        content,
        typography: { ...typography, fontSize: fit.fontSize },
      },
    }
  }

  if (base.type === 'qr') {
    let payload = String(base.props.previewPayload ?? '')
    if (base.binding?.type === 'variable' && base.binding.path) {
      const v = getByPath(data, base.binding.path)
      payload = v == null ? payload : String(v)
    }
    return {
      ...base,
      resolvedContent: payload,
      props: { ...base.props, previewPayload: payload },
    }
  }

  return base
}

/** Merge event/guest data into a render plan (or compile from document). */
export function personalizePlan(
  planOrDoc: RenderPlan | DesignDocument,
  data: Record<string, unknown>,
  overrides?: GuestOverride,
): PersonalizedPlan {
  const plan: RenderPlan =
    'engineVersion' in planOrDoc && 'pages' in planOrDoc && 'compiledAt' in planOrDoc
      ? (planOrDoc as RenderPlan)
      : compileDocument(planOrDoc)

  const warnings: string[] = []
  const errors: string[] = []
  let blocked = false

  const pages = plan.pages.map((page) => ({
    id: page.id,
    name: page.name,
    width: page.width,
    height: page.height,
    unit: page.unit,
    background: page.background,
    elements: page.elements.map((el) => {
      const personalized = personalizeElement(el, data, overrides)
      if (personalized.fitStatus === 'blocked') {
        blocked = true
        errors.push(
          `${personalized.name}: ${personalized.fitReason ?? 'blocked'}`,
        )
      } else if (personalized.fitStatus === 'warning') {
        warnings.push(`${personalized.name}: ${personalized.fitReason ?? 'warning'}`)
      }
      return personalized
    }),
  }))

  return {
    releaseDocumentId: plan.documentId,
    engineVersion: plan.engineVersion,
    pages,
    blocked,
    warnings,
    errors,
  }
}

export type BulkGuestInput = {
  guestId: string
  guestKey?: string
  data: Record<string, unknown>
  override?: GuestOverride
}

export type BulkRenderItemResult = {
  guestId: string
  guestKey?: string
  status: 'ready' | 'warning' | 'blocked'
  plan: PersonalizedPlan
  reason?: string
}

/** Pure bulk personalisation (no I/O) — feed into a render queue worker. */
export function personalizeBulk(
  plan: RenderPlan,
  guests: BulkGuestInput[],
): BulkRenderItemResult[] {
  return guests.map((g) => {
    const personalized = personalizePlan(plan, g.data, g.override)
    if (personalized.blocked) {
      return {
        guestId: g.guestId,
        guestKey: g.guestKey,
        status: 'blocked' as const,
        plan: personalized,
        reason: personalized.errors[0] ?? 'render_blocked',
      }
    }
    if (personalized.warnings.length) {
      return {
        guestId: g.guestId,
        guestKey: g.guestKey,
        status: 'warning' as const,
        plan: personalized,
      }
    }
    return {
      guestId: g.guestId,
      guestKey: g.guestKey,
      status: 'ready' as const,
      plan: personalized,
    }
  })
}
