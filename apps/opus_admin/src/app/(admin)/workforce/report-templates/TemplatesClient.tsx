'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  ChevronDown,
  ChevronUp,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  REPORT_CADENCES,
  REPORT_CADENCE_LABELS,
  REPORT_FIELD_LABELS,
  REPORT_FIELD_TYPES,
  type ReportCadence,
  type ReportFieldType,
  type ReportTemplate,
} from '../_lib/report-schema'
import type { Department } from '../_lib/types'
import type {
  TemplateInput,
  TemplateResult,
  TemplateSectionInput,
} from './actions'

type Actions = {
  create: (input: TemplateInput) => Promise<TemplateResult>
  update: (id: string, input: TemplateInput) => Promise<TemplateResult>
  setActive: (id: string, isActive: boolean) => Promise<TemplateResult>
  remove: (id: string) => Promise<TemplateResult>
}

const makeId = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`

function blankSection(): TemplateSectionInput {
  return { id: makeId('s'), title: '', type: 'text', required: false, help: '', groups: [] }
}

export default function TemplatesClient({
  templates,
  departments,
  canEdit,
  actions,
}: {
  templates: ReportTemplate[]
  departments: Department[]
  canEdit: boolean
  actions: Actions
}) {
  const [editing, setEditing] = useState<ReportTemplate | 'new' | null>(null)

  if (editing) {
    return (
      <TemplateEditor
        template={editing === 'new' ? null : editing}
        departments={departments}
        actions={actions}
        onClose={() => setEditing(null)}
      />
    )
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <button data-opus-button="primary" data-opus-button-size="medium"
          type="button"
          onClick={() => setEditing('new')}
          className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
        >
          <Plus className="h-4 w-4" /> New template
        </button>
      )}

      {templates.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <p className="text-sm font-semibold text-gray-900">No report templates yet</p>
          <p className="mt-1 text-xs text-gray-500">Create one to let employees write reports.</p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {templates.map((t) => (
            <article
              key={t.id}
              className={`rounded-2xl border bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] ${t.isActive ? 'border-gray-100' : 'border-gray-100 opacity-70'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">{t.name}</h3>
                    <span className="inline-flex items-center rounded-full bg-[#9FE870]/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-900">
                      {REPORT_CADENCE_LABELS[t.cadence]}
                    </span>
                    {!t.isActive && (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        Inactive
                      </span>
                    )}
                  </div>
                  {t.description && <p className="mt-1 text-xs text-gray-600">{t.description}</p>}
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-500">
                    <ListChecks className="h-3.5 w-3.5" />
                    {t.sections.length} section{t.sections.length === 1 ? '' : 's'}
                    <span className="text-gray-300">·</span>
                    {t.departments.length === 0 ? 'All departments' : t.departments.join(', ')}
                  </p>
                </div>
                {canEdit && (
                  <button data-opus-button="control"
                    type="button"
                    onClick={() => setEditing(t)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function TemplateEditor({
  template,
  departments,
  actions,
  onClose,
}: {
  template: ReportTemplate | null
  departments: Department[]
  actions: Actions
  onClose: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(template?.name ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [cadence, setCadence] = useState<ReportCadence>(template?.cadence ?? 'daily')
  const [depts, setDepts] = useState<Set<string>>(new Set(template?.departments ?? []))
  const [isActive, setIsActive] = useState(template?.isActive ?? true)
  const [sections, setSections] = useState<TemplateSectionInput[]>(
    template
      ? template.sections.map((s) => ({
          id: s.id,
          title: s.title,
          type: s.type,
          required: Boolean(s.required),
          help: s.help ?? '',
          groups: s.groups ?? [],
        }))
      : [blankSection()],
  )
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function patchSection(i: number, patch: Partial<TemplateSectionInput>) {
    setSections((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }
  function move(i: number, dir: -1 | 1) {
    setSections((prev) => {
      const next = [...prev]
      const j = i + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  function save() {
    setError(null)
    const input: TemplateInput = {
      name,
      description: description.trim() || null,
      cadence,
      departments: [...depts],
      sections,
      isActive,
    }
    startTransition(async () => {
      const result = template
        ? await actions.update(template.id, input)
        : await actions.create(input)
      if (result.ok) {
        router.refresh()
        onClose()
      } else {
        setError(result.error)
      }
    })
  }

  function remove() {
    if (!template) return
    if (!confirm('Delete this template? Existing reports keep their content.')) return
    setError(null)
    startTransition(async () => {
      const result = await actions.remove(template.id)
      if (result.ok) {
        router.refresh()
        onClose()
      } else {
        setError(result.error)
      }
    })
  }

  const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-gray-500'
  const inputCls =
    'mt-1.5 w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900">
          {template ? 'Edit template' : 'New template'}
        </h2>
        <button data-opus-button="control"
          type="button"
          onClick={onClose}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          Back
        </button>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Template name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marketing Daily Report" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Cadence</label>
            <select value={cadence} onChange={(e) => setCadence(e.target.value as ReportCadence)} className={inputCls}>
              {REPORT_CADENCES.map((c) => (
                <option key={c} value={c}>{REPORT_CADENCE_LABELS[c]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label className={labelCls}>Description <span className="font-normal normal-case text-gray-400">(optional)</span></label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this report is for" className={inputCls} />
        </div>
        <div className="mt-4">
          <label className={labelCls}>Available to</label>
          <p className="mt-1 text-[11px] text-gray-400">Leave all unticked = available to everyone.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {departments.map((d) => {
              const on = depts.has(d)
              return (
                <button data-opus-button="neutral" data-opus-button-size="small"
                  key={d}
                  type="button"
                  onClick={() =>
                    setDepts((prev) => {
                      const next = new Set(prev)
                      if (next.has(d)) next.delete(d)
                      else next.add(d)
                      return next
                    })
                  }
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {d}
                </button>
              )
            })}
          </div>
        </div>
        <label className="mt-4 inline-flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
          Active (employees can pick this template)
        </label>
      </div>

      <div className="space-y-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Sections</h3>
        {sections.map((s, i) => (
          <SectionEditor
            key={s.id}
            section={s}
            index={i}
            total={sections.length}
            onChange={(patch) => patchSection(i, patch)}
            onMove={(dir) => move(i, dir)}
            onRemove={() => setSections((prev) => prev.filter((_, idx) => idx !== i))}
          />
        ))}
        <button data-opus-button="control"
          type="button"
          onClick={() => setSections((prev) => [...prev, blankSection()])}
          className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          <Plus className="h-4 w-4" /> Add section
        </button>
      </div>

      {error && <p role="alert" className="text-xs font-medium text-rose-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button data-opus-button="primary" data-opus-button-size="medium"
          type="button"
          disabled={pending || name.trim().length === 0}
          onClick={save}
          className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {template ? 'Save changes' : 'Create template'}
        </button>
        {template && (
          <button data-opus-button="danger" data-opus-button-size="medium"
            type="button"
            disabled={pending}
            onClick={remove}
            className="inline-flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        )}
      </div>
    </div>
  )
}

function SectionEditor({
  section,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  section: TemplateSectionInput
  index: number
  total: number
  onChange: (patch: Partial<TemplateSectionInput>) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
}) {
  const inputCls =
    'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none'
  const groups = section.groups ?? []

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div className="flex items-start gap-2">
        <span className="mt-2 text-xs font-bold text-gray-400">{index + 1}.</span>
        <div className="min-w-0 flex-1 space-y-2">
          <input
            value={section.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Section title (e.g. Introduction)"
            className={inputCls}
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={section.type}
              onChange={(e) => onChange({ type: e.target.value as ReportFieldType })}
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-900 focus:border-gray-400 focus:outline-none"
            >
              {REPORT_FIELD_TYPES.map((t) => (
                <option key={t} value={t}>{REPORT_FIELD_LABELS[t]}</option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={section.required}
                onChange={(e) => onChange({ required: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-gray-300"
              />
              Required
            </label>
          </div>
          <input
            value={section.help ?? ''}
            onChange={(e) => onChange({ help: e.target.value })}
            placeholder="Helper text (optional)"
            className={inputCls}
          />

          {section.type === 'grouped_bullets' && (
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Groups</p>
              <div className="mt-2 space-y-2">
                {groups.map((g, gi) => (
                  <div key={g.id} className="flex items-center gap-2">
                    <input
                      value={g.label}
                      onChange={(e) =>
                        onChange({
                          groups: groups.map((x, idx) => (idx === gi ? { ...x, label: e.target.value } : x)),
                        })
                      }
                      placeholder="Group label (e.g. Positive Response)"
                      className={`${inputCls} bg-white`}
                    />
                    <button data-opus-button="control"
                      type="button"
                      onClick={() => onChange({ groups: groups.filter((_, idx) => idx !== gi) })}
                      className="shrink-0 rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-white hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button data-opus-button="neutral" data-opus-button-size="small"
                  type="button"
                  onClick={() =>
                    onChange({ groups: [...groups, { id: makeId('g'), label: '' }] })
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-white"
                >
                  <Plus className="h-3 w-3" /> Add group
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1">
          <button data-opus-button="control" type="button" disabled={index === 0} onClick={() => onMove(-1)} className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30">
            <ChevronUp className="h-4 w-4" />
          </button>
          <button data-opus-button="control" type="button" disabled={index === total - 1} onClick={() => onMove(1)} className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30">
            <ChevronDown className="h-4 w-4" />
          </button>
          <button data-opus-button="control" type="button" onClick={onRemove} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-rose-600">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
