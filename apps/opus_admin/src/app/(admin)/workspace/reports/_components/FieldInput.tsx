'use client'

import { Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  emptyValue,
  type DateRangeValue,
  type KpiValue,
  type ReportField,
  type ReportSubField,
  type RowValue,
} from '@/lib/reports/fields'

// One input per field type. This is the whole renderer: there is no per-report
// form anywhere in the codebase, so adding a report type is an INSERT into
// report_template_versions and nothing else.
//
// Every branch is controlled and reports its value up. Nothing here validates:
// validation lives in lib/reports/fields.ts and runs on the server, and a
// second copy of the rules in the UI is a second copy to get out of step.

const INPUT =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500'

export type SelectOption = { value: string; label: string }

export type FieldOptions = {
  employees: SelectOption[]
  departments: SelectOption[]
  projects: SelectOption[]
  tasks: SelectOption[]
}

export default function FieldInput({
  field,
  value,
  onChange,
  disabled,
  options,
  invalid,
}: {
  field: ReportField
  value: unknown
  onChange: (next: unknown) => void
  disabled?: boolean
  options: FieldOptions
  invalid?: boolean
}) {
  const className = cn(INPUT, invalid && 'border-rose-300 bg-rose-50/40')

  switch (field.type) {
    case 'short_text':
      return (
        <input
          type="text"
          className={className}
          value={(value as string) ?? ''}
          placeholder={field.placeholder}
          maxLength={field.maxLength ?? 200}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    case 'long_text':
      return (
        <textarea
          rows={5}
          className={className}
          value={(value as string) ?? ''}
          placeholder={field.placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    case 'number':
    case 'percentage':
    case 'currency':
      return (
        <div className="flex items-center gap-2">
          {field.type === 'currency' && (
            <span className="text-sm text-gray-500">{field.currencyCode ?? 'TZS'}</span>
          )}
          <input
            type="number"
            className={className}
            value={value === null || value === undefined ? '' : String(value)}
            placeholder={field.placeholder}
            min={field.min}
            max={field.max}
            // Currency defaults to whole numbers, which is what the validator
            // enforces; matching it here stops the browser offering a step the
            // server will reject.
            step={field.type === 'currency' ? (field.precision ?? 0) === 0 ? 1 : 0.01 : 'any'}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          />
          {field.type === 'percentage' && <span className="text-sm text-gray-500">%</span>}
        </div>
      )

    case 'rating': {
      const scale = field.scale ?? 5
      return (
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: scale }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => onChange(value === n ? null : n)}
              className={cn(
                'h-9 w-9 rounded-full border text-sm font-semibold transition-colors',
                value === n
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                disabled && 'opacity-50',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      )
    }

    case 'yes_no':
      return (
        <div className="flex gap-2">
          {[
            { label: 'Yes', v: true },
            { label: 'No', v: false },
          ].map((choice) => (
            <button
              key={choice.label}
              type="button"
              disabled={disabled}
              onClick={() => onChange(value === choice.v ? null : choice.v)}
              className={cn(
                'rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors',
                value === choice.v
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                disabled && 'opacity-50',
              )}
            >
              {choice.label}
            </button>
          ))}
        </div>
      )

    case 'date':
      return (
        <input
          type="date"
          className={className}
          value={(value as string) ?? ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    case 'date_range': {
      const range = (value as DateRangeValue) ?? { start: null, end: null }
      return (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            className={className}
            value={range.start ?? ''}
            disabled={disabled}
            onChange={(e) => onChange({ ...range, start: e.target.value || null })}
          />
          <span className="text-sm text-gray-400">to</span>
          <input
            type="date"
            className={className}
            value={range.end ?? ''}
            disabled={disabled}
            onChange={(e) => onChange({ ...range, end: e.target.value || null })}
          />
        </div>
      )
    }

    case 'employee_select':
    case 'department_select':
    case 'project_select':
    case 'task_select': {
      const list =
        field.type === 'employee_select'
          ? options.employees
          : field.type === 'department_select'
            ? options.departments
            : field.type === 'project_select'
              ? options.projects
              : options.tasks
      return (
        <select
          className={className}
          value={(value as string) ?? ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose one</option>
          {list.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    }

    case 'kpi_value': {
      const kpi = (value as KpiValue) ?? { value: null, target: null, note: null }
      return (
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-[12px] font-medium text-gray-500">
            Actual{field.unit ? ` (${field.unit})` : ''}
            <input
              type="number"
              className={cn(className, 'mt-1')}
              value={kpi.value ?? ''}
              disabled={disabled}
              onChange={(e) =>
                onChange({ ...kpi, value: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
          </label>
          <label className="text-[12px] font-medium text-gray-500">
            Target
            <input
              type="number"
              className={cn(className, 'mt-1')}
              value={kpi.target ?? ''}
              disabled={disabled}
              onChange={(e) =>
                onChange({ ...kpi, target: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
          </label>
          <label className="text-[12px] font-medium text-gray-500">
            Note
            <input
              type="text"
              className={cn(className, 'mt-1')}
              value={kpi.note ?? ''}
              disabled={disabled}
              onChange={(e) => onChange({ ...kpi, note: e.target.value })}
            />
          </label>
        </div>
      )
    }

    case 'file': {
      const files = (value as { attachmentId: string; fileName: string }[]) ?? []
      return (
        <div className="space-y-2">
          {files.length === 0 ? (
            <p className="text-[13px] text-gray-400">No files attached.</p>
          ) : (
            <ul className="space-y-1.5">
              {files.map((f) => (
                <li
                  key={f.attachmentId}
                  className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  <span className="truncate text-gray-900">{f.fileName}</span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() =>
                        onChange(files.filter((x) => x.attachmentId !== f.attachmentId))
                      }
                      className="text-gray-400 hover:text-rose-600"
                      aria-label={`Remove ${f.fileName}`}
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[12px] text-gray-400">
            Attach files from the Attachments panel below. Up to {field.maxFiles ?? 10}.
          </p>
        </div>
      )
    }

    case 'repeatable_list':
    case 'table': {
      const rows = (value as RowValue[]) ?? []
      const subFields = field.subFields ?? []
      const setRow = (index: number, next: RowValue) =>
        onChange(rows.map((r, i) => (i === index ? next : r)))

      return (
        <div className="space-y-2">
          {field.type === 'table' && rows.length > 0 && (
            <div className="hidden gap-2 px-1 sm:grid" style={{ gridTemplateColumns: `repeat(${subFields.length}, minmax(0,1fr)) 2rem` }}>
              {subFields.map((sub) => (
                <span key={sub.key} className="text-[12px] font-semibold text-gray-500">
                  {sub.label}
                  {sub.required && <span className="text-rose-500"> *</span>}
                </span>
              ))}
              <span />
            </div>
          )}

          {rows.map((row, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-lg border border-gray-200 p-2 sm:border-0 sm:p-0"
              style={{ gridTemplateColumns: `repeat(${subFields.length}, minmax(0,1fr)) 2rem` }}
            >
              {subFields.map((sub) => (
                <SubFieldInput
                  key={sub.key}
                  sub={sub}
                  value={row[sub.key]}
                  disabled={disabled}
                  options={options}
                  showLabel={field.type === 'repeatable_list'}
                  onChange={(next) => setRow(index, { ...row, [sub.key]: next })}
                />
              ))}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                  className="self-center text-gray-400 hover:text-rose-600"
                  aria-label="Remove row"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                </button>
              )}
            </div>
          ))}

          {!disabled && (!field.maxRows || rows.length < field.maxRows) && (
            <button
              type="button"
              onClick={() => onChange([...rows, {}])}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3.5 py-1.5 text-[13px] font-medium text-gray-600 hover:bg-gray-50"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Add row
            </button>
          )}
        </div>
      )
    }
  }
}

function SubFieldInput({
  sub,
  value,
  onChange,
  disabled,
  options,
  showLabel,
}: {
  sub: ReportSubField
  value: unknown
  onChange: (next: unknown) => void
  disabled?: boolean
  options: FieldOptions
  showLabel?: boolean
}) {
  // A sub-field is a field with a narrower type set, so it renders through the
  // same component. One renderer, one set of behaviours.
  const asField: ReportField = { key: sub.key, type: sub.type, label: sub.label }
  const input = (
    <FieldInput
      field={asField}
      value={value ?? emptyValue(asField)}
      onChange={onChange}
      disabled={disabled}
      options={options}
    />
  )
  if (!showLabel) return input
  return (
    <label className="block text-[12px] font-medium text-gray-500">
      {sub.label}
      {sub.required && <span className="text-rose-500"> *</span>}
      <span className="mt-1 block">{input}</span>
    </label>
  )
}
