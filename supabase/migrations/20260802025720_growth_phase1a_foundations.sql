-- Growth & Revenue Operations Phase 1A — canonical foundations only.
--
-- Compatibility strategy: new canonical tables live alongside the nine legacy
-- Growth Tracker tables. This migration does not rename, delete, backfill, or
-- dual-write legacy rows.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.growth_business_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_key text NOT NULL DEFAULT 'opusfesta'
    CHECK (organization_key = lower(btrim(organization_key)) AND organization_key ~ '^[a-z0-9_]{2,80}$'),
  code text NOT NULL
    CHECK (code = upper(btrim(code)) AND code ~ '^[A-Z0-9_]{2,40}$'),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text NOT NULL DEFAULT '',
  default_currency_code text NOT NULL DEFAULT 'TZS'
    CHECK (default_currency_code = upper(btrim(default_currency_code)) AND default_currency_code ~ '^[A-Z]{3}$'),
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT growth_business_units_archived_inactive CHECK (archived_at IS NULL OR is_active = false),
  CONSTRAINT growth_business_units_org_code_key UNIQUE (organization_key, code)
);

CREATE TABLE IF NOT EXISTS public.growth_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_key text NOT NULL DEFAULT 'opusfesta'
    CHECK (organization_key = lower(btrim(organization_key)) AND organization_key ~ '^[a-z0-9_]{2,80}$'),
  period_type text NOT NULL CHECK (period_type IN ('month', 'quarter', 'year')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  label text NOT NULL CHECK (length(btrim(label)) > 0),
  fiscal_year integer NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 2100),
  fiscal_quarter integer CHECK (fiscal_quarter BETWEEN 1 AND 4),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT growth_periods_valid_range CHECK (start_date < end_date),
  CONSTRAINT growth_periods_month_boundary CHECK (
    period_type <> 'month'
    OR (
      date_trunc('month', start_date::timestamp)::date = start_date
      AND end_date = (start_date + interval '1 month')::date
      AND fiscal_quarter IS NULL
    )
  ),
  CONSTRAINT growth_periods_quarter_boundary CHECK (
    period_type <> 'quarter'
    OR (
      extract(month FROM start_date)::int IN (1, 4, 7, 10)
      AND extract(day FROM start_date)::int = 1
      AND end_date = (start_date + interval '3 months')::date
      AND fiscal_quarter = (((extract(month FROM start_date)::int - 1) / 3)::int + 1)
    )
  ),
  CONSTRAINT growth_periods_year_boundary CHECK (
    period_type <> 'year'
    OR (
      extract(month FROM start_date)::int = 1
      AND extract(day FROM start_date)::int = 1
      AND end_date = (start_date + interval '1 year')::date
      AND fiscal_quarter IS NULL
    )
  ),
  CONSTRAINT growth_periods_org_type_boundary_key UNIQUE (organization_key, period_type, start_date, end_date)
);

CREATE TABLE IF NOT EXISTS public.growth_metric_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_key text NOT NULL DEFAULT 'opusfesta'
    CHECK (organization_key = lower(btrim(organization_key)) AND organization_key ~ '^[a-z0-9_]{2,80}$'),
  code text NOT NULL
    CHECK (code = upper(btrim(code)) AND code ~ '^[A-Z0-9_]{2,80}$'),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text NOT NULL DEFAULT '',
  business_unit_id uuid REFERENCES public.growth_business_units(id) ON DELETE RESTRICT,
  department text CHECK (department IN (
    'Technology',
    'Marketing & Partnership',
    'Content, Brand and Social Media',
    'Finance & Accountings',
    'UI & UX Design',
    'Operations',
    'Studio',
    'Founders',
    'HR'
  )),
  owner_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  measurement_unit text NOT NULL CHECK (measurement_unit IN ('count', 'currency', 'percentage', 'decimal', 'days', 'hours', 'score', 'ratio')),
  source_mode text NOT NULL CHECK (source_mode IN ('calculated', 'manual', 'hybrid')),
  direction text NOT NULL CHECK (direction IN ('higher_is_better', 'lower_is_better', 'target_range', 'informational')),
  aggregation_method text NOT NULL CHECK (aggregation_method IN ('sum', 'average', 'weighted_average', 'latest', 'minimum', 'maximum', 'ratio', 'percentage', 'formula')),
  value_type text NOT NULL DEFAULT 'decimal' CHECK (value_type IN ('integer', 'decimal', 'currency', 'percentage', 'duration', 'score', 'ratio')),
  default_currency_code text
    CHECK (default_currency_code IS NULL OR (default_currency_code = upper(btrim(default_currency_code)) AND default_currency_code ~ '^[A-Z]{3}$')),
  calculation_key text
    CHECK (calculation_key IS NULL OR calculation_key ~ '^[a-z][a-z0-9_.-]{1,120}$'),
  declarative_formula_config jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(declarative_formula_config) = 'object'),
  data_source_key text
    CHECK (data_source_key IS NULL OR data_source_key ~ '^[a-z][a-z0-9_.-]{1,120}$'),
  review_frequency text NOT NULL DEFAULT 'monthly'
    CHECK (review_frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'ad_hoc')),
  evidence_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  lock_version integer NOT NULL DEFAULT 1 CHECK (lock_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT growth_metric_definitions_org_code_key UNIQUE (organization_key, code),
  CONSTRAINT growth_metric_definitions_formula_key CHECK (
    aggregation_method <> 'formula' OR calculation_key IS NOT NULL
  ),
  CONSTRAINT growth_metric_definitions_non_executable_formula CHECK (
    NOT (declarative_formula_config ?| ARRAY['sql', 'javascript', 'js', 'code', 'expression', 'template'])
  ),
  CONSTRAINT growth_metric_definitions_calculated_source CHECK (
    source_mode = 'manual' OR calculation_key IS NOT NULL OR data_source_key IS NOT NULL
  ),
  CONSTRAINT growth_metric_definitions_archived_inactive CHECK (archived_at IS NULL OR is_active = false)
);

CREATE TABLE IF NOT EXISTS public.growth_metric_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_key text NOT NULL DEFAULT 'opusfesta'
    CHECK (organization_key = lower(btrim(organization_key)) AND organization_key ~ '^[a-z0-9_]{2,80}$'),
  metric_definition_id uuid NOT NULL REFERENCES public.growth_metric_definitions(id) ON DELETE RESTRICT,
  period_id uuid NOT NULL REFERENCES public.growth_periods(id) ON DELETE RESTRICT,
  business_unit_id uuid REFERENCES public.growth_business_units(id) ON DELETE RESTRICT,
  department text CHECK (department IN (
    'Technology',
    'Marketing & Partnership',
    'Content, Brand and Social Media',
    'Finance & Accountings',
    'UI & UX Design',
    'Operations',
    'Studio',
    'Founders',
    'HR'
  )),
  employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  scope_identity text GENERATED ALWAYS AS (
    'bu=' || COALESCE(business_unit_id::text, 'org') ||
    '|dept=' || COALESCE(department, 'org') ||
    '|emp=' || COALESCE(employee_id::text, 'org')
  ) STORED,
  target_value numeric(30,10),
  lower_bound numeric(30,10),
  upper_bound numeric(30,10),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'superseded', 'archived')),
  is_current boolean NOT NULL DEFAULT false,
  owner_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  submitted_by_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  approved_by_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  approved_at timestamptz,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  revision_number integer NOT NULL DEFAULT 1 CHECK (revision_number >= 1),
  revision_reason text,
  supersedes_target_id uuid REFERENCES public.growth_metric_targets(id) ON DELETE RESTRICT,
  superseded_by_target_id uuid REFERENCES public.growth_metric_targets(id) ON DELETE RESTRICT,
  superseded_at timestamptz,
  lock_version integer NOT NULL DEFAULT 1 CHECK (lock_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT growth_metric_targets_effective_range CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT growth_metric_targets_current_status CHECK (is_current = false OR (status = 'approved' AND archived_at IS NULL)),
  CONSTRAINT growth_metric_targets_archived_current CHECK (archived_at IS NULL OR is_current = false),
  CONSTRAINT growth_metric_targets_no_self_supersede CHECK (supersedes_target_id IS NULL OR supersedes_target_id <> id)
);

CREATE UNIQUE INDEX IF NOT EXISTS growth_metric_targets_current_approved_scope_idx
  ON public.growth_metric_targets (metric_definition_id, period_id, scope_identity)
  WHERE is_current = true AND status = 'approved' AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.growth_metric_actuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_key text NOT NULL DEFAULT 'opusfesta'
    CHECK (organization_key = lower(btrim(organization_key)) AND organization_key ~ '^[a-z0-9_]{2,80}$'),
  metric_definition_id uuid NOT NULL REFERENCES public.growth_metric_definitions(id) ON DELETE RESTRICT,
  period_id uuid NOT NULL REFERENCES public.growth_periods(id) ON DELETE RESTRICT,
  as_of_date date NOT NULL,
  business_unit_id uuid REFERENCES public.growth_business_units(id) ON DELETE RESTRICT,
  department text CHECK (department IN (
    'Technology',
    'Marketing & Partnership',
    'Content, Brand and Social Media',
    'Finance & Accountings',
    'UI & UX Design',
    'Operations',
    'Studio',
    'Founders',
    'HR'
  )),
  employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  scope_identity text GENERATED ALWAYS AS (
    'bu=' || COALESCE(business_unit_id::text, 'org') ||
    '|dept=' || COALESCE(department, 'org') ||
    '|emp=' || COALESCE(employee_id::text, 'org')
  ) STORED,
  value numeric(30,10) NOT NULL,
  origin_type text NOT NULL CHECK (origin_type IN ('calculated', 'manual_entry', 'manual_override', 'imported', 'backfilled')),
  source_system text,
  source_entity_type text,
  source_entity_id text,
  calculation_version text,
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
  calculated_at timestamptz,
  entered_by_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  override_reason text,
  supersedes_actual_id uuid REFERENCES public.growth_metric_actuals(id) ON DELETE RESTRICT,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT growth_metric_actuals_calculated_identity CHECK (
    origin_type <> 'calculated' OR (source_system IS NOT NULL AND calculation_version IS NOT NULL AND calculated_at IS NOT NULL)
  ),
  CONSTRAINT growth_metric_actuals_imported_identity CHECK (
    origin_type <> 'imported' OR source_system IS NOT NULL
  ),
  CONSTRAINT growth_metric_actuals_manual_actor CHECK (
    origin_type NOT IN ('manual_entry', 'manual_override') OR entered_by_employee_id IS NOT NULL
  ),
  CONSTRAINT growth_metric_actuals_override_reason CHECK (
    origin_type <> 'manual_override'
    OR (supersedes_actual_id IS NOT NULL AND length(btrim(COALESCE(override_reason, ''))) >= 8)
  ),
  CONSTRAINT growth_metric_actuals_no_self_supersede CHECK (supersedes_actual_id IS NULL OR supersedes_actual_id <> id)
);

CREATE UNIQUE INDEX IF NOT EXISTS growth_metric_actuals_current_identity_idx
  ON public.growth_metric_actuals (
    metric_definition_id,
    period_id,
    as_of_date,
    scope_identity,
    origin_type,
    idempotency_key
  )
  WHERE is_current = true;

CREATE TABLE IF NOT EXISTS public.growth_metric_target_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL REFERENCES public.growth_metric_targets(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('created', 'submitted', 'approved', 'rejected', 'revised', 'superseded', 'archived')),
  actor_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  old_status text,
  new_status text,
  change_summary text NOT NULL DEFAULT '',
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT growth_metric_target_events_status_values CHECK (
    (old_status IS NULL OR old_status IN ('draft', 'pending_approval', 'approved', 'rejected', 'superseded', 'archived'))
    AND (new_status IS NULL OR new_status IN ('draft', 'pending_approval', 'approved', 'rejected', 'superseded', 'archived'))
  )
);

CREATE INDEX IF NOT EXISTS idx_growth_business_units_active
  ON public.growth_business_units (organization_key, display_order, name)
  WHERE is_active = true AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_growth_periods_status
  ON public.growth_periods (organization_key, status, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_growth_metric_definitions_scope
  ON public.growth_metric_definitions (organization_key, business_unit_id, department, is_active);
CREATE INDEX IF NOT EXISTS idx_growth_metric_targets_metric_period
  ON public.growth_metric_targets (metric_definition_id, period_id, status);
CREATE INDEX IF NOT EXISTS idx_growth_metric_actuals_metric_period
  ON public.growth_metric_actuals (metric_definition_id, period_id, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_growth_metric_target_events_target
  ON public.growth_metric_target_events (target_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_growth_business_units_updated_at ON public.growth_business_units;
CREATE TRIGGER trg_growth_business_units_updated_at
  BEFORE UPDATE ON public.growth_business_units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_growth_periods_updated_at ON public.growth_periods;
CREATE TRIGGER trg_growth_periods_updated_at
  BEFORE UPDATE ON public.growth_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_growth_metric_definitions_updated_at ON public.growth_metric_definitions;
CREATE TRIGGER trg_growth_metric_definitions_updated_at
  BEFORE UPDATE ON public.growth_metric_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_growth_metric_targets_updated_at ON public.growth_metric_targets;
CREATE TRIGGER trg_growth_metric_targets_updated_at
  BEFORE UPDATE ON public.growth_metric_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_growth_metric_actuals_updated_at ON public.growth_metric_actuals;
CREATE TRIGGER trg_growth_metric_actuals_updated_at
  BEFORE UPDATE ON public.growth_metric_actuals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.growth_validate_business_unit_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.code IS DISTINCT FROM NEW.code THEN
    IF EXISTS (SELECT 1 FROM public.growth_metric_definitions WHERE business_unit_id = OLD.id LIMIT 1)
      OR EXISTS (SELECT 1 FROM public.growth_metric_targets WHERE business_unit_id = OLD.id LIMIT 1)
      OR EXISTS (SELECT 1 FROM public.growth_metric_actuals WHERE business_unit_id = OLD.id LIMIT 1)
    THEN
      RAISE EXCEPTION 'Referenced Growth business unit codes cannot be changed';
    END IF;
  END IF;
  IF NEW.archived_at IS NOT NULL THEN
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_growth_business_units_validate_update ON public.growth_business_units;
CREATE TRIGGER trg_growth_business_units_validate_update
  BEFORE UPDATE ON public.growth_business_units
  FOR EACH ROW EXECUTE FUNCTION public.growth_validate_business_unit_update();

CREATE OR REPLACE FUNCTION public.growth_validate_metric_definition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_unit public.growth_business_units%ROWTYPE;
  v_owner public.workforce_employees%ROWTYPE;
BEGIN
  IF NEW.business_unit_id IS NOT NULL THEN
    SELECT * INTO v_unit FROM public.growth_business_units WHERE id = NEW.business_unit_id;
    IF NOT FOUND OR v_unit.organization_key <> NEW.organization_key OR v_unit.archived_at IS NOT NULL OR v_unit.is_active = false THEN
      RAISE EXCEPTION 'Growth metric definition requires an active business unit in the same organization';
    END IF;
  END IF;

  IF NEW.owner_employee_id IS NOT NULL THEN
    SELECT * INTO v_owner FROM public.workforce_employees WHERE id = NEW.owner_employee_id;
    IF NOT FOUND OR v_owner.status = 'Resigned' THEN
      RAISE EXCEPTION 'Growth metric owner must be an active workforce employee';
    END IF;
    IF NEW.department IS NOT NULL AND v_owner.department <> NEW.department THEN
      RAISE EXCEPTION 'Growth metric owner must belong to the selected department';
    END IF;
  END IF;

  IF NEW.archived_at IS NOT NULL THEN
    NEW.is_active := false;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.lock_version := OLD.lock_version + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_growth_metric_definitions_validate ON public.growth_metric_definitions;
CREATE TRIGGER trg_growth_metric_definitions_validate
  BEFORE INSERT OR UPDATE ON public.growth_metric_definitions
  FOR EACH ROW EXECUTE FUNCTION public.growth_validate_metric_definition();

CREATE OR REPLACE FUNCTION public.growth_validate_metric_target()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_metric public.growth_metric_definitions%ROWTYPE;
  v_period public.growth_periods%ROWTYPE;
  v_unit public.growth_business_units%ROWTYPE;
  v_employee public.workforce_employees%ROWTYPE;
BEGIN
  SELECT * INTO v_metric FROM public.growth_metric_definitions WHERE id = NEW.metric_definition_id;
  IF NOT FOUND OR v_metric.organization_key <> NEW.organization_key OR v_metric.archived_at IS NOT NULL OR v_metric.is_active = false THEN
    RAISE EXCEPTION 'Growth target requires an active metric definition in the same organization';
  END IF;

  SELECT * INTO v_period FROM public.growth_periods WHERE id = NEW.period_id;
  IF NOT FOUND OR v_period.organization_key <> NEW.organization_key THEN
    RAISE EXCEPTION 'Growth target requires a period in the same organization';
  END IF;
  IF v_period.status <> 'open' AND NEW.status IN ('draft', 'pending_approval', 'approved') THEN
    RAISE EXCEPTION 'Growth targets cannot be created or approved in locked or closed periods';
  END IF;

  IF v_metric.direction = 'target_range' THEN
    IF NEW.lower_bound IS NULL OR NEW.upper_bound IS NULL OR NEW.lower_bound > NEW.upper_bound THEN
      RAISE EXCEPTION 'Target-range metrics require valid lower and upper bounds';
    END IF;
  ELSIF NEW.target_value IS NULL THEN
    RAISE EXCEPTION 'Non-range Growth targets require a target value';
  END IF;

  IF v_metric.business_unit_id IS NOT NULL THEN
    IF NEW.business_unit_id IS DISTINCT FROM v_metric.business_unit_id THEN
      RAISE EXCEPTION 'Business-unit-owned Growth metrics cannot receive targets for another business unit';
    END IF;
  END IF;

  IF NEW.business_unit_id IS NOT NULL THEN
    SELECT * INTO v_unit FROM public.growth_business_units WHERE id = NEW.business_unit_id;
    IF NOT FOUND OR v_unit.organization_key <> NEW.organization_key OR v_unit.archived_at IS NOT NULL OR v_unit.is_active = false THEN
      RAISE EXCEPTION 'Growth target requires an active business unit in the same organization';
    END IF;
  END IF;

  IF NEW.employee_id IS NOT NULL THEN
    SELECT * INTO v_employee FROM public.workforce_employees WHERE id = NEW.employee_id;
    IF NOT FOUND OR v_employee.status = 'Resigned' THEN
      RAISE EXCEPTION 'Growth target employee scope must be an active workforce employee';
    END IF;
    IF NEW.department IS NOT NULL AND v_employee.department <> NEW.department THEN
      RAISE EXCEPTION 'Growth target employee must belong to the selected department';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'approved' AND current_setting('growth.allow_target_lifecycle', true) <> 'on' THEN
      IF OLD.metric_definition_id IS DISTINCT FROM NEW.metric_definition_id
        OR OLD.period_id IS DISTINCT FROM NEW.period_id
        OR OLD.business_unit_id IS DISTINCT FROM NEW.business_unit_id
        OR OLD.department IS DISTINCT FROM NEW.department
        OR OLD.employee_id IS DISTINCT FROM NEW.employee_id
        OR OLD.target_value IS DISTINCT FROM NEW.target_value
        OR OLD.lower_bound IS DISTINCT FROM NEW.lower_bound
        OR OLD.upper_bound IS DISTINCT FROM NEW.upper_bound
        OR OLD.owner_employee_id IS DISTINCT FROM NEW.owner_employee_id
        OR OLD.effective_from IS DISTINCT FROM NEW.effective_from
        OR OLD.effective_to IS DISTINCT FROM NEW.effective_to
        OR OLD.revision_number IS DISTINCT FROM NEW.revision_number
        OR OLD.revision_reason IS DISTINCT FROM NEW.revision_reason
        OR OLD.status IS DISTINCT FROM NEW.status
        OR OLD.is_current IS DISTINCT FROM NEW.is_current
        OR OLD.supersedes_target_id IS DISTINCT FROM NEW.supersedes_target_id
        OR OLD.superseded_by_target_id IS DISTINCT FROM NEW.superseded_by_target_id
        OR OLD.superseded_at IS DISTINCT FROM NEW.superseded_at
      THEN
        RAISE EXCEPTION 'Approved Growth targets are immutable; create a revision instead';
      END IF;
    END IF;
    NEW.lock_version := OLD.lock_version + 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_growth_metric_targets_validate ON public.growth_metric_targets;
CREATE TRIGGER trg_growth_metric_targets_validate
  BEFORE INSERT OR UPDATE ON public.growth_metric_targets
  FOR EACH ROW EXECUTE FUNCTION public.growth_validate_metric_target();

CREATE OR REPLACE FUNCTION public.growth_validate_metric_actual()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_metric public.growth_metric_definitions%ROWTYPE;
  v_period public.growth_periods%ROWTYPE;
  v_unit public.growth_business_units%ROWTYPE;
  v_employee public.workforce_employees%ROWTYPE;
BEGIN
  SELECT * INTO v_metric FROM public.growth_metric_definitions WHERE id = NEW.metric_definition_id;
  IF NOT FOUND OR v_metric.organization_key <> NEW.organization_key OR v_metric.archived_at IS NOT NULL OR v_metric.is_active = false THEN
    RAISE EXCEPTION 'Growth actual requires an active metric definition in the same organization';
  END IF;

  SELECT * INTO v_period FROM public.growth_periods WHERE id = NEW.period_id;
  IF NOT FOUND OR v_period.organization_key <> NEW.organization_key THEN
    RAISE EXCEPTION 'Growth actual requires a period in the same organization';
  END IF;
  IF v_period.status <> 'open' AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Growth actuals cannot be created in locked or closed periods';
  END IF;

  IF NEW.as_of_date < v_period.start_date OR NEW.as_of_date >= v_period.end_date THEN
    RAISE EXCEPTION 'Growth actual as-of date must be inside the half-open period';
  END IF;

  IF v_metric.business_unit_id IS NOT NULL THEN
    IF NEW.business_unit_id IS DISTINCT FROM v_metric.business_unit_id THEN
      RAISE EXCEPTION 'Business-unit-owned Growth metrics cannot receive actuals for another business unit';
    END IF;
  END IF;

  IF NEW.origin_type = 'manual_entry' AND v_metric.source_mode NOT IN ('manual', 'hybrid') THEN
    RAISE EXCEPTION 'Manual actual entry is allowed only for manual or hybrid Growth metrics';
  END IF;

  IF NEW.business_unit_id IS NOT NULL THEN
    SELECT * INTO v_unit FROM public.growth_business_units WHERE id = NEW.business_unit_id;
    IF NOT FOUND OR v_unit.organization_key <> NEW.organization_key OR v_unit.archived_at IS NOT NULL OR v_unit.is_active = false THEN
      RAISE EXCEPTION 'Growth actual requires an active business unit in the same organization';
    END IF;
  END IF;

  IF NEW.employee_id IS NOT NULL THEN
    SELECT * INTO v_employee FROM public.workforce_employees WHERE id = NEW.employee_id;
    IF NOT FOUND OR v_employee.status = 'Resigned' THEN
      RAISE EXCEPTION 'Growth actual employee scope must be an active workforce employee';
    END IF;
    IF NEW.department IS NOT NULL AND v_employee.department <> NEW.department THEN
      RAISE EXCEPTION 'Growth actual employee must belong to the selected department';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_growth_metric_actuals_validate ON public.growth_metric_actuals;
CREATE TRIGGER trg_growth_metric_actuals_validate
  BEFORE INSERT OR UPDATE ON public.growth_metric_actuals
  FOR EACH ROW EXECUTE FUNCTION public.growth_validate_metric_actual();

CREATE OR REPLACE FUNCTION public.growth_target_event_write(
  p_target_id uuid,
  p_event_type text,
  p_actor_employee_id uuid,
  p_old_status text,
  p_new_status text,
  p_change_summary text,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  INSERT INTO public.growth_metric_target_events (
    target_id,
    event_type,
    actor_employee_id,
    old_status,
    new_status,
    change_summary,
    reason
  )
  VALUES (
    p_target_id,
    p_event_type,
    p_actor_employee_id,
    p_old_status,
    p_new_status,
    left(COALESCE(p_change_summary, ''), 1000),
    NULLIF(left(COALESCE(p_reason, ''), 1000), '')
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.growth_metric_target_submit(
  p_target_id uuid,
  p_actor_employee_id uuid,
  p_expected_lock_version integer,
  p_reason text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_target public.growth_metric_targets%ROWTYPE;
BEGIN
  SELECT * INTO v_target
  FROM public.growth_metric_targets
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF v_target.lock_version <> p_expected_lock_version THEN
    RETURN 'stale';
  END IF;
  IF v_target.status <> 'draft' OR v_target.archived_at IS NOT NULL THEN
    RETURN 'invalid_status';
  END IF;

  UPDATE public.growth_metric_targets
     SET status = 'pending_approval',
         submitted_by_employee_id = p_actor_employee_id,
         submitted_at = now()
   WHERE id = p_target_id;

  PERFORM public.growth_target_event_write(p_target_id, 'submitted', p_actor_employee_id, 'draft', 'pending_approval', 'Target submitted for approval', p_reason);
  INSERT INTO public.audit_log (event_type, severity, message, target_resource, metadata)
  VALUES ('growth.target_submitted', 'info', 'Growth target submitted', 'growth_metric_targets:' || p_target_id::text, jsonb_build_object('target_id', p_target_id));

  RETURN 'submitted';
END;
$$;

CREATE OR REPLACE FUNCTION public.growth_metric_target_reject(
  p_target_id uuid,
  p_actor_employee_id uuid,
  p_expected_lock_version integer,
  p_reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_target public.growth_metric_targets%ROWTYPE;
BEGIN
  IF length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RETURN 'missing_reason';
  END IF;

  SELECT * INTO v_target
  FROM public.growth_metric_targets
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF v_target.lock_version <> p_expected_lock_version THEN
    RETURN 'stale';
  END IF;
  IF v_target.status <> 'pending_approval' OR v_target.archived_at IS NOT NULL THEN
    RETURN 'invalid_status';
  END IF;

  UPDATE public.growth_metric_targets
     SET status = 'rejected',
         approved_by_employee_id = p_actor_employee_id,
         approved_at = now(),
         is_current = false
   WHERE id = p_target_id;

  PERFORM public.growth_target_event_write(p_target_id, 'rejected', p_actor_employee_id, 'pending_approval', 'rejected', 'Target rejected', p_reason);
  INSERT INTO public.audit_log (event_type, severity, message, target_resource, metadata)
  VALUES ('growth.target_rejected', 'info', 'Growth target rejected', 'growth_metric_targets:' || p_target_id::text, jsonb_build_object('target_id', p_target_id));

  RETURN 'rejected';
END;
$$;

CREATE OR REPLACE FUNCTION public.growth_metric_target_approve(
  p_target_id uuid,
  p_actor_employee_id uuid,
  p_expected_lock_version integer,
  p_reason text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_target public.growth_metric_targets%ROWTYPE;
  v_previous public.growth_metric_targets%ROWTYPE;
BEGIN
  PERFORM set_config('growth.allow_target_lifecycle', 'on', true);

  SELECT * INTO v_target
  FROM public.growth_metric_targets
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF v_target.lock_version <> p_expected_lock_version THEN
    RETURN 'stale';
  END IF;
  IF v_target.status <> 'pending_approval' OR v_target.archived_at IS NOT NULL THEN
    RETURN 'invalid_status';
  END IF;

  SELECT * INTO v_previous
  FROM public.growth_metric_targets
  WHERE metric_definition_id = v_target.metric_definition_id
    AND period_id = v_target.period_id
    AND scope_identity = v_target.scope_identity
    AND is_current = true
    AND status = 'approved'
    AND archived_at IS NULL
    AND id <> p_target_id
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.growth_metric_targets
       SET status = 'superseded',
           is_current = false,
           effective_to = CURRENT_DATE,
           superseded_by_target_id = p_target_id,
           superseded_at = now()
     WHERE id = v_previous.id;
    PERFORM public.growth_target_event_write(v_previous.id, 'superseded', p_actor_employee_id, 'approved', 'superseded', 'Target superseded by approved revision', p_reason);
  END IF;

  UPDATE public.growth_metric_targets
     SET status = 'approved',
         is_current = true,
         approved_by_employee_id = p_actor_employee_id,
         approved_at = now()
   WHERE id = p_target_id;

  PERFORM public.growth_target_event_write(p_target_id, 'approved', p_actor_employee_id, 'pending_approval', 'approved', 'Target approved', p_reason);
  INSERT INTO public.audit_log (event_type, severity, message, target_resource, metadata)
  VALUES ('growth.target_approved', 'info', 'Growth target approved', 'growth_metric_targets:' || p_target_id::text, jsonb_build_object('target_id', p_target_id));

  RETURN 'approved';
END;
$$;

CREATE OR REPLACE FUNCTION public.growth_metric_target_create_revision(
  p_target_id uuid,
  p_actor_employee_id uuid,
  p_revision_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_target public.growth_metric_targets%ROWTYPE;
  v_revision_id uuid;
BEGIN
  IF length(btrim(COALESCE(p_revision_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Growth target revisions require a reason';
  END IF;

  SELECT * INTO v_target
  FROM public.growth_metric_targets
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Growth target not found';
  END IF;
  IF v_target.status <> 'approved' OR v_target.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Only approved Growth targets can be revised';
  END IF;

  INSERT INTO public.growth_metric_targets (
    organization_key,
    metric_definition_id,
    period_id,
    business_unit_id,
    department,
    employee_id,
    target_value,
    lower_bound,
    upper_bound,
    status,
    is_current,
    owner_employee_id,
    effective_from,
    revision_number,
    revision_reason,
    supersedes_target_id
  )
  VALUES (
    v_target.organization_key,
    v_target.metric_definition_id,
    v_target.period_id,
    v_target.business_unit_id,
    v_target.department,
    v_target.employee_id,
    v_target.target_value,
    v_target.lower_bound,
    v_target.upper_bound,
    'draft',
    false,
    v_target.owner_employee_id,
    CURRENT_DATE,
    v_target.revision_number + 1,
    left(p_revision_reason, 1000),
    p_target_id
  )
  RETURNING id INTO v_revision_id;

  PERFORM public.growth_target_event_write(v_revision_id, 'revised', p_actor_employee_id, v_target.status, 'draft', 'Draft revision created from approved target', p_revision_reason);
  INSERT INTO public.audit_log (event_type, severity, message, target_resource, metadata)
  VALUES ('growth.target_revision_created', 'info', 'Growth target revision created', 'growth_metric_targets:' || v_revision_id::text, jsonb_build_object('target_id', p_target_id, 'revision_id', v_revision_id));

  RETURN v_revision_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.growth_metric_target_archive(
  p_target_id uuid,
  p_actor_employee_id uuid,
  p_expected_lock_version integer,
  p_reason text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_target public.growth_metric_targets%ROWTYPE;
BEGIN
  PERFORM set_config('growth.allow_target_lifecycle', 'on', true);

  SELECT * INTO v_target
  FROM public.growth_metric_targets
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF v_target.lock_version <> p_expected_lock_version THEN
    RETURN 'stale';
  END IF;
  IF v_target.archived_at IS NOT NULL THEN
    RETURN 'archived';
  END IF;

  UPDATE public.growth_metric_targets
     SET status = 'archived',
         is_current = false,
         archived_at = now(),
         effective_to = COALESCE(effective_to, CURRENT_DATE)
   WHERE id = p_target_id;

  PERFORM public.growth_target_event_write(p_target_id, 'archived', p_actor_employee_id, v_target.status, 'archived', 'Target archived', p_reason);
  INSERT INTO public.audit_log (event_type, severity, message, target_resource, metadata)
  VALUES ('growth.target_archived', 'info', 'Growth target archived', 'growth_metric_targets:' || p_target_id::text, jsonb_build_object('target_id', p_target_id));

  RETURN 'archived';
END;
$$;

CREATE OR REPLACE FUNCTION public.growth_metric_actual_override(
  p_supersedes_actual_id uuid,
  p_value numeric,
  p_reason text,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actual public.growth_metric_actuals%ROWTYPE;
  v_override_id uuid;
BEGIN
  IF p_actor_employee_id IS NULL OR length(btrim(COALESCE(p_reason, ''))) < 8 THEN
    RAISE EXCEPTION 'Growth actual overrides require an actor and reason';
  END IF;

  SELECT * INTO v_actual
  FROM public.growth_metric_actuals
  WHERE id = p_supersedes_actual_id
    AND is_current = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Current Growth actual not found';
  END IF;

  INSERT INTO public.growth_metric_actuals (
    organization_key,
    metric_definition_id,
    period_id,
    as_of_date,
    business_unit_id,
    department,
    employee_id,
    value,
    origin_type,
    source_system,
    idempotency_key,
    entered_by_employee_id,
    override_reason,
    supersedes_actual_id,
    is_current
  )
  VALUES (
    v_actual.organization_key,
    v_actual.metric_definition_id,
    v_actual.period_id,
    v_actual.as_of_date,
    v_actual.business_unit_id,
    v_actual.department,
    v_actual.employee_id,
    p_value,
    'manual_override',
    'manual_override',
    p_idempotency_key,
    p_actor_employee_id,
    left(p_reason, 1000),
    p_supersedes_actual_id,
    true
  )
  RETURNING id INTO v_override_id;

  UPDATE public.growth_metric_actuals
     SET is_current = false
   WHERE id = p_supersedes_actual_id;

  INSERT INTO public.audit_log (event_type, severity, message, target_resource, metadata)
  VALUES ('growth.actual_override', 'warn', 'Growth actual overridden', 'growth_metric_actuals:' || p_supersedes_actual_id::text, jsonb_build_object('actual_id', p_supersedes_actual_id, 'override_id', v_override_id));

  RETURN v_override_id;
END;
$$;

INSERT INTO public.growth_business_units (organization_key, code, name, description, default_currency_code, is_active, display_order)
VALUES
  ('opusfesta', 'OPUSFESTA', 'OpusFesta', 'Core marketplace and planning operations.', 'TZS', true, 10),
  ('opusfesta', 'OPUSPASS', 'OpusPass', 'Guest, ticketing, pledge, and couple-account operations.', 'TZS', true, 20),
  ('opusfesta', 'OPUSSTUDIO', 'OpusStudio', 'Studio production and booking operations.', 'TZS', true, 30)
ON CONFLICT (organization_key, code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    default_currency_code = EXCLUDED.default_currency_code,
    display_order = EXCLUDED.display_order,
    updated_at = now()
WHERE public.growth_business_units.archived_at IS NULL;

CREATE OR REPLACE FUNCTION pg_temp.growth_add_role_keys(p_legacy_key text, p_new_keys text[])
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.workforce_roles
     SET permission_keys = (
       SELECT ARRAY(
         SELECT DISTINCT key
         FROM unnest(COALESCE(permission_keys, '{}'::text[]) || p_new_keys) AS key
         ORDER BY key
       )
     )
   WHERE COALESCE(permission_keys, '{}'::text[]) @> ARRAY[p_legacy_key]::text[];
END;
$$;

SELECT pg_temp.growth_add_role_keys(
  'growth.admin',
  ARRAY[
    'growth.read',
    'growth.kpi.read',
    'growth.kpi.manage',
    'growth.kpi.approve',
    'growth.actual.enter',
    'growth.actual.override',
    'growth.period.manage',
    'growth.settings.manage'
  ]::text[]
);

SELECT pg_temp.growth_add_role_keys(
  'growth.write',
  ARRAY[
    'growth.read',
    'growth.kpi.read',
    'growth.actual.enter'
  ]::text[]
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.workforce_roles
    WHERE COALESCE(permission_keys, '{}'::text[]) @> ARRAY['growth.admin']::text[]
      AND NOT COALESCE(permission_keys, '{}'::text[]) @> ARRAY[
        'growth.read',
        'growth.kpi.read',
        'growth.kpi.manage',
        'growth.kpi.approve',
        'growth.actual.enter',
        'growth.actual.override',
        'growth.period.manage',
        'growth.settings.manage'
      ]::text[]
  ) THEN
    RAISE EXCEPTION 'growth.admin compatibility permission expansion failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.workforce_roles
    WHERE COALESCE(permission_keys, '{}'::text[]) @> ARRAY['growth.write']::text[]
      AND NOT COALESCE(permission_keys, '{}'::text[]) @> ARRAY['growth.admin']::text[]
      AND COALESCE(permission_keys, '{}'::text[]) && ARRAY[
        'growth.kpi.manage',
        'growth.kpi.approve',
        'growth.actual.override',
        'growth.period.manage',
        'growth.settings.manage'
      ]::text[]
  ) THEN
    RAISE EXCEPTION 'growth.write compatibility mapping granted privileged Growth permissions';
  END IF;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'growth_business_units',
    'growth_periods',
    'growth_metric_definitions',
    'growth_metric_targets',
    'growth_metric_actuals',
    'growth_metric_target_events'
  ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO service_role', t);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.growth_target_event_write(uuid, text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.growth_metric_target_submit(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.growth_metric_target_reject(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.growth_metric_target_approve(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.growth_metric_target_create_revision(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.growth_metric_target_archive(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.growth_metric_actual_override(uuid, numeric, text, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.growth_metric_target_submit(uuid, uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.growth_metric_target_reject(uuid, uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.growth_metric_target_approve(uuid, uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.growth_metric_target_create_revision(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.growth_metric_target_archive(uuid, uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.growth_metric_actual_override(uuid, numeric, text, uuid, text) TO service_role;

COMMENT ON TABLE public.growth_business_units IS
  'Growth Phase 1A canonical business units. Seeded with OpusFesta, OpusPass, and OpusStudio; configurable, not enum-backed.';
COMMENT ON TABLE public.growth_periods IS
  'Growth Phase 1A calendar reporting periods using exclusive end dates. Overlap prevention is deferred because the repo has no tested exclusion-constraint convention.';
COMMENT ON TABLE public.growth_metric_definitions IS
  'Growth Phase 1A reusable KPI definitions. Formula support is calculation-key/declarative-config only; no executable SQL or JavaScript.';
COMMENT ON TABLE public.growth_metric_targets IS
  'Growth Phase 1A target versions. Approved rows are immutable except through lifecycle functions; superseded history remains queryable.';
COMMENT ON TABLE public.growth_metric_actuals IS
  'Growth Phase 1A metric actual values. Current values use idempotency keys and preserve superseded/overridden history.';
COMMENT ON TABLE public.growth_metric_target_events IS
  'Growth Phase 1A domain history for target lifecycle changes. Shared audit_log remains the security audit stream.';
