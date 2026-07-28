-- Fix the product_categories admin policy to resolve the caller through
-- is_platform_admin() instead of auth.uid().
--
-- Background: 20260724000001_product_categories.sql created
-- "product_categories_admin_all" with `EXISTS (SELECT 1 FROM public.users
-- WHERE id = auth.uid() AND role = 'admin')`. Clerk JWT subs look like
-- 'user_3D6XCxic56PrmqjYhAu5GaQikSa', which fails auth.uid()'s cast to UUID
-- with '22P02 invalid input syntax for type uuid' (the same crash
-- 20260501000001_requesting_user_id_uuid_safe.sql was written to prevent).
-- Because the policy is FOR ALL, every admin INSERT/UPDATE/DELETE and any
-- SELECT reaching inactive rows would raise instead of returning no rows.
--
-- is_platform_admin() resolves the caller via requesting_user_id(), which is
-- UUID-safe. This mirrors the sibling policies on public.products and
-- public.vendor_earnings. Idempotent: safe whether or not 20260724000001 has
-- already been applied.

DROP POLICY IF EXISTS "product_categories_admin_all" ON public.product_categories;
CREATE POLICY "product_categories_admin_all"
  ON public.product_categories FOR ALL
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
