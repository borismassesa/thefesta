-- Custom Card Commission Service — Phase 2 (Produce).
-- Specs: OP-CCS-PRD-001 §7.3, §7.4; OP-CCS-TDD-001 §5.4, §7.1, §7.4.
--
-- Everything here supports the production half of the lifecycle: getting the
-- brief in, getting the work assigned, and getting versions uploaded safely.
--
-- The tables were created back in 20260730100001; this migration adds the
-- machinery around them — private storage, designer row-scoping, the
-- assignment score, and the SLA pause that stops a designer being measured
-- against time the customer controls.

-- ─────────────────────────────────────────────────────────────────────────────
--  Private storage
-- ─────────────────────────────────────────────────────────────────────────────
-- Three buckets, all PRIVATE. There are no public URLs anywhere in this
-- feature, which is the precondition for the whole watermark model: if a
-- preview could be fetched without a signed URL, Gate 2 would be decorative.
--
--   commission-briefs    customer reference material and Lipa Namba screenshots
--   commission-versions  designer SVG uploads and, at settlement, clean masters
--   commission-previews  watermarked previews only
--
-- Split rather than one bucket with prefixes because the access rules genuinely
-- differ: a designer must read briefs but must never read another order's, and
-- nobody outside the server may read versions at all before settlement.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('commission-briefs', 'commission-briefs', false, 15728640,
   ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']),
  ('commission-versions', 'commission-versions', false, 8388608,
   ARRAY['image/svg+xml','image/png']),
  ('commission-previews', 'commission-previews', false, 8388608,
   ARRAY['image/svg+xml','image/png'])
ON CONFLICT (id) DO UPDATE
  SET public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No storage policies are created for anon or authenticated on ANY of these
-- buckets. That is deliberate and is the point: every read goes through a
-- short-lived signed URL minted server-side after an authorisation check, and
-- every write goes through the service-role client. A bucket with no policy
-- denies everyone, which is exactly the posture we want for artwork that is
-- being withheld pending payment.

-- ─────────────────────────────────────────────────────────────────────────────
--  Designer identity and row scoping
-- ─────────────────────────────────────────────────────────────────────────────

-- The caller's workforce_employees.id, or NULL. Used by the designer policies
-- below so a designer's own row-scoping is enforced in the database rather
-- than by remembering to add a WHERE clause in every query (loophole L5).
CREATE OR REPLACE FUNCTION public.current_workforce_employee_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT we.id
  FROM public.workforce_employees we
  WHERE we.clerk_user_id = (auth.jwt() ->> 'sub')
    AND we.dashboard_access = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_workforce_employee_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_workforce_employee_id() TO authenticated, service_role;

-- A designer sees ONLY their own tasks, and only while those tasks are live.
-- Enforced at the row level, not by hiding things in the UI.
DROP POLICY IF EXISTS card_orders_designer_read ON public.card_orders;
CREATE POLICY card_orders_designer_read ON public.card_orders
  FOR SELECT TO authenticated
  USING (
    assigned_designer_id IS NOT NULL
    AND assigned_designer_id = public.current_workforce_employee_id()
    AND status IN ('assigned','in_design','internal_qa','client_review','revision_requested')
  );

-- Designers get the brief for their OWN assigned orders, and nothing else.
-- They never receive guest lists or buyer contact details; those live on other
-- tables entirely, and the API layer projects only the brief fields.
DROP POLICY IF EXISTS order_briefs_designer_read ON public.order_briefs;
CREATE POLICY order_briefs_designer_read ON public.order_briefs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.card_orders o
    WHERE o.id = order_briefs.order_id
      AND o.assigned_designer_id = public.current_workforce_employee_id()
  ));

DROP POLICY IF EXISTS design_versions_designer_read ON public.design_versions;
CREATE POLICY design_versions_designer_read ON public.design_versions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.card_orders o
    WHERE o.id = design_versions.order_id
      AND o.assigned_designer_id = public.current_workforce_employee_id()
  ));

-- ─────────────────────────────────────────────────────────────────────────────
--  Assignment scoring
-- ─────────────────────────────────────────────────────────────────────────────
-- TDD §5.4. Deliberately a database function rather than application code: the
-- sweeper, the admin "assign" button and any future retry all have to agree on
-- who is next, and three implementations of that would drift.

-- How many live tasks a designer is currently holding.
CREATE OR REPLACE FUNCTION public.designer_open_task_count(p_employee_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::int
  FROM public.card_orders o
  WHERE o.assigned_designer_id = p_employee_id
    AND o.status IN ('assigned','in_design','internal_qa','revision_requested');
$$;

-- Signature/corporate work needs a designer at associate grade or above.
CREATE OR REPLACE FUNCTION public.grade_meets_package(p_grade TEXT, p_package_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_package_id IN ('signature') THEN
      p_grade IN ('associate','senior_associate','lead','head')
    ELSE TRUE
  END;
$$;

/**
 * Rank the designers eligible for an order, best first.
 *
 * Returns zero rows when nobody is eligible — which is a REAL and expected
 * outcome, not an error. There is no freelance pool and no overflow capacity to
 * buy (PRD §4.1), so sum(capacity) across active designers is the hard
 * throughput ceiling of the entire feature. The caller must handle "nobody
 * available" by leaving the order queued and alerting Ops, never by assigning
 * someone over capacity.
 */
CREATE OR REPLACE FUNCTION public.rank_designers_for_order(p_order_id UUID)
RETURNS TABLE (
  employee_id  UUID,
  display_name TEXT,
  headroom     INTEGER,
  idle_hours   NUMERIC,
  score        NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    d.employee_id,
    d.display_name,
    (d.capacity - public.designer_open_task_count(d.employee_id))::int AS headroom,
    round(EXTRACT(EPOCH FROM (now() - COALESCE(d.last_assigned_at, now() - interval '30 days'))) / 3600.0, 1) AS idle_hours,
    -- Headroom dominates, so load balancing beats idleness: giving the next
    -- job to someone already at capacity because they happened to be idle
    -- longest is how a queue silently converts into a backlog on one person.
    ((d.capacity - public.designer_open_task_count(d.employee_id)) * 100.0)
      + LEAST(EXTRACT(EPOCH FROM (now() - COALESCE(d.last_assigned_at, now() - interval '30 days'))) / 3600.0, 240.0)
      AS score
  FROM public.designer_profiles d
  JOIN public.card_orders o ON o.id = p_order_id
  WHERE d.active = TRUE
    AND (d.on_leave_until IS NULL OR d.on_leave_until < CURRENT_DATE)
    AND o.category_id = ANY(d.categories)
    AND public.grade_meets_package(d.studio_grade, o.package_id)
    AND public.designer_open_task_count(d.employee_id) < d.capacity
  ORDER BY score DESC, d.employee_id;
$$;

REVOKE ALL ON FUNCTION public.rank_designers_for_order(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rank_designers_for_order(UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.designer_open_task_count(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.designer_open_task_count(UUID) TO authenticated, service_role;

/**
 * Assign an order to a designer and move it to `assigned`, in one transaction.
 *
 * `p_employee_id` NULL means auto-assign: take the top of the ranking. A manual
 * override passes an explicit id and always wins, and is logged as an
 * order_events row carrying the admin's identity (TDD §5.4).
 *
 * Returns NULL when nobody is eligible, so the caller can distinguish "no
 * capacity" from "assigned" and raise the Ops alert the capacity ceiling
 * requires.
 */
CREATE OR REPLACE FUNCTION public.assign_card_order(
  p_order_id    UUID,
  p_employee_id UUID DEFAULT NULL,
  p_actor_type  TEXT DEFAULT 'system',
  p_actor_id    TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_chosen UUID;
  v_manual BOOLEAN := p_employee_id IS NOT NULL;
BEGIN
  IF v_manual THEN
    v_chosen := p_employee_id;
  ELSE
    SELECT r.employee_id INTO v_chosen
    FROM public.rank_designers_for_order(p_order_id) r
    LIMIT 1;
  END IF;

  IF v_chosen IS NULL THEN
    RETURN NULL;   -- no capacity; the order stays queued
  END IF;

  -- Written before the transition so the `assigned` guard, which requires a
  -- designer to be set, sees it.
  UPDATE public.card_orders
     SET assigned_designer_id = v_chosen
   WHERE id = p_order_id;

  UPDATE public.designer_profiles
     SET last_assigned_at = now()
   WHERE employee_id = v_chosen;

  PERFORM public.transition_order(
    p_order_id, 'assigned', 'task.assigned', p_actor_type, p_actor_id,
    jsonb_build_object('designer_id', v_chosen, 'manual_override', v_manual)
  );

  RETURN v_chosen;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_card_order(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_card_order(UUID, UUID, TEXT, TEXT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  Clarifications pause the SLA clock
-- ─────────────────────────────────────────────────────────────────────────────
-- PRD §7.3: a designer may raise a clarification mid-design, and this pauses the
-- SLA clock until it is answered. Without this a designer is penalised for time
-- the customer controls, which makes the whole SLA metric unusable as the
-- profitability lever §4.1 says it is.
--
-- Implemented as a trigger rather than in application code so it cannot be
-- bypassed by whichever surface happens to raise the clarification.

CREATE OR REPLACE FUNCTION public.card_clarification_sla()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_open INTEGER;
BEGIN
  SELECT count(*) INTO v_open
  FROM public.brief_clarifications c
  WHERE c.order_id = NEW.order_id AND c.answered_at IS NULL;

  IF v_open > 0 THEN
    -- Pause, but never restart an already-running pause: overwriting
    -- sla_paused_at on a second clarification would discard the first one's
    -- accrued time.
    UPDATE public.card_orders
       SET sla_paused_at = COALESCE(sla_paused_at, now())
     WHERE id = NEW.order_id;
  ELSE
    -- All answered: bank the paused interval and push the deadline out by
    -- exactly that much.
    UPDATE public.card_orders
       SET sla_due_at = CASE
             WHEN sla_paused_at IS NOT NULL AND sla_due_at IS NOT NULL
               THEN sla_due_at + (now() - sla_paused_at)
             ELSE sla_due_at END,
           sla_paused_ms = sla_paused_ms + CASE
             WHEN sla_paused_at IS NOT NULL
               THEN (EXTRACT(EPOCH FROM (now() - sla_paused_at)) * 1000)::bigint
             ELSE 0 END,
           sla_paused_at = NULL
     WHERE id = NEW.order_id
       -- Only resume if nothing ELSE is holding the clock (e.g. the order is
       -- also sitting in a customer-input state).
       AND NOT public.card_sla_paused_state(status);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS brief_clarifications_sla ON public.brief_clarifications;
CREATE TRIGGER brief_clarifications_sla
  AFTER INSERT OR UPDATE OF answered_at ON public.brief_clarifications
  FOR EACH ROW EXECUTE FUNCTION public.card_clarification_sla();

-- ─────────────────────────────────────────────────────────────────────────────
--  Version numbering
-- ─────────────────────────────────────────────────────────────────────────────
-- Concurrency-safe next version number. Two uploads racing must not both claim
-- v3; the UNIQUE (order_id, version_no) would reject the second, but computing
-- it under the order's row lock means the second caller simply gets v4.

CREATE OR REPLACE FUNCTION public.next_design_version_no(p_order_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  PERFORM 1 FROM public.card_orders WHERE id = p_order_id FOR UPDATE;
  SELECT COALESCE(MAX(version_no), 0) + 1 INTO v_next
  FROM public.design_versions WHERE order_id = p_order_id;
  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.next_design_version_no(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_design_version_no(UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  Capacity visibility
-- ─────────────────────────────────────────────────────────────────────────────
-- §5.4: "Capacity is finite and unspillable." Ops needs a live read on how
-- close the studio is to its ceiling, because the remedy for an SLA we cannot
-- staff is a full refund on work we have already paid a salary to produce.

CREATE OR REPLACE VIEW public.commission_capacity AS
SELECT
  COALESCE(SUM(d.capacity), 0)::int                                   AS total_capacity,
  COALESCE(SUM(public.designer_open_task_count(d.employee_id)), 0)::int AS open_tasks,
  COALESCE(SUM(d.capacity), 0)::int
    - COALESCE(SUM(public.designer_open_task_count(d.employee_id)), 0)::int AS free_capacity,
  (SELECT count(*)::int FROM public.card_orders WHERE status = 'queued')    AS queued_count,
  (SELECT count(*)::int FROM public.card_orders
    WHERE status IN ('assigned','in_design','internal_qa','revision_requested')) AS in_flight_count
FROM public.designer_profiles d
WHERE d.active = TRUE
  AND (d.on_leave_until IS NULL OR d.on_leave_until < CURRENT_DATE);

COMMENT ON VIEW public.commission_capacity IS
  'Live read on the studio throughput ceiling. Ops alerts when queued volume exceeds 70% of free capacity, and again at 100% — at which point checkout must extend the quoted SLA or close the package rather than accepting orders the studio cannot deliver (TDD §5.4).';

REVOKE ALL ON public.commission_capacity FROM PUBLIC, anon;
GRANT SELECT ON public.commission_capacity TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
