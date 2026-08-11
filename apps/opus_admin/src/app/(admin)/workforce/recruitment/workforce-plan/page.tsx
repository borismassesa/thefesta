import { requirePermission } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase';
import WorkforceHeading from '../../_components/PageHeading';
import ConfirmActionForm from '../_components/ConfirmActionForm';
import {
  DANGER_BUTTON_SMALL,
  EmptyState,
  FIELD,
  FIELD_LABEL,
  PANEL,
  PRIMARY_BUTTON_SMALL,
  StatusPill,
  SUMMARY,
} from '../_components/ui';
import {
  addPlannedPosition,
  createWorkforcePlan,
  deletePlannedPosition,
  deleteWorkforcePlan,
  transitionWorkforcePlan,
  updatePlannedPosition,
  updateWorkforcePlan,
} from './actions';

type PositionFormData = {
  title: string;
  department: string;
  location: string;
  employment_type: string;
  headcount: number;
  target_start_date: string | null;
  budgeted_salary_min_tzs: number | null;
  budgeted_salary_max_tzs: number | null;
};

function PositionFields({
  position,
  department,
}: {
  position?: PositionFormData;
  department?: string | null;
}) {
  return (
    <>
      <label>
        <span className={FIELD_LABEL}>Title</span>
        <input
          name="title"
          required
          defaultValue={position?.title ?? ''}
          className={FIELD}
        />
      </label>
      <label>
        <span className={FIELD_LABEL}>Department</span>
        <input
          name="department"
          required
          defaultValue={position?.department ?? department ?? ''}
          className={FIELD}
        />
      </label>
      <label>
        <span className={FIELD_LABEL}>Location</span>
        <input
          name="location"
          required
          defaultValue={position?.location ?? ''}
          className={FIELD}
        />
      </label>
      <label>
        <span className={FIELD_LABEL}>Employment type</span>
        <select
          name="employment_type"
          defaultValue={position?.employment_type ?? 'Permanent'}
          className={FIELD}
        >
          <option>Permanent</option>
          <option>Contract</option>
          <option>Intern</option>
        </select>
      </label>
      <label>
        <span className={FIELD_LABEL}>Headcount</span>
        <input
          name="headcount"
          type="number"
          min="1"
          required
          defaultValue={position?.headcount ?? 1}
          className={FIELD}
        />
      </label>
      <label>
        <span className={FIELD_LABEL}>Target start date</span>
        <input
          name="target_start_date"
          type="date"
          defaultValue={position?.target_start_date ?? ''}
          className={FIELD}
        />
      </label>
      <label>
        <span className={FIELD_LABEL}>Salary minimum (TZS)</span>
        <input
          name="salary_min"
          type="number"
          min="0"
          required
          defaultValue={position?.budgeted_salary_min_tzs ?? ''}
          className={FIELD}
        />
      </label>
      <label>
        <span className={FIELD_LABEL}>Salary maximum (TZS)</span>
        <input
          name="salary_max"
          type="number"
          min="0"
          required
          defaultValue={position?.budgeted_salary_max_tzs ?? ''}
          className={FIELD}
        />
      </label>
    </>
  );
}

export default async function WorkforcePlanPage() {
  await requirePermission('workforce.recruitment_settings.write');
  const supabase = createSupabaseAdminClient();
  const [plans, positions] = await Promise.all([
    supabase
      .from('recruitment_workforce_plans')
      .select('*')
      .order('fiscal_year', { ascending: false }),
    supabase
      .from('recruitment_positions')
      .select('*')
      .order('created_at', { ascending: false }),
  ]);
  if (plans.error) throw plans.error;
  if (positions.error) throw positions.error;

  return (
    <>
      <WorkforceHeading
        title="Workforce plan"
        subtitle="Approved headcount, hiring budget and planned positions by department."
      />
      <section className={`${PANEL} p-5`}>
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Create annual plan
        </h2>
        <form
          action={createWorkforcePlan}
          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <input
            name="name"
            required
            placeholder="Plan name"
            className={FIELD}
          />
          <input
            name="fiscal_year"
            type="number"
            required
            defaultValue={new Date().getFullYear() + 1}
            className={FIELD}
          />
          <input
            name="department"
            placeholder="Department (blank = company)"
            className={FIELD}
          />
          <input
            name="planned_headcount"
            type="number"
            min="0"
            required
            placeholder="Planned headcount"
            className={FIELD}
          />
          <input
            name="approved_headcount"
            type="number"
            min="0"
            required
            defaultValue="0"
            className={FIELD}
          />
          <input
            name="planned_budget_tzs"
            type="number"
            min="0"
            required
            placeholder="Budget TZS"
            className={FIELD}
          />
          <input
            name="assumptions"
            placeholder="Planning assumptions"
            className={FIELD}
          />
          <button data-opus-button="control" className={PRIMARY_BUTTON_SMALL}>Create plan</button>
        </form>
      </section>

      <div className="space-y-5">
        {(plans.data ?? []).map((plan) => {
          const planPositions = (positions.data ?? []).filter(
            (position) => position.workforce_plan_id === plan.id
          );
          const next =
            plan.status === 'draft'
              ? 'submitted'
              : plan.status === 'submitted'
                ? 'approved'
                : plan.status === 'approved'
                  ? 'locked'
                  : null;
          return (
            <section key={plan.id} className={`${PANEL} p-5`}>
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    {plan.name}
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    {plan.department ?? 'Company'} · FY {plan.fiscal_year} ·{' '}
                    {plan.approved_headcount}/{plan.planned_headcount} approved
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={plan.status} />
                  {next && (
                    <form
                      action={transitionWorkforcePlan.bind(null, plan.id, next)}
                    >
                      <button data-opus-button="control" className={`${PRIMARY_BUTTON_SMALL} capitalize`}>
                        {next}
                      </button>
                    </form>
                  )}
                  {plan.status !== 'archived' && (
                    <form
                      action={transitionWorkforcePlan.bind(
                        null,
                        plan.id,
                        'archived'
                      )}
                    >
                      <button data-opus-button="control" className={DANGER_BUTTON_SMALL}>Archive</button>
                    </form>
                  )}
                </div>
              </div>

              {plan.status === 'draft' && (
                <details className="mt-4 rounded-xl border border-gray-200 p-3">
                  <summary
                    className={`${SUMMARY} [&::-webkit-details-marker]:hidden`}
                  >
                    Edit plan
                  </summary>
                  <form
                    action={updateWorkforcePlan.bind(null, plan.id)}
                    className="mt-3 grid gap-3 border-t border-gray-100 pt-3 sm:grid-cols-2 lg:grid-cols-4"
                  >
                    <label>
                      <span className={FIELD_LABEL}>Name</span>
                      <input
                        name="name"
                        required
                        defaultValue={plan.name}
                        className={FIELD}
                      />
                    </label>
                    <label>
                      <span className={FIELD_LABEL}>Fiscal year</span>
                      <input
                        name="fiscal_year"
                        type="number"
                        required
                        defaultValue={plan.fiscal_year}
                        className={FIELD}
                      />
                    </label>
                    <label>
                      <span className={FIELD_LABEL}>Department</span>
                      <input
                        name="department"
                        defaultValue={plan.department ?? ''}
                        className={FIELD}
                      />
                    </label>
                    <label>
                      <span className={FIELD_LABEL}>Planned headcount</span>
                      <input
                        name="planned_headcount"
                        type="number"
                        min="0"
                        required
                        defaultValue={plan.planned_headcount}
                        className={FIELD}
                      />
                    </label>
                    <label>
                      <span className={FIELD_LABEL}>Approved headcount</span>
                      <input
                        name="approved_headcount"
                        type="number"
                        min="0"
                        required
                        defaultValue={plan.approved_headcount}
                        className={FIELD}
                      />
                    </label>
                    <label>
                      <span className={FIELD_LABEL}>Budget TZS</span>
                      <input
                        name="planned_budget_tzs"
                        type="number"
                        min="0"
                        required
                        defaultValue={plan.planned_budget_tzs}
                        className={FIELD}
                      />
                    </label>
                    <label className="sm:col-span-2">
                      <span className={FIELD_LABEL}>Assumptions</span>
                      <input
                        name="assumptions"
                        defaultValue={plan.assumptions ?? ''}
                        className={FIELD}
                      />
                    </label>
                    <button data-opus-button="control" className={`${PRIMARY_BUTTON_SMALL} lg:col-span-4`}>
                      Save plan
                    </button>
                  </form>
                  {planPositions.length === 0 && (
                    <ConfirmActionForm
                      action={deleteWorkforcePlan.bind(null, plan.id)}
                      confirmMessage={`Delete “${plan.name}”? This draft plan will be permanently removed.`}
                      className="mt-3"
                    >
                      <button data-opus-button="control" className={DANGER_BUTTON_SMALL}>
                        Delete draft plan
                      </button>
                    </ConfirmActionForm>
                  )}
                </details>
              )}

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {planPositions.map((position) => (
                  <article
                    key={position.id}
                    className="rounded-xl bg-gray-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">
                          {position.title} · {position.headcount}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {position.location} · TZS{' '}
                          {Number(
                            position.budgeted_salary_min_tzs
                          ).toLocaleString()}
                          –
                          {Number(
                            position.budgeted_salary_max_tzs
                          ).toLocaleString()}
                        </p>
                      </div>
                      <StatusPill status={position.status} />
                    </div>
                    {plan.status === 'draft' &&
                      position.status === 'planned' && (
                        <details className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
                          <summary
                            className={`${SUMMARY} [&::-webkit-details-marker]:hidden`}
                          >
                            Edit position
                          </summary>
                          <form
                            action={updatePlannedPosition.bind(
                              null,
                              plan.id,
                              position.id
                            )}
                            className="mt-3 grid gap-2 border-t border-gray-100 pt-3 sm:grid-cols-2"
                          >
                            <PositionFields position={position} />
                            <button data-opus-button="control"
                              className={`${PRIMARY_BUTTON_SMALL} sm:col-span-2`}
                            >
                              Save position
                            </button>
                          </form>
                          <ConfirmActionForm
                            action={deletePlannedPosition.bind(
                              null,
                              plan.id,
                              position.id
                            )}
                            confirmMessage={`Delete the planned position “${position.title}”?`}
                            className="mt-3"
                          >
                            <button data-opus-button="control" className={DANGER_BUTTON_SMALL}>
                              Delete position
                            </button>
                          </ConfirmActionForm>
                        </details>
                      )}
                  </article>
                ))}
              </div>

              {plan.status === 'draft' && (
                <details className="mt-4 rounded-xl border border-dashed border-gray-200 p-3">
                  <summary
                    className={`${SUMMARY} [&::-webkit-details-marker]:hidden`}
                  >
                    Add planned position
                  </summary>
                  <form
                    action={addPlannedPosition.bind(null, plan.id)}
                    className="mt-3 grid gap-2 border-t border-gray-100 pt-3 sm:grid-cols-2 lg:grid-cols-4"
                  >
                    <PositionFields department={plan.department} />
                    <button data-opus-button="control" className={`${PRIMARY_BUTTON_SMALL} lg:col-span-4`}>
                      Add position
                    </button>
                  </form>
                </details>
              )}
            </section>
          );
        })}
        {plans.data?.length === 0 && (
          <EmptyState
            title="No workforce plans yet"
            hint="Create an annual plan above to set approved headcount and hiring budget."
          />
        )}
      </div>
    </>
  );
}
