-- Saving a layout, and activating one, as two separate things.
--
-- Two problems this closes, both of which are invisible until they bite.
--
-- 1. LOST UPDATES. The Studio can be open in two tabs, or by two people. A
--    layout is an afternoon of deliberate box-dragging, and a last-write-wins
--    column discards one of them with no trace and no error. Worse: an admin can
--    load a card, a designer can re-upload the artwork, and the admin can then
--    save boxes measured against geometry that no longer exists.
--
-- 2. SAVING IS NOT ACTIVATING. If one jsonb column is both the draft and the
--    live layout, then pressing Save on a card that is currently selling changes
--    what every order of that card renders, immediately, with no review. So the
--    product row carries TWO revision pointers and the revision table is the
--    real source of truth:
--
--      active_layout_revision_id   what production renders. Only ever moved by
--                                  an explicit activation.
--      draft_layout_revision_id    what the Studio is editing. Moved on save.
--
--    An active card being edited stays active on its OLD revision until somebody
--    activates the new one.
--
-- Both operations are database functions rather than application code, because
-- the check and the write have to be one transaction, and because a contract
-- that lives in the database cannot be bypassed by the next caller who forgets
-- it. FOR UPDATE rather than a conditional UPDATE alone: these also insert a
-- revision row, and a conditional update cannot serialise that.

alter table public.website_invitations_products
  add column if not exists active_layout_revision_id uuid
    references public.invitation_card_layout_revisions(id) on delete set null,
  add column if not exists draft_layout_revision_id uuid
    references public.invitation_card_layout_revisions(id) on delete set null;

comment on column public.website_invitations_products.active_layout_revision_id is
  'The layout revision production renders. Moved ONLY by activate_card_layout, never by a save.';

comment on column public.website_invitations_products.draft_layout_revision_id is
  'The layout revision the Studio is editing. A card that is already active keeps rendering its active revision while this differs.';

-- 'draft' joins the lifecycle: an edited-but-not-approved layout.
do $$
begin
  alter table public.website_invitations_products
    drop constraint if exists website_invitations_products_card_layout_state;
  alter table public.website_invitations_products
    add constraint website_invitations_products_card_layout_state
    check (card_layout_state in ('none', 'derived', 'draft', 'review_required', 'active', 'blocked'));
end $$;


-- ── Save ──
--
-- Returns a structured result rather than raising, because every failure here is
-- something an admin standing at the screen has to be told precisely: which
-- revision they were on, which one is current, and whether the artwork moved
-- underneath them. An exception string cannot carry that.
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

  -- A save NEVER activates. A card that is live stays live on its existing
  -- active revision; the edit lands as a draft beside it.
  v_next_state := case
    when p_state in ('blocked', 'review_required') then p_state
    when v_current_state = 'none' then 'draft'
    else 'draft'
  end;

  v_new_revision := v_current_revision + 1;

  insert into public.invitation_card_layout_revisions
    (product_id, revision, artwork_sha256, layout, card_layout_state, created_by, change_summary)
  values
    (p_product_id, v_new_revision, p_expected_artwork_sha, p_layout, v_next_state,
     coalesce(p_author, ''), coalesce(p_summary, ''))
  returning id into v_revision_id;

  update public.website_invitations_products
  set card_layout = p_layout,
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
    'activeRevisionId', v_active
  );
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, and PostgREST would then expose
-- this as an anonymous RPC that rewrites any card's layout.
revoke all on function public.save_card_layout(text, bigint, text, jsonb, text, text, text) from public, anon, authenticated;


-- ── Activate ──
--
-- Deliberately a separate call with its own expected revision. Activating is the
-- moment production output changes, and it should be an act somebody performs
-- knowing exactly which revision they are promoting.
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
begin
  select card_layout_revision, coalesce(artwork_sha256, '')
    into v_current_revision, v_current_sha
  from public.website_invitations_products
  where id = p_product_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND');
  end if;

  select revision, artwork_sha256 into v_revision, v_revision_sha
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
  set card_layout_state = 'active',
      active_layout_revision_id = p_revision_id,
      card_layout_activated_at = now(),
      card_layout_activated_by = coalesce(p_author, ''),
      updated_at = now()
  where id = p_product_id;

  return jsonb_build_object('ok', true, 'revision', v_revision, 'revisionId', p_revision_id);
end;
$$;

revoke all on function public.activate_card_layout(text, uuid, text) from public, anon, authenticated;
