-- Admit any invited guest at the door, not only the ones who replied.
--
-- WHY
-- The pass is the product. It exists from the moment a guest is invited, and
-- the couple hands it out by hand when WhatsApp refuses to deliver — which on
-- the live event is 30 of 137 guests, with 88 more who simply never replied.
--
-- Until now those tickets rendered and then failed at the gate. The refusal
-- lived here, not in the API: this function carried its own
-- `rsvp_status = 'attending'` predicate, and being SECURITY DEFINER, no route
-- change could reach it. The result was the worst outcome available — a guest
-- at the door holding a real, freshly-minted pass, told they are not on the
-- list, in front of everybody else arriving.
--
-- A wedding would rather seat somebody than argue with them. So an invitation
-- is now enough.
--
-- WHAT IS UNCHANGED
-- Everything that protects the count. `entry_allowance` still bounds how many
-- people a pass admits, the idempotency claim on `request_id` still collapses
-- retries, and `wrong_event` / `not_found` still refuse a pass that does not
-- belong here. This widens WHO may be admitted, never HOW MANY.
--
-- The 'not_attending' result is retained in the return contract because
-- callers still match on it; it simply stops being produced.

CREATE OR REPLACE FUNCTION public.checkin_admit_guest(
  p_guest_invitation_id uuid,
  p_event_id uuid,
  p_admit_count integer DEFAULT NULL::integer,
  p_checked_in_by text DEFAULT NULL::text,
  p_checked_in_door text DEFAULT NULL::text,
  p_request_id uuid DEFAULT NULL::uuid,
  p_source text DEFAULT 'api'::text
)
RETURNS TABLE(
  result text,
  is_replay boolean,
  admitted_now integer,
  total_admitted integer,
  allowance integer,
  first_admitted_at timestamp with time zone,
  rsvp_party_size integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv        guest_invitations;
  v_claim_rows INT := 0;
  v_prior      checkin_scan_events;
  v_updated    guest_invitations;
  v_admitted   INT := 0;
  v_updated_rows INT := 0;
  v_result     TEXT;
BEGIN
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'checkin_admit_guest requires p_event_id';
  END IF;

  SELECT * INTO v_inv FROM guest_invitations WHERE id = p_guest_invitation_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, FALSE, 0, 0, 0, NULL::TIMESTAMPTZ, 0;
    RETURN;
  END IF;

  IF v_inv.event_id <> p_event_id THEN
    RETURN QUERY SELECT 'wrong_event'::TEXT, FALSE, 0, v_inv.checked_in_count, v_inv.entry_allowance,
                        v_inv.checked_in_at, COALESCE(v_inv.party_size, 1);
    RETURN;
  END IF;

  IF p_request_id IS NOT NULL THEN
    INSERT INTO checkin_scan_events (
      request_id, guest_invitation_id, event_id, checked_in_by, checked_in_door, source
    ) VALUES (
      p_request_id, v_inv.id, v_inv.event_id, p_checked_in_by, p_checked_in_door,
      COALESCE(p_source, 'api')
    )
    ON CONFLICT (request_id) DO NOTHING;

    GET DIAGNOSTICS v_claim_rows = ROW_COUNT;

    IF v_claim_rows = 0 THEN
      SELECT * INTO v_prior FROM checkin_scan_events WHERE request_id = p_request_id;

      IF v_prior.guest_invitation_id <> p_guest_invitation_id
         OR v_prior.event_id <> p_event_id
         OR v_prior.source = 'amend' THEN
        RETURN QUERY SELECT 'request_conflict'::TEXT, FALSE, 0,
                            v_inv.checked_in_count, v_inv.entry_allowance,
                            v_inv.checked_in_at, COALESCE(v_inv.party_size, 1);
        RETURN;
      END IF;

      RETURN QUERY SELECT COALESCE(v_prior.result, 'in_progress'), TRUE,
                          COALESCE(v_prior.admitted_count, 0),
                          COALESCE(v_prior.total_after, v_inv.checked_in_count),
                          COALESCE(v_prior.allowance_after, v_inv.entry_allowance),
                          v_inv.checked_in_at, COALESCE(v_inv.party_size, 1);
      RETURN;
    END IF;
  END IF;

  PERFORM set_config('opuspass.checkin_writer', 'on', TRUE);

  -- The `rsvp_status = 'attending'` predicate that used to sit in this WHERE is
  -- deliberately gone. The allowance bounds below are what keep a pass honest.
  UPDATE guest_invitations gi
  SET checked_in_count = gi.checked_in_count
                       + COALESCE(p_admit_count, gi.entry_allowance - gi.checked_in_count),
      checked_in_at = COALESCE(gi.checked_in_at, now()),
      checked_in_by = COALESCE(gi.checked_in_by, p_checked_in_by),
      checked_in_door = COALESCE(gi.checked_in_door, p_checked_in_door),
      checked_in_party_size = gi.checked_in_count
                            + COALESCE(p_admit_count, gi.entry_allowance - gi.checked_in_count)
  WHERE gi.id = p_guest_invitation_id
    AND gi.event_id = p_event_id
    AND COALESCE(p_admit_count, gi.entry_allowance - gi.checked_in_count) >= 1
    AND gi.checked_in_count
      + COALESCE(p_admit_count, gi.entry_allowance - gi.checked_in_count) <= gi.entry_allowance
  RETURNING * INTO v_updated;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  PERFORM set_config('opuspass.checkin_writer', 'off', TRUE);

  IF v_updated_rows > 0 THEN
    v_admitted := v_updated.checked_in_count - v_inv.checked_in_count;

    IF p_request_id IS NOT NULL THEN
      UPDATE checkin_scan_events
      SET result = 'admitted', admitted_count = v_admitted,
          total_after = v_updated.checked_in_count,
          allowance_after = v_updated.entry_allowance,
          completed_at = clock_timestamp()
      WHERE request_id = p_request_id;
    END IF;

    RETURN QUERY SELECT 'admitted'::TEXT, FALSE, v_admitted, v_updated.checked_in_count,
                        v_updated.entry_allowance, v_updated.checked_in_at,
                        COALESCE(v_updated.party_size, 1);
    RETURN;
  END IF;

  SELECT * INTO v_inv FROM guest_invitations WHERE id = p_guest_invitation_id;

  -- The only way to reach here now is a pass with nothing left on it: the RSVP
  -- status no longer decides anything.
  v_result := 'exhausted';

  IF p_request_id IS NOT NULL THEN
    UPDATE checkin_scan_events
    SET result = v_result, admitted_count = 0,
        total_after = v_inv.checked_in_count,
        allowance_after = v_inv.entry_allowance,
        completed_at = clock_timestamp()
    WHERE request_id = p_request_id;
  END IF;

  RETURN QUERY SELECT v_result, FALSE, 0, v_inv.checked_in_count, v_inv.entry_allowance,
                      v_inv.checked_in_at, COALESCE(v_inv.party_size, 1);
END;
$function$;
