-- Post-apply verification for 20260805000000_guest_invitation_pass_id.sql
--
-- Run against the target database AFTER applying the migration. Read-only
-- except for the trigger tests, which insert and then roll back — nothing
-- survives.
--
-- GATE: every query below must report PASS.

-- ── 1) Every invitation has a pass_id, and they are unique ────────────────
SELECT
  count(*)                                                   AS invitations,
  count(pass_id)                                             AS with_pass_id,
  count(DISTINCT pass_id)                                    AS distinct_pass_ids,
  count(*) FILTER (WHERE pass_id !~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$') AS malformed,
  CASE
    WHEN count(*) = count(pass_id)
     AND count(*) = count(DISTINCT pass_id)
     AND count(*) FILTER (WHERE pass_id !~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$') = 0
    THEN 'PASS' ELSE 'FAIL'
  END AS verdict
FROM public.guest_invitations;

-- ── 2) The schema objects exist and are shaped correctly ─────────────────
SELECT
  (SELECT is_nullable FROM information_schema.columns
    WHERE table_name = 'guest_invitations' AND column_name = 'pass_id')   AS pass_id_nullable,
  EXISTS (SELECT 1 FROM pg_indexes
    WHERE tablename = 'guest_invitations' AND indexname = 'idx_guest_invitations_pass_id') AS unique_index,
  EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname = 'guest_invitations_pass_id_format')                   AS format_check,
  EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_guest_invitations_pass_id')                       AS insert_trigger,
  CASE WHEN
      (SELECT is_nullable FROM information_schema.columns
        WHERE table_name = 'guest_invitations' AND column_name = 'pass_id') = 'NO'
    AND EXISTS (SELECT 1 FROM pg_indexes
        WHERE tablename = 'guest_invitations' AND indexname = 'idx_guest_invitations_pass_id')
    AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guest_invitations_pass_id_format')
    AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guest_invitations_pass_id')
    THEN 'PASS' ELSE 'FAIL' END AS verdict;

-- ── 3) Behavioural tests. Everything here is rolled back. ────────────────
DO $$
DECLARE
  test_user UUID;
  test_event UUID;
  test_guest UUID;
  new_id UUID;
  generated TEXT;
  taken TEXT;
  failed BOOLEAN;
BEGIN
  SELECT user_id, event_id, guest_contact_id INTO test_user, test_event, test_guest
  FROM public.guest_invitations LIMIT 1;
  IF test_user IS NULL THEN
    RAISE NOTICE 'SKIP: no invitations to test against';
    RETURN;
  END IF;

  -- 3a) The trigger assigns a well-formed pass_id on insert.
  INSERT INTO public.guest_invitations (user_id, guest_contact_id, event_id)
  VALUES (test_user, test_guest, test_event)
  RETURNING id, pass_id INTO new_id, generated;

  ASSERT generated ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$',
    format('trigger produced a malformed pass_id: %L', generated);
  RAISE NOTICE 'PASS 3a: trigger assigned %', generated;

  -- 3b) An explicitly supplied pass_id is honoured, so a restore keeps its
  --     original identifiers instead of reissuing every guest's pass.
  DELETE FROM public.guest_invitations WHERE id = new_id;
  INSERT INTO public.guest_invitations (user_id, guest_contact_id, event_id, pass_id)
  VALUES (test_user, test_guest, test_event, 'ZZZZZZZZ')
  RETURNING id, pass_id INTO new_id, generated;
  ASSERT generated = 'ZZZZZZZZ', 'explicit pass_id was overwritten by the trigger';
  RAISE NOTICE 'PASS 3b: explicit pass_id honoured';

  -- 3c) A duplicate pass_id is refused by the unique index.
  SELECT pass_id INTO taken FROM public.guest_invitations WHERE id <> new_id LIMIT 1;
  failed := false;
  BEGIN
    UPDATE public.guest_invitations SET pass_id = taken WHERE id = new_id;
  EXCEPTION WHEN unique_violation THEN failed := true;
  END;
  ASSERT failed, 'the unique index did NOT refuse a duplicate pass_id';
  RAISE NOTICE 'PASS 3c: duplicate refused';

  -- 3d) A malformed pass_id is refused by the CHECK constraint. Lowercase and
  --     the ambiguous letters must not be storable, or a hand-written fix
  --     could produce a value that never matches what is printed on a ticket.
  failed := false;
  BEGIN
    UPDATE public.guest_invitations SET pass_id = 'abcdefgh' WHERE id = new_id;
  EXCEPTION WHEN check_violation THEN failed := true;
  END;
  ASSERT failed, 'the CHECK constraint accepted a lowercase pass_id';

  failed := false;
  BEGIN
    UPDATE public.guest_invitations SET pass_id = 'IL0UIL0U' WHERE id = new_id;
  EXCEPTION WHEN check_violation THEN failed := true;
  END;
  ASSERT failed, 'the CHECK constraint accepted ambiguous characters (I/L/O/U)';

  failed := false;
  BEGIN
    UPDATE public.guest_invitations SET pass_id = 'ABC123' WHERE id = new_id;
  EXCEPTION WHEN check_violation THEN failed := true;
  END;
  ASSERT failed, 'the CHECK constraint accepted a pass_id of the wrong length';
  RAISE NOTICE 'PASS 3d: malformed values refused';

  -- 3e) NOT NULL holds.
  failed := false;
  BEGIN
    UPDATE public.guest_invitations SET pass_id = NULL WHERE id = new_id;
  EXCEPTION WHEN not_null_violation THEN failed := true;
  END;
  ASSERT failed, 'pass_id accepted NULL';
  RAISE NOTICE 'PASS 3e: NOT NULL holds';

  -- Undo everything this block did.
  RAISE EXCEPTION 'pass_id verification complete — rolling back (this is expected)';
END $$;
