-- Working day is 09:00–17:00 East Africa Time, with a 30-minute entitled break.
--
-- OF-ENG-RPT-006: "Working day is 09:00-17:00". The seeded Standard day was
-- still 08:00–17:00 with a 60-minute lunch, and attendance_resolve_schedule
-- fell back to the default schedule with NO shift template — so My Clock
-- showed "No fixed hours" even though everyone is expected on a 9–5 day.
--
-- This migration:
--   1. Moves Standard day (and Saturday) to 09:00–17:00 with 30 minutes break.
--   2. Resolves a schedule default template when an employee has no assignment
--      template: Saturday → 'Saturday', otherwise → 'Standard day'.

UPDATE public.shift_templates t
   SET start_time = '09:00',
       end_time = '17:00',
       unpaid_break_minutes = 30,
       updated_at = now()
  FROM public.work_schedules s
 WHERE t.schedule_id = s.id
   AND s.name = 'OpusFesta standard'
   AND t.name IN ('Standard day', 'Saturday');

UPDATE public.work_schedules
   SET description = 'Monday to Saturday, 09:00 to 17:00 East Africa Time. 30-minute entitled break within the 8-hour day.',
       updated_at = now()
 WHERE name = 'OpusFesta standard';

CREATE OR REPLACE FUNCTION public.attendance_resolve_schedule(
  p_employee_id uuid,
  p_date date
)
RETURNS TABLE (
  schedule_id uuid,
  shift_template_id uuid,
  work_mode text
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH ranked AS (
    SELECT
      a.schedule_id,
      a.shift_template_id,
      COALESCE(a.work_mode, t.work_mode, 'office') AS work_mode,
      CASE WHEN a.weekday IS NOT NULL THEN 0 ELSE 1 END AS specificity,
      a.effective_from
    FROM employee_shift_assignments a
    LEFT JOIN shift_templates t ON t.id = a.shift_template_id
    WHERE a.employee_id = p_employee_id
      AND a.effective_from <= p_date
      AND (a.effective_to IS NULL OR a.effective_to >= p_date)
      AND (a.weekday IS NULL OR a.weekday = EXTRACT(ISODOW FROM p_date)::smallint)
    ORDER BY specificity, a.effective_from DESC
    LIMIT 1
  ),
  base AS (
    SELECT r.schedule_id, r.shift_template_id, r.work_mode FROM ranked r
    UNION ALL
    SELECT s.id, NULL::uuid, 'office'
    FROM work_schedules s
    WHERE s.is_default AND s.active AND NOT EXISTS (SELECT 1 FROM ranked)
    LIMIT 1
  ),
  with_template AS (
    SELECT
      b.schedule_id,
      COALESCE(
        b.shift_template_id,
        (
          SELECT t.id
          FROM shift_templates t
          WHERE t.schedule_id = b.schedule_id
            AND t.active
            AND t.name = CASE
              WHEN EXTRACT(ISODOW FROM p_date)::smallint = 6 THEN 'Saturday'
              ELSE 'Standard day'
            END
          LIMIT 1
        ),
        (
          -- Last resort: any active daytime template on the schedule.
          SELECT t.id
          FROM shift_templates t
          WHERE t.schedule_id = b.schedule_id
            AND t.active
            AND NOT t.crosses_midnight
          ORDER BY t.start_time
          LIMIT 1
        )
      ) AS shift_template_id,
      b.work_mode
    FROM base b
  )
  SELECT
    w.schedule_id,
    w.shift_template_id,
    COALESCE(
      w.work_mode,
      (SELECT t.work_mode FROM shift_templates t WHERE t.id = w.shift_template_id),
      'office'
    ) AS work_mode
  FROM with_template w;
$$;

COMMENT ON FUNCTION public.attendance_resolve_schedule(uuid, date) IS
  'Resolves schedule + shift template for an employee on a date. When no assignment template exists, uses the schedule Standard day (or Saturday) so expected hours are never blank on a working day.';

NOTIFY pgrst, 'reload schema';
