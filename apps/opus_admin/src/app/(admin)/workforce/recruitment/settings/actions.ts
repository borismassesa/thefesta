'use server';

import { revalidatePath } from 'next/cache';
import { getCallerEmployeeId, requirePermission } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase';

const PATH = '/workforce/recruitment/settings';
function field(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === 'string' ? value.trim() : '';
}
function positiveInt(value: string, label: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0)
    throw new Error(`${label} must be a positive whole number.`);
  return number;
}
function json(value: string, fallback: unknown) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error('Enter valid JSON configuration.');
  }
}
async function actor() {
  await requirePermission('workforce.recruitment_settings.write');
  return getCallerEmployeeId();
}
async function audit(
  eventType: string,
  entityType: string,
  entityId: string | null,
  employeeId: string | null,
  changedFields: string[]
) {
  const { error } = await createSupabaseAdminClient()
    .from('recruitment_audit_events')
    .insert({
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      actor_type: 'employee',
      metadata: {
        actor_employee_id: employeeId,
        changed_fields: changedFields,
      },
    });
  if (error) throw error;
}

export async function createPipeline(formData: FormData) {
  const employeeId = await actor();
  const name = field(formData, 'name');
  if (name.length < 3) throw new Error('Enter a pipeline name.');
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('recruitment_pipeline_templates')
    .insert({
      name,
      department: field(formData, 'department') || null,
      description: field(formData, 'description') || null,
      created_by: employeeId,
    })
    .select('id')
    .single();
  if (error) throw error;
  await audit('pipeline.created', 'pipeline', data.id, employeeId, [
    'name',
    'department',
    'description',
  ]);
  revalidatePath(PATH);
}

export async function addPipelineStage(pipelineId: string, formData: FormData) {
  const employeeId = await actor();
  const label = field(formData, 'label');
  const key = field(formData, 'key')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  if (!label || !key) throw new Error('Stage label and key are required.');
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from('recruitment_pipeline_stages')
    .insert({
      pipeline_id: pipelineId,
      key,
      label,
      candidate_facing_status: field(formData, 'candidate_status'),
      stage_type: field(formData, 'stage_type'),
      sort_order: positiveInt(field(formData, 'sort_order'), 'Order'),
      service_level_hours: field(formData, 'sla_hours')
        ? positiveInt(field(formData, 'sla_hours'), 'Service level')
        : null,
      requires_scorecards: field(formData, 'requires_scorecards') === 'on',
    });
  if (error) throw error;
  await audit('pipeline.stage_added', 'pipeline', pipelineId, employeeId, [
    'stages',
  ]);
  revalidatePath(PATH);
}

export async function setTemplateStatus(
  kind: 'pipeline' | 'scorecard' | 'assessment',
  id: string,
  status: string
) {
  const employeeId = await actor();
  if (!['draft', 'active', 'archived'].includes(status))
    throw new Error('Invalid template status.');
  const table =
    kind === 'pipeline'
      ? 'recruitment_pipeline_templates'
      : kind === 'scorecard'
        ? 'recruitment_scorecard_templates'
        : 'recruitment_assessment_templates';
  const { error } = await createSupabaseAdminClient()
    .from(table)
    .update({ status })
    .eq('id', id);
  if (error) throw error;
  await audit(`${kind}.status_changed`, kind, id, employeeId, ['status']);
  revalidatePath(PATH);
}

export async function createScorecardTemplate(formData: FormData) {
  const employeeId = await actor();
  const name = field(formData, 'name');
  if (name.length < 3) throw new Error('Enter a scorecard name.');
  const { data, error } = await createSupabaseAdminClient()
    .from('recruitment_scorecard_templates')
    .insert({
      name,
      department: field(formData, 'department') || null,
      instructions: field(formData, 'instructions') || null,
      created_by: employeeId,
    })
    .select('id')
    .single();
  if (error) throw error;
  await audit('scorecard_template.created', 'scorecard', data.id, employeeId, [
    'name',
    'department',
    'instructions',
  ]);
  revalidatePath(PATH);
}

export async function addScorecardSection(
  templateId: string,
  formData: FormData
) {
  const employeeId = await actor();
  const title = field(formData, 'title');
  if (!title) throw new Error('Section title is required.');
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('recruitment_scorecard_sections')
    .insert({
      template_id: templateId,
      title,
      description: field(formData, 'description') || null,
      weight: Number(field(formData, 'weight') || 1),
      sort_order: Number(field(formData, 'sort_order') || 0),
    })
    .select('id')
    .single();
  if (error) throw error;
  await audit('scorecard.section_added', 'scorecard', templateId, employeeId, [
    'sections',
  ]);
  revalidatePath(PATH);
}

export async function addScorecardCriterion(
  sectionId: string,
  formData: FormData
) {
  const employeeId = await actor();
  const label = field(formData, 'label');
  if (!label) throw new Error('Criterion label is required.');
  const { error } = await createSupabaseAdminClient()
    .from('recruitment_scorecard_criteria')
    .insert({
      section_id: sectionId,
      label,
      description: field(formData, 'description') || null,
      rating_scale: Number(field(formData, 'rating_scale') || 5),
      weight: Number(field(formData, 'weight') || 1),
      is_required: field(formData, 'is_required') === 'on',
      sort_order: Number(field(formData, 'sort_order') || 0),
    });
  if (error) throw error;
  await audit(
    'scorecard.criterion_added',
    'scorecard_section',
    sectionId,
    employeeId,
    ['criteria']
  );
  revalidatePath(PATH);
}

export async function createAssessmentTemplate(formData: FormData) {
  const employeeId = await actor();
  const name = field(formData, 'name');
  const instructions = field(formData, 'instructions');
  if (name.length < 3 || instructions.length < 10)
    throw new Error('Provide a name and clear instructions.');
  const { data, error } = await createSupabaseAdminClient()
    .from('recruitment_assessment_templates')
    .insert({
      name,
      assessment_type: field(formData, 'assessment_type'),
      instructions,
      time_limit_minutes: field(formData, 'time_limit_minutes')
        ? positiveInt(field(formData, 'time_limit_minutes'), 'Time limit')
        : null,
      rubric: json(field(formData, 'rubric'), []),
      accommodation_guidance: field(formData, 'accommodation_guidance') || null,
      created_by: employeeId,
    })
    .select('id')
    .single();
  if (error) throw error;
  await audit(
    'assessment_template.created',
    'assessment_template',
    data.id,
    employeeId,
    ['name', 'instructions', 'rubric']
  );
  revalidatePath(PATH);
}

export async function upsertRetentionPolicy(formData: FormData) {
  const employeeId = await actor();
  const recordType = field(formData, 'record_type')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
  if (!recordType) throw new Error('Record type is required.');
  const { error } = await createSupabaseAdminClient()
    .from('recruitment_retention_policies')
    .upsert(
      {
        record_type: recordType,
        retention_days: positiveInt(
          field(formData, 'retention_days'),
          'Retention days'
        ),
        action: field(formData, 'action'),
        legal_basis: field(formData, 'legal_basis') || null,
        is_active: true,
        updated_by: employeeId,
      },
      { onConflict: 'record_type' }
    );
  if (error) throw error;
  await audit(
    'retention.policy_changed',
    'retention_policy',
    null,
    employeeId,
    ['retention_days', 'action', 'legal_basis']
  );
  revalidatePath(PATH);
}

export async function createAutomationRule(formData: FormData) {
  const employeeId = await actor();
  const name = field(formData, 'name');
  if (name.length < 3) throw new Error('Rule name is required.');
  const triggerEvent = field(formData, 'trigger_event');
  if (triggerEvent !== 'scheduled.maintenance')
    throw new Error(
      'Only the governed scheduled.maintenance trigger is supported.'
    );
  const actions = json(field(formData, 'actions'), []) as unknown;
  const allowedActions = new Set([
    'candidate_interview_reminder',
    'alert_stalled_applications',
    'remind_overdue_scorecards',
    'notify_expiring_offers',
  ]);
  if (
    !Array.isArray(actions) ||
    actions.length < 1 ||
    actions.length > 4 ||
    actions.some(
      (action) =>
        !action ||
        typeof action !== 'object' ||
        Array.isArray(action) ||
        !allowedActions.has(
          String((action as Record<string, unknown>).type ?? '')
        )
    )
  )
    throw new Error(
      'Choose one or more supported, non-decision automation actions.'
    );
  if (/reject|decline|disqualif/i.test(JSON.stringify(actions)))
    throw new Error(
      'Automation cannot reject, decline or disqualify a candidate.'
    );
  const { data, error } = await createSupabaseAdminClient()
    .from('recruitment_automation_rules')
    .insert({
      name,
      trigger_event: triggerEvent,
      conditions: json(field(formData, 'conditions'), {}),
      actions,
      priority: Number(field(formData, 'priority') || 100),
      created_by: employeeId,
    })
    .select('id')
    .single();
  if (error) throw error;
  await audit('automation.created', 'automation_rule', data.id, employeeId, [
    'name',
    'trigger_event',
    'conditions',
    'actions',
  ]);
  revalidatePath(PATH);
}

export async function setAutomationStatus(id: string, status: string) {
  const employeeId = await actor();
  if (!['draft', 'active', 'paused', 'archived'].includes(status))
    throw new Error('Invalid automation status.');
  const db = createSupabaseAdminClient();
  if (status === 'active') {
    const { data: rule, error: lookupError } = await db
      .from('recruitment_automation_rules')
      .select('trigger_event, actions')
      .eq('id', id)
      .single();
    if (lookupError) throw lookupError;
    const allowed = new Set([
      'candidate_interview_reminder',
      'alert_stalled_applications',
      'remind_overdue_scorecards',
      'notify_expiring_offers',
    ]);
    if (
      rule.trigger_event !== 'scheduled.maintenance' ||
      !Array.isArray(rule.actions) ||
      rule.actions.some(
        (action) =>
          !action ||
          typeof action !== 'object' ||
          Array.isArray(action) ||
          !allowed.has(String((action as Record<string, unknown>).type ?? ''))
      ) ||
      /reject|decline|disqualif/i.test(JSON.stringify(rule.actions))
    )
      throw new Error(
        'This rule contains an unsupported or candidate-decision action.'
      );
  }
  const { error } = await db
    .from('recruitment_automation_rules')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
  await audit('automation.status_changed', 'automation_rule', id, employeeId, [
    'status',
  ]);
  revalidatePath(PATH);
}

export async function createSource(formData: FormData) {
  const employeeId = await actor();
  const name = field(formData, 'name');
  if (!name) throw new Error('Source name is required.');
  const { data, error } = await createSupabaseAdminClient()
    .from('recruitment_source_definitions')
    .insert({
      name,
      source_type: field(formData, 'source_type'),
      utm_source: field(formData, 'utm_source') || null,
      utm_medium: field(formData, 'utm_medium') || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  await audit('source.created', 'source', data.id, employeeId, [
    'name',
    'source_type',
    'utm_source',
    'utm_medium',
  ]);
  revalidatePath(PATH);
}

export async function createPrivacyNotice(formData: FormData) {
  const employeeId = await actor();
  const body = field(formData, 'body');
  if (body.length < 20) throw new Error('Privacy notice body is too short.');
  const { data, error } = await createSupabaseAdminClient()
    .from('recruitment_privacy_notice_versions')
    .insert({
      purpose: field(formData, 'purpose'),
      version: field(formData, 'version'),
      locale: field(formData, 'locale') || 'en',
      title: field(formData, 'title'),
      body,
      created_by: employeeId,
    })
    .select('id')
    .single();
  if (error) throw error;
  await audit('privacy_notice.created', 'privacy_notice', data.id, employeeId, [
    'purpose',
    'version',
    'locale',
    'body',
  ]);
  revalidatePath(PATH);
}

export async function setPrivacyNoticeStatus(id: string, status: string) {
  const employeeId = await actor();
  if (!['draft', 'active', 'retired'].includes(status))
    throw new Error('Invalid notice status.');
  const supabase = createSupabaseAdminClient();
  if (status === 'active') {
    const { data } = await supabase
      .from('recruitment_privacy_notice_versions')
      .select('purpose, locale')
      .eq('id', id)
      .single();
    if (data)
      await supabase
        .from('recruitment_privacy_notice_versions')
        .update({ status: 'retired' })
        .eq('purpose', data.purpose)
        .eq('locale', data.locale)
        .eq('status', 'active');
  }
  const { error } = await supabase
    .from('recruitment_privacy_notice_versions')
    .update({
      status,
      effective_at: status === 'active' ? new Date().toISOString() : null,
    })
    .eq('id', id);
  if (error) throw error;
  await audit(
    'privacy_notice.status_changed',
    'privacy_notice',
    id,
    employeeId,
    ['status', 'effective_at']
  );
  revalidatePath(PATH);
}

export async function updatePrivacyRequest(id: string, formData: FormData) {
  const employeeId = await actor();
  const status = field(formData, 'status');
  if (
    ![
      'received',
      'identity_verification',
      'in_progress',
      'completed',
      'denied',
      'cancelled',
    ].includes(status)
  )
    throw new Error('Invalid request status.');
  const note = field(formData, 'resolution_note');
  if (['completed', 'denied'].includes(status) && note.length < 5)
    throw new Error('Add a resolution note.');
  const { error } = await createSupabaseAdminClient()
    .from('recruitment_privacy_requests')
    .update({
      status,
      resolution_note: note || null,
      handled_by: employeeId,
      completed_at: ['completed', 'denied'].includes(status)
        ? new Date().toISOString()
        : null,
    })
    .eq('id', id);
  if (error) throw error;
  await audit(
    'privacy_request.status_changed',
    'privacy_request',
    id,
    employeeId,
    ['status', 'resolution_note']
  );
  revalidatePath(PATH);
}

export async function createLegalHold(formData: FormData) {
  const employeeId = await actor();
  const candidateId = field(formData, 'candidate_id') || null;
  const applicationId = field(formData, 'application_id') || null;
  const reason = field(formData, 'reason');
  if ((!candidateId && !applicationId) || reason.length < 10)
    throw new Error(
      'Choose a candidate or application and record the legal-hold reason.'
    );
  const { data, error } = await createSupabaseAdminClient()
    .from('recruitment_legal_holds')
    .insert({
      candidate_id: candidateId,
      application_id: applicationId,
      reason,
      ends_at: field(formData, 'ends_at')
        ? new Date(field(formData, 'ends_at')).toISOString()
        : null,
      created_by: employeeId,
    })
    .select('id')
    .single();
  if (error) throw error;
  await audit('privacy.legal_hold_created', 'legal_hold', data.id, employeeId, [
    'scope',
    'reason',
    'ends_at',
  ]);
  revalidatePath(PATH);
}

export async function releaseLegalHold(id: string) {
  const employeeId = await actor();
  const { error } = await createSupabaseAdminClient()
    .from('recruitment_legal_holds')
    .update({ released_at: new Date().toISOString(), released_by: employeeId })
    .eq('id', id)
    .is('released_at', null);
  if (error) throw error;
  await audit('privacy.legal_hold_released', 'legal_hold', id, employeeId, [
    'released_at',
  ]);
  revalidatePath(PATH);
}

export async function runRetentionScan() {
  const employeeId = await actor();
  const db = createSupabaseAdminClient();
  const { data: policies, error } = await db
    .from('recruitment_retention_policies')
    .select('*')
    .eq('is_active', true);
  if (error) throw error;
  let queued = 0;
  for (const policy of policies ?? []) {
    const cutoff = new Date(
      Date.now() - policy.retention_days * 86_400_000
    ).toISOString();
    if (
      policy.record_type === 'rejected_application' ||
      policy.record_type === 'withdrawn_application'
    ) {
      const status = policy.record_type.startsWith('rejected')
        ? 'rejected'
        : 'withdrawn';
      const { data: rows } = await db
        .from('recruitment_applications')
        .select('id')
        .eq('status', status)
        .lte('last_stage_changed_at', cutoff)
        .limit(1000);
      if (rows?.length) {
        const payload = rows.map((row) => ({
          policy_id: policy.id,
          entity_type: 'application',
          entity_id: row.id,
          due_at: new Date().toISOString(),
        }));
        const { data } = await db
          .from('recruitment_retention_queue')
          .upsert(payload, {
            onConflict: 'policy_id,entity_type,entity_id',
            ignoreDuplicates: true,
          })
          .select('id');
        queued += data?.length ?? 0;
      }
    }
    if (policy.record_type === 'candidate_document') {
      const { data: rows } = await db
        .from('recruitment_candidate_documents')
        .select('id')
        .lte('created_at', cutoff)
        .limit(1000);
      if (rows?.length) {
        const { data } = await db
          .from('recruitment_retention_queue')
          .upsert(
            rows.map((row) => ({
              policy_id: policy.id,
              entity_type: 'candidate_document',
              entity_id: row.id,
              due_at: new Date().toISOString(),
            })),
            {
              onConflict: 'policy_id,entity_type,entity_id',
              ignoreDuplicates: true,
            }
          )
          .select('id');
        queued += data?.length ?? 0;
      }
    }
  }
  await audit('retention.scan_completed', 'retention_queue', null, employeeId, [
    'queue',
  ]);
  revalidatePath(PATH);
}

export async function processRetentionItem(id: string) {
  const employeeId = await actor();
  const db = createSupabaseAdminClient();
  const { data: item, error } = await db
    .from('recruitment_retention_queue')
    .select('*, recruitment_retention_policies(action, record_type)')
    .eq('id', id)
    .eq('status', 'pending')
    .single();
  if (error) throw error;
  const policy = Array.isArray(item.recruitment_retention_policies)
    ? item.recruitment_retention_policies[0]
    : item.recruitment_retention_policies;
  let candidateId: string | null = null;
  if (item.entity_type === 'application') {
    const { data: app } = await db
      .from('recruitment_applications')
      .select('candidate_id')
      .eq('id', item.entity_id)
      .single();
    candidateId = app?.candidate_id ?? null;
  } else if (item.entity_type === 'candidate_document') {
    const { data: document } = await db
      .from('recruitment_candidate_documents')
      .select('candidate_id')
      .eq('id', item.entity_id)
      .single();
    candidateId = document?.candidate_id ?? null;
  }
  if (candidateId) {
    const { data: hold } = await db
      .from('recruitment_legal_holds')
      .select('id')
      .eq('candidate_id', candidateId)
      .is('released_at', null)
      .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`)
      .limit(1)
      .maybeSingle();
    if (hold) {
      await db
        .from('recruitment_retention_queue')
        .update({ status: 'held', result: { legal_hold_id: hold.id } })
        .eq('id', id);
      revalidatePath(PATH);
      return;
    }
  }
  await db
    .from('recruitment_retention_queue')
    .update({ status: 'processing', attempt: item.attempt + 1 })
    .eq('id', id);
  try {
    if (policy?.action === 'review') {
      /* review acknowledged without mutating source data */
    } else if (
      item.entity_type === 'candidate_document' &&
      policy?.action === 'delete'
    ) {
      const { data: document, error: documentError } = await db
        .from('recruitment_candidate_documents')
        .select('storage_bucket, storage_path')
        .eq('id', item.entity_id)
        .single();
      if (documentError) throw documentError;
      const { error: storageError } = await db.storage
        .from(document.storage_bucket)
        .remove([document.storage_path]);
      if (storageError) throw storageError;
      const { error: redactError } = await db
        .from('recruitment_candidate_documents')
        .update({
          storage_path: `retention-deleted/${item.entity_id}`,
          original_filename: null,
          mime_type: null,
          byte_size: 0,
          sha256: null,
          malware_scan_status: 'failed',
          contains_sensitive_data: false,
        })
        .eq('id', item.entity_id);
      if (redactError) throw redactError;
    } else if (
      item.entity_type === 'application' &&
      policy?.action === 'anonymize'
    ) {
      const { data: app, error: appError } = await db
        .from('recruitment_applications')
        .select('candidate_id')
        .eq('id', item.entity_id)
        .single();
      if (appError) throw appError;
      await db
        .from('recruitment_applications')
        .update({
          cover_letter: null,
          salary_expectation: null,
          source_detail: null,
          disposition_note: null,
        })
        .eq('id', item.entity_id);
      await db
        .from('recruitment_application_answers')
        .update({ answer: { redacted: true } })
        .eq('application_id', item.entity_id);
      await db
        .from('recruitment_candidate_notes')
        .update({ body: '[Removed by retention policy]' })
        .eq('application_id', item.entity_id);
      const { data: otherActive } = await db
        .from('recruitment_applications')
        .select('id')
        .eq('candidate_id', app.candidate_id)
        .not('id', 'eq', item.entity_id)
        .not(
          'status',
          'in',
          '(rejected,withdrawn,archived,position_closed,duplicate,disqualified)'
        )
        .limit(1)
        .maybeSingle();
      const { data: consent } = await db
        .from('recruitment_candidate_consents')
        .select('id')
        .eq('candidate_id', app.candidate_id)
        .not('granted_at', 'is', null)
        .is('withdrawn_at', null)
        .limit(1)
        .maybeSingle();
      if (!otherActive && !consent)
        await db
          .from('recruitment_candidates')
          .update({
            primary_email: `anonymized+${app.candidate_id}@invalid.opusfesta.local`,
            full_name: 'Anonymized candidate',
            preferred_name: null,
            phone: null,
            city: null,
            country: null,
            pronouns: null,
            current_position: null,
            current_organization: null,
            linkedin_url: null,
            portfolio_url: null,
            candidate_clerk_user_id: null,
            status: 'anonymized',
          })
          .eq('id', app.candidate_id);
    } else
      throw new Error(
        'This policy/entity combination requires manual privacy review.'
      );
    await db
      .from('recruitment_retention_queue')
      .update({
        status: 'completed',
        processed_at: new Date().toISOString(),
        result: { action: policy?.action },
      })
      .eq('id', id);
    await audit(
      policy?.action === 'anonymize'
        ? 'candidate.anonymized'
        : policy?.action === 'delete'
          ? 'candidate.document_deleted'
          : 'retention.review_completed',
      item.entity_type,
      item.entity_id,
      employeeId,
      ['retention_action']
    );
  } catch {
    await db
      .from('recruitment_retention_queue')
      .update({
        status: 'failed',
        error_message: 'Processing failed; inspect protected server logs.',
      })
      .eq('id', id);
    throw new Error('Retention processing failed safely.');
  }
  revalidatePath(PATH);
}
