// Report field definitions and validation — pure, no I/O.
//
// THE POINT OF THIS FILE. A report type is data, not code. There is no
// hard-coded form per report: a template version carries an ordered list of
// field definitions, the renderer walks it, and this module says what each type
// accepts. Adding "Quarterly Studio Utilisation" is an INSERT, not a deploy.
//
// The value shape for each type is fixed here and nowhere else, because three
// things have to agree about it: the form that collects it, the validator that
// gates submission, and the PDF that renders a stored version months later.
//
// Pure and free of 'server-only' so the client renderer, the server action and
// the PDF generator all import the same rules.

export const REPORT_FIELD_TYPES = [
  'short_text',
  'long_text',
  'number',
  'percentage',
  'currency',
  'date',
  'date_range',
  'employee_select',
  'department_select',
  'project_select',
  'task_select',
  'kpi_value',
  'file',
  'repeatable_list',
  'table',
  'yes_no',
  'rating',
] as const

export type ReportFieldType = (typeof REPORT_FIELD_TYPES)[number]

export const REPORT_FIELD_LABELS: Record<ReportFieldType, string> = {
  short_text: 'Short text',
  long_text: 'Long text',
  number: 'Number',
  percentage: 'Percentage',
  currency: 'Currency',
  date: 'Date',
  date_range: 'Date range',
  employee_select: 'Employee',
  department_select: 'Department',
  project_select: 'Project',
  task_select: 'Task',
  kpi_value: 'KPI value',
  file: 'File attachment',
  repeatable_list: 'Repeatable list',
  table: 'Table',
  yes_no: 'Yes / no',
  rating: 'Rating',
}

/**
 * Who supplies the value.
 *
 * From OF-ENG-RPT-006: "The system fills in whatever it already knows. Anything
 * the dashboard can count is shown as a value the employee confirms. They only
 * type what the system cannot know." This is the property that makes a daily
 * report take under three minutes, so it belongs in the template, not in a
 * per-form special case.
 *
 * 'employee'   the person types it.
 * 'system'     resolved server-side from `systemSourceKey` and shown for
 *              confirmation. The renderer shows a value, not an empty input.
 * 'calculated' derived from other fields in the same submission. Never entered,
 *              never confirmed.
 *
 * Absent means 'employee', so every template written before this existed keeps
 * behaving exactly as it did.
 */
export const REPORT_FILLED_BY = ['employee', 'system', 'calculated'] as const
export type ReportFilledBy = (typeof REPORT_FILLED_BY)[number]

/** One column of a `table` field, or one input of a `repeatable_list` item. */
export type ReportSubField = {
  key: string
  label: string
  /** Sub-fields are deliberately restricted to scalars: a table of tables is a
   *  spreadsheet, and nobody fills one in on a phone. */
  type: Extract<
    ReportFieldType,
    | 'short_text'
    | 'long_text'
    | 'number'
    | 'percentage'
    | 'currency'
    | 'date'
    | 'yes_no'
    | 'rating'
    | 'employee_select'
    | 'department_select'
  >
  required?: boolean
}

export type ReportField = {
  /** Stable within a template version. Content is keyed by this. */
  key: string
  type: ReportFieldType
  label: string
  help?: string
  placeholder?: string
  required?: boolean

  /** Who supplies the value. Absent means 'employee'. */
  filledBy?: ReportFilledBy
  /** Required when filledBy is 'system'. Names the server-side resolver that
   *  produces the value. A system field without one is a template that promises
   *  a number nothing can supply, so parseFormDefinition discards it. */
  systemSourceKey?: string
  /**
   * The "Feeds" column of the spec: which KPI this number is used to calculate.
   * Absent means the field is context only.
   *
   * Holds `growth_metric_definitions.code` rather than the row id. jsonb cannot
   * carry a foreign key either way, and a code survives a restore, reads in a
   * diff, and can be written by hand when authoring a template.
   */
  feedsMetricCode?: string

  // ---- numeric constraints (number, percentage, currency, rating, kpi_value)
  min?: number
  max?: number
  /** Decimal places accepted. Currency defaults to 0 for TZS. */
  precision?: number
  /** currency only. ISO code, informational: no conversion happens. */
  currencyCode?: string
  /** rating only. Defaults to 5. */
  scale?: number

  // ---- text constraints
  maxLength?: number

  // ---- kpi_value only
  /** @deprecated Free string that referenced nothing. Use `feedsMetricCode`,
   *  which names a real growth_metric_definitions row. Kept so stored template
   *  versions, which are immutable, still parse. */
  kpiKey?: string
  unit?: string

  // ---- repeatable_list / table
  subFields?: ReportSubField[]
  minRows?: number
  maxRows?: number

  // ---- file
  /** Max attachments for this field. */
  maxFiles?: number
}

export type ReportFieldSection = {
  key: string
  title: string
  description?: string
  fields: ReportField[]
}

/** A template version's structure, as stored in report_template_versions.fields. */
export type ReportFormDefinition = {
  sections: ReportFieldSection[]
}

export type ReportContent = Record<string, unknown>

// ---------------------------------------------------------------------------
// Value shapes
// ---------------------------------------------------------------------------

export type DateRangeValue = { start: string | null; end: string | null }
export type KpiValue = { value: number | null; target: number | null; note?: string | null }
export type FileRef = { attachmentId: string; fileName: string }
export type RowValue = Record<string, unknown>

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The empty value for a type. Used to seed a new draft and to normalise a
 *  field that was added to a template version after a draft was started. */
export function emptyValue(field: ReportField): unknown {
  switch (field.type) {
    case 'short_text':
    case 'long_text':
    case 'employee_select':
    case 'department_select':
    case 'project_select':
    case 'task_select':
    case 'date':
      return ''
    case 'number':
    case 'percentage':
    case 'currency':
    case 'rating':
      return null
    case 'yes_no':
      return null
    case 'date_range':
      return { start: null, end: null } satisfies DateRangeValue
    case 'kpi_value':
      return { value: null, target: null, note: null } satisfies KpiValue
    case 'file':
      return [] as FileRef[]
    case 'repeatable_list':
    case 'table':
      return [] as RowValue[]
  }
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>
    // A date range or KPI with nothing filled in is blank.
    return Object.values(v).every((x) => x === null || x === undefined || x === '')
  }
  return false
}

export type FieldError = { fieldKey: string; message: string; rowIndex?: number; subKey?: string }

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function decimals(value: number): number {
  const text = String(value)
  const dot = text.indexOf('.')
  return dot === -1 ? 0 : text.length - dot - 1
}

/**
 * Validate one value against one field definition. Returns the problems, so a
 * caller can report every bad field at once instead of one per round-trip.
 *
 * `required` is checked by the caller (validateContent) rather than here, so
 * this can also be used to validate a partially-filled draft.
 */
export function validateFieldValue(field: ReportField, value: unknown): FieldError[] {
  const errors: FieldError[] = []
  const fail = (message: string, extra: Partial<FieldError> = {}) =>
    errors.push({ fieldKey: field.key, message, ...extra })

  if (isBlank(value)) return errors

  switch (field.type) {
    case 'short_text':
    case 'long_text': {
      if (typeof value !== 'string') return [{ fieldKey: field.key, message: 'Expected text.' }]
      const limit = field.maxLength ?? (field.type === 'short_text' ? 200 : 20000)
      if (value.length > limit) fail(`Keep this under ${limit} characters.`)
      break
    }

    case 'number':
    case 'currency':
    case 'percentage':
    case 'rating': {
      const parsed = num(value)
      if (parsed === null) return [{ fieldKey: field.key, message: 'Enter a number.' }]
      if (field.type === 'percentage') {
        const min = field.min ?? 0
        const max = field.max ?? 100
        if (parsed < min || parsed > max) fail(`Enter a percentage between ${min} and ${max}.`)
      } else if (field.type === 'rating') {
        const scale = field.scale ?? 5
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > scale) {
          fail(`Choose a rating from 1 to ${scale}.`)
        }
      } else {
        if (field.min !== undefined && parsed < field.min) fail(`Minimum is ${field.min}.`)
        if (field.max !== undefined && parsed > field.max) fail(`Maximum is ${field.max}.`)
        // Currency defaults to whole numbers: OpusFesta bills in TZS, which has
        // no practical subunit.
        const allowed = field.precision ?? (field.type === 'currency' ? 0 : 2)
        if (decimals(parsed) > allowed) {
          fail(allowed === 0 ? 'Enter a whole number.' : `Use at most ${allowed} decimal places.`)
        }
        if (field.type === 'currency' && parsed < 0 && field.min === undefined) {
          fail('Amount cannot be negative.')
        }
      }
      break
    }

    case 'date': {
      if (typeof value !== 'string' || !DATE_RE.test(value)) fail('Pick a valid date.')
      break
    }

    case 'date_range': {
      const range = value as DateRangeValue
      if (typeof range !== 'object' || range === null) return [{ fieldKey: field.key, message: 'Pick a date range.' }]
      if (range.start && !DATE_RE.test(range.start)) fail('The start date is not valid.')
      if (range.end && !DATE_RE.test(range.end)) fail('The end date is not valid.')
      if (range.start && range.end && range.end < range.start) {
        fail('The end date must be on or after the start date.')
      }
      break
    }

    case 'employee_select':
    case 'project_select':
    case 'task_select': {
      if (typeof value !== 'string' || !UUID_RE.test(value)) fail('Choose an option from the list.')
      break
    }

    case 'department_select': {
      if (typeof value !== 'string' || value.trim() === '') fail('Choose a department.')
      break
    }

    case 'yes_no': {
      if (typeof value !== 'boolean') fail('Choose yes or no.')
      break
    }

    case 'kpi_value': {
      const kpi = value as KpiValue
      if (typeof kpi !== 'object' || kpi === null) return [{ fieldKey: field.key, message: 'Enter a KPI value.' }]
      if (kpi.value !== null && kpi.value !== undefined && num(kpi.value) === null) {
        fail('The KPI value must be a number.')
      }
      if (kpi.target !== null && kpi.target !== undefined && num(kpi.target) === null) {
        fail('The KPI target must be a number.')
      }
      break
    }

    case 'file': {
      if (!Array.isArray(value)) return [{ fieldKey: field.key, message: 'Attach a file.' }]
      const max = field.maxFiles ?? 10
      if (value.length > max) fail(`Attach at most ${max} files.`)
      for (const item of value as FileRef[]) {
        if (!item || typeof item.attachmentId !== 'string' || !UUID_RE.test(item.attachmentId)) {
          fail('One of the attachments is not valid.')
          break
        }
      }
      break
    }

    case 'repeatable_list':
    case 'table': {
      if (!Array.isArray(value)) return [{ fieldKey: field.key, message: 'Add at least one row.' }]
      const rows = value as RowValue[]
      if (field.minRows !== undefined && rows.length < field.minRows) {
        fail(`Add at least ${field.minRows} ${field.minRows === 1 ? 'row' : 'rows'}.`)
      }
      if (field.maxRows !== undefined && rows.length > field.maxRows) {
        fail(`Add at most ${field.maxRows} rows.`)
      }
      const subFields = field.subFields ?? []
      rows.forEach((row, rowIndex) => {
        if (typeof row !== 'object' || row === null) {
          fail('One of the rows is not valid.', { rowIndex })
          return
        }
        for (const sub of subFields) {
          const cell = row[sub.key]
          if (sub.required && isBlank(cell)) {
            fail(`${sub.label} is required.`, { rowIndex, subKey: sub.key })
            continue
          }
          // Sub-fields validate through the same rules as top-level fields.
          const subErrors = validateFieldValue(
            { key: `${field.key}.${sub.key}`, type: sub.type, label: sub.label },
            cell,
          )
          for (const e of subErrors) {
            fail(`${sub.label}: ${e.message}`, { rowIndex, subKey: sub.key })
          }
        }
      })
      break
    }
  }

  return errors
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: FieldError[] }

/**
 * Validate a whole submission against a form definition.
 *
 * `enforceRequired` is false while a draft is being autosaved and true at
 * submit. A draft that cannot be saved because it is incomplete is a draft
 * feature nobody uses.
 */
export function validateContent(
  definition: ReportFormDefinition,
  content: ReportContent,
  options: { enforceRequired?: boolean } = {},
): ValidationResult {
  const enforceRequired = options.enforceRequired ?? true
  const errors: FieldError[] = []

  for (const section of definition.sections) {
    for (const field of section.fields) {
      const value = content[field.key]
      if (field.required && enforceRequired && isBlank(value)) {
        errors.push({ fieldKey: field.key, message: `${field.label} is required.` })
        continue
      }
      errors.push(...validateFieldValue(field, value))
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}

/** True when the value comes from the server rather than from the person. */
export function isSystemFilled(field: ReportField): boolean {
  return field.filledBy === 'system' || field.filledBy === 'calculated'
}

/** Keys the server must resolve before a draft can be cleaned. Lets a caller
 *  assert it has supplied everything rather than discovering a blanked field. */
export function systemFieldKeys(definition: ReportFormDefinition): string[] {
  return allFields(definition).filter(isSystemFilled).map((f) => f.key)
}

/**
 * Drop anything the definition does not declare, and fill in what it does.
 *
 * Called before every write. Three jobs now:
 *
 * 1. A client cannot smuggle extra keys into stored content.
 * 2. A field added to the template after a draft was started appears with its
 *    empty value rather than as `undefined` the renderer has to special-case.
 * 3. A client cannot author a system-filled value. This is the teeth behind
 *    "every number appears once, calculated in one place". If the browser could
 *    POST its own figure for "Events closed", the number would exist twice and
 *    the two copies could disagree, which is exactly what the rule forbids.
 *
 * System fields therefore take their value from `options.systemValues` and from
 * nowhere else. A system field with no resolved value is emptied rather than
 * filled from the request: failing to an empty box is visible and recoverable,
 * whereas trusting the client is neither.
 *
 * Templates that declare no `filledBy` are entirely unaffected, so every
 * template written before this existed behaves exactly as it did.
 */
export function cleanContent(
  definition: ReportFormDefinition,
  content: ReportContent,
  options: { systemValues?: ReportContent } = {},
): ReportContent {
  const cleaned: ReportContent = {}
  for (const section of definition.sections) {
    for (const field of section.fields) {
      if (isSystemFilled(field)) {
        const resolved = options.systemValues?.[field.key]
        cleaned[field.key] = resolved === undefined ? emptyValue(field) : resolved
        continue
      }
      const value = content[field.key]
      cleaned[field.key] = value === undefined ? emptyValue(field) : value
    }
  }
  return cleaned
}

/** Every field in a definition, flattened in render order. */
export function allFields(definition: ReportFormDefinition): ReportField[] {
  return definition.sections.flatMap((s) => s.fields)
}

/**
 * Parse a stored `fields` JSON value into a definition, discarding anything
 * malformed. Storage is jsonb, so this is the boundary where an unknown value
 * becomes a typed one.
 */
export function parseFormDefinition(value: unknown): ReportFormDefinition {
  if (!value || typeof value !== 'object') return { sections: [] }
  const raw = value as { sections?: unknown }
  if (!Array.isArray(raw.sections)) return { sections: [] }

  const sections: ReportFieldSection[] = []
  for (const s of raw.sections) {
    if (!s || typeof s !== 'object') continue
    const section = s as { key?: unknown; title?: unknown; description?: unknown; fields?: unknown }
    if (typeof section.key !== 'string' || typeof section.title !== 'string') continue
    const fields: ReportField[] = []
    if (Array.isArray(section.fields)) {
      for (const f of section.fields) {
        if (!f || typeof f !== 'object') continue
        const field = f as Record<string, unknown>
        if (typeof field.key !== 'string' || typeof field.label !== 'string') continue
        if (!REPORT_FIELD_TYPES.includes(field.type as ReportFieldType)) continue

        // filledBy decides whether a client may author this value, so an
        // unrecognised one is not downgraded to 'employee' and waved through:
        // that would hand a system number back to manual entry, which is the
        // one thing "every number appears once" rules out. Discard the field,
        // matching how an unknown type is treated.
        if (field.filledBy !== undefined) {
          if (!REPORT_FILLED_BY.includes(field.filledBy as ReportFilledBy)) continue
          // A system field names its resolver or it promises a value that
          // nothing can supply.
          if (
            field.filledBy === 'system' &&
            (typeof field.systemSourceKey !== 'string' || field.systemSourceKey.trim() === '')
          ) {
            continue
          }
        }
        if (field.feedsMetricCode !== undefined && typeof field.feedsMetricCode !== 'string') continue

        fields.push(field as unknown as ReportField)
      }
    }
    sections.push({
      key: section.key,
      title: section.title,
      description: typeof section.description === 'string' ? section.description : undefined,
      fields,
    })
  }
  return { sections }
}
