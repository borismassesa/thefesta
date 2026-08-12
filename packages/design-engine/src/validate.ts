import { compileDocument, type RenderPlan } from './compile'
import { fitText } from './fit'
import type { DesignDocument } from './schema'
import { parseDesignDocument } from './schema'
import { getByPath, getVariableByPath, stressTestGuests } from './variables'
import { evaluateVisibility } from './visibility'

export type PreflightSeverity = 'error' | 'warning' | 'info'

export type PreflightIssue = {
  code: string
  severity: PreflightSeverity
  message: string
  elementId?: string
  pageId?: string
  guestKey?: string
}

export type PreflightResult = {
  ok: boolean
  releasable: boolean
  issues: PreflightIssue[]
  stress?: {
    total: number
    pass: number
    warning: number
    failed: number
  }
}

function push(
  issues: PreflightIssue[],
  issue: PreflightIssue,
) {
  issues.push(issue)
}

export function validateDocument(input: DesignDocument | unknown): PreflightResult {
  const issues: PreflightIssue[] = []
  let doc: DesignDocument
  try {
    doc = parseDesignDocument(input)
  } catch (err) {
    return {
      ok: false,
      releasable: false,
      issues: [
        {
          code: 'SCHEMA_INVALID',
          severity: 'error',
          message: err instanceof Error ? err.message : 'Invalid design document',
        },
      ],
    }
  }

  if (doc.pages.length === 0) {
    push(issues, {
      code: 'NO_PAGES',
      severity: 'error',
      message: 'Document has no pages',
    })
  }

  for (const page of doc.pages) {
    for (const el of page.elements) {
      if (el.type === 'text') {
        if (el.binding?.type === 'variable' && el.binding.path) {
          const field = getVariableByPath(el.binding.path)
          if (!field) {
            push(issues, {
              code: 'UNKNOWN_VARIABLE',
              severity: 'error',
              message: `Unknown variable path ${el.binding.path}`,
              elementId: el.id,
              pageId: page.id,
            })
          }
        }
        if (!el.typography.fontFamily) {
          push(issues, {
            code: 'FONT_MISSING',
            severity: 'error',
            message: `Text "${el.name}" has no font family`,
            elementId: el.id,
            pageId: page.id,
          })
        }
      }

      if (el.type === 'image' && el.photoRole === 'couple_photo' && !el.src && !el.asset) {
        push(issues, {
          code: 'COUPLE_PHOTO_UNBOUND',
          severity: 'warning',
          message: `Couple photo "${el.name}" has no image yet`,
          elementId: el.id,
          pageId: page.id,
        })
      }

      if (el.type === 'qr') {
        const path = el.binding?.path
        if (!path) {
          push(issues, {
            code: 'QR_UNBOUND',
            severity: 'error',
            message: `QR "${el.name}" has no data binding`,
            elementId: el.id,
            pageId: page.id,
          })
        }
        if (el.transform.width < 80 || el.transform.height < 80) {
          push(issues, {
            code: 'QR_TOO_SMALL',
            severity: 'warning',
            message: `QR "${el.name}" may be unscannable at this size`,
            elementId: el.id,
            pageId: page.id,
          })
        }
      }

      if (
        (el.type === 'image' || el.type === 'svg_graphic' || el.type === 'artboard_background') &&
        el.type !== 'artboard_background' &&
        !el.src &&
        !el.asset
      ) {
        // artboard_background can be fill-only
        if (el.type === 'image' || el.type === 'svg_graphic') {
          push(issues, {
            code: 'ASSET_MISSING',
            severity: 'warning',
            message: `"${el.name}" has no asset reference`,
            elementId: el.id,
            pageId: page.id,
          })
        }
      }
    }
  }

  const plan = compileDocument(doc)
  const stress = runStressPreflight(plan, issues)

  const hasError = issues.some((i) => i.severity === 'error')
  const blocked = issues.some((i) => i.code === 'STRESS_BLOCKED' || i.severity === 'error')

  return {
    ok: !hasError,
    releasable: !blocked,
    issues,
    stress,
  }
}

function runStressPreflight(plan: RenderPlan, issues: PreflightIssue[]) {
  const guests = stressTestGuests()
  let pass = 0
  let warning = 0
  let failed = 0

  for (let gi = 0; gi < guests.length; gi++) {
    const data = guests[gi]
    let guestBlocked = false
    let guestWarn = false

    for (const page of plan.pages) {
      for (const el of page.elements) {
        if (el.type !== 'text') continue
        if (!evaluateVisibility(el.visibility ?? null, data)) continue

        const typography = el.props.typography as {
          fontSize: number
          lineHeight: number
          letterSpacing: number
        }
        const layout = el.props.layout as {
          fit: 'none' | 'shrink' | 'wrap' | 'shrink_wrap' | 'truncate' | 'block'
          minFontSize: number
          maxLines: number
          overflow: 'block' | 'warn' | 'ellipsis' | 'overflow'
        }

        let content = String(el.props.content ?? '')
        if (el.binding?.type === 'variable' && el.binding.path) {
          const v = getByPath(data, el.binding.path)
          content = v == null ? el.binding.fallback ?? '' : String(v)
        }

        const result = fitText({
          text: content,
          boxWidth: el.transform.width,
          boxHeight: el.transform.height,
          preferredFontSize: typography.fontSize,
          minFontSize: layout.minFontSize,
          maxLines: layout.maxLines,
          lineHeight: typography.lineHeight,
          letterSpacing: typography.letterSpacing,
          fit: layout.fit,
          overflow: layout.overflow,
        })

        if (result.status === 'blocked') {
          guestBlocked = true
          push(issues, {
            code: 'STRESS_BLOCKED',
            severity: 'error',
            message: `Guest case #${gi + 1}: "${el.name}" cannot fit — ${result.reason}`,
            elementId: el.id,
            pageId: page.id,
            guestKey: `stress_${gi}`,
          })
        } else if (result.status === 'warning') {
          guestWarn = true
        }
      }
    }

    if (guestBlocked) failed += 1
    else if (guestWarn) warning += 1
    else pass += 1
  }

  return { total: guests.length, pass, warning, failed }
}

export function validateRenderPlan(plan: RenderPlan): PreflightResult {
  const issues: PreflightIssue[] = []
  if (!plan.pages.length) {
    push(issues, {
      code: 'PLAN_EMPTY',
      severity: 'error',
      message: 'Render plan has no pages',
    })
  }
  for (const page of plan.pages) {
    if (page.width <= 0 || page.height <= 0) {
      push(issues, {
        code: 'INVALID_PAGE_SIZE',
        severity: 'error',
        message: `Page "${page.name}" has invalid dimensions`,
        pageId: page.id,
      })
    }
  }
  const hasError = issues.some((i) => i.severity === 'error')
  return { ok: !hasError, releasable: !hasError, issues }
}
