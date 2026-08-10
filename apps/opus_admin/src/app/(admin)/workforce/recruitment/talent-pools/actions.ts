'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getCallerEmployeeId, requirePermission } from '@/lib/admin-auth'
import { requireRecruitmentAccess } from '@/lib/recruitment-auth'

const PATH = '/workforce/recruitment/talent-pools'
function text(formData: FormData, key: string): string { const value = formData.get(key); return typeof value === 'string' ? value.trim() : '' }

export async function createTalentPool(formData: FormData): Promise<void> {
  await requirePermission('workforce.talent_pool.write'); const name = text(formData, 'name'); if (name.length < 3) throw new Error('Enter a pool name.')
  const visibility = text(formData, 'visibility') || 'recruiting'; if (!['recruiting', 'private', 'company'].includes(visibility)) throw new Error('Invalid visibility.')
  const { error } = await createSupabaseAdminClient().from('recruitment_talent_pools').insert({ name, description: text(formData, 'description') || null, visibility, owner_employee_id: await getCallerEmployeeId() }); if (error) throw error; revalidatePath(PATH)
}

export async function addTalentPoolMember(poolId: string, formData: FormData): Promise<void> {
  await requirePermission('workforce.talent_pool.write'); const candidateId = text(formData, 'candidate_id')
  await requireRecruitmentAccess({ entityType: 'candidate', entityId: candidateId, allowedPermissions: ['workforce.talent_pool.write'] })
  const db = createSupabaseAdminClient(); const { data: consent, error: consentError } = await db.from('recruitment_candidate_consents').select('id').eq('candidate_id', candidateId).eq('consent_type', 'talent_pool').not('granted_at', 'is', null).is('withdrawn_at', null).limit(1).maybeSingle(); if (consentError) throw consentError; if (!consent) throw new Error('Candidate has not granted active talent-pool consent.')
  const { error } = await db.from('recruitment_talent_pool_members').upsert({ pool_id: poolId, candidate_id: candidateId, status: 'active', added_by: await getCallerEmployeeId() }, { onConflict: 'pool_id,candidate_id' }); if (error) throw error; revalidatePath(PATH)
}

export async function updateTalentPool(poolId: string, formData: FormData): Promise<void> {
  await requirePermission('workforce.talent_pool.write'); const name = text(formData, 'name'); if (name.length < 3) throw new Error('Enter a pool name.')
  const visibility = text(formData, 'visibility'); if (!['recruiting', 'private', 'company'].includes(visibility)) throw new Error('Invalid visibility.')
  const { error } = await createSupabaseAdminClient().from('recruitment_talent_pools').update({ name, description: text(formData, 'description') || null, visibility }).eq('id', poolId); if (error) throw error; revalidatePath(PATH)
}

/**
 * Archive rather than delete. A pool records who consented to being kept on
 * file, so destroying it destroys the evidence for every message ever sent to
 * its members. `status` is only ever 'active' or 'archived', so this is also
 * the restore path.
 */
export async function setTalentPoolStatus(poolId: string, status: 'active' | 'archived'): Promise<void> {
  await requirePermission('workforce.talent_pool.write')
  const { error } = await createSupabaseAdminClient().from('recruitment_talent_pools').update({ status }).eq('id', poolId); if (error) throw error; revalidatePath(PATH)
}

/**
 * Soft-remove, for the same reason: the row is the record that this candidate
 * was in this audience when a campaign went out. The table carries `removed_at`
 * precisely so the history survives the removal.
 */
export async function removeTalentPoolMember(poolId: string, candidateId: string): Promise<void> {
  await requirePermission('workforce.talent_pool.write')
  const { error } = await createSupabaseAdminClient().from('recruitment_talent_pool_members')
    .update({ status: 'removed', removed_at: new Date().toISOString() })
    .eq('pool_id', poolId).eq('candidate_id', candidateId); if (error) throw error; revalidatePath(PATH)
}

export async function createNurtureCampaign(poolId: string, formData: FormData): Promise<void> {
  await requirePermission('workforce.talent_pool.write'); const name = text(formData, 'name'); if (name.length < 3) throw new Error('Enter a campaign name.')
  const scheduled = text(formData, 'scheduled_at'); if (scheduled && new Date(scheduled) <= new Date()) throw new Error('Choose a future schedule.')
  const { error } = await createSupabaseAdminClient().from('recruitment_nurture_campaigns').insert({ pool_id: poolId, name, status: scheduled ? 'scheduled' : 'draft', scheduled_at: scheduled ? new Date(scheduled).toISOString() : null, audience_filter: { consent: 'talent_pool' }, template_id: text(formData, 'template_id') || null, created_by: await getCallerEmployeeId() }); if (error) throw error; revalidatePath(PATH)
}
