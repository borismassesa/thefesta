-- Where each field sits on a card, and how far it may adapt.
--
-- Until now the artwork decided this and nothing could revisit it. A designer
-- allots a guest name 320 points in Illustrator, and that is final for every
-- guest who ever receives the card — including 'Prof. Dr. Eng. Arch. Benjamin
-- Emmanuel Mwakatobe'. Changing it meant reopening Illustrator, re-exporting,
-- re-uploading and re-mapping. Nothing in the product noticed a name that did
-- not fit; the renderer wrote it and the rasteriser drew it off the edge.
--
-- Two things this column deliberately is NOT:
--
--   IT IS NOT THE ARTWORK. The SVG stays the source of truth for geometry.
--   Layout is DERIVED from it on read (deriveLayout in packages/lib/card-layout.ts)
--   and this column holds only what an admin has since changed. A card nobody
--   has opened in the Studio has '{}' here and renders byte-for-byte as it does
--   today — which is what makes it safe to switch the engine on across a live
--   catalogue in one go.
--
--   IT IS NOT THE BINDING. field_bindings answers "which layer is this role",
--   has its own server-side validation, and is what decides whether a card can
--   take an order. This answers "where and how big". Keeping them in separate
--   columns is why none of that existing validation had to be touched.
--
-- Shape (see CardLayout in packages/lib/card-layout.ts, which is the contract):
--
--   {
--     "version": 1,
--     "canvas": { "x": 0, "y": 0, "width": 419.53, "height": 595.28 },
--     "fields": { "<role>": { box, baseline, ctm, align, font, fit, ... } },
--     "elements": [],     -- overlay images/shapes/QR the artwork does not have
--     "groups":   [],     -- vertical auto-layout, so a wrapped venue pushes
--                         -- the RSVP line down instead of landing on it
--     "safeZones":[]      -- regions the artwork reserves for decoration
--   }
--
-- Boxes are in the text element's LOCAL coordinate space with its transform
-- carried alongside, so a box can be edited without ever inverting a matrix.

alter table public.website_invitations_products
  add column if not exists card_layout jsonb not null default '{}'::jsonb,
  -- DERIVING IS NOT ACTIVATING. Reading a card produces a proposed layout;
  -- this column is what decides whether the layout engine actually renders it.
  -- Without the separation, opening a card in the Studio — or a backfill job
  -- merely looking at it — would silently change production output for a card
  -- that has already been sold. Only 'active' routes through the layout engine;
  -- everything else keeps the in-place renderer it has always used.
  add column if not exists card_layout_state text not null default 'none',
  add column if not exists card_layout_derived_at timestamptz,
  add column if not exists card_layout_activated_at timestamptz,
  add column if not exists card_layout_activated_by text,
  -- Optimistic concurrency. The Studio can be open in two tabs or by two
  -- admins, and a layout is a production design artefact: a lost update is
  -- somebody's afternoon of box-dragging, silently discarded.
  add column if not exists card_layout_revision bigint not null default 0,
  -- Which artwork the stored boxes were derived against. A save whose SHA no
  -- longer matches is rejected rather than applied to geometry that has moved
  -- underneath it.
  add column if not exists artwork_sha256 text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'website_invitations_products_card_layout_state'
  ) then
    alter table public.website_invitations_products
      add constraint website_invitations_products_card_layout_state
      check (card_layout_state in ('none', 'derived', 'review_required', 'active', 'blocked'));
  end if;
end $$;

-- An array or a scalar here would fail deep inside the renderer on a card
-- somebody is trying to release, rather than at the write that caused it.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'website_invitations_products_card_layout_object'
  ) then
    alter table public.website_invitations_products
      add constraint website_invitations_products_card_layout_object
      check (jsonb_typeof(card_layout) = 'object');
  end if;
end $$;

comment on column public.website_invitations_products.card_layout is
  'Admin OVERRIDES only, keyed by layout field id (not by role — one role can appear twice on a card). The derived half is recomputed from the current artwork on every read, so a re-export needs no migration. See CardLayoutOverrides in packages/lib/card-layout.ts.';

comment on column public.website_invitations_products.card_layout_state is
  'none | derived | review_required | active | blocked. Only ''active'' makes the layout engine authoritative for rendering; deriving a layout never sets this on its own.';

comment on column public.website_invitations_products.card_layout_revision is
  'Bumped on every layout save. A save that does not match the revision it was loaded at is rejected as a conflict rather than overwriting another admin''s work.';

comment on column public.website_invitations_products.artwork_sha256 is
  'SHA-256 of the artwork the stored layout was derived against. A layout save is rejected when it no longer matches, because the geometry has moved underneath the boxes.';

-- Which cards need a human before they can be activated, and which are live.
-- Partial, so it stays small while most of the catalogue is untouched.
create index if not exists website_invitations_products_layout_state_idx
  on public.website_invitations_products (card_layout_state, updated_at)
  where card_layout_state <> 'none';
