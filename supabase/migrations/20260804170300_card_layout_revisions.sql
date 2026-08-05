-- Every version of a card's layout, kept.
--
-- The Studio is a production design tool: an admin drags a guest-name box, and
-- from then on every card that order produces is laid out differently. A single
-- mutable jsonb column records none of that. When somebody asks in three weeks
-- why a guest's card wrapped onto two lines, there is nothing to look at.
--
-- What this makes possible, none of which the column alone can:
--
--   ROLLBACK      restore the layout as it was before a change.
--   AUDIT         who changed the boxes on a card that is now selling.
--   DIAGNOSIS     compare the layout a release was frozen against with the one
--                 live now, which is the first question when a card changes.
--   RE-EXPORTS    keep the layout that belonged to the previous artwork, so an
--                 admin can see what was carried forward and what was dropped.
--
-- Append-only in practice: rows are inserted, never updated. The product row's
-- card_layout_revision points at the current one.

create table if not exists public.invitation_card_layout_revisions (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.website_invitations_products(id) on delete cascade,
  -- Matches website_invitations_products.card_layout_revision at the time of
  -- the save, so the two can always be lined up.
  revision bigint not null,
  -- The artwork these boxes were derived against. Without it a restored
  -- revision could be applied to geometry it was never measured on.
  artwork_sha256 text not null default '',
  layout jsonb not null default '{}'::jsonb,
  -- The state this save moved the card to, so activation is auditable too and
  -- not just box geometry.
  card_layout_state text not null default 'derived',
  created_by text not null default '',
  change_summary text not null default '',
  created_at timestamptz not null default now(),

  unique (product_id, revision)
);

comment on table public.invitation_card_layout_revisions is
  'Append-only history of a card''s layout. Supports rollback, audit, and answering "why did this guest''s card change" by comparing against the layout a release was frozen with.';

create index if not exists invitation_card_layout_revisions_product_idx
  on public.invitation_card_layout_revisions (product_id, revision desc);

alter table public.invitation_card_layout_revisions enable row level security;

-- Service role only, matching every other card table. Layout is catalogue
-- configuration, reached through admin server actions that check a role; no
-- browser session has any business reading or writing it directly.
revoke all on public.invitation_card_layout_revisions from anon, authenticated;
