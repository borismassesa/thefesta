-- Delete the couple WORKSPACE without deleting the login behind it.
--
-- THE BUG THIS FIXES
--
-- 20260730030000 established that couple-ness and vendor-ness are properties of
-- a workspace, never of a login: one `public.users` row may own a couple
-- workspace, a vendor storefront, both, or neither. The admin create flow
-- already honours that (it adopts a vendor-owning login and adds the couple side
-- to it). Deletion did not: it only knew how to delete the `users` row, and
-- `vendors.user_id` CASCADEs from `users`, so removing a couple would have
-- destroyed a live vendor business.
--
-- Admin therefore refused outright and told staff to "delete the vendor from
-- Operations, Vendors first" — advice that destroys a real storefront, and the
-- only route it offered. Two production logins are in this state, both real
-- dual-identity humans (a couple planning their own wedding who also sell on the
-- marketplace).
--
-- THE FIX
--
-- Make the couple side independently removable. This function deletes every
-- couple-scoped row for a login and leaves everything that belongs to the login
-- or to its vendor side alone:
--
--   deleted  couple_accounts, couple_profiles, wedding_events and all the
--            planning data hanging off them (guests, invitations, RSVPs,
--            pledges, registry, guestbook, seating, scanner tokens, credits),
--            plus the couple's own vendor reviews and saved/inspiration lists.
--   kept     public.users and its Clerk login, vendors + vendor_memberships,
--            payments/invoices/inquiries, notifications, push tokens, and
--            invitation_orders (the caller detaches those to the unattributed
--            banner before calling this, so the revenue stays visible).
--
-- Order is leaf-first. Most of these also CASCADE from the rows below them, so
-- the explicit deletes are belt-and-braces; what they buy is that the whole
-- teardown is one statement, hence one transaction, with no half-deleted
-- workspace if a later table errors.
--
-- Full-account deletion (a login with no vendor side) still deletes the `users`
-- row and lets CASCADE do the work — it is unchanged, and this function is not
-- part of that path.

CREATE OR REPLACE FUNCTION public.delete_couple_workspace(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'delete_couple_workspace requires a user id';
  END IF;

  -- Leaves: rows that hang off the planning entities below.
  DELETE FROM public.seating_assignments      WHERE user_id = p_user_id;
  DELETE FROM public.rsvp_answers             WHERE user_id = p_user_id;
  DELETE FROM public.gift_registry_claims     WHERE user_id = p_user_id;
  DELETE FROM public.guest_message_log        WHERE user_id = p_user_id;
  DELETE FROM public.pledge_reminder_log      WHERE user_id = p_user_id;
  DELETE FROM public.guestbook_entries        WHERE user_id = p_user_id;
  DELETE FROM public.whatsapp_messages        WHERE user_id = p_user_id;
  DELETE FROM public.credit_consumptions      WHERE user_id = p_user_id;

  -- Planning entities.
  DELETE FROM public.guest_invitations        WHERE user_id = p_user_id;
  DELETE FROM public.guest_contacts           WHERE user_id = p_user_id;
  DELETE FROM public.seating_tables           WHERE user_id = p_user_id;
  DELETE FROM public.rsvp_questions           WHERE user_id = p_user_id;
  DELETE FROM public.gift_registry_items      WHERE user_id = p_user_id;
  DELETE FROM public.event_pledges            WHERE user_id = p_user_id;
  DELETE FROM public.scanner_access_tokens    WHERE user_id = p_user_id;
  DELETE FROM public.entitlement_adjustments  WHERE user_id = p_user_id;

  -- Couple-side lists and content. `reviews` here is what the couple wrote
  -- ABOUT vendors; reviews OF this login's storefront are keyed by vendor_id
  -- and survive with the storefront.
  DELETE FROM public.reviews                    WHERE user_id = p_user_id;
  DELETE FROM public.saved_vendors               WHERE user_id = p_user_id;
  DELETE FROM public.inspiration_items           WHERE user_id = p_user_id;
  DELETE FROM public.invitation_product_favorites WHERE user_id = p_user_id;
  DELETE FROM public.couple_account_notes        WHERE user_id = p_user_id;

  DELETE FROM public.wedding_events           WHERE user_id = p_user_id;
  DELETE FROM public.couple_profiles          WHERE user_id = p_user_id;

  -- Last: the workspace row itself is what makes the login a couple, so it goes
  -- only once everything it stood for is gone.
  DELETE FROM public.couple_accounts          WHERE user_id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.delete_couple_workspace(UUID) IS
  'Removes the couple-side workspace and all its data for one login, leaving public.users, the Clerk login and any vendor storefront intact. Used by admin when deleting a couple whose login is also a vendor. Callers detach invitation_orders first.';

-- Postgres grants EXECUTE to PUBLIC by default, which PostgREST would expose as
-- an /rpc endpoint any signed-in user could call on any other user's id.
REVOKE ALL ON FUNCTION public.delete_couple_workspace(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_couple_workspace(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.delete_couple_workspace(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_couple_workspace(UUID) TO service_role;
