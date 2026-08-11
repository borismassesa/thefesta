import WorkforceHeading from '../../_components/PageHeading';
import { requirePermission } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase';
import {
  FIELD,
  DANGER_BUTTON,
  DANGER_BUTTON_SMALL,
  PANEL,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  StatusPill,
  SUMMARY,
} from '../_components/ui';
import ConfirmActionForm from '../_components/ConfirmActionForm';
import {
  createMessageTemplate,
  deleteMessageTemplate,
  sendTemplateTest,
  setMessageTemplateStatus,
  updateMessageTemplate,
} from './actions';

export default async function TemplatesPage() {
  await requirePermission('workforce.recruitment_settings.write');
  const db = createSupabaseAdminClient();
  const [templates, versions] = await Promise.all([
    db.from('recruitment_message_templates').select('*').order('name'),
    db
      .from('recruitment_message_template_versions')
      .select('*')
      .order('version', { ascending: false }),
  ]);
  if (templates.error) throw templates.error;
  if (versions.error) throw versions.error;

  return (
    <>
      <WorkforceHeading
        title="Communication templates"
        subtitle="English and Kiswahili messages with placeholders, approval status, provider tests and immutable versions."
      />

      <section className={`${PANEL} p-5`}>
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Create template
        </h2>
        <form
          action={createMessageTemplate}
          className="mt-4 grid gap-3 md:grid-cols-3"
        >
          <input
            className={FIELD}
            name="name"
            required
            placeholder="Template name"
          />
          <select className={FIELD} name="channel">
            <option value="email">Email</option>
            <option value="in_app">Candidate portal</option>
            <option value="sms">SMS (when enabled)</option>
            <option value="whatsapp">
              WhatsApp (formal integration + consent)
            </option>
            <option value="phone_log">Phone-call log</option>
          </select>
          <select className={FIELD} name="language_code">
            <option value="en">English</option>
            <option value="sw">Kiswahili</option>
          </select>
          <input
            className={FIELD}
            name="category"
            required
            placeholder="Category, e.g. interview_invitation"
          />
          <input
            className={`${FIELD} md:col-span-2`}
            name="subject_template"
            placeholder="Subject (email only)"
          />
          <textarea
            className={`${FIELD} md:col-span-3`}
            name="body_template"
            required
            rows={5}
            placeholder="Hello {{candidate.first_name}}, …"
          />
          <div className="flex justify-end md:col-span-3">
            <button data-opus-button="control" className={`${PRIMARY_BUTTON} text-xs`}>
              Create draft
            </button>
          </div>
        </form>
      </section>

      <div className="space-y-4">
        {(templates.data ?? []).map((template) => {
          const history = (versions.data ?? []).filter(
            (version) => version.template_id === template.id
          );
          return (
            <details key={template.id} className={`${PANEL} p-5`}>
              <summary className={SUMMARY}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{template.name}</span>
                  <span className="mt-0.5 block text-xs font-normal capitalize text-gray-500">
                    {template.channel.replaceAll('_', ' ')} ·{' '}
                    {template.language_code.toUpperCase()} · v
                    {history[0]?.version ?? 1}
                  </span>
                </span>
                <StatusPill status={template.status} />
              </summary>

              <div className="mt-4 grid gap-4 border-t border-gray-100 pt-4 xl:grid-cols-[1fr_320px]">
                <div>
                  <h3 className="text-sm font-semibold">Edit and preview</h3>
                  <form
                    action={updateMessageTemplate.bind(null, template.id)}
                    className="mt-3 space-y-2"
                  >
                    <input
                      className={FIELD}
                      name="subject_template"
                      defaultValue={template.subject_template ?? ''}
                      placeholder="Subject"
                    />
                    <textarea
                      className={FIELD}
                      name="body_template"
                      rows={7}
                      defaultValue={template.body_template}
                      required
                    />
                    <input
                      className={FIELD}
                      name="change_summary"
                      required
                      placeholder="Change summary"
                    />
                    <button data-opus-button="control" className={`${SECONDARY_BUTTON} text-xs`}>
                      Save new version
                    </button>
                  </form>
                  <div className="mt-4 rounded-xl bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase text-gray-500">
                      Preview
                    </p>
                    {template.subject_template && (
                      <p className="mt-2 text-sm font-semibold">
                        {template.subject_template}
                      </p>
                    )}
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                      {template.body_template}
                    </p>
                    <p className="mt-3 text-xs text-gray-500">
                      Placeholders:{' '}
                      {template.variables?.length
                        ? template.variables
                            .map((value: string) => `{{${value}}}`)
                            .join(', ')
                        : 'none'}
                    </p>
                  </div>
                </div>

                <aside>
                  <h3 className="text-sm font-semibold">Approval and test</h3>
                  <form
                    action={setMessageTemplateStatus.bind(
                      null,
                      template.id,
                      template.status === 'active' ? 'archived' : 'active'
                    )}
                    className="mt-3"
                  >
                    <button data-opus-button="control"
                      className={`${template.status === 'active' ? DANGER_BUTTON : PRIMARY_BUTTON} w-full text-xs`}
                    >
                      {template.status === 'active'
                        ? 'Archive template'
                        : 'Approve and activate'}
                    </button>
                  </form>
                  {template.status === 'draft' && (
                    <ConfirmActionForm
                      action={deleteMessageTemplate.bind(null, template.id)}
                      confirmMessage={`Delete “${template.name}”? Its draft and version history will be permanently removed.`}
                      className="mt-3"
                    >
                      <button data-opus-button="control" className={`w-full ${DANGER_BUTTON_SMALL}`}>
                        Delete draft
                      </button>
                    </ConfirmActionForm>
                  )}
                  {template.channel === 'email' && (
                    <form
                      action={sendTemplateTest.bind(null, template.id)}
                      className="mt-3 rounded-xl bg-gray-50 p-3"
                    >
                      <label className="text-xs font-semibold">
                        Provider test email
                        <input
                          className={`${FIELD} mt-1`}
                          name="address"
                          type="email"
                          required
                        />
                      </label>
                      <button data-opus-button="control"
                        className={`${SECONDARY_BUTTON} mt-2 w-full text-xs`}
                      >
                        Send rendered test
                      </button>
                    </form>
                  )}
                  <h3 className="mt-4 text-sm font-semibold">
                    Version history
                  </h3>
                  <ol className="mt-2 space-y-2">
                    {history.map((version) => (
                      <li
                        key={version.id}
                        className="rounded-lg bg-gray-50 px-3 py-2 text-xs"
                      >
                        <b>v{version.version}</b> ·{' '}
                        {version.change_summary ?? 'Revision'}
                        <br />
                        <time className="text-gray-400">
                          {new Date(version.created_at).toLocaleString('en-TZ')}
                        </time>
                      </li>
                    ))}
                  </ol>
                </aside>
              </div>
            </details>
          );
        })}
      </div>
    </>
  );
}
