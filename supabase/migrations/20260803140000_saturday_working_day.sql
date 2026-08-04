-- Saturday becomes a working day.
--
-- Decision record: docs/PERFORMANCE_EXECUTION_INTEGRATION.md, Q1.
--
-- Both handover documents describe a Monday-to-Friday week. OF-ENG-RPT-006 says
-- "Working day is 09:00-17:00" and raises "whether Saturday is a working day" as
-- an open question; OF-HR-TT-0826 states "21 weekdays in August 2026 ... Monday
-- to Friday", and all nine of its per-role daily logs contain 21 Mon-Fri rows
-- and no Saturdays. The staff rota is the authority and says otherwise. Both
-- documents are therefore out of date on this point, and this migration is the
-- record of that.
--
-- WHAT THIS DOES NOT DO, DELIBERATELY.
--
-- It changes the rule going forward. It does not rewrite history:
--
--   * Approved leave that already spans a Saturday keeps the total_days it was
--     approved with. leave_transactions is an append-only ledger, so silently
--     re-pricing a past request would mean a balance that no longer reconciles
--     against the rows that produced it.
--   * Saturdays already worked were booked as 100% overtime, because a day
--     outside working_weekdays is weekend work by definition. Those sessions
--     keep their stored is_weekend and their overtime. Recomputing them would
--     reduce pay that has, in all likelihood, already been paid.
--   * tracker_entries already generated for Saturdays keep suppression_reason
--     'rest_day'. tracker_generate_entries is ON CONFLICT DO NOTHING, so it will
--     not revisit them, which is the behaviour we want here.
--
-- Everything above is a data decision, not a schema one. If payroll or People
-- Ops decides history should move, that is a separate, deliberate backfill.

-- ---------------------------------------------------------------------------
-- 1. The default for schedules created from here on
-- ---------------------------------------------------------------------------
-- Without this, every schedule created in future silently reverts to Mon-Fri
-- and the bug comes back one new hire at a time.

ALTER TABLE public.work_schedules
  ALTER COLUMN working_weekdays SET DEFAULT '{1,2,3,4,5,6}';

COMMENT ON COLUMN public.work_schedules.working_weekdays IS
  'ISO weekdays (Mon=1 ... Sun=7) that count as the working week. OpusFesta works Monday to Saturday. Anything outside this set is weekend work: it still pays, and it is flagged so it can be paid differently.';

-- standard_weekly_minutes was 2400 (40h = 5 x 480), which encodes a five-day
-- week. Six 8-hour days is 2880. This is the default for new schedules only.
ALTER TABLE public.work_schedules
  ALTER COLUMN standard_weekly_minutes SET DEFAULT 2880;

-- ---------------------------------------------------------------------------
-- 2. The live default schedule
-- ---------------------------------------------------------------------------
-- This single UPDATE is what actually flips behaviour, because the modules read
-- this row rather than hardcoding a week. It changes, for free and at once:
--   leave_expand_days           a Saturday inside a leave range now costs a day
--   leave_recompute_availability Saturday stops being 'rest_day'
--   tracker_day_state           Saturday entries become working days
--   attendance_recalculate_session Saturday stops being all-overtime
--   the missing-clock-in detector, which will start flagging Saturday absentees
--   the rostered-shift calendar feed

UPDATE public.work_schedules
   SET working_weekdays = '{1,2,3,4,5,6}',
       standard_weekly_minutes = 2880,
       description = 'Monday to Friday 08:00 to 17:00, Saturday 09:00 to 17:00, East Africa Time. One unpaid lunch hour.',
       updated_at = now()
 WHERE name = 'OpusFesta standard';

-- ---------------------------------------------------------------------------
-- 3. Saturday's shift
-- ---------------------------------------------------------------------------
-- shift_templates carries no weekday of its own, so a Saturday that starts an
-- hour later than the rest of the week is a second template plus a weekday=6
-- assignment. The seeded 'Standard day' is 08:00-17:00; the rota puts Saturday
-- at 09:00-17:00.
--
-- Note this template is NOT attached to anybody here. employee_shift_assignments
-- is per employee, and inventing assignments for the whole company inside a
-- migration would create rows nobody chose. People Ops assigns it, or a follow-up
-- backfill does it deliberately once the roster is confirmed.

INSERT INTO public.shift_templates (schedule_id, name, start_time, end_time, unpaid_break_minutes, work_mode)
SELECT id, 'Saturday', '09:00', '17:00', 60, 'office'
  FROM public.work_schedules
 WHERE name = 'OpusFesta standard'
ON CONFLICT (schedule_id, name) DO NOTHING;

NOTIFY pgrst, 'reload schema';
