import { NextResponse, type NextRequest } from 'next/server';
import { isEmailConfigured, sendEmail } from '@/lib/email';
import {
  createSupabaseAdminClient,
  hasSupabaseAdminConfig,
} from '@/lib/supabase';
import { emitWorkflowEvent } from '@/lib/notifications/emit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function html(value: string) {
  return `<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${value.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]!)}</div>`;
}
function render(value: string, candidate: { full_name: string }) {
  const first = candidate.full_name.split(/\s+/)[0] || candidate.full_name;
  return value
    .replace(/{{candidate\.first_name}}/gi, first)
    .replace(/{{candidate\.full_name}}/gi, candidate.full_name);
}

export async function POST(request: NextRequest) {
  const secret = process.env.RECRUITMENT_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasSupabaseAdminConfig())
    return NextResponse.json(
      { error: 'Supabase admin env missing' },
      { status: 503 }
    );
  const db = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const [scheduledPages, scheduledPostings] = await Promise.all([
    db
      .from('careers_cms_pages')
      .select('id')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now)
      .limit(100),
    db
      .from('recruitment_job_postings')
      .select('id')
      .eq('status', 'scheduled')
      .lte('publish_at', now)
      .limit(100),
  ]);
  if (scheduledPages.error || scheduledPostings.error)
    return NextResponse.json(
      { error: 'Schedule lookup failed' },
      { status: 500 }
    );
  let pagesPublished = 0;
  for (const page of scheduledPages.data ?? []) {
    const { error } = await db.rpc('careers_cms_transition_page', {
      p_page_id: page.id,
      p_target_status: 'published',
      p_actor_employee_id: null,
      p_scheduled_at: null,
    });
    if (!error) pagesPublished += 1;
  }
  const postingIds = (scheduledPostings.data ?? []).map(
    (posting) => posting.id
  );
  if (postingIds.length)
    await db
      .from('recruitment_job_postings')
      .update({ status: 'published', published_at: now })
      .in('id', postingIds);

  const { data: closingPostings } = await db
    .from('recruitment_job_postings')
    .select('id')
    .in('status', ['published', 'paused'])
    .lte('unpublish_at', now)
    .limit(100);
  const closingIds = (closingPostings ?? []).map((posting) => posting.id);
  if (closingIds.length)
    await db
      .from('recruitment_job_postings')
      .update({ status: 'closed', closed_at: now })
      .in('id', closingIds);
  const { data: expiringOffers } = await db
    .from('recruitment_offers')
    .select('id')
    .in('status', ['sent', 'viewed'])
    .lte('expires_at', now)
    .limit(100);
  const offerIds = (expiringOffers ?? []).map((offer) => offer.id);
  if (offerIds.length) {
    await db
      .from('recruitment_offers')
      .update({ status: 'expired' })
      .in('id', offerIds);
    await db
      .from('recruitment_candidate_portal_tasks')
      .update({ status: 'expired' })
      .in('payload->>offer_id', offerIds);
  }

  const { data: duplicatePairsCreated, error: duplicateScanError } =
    await db.rpc('recruitment_detect_candidate_duplicates', { p_limit: 250 });
  if (duplicateScanError) {
    console.error('[recruitment-cron] duplicate scan failed', {
      code: duplicateScanError.code,
    });
  }

  let documentsScanned = 0;
  let documentsQuarantined = 0;
  let documentScanFailures = 0;
  const documentScannerUrl = process.env.RECRUITMENT_DOCUMENT_SCAN_URL;
  if (documentScannerUrl) {
    const { data: pendingDocuments } = await db
      .from('recruitment_candidate_documents')
      .select(
        'id, storage_bucket, storage_path, mime_type, sha256, malware_scan_attempts'
      )
      .eq('malware_scan_status', 'pending')
      .lt('malware_scan_attempts', 5)
      .limit(20);
    for (const document of pendingDocuments ?? []) {
      const attempt = Number(document.malware_scan_attempts ?? 0) + 1;
      try {
        const { data: signed, error: signError } = await db.storage
          .from(document.storage_bucket)
          .createSignedUrl(document.storage_path, 300);
        if (signError || !signed) throw new Error('object_unavailable');
        const response = await fetch(documentScannerUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(process.env.RECRUITMENT_DOCUMENT_SCAN_TOKEN
              ? {
                  authorization: `Bearer ${process.env.RECRUITMENT_DOCUMENT_SCAN_TOKEN}`,
                }
              : {}),
          },
          body: JSON.stringify({
            id: document.id,
            url: signed.signedUrl,
            mimeType: document.mime_type,
            sha256: document.sha256,
          }),
        });
        if (!response.ok) throw new Error(`scanner_${response.status}`);
        const result = (await response.json()) as {
          status?: string;
          reason?: string;
        };
        if (!['clean', 'quarantined'].includes(result.status ?? ''))
          throw new Error('scanner_invalid_response');
        const status = result.status as 'clean' | 'quarantined';
        await db
          .from('recruitment_candidate_documents')
          .update({
            malware_scan_status: status,
            malware_scan_attempts: attempt,
            malware_scan_error:
              status === 'quarantined'
                ? String(result.reason || 'scanner_flagged').slice(0, 250)
                : null,
            malware_scanned_at: new Date().toISOString(),
          })
          .eq('id', document.id)
          .eq('malware_scan_status', 'pending');
        if (status === 'quarantined') {
          await db.from('recruitment_document_access_events').insert({
            document_id: document.id,
            actor_type: 'system',
            action: 'quarantine',
            reason: String(result.reason || 'scanner_flagged').slice(0, 250),
          });
          documentsQuarantined += 1;
        } else documentsScanned += 1;
      } catch (error) {
        await db
          .from('recruitment_candidate_documents')
          .update({
            malware_scan_status: attempt >= 5 ? 'failed' : 'pending',
            malware_scan_attempts: attempt,
            malware_scan_error:
              error instanceof Error
                ? error.message.slice(0, 250)
                : 'scanner_error',
            malware_scanned_at: attempt >= 5 ? new Date().toISOString() : null,
          })
          .eq('id', document.id)
          .eq('malware_scan_status', 'pending');
        documentScanFailures += 1;
      }
    }
  }

  let automationSucceeded = 0;
  let automationFailed = 0;
  const { data: automationRules } = await db
    .from('recruitment_automation_rules')
    .select('id, conditions, actions')
    .eq('trigger_event', 'scheduled.maintenance')
    .eq('status', 'active')
    .order('priority');
  const beginAutomationRun = async (
    ruleId: string,
    triggerEventId: string,
    entityType: string,
    entityId: string
  ) => {
    const { data: latest } = await db
      .from('recruitment_automation_runs')
      .select('id, status, attempt, started_at')
      .eq('rule_id', ruleId)
      .eq('trigger_event_id', triggerEventId)
      .order('attempt', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest?.status === 'succeeded' || Number(latest?.attempt ?? 0) >= 3)
      return null;
    if (latest?.status === 'running') {
      if (
        latest.started_at &&
        Date.parse(latest.started_at) > Date.now() - 15 * 60_000
      )
        return null;
      await db
        .from('recruitment_automation_runs')
        .update({
          status: 'failed',
          error_message: 'Worker lease expired; safe retry queued.',
          completed_at: now,
        })
        .eq('id', latest.id)
        .eq('status', 'running');
    }
    const attempt = Number(latest?.attempt ?? 0) + 1;
    const { data: run } = await db
      .from('recruitment_automation_runs')
      .insert({
        rule_id: ruleId,
        trigger_event_id: triggerEventId,
        entity_type: entityType,
        entity_id: entityId,
        status: 'running',
        attempt,
        started_at: now,
      })
      .select('id')
      .maybeSingle();
    return run?.id ?? null;
  };
  const finishAutomationRun = async (
    runId: string,
    error: unknown,
    result: Record<string, unknown> = {}
  ) => {
    await db
      .from('recruitment_automation_runs')
      .update({
        status: error ? 'failed' : 'succeeded',
        result,
        error_message: error ? 'Automation action failed safely.' : null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId);
    if (error) automationFailed += 1;
    else automationSucceeded += 1;
  };
  const employeeMap = new Map<
    string,
    { id: string; full_name: string; email: string }
  >();
  const loadEmployees = async (ids: string[]) => {
    const missing = [...new Set(ids)].filter(
      (id) => id && !employeeMap.has(id)
    );
    if (missing.length) {
      const { data } = await db
        .from('workforce_employees')
        .select('id, full_name, email')
        .in('id', missing);
      for (const employee of data ?? []) employeeMap.set(employee.id, employee);
    }
  };
  for (const rule of automationRules ?? []) {
    const conditions =
      rule.conditions && typeof rule.conditions === 'object'
        ? (rule.conditions as Record<string, unknown>)
        : {};
    const actions = Array.isArray(rule.actions) ? rule.actions : [];
    for (const rawAction of actions) {
      const action =
        rawAction && typeof rawAction === 'object' && !Array.isArray(rawAction)
          ? String((rawAction as Record<string, unknown>).type ?? '')
          : '';
      if (action === 'candidate_interview_reminder') {
        const hours = Math.min(
          168,
          Math.max(1, Number(conditions.hours_before ?? 24))
        );
        const { data: interviews } = await db
          .from('recruitment_interviews')
          .select(
            'id, application_id, title, starts_at, timezone, location, meeting_url, recruitment_applications(candidate_id, recruitment_candidates(full_name, primary_email), workforce_jobs(title))'
          )
          .in('status', ['scheduled', 'confirmed'])
          .gt('starts_at', now)
          .lte(
            'starts_at',
            new Date(Date.now() + hours * 3_600_000).toISOString()
          )
          .limit(100);
        const { data: template } = await db
          .from('recruitment_message_templates')
          .select('id, subject_template, body_template')
          .eq('category', 'interview_reminder')
          .eq('language_code', 'en')
          .eq('channel', 'email')
          .eq('status', 'active')
          .maybeSingle();
        for (const interview of interviews ?? []) {
          const runId = await beginAutomationRun(
            rule.id,
            `${action}:${interview.id}`,
            'interview',
            interview.id
          );
          if (!runId) continue;
          try {
            const application = Array.isArray(
              interview.recruitment_applications
            )
              ? interview.recruitment_applications[0]
              : interview.recruitment_applications;
            const candidate = Array.isArray(application?.recruitment_candidates)
              ? application.recruitment_candidates[0]
              : application?.recruitment_candidates;
            const job = Array.isArray(application?.workforce_jobs)
              ? application.workforce_jobs[0]
              : application?.workforce_jobs;
            if (!template || !candidate)
              throw new Error('Reminder template or candidate unavailable');
            const { data: existing } = await db
              .from('recruitment_messages')
              .select('id')
              .eq('template_id', template.id)
              .eq('related_entity_type', 'interview')
              .eq('related_entity_id', interview.id)
              .maybeSingle();
            if (!existing) {
              const startsAt = new Date(interview.starts_at!).toLocaleString(
                'en-TZ',
                { timeZone: interview.timezone || 'Africa/Dar_es_Salaam' }
              );
              const replacements: Record<string, string> = {
                '{{candidate.first_name}}':
                  candidate.full_name.split(/\s+/)[0] || candidate.full_name,
                '{{candidate.full_name}}': candidate.full_name,
                '{{job.title}}': job?.title ?? 'your role',
                '{{interview.starts_at}}': startsAt,
              };
              const apply = (value: string) =>
                Object.entries(replacements).reduce(
                  (output, [key, replacement]) =>
                    output.replaceAll(key, replacement),
                  value
                );
              const { data: message, error } = await db
                .from('recruitment_messages')
                .insert({
                  candidate_id: application!.candidate_id,
                  application_id: interview.application_id,
                  template_id: template.id,
                  channel: 'email',
                  subject: apply(
                    template.subject_template || 'Interview reminder'
                  ),
                  body: apply(template.body_template),
                  status: 'queued',
                  approval_status: 'approved',
                  related_entity_type: 'interview',
                  related_entity_id: interview.id,
                })
                .select('id')
                .single();
              if (error) throw error;
              const { error: recipientError } = await db
                .from('recruitment_message_recipients')
                .insert({
                  message_id: message.id,
                  recipient_type: 'to',
                  address: candidate.primary_email,
                  display_name: candidate.full_name,
                });
              if (recipientError) throw recipientError;
            }
            await finishAutomationRun(runId, null, { queued: !existing });
          } catch (error) {
            await finishAutomationRun(runId, error);
          }
        }
      }
      if (action === 'alert_stalled_applications') {
        const days = Math.min(
          30,
          Math.max(1, Number(conditions.days_in_stage ?? 3))
        );
        const { data: applications } = await db
          .from('recruitment_applications')
          .select('id, application_reference, assigned_recruiter_id')
          .in('status', ['submitted', 'under_review'])
          .not('assigned_recruiter_id', 'is', null)
          .lt(
            'last_stage_changed_at',
            new Date(Date.now() - days * 86_400_000).toISOString()
          )
          .limit(100);
        await loadEmployees(
          (applications ?? []).flatMap((item) =>
            item.assigned_recruiter_id ? [item.assigned_recruiter_id] : []
          )
        );
        for (const application of applications ?? []) {
          const runId = await beginAutomationRun(
            rule.id,
            `${action}:${application.id}:${now.slice(0, 10)}`,
            'application',
            application.id
          );
          if (!runId) continue;
          const employee = application.assigned_recruiter_id
            ? employeeMap.get(application.assigned_recruiter_id)
            : null;
          try {
            if (!employee) throw new Error('Assigned recruiter unavailable');
            const emitted = await emitWorkflowEvent({
              entityType: 'recruitment_application',
              entityId: application.id,
              eventType: 'recruitment.application_stalled',
              actor: { employeeId: null, name: 'Recruitment automation' },
              recipients: [
                {
                  employeeId: employee.id,
                  name: employee.full_name,
                  email: employee.email,
                },
              ],
              title: `Application ${application.application_reference} needs review`,
              body: `This application has remained in its current review stage for at least ${days} days.`,
              href: `/workforce/recruitment/applications/${application.id}`,
            });
            if (emitted.errors.length)
              throw new Error('Notification fan-out failed');
            await finishAutomationRun(runId, null, {
              notification_event_id: emitted.eventId,
            });
          } catch (error) {
            await finishAutomationRun(runId, error);
          }
        }
      }
      if (action === 'remind_overdue_scorecards') {
        const hours = Math.min(
          168,
          Math.max(1, Number(conditions.hours_overdue ?? 24))
        );
        const { data: scorecards } = await db
          .from('recruitment_scorecards')
          .select(
            'id, interview_id, reviewer_employee_id, recruitment_interviews(title, ends_at)'
          )
          .eq('status', 'draft')
          .limit(100);
        const overdue = (scorecards ?? []).filter((scorecard) => {
          const interview = Array.isArray(scorecard.recruitment_interviews)
            ? scorecard.recruitment_interviews[0]
            : scorecard.recruitment_interviews;
          return (
            interview?.ends_at &&
            Date.parse(interview.ends_at) < Date.now() - hours * 3_600_000
          );
        });
        await loadEmployees(overdue.map((item) => item.reviewer_employee_id));
        for (const scorecard of overdue) {
          const runId = await beginAutomationRun(
            rule.id,
            `${action}:${scorecard.id}:${now.slice(0, 10)}`,
            'scorecard',
            scorecard.id
          );
          if (!runId) continue;
          const employee = employeeMap.get(scorecard.reviewer_employee_id);
          const interview = Array.isArray(scorecard.recruitment_interviews)
            ? scorecard.recruitment_interviews[0]
            : scorecard.recruitment_interviews;
          try {
            if (!employee) throw new Error('Reviewer unavailable');
            const emitted = await emitWorkflowEvent({
              entityType: 'recruitment_scorecard',
              entityId: scorecard.id,
              eventType: 'recruitment.scorecard_overdue',
              actor: { employeeId: null, name: 'Recruitment automation' },
              recipients: [
                {
                  employeeId: employee.id,
                  name: employee.full_name,
                  email: employee.email,
                },
              ],
              title: `Scorecard overdue: ${interview?.title ?? 'interview'}`,
              body: 'Submit your independent scorecard so the hiring process can continue.',
              href: `/workforce/recruitment/interviews/${scorecard.interview_id}`,
            });
            if (emitted.errors.length)
              throw new Error('Notification fan-out failed');
            await finishAutomationRun(runId, null, {
              notification_event_id: emitted.eventId,
            });
          } catch (error) {
            await finishAutomationRun(runId, error);
          }
        }
      }
      if (action === 'notify_expiring_offers') {
        const hours = Math.min(
          168,
          Math.max(1, Number(conditions.hours_before ?? 48))
        );
        const { data: offers } = await db
          .from('recruitment_offers')
          .select(
            'id, offer_number, expires_at, recruitment_applications(assigned_recruiter_id)'
          )
          .in('status', ['sent', 'viewed'])
          .gt('expires_at', now)
          .lte(
            'expires_at',
            new Date(Date.now() + hours * 3_600_000).toISOString()
          )
          .limit(100);
        const recruiterIds = (offers ?? []).flatMap((offer) => {
          const application = Array.isArray(offer.recruitment_applications)
            ? offer.recruitment_applications[0]
            : offer.recruitment_applications;
          return application?.assigned_recruiter_id
            ? [application.assigned_recruiter_id]
            : [];
        });
        await loadEmployees(recruiterIds);
        for (const offer of offers ?? []) {
          const runId = await beginAutomationRun(
            rule.id,
            `${action}:${offer.id}:${now.slice(0, 10)}`,
            'offer',
            offer.id
          );
          if (!runId) continue;
          const application = Array.isArray(offer.recruitment_applications)
            ? offer.recruitment_applications[0]
            : offer.recruitment_applications;
          const employee = application?.assigned_recruiter_id
            ? employeeMap.get(application.assigned_recruiter_id)
            : null;
          try {
            if (!employee) throw new Error('Assigned recruiter unavailable');
            const emitted = await emitWorkflowEvent({
              entityType: 'recruitment_offer',
              entityId: offer.id,
              eventType: 'recruitment.offer_expiring',
              actor: { employeeId: null, name: 'Recruitment automation' },
              recipients: [
                {
                  employeeId: employee.id,
                  name: employee.full_name,
                  email: employee.email,
                },
              ],
              title: `Offer ${offer.offer_number} expires soon`,
              body: `Candidate response is due ${new Date(offer.expires_at!).toLocaleString('en-TZ')}.`,
              href: `/workforce/recruitment/offers/${offer.id}`,
            });
            if (emitted.errors.length)
              throw new Error('Notification fan-out failed');
            await finishAutomationRun(runId, null, {
              notification_event_id: emitted.eventId,
            });
          } catch (error) {
            await finishAutomationRun(runId, error);
          }
        }
      }
    }
    await db
      .from('recruitment_automation_rules')
      .update({ last_run_at: now })
      .eq('id', rule.id);
  }

  const { data: scheduledActions } = await db
    .from('recruitment_scheduled_application_actions')
    .select('*')
    .eq('status', 'scheduled')
    .limit(100);
  const triggerIds = [
    ...new Set(
      (scheduledActions ?? [])
        .map((action) => action.trigger_offer_id)
        .filter(Boolean)
    ),
  ] as string[];
  const { data: triggerOffers } = triggerIds.length
    ? await db
        .from('recruitment_offers')
        .select('id, status')
        .in('id', triggerIds)
    : { data: [] as Array<{ id: string; status: string }> };
  const triggerMap = new Map(
    (triggerOffers ?? []).map((offer) => [offer.id, offer.status])
  );
  let applicationActionsCompleted = 0;
  for (const action of scheduledActions ?? []) {
    const due =
      action.execute_after && Date.parse(action.execute_after) <= Date.now();
    const triggered =
      action.trigger_offer_id &&
      triggerMap.get(action.trigger_offer_id) === 'accepted';
    if (!due && !triggered) continue;
    const { data: claimedAction } = await db
      .from('recruitment_scheduled_application_actions')
      .update({ status: 'processing' })
      .eq('id', action.id)
      .eq('status', 'scheduled')
      .select('id')
      .maybeSingle();
    if (!claimedAction) continue;
    const payload = action.payload as {
      reason_code?: string;
      note?: string;
      template_id?: string;
    };
    const { error } =
      action.target_status === 'rejected' && payload.template_id
        ? await db.rpc('recruitment_bulk_reject_applications', {
            p_application_ids: [action.application_id],
            p_actor_employee_id: action.created_by,
            p_reason_code: payload.reason_code ?? null,
            p_note: payload.note ?? null,
            p_template_id: payload.template_id,
          })
        : await db.rpc('recruitment_transition_application', {
            p_application_id: action.application_id,
            p_target_status: action.target_status,
            p_actor_employee_id: action.created_by,
            p_reason_code: payload.reason_code ?? null,
            p_note: payload.note ?? null,
          });
    await db
      .from('recruitment_scheduled_application_actions')
      .update({
        status: error ? 'failed' : 'completed',
        executed_at: error ? null : new Date().toISOString(),
        error_message: error
          ? 'Transition no longer valid; manual review required.'
          : null,
      })
      .eq('id', action.id);
    if (!error) applicationActionsCompleted += 1;
  }

  const { data: dueCampaigns } = await db
    .from('recruitment_nurture_campaigns')
    .select('id, pool_id, template_id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .limit(20);
  let campaignsQueued = 0;
  for (const campaign of dueCampaigns ?? []) {
    if (!campaign.pool_id || !campaign.template_id) continue;
    const [{ data: template }, { data: members }] = await Promise.all([
      db
        .from('recruitment_message_templates')
        .select('id, channel, subject_template, body_template')
        .eq('id', campaign.template_id)
        .eq('status', 'active')
        .maybeSingle(),
      db
        .from('recruitment_talent_pool_members')
        .select(
          'candidate_id, recruitment_candidates(full_name, primary_email)'
        )
        .eq('pool_id', campaign.pool_id)
        .eq('status', 'active'),
    ]);
    if (!template || template.channel !== 'email') {
      await db
        .from('recruitment_nurture_campaigns')
        .update({ status: 'paused' })
        .eq('id', campaign.id);
      continue;
    }
    await db
      .from('recruitment_nurture_campaigns')
      .update({ status: 'running', started_at: now })
      .eq('id', campaign.id);
    for (const member of members ?? []) {
      const candidate = Array.isArray(member.recruitment_candidates)
        ? member.recruitment_candidates[0]
        : member.recruitment_candidates;
      if (!candidate) continue;
      const { data: consent } = await db
        .from('recruitment_candidate_consents')
        .select('id')
        .eq('candidate_id', member.candidate_id)
        .eq('consent_type', 'career_updates')
        .not('granted_at', 'is', null)
        .is('withdrawn_at', null)
        .limit(1)
        .maybeSingle();
      if (!consent) continue;
      const { data: latestApplication } = await db
        .from('recruitment_applications')
        .select('id')
        .eq('candidate_id', member.candidate_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: message } = await db
        .from('recruitment_messages')
        .insert({
          candidate_id: member.candidate_id,
          application_id: latestApplication?.id ?? null,
          template_id: template.id,
          channel: 'email',
          subject: render(
            template.subject_template || 'OpusFesta careers update',
            candidate
          ),
          body: render(template.body_template, candidate),
          status: 'queued',
          approval_status: 'approved',
        })
        .select('id')
        .single();
      if (message) {
        await db.from('recruitment_message_recipients').insert({
          message_id: message.id,
          recipient_type: 'to',
          address: candidate.primary_email,
          display_name: candidate.full_name,
        });
        campaignsQueued += 1;
      }
    }
    await db
      .from('recruitment_nurture_campaigns')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', campaign.id);
  }

  let calendarsSynced = 0;
  let calendarsFailed = 0;
  const googleToken = process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;
  const googleCalendarId = process.env.GOOGLE_RECRUITMENT_CALENDAR_ID;
  if (googleToken && googleCalendarId) {
    const { data: calendarRows } = await db
      .from('recruitment_calendar_sync_queue')
      .select('id, interview_id, attempt')
      .in('status', ['queued', 'failed'])
      .lt('attempt', 5)
      .limit(20);
    for (const queue of calendarRows ?? []) {
      await db
        .from('recruitment_calendar_sync_queue')
        .update({ status: 'syncing', attempt: queue.attempt + 1 })
        .eq('id', queue.id);
      const { data: interview } = await db
        .from('recruitment_interviews')
        .select(
          'id, title, status, starts_at, ends_at, timezone, location, meeting_url, candidate_instructions, calendar_event_id, recruitment_applications(recruitment_candidates(full_name, primary_email))'
        )
        .eq('id', queue.interview_id)
        .single();
      const { data: participants } = await db
        .from('recruitment_interview_participants')
        .select('workforce_employees(full_name, email)')
        .eq('interview_id', queue.interview_id);
      const application = Array.isArray(interview?.recruitment_applications)
        ? interview.recruitment_applications[0]
        : interview?.recruitment_applications;
      const candidate = Array.isArray(application?.recruitment_candidates)
        ? application.recruitment_candidates[0]
        : application?.recruitment_candidates;
      if (interview && ['cancelled', 'no_show'].includes(interview.status)) {
        if (!interview.calendar_event_id) {
          await db
            .from('recruitment_calendar_sync_queue')
            .update({
              status: 'cancelled',
              synced_at: new Date().toISOString(),
              last_error: null,
            })
            .eq('id', queue.id);
          calendarsSynced += 1;
          continue;
        }
        const deleteUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(googleCalendarId)}/events/${encodeURIComponent(interview.calendar_event_id)}?sendUpdates=all`;
        try {
          const response = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: { authorization: `Bearer ${googleToken}` },
          });
          if (
            !response.ok &&
            response.status !== 404 &&
            response.status !== 410
          )
            throw new Error(`provider_${response.status}`);
          await db
            .from('recruitment_calendar_sync_queue')
            .update({
              status: 'cancelled',
              synced_at: new Date().toISOString(),
              last_error: null,
            })
            .eq('id', queue.id);
          calendarsSynced += 1;
        } catch (error) {
          await db
            .from('recruitment_calendar_sync_queue')
            .update({
              status: 'failed',
              last_error:
                error instanceof Error && /^provider_\d+$/.test(error.message)
                  ? error.message
                  : 'provider_error',
            })
            .eq('id', queue.id);
          calendarsFailed += 1;
        }
        continue;
      }
      if (!interview?.starts_at || !interview.ends_at || !candidate) {
        await db
          .from('recruitment_calendar_sync_queue')
          .update({ status: 'failed', last_error: 'incomplete_interview' })
          .eq('id', queue.id);
        calendarsFailed += 1;
        continue;
      }
      const attendees = [
        { email: candidate.primary_email, displayName: candidate.full_name },
        ...(participants ?? []).flatMap((row) => {
          const employee = Array.isArray(row.workforce_employees)
            ? row.workforce_employees[0]
            : row.workforce_employees;
          return employee?.email
            ? [{ email: employee.email, displayName: employee.full_name }]
            : [];
        }),
      ];
      const payload = {
        summary: interview.title,
        description:
          interview.candidate_instructions || 'OpusFesta recruitment interview',
        location: interview.location || undefined,
        start: {
          dateTime: interview.starts_at,
          timeZone: interview.timezone || 'Africa/Dar_es_Salaam',
        },
        end: {
          dateTime: interview.ends_at,
          timeZone: interview.timezone || 'Africa/Dar_es_Salaam',
        },
        attendees,
        conferenceData: interview.meeting_url
          ? undefined
          : {
              createRequest: {
                requestId: `recruitment-${interview.id}`,
                conferenceSolutionKey: { type: 'hangoutsMeet' },
              },
            },
      };
      const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(googleCalendarId)}/events`;
      const url = interview.calendar_event_id
        ? `${baseUrl}/${encodeURIComponent(interview.calendar_event_id)}?conferenceDataVersion=1&sendUpdates=all`
        : `${baseUrl}?conferenceDataVersion=1&sendUpdates=all`;
      try {
        const response = await fetch(url, {
          method: interview.calendar_event_id ? 'PUT' : 'POST',
          headers: {
            authorization: `Bearer ${googleToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`provider_${response.status}`);
        const event = (await response.json()) as {
          id: string;
          hangoutLink?: string;
        };
        await db
          .from('recruitment_interviews')
          .update({
            calendar_event_id: event.id,
            meeting_url: interview.meeting_url || event.hangoutLink || null,
          })
          .eq('id', interview.id);
        await db
          .from('recruitment_calendar_sync_queue')
          .update({
            status: 'synced',
            synced_at: new Date().toISOString(),
            last_error: null,
          })
          .eq('id', queue.id);
        calendarsSynced += 1;
      } catch (error) {
        await db
          .from('recruitment_calendar_sync_queue')
          .update({
            status: 'failed',
            last_error:
              error instanceof Error && /^provider_\d+$/.test(error.message)
                ? error.message
                : 'provider_error',
          })
          .eq('id', queue.id);
        calendarsFailed += 1;
      }
    }
  }

  let sent = 0;
  let delivered = 0;
  let failed = 0;
  const { data: claimed, error: claimError } = await db.rpc(
    'recruitment_claim_messages',
    { p_limit: 25 }
  );
  if (claimError)
    return NextResponse.json(
      { error: 'Message claim failed' },
      { status: 500 }
    );
  for (const message of claimed ?? []) {
    const { data: recipients } = await db
      .from('recruitment_message_recipients')
      .select('address, recipient_type')
      .eq('message_id', message.id);
    if (message.channel === 'in_app') {
      if (!message.candidate_id) {
        await db
          .from('recruitment_messages')
          .update({ status: 'failed' })
          .eq('id', message.id);
        failed += 1;
        continue;
      }
      const { error } = await db.from('recruitment_candidate_notices').insert({
        candidate_id: message.candidate_id,
        application_id: message.application_id,
        notice_type: 'message',
        title: message.subject || 'Message from OpusFesta',
        body: message.body,
        version: '1',
      });
      await db
        .from('recruitment_messages')
        .update({
          status: error ? 'failed' : 'delivered',
          sent_at: error ? null : now,
        })
        .eq('id', message.id);
      if (error) failed += 1;
      else delivered += 1;
      continue;
    }
    const to = (recipients ?? [])
      .filter((r) => r.recipient_type === 'to')
      .map((r) => r.address);
    const cc = (recipients ?? [])
      .filter((r) => r.recipient_type === 'cc')
      .map((r) => r.address);
    const bcc = (recipients ?? [])
      .filter((r) => r.recipient_type === 'bcc')
      .map((r) => r.address);
    if (!to.length) {
      await db
        .from('recruitment_messages')
        .update({ status: 'failed' })
        .eq('id', message.id);
      failed += 1;
      continue;
    }
    if (message.channel === 'email') {
      if (!isEmailConfigured()) {
        await db
          .from('recruitment_messages')
          .update({ status: 'queued' })
          .eq('id', message.id);
        continue;
      }
      const result = await sendEmail({
        to,
        cc: cc.length ? cc : undefined,
        bcc: bcc.length ? bcc : undefined,
        subject: message.subject || 'Message from OpusFesta',
        text: message.body,
        html: html(message.body),
      });
      await db
        .from('recruitment_messages')
        .update({
          status: result.sent ? 'sent' : 'failed',
          provider_message_id: result.sent ? result.id : null,
          sent_at: result.sent ? now : null,
        })
        .eq('id', message.id);
      await db.from('recruitment_message_events').insert({
        message_id: message.id,
        event_type: result.sent ? 'sent' : 'failed',
        provider_event_id: result.sent ? result.id : null,
        metadata: { provider: 'resend' },
      });
      if (result.sent) sent += 1;
      else failed += 1;
      continue;
    }
    const webhook = process.env.RECRUITMENT_MESSAGING_WEBHOOK_URL;
    if (!webhook) {
      await db
        .from('recruitment_messages')
        .update({ status: 'queued' })
        .eq('id', message.id);
      continue;
    }
    try {
      const response = await fetch(webhook, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.RECRUITMENT_MESSAGING_WEBHOOK_TOKEN
            ? {
                authorization: `Bearer ${process.env.RECRUITMENT_MESSAGING_WEBHOOK_TOKEN}`,
              }
            : {}),
        },
        body: JSON.stringify({
          id: message.id,
          channel: message.channel,
          to,
          body: message.body,
        }),
      });
      if (!response.ok) throw new Error('provider_error');
      const result = (await response.json().catch(() => ({}))) as {
        id?: string;
      };
      await db
        .from('recruitment_messages')
        .update({
          status: 'sent',
          provider_message_id: result.id ?? null,
          sent_at: now,
        })
        .eq('id', message.id);
      await db.from('recruitment_message_events').insert({
        message_id: message.id,
        event_type: 'sent',
        provider_event_id: result.id ?? null,
        metadata: {
          provider: 'configured_webhook',
          channel: message.channel,
        },
      });
      sent += 1;
    } catch {
      await db
        .from('recruitment_messages')
        .update({ status: 'failed' })
        .eq('id', message.id);
      await db.from('recruitment_message_events').insert({
        message_id: message.id,
        event_type: 'failed',
        metadata: {
          provider: 'configured_webhook',
          channel: message.channel,
        },
      });
      failed += 1;
    }
  }

  await db.from('recruitment_audit_events').insert({
    event_type: 'recruitment.maintenance_completed',
    entity_type: 'recruitment',
    actor_type: 'system',
    metadata: {
      pages_published: pagesPublished,
      postings_published: postingIds.length,
      postings_closed: closingIds.length,
      offers_expired: offerIds.length,
      duplicate_pairs_created: duplicatePairsCreated ?? 0,
      documents_scanned: documentsScanned,
      documents_quarantined: documentsQuarantined,
      document_scan_failures: documentScanFailures,
      application_actions_completed: applicationActionsCompleted,
      automation_succeeded: automationSucceeded,
      automation_failed: automationFailed,
      campaigns_queued: campaignsQueued,
      calendars_synced: calendarsSynced,
      calendars_failed: calendarsFailed,
      messages_sent: sent,
      portal_delivered: delivered,
      failed,
    },
  });
  return NextResponse.json({
    ok: true,
    pagesPublished,
    postingsPublished: postingIds.length,
    postingsClosed: closingIds.length,
    offersExpired: offerIds.length,
    duplicatePairsCreated: duplicatePairsCreated ?? 0,
    documentsScanned,
    documentsQuarantined,
    documentScanFailures,
    applicationActionsCompleted,
    automationSucceeded,
    automationFailed,
    campaignsQueued,
    calendarsSynced,
    calendarsFailed,
    messagesSent: sent,
    portalDelivered: delivered,
    failed,
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
