-- Performance & Execution: KPI assignments.
--
-- Source spec: OF-ENG-RPT-006 Report Formats & Content Pack v1.0, the "KPIs for
-- this role" table that closes each of the nine role sections.
-- Design record: docs/PERFORMANCE_EXECUTION_INTEGRATION.md (decision D2).
--
-- What this adds, and why it is not a new metric registry.
--
-- growth_metric_definitions already models a named metric with a unit, a
-- direction, a source_mode and a declarative (non-executable) formula config.
-- growth_metric_targets already carries a target value scoped to a business
-- unit, a department or an employee for a period. Creating a second metric
-- registry here would break the one rule the spec is built on: "Every number
-- appears once. A figure shown in a report, a KPI and a list is the same
-- figure, calculated in one place."
--
-- Two things are genuinely missing, and only two.
--
-- 1. Weight. The spec gives each role a weighted KPI set whose weights sum to
--    100% and "produce the KPI score used in reviews". Nothing stores a weight.
--
-- 2. A binding of a metric to a subject with BOTH a weight and a target. Weight
--    cannot live on the metric definition because the same metric carries
--    different weights for different roles. This is not hypothetical: in the
--    source spec "OpusPass events closed" is worth 20% at a target of 2 events
--    to the Operations Supervisor, 30% at a target of 6 events to the Business
--    Development Officer, and 20% at 2 events to the Vendor Outreach Officer.
--    Of 59 role KPI assignments in the spec, 55 are distinct metrics; 4 are
--    reuses at different weights and targets.
--
-- So: one join table. The metric stays in growth_metric_definitions, the
-- computed value stays in growth_metric_actuals, and this table says who is
-- measured on what, how heavily, and against which target.

-- ---------------------------------------------------------------------------
-- performance_kpi_assignments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.performance_kpi_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_key text NOT NULL DEFAULT 'opusfesta'
    CHECK (organization_key = lower(btrim(organization_key)) AND organization_key ~ '^[a-z0-9_]{2,80}$'),

  metric_definition_id uuid NOT NULL
    REFERENCES public.growth_metric_definitions(id) ON DELETE RESTRICT,

  -- Subject of measurement. The discriminated-union shape and the exactly-one
  -- CHECK below mirror report_template_assignments deliberately: an employee
  -- should not have to learn two different mental models for "who does this
  -- apply to" between their report obligations and their KPI set.
  --
  -- Note on 'role': role_id points at workforce_roles, which is a permission
  -- role (slug + permission_keys), not a job-position registry. The report
  -- engine already made this choice for report_template_assignments, so this
  -- follows it rather than introducing a second, competing notion of role.
  -- The nine spec roles must therefore exist as workforce_roles rows before
  -- role-scoped KPI sets can be seeded. See the open question in the design
  -- record: job_title on workforce_employees is free text and cannot be a key.
  subject_type text NOT NULL
    CHECK (subject_type IN ('employee', 'department', 'role')),
  employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  department text,
  role_id uuid REFERENCES public.workforce_roles(id) ON DELETE CASCADE,

  -- Stable text key for the subject, used by the weight-sum invariant below so
  -- the constraint trigger does not have to branch on subject_type.
  subject_identity text GENERATED ALWAYS AS (
    subject_type || ':' || COALESCE(employee_id::text, department, role_id::text)
  ) STORED,

  -- The target as the employee reads it. Kept verbatim from the spec because
  -- real targets are not always a single number: "= 2 events (= TZS 800,000)"
  -- is a compound target, and "= 1.0 by Month 6; = 1.5 by Month 12" is time
  -- phased. Rendering a bare number would silently drop half the commitment.
  target_label text NOT NULL CHECK (length(btrim(target_label)) > 0),

  -- The machine-comparable part of that target, when there is one. NULL means
  -- the target is qualitative or compound and attainment must be assessed, not
  -- computed. A NULL here is honest; a fabricated number is not.
  target_value numeric(30,10),
  target_comparator text NOT NULL DEFAULT 'gte'
    CHECK (target_comparator IN ('gte', 'lte', 'eq', 'range', 'qualitative')),
  target_lower_bound numeric(30,10),
  target_upper_bound numeric(30,10),

  -- How often attainment is assessed. Distinct from the metric's own
  -- review_frequency: the CEO and the CSFO are both measured on fixed-cost
  -- coverage ratio, and a role may be assessed on a different beat than the
  -- metric is refreshed.
  measured_cadence text NOT NULL
    CHECK (measured_cadence IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),

  -- Basis points, not percent, so weights are exact integers and the sum test
  -- is not subject to floating point. 2500 = 25%.
  weight_bp integer NOT NULL CHECK (weight_bp BETWEEN 0 AND 10000),

  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,

  assigned_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  -- Why this person is measured on this. An assignment nobody can explain is
  -- one nobody will remove when it stops being true.
  note text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT performance_kpi_assignments_effective_range
    CHECK (effective_to IS NULL OR effective_to >= effective_from),

  -- Exactly the subject the type names, and nothing else.
  CONSTRAINT performance_kpi_assignments_subject_shape CHECK (
    (subject_type = 'employee'   AND employee_id IS NOT NULL AND department IS NULL     AND role_id IS NULL) OR
    (subject_type = 'department' AND department  IS NOT NULL AND employee_id IS NULL    AND role_id IS NULL) OR
    (subject_type = 'role'       AND role_id     IS NOT NULL AND employee_id IS NULL    AND department IS NULL)
  ),

  -- Bounds belong to range targets and nowhere else.
  CONSTRAINT performance_kpi_assignments_range_bounds CHECK (
    (target_comparator = 'range'
      AND target_lower_bound IS NOT NULL
      AND target_upper_bound IS NOT NULL
      AND target_upper_bound > target_lower_bound)
    OR
    (target_comparator <> 'range'
      AND target_lower_bound IS NULL
      AND target_upper_bound IS NULL)
  ),

  -- A comparator other than 'qualitative' promises a number to compare against.
  CONSTRAINT performance_kpi_assignments_comparable_target CHECK (
    target_comparator IN ('qualitative', 'range') OR target_value IS NOT NULL
  ),

  -- One active assignment per subject per metric per effective_from. Re-basing
  -- a target opens a new dated row; it does not overwrite history, because the
  -- quarterly review reads the target that was in force at the time.
  CONSTRAINT performance_kpi_assignments_subject_metric_key
    UNIQUE (organization_key, subject_identity, metric_definition_id, effective_from)
);

CREATE INDEX IF NOT EXISTS performance_kpi_assignments_subject_idx
  ON public.performance_kpi_assignments (organization_key, subject_identity)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS performance_kpi_assignments_metric_idx
  ON public.performance_kpi_assignments (metric_definition_id);

CREATE INDEX IF NOT EXISTS performance_kpi_assignments_employee_idx
  ON public.performance_kpi_assignments (employee_id)
  WHERE employee_id IS NOT NULL AND is_active;

DROP TRIGGER IF EXISTS trg_performance_kpi_assignments_updated_at
  ON public.performance_kpi_assignments;
CREATE TRIGGER trg_performance_kpi_assignments_updated_at
  BEFORE UPDATE ON public.performance_kpi_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- The weight invariant
-- ---------------------------------------------------------------------------
--
-- "Weights add up to 100% and produce the KPI score used in reviews."
--
-- This is enforced in the database rather than in a form because the number it
-- protects is a person's performance score. All nine role KPI sets in the
-- source spec sum to exactly 100%, so this is a property the business already
-- holds, not one being imposed on it.
--
-- The trigger is DEFERRABLE INITIALLY DEFERRED: a KPI set is written as several
-- rows in one transaction and is only required to balance at COMMIT. Checking
-- per statement would make it impossible to insert the first row of any set.

CREATE OR REPLACE FUNCTION public.performance_kpi_assignments_check_weights()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_subject text;
  v_org text;
  v_from date;
  v_total integer;
BEGIN
  v_subject := COALESCE(NEW.subject_identity, OLD.subject_identity);
  v_org     := COALESCE(NEW.organization_key, OLD.organization_key);
  v_from    := COALESCE(NEW.effective_from, OLD.effective_from);

  -- Sum the set that is in force alongside the touched row: same subject, still
  -- active, and effective on the touched row's start date.
  SELECT COALESCE(sum(weight_bp), 0)
    INTO v_total
    FROM public.performance_kpi_assignments
   WHERE organization_key = v_org
     AND subject_identity = v_subject
     AND is_active
     AND effective_from <= v_from
     AND (effective_to IS NULL OR effective_to >= v_from);

  -- An empty set is allowed: retiring a whole KPI set is legitimate, and a
  -- subject with no KPIs is simply not measured yet.
  IF v_total <> 0 AND v_total <> 10000 THEN
    RAISE EXCEPTION
      'KPI weights for % must sum to 100%% on %, found % bp (expected 10000)',
      v_subject, v_from, v_total
      USING ERRCODE = 'check_violation',
            HINT = 'Weights are basis points. Adjust the set so weight_bp totals 10000.';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.performance_kpi_assignments_check_weights()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_performance_kpi_assignments_weights
  ON public.performance_kpi_assignments;
CREATE CONSTRAINT TRIGGER trg_performance_kpi_assignments_weights
  AFTER INSERT OR UPDATE OR DELETE ON public.performance_kpi_assignments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.performance_kpi_assignments_check_weights();

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
-- RLS on, no policies, service_role only. Authorization is resolved in server
-- code from the Clerk session, consistent with every other module added in the
-- 2026-08-02 wave. An employee sees their own numbers and no one else's; that
-- scoping is a server concern, not a policy here.

ALTER TABLE public.performance_kpi_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.performance_kpi_assignments FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.performance_kpi_assignments TO service_role;

COMMENT ON TABLE public.performance_kpi_assignments IS
  'Binds a growth_metric_definitions metric to an employee, department or role with a weight and a target for a period. Weights per subject sum to 100% (10000 bp), enforced by a deferred constraint trigger. Source: OF-ENG-RPT-006 per-role KPI tables.';

COMMENT ON COLUMN public.performance_kpi_assignments.weight_bp IS
  'Basis points. 2500 = 25%. Integer so the sum-to-100% test is exact.';

COMMENT ON COLUMN public.performance_kpi_assignments.target_label IS
  'The target as written in the spec and shown to the employee. Verbatim, because real targets are often compound or time-phased.';

COMMENT ON COLUMN public.performance_kpi_assignments.target_value IS
  'Machine-comparable target, when one exists. NULL means attainment must be assessed by a human rather than computed.';
