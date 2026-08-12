'use server'

import { revalidatePath } from 'next/cache'
import { createHash } from 'crypto'

import {
  ARTBOARD_PRESETS,
  compileDocument,
  createBlankDocument,
  importRasterArtwork,
  importSvgArtwork,
  personalizeBulk,
  personalizePlan,
  renderPersonalizedToSvg,
  validateDocument,
  type DesignDocument,
  type GuestOverride,
  type PreflightResult,
  type RenderPlan,
} from '@opusfesta/design-engine'

import { getCallerEmail, hasAnyPermission, requirePermission } from '@/lib/admin-auth'

async function requireStudioRead() {
  const ok = await hasAnyPermission(['digitalcards.read', 'cms.read'])
  if (!ok) await requirePermission('digitalcards.read')
}
import { createSupabaseAdminClient } from '@/lib/supabase'

const BUCKET = 'design-assets'
const STUDIO_PATH = '/opus-pass/design-studio'

export type DesignProjectListItem = {
  id: string
  name: string
  kind: string
  status: string
  updatedAt: string
  documentId: string | null
  currentVersion: number
}

export type DesignStudioLoad = {
  projectId: string
  documentId: string
  version: number
  name: string
  kind: string
  status: string
  document: DesignDocument
  swatches: { id: string; name: string; hex: string; role: string | null }[]
  assets: {
    id: string
    kind: string
    name: string
    publicUrl: string | null
    storagePath: string
    tags: string[]
    version: number
  }[]
  fonts: {
    id: string
    familyName: string | null
    subfamilyName: string | null
    licenceStatus: string
    embeddable: boolean | null
  }[]
  releases: {
    id: string
    documentVersion: number
    status: string
    releasedAt: string
  }[]
}

function sha256(buf: Buffer | string) {
  return createHash('sha256').update(buf).digest('hex')
}

async function signedUrl(path: string, expiresIn = 60 * 60 * 24 * 7) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn)
  if (error) return null
  return data.signedUrl
}

export async function listDesignProjects(): Promise<DesignProjectListItem[]> {
  await requireStudioRead()
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('design_projects')
    .select('id, name, kind, status, updated_at, design_documents(id, current_version)')
    .order('updated_at', { ascending: false })
    .limit(100)

  if (error) {
    // Table may not exist yet in local envs that haven't migrated.
    console.error('[design-studio] listDesignProjects', error.message)
    return []
  }

  return (data ?? []).map((row) => {
    const docs = row.design_documents as
      | { id: string; current_version: number }
      | { id: string; current_version: number }[]
      | null
    const doc = Array.isArray(docs) ? docs[0] : docs
    return {
      id: row.id as string,
      name: row.name as string,
      kind: row.kind as string,
      status: row.status as string,
      updatedAt: row.updated_at as string,
      documentId: doc?.id ?? null,
      currentVersion: doc?.current_version ?? 0,
    }
  })
}

export async function createDesignProject(input: {
  name: string
  kind?: 'master' | 'event'
  presetKey?: string
  mode?: 'blank' | 'upload_later'
}): Promise<{ ok: true; projectId: string; documentId: string } | { ok: false; error: string }> {
  await requirePermission('digitalcards.write')
  const author = (await getCallerEmail()) ?? ''
  const supabase = createSupabaseAdminClient()

  const document = createBlankDocument({
    name: input.name.trim() || 'Untitled card',
    presetKey: input.presetKey ?? 'digital_1080_1350',
    kind: input.kind ?? 'master',
  })

  const { data: project, error: projectError } = await supabase
    .from('design_projects')
    .insert({
      name: document.name,
      kind: input.kind ?? 'master',
      status: 'draft',
      created_by: author,
      updated_by: author,
    })
    .select('id')
    .single()

  if (projectError || !project) {
    return { ok: false, error: projectError?.message ?? 'Failed to create project' }
  }

  const { data: docRow, error: docError } = await supabase
    .from('design_documents')
    .insert({
      project_id: project.id,
      title: document.name,
      current_version: 0,
      schema_version: 1,
    })
    .select('id')
    .single()

  if (docError || !docRow) {
    await supabase.from('design_projects').delete().eq('id', project.id)
    return { ok: false, error: docError?.message ?? 'Failed to create document' }
  }

  const { data: versionRow, error: versionError } = await supabase
    .from('design_document_versions')
    .insert({
      document_id: docRow.id,
      version: 1,
      document,
      change_summary: 'Initial version',
      created_by: author,
    })
    .select('id')
    .single()

  if (versionError || !versionRow) {
    return { ok: false, error: versionError?.message ?? 'Failed to save initial version' }
  }

  await supabase
    .from('design_documents')
    .update({
      current_version: 1,
      current_version_id: versionRow.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', docRow.id)

  // Seed default swatches
  await supabase.from('design_swatches').insert(
    (document.swatches ?? []).map((s, i) => ({
      project_id: project.id,
      name: s.name,
      hex: s.hex,
      role: s.role ?? null,
      sort_order: i,
    })),
  )

  revalidatePath(STUDIO_PATH)
  return { ok: true, projectId: project.id as string, documentId: docRow.id as string }
}

export async function loadDesignStudio(projectId: string): Promise<DesignStudioLoad | null> {
  await requireStudioRead()
  const supabase = createSupabaseAdminClient()

  const { data: project, error } = await supabase
    .from('design_projects')
    .select('id, name, kind, status')
    .eq('id', projectId)
    .maybeSingle()

  if (error || !project) return null

  const { data: doc } = await supabase
    .from('design_documents')
    .select('id, current_version, current_version_id')
    .eq('project_id', projectId)
    .maybeSingle()

  if (!doc) return null

  const { data: version } = await supabase
    .from('design_document_versions')
    .select('version, document')
    .eq('id', doc.current_version_id)
    .maybeSingle()

  if (!version) return null

  const [{ data: swatches }, { data: assets }, { data: fonts }, { data: releases }] =
    await Promise.all([
      supabase
        .from('design_swatches')
        .select('id, name, hex, role')
        .eq('project_id', projectId)
        .order('sort_order'),
      supabase
        .from('design_assets')
        .select('id, kind, name, public_url, storage_path, tags, version')
        .or(`project_id.eq.${projectId},project_id.is.null`)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('card_fonts')
        .select('id, family_name, subfamily_name, licence_status, embeddable')
        .order('family_name')
        .limit(200),
      supabase
        .from('design_template_releases')
        .select('id, document_version, status, released_at')
        .eq('project_id', projectId)
        .order('released_at', { ascending: false })
        .limit(20),
    ])

  const assetsWithUrls = await Promise.all(
    (assets ?? []).map(async (a) => ({
      id: a.id as string,
      kind: a.kind as string,
      name: a.name as string,
      publicUrl: (a.public_url as string | null) ?? (await signedUrl(a.storage_path as string)),
      storagePath: a.storage_path as string,
      tags: (a.tags as string[]) ?? [],
      version: a.version as number,
    })),
  )

  return {
    projectId: project.id as string,
    documentId: doc.id as string,
    version: version.version as number,
    name: project.name as string,
    kind: project.kind as string,
    status: project.status as string,
    document: version.document as DesignDocument,
    swatches: (swatches ?? []).map((s) => ({
      id: s.id as string,
      name: s.name as string,
      hex: s.hex as string,
      role: (s.role as string | null) ?? null,
    })),
    assets: assetsWithUrls,
    fonts: (fonts ?? []).map((f) => ({
      id: f.id as string,
      familyName: (f.family_name as string | null) ?? null,
      subfamilyName: (f.subfamily_name as string | null) ?? null,
      licenceStatus: f.licence_status as string,
      embeddable: (f.embeddable as boolean | null) ?? null,
    })),
    releases: (releases ?? []).map((r) => ({
      id: r.id as string,
      documentVersion: r.document_version as number,
      status: r.status as string,
      releasedAt: r.released_at as string,
    })),
  }
}

export async function deleteDesignProjectAction(
  projectId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePermission('digitalcards.write')
  const supabase = createSupabaseAdminClient()

  // Documents / versions cascade from design_projects in the migration.
  const { error } = await supabase.from('design_projects').delete().eq('id', projectId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(STUDIO_PATH)
  revalidatePath(`${STUDIO_PATH}/${projectId}`)
  return { ok: true }
}

export async function saveDesignDocumentAction(input: {
  projectId?: string
  documentId: string
  baseVersion: number
  document: DesignDocument
  changeSummary?: string
}): Promise<
  | { ok: true; version: number; versionId: string }
  | { ok: false; code: 'CONFLICT' | 'SAVE_FAILED'; currentVersion?: number; message?: string }
> {
  await requirePermission('digitalcards.write')
  const author = (await getCallerEmail()) ?? ''
  const supabase = createSupabaseAdminClient()

  const { data, error } = await supabase.rpc('save_design_document', {
    p_document_id: input.documentId,
    p_base_version: input.baseVersion,
    p_document: input.document,
    p_change_summary: input.changeSummary ?? null,
    p_author: author,
  })

  if (error) {
    return { ok: false, code: 'SAVE_FAILED', message: error.message }
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row?.ok) {
    return {
      ok: false,
      code: 'CONFLICT',
      currentVersion: row?.conflict_current_version ?? row?.version,
      message: 'This design changed while you were editing.',
    }
  }

  if (input.projectId) revalidatePath(`${STUDIO_PATH}/${input.projectId}`)
  revalidatePath(STUDIO_PATH)
  return { ok: true, version: row.version as number, versionId: row.version_id as string }
}

export async function uploadDesignAssetAction(formData: FormData): Promise<
  | {
      ok: true
      asset: {
        id: string
        kind: string
        name: string
        publicUrl: string | null
        version: number
        storagePath: string
      }
      importReport?: {
        mode?: string
        textObjects: number
        paths: number
        groups?: number
        layers?: number
        images: number
        unsupported: string[]
        suggestedMappings: {
          elementId: string
          content: string
          suggestedPath: string | null
          suggestedRole: string | null
        }[]
      }
      document?: DesignDocument
    }
  | { ok: false; error: string }
> {
  await requirePermission('digitalcards.write')
  const author = (await getCallerEmail()) ?? ''
  const supabase = createSupabaseAdminClient()

  const file = formData.get('file')
  const projectId = String(formData.get('projectId') ?? '')
  const kind = String(formData.get('kind') ?? 'upload') as
    | 'base_plate'
    | 'icon'
    | 'photo'
    | 'svg_graphic'
    | 'upload'
  const asBasePlate = String(formData.get('asBasePlate') ?? '') === '1'
  const replaceDocument = String(formData.get('replaceDocument') ?? '') === '1'

  if (!(file instanceof File)) {
    return {
      ok: false,
      error:
        'No file provided (upload may have been truncated — try a smaller SVG, max ~45MB).',
    }
  }
  if (!projectId) {
    return { ok: false, error: 'Missing projectId' }
  }
  if (file.size <= 0) {
    return {
      ok: false,
      error: 'Empty file — the upload body was likely truncated. Re-export a leaner SVG.',
    }
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes.length === 0) {
    return {
      ok: false,
      error: 'Empty upload payload. Restart the admin server if you just raised body size limits.',
    }
  }
  const hash = sha256(bytes)
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
  const path = `${projectId}/${kind}/${hash.slice(0, 16)}.${ext}`

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type || 'application/octet-stream',
    upsert: true,
  })

  if (uploadError) {
    return { ok: false, error: uploadError.message }
  }

  const url = await signedUrl(path)
  const { data: asset, error: assetError } = await supabase
    .from('design_assets')
    .insert({
      project_id: projectId,
      kind: asBasePlate ? 'base_plate' : kind,
      name: file.name,
      tags: [],
      storage_path: path,
      public_url: url,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: bytes.length,
      content_sha256: hash,
      version: 1,
      created_by: author,
    })
    .select('id, kind, name, public_url, storage_path, version')
    .single()

  if (assetError || !asset) {
    return { ok: false, error: assetError?.message ?? 'Failed to record asset' }
  }

  const result: Awaited<ReturnType<typeof uploadDesignAssetAction>> = {
    ok: true,
    asset: {
      id: asset.id as string,
      kind: asset.kind as string,
      name: asset.name as string,
      publicUrl: (asset.public_url as string | null) ?? url,
      version: asset.version as number,
      storagePath: asset.storage_path as string,
    },
  }

  if (replaceDocument || asBasePlate) {
    const isSvg = (file.type || '').includes('svg') || ext === 'svg'
    if (isSvg) {
      const svg = bytes.toString('utf8')
      const report = importSvgArtwork({
        svg,
        name: file.name.replace(/\.svg$/i, ''),
        assetUrl: url ?? '',
        assetId: asset.id as string,
        assetVersion: 1,
      })
      result.importReport = {
        mode: report.mode,
        textObjects: report.imported.textObjects,
        paths: report.imported.paths,
        groups: report.imported.groups,
        layers: report.imported.layers,
        images: report.imported.images,
        unsupported: report.imported.unsupported,
        suggestedMappings: report.suggestedMappings,
      }
      result.document = report.document
    } else {
      const imported = importRasterArtwork({
        name: file.name,
        assetUrl: url ?? '',
        assetId: asset.id as string,
        assetVersion: 1,
      })
      result.document = imported.document
    }
  }

  revalidatePath(`${STUDIO_PATH}/${projectId}`)
  return result
}

export async function addDesignSwatchAction(input: {
  projectId: string
  name: string
  hex: string
  role?: string
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requirePermission('digitalcards.write')
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('design_swatches')
    .insert({
      project_id: input.projectId,
      name: input.name,
      hex: input.hex,
      role: input.role ?? null,
    })
    .select('id')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'Failed' }
  return { ok: true, id: data.id as string }
}

export async function runDesignPreflightAction(document: DesignDocument): Promise<PreflightResult> {
  await requireStudioRead()
  return validateDocument(document)
}

export async function releaseDesignTemplateAction(input: {
  projectId: string
  documentId: string
  document: DesignDocument
  baseVersion: number
}): Promise<
  | { ok: true; releaseId: string; preflight: PreflightResult }
  | { ok: false; error: string; preflight?: PreflightResult }
> {
  await requirePermission('digitalcards.publish')
  const author = (await getCallerEmail()) ?? ''
  const supabase = createSupabaseAdminClient()

  const preflight = validateDocument(input.document)
  if (!preflight.releasable) {
    return { ok: false, error: 'Preflight failed — fix errors before publishing.', preflight }
  }

  // Persist latest document first
  const saved = await saveDesignDocumentAction({
    projectId: input.projectId,
    documentId: input.documentId,
    baseVersion: input.baseVersion,
    document: input.document,
    changeSummary: 'Pre-release save',
  })
  if (!saved.ok) {
    return { ok: false, error: saved.message ?? 'Could not save before release', preflight }
  }

  const plan: RenderPlan = compileDocument(input.document)
  const manifest = {
    engineVersion: plan.engineVersion,
    documentId: plan.documentId,
    documentVersion: saved.version,
    fonts: plan.fonts,
    assets: plan.assets,
    compiledAt: plan.compiledAt,
  }

  // Supersede previous releases
  await supabase
    .from('design_template_releases')
    .update({ status: 'superseded', superseded_at: new Date().toISOString() })
    .eq('project_id', input.projectId)
    .eq('status', 'released')

  const { data: release, error } = await supabase
    .from('design_template_releases')
    .insert({
      project_id: input.projectId,
      document_id: input.documentId,
      document_version: saved.version,
      document_version_id: saved.versionId,
      render_plan: plan,
      render_manifest: manifest,
      status: 'released',
      preflight,
      released_by: author,
    })
    .select('id')
    .single()

  if (error || !release) {
    return { ok: false, error: error?.message ?? 'Release failed', preflight }
  }

  await supabase
    .from('design_projects')
    .update({ status: 'released', updated_by: author, updated_at: new Date().toISOString() })
    .eq('id', input.projectId)

  revalidatePath(`${STUDIO_PATH}/${input.projectId}`)
  return { ok: true, releaseId: release.id as string, preflight }
}

export async function previewDesignSvgAction(input: {
  document: DesignDocument
  data?: Record<string, unknown>
}): Promise<{ ok: true; svg: string; blocked: boolean; errors: string[]; warnings: string[] } | { ok: false; error: string }> {
  await requireStudioRead()
  try {
    const personalized = personalizePlan(input.document, input.data ?? {})
    if (personalized.blocked) {
      return {
        ok: true,
        svg: '',
        blocked: true,
        errors: personalized.errors,
        warnings: personalized.warnings,
      }
    }
    const svg = renderPersonalizedToSvg(personalized)
    return {
      ok: true,
      svg,
      blocked: false,
      errors: [],
      warnings: personalized.warnings,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Preview failed' }
  }
}

export async function createBulkRenderJobAction(input: {
  projectId: string
  releaseId: string
  guests: {
    guestId: string
    guestKey?: string
    data: Record<string, unknown>
    override?: GuestOverride
  }[]
}): Promise<
  | {
      ok: true
      jobId: string
      total: number
      completed: number
      warning: number
      failed: number
      outputs: {
        guestId: string
        status: string
        reason?: string
        storagePath?: string
      }[]
    }
  | { ok: false; error: string }
> {
  await requirePermission('digitalcards.write')
  const author = (await getCallerEmail()) ?? ''
  const supabase = createSupabaseAdminClient()

  const { data: release, error: releaseError } = await supabase
    .from('design_template_releases')
    .select('id, render_plan, status')
    .eq('id', input.releaseId)
    .maybeSingle()

  if (releaseError || !release || release.status !== 'released') {
    return { ok: false, error: 'Release not found or not active' }
  }

  const plan = release.render_plan as RenderPlan
  const results = personalizeBulk(plan, input.guests)

  const { data: job, error: jobError } = await supabase
    .from('design_render_jobs')
    .insert({
      release_id: input.releaseId,
      project_id: input.projectId,
      kind: 'guest_bulk',
      status: 'processing',
      total_count: results.length,
      completed_count: 0,
      warning_count: 0,
      failed_count: 0,
      params: { guestCount: results.length },
      created_by: author,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (jobError || !job) {
    return { ok: false, error: jobError?.message ?? 'Failed to create job' }
  }

  let completed = 0
  let warning = 0
  let failed = 0
  const outputs: {
    guestId: string
    status: string
    reason?: string
    storagePath?: string
  }[] = []

  for (const item of results) {
    if (item.status === 'blocked') {
      failed += 1
      await supabase.from('design_render_outputs').insert({
        job_id: job.id,
        release_id: input.releaseId,
        guest_id: item.guestId,
        guest_key: item.guestKey ?? null,
        status: 'blocked',
        block_reason: item.reason ?? 'render_blocked',
        render_params: { errors: item.plan.errors },
      })
      outputs.push({ guestId: item.guestId, status: 'blocked', reason: item.reason })
      continue
    }

    try {
      const svg = renderPersonalizedToSvg(item.plan)
      const path = `renders/${input.releaseId}/${item.guestId}.svg`
      const buf = Buffer.from(svg, 'utf8')
      await supabase.storage.from(BUCKET).upload(path, buf, {
        contentType: 'image/svg+xml',
        upsert: true,
      })
      const url = await signedUrl(path)
      const status = item.status === 'warning' ? 'warning' : 'ready'
      if (status === 'warning') warning += 1
      else completed += 1

      await supabase.from('design_render_outputs').insert({
        job_id: job.id,
        release_id: input.releaseId,
        guest_id: item.guestId,
        guest_key: item.guestKey ?? null,
        status,
        storage_path: path,
        public_url: url,
        content_sha256: sha256(buf),
        render_params: { warnings: item.plan.warnings },
      })
      outputs.push({ guestId: item.guestId, status, storagePath: path })
    } catch (err) {
      failed += 1
      const reason = err instanceof Error ? err.message : 'render_failed'
      await supabase.from('design_render_outputs').insert({
        job_id: job.id,
        release_id: input.releaseId,
        guest_id: item.guestId,
        guest_key: item.guestKey ?? null,
        status: 'failed',
        block_reason: reason,
      })
      outputs.push({ guestId: item.guestId, status: 'failed', reason })
    }
  }

  await supabase
    .from('design_render_jobs')
    .update({
      status: 'completed',
      completed_count: completed,
      warning_count: warning,
      failed_count: failed,
      finished_at: new Date().toISOString(),
    })
    .eq('id', job.id)

  revalidatePath(`${STUDIO_PATH}/${input.projectId}`)
  return {
    ok: true,
    jobId: job.id as string,
    total: results.length,
    completed,
    warning,
    failed,
    outputs,
  }
}

export async function saveGuestOverrideAction(input: {
  releaseId: string
  guestId: string
  overrides: GuestOverride
  notes?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePermission('digitalcards.write')
  const author = (await getCallerEmail()) ?? ''
  const supabase = createSupabaseAdminClient()

  const { error } = await supabase.from('design_guest_overrides').upsert(
    {
      release_id: input.releaseId,
      guest_id: input.guestId,
      overrides: input.overrides,
      notes: input.notes ?? null,
      created_by: author,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'release_id,guest_id' },
  )

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function listArtboardPresetsAction() {
  await requireStudioRead()
  return ARTBOARD_PRESETS
}
