-- Demo shop copy: remove the em-dash.
--
-- "OpusFesta Home Shop" (the seeded gift-registry demo vendor) has an em-dash
-- in its public bio, which violates the house copy rule that user-facing text
-- uses periods, colons or commas instead. The string is DB-only seed data with
-- no source file, so it can't be fixed in a migration alongside the code.
--
-- Idempotent: the WHERE clause matches only the unfixed text, so re-running is
-- a no-op. Scoped by vendor id so it can't touch a real vendor's copy.
--
-- Verify first:
--   SELECT id, business_name, bio FROM public.vendors
--    WHERE id = '7ee84011-d221-4d61-adb0-04c48ba55f16';

UPDATE public.vendors
   SET bio = 'A curated home & kitchen shop for newlyweds: cookware, linens, and thoughtful gifts, delivered across Tanzania.'
 WHERE id = '7ee84011-d221-4d61-adb0-04c48ba55f16'
   AND bio LIKE '%—%';

-- The same copy may also have been seeded into `description`. This is a no-op
-- when that column is null or already clean.
UPDATE public.vendors
   SET description = replace(description, ' — ', ': ')
 WHERE id = '7ee84011-d221-4d61-adb0-04c48ba55f16'
   AND description LIKE '%—%';

-- Any other vendor rows carrying an em-dash (report only, no write — real
-- vendors wrote their own copy and it is not ours to silently rewrite):
--   SELECT id, business_name FROM public.vendors
--    WHERE bio LIKE '%—%' OR description LIKE '%—%';
