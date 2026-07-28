'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getAdminAccessRole, isAdminDashboardRole, requirePermission, getCallerEmail } from '@/lib/admin-auth'
import { sendEmail } from '@/lib/email'
import { escapeHtml } from '@/lib/email-shell'

function clean(v: FormDataEntryValue | null, max = 8000): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

async function gate() {
  const role = await getAdminAccessRole()
  if (!isAdminDashboardRole(role)) throw new Error('Not authorized.')
  await requirePermission('support.write')
}

/** Resolve the signed-in admin's workforce_employees row (for agent_id). */
async function callerEmployee(): Promise<{ id: string; name: string } | null> {
  const email = await getCallerEmail()
  if (!email) return null
  const sb = createSupabaseAdminClient()
  const { data } = await sb
    .from('workforce_employees')
    .select('id, full_name')
    .ilike('email', email)
    .maybeSingle()
  if (!data) return null
  return { id: data.id as string, name: data.full_name as string }
}

async function emailCustomer(conversationId: string, replyText: string): Promise<void> {
  const sb = createSupabaseAdminClient()
  const { data } = await sb
    .from('support_conversations')
    .select('contact_email, contact_name')
    .eq('id', conversationId)
    .maybeSingle()
  const to = data?.contact_email as string | undefined
  if (!to) return
  const name = (data?.contact_name as string | undefined) || 'there'
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1A1A;font-size:15px;line-height:1.6;">
    <p>Hi ${escapeHtml(name)},</p>
    <p>You have a reply from the OpusFesta support team:</p>
    <blockquote style="margin:12px 0;padding:12px 16px;background:#F0DFF6;border-radius:10px;color:#3f2b49;">${escapeHtml(replyText)}</blockquote>
    <p>You can continue the conversation with Opus on our website.</p>
    <p style="color:#666;">— The OpusFesta team</p>
  </div>`
  await sendEmail({
    to,
    subject: 'A reply from OpusFesta support',
    html,
    text: `Hi ${name},\n\nYou have a reply from the OpusFesta support team:\n\n${replyText}\n\n— The OpusFesta team`,
  }).catch(() => {})
}

export async function replyToConversation(formData: FormData): Promise<void> {
  await gate()
  const conversationId = clean(formData.get('conversationId'), 40)
  const body = clean(formData.get('body'))
  if (!conversationId) throw new Error('Missing conversation id.')
  if (!body) throw new Error('Message is empty.')

  const sb = createSupabaseAdminClient()
  const me = await callerEmployee()

  const { error } = await sb.from('support_messages').insert({
    conversation_id: conversationId,
    role: 'agent',
    agent_id: me?.id ?? null,
    content: body,
  })
  if (error) throw new Error(error.message)

  await sb
    .from('support_conversations')
    .update({
      status: 'assigned',
      assigned_to: me?.id ?? null,
      awaiting_staff: false,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)

  await emailCustomer(conversationId, body)
  revalidatePath('/support')
  revalidatePath(`/support/${conversationId}`)
}

export async function assignToMe(formData: FormData): Promise<void> {
  await gate()
  const conversationId = clean(formData.get('conversationId'), 40)
  if (!conversationId) throw new Error('Missing conversation id.')
  const me = await callerEmployee()
  const sb = createSupabaseAdminClient()
  await sb
    .from('support_conversations')
    .update({ status: 'assigned', assigned_to: me?.id ?? null, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
  revalidatePath('/support')
  revalidatePath(`/support/${conversationId}`)
}

export async function setConversationStatus(formData: FormData): Promise<void> {
  await gate()
  const conversationId = clean(formData.get('conversationId'), 40)
  const status = clean(formData.get('status'), 20)
  if (!conversationId) throw new Error('Missing conversation id.')
  if (!['needs_human', 'assigned', 'resolved'].includes(status)) {
    throw new Error('Invalid status.')
  }
  const sb = createSupabaseAdminClient()
  await sb
    .from('support_conversations')
    .update({
      status,
      awaiting_staff: status === 'resolved' ? false : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
  revalidatePath('/support')
  revalidatePath(`/support/${conversationId}`)
}
