/**
 * The single source of truth for phone-normalization behaviour.
 *
 * Two implementations must agree exactly on every case here:
 *
 *   - SQL  public.opuspass_normalize_phone()   (20260804160000)
 *   - TS   normalizePhone()                    (apps/opus_pass/src/lib/dashboard/share.ts)
 *
 * The SQL one backs `guest_contacts.phone_normalized`, which is the key of the
 * partial unique index that enforces "one number, one guest". The TS one is
 * what the app uses to warn about a duplicate BEFORE inserting. If they
 * disagree, the app clears a guest the index then rejects, and the couple sees
 * a raw 23505 instead of the duplicate warning. That is the exact defect the
 * uniqueness work exists to remove, so parity is a merge gate, not a nicety.
 *
 * These cases record what the implementations DO, not what they arguably
 * should do. See NON-GOALS below before "fixing" an expectation.
 *
 * NON-GOALS — normalization is not validation:
 *
 *   '123' normalizes to '123' rather than NULL, and that is deliberate.
 *   Normalization answers "are these two rows the same number?". Validity
 *   ("is this number usable?") is a separate, weaker question answered by the
 *   readiness flags (invalid_contact).
 *
 *   Conflating them would WEAKEN deduplication: the unique index is partial on
 *   `phone_normalized IS NOT NULL`, so anything normalizing to NULL escapes it
 *   entirely. Rejecting junk here would let two guests both holding '123' both
 *   insert, which is worse than keeping them comparable.
 *
 *   Only "no digits at all" yields NULL, because there is genuinely nothing to
 *   compare.
 *
 *   The same split applies to a field holding TWO numbers, which imported
 *   spreadsheets routinely do:
 *
 *     '+255757200767 / +255712345678'  ->  '255757200767255712345678'
 *
 *   Concatenating is right for normalization: it is deterministic, so the same
 *   pasted pair always compares equal to itself, and two guests who pasted the
 *   identical pair are caught as duplicates. It does NOT make the result a
 *   usable destination, and normalization does not claim it does — the
 *   validity layer rejects it (phoneLooksValid returns false, since it is
 *   neither a 9-digit TZ mobile nor a plausible foreign number), and the guest
 *   surfaces as invalid_phone until someone picks which number is theirs.
 *
 *   Do NOT "fix" this by splitting on the separator and taking the first
 *   number. Guessing which of two numbers a guest meant is a data decision for
 *   an admin, and silently picking one would send a card to the wrong handset
 *   while reporting success.
 */
export type PhoneNormalizationCase = {
  /** Raw value as it arrives from an import, a paste, or the edit form. */
  input: string | null
  /** What BOTH implementations must return. */
  expected: string | null
  /** Why this case is in the fixture. Shown in the mismatch diff. */
  why: string
}

export const PHONE_NORMALIZATION_CASES: readonly PhoneNormalizationCase[] = [
  // ── Tanzanian numbers, every shape a real roster holds ──────────────────
  { input: '0757200767', expected: '255757200767', why: 'local trunk form' },
  { input: '757200767', expected: '255757200767', why: 'mobile typed without the leading 0' },
  { input: '+255757200767', expected: '255757200767', why: 'E.164, leading + stripped' },
  { input: '255757200767', expected: '255757200767', why: 'already canonical' },
  { input: '255 757 200 767', expected: '255757200767', why: 'spaces' },
  { input: '0757-200-767', expected: '255757200767', why: 'hyphens' },
  { input: '(0757) 200 767', expected: '255757200767', why: 'parentheses' },
  { input: ' 0757200767 ', expected: '255757200767', why: 'surrounding whitespace' },
  { input: '+255-757-200-767', expected: '255757200767', why: 'plus and hyphens together' },
  { input: '0657200767', expected: '255657200767', why: '06 mobile prefix, not only 07' },
  { input: '657200767', expected: '255657200767', why: '6-prefix without the leading 0' },

  // ── Nothing to compare ─────────────────────────────────────────────────
  { input: null, expected: null, why: 'no number on file' },
  { input: '', expected: null, why: 'empty string' },
  { input: '   ', expected: null, why: 'whitespace only' },
  { input: '+', expected: null, why: 'plus with no digits' },
  { input: 'abc', expected: null, why: 'letters only, no digits' },
  { input: '-- --', expected: null, why: 'punctuation only' },

  // ── Contaminated fields: the drift that this fixture was written to catch
  // TS used to keep every '+' (only the LEADING one was stripped), so these
  // three produced a different key than the index. Both sides now strip all
  // non-digits. Do not delete these; they are the regression guard.
  {
    input: '255757200767 (+ wife)',
    expected: '255757200767',
    why: 'note left in the phone field; interior + must not survive',
  },
  {
    input: '+255757200767 / +255712345678',
    expected: '255757200767255712345678',
    why: 'two numbers pasted into one field; concatenated, not split',
  },
  {
    input: '0712 345 678 +',
    expected: '255712345678',
    why: 'trailing + must not survive',
  },

  // ── Passthrough: a country code we cannot guess is left alone ───────────
  { input: '+1 415 555 2671', expected: '14155552671', why: 'foreign number keeps its own country code' },
  { input: '65 4321 0987', expected: '6543210987', why: '10 digits starting 6 is NOT the 9-digit TZ mobile shape' },
  { input: '123', expected: '123', why: 'too short to be a number, still comparable (see NON-GOALS)' },

  // ── Documented rough edges. Both sides agree, which is what parity means.
  // Recorded so that changing any of them is a deliberate, reviewed act.
  { input: '07572007678', expected: '2557572007678', why: 'one digit too long; 0 is still swapped for 255' },
  { input: '+255', expected: '255', why: 'bare country code passes through' },
  { input: '0', expected: '255', why: 'a lone 0 becomes the bare country code' },
  { input: '00255757200767', expected: '2550255757200767', why: '00 international prefix is not recognised' },
] as const

/** Single-quoted SQL literal, or NULL. */
function sqlLiteral(value: string | null): string {
  return value === null ? 'NULL' : `'${value.replace(/'/g, "''")}'`
}

/**
 * Renders the database half of the parity gate from the fixture above, so the
 * two halves can never test different cases.
 *
 * Written to scripts/preflight/guest-phone-normalization-parity.sql by
 * scripts/preflight/generate-phone-parity-sql.ts, and held in step by a test.
 */
export function renderPhoneParitySql(): string {
  const rows = PHONE_NORMALIZATION_CASES.map(({ input, expected, why }, i) => {
    const cast = i === 0 ? '::text' : ''
    return `    (${sqlLiteral(input)}${cast}, ${sqlLiteral(expected)}${cast}, ${sqlLiteral(why)}${cast})`
  }).join(',\n')

  return `-- GENERATED FILE — DO NOT EDIT.
-- Source:    packages/lib/phone-normalization-fixtures.ts
-- Regenerate: npx tsx scripts/preflight/generate-phone-parity-sql.ts
--
-- The database half of the phone-normalization parity gate. Run against the
-- target database (read-only; creates nothing) AFTER 20260804160000 has been
-- applied there. The TypeScript half lives in
-- apps/opus_pass/src/lib/dashboard/phone-normalization-parity.test.ts and
-- reads the same fixture.
--
-- GATE: query 2 must return 0.

-- ── 1) Every mismatch, with the case that produced it ──────────────────────
WITH fixtures(input, expected, why) AS (
  VALUES
${rows}
)
SELECT
  f.input,
  f.expected,
  public.opuspass_normalize_phone(f.input) AS actual,
  f.why
FROM fixtures f
WHERE public.opuspass_normalize_phone(f.input) IS DISTINCT FROM f.expected
ORDER BY f.input;

-- ── 2) The gate ────────────────────────────────────────────────────────────
WITH fixtures(input, expected) AS (
  VALUES
${PHONE_NORMALIZATION_CASES.map(({ input, expected }, i) => {
  const cast = i === 0 ? '::text' : ''
  return `    (${sqlLiteral(input)}${cast}, ${sqlLiteral(expected)}${cast})`
}).join(',\n')}
)
SELECT COUNT(*) AS normalization_mismatches
FROM fixtures f
WHERE public.opuspass_normalize_phone(f.input) IS DISTINCT FROM f.expected;
`
}
