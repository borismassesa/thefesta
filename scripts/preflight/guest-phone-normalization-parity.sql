-- GENERATED FILE — DO NOT EDIT.
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
    ('0757200767'::text, '255757200767'::text, 'local trunk form'::text),
    ('757200767', '255757200767', 'mobile typed without the leading 0'),
    ('+255757200767', '255757200767', 'E.164, leading + stripped'),
    ('255757200767', '255757200767', 'already canonical'),
    ('255 757 200 767', '255757200767', 'spaces'),
    ('0757-200-767', '255757200767', 'hyphens'),
    ('(0757) 200 767', '255757200767', 'parentheses'),
    (' 0757200767 ', '255757200767', 'surrounding whitespace'),
    ('+255-757-200-767', '255757200767', 'plus and hyphens together'),
    ('0657200767', '255657200767', '06 mobile prefix, not only 07'),
    ('657200767', '255657200767', '6-prefix without the leading 0'),
    (NULL, NULL, 'no number on file'),
    ('', NULL, 'empty string'),
    ('   ', NULL, 'whitespace only'),
    ('+', NULL, 'plus with no digits'),
    ('abc', NULL, 'letters only, no digits'),
    ('-- --', NULL, 'punctuation only'),
    ('255757200767 (+ wife)', '255757200767', 'note left in the phone field; interior + must not survive'),
    ('+255757200767 / +255712345678', '255757200767255712345678', 'two numbers pasted into one field; concatenated, not split'),
    ('0712 345 678 +', '255712345678', 'trailing + must not survive'),
    ('+1 415 555 2671', '14155552671', 'foreign number keeps its own country code'),
    ('65 4321 0987', '6543210987', '10 digits starting 6 is NOT the 9-digit TZ mobile shape'),
    ('123', '123', 'too short to be a number, still comparable (see NON-GOALS)'),
    ('07572007678', '2557572007678', 'one digit too long; 0 is still swapped for 255'),
    ('+255', '255', 'bare country code passes through'),
    ('0', '255', 'a lone 0 becomes the bare country code'),
    ('00255757200767', '2550255757200767', '00 international prefix is not recognised')
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
    ('0757200767'::text, '255757200767'::text),
    ('757200767', '255757200767'),
    ('+255757200767', '255757200767'),
    ('255757200767', '255757200767'),
    ('255 757 200 767', '255757200767'),
    ('0757-200-767', '255757200767'),
    ('(0757) 200 767', '255757200767'),
    (' 0757200767 ', '255757200767'),
    ('+255-757-200-767', '255757200767'),
    ('0657200767', '255657200767'),
    ('657200767', '255657200767'),
    (NULL, NULL),
    ('', NULL),
    ('   ', NULL),
    ('+', NULL),
    ('abc', NULL),
    ('-- --', NULL),
    ('255757200767 (+ wife)', '255757200767'),
    ('+255757200767 / +255712345678', '255757200767255712345678'),
    ('0712 345 678 +', '255712345678'),
    ('+1 415 555 2671', '14155552671'),
    ('65 4321 0987', '6543210987'),
    ('123', '123'),
    ('07572007678', '2557572007678'),
    ('+255', '255'),
    ('0', '255'),
    ('00255757200767', '2550255757200767')
)
SELECT COUNT(*) AS normalization_mismatches
FROM fixtures f
WHERE public.opuspass_normalize_phone(f.input) IS DISTINCT FROM f.expected;
