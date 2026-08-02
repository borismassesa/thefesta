-- Release identity, and one prepared PNG per guest.
--
-- Two gaps this closes.
--
-- FIRST, a release has no identity. `invitation_card_designs.release_svg_path`
-- is a single column overwritten on every approval, while the previous object
-- stays in the bucket unreferenced. So there is no way to say "the release that
-- produced this image", and no way to keep a URL already sent to a guest
-- pointing at the artefact that was actually sent. A card approved a second time
-- would silently change under two hundred people.
--
-- SECOND, nothing per guest exists. The card a guest receives has to carry that
-- guest's name, which means one rendered artefact per guest per release, fetched
-- by Meta over an unauthenticated URL. That needs a row: a bearer token to
-- authorise the fetch, a place to put the PNG, and a status so a failed
-- preparation is visible BEFORE an operator clicks Send rather than after.
--
-- Preparation is deliberately not modelled as a job queue. It runs inside the
-- send flow, bounded, and these rows are its ledger.

-- ---------------------------------------------------------------------------
-- Release identity
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.invitation_card_design_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id UUID NOT NULL REFERENCES public.invitation_card_designs (id) ON DELETE CASCADE,

  -- Object key in the card-releases bucket. Timestamped by the writer, so it is
  -- unique per release and an earlier release is never overwritten.
  svg_storage_path TEXT NOT NULL UNIQUE,

  -- Content hash of the frozen SVG.
  --
  -- Nullable because releases frozen before this table existed have no recorded
  -- hash and re-reading them to invent one would claim a certainty we do not
  -- have. New rows always carry it: it is what makes an identical re-render
  -- recognisable instead of looking like a new artefact.
  svg_sha256 TEXT,

  -- Which source export this was rendered from, so a card that changed because
  -- the artwork was re-exported can be told apart from one that changed because
  -- the couple edited a field.
  artwork_svg_url TEXT NOT NULL DEFAULT '',

  released_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Email, matching reviewed_by on the parent: the admin caller identity is an
  -- email, and an employee row can be deleted without erasing who approved a
  -- wedding card.
  released_by TEXT NOT NULL DEFAULT '',

  -- Set when a newer release is approved. The row is kept, never deleted,
  -- because assets and sent URLs still point at it.
  superseded_at TIMESTAMPTZ
);

COMMENT ON TABLE public.invitation_card_design_releases IS
  'One row per approved freeze of a card. Immutable except superseded_at; guest assets and already-sent URLs reference it, so it is never deleted or rewritten.';
COMMENT ON COLUMN public.invitation_card_design_releases.svg_sha256 IS
  'SHA-256 of the frozen SVG. NULL only for releases predating this table.';
COMMENT ON COLUMN public.invitation_card_design_releases.superseded_at IS
  'When a newer release replaced this one. Kept rather than deleted: URLs already sent must keep resolving to what was actually sent.';

CREATE INDEX IF NOT EXISTS invitation_card_design_releases_design_idx
  ON public.invitation_card_design_releases (design_id, released_at DESC);

-- Finding the live release for a design, which is the delivery path's hot query.
CREATE INDEX IF NOT EXISTS invitation_card_design_releases_current_idx
  ON public.invitation_card_design_releases (design_id)
  WHERE superseded_at IS NULL;

-- The design's pointer at its live release.
--
-- release_svg_path stays exactly as it is, so everything reading it today keeps
-- working. This is additive: it makes "which release is current" a fact rather
-- than something each caller re-derives from timestamps.
ALTER TABLE public.invitation_card_designs
  ADD COLUMN IF NOT EXISTS current_release_id UUID
    REFERENCES public.invitation_card_design_releases (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.invitation_card_designs.current_release_id IS
  'The live release. release_svg_path is kept alongside it for existing readers.';

-- ---------------------------------------------------------------------------
-- Backfill: give existing releases an identity
-- ---------------------------------------------------------------------------

-- Every card already released gets a row, so the delivery path has one code
-- path rather than a special case for cards released before today. Runs once and
-- is safe to repeat: the unique path blocks a second insert.
INSERT INTO public.invitation_card_design_releases
  (design_id, svg_storage_path, artwork_svg_url, released_at, released_by)
SELECT
  d.id,
  d.release_svg_path,
  COALESCE(p.artwork_svg_url, ''),
  COALESCE(d.released_at, d.reviewed_at, NOW()),
  COALESCE(d.reviewed_by, '')
FROM public.invitation_card_designs d
LEFT JOIN public.website_invitations_products p ON p.id = d.product_id
WHERE d.release_svg_path IS NOT NULL
  AND d.release_svg_path <> ''
ON CONFLICT (svg_storage_path) DO NOTHING;

UPDATE public.invitation_card_designs d
SET current_release_id = r.id
FROM public.invitation_card_design_releases r
WHERE r.svg_storage_path = d.release_svg_path
  AND d.current_release_id IS NULL;

-- ---------------------------------------------------------------------------
-- Per-guest delivery assets
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.invitation_card_delivery_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Bound to a RELEASE, not a design. A new approval produces a new release and
  -- therefore a fresh asset set, while assets already sent keep pointing at the
  -- artefact they were rendered from.
  design_release_id UUID NOT NULL
    REFERENCES public.invitation_card_design_releases (id) ON DELETE CASCADE,

  -- Deleting a guest revokes their card by removing the row, which makes the
  -- public route 404 rather than serving a card for somebody no longer invited.
  guest_id UUID NOT NULL REFERENCES public.guest_contacts (id) ON DELETE CASCADE,

  -- Which rendering this is, e.g. 'whatsapp_header_v1'. Part of the identity so
  -- a second size or a changed contract does not collide with what was sent.
  render_variant TEXT NOT NULL,

  -- SHA-256 of the bearer token. The raw token is returned once, at creation,
  -- and never stored: a leaked table must not hand out working card URLs.
  token_hash TEXT NOT NULL UNIQUE,

  -- Null until the render succeeds.
  png_storage_path TEXT,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'failed')),

  -- A RasterErrorCode from packages/lib/card-raster-contract.ts. Deliberately
  -- unconstrained here: pinning the set in the database would mean a migration
  -- every time the renderer learns a new way to refuse, and the value is
  -- diagnostic rather than something the database branches on.
  render_error_code TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- When a worker last took responsibility for rendering this asset.
  --
  -- Separate from created_at because it is a lease, not a fact about the row: a
  -- worker that dies mid-render leaves a pending row forever, and the only safe
  -- way for another worker to take over is a conditional update on this column.
  -- Comparing created_at instead would make reclaim unrepeatable, since there is
  -- nothing to move.
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- How many times preparation has been attempted.
  --
  -- Bounds retries for faults classified as transient. Without a ceiling, a
  -- design that kills the renderer on every run would be retried on every send,
  -- spending a render per guest to reach the same failure.
  attempt_count INT NOT NULL DEFAULT 1 CHECK (attempt_count >= 0),
  last_attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Null means it does not expire. Meta may refetch a header long after the
  -- send, so a short expiry would break delivery rather than protect anything.
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,

  -- The idempotency key. A retried send finds the existing asset and reuses its
  -- token and PNG instead of minting a second of each.
  UNIQUE (design_release_id, guest_id, render_variant)
);

COMMENT ON TABLE public.invitation_card_delivery_assets IS
  'One prepared card image per guest per release. Fetched by Meta over an unauthenticated token URL, so the token is stored only as a hash.';
COMMENT ON COLUMN public.invitation_card_delivery_assets.token_hash IS
  'SHA-256 of the bearer token. The raw token exists only in the URL that was sent.';
COMMENT ON COLUMN public.invitation_card_delivery_assets.render_error_code IS
  'Stable failure code for a failed preparation. Codes only: never a provider message, a font URL, a storage path or a guest name.';
COMMENT ON COLUMN public.invitation_card_delivery_assets.attempt_count IS
  'Preparation attempts so far. Retries of transient faults stop at a cap so a deterministically broken design cannot consume work forever.';
COMMENT ON COLUMN public.invitation_card_delivery_assets.claimed_at IS
  'Render lease. A pending row whose claim has expired may be reclaimed by another worker via a conditional update on this column.';

-- Preparing a send: which of these guests already have an asset for this release.
CREATE INDEX IF NOT EXISTS invitation_card_delivery_assets_release_idx
  ON public.invitation_card_delivery_assets (design_release_id, guest_id);

-- Reporting a failed preparation back to the operator before the send runs.
CREATE INDEX IF NOT EXISTS invitation_card_delivery_assets_failed_idx
  ON public.invitation_card_delivery_assets (design_release_id)
  WHERE status = 'failed';

-- Finding renders whose worker died, so a retry can take them over.
CREATE INDEX IF NOT EXISTS invitation_card_delivery_assets_stale_idx
  ON public.invitation_card_delivery_assets (claimed_at)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- Storage for the prepared images
-- ---------------------------------------------------------------------------

-- Private, like card-releases. A guest card carries that guest's name next to
-- the couple's names and venue, so a public bucket would expose a whole guest
-- list to anyone who guessed a path. The token route reads it with the service
-- role and streams the bytes.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('card-guest-assets', 'card-guest-assets', false, 8388608, ARRAY['image/png'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

-- Neither table is ever read from a browser. The couple's app reaches them
-- server-side with the service role, and the public card URL is authorised by
-- its token, not by a Supabase session. Exposing either through PostgREST would
-- publish token hashes and a guest list for no benefit.
ALTER TABLE public.invitation_card_design_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invitation_card_design_releases FROM anon, authenticated;
GRANT ALL ON public.invitation_card_design_releases TO service_role;

ALTER TABLE public.invitation_card_delivery_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invitation_card_delivery_assets FROM anon, authenticated;
GRANT ALL ON public.invitation_card_delivery_assets TO service_role;
