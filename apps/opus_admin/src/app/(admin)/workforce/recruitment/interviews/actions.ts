'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { logDbError } from '@/lib/log-safe';
import { requireRecruitmentAccess } from '@/lib/recruitment-auth';

export type InterviewActionState = { ok: boolean; message: string | null };

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function uuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function saveInterviewSchedule(
  interviewId: string,
  _previous: InterviewActionState,
  formData: FormData
): Promise<InterviewActionState> {
  try {
    const access = await requireRecruitmentAccess({
      entityType: 'interview',
      entityId: interviewId,
      allowedPermissions: ['workforce.interviews.schedule'],
    });
    const startsAt = text(formData, 'startsAtIso');
    const endsAt = text(formData, 'endsAtIso');
    const timezone = text(formData, 'timezone');
    const roomId = text(formData, 'roomId');
    if (
      !startsAt ||
      !endsAt ||
      Number.isNaN(Date.parse(startsAt)) ||
      Number.isNaN(Date.parse(endsAt))
    ) {
      return { ok: false, message: 'Choose a valid start and end time.' };
    }
    if (!timezone || timezone.length > 100)
      return { ok: false, message: 'Choose a time zone.' };
    if (roomId && !uuid(roomId))
      return { ok: false, message: 'Choose a valid interview room.' };
    const meetingUrl = text(formData, 'meetingUrl');
    if (meetingUrl) {
      try {
        const parsed = new URL(meetingUrl);
        if (parsed.protocol !== 'https:') throw new Error('invalid');
      } catch {
        return { ok: false, message: 'Enter a complete HTTPS meeting link.' };
      }
    }
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.rpc('recruitment_schedule_interview', {
      p_interview_id: interviewId,
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_timezone: timezone,
      p_location: text(formData, 'location') || null,
      p_meeting_url: meetingUrl || null,
      p_room_id: roomId || null,
      p_candidate_instructions: text(formData, 'candidateInstructions') || null,
      p_actor_employee_id: access.employeeId,
    });
    if (error) {
      if (error.code === '23P01')
        return {
          ok: false,
          message:
            'That time conflicts with the candidate, an interviewer, or the room.',
        };
      if (error.code === '23514')
        return { ok: false, message: 'The interview schedule is not valid.' };
      throw error;
    }
    const { error: queueError } = await supabase
      .from('recruitment_calendar_sync_queue')
      .upsert(
        {
          interview_id: interviewId,
          provider: 'google_calendar',
          status: 'queued',
          last_error: null,
        },
        { onConflict: 'interview_id' }
      );
    if (queueError) throw queueError;
    revalidatePath(`/workforce/recruitment/interviews/${interviewId}`);
    revalidatePath('/workforce/recruitment/interviews');
    return {
      ok: true,
      message:
        'Interview scheduled. Calendar delivery is queued for configured integrations.',
    };
  } catch (error) {
    logDbError('recruitment.interview.schedule', error, { interviewId });
    return { ok: false, message: 'The interview could not be scheduled.' };
  }
}

export async function addInterviewParticipant(
  interviewId: string,
  _previous: InterviewActionState,
  formData: FormData
): Promise<InterviewActionState> {
  try {
    const access = await requireRecruitmentAccess({
      entityType: 'interview',
      entityId: interviewId,
      allowedPermissions: ['workforce.interviews.schedule'],
    });
    const employeeId = text(formData, 'employeeId');
    const participantRole = text(formData, 'participantRole') || 'interviewer';
    if (
      !uuid(employeeId) ||
      !['lead', 'interviewer', 'observer', 'coordinator'].includes(
        participantRole
      )
    ) {
      return { ok: false, message: 'Choose a valid participant and role.' };
    }
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.rpc(
      'recruitment_add_interview_participant',
      {
        p_interview_id: interviewId,
        p_employee_id: employeeId,
        p_participant_role: participantRole,
        p_actor_employee_id: access.employeeId,
      }
    );
    if (error) {
      if (error.code === '23P01') {
        return {
          ok: false,
          message: 'That employee has another interview at this time.',
        };
      }
      throw error;
    }
    revalidatePath(`/workforce/recruitment/interviews/${interviewId}`);
    return { ok: true, message: 'Participant added.' };
  } catch (error) {
    logDbError('recruitment.interview.participant.add', error, { interviewId });
    return { ok: false, message: 'The participant could not be added.' };
  }
}

export async function assignInterviewScorecard(
  interviewId: string,
  _previous: InterviewActionState,
  formData: FormData
): Promise<InterviewActionState> {
  try {
    const access = await requireRecruitmentAccess({
      entityType: 'interview',
      entityId: interviewId,
      allowedPermissions: ['workforce.interviews.schedule'],
    });
    const templateId = text(formData, 'templateId');
    if (!uuid(templateId))
      return { ok: false, message: 'Choose an active scorecard template.' };
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.rpc(
      'recruitment_assign_interview_scorecard',
      {
        p_interview_id: interviewId,
        p_template_id: templateId,
        p_actor_employee_id: access.employeeId,
      }
    );
    if (error) {
      if (['23514', '55000'].includes(error.code ?? '')) {
        return {
          ok: false,
          message:
            'That scorecard cannot be assigned after feedback is submitted.',
        };
      }
      throw error;
    }
    revalidatePath(`/workforce/recruitment/interviews/${interviewId}`);
    return {
      ok: true,
      message: 'Scorecard assigned to eligible interviewers.',
    };
  } catch (error) {
    logDbError('recruitment.interview.scorecard.assign', error, {
      interviewId,
    });
    return { ok: false, message: 'The scorecard could not be assigned.' };
  }
}

export async function submitInterviewFeedback(
  interviewId: string,
  _previous: InterviewActionState,
  formData: FormData
): Promise<InterviewActionState> {
  try {
    const access = await requireRecruitmentAccess({
      entityType: 'interview',
      entityId: interviewId,
      allowedPermissions: ['workforce.interviews.score'],
    });
    if (!access.employeeId)
      return {
        ok: false,
        message: 'Link your employee profile before submitting feedback.',
      };
    const recommendation = text(formData, 'recommendation') || null;
    const confidence = text(formData, 'confidence') || null;
    const submit = text(formData, 'intent') === 'submit';
    const competencies = text(formData, 'competencies')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const ratings = [...formData.entries()]
      .filter(
        ([key, value]) =>
          key.startsWith('rating:') && typeof value === 'string' && value.trim()
      )
      .map(([key, value]) => ({
        criterion_id: key.slice('rating:'.length),
        rating: Number(value),
        comment:
          text(formData, `comment:${key.slice('rating:'.length)}`) || null,
      }));
    if (
      ratings.some(
        (rating) =>
          !uuid(rating.criterion_id) || !Number.isFinite(rating.rating)
      )
    ) {
      return {
        ok: false,
        message: 'Complete the scorecard using valid ratings.',
      };
    }
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.rpc(
      'recruitment_submit_interview_scorecard',
      {
        p_interview_id: interviewId,
        p_employee_id: access.employeeId,
        p_assigned_competencies: competencies,
        p_evidence: text(formData, 'evidence') || null,
        p_red_flags: text(formData, 'redFlags') || null,
        p_recommendation: recommendation,
        p_confidence: confidence,
        p_conflict_declared: formData.get('conflictDeclared') === 'on',
        p_conflict_note: text(formData, 'conflictNote') || null,
        p_ratings: ratings,
        p_submit: submit,
      }
    );
    if (error) {
      if (['23514', '42501', '55000'].includes(error.code ?? ''))
        return {
          ok: false,
          message:
            'Complete the required evidence and conflict declaration before submitting.',
        };
      throw error;
    }
    revalidatePath(`/workforce/recruitment/interviews/${interviewId}`);
    return {
      ok: true,
      message: submit
        ? 'Feedback submitted and locked.'
        : 'Draft feedback saved privately.',
    };
  } catch (error) {
    logDbError('recruitment.interview.feedback', error, { interviewId });
    return { ok: false, message: 'Feedback could not be saved.' };
  }
}

export async function setInterviewStatus(
  interviewId: string,
  formData: FormData
): Promise<void> {
  const target = text(formData, 'targetStatus');
  if (!['confirmed', 'completed', 'cancelled', 'no_show'].includes(target))
    throw new Error('Invalid interview status.');
  const access = await requireRecruitmentAccess({
    entityType: 'interview',
    entityId: interviewId,
    allowedPermissions: ['workforce.interviews.schedule'],
  });
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc('recruitment_set_interview_status', {
    p_interview_id: interviewId,
    p_target_status: target,
    p_actor_employee_id: access.employeeId,
    p_note: text(formData, 'note') || null,
  });
  if (error) throw error;
  revalidatePath(`/workforce/recruitment/interviews/${interviewId}`);
  revalidatePath('/workforce/recruitment/interviews');
}
