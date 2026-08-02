import { NextResponse, type NextRequest } from 'next/server'
import { isEmailConfigured, sendEmail } from '@/lib/email'
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function html(value: string) { return `<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${value.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]!))}</div>` }
function render(value: string, candidate: { full_name: string }) { const first = candidate.full_name.split(/\s+/)[0] || candidate.full_name; return value.replace(/{{candidate\.first_name}}/gi, first).replace(/{{candidate\.full_name}}/gi, candidate.full_name) }

export async function POST(request: NextRequest) {
  const secret = process.env.RECRUITMENT_CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasSupabaseAdminConfig()) return NextResponse.json({ error: 'Supabase admin env missing' }, { status: 503 })
  const db = createSupabaseAdminClient(); const now = new Date().toISOString()

  const [scheduledPages, scheduledPostings] = await Promise.all([
    db.from('careers_cms_pages').select('id').eq('status', 'scheduled').lte('scheduled_at', now).limit(100),
    db.from('recruitment_job_postings').select('id').eq('status', 'scheduled').lte('publish_at', now).limit(100),
  ])
  if (scheduledPages.error || scheduledPostings.error) return NextResponse.json({ error: 'Schedule lookup failed' }, { status: 500 })
  let pagesPublished = 0
  for (const page of scheduledPages.data ?? []) { const { error } = await db.rpc('careers_cms_transition_page', { p_page_id: page.id, p_target_status: 'published', p_actor_employee_id: null, p_scheduled_at: null }); if (!error) pagesPublished += 1 }
  const postingIds = (scheduledPostings.data ?? []).map((posting) => posting.id)
  if (postingIds.length) await db.from('recruitment_job_postings').update({ status: 'published', published_at: now }).in('id', postingIds)

  const { data: closingPostings } = await db.from('recruitment_job_postings').select('id').in('status', ['published', 'paused']).lte('unpublish_at', now).limit(100)
  const closingIds = (closingPostings ?? []).map((posting) => posting.id)
  if (closingIds.length) await db.from('recruitment_job_postings').update({ status: 'closed', closed_at: now }).in('id', closingIds)
  const { data: expiringOffers } = await db.from('recruitment_offers').select('id').in('status', ['sent', 'viewed']).lte('expires_at', now).limit(100)
  const offerIds = (expiringOffers ?? []).map((offer) => offer.id)
  if (offerIds.length) { await db.from('recruitment_offers').update({ status: 'expired' }).in('id', offerIds); await db.from('recruitment_candidate_portal_tasks').update({ status: 'expired' }).in('payload->>offer_id', offerIds) }

  const { data: scheduledActions } = await db.from('recruitment_scheduled_application_actions').select('*').eq('status', 'scheduled').limit(100)
  const triggerIds = [...new Set((scheduledActions ?? []).map((action) => action.trigger_offer_id).filter(Boolean))] as string[]; const { data: triggerOffers } = triggerIds.length ? await db.from('recruitment_offers').select('id, status').in('id', triggerIds) : { data: [] as Array<{ id: string; status: string }> }; const triggerMap = new Map((triggerOffers ?? []).map((offer) => [offer.id, offer.status])); let applicationActionsCompleted = 0
  for (const action of scheduledActions ?? []) { const due = action.execute_after && Date.parse(action.execute_after) <= Date.now(); const triggered = action.trigger_offer_id && triggerMap.get(action.trigger_offer_id) === 'accepted'; if (!due && !triggered) continue; await db.from('recruitment_scheduled_application_actions').update({ status: 'processing' }).eq('id', action.id).eq('status', 'scheduled'); const payload = action.payload as { reason_code?: string; note?: string }; const { error } = await db.rpc('recruitment_transition_application', { p_application_id: action.application_id, p_target_status: action.target_status, p_actor_employee_id: action.created_by, p_reason_code: payload.reason_code ?? null, p_note: payload.note ?? null }); await db.from('recruitment_scheduled_application_actions').update({ status: error ? 'failed' : 'completed', executed_at: error ? null : new Date().toISOString(), error_message: error ? 'Transition no longer valid; manual review required.' : null }).eq('id', action.id); if (!error) applicationActionsCompleted += 1 }

  const { data: dueCampaigns } = await db.from('recruitment_nurture_campaigns').select('id, pool_id, template_id').eq('status', 'scheduled').lte('scheduled_at', now).limit(20)
  let campaignsQueued = 0
  for (const campaign of dueCampaigns ?? []) {
    if (!campaign.pool_id || !campaign.template_id) continue
    const [{ data: template }, { data: members }] = await Promise.all([
      db.from('recruitment_message_templates').select('id, channel, subject_template, body_template').eq('id', campaign.template_id).eq('status', 'active').maybeSingle(),
      db.from('recruitment_talent_pool_members').select('candidate_id, recruitment_candidates(full_name, primary_email)').eq('pool_id', campaign.pool_id).eq('status', 'active'),
    ])
    if (!template || template.channel !== 'email') { await db.from('recruitment_nurture_campaigns').update({ status: 'paused' }).eq('id', campaign.id); continue }
    await db.from('recruitment_nurture_campaigns').update({ status: 'running', started_at: now }).eq('id', campaign.id)
    for (const member of members ?? []) {
      const candidate = Array.isArray(member.recruitment_candidates) ? member.recruitment_candidates[0] : member.recruitment_candidates; if (!candidate) continue
      const { data: consent } = await db.from('recruitment_candidate_consents').select('id').eq('candidate_id', member.candidate_id).in('consent_type', ['talent_pool', 'career_updates']).not('granted_at', 'is', null).is('withdrawn_at', null).limit(1).maybeSingle(); if (!consent) continue
      const { data: latestApplication } = await db.from('recruitment_applications').select('id').eq('candidate_id', member.candidate_id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      const { data: message } = await db.from('recruitment_messages').insert({ candidate_id: member.candidate_id, application_id: latestApplication?.id ?? null, template_id: template.id, channel: 'email', subject: render(template.subject_template || 'OpusFesta careers update', candidate), body: render(template.body_template, candidate), status: 'queued', approval_status: 'approved' }).select('id').single()
      if (message) { await db.from('recruitment_message_recipients').insert({ message_id: message.id, recipient_type: 'to', address: candidate.primary_email, display_name: candidate.full_name }); campaignsQueued += 1 }
    }
    await db.from('recruitment_nurture_campaigns').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', campaign.id)
  }

  let calendarsSynced = 0; let calendarsFailed = 0
  const googleToken = process.env.GOOGLE_CALENDAR_ACCESS_TOKEN; const googleCalendarId = process.env.GOOGLE_RECRUITMENT_CALENDAR_ID
  if (googleToken && googleCalendarId) {
    const { data: calendarRows } = await db.from('recruitment_calendar_sync_queue').select('id, interview_id, attempt').in('status', ['queued', 'failed']).lt('attempt', 5).limit(20)
    for (const queue of calendarRows ?? []) {
      await db.from('recruitment_calendar_sync_queue').update({ status: 'syncing', attempt: queue.attempt + 1 }).eq('id', queue.id)
      const { data: interview } = await db.from('recruitment_interviews').select('id, title, starts_at, ends_at, timezone, location, meeting_url, candidate_instructions, calendar_event_id, recruitment_applications(recruitment_candidates(full_name, primary_email))').eq('id', queue.interview_id).single()
      const { data: participants } = await db.from('recruitment_interview_participants').select('workforce_employees(full_name, email)').eq('interview_id', queue.interview_id)
      const application = Array.isArray(interview?.recruitment_applications) ? interview.recruitment_applications[0] : interview?.recruitment_applications; const candidate = Array.isArray(application?.recruitment_candidates) ? application.recruitment_candidates[0] : application?.recruitment_candidates
      if (!interview?.starts_at || !interview.ends_at || !candidate) { await db.from('recruitment_calendar_sync_queue').update({ status: 'failed', last_error: 'incomplete_interview' }).eq('id', queue.id); calendarsFailed += 1; continue }
      const attendees = [{ email: candidate.primary_email, displayName: candidate.full_name }, ...(participants ?? []).flatMap((row) => { const employee = Array.isArray(row.workforce_employees) ? row.workforce_employees[0] : row.workforce_employees; return employee?.email ? [{ email: employee.email, displayName: employee.full_name }] : [] })]
      const payload = { summary: interview.title, description: interview.candidate_instructions || 'OpusFesta recruitment interview', location: interview.location || undefined, start: { dateTime: interview.starts_at, timeZone: interview.timezone || 'Africa/Dar_es_Salaam' }, end: { dateTime: interview.ends_at, timeZone: interview.timezone || 'Africa/Dar_es_Salaam' }, attendees, conferenceData: interview.meeting_url ? undefined : { createRequest: { requestId: `recruitment-${interview.id}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } } }
      const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(googleCalendarId)}/events`; const url = interview.calendar_event_id ? `${baseUrl}/${encodeURIComponent(interview.calendar_event_id)}?conferenceDataVersion=1&sendUpdates=all` : `${baseUrl}?conferenceDataVersion=1&sendUpdates=all`
      try { const response = await fetch(url, { method: interview.calendar_event_id ? 'PUT' : 'POST', headers: { authorization: `Bearer ${googleToken}`, 'content-type': 'application/json' }, body: JSON.stringify(payload) }); if (!response.ok) throw new Error(`provider_${response.status}`); const event = await response.json() as { id: string; hangoutLink?: string }; await db.from('recruitment_interviews').update({ calendar_event_id: event.id, meeting_url: interview.meeting_url || event.hangoutLink || null }).eq('id', interview.id); await db.from('recruitment_calendar_sync_queue').update({ status: 'synced', synced_at: new Date().toISOString(), last_error: null }).eq('id', queue.id); calendarsSynced += 1 } catch (error) { await db.from('recruitment_calendar_sync_queue').update({ status: 'failed', last_error: error instanceof Error && /^provider_\d+$/.test(error.message) ? error.message : 'provider_error' }).eq('id', queue.id); calendarsFailed += 1 }
    }
  }

  let sent = 0; let delivered = 0; let failed = 0
  const { data: claimed, error: claimError } = await db.rpc('recruitment_claim_messages', { p_limit: 25 })
  if (claimError) return NextResponse.json({ error: 'Message claim failed' }, { status: 500 })
  for (const message of claimed ?? []) {
    const { data: recipients } = await db.from('recruitment_message_recipients').select('address, recipient_type').eq('message_id', message.id)
    if (message.channel === 'in_app') {
      if (!message.candidate_id) { await db.from('recruitment_messages').update({ status: 'failed' }).eq('id', message.id); failed += 1; continue }
      const { error } = await db.from('recruitment_candidate_notices').insert({ candidate_id: message.candidate_id, application_id: message.application_id, notice_type: 'message', title: message.subject || 'Message from OpusFesta', body: message.body, version: '1' })
      await db.from('recruitment_messages').update({ status: error ? 'failed' : 'delivered', sent_at: error ? null : now }).eq('id', message.id); if (error) failed += 1; else delivered += 1
      continue
    }
    const to = (recipients ?? []).filter((r) => r.recipient_type === 'to').map((r) => r.address); const cc = (recipients ?? []).filter((r) => r.recipient_type === 'cc').map((r) => r.address); const bcc = (recipients ?? []).filter((r) => r.recipient_type === 'bcc').map((r) => r.address)
    if (!to.length) { await db.from('recruitment_messages').update({ status: 'failed' }).eq('id', message.id); failed += 1; continue }
    if (message.channel === 'email') {
      if (!isEmailConfigured()) { await db.from('recruitment_messages').update({ status: 'queued' }).eq('id', message.id); continue }
      const result = await sendEmail({ to, cc: cc.length ? cc : undefined, bcc: bcc.length ? bcc : undefined, subject: message.subject || 'Message from OpusFesta', text: message.body, html: html(message.body) })
      await db.from('recruitment_messages').update({ status: result.sent ? 'sent' : 'failed', provider_message_id: result.sent ? result.id : null, sent_at: result.sent ? now : null }).eq('id', message.id); await db.from('recruitment_message_events').insert({ message_id: message.id, event_type: result.sent ? 'sent' : 'failed', provider_event_id: result.sent ? result.id : null, metadata: { provider: 'resend' } }); if (result.sent) sent += 1; else failed += 1; continue
    }
    const webhook = process.env.RECRUITMENT_MESSAGING_WEBHOOK_URL; if (!webhook) { await db.from('recruitment_messages').update({ status: 'queued' }).eq('id', message.id); continue }
    try { const response = await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json', ...(process.env.RECRUITMENT_MESSAGING_WEBHOOK_TOKEN ? { authorization: `Bearer ${process.env.RECRUITMENT_MESSAGING_WEBHOOK_TOKEN}` } : {}) }, body: JSON.stringify({ id: message.id, channel: message.channel, to, body: message.body }) }); if (!response.ok) throw new Error('provider_error'); const result = await response.json().catch(() => ({})) as { id?: string }; await db.from('recruitment_messages').update({ status: 'sent', provider_message_id: result.id ?? null, sent_at: now }).eq('id', message.id); await db.from('recruitment_message_events').insert({ message_id: message.id, event_type: 'sent', provider_event_id: result.id ?? null, metadata: { provider: 'configured_webhook', channel: message.channel } }); sent += 1 } catch { await db.from('recruitment_messages').update({ status: 'failed' }).eq('id', message.id); await db.from('recruitment_message_events').insert({ message_id: message.id, event_type: 'failed', metadata: { provider: 'configured_webhook', channel: message.channel } }); failed += 1 }
  }

  await db.from('recruitment_audit_events').insert({ event_type: 'recruitment.maintenance_completed', entity_type: 'recruitment', actor_type: 'system', metadata: { pages_published: pagesPublished, postings_published: postingIds.length, postings_closed: closingIds.length, offers_expired: offerIds.length, application_actions_completed: applicationActionsCompleted, campaigns_queued: campaignsQueued, calendars_synced: calendarsSynced, calendars_failed: calendarsFailed, messages_sent: sent, portal_delivered: delivered, failed } })
  return NextResponse.json({ ok: true, pagesPublished, postingsPublished: postingIds.length, postingsClosed: closingIds.length, offersExpired: offerIds.length, applicationActionsCompleted, campaignsQueued, calendarsSynced, calendarsFailed, messagesSent: sent, portalDelivered: delivered, failed })
}
