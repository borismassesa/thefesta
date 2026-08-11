import Link from 'next/link';
import WorkforceHeading from '../../_components/PageHeading';
import { getCallerPermissions, requirePermission } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { getApplicationRows } from '../_lib/collections';
import {
  EmptyState,
  PANEL,
  ROW,
  SECONDARY_BUTTON,
  StatusPill,
  TABLE_HEADER,
} from '../_components/ui';
import {
  bulkRejectApplications,
  cancelScheduledApplicationAction,
} from './actions';

export default async function ApplicationsPage() {
  await requirePermission('workforce.applications.read');
  const [rows, permissions] = await Promise.all([
    getApplicationRows(),
    getCallerPermissions(),
  ]);
  const db = createSupabaseAdminClient();
  const [reasons, offers, scheduled, templates] = await Promise.all([
    db
      .from('recruitment_disposition_reasons')
      .select('code, label')
      .eq('is_active', true)
      .order('sort_order'),
    db
      .from('recruitment_offers')
      .select('id, offer_number, job_title, status')
      .in('status', ['sent', 'viewed'])
      .order('created_at', { ascending: false }),
    db
      .from('recruitment_scheduled_application_actions')
      .select(
        'id, application_id, target_status, execute_after, trigger_offer_id, status'
      )
      .eq('status', 'scheduled')
      .order('created_at', { ascending: false })
      .limit(100),
    db
      .from('recruitment_message_templates')
      .select('id, name, language_code')
      .eq('category', 'rejection')
      .eq('channel', 'email')
      .eq('status', 'active')
      .order('language_code'),
  ]);
  for (const result of [reasons, offers, scheduled, templates])
    if (result.error) throw result.error;
  const canReject = permissions.has('workforce.applications.reject');
  return (
    <>
      <WorkforceHeading
        title="Applications"
        subtitle="Canonical records, candidate-safe states, source attribution and governed individual or batch decisions."
      />
      <form action={bulkRejectApplications}>
        {rows.length > 0 && (
          <section className={PANEL}>
            <div className={`${TABLE_HEADER} hidden grid-cols-[minmax(0,1.4fr)_minmax(140px,.65fr)_minmax(0,1fr)_32px] gap-4 md:grid`}>
              <span>Candidate and role</span>
              <span>Status</span>
              <span>Application details</span>
              <span className="sr-only">Select</span>
            </div>
            {rows.map((row) => {
              const selectable = canReject && !['rejected', 'withdrawn', 'hired', 'archived'].includes(row.status);
              return (
                <article key={row.id} className={`${ROW} grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(140px,.65fr)_minmax(0,1fr)_32px] md:items-center md:gap-4`}>
                  <div className="min-w-0">
                    <Link href={row.href!} className="text-sm font-semibold text-gray-900 hover:text-[#5B2D8E]">
                      {row.title}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-gray-500">{row.subtitle}</p>
                  </div>
                  <StatusPill status={row.status} />
                  <p className="text-xs text-gray-500">{row.detail}</p>
                  <div className="flex justify-end">
                    {selectable && (
                      <input
                        name="application_ids"
                        value={row.id}
                        type="checkbox"
                        aria-label={`Select ${row.title}`}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        )}
        {rows.length === 0 && (
          <EmptyState
            title="No applications yet"
            hint="Applications will appear here after a candidate submits."
          />
        )}
        {canReject && rows.length > 0 && (
          <section className="mt-5 rounded-2xl border border-rose-100 bg-rose-50 p-5">
            <h2 className="font-semibold text-rose-950">
              Structured batch rejection
            </h2>
            <p className="mt-1 text-sm text-rose-800">
              The decision is atomic. The selected candidate message remains
              queued until a different team member approves it.
            </p>
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <select
                name="reason_code"
                required
                className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Internal reason</option>
                {(reasons.data ?? []).map((reason) => (
                  <option key={reason.code} value={reason.code}>
                    {reason.label}
                  </option>
                ))}
              </select>
              <select
                name="template_id"
                required
                className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Candidate outcome template</option>
                {(templates.data ?? []).map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} · {template.language_code.toUpperCase()}
                  </option>
                ))}
              </select>
              <select
                name="timing"
                className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm"
              >
                <option value="now">Reject now</option>
                <option value="scheduled">Schedule decision</option>
                <option value="finalist_acceptance">
                  After finalist accepts
                </option>
              </select>
              <input
                name="execute_after"
                type="datetime-local"
                className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm"
                aria-label="Scheduled execution time"
              />
              <select
                name="trigger_offer_id"
                className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Finalist offer trigger</option>
                {(offers.data ?? []).map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offer.offer_number} · {offer.job_title}
                  </option>
                ))}
              </select>
              <textarea
                name="note"
                required
                minLength={5}
                placeholder="Internal decision evidence"
                className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm"
              />
              <button data-opus-button="control" className="opus-button opus-button--danger opus-button--small md:col-span-3">
                Apply governed decision to selected
              </button>
            </div>
          </section>
        )}
      </form>
      {(scheduled.data ?? []).length > 0 && (
        <section className={`${PANEL} mt-5 p-5`}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Scheduled application actions</h2>
          <div className="mt-3 space-y-2">
            {(scheduled.data ?? []).map((action) => (
              <div
                key={action.id}
                className="flex items-center justify-between gap-4 rounded-lg bg-gray-50 p-3 text-xs"
              >
                <span>
                  Application {action.application_id} → {action.target_status}
                  {action.execute_after
                    ? ` at ${new Date(action.execute_after).toLocaleString('en-TZ')}`
                    : ` after offer ${action.trigger_offer_id}`}
                </span>
                {canReject && (
                  <form
                    action={cancelScheduledApplicationAction.bind(
                      null,
                      action.id
                    )}
                  >
                    <button data-opus-button="danger" data-opus-button-size="small" className={`${SECONDARY_BUTTON} min-h-0 px-3 py-1.5 text-xs hover:border-rose-300 hover:text-rose-700`}>
                      Cancel
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
