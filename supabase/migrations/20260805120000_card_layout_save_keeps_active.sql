-- Make save_card_layout() and activate_card_layout() do what 20260804170400
-- says they do.
--
-- That migration's header is unambiguous: "An active card being edited stays
-- active on its OLD revision until somebody activates the new one." Two things
-- stopped it being true.
--
-- 1. THE STATE WAS ALWAYS DEMOTED TO 'draft'. The CASE picking the next state
--    had two branches that both produced 'draft', so an ACTIVE card came out of
--    a save as a draft:
--
--      when v_current_state = 'none' then 'draft'
--      else 'draft'                                 -- 'active' landed here
--
--    Only `card_layout_state = 'active'` puts a card on the layout engine
--    (usesLayoutEngine in packages/lib/card-layout.ts, read by freezeCardRelease
--    in lib/cms/release-card.ts). So pressing Save on a selling card silently
--    took it off the engine and back onto the in-place renderer, with no error
--    anywhere. Exactly the failure the two-pointer design was built to prevent,
--    arrived at from the other direction.
--
-- 2. THE SAVE OVERWROTE THE LIVE GEOMETRY. `card_layout` is the only layout the
--    render path reads; the revision table is never joined. Writing the draft
--    into it on every save meant that even with the state preserved, production
--    would have rendered the unapproved edit immediately.
--
-- And the mirror of the same gap on the way back:
--
-- 3. ACTIVATING NEVER PUBLISHED THE REVISION'S GEOMETRY. activate_card_layout()
--    moved active_layout_revision_id and set the state, but left `card_layout`
--    holding whatever the last save left there. Since nothing in the app reads
--    active_layout_revision_id, activating any revision other than the most
--    recent one marked the card active while rendering a different layout.
--
-- THE RULE THIS SETTLES: `card_layout` is the ACTIVE layout, and only an
-- activation may change it. Drafts live in invitation_card_layout_revisions and
-- are reached through draft_layout_revision_id. A card that has never been
-- activated has no active layout to protect, so there `card_layout` keeps
-- tracking the latest draft as before, which is what the Studio reads while a
-- card is still being set up.
--
-- Not reachable in production today: no surface imports
-- lib/cms/card-layout-actions.ts yet, so nothing can call either function. This
-- lands ahead of the Studio UI rather than behind it.

create or replace function public.save_card_layout(
  p_product_id text,
  p_expected_revision bigint,
  p_expected_artwork_sha text,
  p_layout jsonb,
  p_state text,
  p_author text,
  p_summary text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_revision bigint;
  v_current_sha text;
  v_current_state text;
  v_active uuid;
  v_new_revision bigint;
  v_revision_id uuid;
  v_next_state text;
  v_revision_state text;
  v_stays_active boolean;
begin
  if jsonb_typeof(p_layout) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'code', 'LAYOUT_INVALID');
  end if;

  -- The lock is the whole point: between the read and the write below, another
  -- tab must not be able to save, and the artwork must not be able to change.
  select card_layout_revision, coalesce(artwork_sha256, ''), card_layout_state, active_layout_revision_id
    into v_current_revision, v_current_sha, v_current_state, v_active
  from public.website_invitations_products
  where id = p_product_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND');
  end if;

  if v_current_revision is distinct from p_expected_revision then
    return jsonb_build_object(
      'ok', false,
      'code', 'LAYOUT_CONFLICT',
      'currentRevision', v_current_revision,
      'submittedRevision', p_expected_revision,
      'artworkChanged', v_current_sha is distinct from p_expected_artwork_sha
    );
  end if;

  -- Checked even when the revision matches: a re-upload changes the artwork
  -- without touching the layout, so the revision alone would let boxes measured
  -- against the old export be saved against the new one.
  if v_current_sha is distinct from p_expected_artwork_sha then
    return jsonb_build_object(
      'ok', false,
      'code', 'ARTWORK_CHANGED',
      'expectedArtworkSha256', p_expected_artwork_sha,
      'currentArtworkSha256', v_current_sha
    );
  end if;

  -- What the NEW REVISION is. A saved revision is never active: activation is
  -- the separate act, and recording a draft as 'active' in the revision table
  -- would make the history claim something was live that never was.
  v_revision_state := case
    when p_state in ('blocked', 'review_required') then p_state
    else 'draft'
  end;

  -- What the PRODUCT ROW becomes. An active card stays active and keeps
  -- rendering its active revision; the edit sits beside it as a draft. Blocked
  -- and review_required are the exception and DO demote it, because both mean
  -- the layout cannot safely be rendered, which production has to hear.
  v_stays_active := v_current_state = 'active'
    and p_state not in ('blocked', 'review_required');

  v_next_state := case when v_stays_active then 'active' else v_revision_state end;

  v_new_revision := v_current_revision + 1;

  insert into public.invitation_card_layout_revisions
    (product_id, revision, artwork_sha256, layout, card_layout_state, created_by, change_summary)
  values
    (p_product_id, v_new_revision, p_expected_artwork_sha, p_layout, v_revision_state,
     coalesce(p_author, ''), coalesce(p_summary, ''))
  returning id into v_revision_id;

  update public.website_invitations_products
  -- Left untouched while the card stays active: this column IS what the render
  -- path reads, so writing the draft here would publish it without review.
  set card_layout = case when v_stays_active then card_layout else p_layout end,
      card_layout_state = v_next_state,
      card_layout_revision = v_new_revision,
      draft_layout_revision_id = v_revision_id,
      updated_at = now()
  where id = p_product_id;

  return jsonb_build_object(
    'ok', true,
    'revision', v_new_revision,
    'revisionId', v_revision_id,
    'state', v_next_state,
    'revisionState', v_revision_state,
    'activeRevisionId', v_active
  );
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, and PostgREST would then expose
-- this as an anonymous RPC that rewrites any card's layout. Re-applied because
-- CREATE OR REPLACE on an existing function keeps its grants, but this file must
-- also be correct when replayed against a database built from scratch.
revoke all on function public.save_card_layout(text, bigint, text, jsonb, text, text, text) from public, anon, authenticated;


create or replace function public.activate_card_layout(
  p_product_id text,
  p_revision_id uuid,
  p_author text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision bigint;
  v_current_revision bigint;
  v_current_sha text;
  v_revision_sha text;
  v_revision_layout jsonb;
begin
  select card_layout_revision, coalesce(artwork_sha256, '')
    into v_current_revision, v_current_sha
  from public.website_invitations_products
  where id = p_product_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND');
  end if;

  select revision, artwork_sha256, layout
    into v_revision, v_revision_sha, v_revision_layout
  from public.invitation_card_layout_revisions
  where id = p_revision_id and product_id = p_product_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'REVISION_NOT_FOUND');
  end if;

  -- Activating a revision measured against artwork that has since been replaced
  -- would put text where the text is not. Re-derive and re-save first.
  if v_revision_sha is distinct from v_current_sha then
    return jsonb_build_object(
      'ok', false,
      'code', 'ARTWORK_CHANGED',
      'expectedArtworkSha256', v_revision_sha,
      'currentArtworkSha256', v_current_sha
    );
  end if;

  update public.website_invitations_products
  -- Publishing the chosen revision's geometry is what makes this an activation
  -- at all. card_layout_revision is deliberately NOT touched: it is the save
  -- concurrency counter, and moving it here would invalidate an open Studio tab
  -- that has nothing wrong with it.
  set card_layout = v_revision_layout,
      card_layout_state = 'active',
      active_layout_revision_id = p_revision_id,
      card_layout_activated_at = now(),
      card_layout_activated_by = coalesce(p_author, ''),
      updated_at = now()
  where id = p_product_id;

  return jsonb_build_object('ok', true, 'revision', v_revision, 'revisionId', p_revision_id);
end;
$$;

revoke all on function public.activate_card_layout(text, uuid, text) from public, anon, authenticated;
