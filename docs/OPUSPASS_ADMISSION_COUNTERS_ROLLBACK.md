# OpusPass admission counters: rollback and operational note

Covers migration `20260802210000_opuspass_admission_counters.sql` (PR 1 of the
Wallet Entry Pass work).

## What changed

Door check-in stopped being a boolean (`checked_in_at IS NULL`, first scan
wins) and became a bounded counter on `guest_invitations`:

| Column | Meaning after this migration |
| --- | --- |
| `entry_allowance` | how many people this pass may admit in total |
| `checked_in_count` | how many have walked in. **Source of truth** |
| `checked_in_at` / `_by` / `_door` | the **first** admission only, then frozen |
| `checked_in_party_size` | deprecated mirror of `checked_in_count` |

New objects: `checkin_scan_events` (admission ledger and idempotency keys),
`guest_invitation_allowance_events` (floored allowance changes),
`checkin_admit_guest()`, `amend_guest_invitation_checkin()`, and the trigger
`trg_guest_invitations_sync_allowance`.

## Rollback: do not drop the columns

Once a single door scan has run in production, `checked_in_count` holds
admission state that exists **nowhere else**. A partially admitted party (2 of
4 through the door) cannot be reconstructed from `checked_in_at`, which is a
timestamp, nor from `party_size`, which is what the guest RSVP'd for.

Dropping the columns destroys the answer to "who is currently inside", during
an event, which is the exact moment anyone would want to roll back.

`checkin_scan_events` is the durable record of every admission. Preserve it in
every scenario below, including a full revert.

### Tier 1: application fallback (first response, no schema change)

The old contract still works. `checkin_guest_invitation()` remains, delegating
to the new function, so a client can be pointed back at it and keep admitting
guests one at a time.

To take the counter out of the decision path without touching the schema:

```sql
-- Every pass admits exactly one, restoring first-scan-wins behaviour
UPDATE guest_invitations SET entry_allowance = 1
 WHERE event_id = '<event>' AND checked_in_count <= 1;
```

Passes that already admitted more than one are deliberately excluded, because
the trigger refuses an allowance below the headcount already inside. Handle
those with Tier 2 rather than forcing them.

Reverting the API deploy alone is safe: the old code paths read
`checked_in_at` and `checked_in_party_size`, both of which this migration
keeps accurate.

### Tier 2: forward repair (preferred over reverting)

Almost every failure here is a data question, not a schema question.

```sql
-- Rows where the deprecated mirror and the counter disagree (should be none)
SELECT id, checked_in_count, checked_in_party_size, entry_allowance
  FROM guest_invitations
 WHERE checked_in_count <> COALESCE(checked_in_party_size, 0)
   AND checked_in_count > 0;

-- Rows that violate the arrival invariant (should be none)
SELECT id FROM guest_invitations
 WHERE (checked_in_at IS NULL) <> (checked_in_count = 0);
```

Repair a wrong headcount through the authorised path, never with a direct
`UPDATE`. Direct lowering is refused by the trigger by design:

```sql
SELECT * FROM amend_guest_invitation_checkin(
  '<invitation>', '<event>', <corrected_total>,
  'Post-incident repair: <ticket>', 'ops', gen_random_uuid());
```

`<corrected_total>` of `0` fully reverses an admission and clears the
first-entry metadata.

### Tier 3: full revert (last resort, preserves state)

Only if the functions themselves must go. Keep both ledgers and both columns.

```sql
BEGIN;

DROP TRIGGER IF EXISTS trg_guest_invitations_sync_allowance ON guest_invitations;
DROP FUNCTION IF EXISTS guest_invitations_sync_entry_allowance();
DROP FUNCTION IF EXISTS amend_guest_invitation_checkin(UUID, UUID, INT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS checkin_admit_guest(UUID, UUID, INT, TEXT, TEXT, UUID, TEXT);

-- Restore the pre-migration 4-arg RPC from 20260721000002 verbatim here.
-- The wrapper installed by this migration delegates to a function that no
-- longer exists, so it MUST be replaced in the same transaction.

-- The bounding CHECK has to go, because the restored RPC does not maintain
-- checked_in_count and the two columns will drift apart.
ALTER TABLE guest_invitations
  DROP CONSTRAINT IF EXISTS guest_invitations_checked_in_count_within_allowance;

COMMIT;
```

Do **not** add `DROP COLUMN entry_allowance, checked_in_count` and do **not**
drop `checkin_scan_events`. Leaving them costs two integer columns and keeps
the only record of partial admissions. Re-applying the migration afterwards is
then a no-op on data, because every step is written to be idempotent.

## Operational notes

**Applied state.** Merging does not apply. Check before assuming:

```sql
SELECT * FROM supabase_migrations.schema_migrations
 WHERE version LIKE '20260802210000%';
```

**Idempotency keys.** The scanner sends a `requestId` per admission attempt
and reuses it when retrying a failed one. Without it a lost response followed
by a re-scan admits the party twice. Any new client calling
`checkin_admit_guest()` must send one.

**Retiring the legacy wrapper.** `checkin_guest_invitation()` is a temporary
compatibility exception for `apps/opus_scanner`. It cannot verify the event,
has no idempotency, and admits exactly one person per call. Every call is
tagged in the ledger, so removal can be justified with evidence:

```sql
SELECT count(*), max(created_at) FROM checkin_scan_events
 WHERE source = 'legacy_rpc_wrapper';
```

Remove it once `apps/opus_scanner` is retired or migrated **and** that query
has returned no new rows for an agreed observation period.

**Allowance changes.** An explicit `entry_allowance` below the headcount
already admitted is rejected with a domain error. A `party_size` reduction
below it is floored instead, so a guest editing their own RSVP never fails,
and the gap is recorded in `guest_invitation_allowance_events` with both the
requested and effective value.

**Deprecation follow-up.** `checked_in_party_size` should be dropped once the
couple's dashboard, the admin check-in console, the arrivals poll and the
mobile scanner all read `checked_in_count`. Until then both are maintained
together by the RPCs and must never be written independently.
