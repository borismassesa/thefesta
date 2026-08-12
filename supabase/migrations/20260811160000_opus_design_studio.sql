-- =============================================================================
-- Opus Design Studio / Opus Design Engine
-- =============================================================================
-- Greenfield Design Document as source of truth for Studio-authored card
-- artwork. Parallel to the legacy Illustrator SVG + Layer Mapper pipeline.
--
-- Objects:
--   design_projects          Master / Event workspace shell
--   design_documents         Current pointer + metadata
--   design_document_versions Append-only JSON document versions
--   design_assets            Base plates, icons, photos (refs only in JSON)
--   design_swatches          Project / brand colour palettes
--   design_template_releases Immutable compiled releases
--   design_render_jobs       Bulk personalisation queue
--   design_render_outputs    Per-guest (or test) artefacts
--   design_guest_overrides   Per-guest layout overrides
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.design_projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  kind            text NOT NULL DEFAULT 'master'
                    CHECK (kind IN ('master', 'event')),
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN (
                      'draft', 'in_review', 'approved', 'released', 'archived'
                    )),
  -- Optional links into existing OpusPass entities (nullable by design).
  -- product_id is TEXT to match website_invitations_products.id (slug-like PK).
  -- Same convention as invitation_card_designs.product_id: no FK, so a catalogue
  -- id rename/delete cannot break a Studio project mid-flight.
  product_id      text NULL,
  design_job_id   uuid NULL REFERENCES public.invitation_card_designs(id) ON DELETE SET NULL,
  parent_project_id uuid NULL REFERENCES public.design_projects(id) ON DELETE SET NULL,
  brand_kit_key   text NULL,
  created_by      text NULL,
  updated_by      text NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS design_projects_kind_status_idx
  ON public.design_projects (kind, status);
CREATE INDEX IF NOT EXISTS design_projects_updated_at_idx
  ON public.design_projects (updated_at DESC);

-- ---------------------------------------------------------------------------
-- Documents + versions (JSONB SoT)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.design_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.design_projects(id) ON DELETE CASCADE,
  title           text NOT NULL DEFAULT 'Untitled card',
  current_version integer NOT NULL DEFAULT 0,
  current_version_id uuid NULL,
  schema_version  integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);

CREATE TABLE IF NOT EXISTS public.design_document_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     uuid NOT NULL REFERENCES public.design_documents(id) ON DELETE CASCADE,
  version         integer NOT NULL,
  document        jsonb NOT NULL,
  change_summary  text NULL,
  created_by      text NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);

CREATE INDEX IF NOT EXISTS design_document_versions_document_id_idx
  ON public.design_document_versions (document_id, version DESC);

ALTER TABLE public.design_documents
  DROP CONSTRAINT IF EXISTS design_documents_current_version_id_fkey;
ALTER TABLE public.design_documents
  ADD CONSTRAINT design_documents_current_version_id_fkey
  FOREIGN KEY (current_version_id)
  REFERENCES public.design_document_versions(id)
  ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Assets (base plates, icons, photos) — JSON stores assetId + version only
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.design_assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NULL REFERENCES public.design_projects(id) ON DELETE CASCADE,
  kind            text NOT NULL
                    CHECK (kind IN (
                      'base_plate', 'icon', 'photo', 'svg_graphic', 'upload', 'font_preview'
                    )),
  name            text NOT NULL,
  tags            text[] NOT NULL DEFAULT '{}',
  category        text NULL,
  storage_path    text NOT NULL,
  public_url      text NULL,
  mime_type       text NOT NULL,
  size_bytes      bigint NULL,
  width_px        integer NULL,
  height_px       integer NULL,
  content_sha256  text NOT NULL,
  version         integer NOT NULL DEFAULT 1,
  licence_status  text NOT NULL DEFAULT 'unknown'
                    CHECK (licence_status IN (
                      'unknown', 'allowed', 'restricted', 'forbidden'
                    )),
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by      text NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS design_assets_project_kind_idx
  ON public.design_assets (project_id, kind);
CREATE INDEX IF NOT EXISTS design_assets_tags_idx
  ON public.design_assets USING gin (tags);
CREATE INDEX IF NOT EXISTS design_assets_sha_idx
  ON public.design_assets (content_sha256);

-- ---------------------------------------------------------------------------
-- Swatches / mini brand kits per project
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.design_swatches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.design_projects(id) ON DELETE CASCADE,
  name            text NOT NULL,
  hex             text NOT NULL,
  role            text NULL,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS design_swatches_project_idx
  ON public.design_swatches (project_id, sort_order);

-- ---------------------------------------------------------------------------
-- Immutable template releases (compiled render plans)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.design_template_releases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.design_projects(id) ON DELETE CASCADE,
  document_id     uuid NOT NULL REFERENCES public.design_documents(id) ON DELETE CASCADE,
  document_version integer NOT NULL,
  document_version_id uuid NOT NULL REFERENCES public.design_document_versions(id),
  render_plan     jsonb NOT NULL,
  render_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'released'
                    CHECK (status IN ('released', 'superseded', 'revoked')),
  preflight       jsonb NOT NULL DEFAULT '{}'::jsonb,
  released_by     text NULL,
  released_at     timestamptz NOT NULL DEFAULT now(),
  superseded_at   timestamptz NULL
);

CREATE INDEX IF NOT EXISTS design_template_releases_project_idx
  ON public.design_template_releases (project_id, released_at DESC);

-- ---------------------------------------------------------------------------
-- Render queue + outputs + guest overrides
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.design_render_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id      uuid NOT NULL REFERENCES public.design_template_releases(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES public.design_projects(id) ON DELETE CASCADE,
  kind            text NOT NULL DEFAULT 'guest_bulk'
                    CHECK (kind IN ('preview', 'stress_test', 'guest_bulk', 'single_guest')),
  status          text NOT NULL DEFAULT 'queued'
                    CHECK (status IN (
                      'queued', 'processing', 'completed', 'failed', 'cancelled'
                    )),
  total_count     integer NOT NULL DEFAULT 0,
  completed_count integer NOT NULL DEFAULT 0,
  warning_count   integer NOT NULL DEFAULT 0,
  failed_count    integer NOT NULL DEFAULT 0,
  params          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by      text NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz NULL,
  finished_at     timestamptz NULL
);

CREATE INDEX IF NOT EXISTS design_render_jobs_status_idx
  ON public.design_render_jobs (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.design_render_outputs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid NOT NULL REFERENCES public.design_render_jobs(id) ON DELETE CASCADE,
  release_id      uuid NOT NULL REFERENCES public.design_template_releases(id) ON DELETE CASCADE,
  guest_id        uuid NULL,
  guest_key       text NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN (
                      'pending', 'ready', 'warning', 'blocked', 'failed'
                    )),
  block_reason    text NULL,
  storage_path    text NULL,
  public_url      text NULL,
  width_px        integer NULL,
  height_px       integer NULL,
  content_sha256  text NULL,
  render_params   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS design_render_outputs_job_idx
  ON public.design_render_outputs (job_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS design_render_outputs_release_guest_uidx
  ON public.design_render_outputs (release_id, guest_id)
  WHERE guest_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.design_guest_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id      uuid NOT NULL REFERENCES public.design_template_releases(id) ON DELETE CASCADE,
  guest_id        uuid NOT NULL,
  overrides       jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes           text NULL,
  created_by      text NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (release_id, guest_id)
);

-- ---------------------------------------------------------------------------
-- Optimistic save: append version only if caller's base version matches
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_design_document(
  p_document_id uuid,
  p_base_version integer,
  p_document jsonb,
  p_change_summary text DEFAULT NULL,
  p_author text DEFAULT NULL
)
RETURNS TABLE (
  ok boolean,
  version integer,
  version_id uuid,
  conflict_current_version integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current integer;
  v_new integer;
  v_id uuid;
BEGIN
  SELECT d.current_version INTO v_current
    FROM public.design_documents d
   WHERE d.id = p_document_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  IF v_current IS DISTINCT FROM p_base_version THEN
    RETURN QUERY SELECT false, v_current, NULL::uuid, v_current;
    RETURN;
  END IF;

  v_new := v_current + 1;

  INSERT INTO public.design_document_versions (
    document_id, version, document, change_summary, created_by
  ) VALUES (
    p_document_id, v_new, p_document, p_change_summary, p_author
  )
  RETURNING id INTO v_id;

  UPDATE public.design_documents
     SET current_version = v_new,
         current_version_id = v_id,
         updated_at = now()
   WHERE id = p_document_id;

  UPDATE public.design_projects p
     SET updated_at = now(),
         updated_by = COALESCE(p_author, p.updated_by)
    FROM public.design_documents d
   WHERE d.id = p_document_id
     AND p.id = d.project_id;

  RETURN QUERY SELECT true, v_new, v_id, NULL::integer;
END;
$$;

REVOKE ALL ON FUNCTION public.save_design_document(uuid, integer, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_design_document(uuid, integer, jsonb, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Storage bucket for design assets (private; admin uses signed/public URLs)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('design-assets', 'design-assets', false, 52428800)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS: service role / admin client; no direct anon access
-- ---------------------------------------------------------------------------
ALTER TABLE public.design_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_swatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_template_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_render_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_render_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_guest_overrides ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.design_projects IS
  'Opus Design Studio projects (master templates or event customisations).';
COMMENT ON TABLE public.design_document_versions IS
  'Append-only Design Document JSON versions — source of truth for Studio artwork.';
COMMENT ON TABLE public.design_template_releases IS
  'Immutable compiled render plans for production personalisation.';
