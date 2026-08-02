'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { requirePermission } from '@/lib/admin-auth'
import { DEPARTMENTS } from '../_lib/types'
import {
  REPORT_CADENCES,
  REPORT_FIELD_TYPES,
  type ReportCadence,
  type ReportFieldType,
} from '../_lib/report-schema'

// Admin template builder actions. Defining report types is an admin-level
// operation — gated on workforce.write. The builder posts the full section
// list; we validate shape and persist `sections` as jsonb.

const DEPARTMENT_SET = new Set<string>(DEPARTMENTS)
const CADENCE_SET = new Set<ReportCadence>(REPORT_CADENCES)
const FIELD_SET = new Set<ReportFieldType>(REPORT_FIELD_TYPES)

export type TemplateSectionInput = {
  id: string
  title: string
  type: ReportFieldType
  required: boolean
  help?: string | null
  groups?: { id: string; label: string }[]
}

export type TemplateInput = {
  name: string
  description?: string | null
  cadence: ReportCadence
  departments: string[]
  sections: TemplateSectionInput[]
  isActive: boolean
}

export type TemplateResult = { ok: true; id: string } | { ok: false; error: string }

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// Validate + normalize the section list. Returns the clean jsonb-ready
// array or an error string.
function buildSections(
  input: TemplateSectionInput[],
): { ok: true; sections: Record<string, unknown>[] } | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: 'Add at least one section.' }
  }
  const seen = new Set<string>()
  const out: Record<string, unknown>[] = []
  for (const s of input) {
    const title = s.title?.trim()
    if (!title) return { ok: false, error: 'Every section needs a title.' }
    if (!FIELD_SET.has(s.type)) return { ok: false, error: `Unknown field type for “${title}”.` }
    const id = s.id?.trim() || slugify(title)
    if (!id) return { ok: false, error: `Couldn’t derive an id for “${title}”.` }
    if (seen.has(id)) return { ok: false, error: `Duplicate section id “${id}”.` }
    seen.add(id)

    const section: Record<string, unknown> = {
      id,
      title,
      type: s.type,
      required: Boolean(s.required),
    }
    if (s.help?.trim()) section.help = s.help.trim()

    if (s.type === 'grouped_bullets') {
      const groups = (s.groups ?? [])
        .map((g) => ({ id: g.id?.trim() || slugify(g.label), label: g.label?.trim() ?? '' }))
        .filter((g) => g.label)
      if (groups.length === 0) {
        return { ok: false, error: `“${title}” needs at least one group.` }
      }
      const gseen = new Set<string>()
      for (const g of groups) {
        if (!g.id) return { ok: false, error: `A group in “${title}” has no id.` }
        if (gseen.has(g.id)) return { ok: false, error: `Duplicate group id in “${title}”.` }
        gseen.add(g.id)
      }
      section.groups = groups
    }
    out.push(section)
  }
  return { ok: true, sections: out }
}

function validateMeta(
  input: TemplateInput,
): { ok: true } | { ok: false; error: string } {
  if (!input.name?.trim()) return { ok: false, error: 'Give the template a name.' }
  if (!CADENCE_SET.has(input.cadence)) return { ok: false, error: 'Pick a valid cadence.' }
  for (const d of input.departments ?? []) {
    if (!DEPARTMENT_SET.has(d)) return { ok: false, error: `Unknown department “${d}”.` }
  }
  return { ok: true }
}

export async function createTemplate(input: TemplateInput): Promise<TemplateResult> {
  await requirePermission('workforce.write')

  const meta = validateMeta(input)
  if (!meta.ok) return meta
  const built = buildSections(input.sections)
  if (!built.ok) return built

  const supabase = createSupabaseAdminClient()
  const baseSlug = slugify(input.name) || 'report'

  // Resolve a unique slug (append -2, -3, … on collision).
  let slug = baseSlug
  for (let n = 2; n < 50; n++) {
    const { data: existing } = await supabase
      .from('report_templates')
      .select('id')
      .eq('slug', slug)
      .maybeSingle<{ id: string }>()
    if (!existing) break
    slug = `${baseSlug}-${n}`
  }

  const { data, error } = await supabase
    .from('report_templates')
    .insert({
      slug,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      cadence: input.cadence,
      departments: input.departments ?? [],
      sections: built.sections,
      is_active: input.isActive,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) {
    console.error('[reports] createTemplate failed', error)
    return { ok: false, error: error.message || 'Could not create the template.' }
  }

  revalidatePath('/workforce/report-templates')
  revalidatePath('/workspace/reports')
  return { ok: true, id: data.id }
}

export async function updateTemplate(id: string, input: TemplateInput): Promise<TemplateResult> {
  await requirePermission('workforce.write')

  const meta = validateMeta(input)
  if (!meta.ok) return meta
  const built = buildSections(input.sections)
  if (!built.ok) return built

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('report_templates')
    .update({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      cadence: input.cadence,
      departments: input.departments ?? [],
      sections: built.sections,
      is_active: input.isActive,
    })
    .eq('id', id)
  if (error) {
    console.error('[reports] updateTemplate failed', error)
    return { ok: false, error: error.message || 'Could not save the template.' }
  }

  revalidatePath('/workforce/report-templates')
  revalidatePath('/workspace/reports')
  return { ok: true, id }
}

export async function setTemplateActive(id: string, isActive: boolean): Promise<TemplateResult> {
  await requirePermission('workforce.write')
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('report_templates')
    .update({ is_active: isActive })
    .eq('id', id)
  if (error) return { ok: false, error: error.message || 'Could not update the template.' }
  revalidatePath('/workforce/report-templates')
  revalidatePath('/workspace/reports')
  return { ok: true, id }
}

export async function deleteTemplate(id: string): Promise<TemplateResult> {
  await requirePermission('workforce.write')
  const supabase = createSupabaseAdminClient()
  // Submissions keep their template_snapshot (FK is ON DELETE SET NULL),
  // so deleting a template never destroys reported history.
  const { error } = await supabase.from('report_templates').delete().eq('id', id)
  if (error) return { ok: false, error: error.message || 'Could not delete the template.' }
  revalidatePath('/workforce/report-templates')
  revalidatePath('/workspace/reports')
  return { ok: true, id }
}
