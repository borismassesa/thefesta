'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  GROWTH_ERROR,
  growthDbErrorMessage,
  logGrowthDbError,
  missingGrowthRecord,
  requireGrowthPermission,
  type ActionResult,
} from '../_lib/action-utils'
import type { ContentIdeaKind } from './ContentIdeasClient'

async function gate(): Promise<ActionResult | null> {
  return requireGrowthPermission('growth.admin')
}

export async function addContentIdea(input: {
  kind: ContentIdeaKind
  title: string
  description: string
  details: Record<string, string>
  sortOrder: number
}): Promise<ActionResult> {
  const denied = await gate()
  if (denied) return denied
  if (!input.title.trim()) return { ok: false, error: 'Title is required.' }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('growth_content_ideas').insert({
    kind: input.kind,
    title: input.title.trim(),
    description: input.description.trim(),
    details: input.details,
    sort_order: input.sortOrder,
  })
  if (error) {
    logGrowthDbError('growth.content_idea.insert', error)
    return { ok: false, error: growthDbErrorMessage(error, GROWTH_ERROR.save) }
  }

  revalidatePath('/growth/content-ideas')
  return { ok: true }
}

export async function updateContentIdea(
  id: string,
  patch: Partial<{ title: string; description: string; details: Record<string, string>; sortOrder: number }>,
): Promise<ActionResult> {
  const denied = await gate()
  if (denied) return denied

  const supabase = createSupabaseAdminClient()
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = patch.title.trim()
  if (patch.description !== undefined) update.description = patch.description.trim()
  if (patch.details !== undefined) update.details = patch.details
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder

  const { data, error } = await supabase
    .from('growth_content_ideas')
    .update(update)
    .eq('id', id)
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error) {
    logGrowthDbError('growth.content_idea.update', error, { ideaId: id })
    return { ok: false, error: growthDbErrorMessage(error, GROWTH_ERROR.save) }
  }
  if (!data) return missingGrowthRecord()

  revalidatePath('/growth/content-ideas')
  return { ok: true }
}

export async function deleteContentIdea(id: string): Promise<ActionResult> {
  const denied = await gate()
  if (denied) return denied

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('growth_content_ideas')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle<{ id: string }>()
  if (error) {
    logGrowthDbError('growth.content_idea.delete', error, { ideaId: id })
    return { ok: false, error: growthDbErrorMessage(error, GROWTH_ERROR.delete) }
  }
  if (!data) return missingGrowthRecord()

  revalidatePath('/growth/content-ideas')
  return { ok: true }
}
