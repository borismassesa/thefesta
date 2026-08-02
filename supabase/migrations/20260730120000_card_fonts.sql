-- The font library behind digital cards.
--
-- Card artwork names its typefaces but never carries them:
--
--   <text font-family="GreatVibes-Regular, Great Vibes">Moses Seeta</text>
--
-- If the face isn't available wherever the card is drawn, the browser falls
-- back to a generic serif SILENTLY. Measured against the live Opus Royal Ivory
-- artwork, all four of its faces were falling back, so the card the couple
-- received was never the card the designer drew. Nothing errored, and nothing
-- in the product could have told you.
--
-- Designers hand over a folder of font files with each design. This is where
-- those files are registered so a card can be matched against them.
--
-- Two decisions worth stating up front, because both are load-bearing:
--
--   PRIVATE BUCKET. These are commercial binaries. A public bucket would hand
--   a licensed Monotype or Fontfabric font to anyone who guessed the path,
--   which is the licensing exposure at its maximum. Access is service-role
--   only, matching invitation_card_designs.
--
--   ATTESTATION, NOT fsType. The OS/2 fsType bits are a PDF-embedding
--   convention, not a licence. Desktop EULAs routinely forbid webfont use even
--   when fsType says "installable", and a base64 data: URI in a served card is
--   unambiguously webfont use. So fsType is recorded as an automated red flag
--   and a human attestation is the actual gate.

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

-- allowed_mime_types is deliberately NULL. Browsers report .ttf and .otf as
-- 'application/octet-stream', 'font/sfnt' or '' depending on platform, so a
-- MIME allowlist here would reject legitimate fonts while proving nothing.
-- Validation is by magic bytes in apps/opus_admin/src/lib/cms/font-metadata.ts.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('card-fonts', 'card-fonts', false, 20971520, NULL)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = NULL;

-- No policies for anon or authenticated: every read and write goes through a
-- server action using the service role, which bypasses RLS. Granting the
-- authenticated role access here would widen the blast radius for no gain.

-- ---------------------------------------------------------------------------
-- The library
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.card_fonts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Object key inside the card-fonts bucket.
  storage_path TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  -- The same font arrives with many designs. Hashing the bytes means the
  -- fiftieth delivery of Great Vibes is recognised rather than duplicated.
  content_sha256 TEXT NOT NULL UNIQUE,

  format TEXT NOT NULL CHECK (format IN ('ttf', 'otf', 'woff', 'woff2')),

  -- Read from the OpenType `name` table, never typed by a human. Across a
  -- thousand cards, hand-typed names are both slow and a source of mismatches
  -- the matcher would then silently fail to resolve.
  family_name TEXT NOT NULL,
  subfamily_name TEXT NOT NULL DEFAULT 'Regular',
  full_name TEXT NOT NULL DEFAULT '',
  postscript_name TEXT NOT NULL,
  -- Name IDs 16/17, present on families with more than four faces.
  typographic_family TEXT,
  typographic_subfamily TEXT,

  weight_class INT NOT NULL DEFAULT 400 CHECK (weight_class BETWEEN 1 AND 1000),
  is_italic BOOLEAN NOT NULL DEFAULT FALSE,
  glyph_count INT NOT NULL DEFAULT 0 CHECK (glyph_count >= 0),

  -- Every spelling this face answers to, normalised (lowercased, spaces and
  -- hyphens stripped). Illustrator writes the PostScript name first, so that
  -- is usually the key that resolves.
  match_keys TEXT[] NOT NULL DEFAULT '{}',

  -- Decoded OS/2 fsType bits. An automated red flag, not the licence.
  fs_type_no_embedding BOOLEAN NOT NULL DEFAULT FALSE,
  fs_type_view_only BOOLEAN NOT NULL DEFAULT FALSE,
  fs_type_no_subsetting BOOLEAN NOT NULL DEFAULT FALSE,

  -- unknown          — registered, not yet assessed. The default.
  -- open             — an open licence such as SIL OFL.
  -- webfont_licensed — a webfont licence has actually been purchased.
  -- desktop_only     — we hold a desktop licence, which does NOT cover this.
  -- blocked          — established that we may not use it.
  licence_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (licence_status IN ('unknown', 'open', 'webfont_licensed', 'desktop_only', 'blocked')),
  licence_note TEXT NOT NULL DEFAULT '',
  licence_set_by UUID REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  licence_set_at TIMESTAMPTZ,

  -- THE GATE. A generated column rather than an application check, so no future
  -- call site can forget it: every query that builds a font block filters on
  -- `embeddable`. A UI check is advisory; this one cannot be bypassed.
  --
  -- Note a font can be un-embeddable and still be listed as REQUIRED by a card.
  -- That is intentional: you need to see which typefaces to go and buy.
  embeddable BOOLEAN GENERATED ALWAYS AS (
    licence_status IN ('open', 'webfont_licensed')
    AND NOT fs_type_no_embedding
    AND NOT fs_type_view_only
  ) STORED,

  uploaded_by UUID REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.card_fonts IS
  'One row per font FACE (regular and bold are two rows). Metadata read from the OpenType name table; bytes live in the private card-fonts bucket.';
COMMENT ON COLUMN public.card_fonts.embeddable IS
  'Generated gate. Only these fonts are ever injected into a card. Enforced here so no call site can skip it.';
COMMENT ON COLUMN public.card_fonts.match_keys IS
  'Normalised names this face answers to, for matching against an artwork font-family list.';

-- The matcher looks a face up by normalised name on every card render.
CREATE INDEX IF NOT EXISTS card_fonts_match_keys_idx
  ON public.card_fonts USING GIN (match_keys);
CREATE INDEX IF NOT EXISTS card_fonts_embeddable_idx
  ON public.card_fonts (embeddable) WHERE embeddable;

CREATE OR REPLACE FUNCTION public.touch_card_fonts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS card_fonts_touch ON public.card_fonts;
CREATE TRIGGER card_fonts_touch
  BEFORE UPDATE ON public.card_fonts
  FOR EACH ROW EXECUTE FUNCTION public.touch_card_fonts();

-- ---------------------------------------------------------------------------
-- Aliases: the release valve
-- ---------------------------------------------------------------------------

-- When a font cannot be licensed for web use, or the artwork asks for a name
-- nothing matches, this substitutes one face for that name once, globally.
--
-- The alternative is editing a thousand pieces of artwork, or leaving those
-- cards broken. Neither is a real option, which is why this table exists before
-- the first font is uploaded rather than after the first crisis.
CREATE TABLE IF NOT EXISTS public.card_font_aliases (
  -- The normalised name as the artwork asks for it, e.g. 'bookmanoldstyle'.
  required_name TEXT PRIMARY KEY,
  font_id UUID NOT NULL REFERENCES public.card_fonts(id) ON DELETE CASCADE,
  -- Why the substitution was made, so it is not a mystery in six months.
  note TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.card_font_aliases IS
  'Substitutes a licensed face for a font name the artwork asks for. Keyed on the normalised required name.';

-- ---------------------------------------------------------------------------
-- The fleet readout
-- ---------------------------------------------------------------------------

-- Scanning a card means downloading a ~2 MB SVG. Doing that across a thousand
-- rows to answer "how many of our cards render correctly?" would be gigabytes
-- of fetches per page view, so the answer is cached on the product.
--
-- Shape (see packages/lib/card-svg-fonts.ts):
--   [{ "primary": "GreatVibes-Regular",
--      "families": ["GreatVibes-Regular", "Great Vibes"],
--      "weight": 400, "italic": false,
--      "layerIds": ["couple_name_1", "couple_name_2"],
--      "codePoints": [77, 111, 115] }]
--
-- Empty array is ambiguous on purpose: it means either "needs no fonts" or
-- "never scanned". fonts_scanned_at is what tells the two apart.
ALTER TABLE public.website_invitations_products
  ADD COLUMN IF NOT EXISTS required_fonts JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fonts_scanned_at TIMESTAMPTZ;

COMMENT ON COLUMN public.website_invitations_products.required_fonts IS
  'Cached scan of the typefaces this card''s artwork asks for. Array of {primary, families[], weight, italic, layerIds[], codePoints[]}.';
COMMENT ON COLUMN public.website_invitations_products.fonts_scanned_at IS
  'When required_fonts was last computed. NULL means never scanned, which is not the same as needing no fonts.';

-- Guard the container shape only. Validating each entry belongs in the app,
-- where the scanner lives and a bad entry can be reported to an admin.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'website_invitations_products_required_fonts_is_array'
  ) THEN
    ALTER TABLE public.website_invitations_products
      ADD CONSTRAINT website_invitations_products_required_fonts_is_array
      CHECK (jsonb_typeof(required_fonts) = 'array');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

-- Staff-only, reached through the service role. Matching invitation_card_designs:
-- a font binary is licensed material and there is no couple-facing read path.
ALTER TABLE public.card_fonts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.card_fonts FROM anon, authenticated;
GRANT ALL ON public.card_fonts TO service_role;

ALTER TABLE public.card_font_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.card_font_aliases FROM anon, authenticated;
GRANT ALL ON public.card_font_aliases TO service_role;

-- Postgres grants EXECUTE on new functions to PUBLIC by default, and PostgREST
-- would expose this as an unauthenticated RPC.
REVOKE ALL ON FUNCTION public.touch_card_fonts() FROM PUBLIC, anon, authenticated;
