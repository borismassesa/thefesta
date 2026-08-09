'use server';

import { randomUUID } from 'node:crypto';
import { createSupabaseServerClient } from '@/lib/supabase';
import type { CareersFormState } from '@/lib/career-form-state';

const CAREERS_PRIVACY_NOTICE_VERSION = 'careers-2026-08-02';

const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const RESUME_TYPES = new Map([
  ['application/pdf', 'pdf'],
  ['application/msword', 'doc'],
  [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'docx',
  ],
]);

function textField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function optionalUrl(value: string): boolean {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function validateResume(
  file: File
): Promise<{ extension: string; bytes: ArrayBuffer }> {
  if (!file.name || file.size === 0)
    throw new Error('Please attach your CV or résumé.');
  if (file.size > MAX_RESUME_BYTES)
    throw new Error('Your CV must be 10 MB or smaller.');
  const extension = RESUME_TYPES.get(file.type);
  if (!extension) throw new Error('Upload your CV as a PDF, DOC or DOCX file.');

  const bytes = await file.arrayBuffer();
  const head = new Uint8Array(bytes.slice(0, 8));
  const isPdf =
    extension === 'pdf' && String.fromCharCode(...head.slice(0, 4)) === '%PDF';
  const isDoc =
    extension === 'doc' &&
    [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every(
      (value, index) => head[index] === value
    );
  const isDocx = extension === 'docx' && head[0] === 0x50 && head[1] === 0x4b;
  if (!isPdf && !isDoc && !isDocx) {
    throw new Error(
      'The uploaded file does not match its declared document type.'
    );
  }
  return { extension, bytes };
}

async function uploadResume(options: {
  file: File;
  folder: 'applications' | 'application-answers' | 'talent-community';
  scopeId: string;
}): Promise<string> {
  const { extension, bytes } = await validateResume(options.file);
  const path = `${options.folder}/${options.scopeId}/${randomUUID()}.${extension}`;
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.storage.from('careers').upload(path, bytes, {
    contentType: options.file.type,
    upsert: false,
  });
  if (error)
    throw new Error('We could not securely upload your CV. Please try again.');
  return path;
}

type ApplicationQuestionRow = {
  id: string;
  key: string;
  label: string;
  question_type: string;
  options: unknown;
  is_required: boolean;
  is_knockout: boolean;
  knockout_rule: unknown;
};

type PreparedApplicationAnswer = {
  question: ApplicationQuestionRow;
  answer: unknown;
  file?: File;
};

function isEmptyAnswer(answer: unknown): boolean {
  return (
    answer === null ||
    answer === undefined ||
    answer === '' ||
    (Array.isArray(answer) && answer.length === 0)
  );
}

function prepareApplicationAnswer(
  question: ApplicationQuestionRow,
  formData: FormData
): PreparedApplicationAnswer {
  const fieldName = `question:${question.id}`;
  if (question.question_type === 'file') {
    const value = formData.get(fieldName);
    return {
      question,
      answer: null,
      file: value instanceof File && value.size > 0 ? value : undefined,
    };
  }
  if (question.question_type === 'multi_select') {
    return {
      question,
      answer: formData
        .getAll(fieldName)
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    };
  }
  if (question.question_type === 'consent_checkbox') {
    return { question, answer: formData.get(fieldName) === 'yes' };
  }
  const value = textField(formData, fieldName);
  if (
    question.question_type === 'number' ||
    question.question_type === 'rating'
  ) {
    return { question, answer: value === '' ? null : Number(value) };
  }
  return { question, answer: value };
}

function validateApplicationAnswer(
  prepared: PreparedApplicationAnswer
): string | null {
  const { question, answer, file } = prepared;
  if (
    question.is_required &&
    (question.question_type === 'file'
      ? !file
      : isEmptyAnswer(answer) || answer === false)
  ) {
    return 'This answer is required.';
  }
  if (isEmptyAnswer(answer) && !file) return null;

  const options = Array.isArray(question.options)
    ? question.options.filter(
        (option): option is string => typeof option === 'string'
      )
    : [];
  if (
    question.question_type === 'single_select' &&
    !options.includes(String(answer))
  ) {
    return 'Choose one of the available options.';
  }
  if (
    question.question_type === 'multi_select' &&
    Array.isArray(answer) &&
    answer.some((option) => !options.includes(String(option)))
  ) {
    return 'Choose only from the available options.';
  }
  if (question.question_type === 'url' && !optionalUrl(String(answer))) {
    return 'Enter a complete URL.';
  }
  if (
    (question.question_type === 'number' ||
      question.question_type === 'rating') &&
    (typeof answer !== 'number' || !Number.isFinite(answer))
  ) {
    return 'Enter a valid number.';
  }
  if (
    question.question_type === 'rating' &&
    typeof answer === 'number' &&
    (answer < 1 || answer > 5 || !Number.isInteger(answer))
  ) {
    return 'Choose a whole-number rating from 1 to 5.';
  }
  return null;
}

async function removeUploadedResume(path: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase.storage.from('careers').remove([path]);
}

export async function submitJobApplication(
  _previousState: CareersFormState,
  formData: FormData
): Promise<CareersFormState> {
  const jobId = textField(formData, 'jobId');
  const fullName = textField(formData, 'fullName');
  const preferredName = textField(formData, 'preferredName');
  const email = textField(formData, 'email').toLowerCase();
  const phone = textField(formData, 'phone');
  const country = textField(formData, 'country') || 'Tanzania';
  const city = textField(formData, 'city');
  const currentPosition = textField(formData, 'currentPosition');
  const currentOrganization = textField(formData, 'currentOrganization');
  const linkedinUrl = textField(formData, 'linkedinUrl');
  const portfolioUrl = textField(formData, 'portfolioUrl');
  const coverLetter = textField(formData, 'coverLetter');
  const salaryExpectation = textField(formData, 'salaryExpectation');
  const earliestStartDate = textField(formData, 'earliestStartDate') || null;
  const yearsExperienceRaw = textField(formData, 'yearsExperience');
  const yearsExperience = yearsExperienceRaw
    ? Number(yearsExperienceRaw)
    : null;
  const workAuthorizedRaw = textField(formData, 'workAuthorized');
  const weekendAvailableRaw = textField(formData, 'weekendAvailable');
  const resume = formData.get('resume');

  const fieldErrors: Record<string, string> = {};
  if (!isUuid(jobId)) fieldErrors.jobId = 'This vacancy is not available.';
  if (fullName.length < 2 || fullName.length > 120)
    fieldErrors.fullName = 'Enter your full name.';
  if (!isEmail(email) || email.length > 200)
    fieldErrors.email = 'Enter a valid email address.';
  if (phone.length < 7 || phone.length > 30)
    fieldErrors.phone = 'Enter a valid phone number.';
  if (city.length < 2 || city.length > 100)
    fieldErrors.city = 'Enter your city.';
  if (!optionalUrl(linkedinUrl))
    fieldErrors.linkedinUrl = 'Enter a complete LinkedIn URL.';
  if (!optionalUrl(portfolioUrl))
    fieldErrors.portfolioUrl = 'Enter a complete portfolio URL.';
  if (
    yearsExperience !== null &&
    (!Number.isFinite(yearsExperience) ||
      yearsExperience < 0 ||
      yearsExperience > 60)
  ) {
    fieldErrors.yearsExperience = 'Enter years of experience between 0 and 60.';
  }
  if (!['yes', 'no'].includes(workAuthorizedRaw)) {
    fieldErrors.workAuthorized =
      'Choose whether you are authorized to work in Tanzania.';
  }
  if (!['yes', 'no'].includes(weekendAvailableRaw)) {
    fieldErrors.weekendAvailable =
      'Choose your availability for weekend event work.';
  }
  if (formData.get('applicationConsent') !== 'on') {
    fieldErrors.applicationConsent =
      'Consent is required to process your application.';
  }
  if (!(resume instanceof File) || resume.size === 0)
    fieldErrors.resume = 'Attach your CV or résumé.';

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: 'error',
      message: 'Check the highlighted fields and try again.',
      fieldErrors,
    };
  }

  const supabase = createSupabaseServerClient();
  const { data: job, error: jobError } = await supabase
    .from('workforce_jobs')
    .select('id, title, status, closing_date')
    .eq('id', jobId)
    .maybeSingle<{
      id: string;
      title: string;
      status: string;
      closing_date: string | null;
    }>();
  if (jobError || !job || job.status !== 'Open') {
    return {
      status: 'error',
      message: 'This vacancy is no longer accepting applications.',
    };
  }
  if (
    job.closing_date &&
    job.closing_date < new Date().toISOString().slice(0, 10)
  ) {
    return {
      status: 'error',
      message: 'The application deadline for this vacancy has passed.',
    };
  }
  const { data: posting, error: postingError } = await supabase
    .from('recruitment_job_postings')
    .select('id, status, visibility, publish_at, unpublish_at')
    .eq('workforce_job_id', jobId)
    .maybeSingle();
  const timestamp = Date.now();
  if (
    postingError ||
    !posting ||
    posting.status !== 'published' ||
    !['public', 'unlisted'].includes(posting.visibility) ||
    (posting.publish_at && Date.parse(posting.publish_at) > timestamp) ||
    (posting.unpublish_at && Date.parse(posting.unpublish_at) <= timestamp)
  ) {
    return {
      status: 'error',
      message: 'This vacancy is no longer accepting applications.',
    };
  }

  const { data: questionRows, error: questionError } = await supabase
    .from('recruitment_application_questions')
    .select(
      'id, key, label, question_type, options, is_required, is_knockout, knockout_rule'
    )
    .eq('posting_id', posting.id)
    .eq('requirement_stage', 'application')
    .order('sort_order');
  if (questionError) {
    console.error('[careers] application questions could not be loaded', {
      code: questionError.code,
      jobId,
    });
    return {
      status: 'error',
      message: 'We could not verify this application form. Please try again.',
    };
  }
  const preparedAnswers = (
    (questionRows ?? []) as ApplicationQuestionRow[]
  ).map((question) => prepareApplicationAnswer(question, formData));
  for (const prepared of preparedAnswers) {
    const error = validateApplicationAnswer(prepared);
    if (error) fieldErrors[`question:${prepared.question.id}`] = error;
  }
  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: 'error',
      message: 'Check the highlighted fields and try again.',
      fieldErrors,
    };
  }

  let resumePath = '';
  const answerUploadPaths: string[] = [];
  try {
    resumePath = await uploadResume({
      file: resume as File,
      folder: 'applications',
      scopeId: jobId,
    });
    for (const prepared of preparedAnswers) {
      if (!prepared.file) continue;
      const storagePath = await uploadResume({
        file: prepared.file,
        folder: 'application-answers',
        scopeId: jobId,
      });
      answerUploadPaths.push(storagePath);
      prepared.answer = {
        storage_path: storagePath,
        original_filename: prepared.file.name.slice(0, 255),
        mime_type: prepared.file.type,
        byte_size: prepared.file.size,
      };
    }
    const answered = preparedAnswers.filter(
      (prepared) => !isEmptyAnswer(prepared.answer)
    );
    const { data: submission, error } = await supabase.rpc(
      'recruitment_submit_public_application',
      {
        p_job_id: jobId,
        p_payload: {
          full_name: fullName,
          preferred_name: preferredName || null,
          email,
          phone,
          country,
          city,
          current_position: currentPosition || null,
          current_organization: currentOrganization || null,
          years_experience: yearsExperience,
          linkedin_url: linkedinUrl || null,
          portfolio_url: portfolioUrl || null,
          resume_storage_path: resumePath,
          resume_filename: (resume as File).name.slice(0, 255),
          resume_mime_type: (resume as File).type,
          resume_byte_size: (resume as File).size,
          cover_letter: coverLetter || null,
          earliest_start_date: earliestStartDate,
          salary_expectation: salaryExpectation || null,
          work_authorized: workAuthorizedRaw === 'yes',
          weekend_available: weekendAvailableRaw === 'yes',
          privacy_notice_version: CAREERS_PRIVACY_NOTICE_VERSION,
          application_consent_at: new Date().toISOString(),
          talent_pool_consent: formData.get('talentPoolConsent') === 'on',
          career_updates_consent: formData.get('careerUpdatesConsent') === 'on',
          utm_source: textField(formData, 'utmSource').slice(0, 120),
          utm_medium: textField(formData, 'utmMedium').slice(0, 120),
          utm_campaign: textField(formData, 'utmCampaign').slice(0, 200),
          referrer_url: textField(formData, 'referrerUrl').slice(0, 1000),
        },
        p_answers: answered.map((prepared) => ({
          question_id: prepared.question.id,
          answer: prepared.answer,
        })),
      }
    );

    if (error) {
      await removeUploadedResume(resumePath);
      if (answerUploadPaths.length > 0) {
        await supabase.storage.from('careers').remove(answerUploadPaths);
      }
      if (error.code === '23505') {
        return {
          status: 'error',
          message:
            'An application using this email already exists for this role.',
        };
      }
      console.error('[careers] application insert failed', {
        code: error.code,
        jobId,
      });
      return {
        status: 'error',
        message: 'We could not submit your application. Please try again.',
      };
    }

    const reference =
      submission && typeof submission === 'object' && 'reference' in submission
        ? String(submission.reference)
        : '';

    return {
      status: 'success',
      message: `Your application for ${job.title} has been received.`,
      reference,
    };
  } catch (error) {
    if (resumePath) await removeUploadedResume(resumePath);
    if (answerUploadPaths.length > 0) {
      await createSupabaseServerClient()
        .storage.from('careers')
        .remove(answerUploadPaths);
    }
    return {
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'We could not submit your application.',
    };
  }
}

export async function joinTalentCommunity(
  _previousState: CareersFormState,
  formData: FormData
): Promise<CareersFormState> {
  const fullName = textField(formData, 'fullName');
  const email = textField(formData, 'email').toLowerCase();
  const phone = textField(formData, 'phone');
  const location = textField(formData, 'location');
  const roleInterests = textField(formData, 'roleInterests');
  const experienceLevel = textField(formData, 'experienceLevel');
  const profileUrl = textField(formData, 'profileUrl');
  const preferredContactMethod =
    textField(formData, 'preferredContactMethod') || 'Email';
  const preferredDepartments = formData
    .getAll('preferredDepartments')
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
  const resume = formData.get('resume');

  const fieldErrors: Record<string, string> = {};
  if (fullName.length < 2 || fullName.length > 120)
    fieldErrors.fullName = 'Enter your full name.';
  if (!isEmail(email) || email.length > 200)
    fieldErrors.email = 'Enter a valid email address.';
  if (!location) fieldErrors.location = 'Enter your location.';
  if (preferredDepartments.length === 0) {
    fieldErrors.preferredDepartments = 'Choose at least one team.';
  }
  if (!optionalUrl(profileUrl))
    fieldErrors.profileUrl = 'Enter a complete portfolio or LinkedIn URL.';
  if (!['Email', 'Phone', 'WhatsApp'].includes(preferredContactMethod)) {
    fieldErrors.preferredContactMethod = 'Choose a contact method.';
  }
  if (formData.get('retentionConsent') !== 'on') {
    fieldErrors.retentionConsent =
      'Consent is required to join the talent community.';
  }
  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: 'error',
      message: 'Check the highlighted fields and try again.',
      fieldErrors,
    };
  }

  let resumePath: string | null = null;
  try {
    if (resume instanceof File && resume.size > 0) {
      resumePath = await uploadResume({
        file: resume,
        folder: 'talent-community',
        scopeId: randomUUID(),
      });
    }
    const now = new Date().toISOString();
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('career_talent_prospects')
      .insert({
        full_name: fullName,
        email,
        phone: phone || null,
        location,
        preferred_departments: preferredDepartments,
        role_interests: roleInterests || null,
        experience_level: experienceLevel || null,
        linkedin_or_portfolio_url: profileUrl || null,
        resume_storage_path: resumePath,
        preferred_contact_method: preferredContactMethod,
        privacy_notice_version: CAREERS_PRIVACY_NOTICE_VERSION,
        retention_consent_at: now,
        career_updates_consent_at:
          formData.get('careerUpdatesConsent') === 'on' ? now : null,
      })
      .select('id')
      .single<{ id: string }>();
    if (error) {
      if (resumePath) await removeUploadedResume(resumePath);
      console.error('[careers] talent community insert failed', {
        code: error.code,
      });
      return {
        status: 'error',
        message: 'We could not save your profile. Please try again.',
      };
    }
    const { error: auditError } = await supabase
      .from('recruitment_audit_events')
      .insert({
        event_type: 'talent_prospect.created',
        entity_type: 'career_talent_prospect',
        entity_id: data.id,
        actor_type: 'candidate',
        metadata: { preferred_departments: preferredDepartments },
      });
    if (auditError)
      console.error('[careers] talent audit insert failed', {
        code: auditError.code,
      });
    return {
      status: 'success',
      message:
        'You are in our talent community. We will be in touch when the right role opens.',
    };
  } catch (error) {
    if (resumePath) await removeUploadedResume(resumePath);
    return {
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'We could not save your profile.',
    };
  }
}
