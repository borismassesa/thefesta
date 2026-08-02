'use server'

import { revalidatePath } from 'next/cache'
import { getCallerEmployeeId, requirePermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'

const PATH = '/workforce/recruitment/referrals'
function field(data: FormData, name: string) { const value = data.get(name); return typeof value === 'string' ? value.trim() : '' }
async function admin() { await requirePermission('workforce.referrals.admin'); return getCallerEmployeeId() }

export async function setReferralStatus(id: string, status: string) {
  const employeeId = await admin(); if (!['submitted', 'contacted', 'applied', 'in_process', 'hired', 'not_selected', 'withdrawn'].includes(status)) throw new Error('Invalid referral status.')
  const db = createSupabaseAdminClient(); const { error } = await db.from('recruitment_referrals').update({ status }).eq('id', id); if (error) throw error
  if (status === 'hired') { const { data: referral } = await db.from('recruitment_referrals').select('program_id, recruitment_referral_programs(reward_amount_tzs)').eq('id', id).single(); const program = Array.isArray(referral?.recruitment_referral_programs) ? referral.recruitment_referral_programs[0] : referral?.recruitment_referral_programs; if (program?.reward_amount_tzs != null) await db.from('recruitment_referral_rewards').upsert({ referral_id: id, amount_tzs: program.reward_amount_tzs, status: 'pending' }, { onConflict: 'referral_id' }) }
  await db.from('recruitment_audit_events').insert({ event_type: 'referral.status_changed', entity_type: 'referral', entity_id: id, actor_type: 'employee', metadata: { actor_employee_id: employeeId, status } }); revalidatePath(PATH)
}

export async function addReferralPrivateNote(id: string, formData: FormData) {
  const employeeId = await admin(); const body = field(formData, 'body'); if (body.length < 2) throw new Error('Enter a note.')
  const { error } = await createSupabaseAdminClient().from('recruitment_referral_notes').insert({ referral_id: id, author_employee_id: employeeId, body, visibility: 'recruitment_private' }); if (error) throw error; revalidatePath(PATH)
}

export async function setReferralRewardStatus(id: string, status: string, formData: FormData) {
  const employeeId = await admin(); if (!['pending', 'eligible', 'approved', 'paid', 'cancelled'].includes(status)) throw new Error('Invalid reward status.')
  const db = createSupabaseAdminClient(); const note = field(formData, 'note'); if (['approved', 'cancelled'].includes(status) && note.length < 3) throw new Error('Add an approval or cancellation note.')
  const patch: Record<string, unknown> = { status }; if (status === 'eligible') patch.eligibility_date = new Date().toISOString().slice(0, 10); if (status === 'approved') patch.approved_by = employeeId; if (status === 'paid') patch.paid_at = new Date().toISOString()
  const { data: reward, error } = await db.from('recruitment_referral_rewards').update(patch).eq('id', id).select('referral_id').single(); if (error) throw error
  await db.from('recruitment_referral_notes').insert({ referral_id: reward.referral_id, author_employee_id: employeeId, body: `Reward ${status}.${note ? ` ${note}` : ''}`, visibility: 'recruitment_private' })
  await db.from('recruitment_audit_events').insert({ event_type: `referral.reward_${status}`, entity_type: 'referral_reward', entity_id: id, actor_type: 'employee', metadata: { actor_employee_id: employeeId, changed_fields: ['status'] } }); revalidatePath(PATH)
}
