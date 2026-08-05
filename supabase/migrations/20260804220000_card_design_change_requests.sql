-- =============================================================================
-- A couple can ask for a change to a released card
-- =============================================================================
-- Once a card is released, the couple's own editor locks: every field is
-- disabled and the submit button disappears. The only thing left was a sentence
-- in a banner, "Message us if something still needs correcting" — not a link,
-- not a form, and nothing anywhere recorded that they had asked.
--
-- The machinery to ACT on a correction already exists
-- (saveAndPublishReleasedDesign cuts a fresh release behind cms/digitalcards
-- publish and the two-eyes rule). The missing half was the inbound signal.
--
-- The note itself goes in invitation_card_design_events, which already stores
-- the job's history and already renders on the design job page. This column is
-- only the FLAG: a queryable "there is an outstanding request", so the
-- Personalisation Queue can badge the job without joining and scanning the
-- event log on every page view.
--
-- Deliberately NOT a status change. The release is frozen on purpose — a
-- request from the couple must not move a card out of the two statuses that
-- OpusPass resolves guest cards from, or the card would break for guests who
-- already hold a link while the couple's order still claims it was delivered.
-- A request is a fact about the job, not a transition of it.
-- =============================================================================

ALTER TABLE public.invitation_card_designs
  ADD COLUMN IF NOT EXISTS change_requested_at TIMESTAMPTZ;

COMMENT ON COLUMN public.invitation_card_designs.change_requested_at IS
  'When the couple last asked for a change to the released card. Cleared when a new release is published, which is what answers the request. The request text lives in invitation_card_design_events.';

-- Partial: the queue only ever asks "which jobs have an outstanding request",
-- and outstanding is the rare case across a table of finished work.
CREATE INDEX IF NOT EXISTS invitation_card_designs_change_requested_idx
  ON public.invitation_card_designs (change_requested_at)
  WHERE change_requested_at IS NOT NULL;
