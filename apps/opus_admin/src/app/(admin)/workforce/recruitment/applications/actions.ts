'use server';

import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { requireRecruitmentAccess } from '@/lib/recruitment-auth';

const TRANSITIONS = new Set([
  'under_review',
  'eligibility_review',
  'screening',
  'hiring_manager_review',
  'assessment',
  'interview',
  'final_interview',
  'reference_check',
  'offer',
  'on_hold',
  'rejected',
  'position_closed',
  'no_response',
  'duplicate',
  'disqualified',
  'archived',
]);

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

export async function transitionApplication(
  applicationId: string,
  formData: FormData
): Promise<void> {
  const target = text(formData, 'target_status');
  if (!TRANSITIONS.has(target)) throw new Error('Invalid application status.');
  const access = await requireRecruitmentAccess({
    entityType: 'application',
    entityId: applicationId,
    allowedPermissions: [
      target === 'rejected'
        ? 'workforce.applications.reject'
        : 'workforce.applications.advance',
    ],
  });
  const supabase = createSupabaseAdminClient();
  const templateId = text(formData, 'template_id');
  if (target === 'rejected' && !templateId)
    throw new Error('Choose an approved candidate-facing outcome template.');
  const { error } =
    target === 'rejected'
      ? await supabase.rpc('recruitment_bulk_reject_applications', {
          p_application_ids: [applicationId],
          p_actor_employee_id: access.employeeId,
          p_reason_code: text(formData, 'reason_code') || null,
          p_note: text(formData, 'note') || null,
          p_template_id: templateId,
        })
      : await supabase.rpc('recruitment_transition_application', {
          p_application_id: applicationId,
          p_target_status: target,
          p_actor_employee_id: access.employeeId,
          p_reason_code: text(formData, 'reason_code') || null,
          p_note: text(formData, 'note') || null,
        });
  if (error) throw error;
  revalidatePath('/workforce/recruitment');
  revalidatePath('/workforce/recruitment/applications');
  revalidatePath(`/workforce/recruitment/applications/${applicationId}`);
}

export async function addApplicationNote(
  applicationId: string,
  formData: FormData
): Promise<void> {
  const access = await requireRecruitmentAccess({
    entityType: 'application',
    entityId: applicationId,
    allowedPermissions: ['workforce.candidates.write'],
  });
  const body = text(formData, 'body');
  const visibility = text(formData, 'visibility') || 'recruiting_team';
  if (body.length < 2) throw new Error('Note cannot be empty.');
  if (!['recruiting_team', 'hiring_team', 'private'].includes(visibility))
    throw new Error('Invalid note visibility.');
  const supabase = createSupabaseAdminClient();
  const { data: application, error: lookupError } = await supabase
    .from('recruitment_applications')
    .select('candidate_id')
    .eq('id', applicationId)
    .single<{ candidate_id: string }>();
  if (lookupError) throw lookupError;
  const { error } = await supabase.from('recruitment_candidate_notes').insert({
    candidate_id: application.candidate_id,
    application_id: applicationId,
    author_employee_id: access.employeeId,
    body,
    visibility,
  });
  if (error) throw error;
  await supabase.from('recruitment_audit_events').insert({
    event_type: 'candidate.note_added',
    entity_type: 'application',
    entity_id: applicationId,
    actor_type: 'employee',
    metadata: { visibility },
  });
  revalidatePath(`/workforce/recruitment/applications/${applicationId}`);
}

export async function createInterview(
  applicationId: string,
  formData: FormData
): Promise<void> {
  const access = await requireRecruitmentAccess({
    entityType: 'application',
    entityId: applicationId,
    allowedPermissions: ['workforce.interviews.schedule'],
  });
  const title = text(formData, 'title');
  const interviewType = text(formData, 'interview_type');
  if (title.length < 3 || title.length > 160)
    throw new Error('Enter an interview title.');
  if (
    !['phone', 'video', 'onsite', 'panel', 'working_session', 'other'].includes(
      interviewType
    )
  ) {
    throw new Error('Choose a valid interview type.');
  }
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('recruitment_interviews')
    .insert({
      application_id: applicationId,
      title,
      interview_type: interviewType,
      status: 'draft',
      created_by: access.employeeId,
    })
    .select('id')
    .single<{ id: string }>();
  if (error) throw error;
  await supabase.from('recruitment_audit_events').insert({
    event_type: 'interview.created',
    entity_type: 'interview',
    entity_id: data.id,
    actor_type: 'employee',
    metadata: { application_id: applicationId, interview_type: interviewType },
  });
  revalidatePath(`/workforce/recruitment/applications/${applicationId}`);
  revalidatePath('/workforce/recruitment/interviews');
}

export async function createOffer(
  applicationId: string,
  formData: FormData
): Promise<void> {
  const access = await requireRecruitmentAccess({
    entityType: 'application',
    entityId: applicationId,
    allowedPermissions: ['workforce.offers.create'],
  });
  const salary = Number(text(formData, 'base_salary'));
  const startDate = text(formData, 'start_date');
  const expiresOn = text(formData, 'expires_on');
  if (!Number.isSafeInteger(salary) || salary < 0)
    throw new Error('Enter a valid base salary.');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)
  )
    throw new Error('Choose valid offer dates.');
  const conditions = text(formData, 'conditions')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc('recruitment_create_offer', {
    p_application_id: applicationId,
    p_start_date: startDate,
    p_expires_at: `${expiresOn}T14:00:00.000Z`,
    p_base_salary: salary,
    p_pay_frequency: text(formData, 'pay_frequency') || 'monthly',
    p_working_hours: text(formData, 'working_hours') || null,
    p_contract_duration: text(formData, 'contract_duration') || null,
    p_probation_terms: text(formData, 'probation_terms') || null,
    p_conditions: conditions,
    p_actor_employee_id: access.employeeId,
  });
  if (error) throw error;
  revalidatePath(`/workforce/recruitment/applications/${applicationId}`);
  redirect(`/workforce/recruitment/offers/${String(data)}`);
}

export async function createAssessment(
  applicationId: string,
  formData: FormData
): Promise<void> {
  const access = await requireRecruitmentAccess({
    entityType: 'application',
    entityId: applicationId,
    allowedPermissions: ['workforce.assessments.write'],
  });
  const title = text(formData, 'title');
  const assessmentType = text(formData, 'assessment_type');
  const dueOn = text(formData, 'due_on');
  const timeLimit = Number(text(formData, 'time_limit_minutes') || '0');
  if (title.length < 3 || assessmentType.length < 3)
    throw new Error('Enter an assessment title and type.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) throw new Error('Choose a due date.');
  if (!Number.isSafeInteger(timeLimit) || timeLimit < 0 || timeLimit > 1440)
    throw new Error('Enter a valid time limit.');
  const supabase = createSupabaseAdminClient();
  const { data: application, error: appError } = await supabase
    .from('recruitment_applications')
    .select('candidate_id')
    .eq('id', applicationId)
    .single<{ candidate_id: string }>();
  if (appError) throw appError;
  const { data: assessment, error } = await supabase
    .from('recruitment_assessments')
    .insert({
      application_id: applicationId,
      assessment_type: assessmentType,
      title,
      instructions: text(formData, 'instructions') || null,
      status: 'invited',
      due_at: `${dueOn}T20:59:59.000Z`,
      time_limit_minutes: timeLimit || null,
      reviewer_employee_id: access.employeeId,
    })
    .select('id')
    .single<{ id: string }>();
  if (error) throw error;
  await supabase.from('recruitment_candidate_portal_tasks').insert({
    candidate_id: application.candidate_id,
    application_id: applicationId,
    task_type: 'questionnaire',
    title,
    instructions: text(formData, 'instructions') || null,
    payload: {
      assessment_id: assessment.id,
      assessment_type: assessmentType,
      time_limit_minutes: timeLimit || null,
    },
    due_at: `${dueOn}T20:59:59.000Z`,
  });
  await supabase.from('recruitment_audit_events').insert({
    event_type: 'assessment.invited',
    entity_type: 'assessment',
    entity_id: assessment.id,
    actor_type: 'employee',
    metadata: {
      application_id: applicationId,
      actor_employee_id: access.employeeId,
    },
  });
  revalidatePath(`/workforce/recruitment/applications/${applicationId}`);
  revalidatePath('/workforce/recruitment/assessments');
}

export async function requestReferenceCheck(
  applicationId: string,
  formData: FormData
): Promise<void> {
  const access = await requireRecruitmentAccess({
    entityType: 'application',
    entityId: applicationId,
    allowedPermissions: ['workforce.applications.advance'],
  });
  const refereeName = text(formData, 'referee_name');
  const refereeEmail = text(formData, 'referee_email').toLowerCase();
  const relationship = text(formData, 'relationship');
  if (
    refereeName.length < 2 ||
    !/^\S+@\S+\.\S+$/.test(refereeEmail) ||
    relationship.length < 2
  )
    throw new Error('Enter the referee name, email and relationship.');
  if (text(formData, 'candidate_consent_confirmed') !== 'on')
    throw new Error(
      'Confirm that the candidate consented to contacting this referee.'
    );
  const db = createSupabaseAdminClient();
  const { data: application, error: applicationError } = await db
    .from('recruitment_applications')
    .select(
      'candidate_id, recruitment_candidates(full_name), workforce_jobs(title)'
    )
    .eq('id', applicationId)
    .single();
  if (applicationError) throw applicationError;
  const candidate = Array.isArray(application.recruitment_candidates)
    ? application.recruitment_candidates[0]
    : application.recruitment_candidates;
  const job = Array.isArray(application.workforce_jobs)
    ? application.workforce_jobs[0]
    : application.workforce_jobs;
  if (!candidate) throw new Error('Candidate profile is unavailable.');
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 14 * 86400000).toISOString();
  const { data: check, error: checkError } = await db
    .from('recruitment_reference_checks')
    .insert({
      application_id: applicationId,
      referee_name: refereeName,
      referee_email: refereeEmail,
      relationship,
      status: 'requested',
      candidate_consent_at: new Date().toISOString(),
      access_token_hash: tokenHash,
      access_expires_at: expiresAt,
      requested_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (checkError) throw checkError;
  try {
    const { data: template, error: templateError } = await db
      .from('recruitment_message_templates')
      .select('id, subject_template, body_template')
      .eq('category', 'reference')
      .eq('channel', 'email')
      .eq(
        'language_code',
        text(formData, 'language_code') === 'sw' ? 'sw' : 'en'
      )
      .eq('status', 'active')
      .single();
    if (templateError) throw templateError;
    const baseUrl =
      process.env.NEXT_PUBLIC_WEBSITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://opusfesta.com';
    const referenceUrl = `${baseUrl.replace(/\/$/, '')}/careers/reference/${token}`;
    const render = (value: string) =>
      value
        .replaceAll('{{candidate.full_name}}', candidate.full_name)
        .replaceAll('{{job.title}}', job?.title ?? 'an OpusFesta role');
    const { data: message, error: messageError } = await db
      .from('recruitment_messages')
      .insert({
        candidate_id: application.candidate_id,
        application_id: applicationId,
        template_id: template.id,
        channel: 'email',
        subject: render(
          template.subject_template ||
            `Reference request for ${candidate.full_name}`
        ),
        body: `${render(template.body_template)}\n\nSecure form (expires in 14 days): ${referenceUrl}`,
        status: 'queued',
        approval_status: 'approved',
        sent_by: access.employeeId,
        related_entity_type: 'reference_check',
        related_entity_id: check.id,
      })
      .select('id')
      .single();
    if (messageError) throw messageError;
    const { error: recipientError } = await db
      .from('recruitment_message_recipients')
      .insert({
        message_id: message.id,
        recipient_type: 'to',
        address: refereeEmail,
        display_name: refereeName,
      });
    if (recipientError) throw recipientError;
    await db
      .from('recruitment_audit_events')
      .insert({
        event_type: 'reference.requested',
        entity_type: 'reference_check',
        entity_id: check.id,
        actor_type: 'employee',
        metadata: {
          application_id: applicationId,
          actor_employee_id: access.employeeId,
          consent_confirmed: true,
          expires_at: expiresAt,
        },
      });
  } catch (error) {
    await db.from('recruitment_reference_checks').delete().eq('id', check.id);
    throw error;
  }
  revalidatePath(`/workforce/recruitment/applications/${applicationId}`);
}

export async function reviewReferenceCheck(
  applicationId: string,
  checkId: string
): Promise<void> {
  const access = await requireRecruitmentAccess({
    entityType: 'application',
    entityId: applicationId,
    allowedPermissions: ['workforce.applications.advance'],
  });
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from('recruitment_reference_checks')
    .update({ status: 'reviewed', reviewed_by: access.employeeId })
    .eq('id', checkId)
    .eq('application_id', applicationId)
    .eq('status', 'received')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data)
    throw new Error('Only a received reference can be marked reviewed.');
  await db
    .from('recruitment_audit_events')
    .insert({
      event_type: 'reference.reviewed',
      entity_type: 'reference_check',
      entity_id: checkId,
      actor_type: 'employee',
      metadata: {
        application_id: applicationId,
        actor_employee_id: access.employeeId,
      },
    });
  revalidatePath(`/workforce/recruitment/applications/${applicationId}`);
}

export async function requestBackgroundCheck(
  applicationId: string,
  formData: FormData
): Promise<void> {
  const access = await requireRecruitmentAccess({
    entityType: 'application',
    entityId: applicationId,
    allowedPermissions: ['workforce.offers.approve'],
  });
  const checkType = text(formData, 'check_type');
  if (checkType.length < 3 || checkType.length > 100)
    throw new Error('Enter a valid check type.');
  const db = createSupabaseAdminClient();
  const { data: application, error: applicationError } = await db
    .from('recruitment_applications')
    .select('candidate_id')
    .eq('id', applicationId)
    .single();
  if (applicationError) throw applicationError;
  const { data: check, error } = await db
    .from('recruitment_background_checks')
    .insert({
      application_id: applicationId,
      check_type: checkType,
      provider: text(formData, 'provider') || null,
      status: 'consent_requested',
    })
    .select('id')
    .single();
  if (error) throw error;
  const { error: taskError } = await db
    .from('recruitment_candidate_portal_tasks')
    .insert({
      candidate_id: application.candidate_id,
      application_id: applicationId,
      task_type: 'background_check_consent',
      title: `Consent for ${checkType}`,
      instructions:
        'Review the requested pre-employment check and choose whether you consent. You may ask the People team questions before responding.',
      payload: {
        background_check_id: check.id,
        check_type: checkType,
        provider: text(formData, 'provider') || null,
      },
    });
  if (taskError) {
    await db.from('recruitment_background_checks').delete().eq('id', check.id);
    throw taskError;
  }
  await db
    .from('recruitment_audit_events')
    .insert({
      event_type: 'background_check.consent_requested',
      entity_type: 'background_check',
      entity_id: check.id,
      actor_type: 'employee',
      metadata: {
        application_id: applicationId,
        actor_employee_id: access.employeeId,
        check_type: checkType,
      },
    });
  revalidatePath(`/workforce/recruitment/applications/${applicationId}`);
}

export async function updateBackgroundCheck(
  applicationId: string,
  checkId: string,
  formData: FormData
): Promise<void> {
  const access = await requireRecruitmentAccess({
    entityType: 'application',
    entityId: applicationId,
    allowedPermissions: ['workforce.offers.approve'],
  });
  const status = text(formData, 'status');
  if (
    ![
      'in_progress',
      'clear',
      'review_required',
      'failed',
      'cancelled',
    ].includes(status)
  )
    throw new Error('Choose a valid check result.');
  const db = createSupabaseAdminClient();
  const { data: existing, error: lookupError } = await db
    .from('recruitment_background_checks')
    .select('candidate_consent_at')
    .eq('id', checkId)
    .eq('application_id', applicationId)
    .single();
  if (lookupError) throw lookupError;
  if (
    ['in_progress', 'clear', 'review_required'].includes(status) &&
    !existing.candidate_consent_at
  )
    throw new Error(
      'Candidate consent is required before processing this check.'
    );
  const { error } = await db
    .from('recruitment_background_checks')
    .update({
      status,
      result_summary: text(formData, 'result_summary') || null,
      completed_at: [
        'clear',
        'review_required',
        'failed',
        'cancelled',
      ].includes(status)
        ? new Date().toISOString()
        : null,
    })
    .eq('id', checkId)
    .eq('application_id', applicationId);
  if (error) throw error;
  await db
    .from('recruitment_audit_events')
    .insert({
      event_type: 'background_check.updated',
      entity_type: 'background_check',
      entity_id: checkId,
      actor_type: 'employee',
      metadata: {
        application_id: applicationId,
        actor_employee_id: access.employeeId,
        status,
      },
    });
  revalidatePath(`/workforce/recruitment/applications/${applicationId}`);
}

export async function composeApplicationMessage(
  applicationId: string,
  formData: FormData
): Promise<void> {
  const access = await requireRecruitmentAccess({
    entityType: 'application',
    entityId: applicationId,
    allowedPermissions: ['workforce.recruitment.write'],
  });
  const channel = text(formData, 'channel');
  const body = text(formData, 'body');
  const subject = text(formData, 'subject');
  if (!['email', 'sms', 'in_app', 'whatsapp', 'phone_log'].includes(channel))
    throw new Error('Choose a supported channel.');
  if (body.length < 2 || body.length > 20_000)
    throw new Error('Enter a message.');
  if (channel === 'email' && !subject)
    throw new Error('Email subject is required.');
  if (
    ['sms', 'whatsapp'].includes(channel) &&
    !process.env.RECRUITMENT_MESSAGING_WEBHOOK_URL
  )
    throw new Error(
      `${channel === 'sms' ? 'SMS' : 'WhatsApp'} is not formally integrated in this environment.`
    );
  const db = createSupabaseAdminClient();
  const { data: application, error: appError } = await db
    .from('recruitment_applications')
    .select(
      'candidate_id, recruitment_candidates(full_name, primary_email, phone)'
    )
    .eq('id', applicationId)
    .single();
  if (appError) throw appError;
  const candidate = Array.isArray(application.recruitment_candidates)
    ? application.recruitment_candidates[0]
    : application.recruitment_candidates;
  if (!candidate) throw new Error('Candidate record is unavailable.');
  let address = candidate.primary_email;
  if (channel === 'sms' || channel === 'whatsapp') {
    if (!candidate.phone)
      throw new Error('Candidate does not have a phone number.');
    const consentType = channel === 'sms' ? 'sms' : 'career_updates';
    const { data: consent, error: consentError } = await db
      .from('recruitment_candidate_consents')
      .select('id')
      .eq('candidate_id', application.candidate_id)
      .eq('consent_type', consentType)
      .not('granted_at', 'is', null)
      .is('withdrawn_at', null)
      .limit(1)
      .maybeSingle();
    if (consentError) throw consentError;
    if (!consent)
      throw new Error(
        `${channel === 'sms' ? 'SMS' : 'WhatsApp'} consent is not active.`
      );
    address = candidate.phone;
  }
  const scheduled = text(formData, 'scheduled_for');
  const approvalRequired = text(formData, 'approval_required') === 'on';
  const status =
    channel === 'phone_log'
      ? 'delivered'
      : channel === 'in_app' && !approvalRequired
        ? 'delivered'
        : 'queued';
  const { data: message, error } = await db
    .from('recruitment_messages')
    .insert({
      candidate_id: application.candidate_id,
      application_id: applicationId,
      channel,
      subject: subject || null,
      body,
      status,
      scheduled_for: scheduled ? new Date(scheduled).toISOString() : null,
      approval_status: approvalRequired ? 'pending' : 'not_required',
      sent_by: access.employeeId,
      sent_at: status === 'delivered' ? new Date().toISOString() : null,
    })
    .select('id')
    .single();
  if (error) throw error;
  const { error: recipientError } = await db
    .from('recruitment_message_recipients')
    .insert({
      message_id: message.id,
      recipient_type: 'to',
      address,
      display_name: candidate.full_name,
    });
  if (recipientError) throw recipientError;
  if (channel === 'in_app' && !approvalRequired) {
    const { error: noticeError } = await db
      .from('recruitment_candidate_notices')
      .insert({
        candidate_id: application.candidate_id,
        application_id: applicationId,
        title: subject || 'Message from OpusFesta',
        body,
        notice_type: 'message',
        version: '1',
      });
    if (noticeError) throw noticeError;
  }
  await db.from('recruitment_message_events').insert({
    message_id: message.id,
    event_type: status === 'delivered' ? 'logged' : 'queued',
    metadata: {
      actor_employee_id: access.employeeId,
      approval_required: approvalRequired,
    },
  });
  await db.from('recruitment_audit_events').insert({
    event_type: 'communication.created',
    entity_type: 'application',
    entity_id: applicationId,
    actor_type: 'employee',
    metadata: {
      message_id: message.id,
      channel,
      scheduled: Boolean(scheduled),
      approval_required: approvalRequired,
    },
  });
  revalidatePath(`/workforce/recruitment/applications/${applicationId}`);
}

export async function approveApplicationMessage(
  applicationId: string,
  messageId: string,
  decision: 'approved' | 'rejected'
) {
  const access = await requireRecruitmentAccess({
    entityType: 'application',
    entityId: applicationId,
    allowedPermissions: ['workforce.recruitment.write'],
  });
  const db = createSupabaseAdminClient();
  const { data: message, error: lookupError } = await db
    .from('recruitment_messages')
    .select('sent_by, approval_status')
    .eq('id', messageId)
    .eq('application_id', applicationId)
    .single();
  if (lookupError) throw lookupError;
  if (message.approval_status !== 'pending')
    throw new Error('This message is no longer awaiting approval.');
  if (message.sent_by === access.employeeId)
    throw new Error('You cannot approve your own message.');
  const { error } = await db
    .from('recruitment_messages')
    .update({
      approval_status: decision,
      approved_by: access.employeeId,
      status: decision === 'rejected' ? 'cancelled' : 'queued',
    })
    .eq('id', messageId);
  if (error) throw error;
  await db.from('recruitment_message_events').insert({
    message_id: messageId,
    event_type: decision,
    metadata: { actor_employee_id: access.employeeId },
  });
  revalidatePath(`/workforce/recruitment/applications/${applicationId}`);
}

export async function bulkRejectApplications(
  formData: FormData
): Promise<void> {
  const ids = [
    ...new Set(
      formData
        .getAll('application_ids')
        .filter((value): value is string => typeof value === 'string')
    ),
  ].slice(0, 100);
  const reasonCode = text(formData, 'reason_code');
  const note = text(formData, 'note');
  const templateId = text(formData, 'template_id');
  const timing = text(formData, 'timing') || 'now';
  if (!ids.length) throw new Error('Select at least one application.');
  if (!reasonCode || note.length < 5)
    throw new Error('Choose a reason and add decision evidence.');
  if (!templateId)
    throw new Error('Choose an approved candidate-facing outcome template.');
  const executeAt = text(formData, 'execute_after');
  const triggerOfferId = text(formData, 'trigger_offer_id');
  if (
    timing === 'scheduled' &&
    (!executeAt || new Date(executeAt) <= new Date())
  )
    throw new Error('Choose a future send time.');
  if (timing === 'finalist_acceptance' && !triggerOfferId)
    throw new Error('Choose the finalist offer to wait for.');
  const db = createSupabaseAdminClient();
  const accessChecks = await Promise.all(
    ids.map((applicationId) =>
      requireRecruitmentAccess({
        entityType: 'application',
        entityId: applicationId,
        allowedPermissions: ['workforce.applications.reject'],
      })
    )
  );
  const actorEmployeeId = accessChecks[0]?.employeeId;
  if (
    !actorEmployeeId ||
    accessChecks.some((access) => access.employeeId !== actorEmployeeId)
  )
    throw new Error('Unable to verify one decision owner for this batch.');
  if (timing === 'now') {
    const { error } = await db.rpc('recruitment_bulk_reject_applications', {
      p_application_ids: ids,
      p_actor_employee_id: actorEmployeeId,
      p_reason_code: reasonCode,
      p_note: note,
      p_template_id: templateId,
    });
    if (error) throw error;
  } else {
    const { data: template, error: templateError } = await db
      .from('recruitment_message_templates')
      .select('id')
      .eq('id', templateId)
      .eq('category', 'rejection')
      .eq('channel', 'email')
      .eq('status', 'active')
      .maybeSingle();
    if (templateError) throw templateError;
    if (!template)
      throw new Error('The selected outcome template is not active.');
    const rows = ids.map((applicationId) => ({
      application_id: applicationId,
      action_type: 'reject',
      target_status: 'rejected',
      payload: { reason_code: reasonCode, note, template_id: templateId },
      execute_after:
        timing === 'scheduled' ? new Date(executeAt).toISOString() : null,
      trigger_offer_id:
        timing === 'finalist_acceptance' ? triggerOfferId : null,
      created_by: actorEmployeeId,
    }));
    const { error } = await db
      .from('recruitment_scheduled_application_actions')
      .insert(rows);
    if (error) throw error;
    await db.from('recruitment_audit_events').insert({
      event_type: 'application.batch_decision_scheduled',
      entity_type: 'application_batch',
      actor_type: 'employee',
      metadata: {
        application_ids: ids,
        reason_code: reasonCode,
        template_id: templateId,
        timing,
        execute_after: rows[0]?.execute_after,
        trigger_offer_id: rows[0]?.trigger_offer_id,
        actor_employee_id: actorEmployeeId,
      },
    });
  }
  revalidatePath('/workforce/recruitment/applications');
}

export async function cancelScheduledApplicationAction(
  actionId: string
): Promise<void> {
  const db = createSupabaseAdminClient();
  const { data: action, error: lookupError } = await db
    .from('recruitment_scheduled_application_actions')
    .select('id, application_id, status')
    .eq('id', actionId)
    .single();
  if (lookupError) throw lookupError;
  if (action.status !== 'scheduled')
    throw new Error('This decision can no longer be cancelled.');
  const access = await requireRecruitmentAccess({
    entityType: 'application',
    entityId: action.application_id,
    allowedPermissions: ['workforce.applications.reject'],
  });
  const { data: cancelled, error } = await db
    .from('recruitment_scheduled_application_actions')
    .update({ status: 'cancelled', error_message: null })
    .eq('id', actionId)
    .eq('status', 'scheduled')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!cancelled)
    throw new Error(
      'This decision started processing before it could be cancelled.'
    );
  await db.from('recruitment_audit_events').insert({
    event_type: 'application.scheduled_decision_cancelled',
    entity_type: 'scheduled_application_action',
    entity_id: actionId,
    actor_type: 'employee',
    metadata: {
      application_id: action.application_id,
      actor_employee_id: access.employeeId,
    },
  });
  revalidatePath('/workforce/recruitment/applications');
}
