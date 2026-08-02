-- Track invitation_card_designs.share_token, which exists in production but
-- was never committed.
--
-- The column and its index are live on the remote project, and five call sites
-- depend on them: the admin mints a token (digital-cards/designer/actions.ts)
-- and the couple redeems it (opus_pass card-details.ts, and the public
-- /card-details/[token] page). None of that is in version control, so a fresh
-- `supabase db reset` produces a schema on which the entire share-link flow
-- throws at runtime rather than at deploy time.
--
-- Written to match the live definition exactly, so applying it upstream is a
-- no-op and applying it to a clean database is correct.

ALTER TABLE public.invitation_card_designs
  ADD COLUMN IF NOT EXISTS share_token TEXT;

COMMENT ON COLUMN public.invitation_card_designs.share_token IS
  'Opaque token for the couple''s public card-details link. NULL until a designer shares the job.';

-- Partial and unique: a token must resolve to exactly one job, but most jobs
-- never get one, and a plain unique index would collide every NULL row on
-- databases that do not treat NULLs as distinct.
CREATE UNIQUE INDEX IF NOT EXISTS invitation_card_designs_share_token_idx
  ON public.invitation_card_designs (share_token)
  WHERE share_token IS NOT NULL;
