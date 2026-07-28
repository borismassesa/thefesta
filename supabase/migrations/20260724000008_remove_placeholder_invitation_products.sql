-- Remove the legacy p1-p20 placeholder invitation products ("Amani & Neema /
-- Bagamoyo" mock cards) that were seeded by 20260529000002, 20260602000002 and
-- 20260712000005. They have been superseded by the real person-named catalog.
--
-- This runs after those seed migrations, so a fresh reset / reseed ends up
-- without the placeholders. Idempotent: re-running is a harmless no-op.
-- p21-p24 (Teal Fiesta, Heritage Script tickets) are intentionally kept.
--
-- Clear any favorites pointing at these products first, in case the FK is not
-- ON DELETE CASCADE.
delete from invitation_product_favorites
where product_id in (
  'p1','p2','p3','p4','p5','p6','p7','p8','p9','p10',
  'p11','p12','p13','p14','p15','p16','p17','p18','p19','p20'
);

delete from website_invitations_products
where id in (
  'p1','p2','p3','p4','p5','p6','p7','p8','p9','p10',
  'p11','p12','p13','p14','p15','p16','p17','p18','p19','p20'
);
