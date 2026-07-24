-- Lets the OpusPass mobile app submit vendor reviews into the same
-- `vendor_reviews` pipeline the web storefront reads (see
-- 20260503000002_vendor_reviews_pipeline.sql). That migration only wired up
-- anonymous, web-side submission via a Next.js server action using the
-- service-role key — there was no INSERT policy for real app clients.
--
-- Mobile authenticates through the Clerk JWT bridge (requesting_user_id(),
-- 20260501000001_requesting_user_id_uuid_safe.sql), the same mechanism every
-- other authenticated write in this schema uses (saved_vendors, inquiries,
-- etc — see 052_update_rls_for_clerk.sql). We reuse that here rather than
-- auth.uid(), which does not resolve for Clerk-shaped subs.

-- Attribute app-submitted reviews to the submitting user. Nullable — web's
-- anonymous rows (and any future non-app source) keep user_id null.
ALTER TABLE public.vendor_reviews
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vendor_reviews_user_id
  ON public.vendor_reviews (user_id)
  WHERE user_id IS NOT NULL;

-- One review per user per vendor for authenticated submissions. Mirrors the
-- legacy `reviews` table's unique_user_vendor_review constraint. Partial so
-- it only applies to app-attributed rows, not web's anonymous ones.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_vendor_reviews_user_vendor
  ON public.vendor_reviews (user_id, vendor_id)
  WHERE user_id IS NOT NULL;

-- Authenticated app users may submit their own review. Always lands
-- `pending` — publishing still requires admin moderation, same as web.
DROP POLICY IF EXISTS "Authenticated users can submit reviews" ON public.vendor_reviews;
CREATE POLICY "Authenticated users can submit reviews" ON public.vendor_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    status = 'pending'
    AND user_id = requesting_user_id()
  );

-- Authenticated users can see their own submission regardless of moderation
-- status, in addition to the existing "published only" public policy — so
-- the app can show "your review is pending" rather than nothing.
DROP POLICY IF EXISTS "Users can view their own review" ON public.vendor_reviews;
CREATE POLICY "Users can view their own review" ON public.vendor_reviews
  FOR SELECT
  TO authenticated
  USING (user_id = requesting_user_id());

NOTIFY pgrst, 'reload schema';
