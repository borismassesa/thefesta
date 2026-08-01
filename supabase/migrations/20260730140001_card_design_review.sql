-- The review gate between a finished design and the couple seeing it.
--
-- The status enum already had 'in_review' ("internal check before the couple
-- sees it") and 'ready' ("approved, visible to the couple"), but nothing
-- enforced or recorded either. setDesignStatus accepted any status from any
-- status, so the review step was advisory: a designer could mark their own work
-- ready, and no trace was left of who decided what.
--
-- These columns turn that into a real gate. The enforcement lives in the server
-- actions rather than in a trigger, matching how the rest of this table is
-- written, but the record of what happened lives here so it survives a code
-- change.

ALTER TABLE public.invitation_card_designs
  -- Designer hands the work over.
  ADD COLUMN IF NOT EXISTS submitted_for_review_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by TEXT NOT NULL DEFAULT '',
  -- Reviewer's decision. `reviewed_by` is an email rather than an employee FK
  -- because the admin's caller identity is an email (getCallerEmail) and an
  -- employee row can be deleted without erasing who approved a wedding card.
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  -- Why it was sent back. Kept on the row, not only in the event log, because
  -- the designer needs to see it at the top of the job they are reopening.
  ADD COLUMN IF NOT EXISTS review_note TEXT NOT NULL DEFAULT '',
  -- Release: the frozen artefact the couple actually receives.
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS release_svg_path TEXT,
  -- What the release render declined to write, if anything. Stored so a card
  -- that shipped with a gap can be found later without re-rendering it.
  ADD COLUMN IF NOT EXISTS released_render_skipped JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.invitation_card_designs.release_svg_path IS
  'Object key in the card-releases bucket. The frozen card the reviewer approved; everything the couple sees reads this, never a live re-render.';
COMMENT ON COLUMN public.invitation_card_designs.released_render_skipped IS
  'Fields the release render did not write. Should be empty: release refuses on any reason other than no_value.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invitation_card_designs_released_skipped_is_array'
  ) THEN
    ALTER TABLE public.invitation_card_designs
      ADD CONSTRAINT invitation_card_designs_released_skipped_is_array
      CHECK (jsonb_typeof(released_render_skipped) = 'array');
  END IF;
END $$;

-- Reviewers need "what is waiting on me", which is a status lookup plus a date.
CREATE INDEX IF NOT EXISTS invitation_card_designs_review_queue_idx
  ON public.invitation_card_designs (submitted_for_review_at)
  WHERE status = 'in_review';

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------

-- Append-only, shaped after approval_request_activity
-- (supabase/migrations/20260526000004_approval_requests.sql).
--
-- A wedding card that went out wrong is answered with "who approved this, and
-- when". Statuses alone cannot answer it: a job that was sent back twice and
-- then approved looks identical to one approved first time.
CREATE TABLE IF NOT EXISTS public.invitation_card_design_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id UUID NOT NULL REFERENCES public.invitation_card_designs(id) ON DELETE CASCADE,

  -- 'system' is a transition this code made; 'note' is something a human wrote.
  kind TEXT NOT NULL DEFAULT 'system' CHECK (kind IN ('system', 'note')),
  -- Email of whoever caused it. Free text for the same reason as reviewed_by.
  author TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  -- The transition, when there was one, so the trail can be read without
  -- parsing prose.
  from_status TEXT,
  to_status TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.invitation_card_design_events IS
  'Append-only history of a design job: submissions, approvals, send-backs and notes.';

CREATE INDEX IF NOT EXISTS invitation_card_design_events_design_idx
  ON public.invitation_card_design_events (design_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Storage for the frozen card
-- ---------------------------------------------------------------------------

-- Private. A released card carries the couple's names, their venue and their
-- guests' names; a public bucket would make every one of them reachable by
-- anyone who guessed a path. Reads go through an ownership-checked route.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('card-releases', 'card-releases', false, 26214400, ARRAY['image/svg+xml', 'image/png'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

-- Staff-only, reached through the service role, matching the parent table.
ALTER TABLE public.invitation_card_design_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invitation_card_design_events FROM anon, authenticated;
GRANT ALL ON public.invitation_card_design_events TO service_role;
