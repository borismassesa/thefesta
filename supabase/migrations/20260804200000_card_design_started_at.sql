-- Separate "a designer has begun this job" from "a row exists".
--
-- 20260729000004 deliberately created rows only when a designer pressed Start,
-- which let the queue derive "not started" from the ABSENCE of a row. That was
-- correct while staff were the only writers.
--
-- The couple now fills in their card's content themselves, from the Card
-- details tab, without waiting to be asked. Those answers have to land in
-- field_values on this table because that is what the designer surface and the
-- render pipeline read, so the couple creates the row. Row existence therefore
-- stops meaning "started", and the queue needs its own signal for that.
--
-- started_at IS that signal: set once, by the designer, and never inferred.

ALTER TABLE public.invitation_card_designs
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

COMMENT ON COLUMN public.invitation_card_designs.started_at IS
  'When a designer took the job on. NULL means unstarted, even though the row exists — a couple can create it by sending their card content first.';

-- Every row that exists today was created by startDesignJob, so all of them
-- have been started. Falling back to created_at rather than now() keeps the
-- queue''s ordering and any future "time in design" measure honest.
UPDATE public.invitation_card_designs
   SET started_at = created_at
 WHERE started_at IS NULL;

-- The queue reads "unstarted jobs" on every page load, and only a handful of
-- rows are ever in that state.
CREATE INDEX IF NOT EXISTS invitation_card_designs_unstarted_idx
  ON public.invitation_card_designs (order_id)
  WHERE started_at IS NULL;
