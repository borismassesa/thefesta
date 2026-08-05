-- The layout a release was frozen against.
--
-- This is the correctness lynchpin of the whole layout engine, and it is worth
-- being explicit about why a snapshot is needed at all when the released SVG is
-- already frozen.
--
-- Every order-scope value IS baked into that file: names, dates, venues, the
-- palette. Those cannot drift. But ONE role is deliberately not — guest_name is
-- substituted per guest, after the release, by renderCardForGuest. That
-- substitution needs the field's box, size, fit policy and font metrics, and
-- until now the only place those existed was the product row.
--
-- Reading them from the product row would mean that an admin widening a guest
-- name box in the Studio silently re-lays-out cards for an order that went to
-- two hundred guests last week. Some of those guests would have received one
-- rendering and the rest another, from the same "frozen" release, with nothing
-- anywhere recording that it changed.
--
-- So the layout travels with the release. prepare-guest-asset.ts reads THIS
-- column, never website_invitations_products.card_layout — the same rule, for
-- the same reason, as renderCardForGuest refusing to re-apply any binding other
-- than the guest one.
--
-- Empty '{}' is the correct and expected value for every release frozen before
-- this existed, and for any card still running on the artwork exactly as drawn.
-- It means "no layout", which routes guest substitution back through the
-- in-place renderer in card-render.ts, i.e. precisely what those releases were
-- frozen with.

-- THE MANIFEST is the other half of the same problem, and the less obvious one.
--
-- Freezing the layout pins the boxes. It does not pin the FONT METRICS those
-- boxes were measured with, the wrapping rules that chose the line breaks, or
-- the renderer that placed the baselines. Re-extract a face's advance widths
-- six months from now — a wider code-point repertoire, a fixed bug — and
-- regenerating a guest asset for an old release could produce a different line
-- break from the one that guest already received.
--
-- So the release records the exact dependency set it was produced from. It does
-- not duplicate the metrics: card_fonts rows are content-addressed by
-- content_sha256, so naming the SHA identifies the bytes. What matters is that
-- the release can SAY which ones, and that a mismatch is detectable rather than
-- silent.

alter table public.invitation_card_design_releases
  add column if not exists layout_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists render_manifest jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invitation_card_design_releases_layout_object'
  ) then
    alter table public.invitation_card_design_releases
      add constraint invitation_card_design_releases_layout_object
      check (jsonb_typeof(layout_snapshot) = 'object');
  end if;
end $$;

comment on column public.invitation_card_design_releases.layout_snapshot is
  'The card layout as it stood when this release was frozen. Read by the per-guest render path so that editing a card''s layout can never change cards already sent. Empty means the release was frozen with no layout, and guest substitution uses the in-place renderer.';

comment on column public.invitation_card_design_releases.render_manifest is
  'The full dependency set this file was produced from: { schemaVersion, rendererVersion, fitVersion, artworkSha256, layoutSha256, bindingSha256, fonts: [{ primary, weight, italic, fontSha256, metricsSha256 }] }. Lets a per-guest render years later be reproduced, or its drift detected, rather than silently re-laid-out by newer code.';
