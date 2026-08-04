-- Growth Tracker Phase 0 stabilization.
--
-- Keep the existing Growth module buildable without adding new Growth domains.
-- The admin app uses the service-role Supabase client and enforces Growth RBAC
-- in server actions. Direct anon/authenticated table access is denied below so
-- broad Workforce RLS helpers no longer stand in for Growth permissions.

-- Optional text fields that the UI/server actions already treat as absent when
-- blank. Existing blank values are normalized to NULL before dropping NOT NULL.
UPDATE public.growth_marketing_campaigns
SET notes = NULL
WHERE notes = '';

ALTER TABLE public.growth_marketing_campaigns
  ALTER COLUMN notes DROP DEFAULT,
  ALTER COLUMN notes DROP NOT NULL;

UPDATE public.growth_studio_bookings_log
SET photographer_name = NULL
WHERE photographer_name = '';

UPDATE public.growth_studio_bookings_log
SET videographer_name = NULL
WHERE videographer_name = '';

UPDATE public.growth_studio_bookings_log
SET notes = NULL
WHERE notes = '';

ALTER TABLE public.growth_studio_bookings_log
  ALTER COLUMN photographer_name DROP DEFAULT,
  ALTER COLUMN photographer_name DROP NOT NULL,
  ALTER COLUMN videographer_name DROP DEFAULT,
  ALTER COLUMN videographer_name DROP NOT NULL,
  ALTER COLUMN notes DROP DEFAULT,
  ALTER COLUMN notes DROP NOT NULL;

-- Replace the original broad Growth policies:
--   SELECT TO authenticated USING (is_workforce_reader())
--   FOR ALL TO authenticated USING/WITH CHECK (is_workforce_admin())
--
-- With RLS enabled and no anon/authenticated policies, direct client access is
-- denied. Server-side Growth actions continue through service_role, which is
-- authorized by application RBAC and bypasses RLS in Supabase.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'growth_kpi_targets', 'growth_kpi_actuals',
    'growth_vendor_outreach_targets', 'growth_vendor_outreach_log',
    'growth_marketing_campaigns',
    'growth_social_content_log', 'growth_social_challenges',
    'growth_studio_bookings_log',
    'growth_content_ideas'
  ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_read" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_write" ON public.%1$I', t);
  END LOOP;
END $$;

COMMENT ON TABLE public.growth_kpi_targets IS 'Growth Tracker — monthly KPI targets. Direct anon/authenticated access denied; admin app enforces growth.admin via server actions.';
COMMENT ON TABLE public.growth_kpi_actuals IS 'Growth Tracker — monthly actual value per KPI target. Direct anon/authenticated access denied; admin app enforces growth.write via server actions.';
COMMENT ON TABLE public.growth_vendor_outreach_targets IS 'Growth Tracker — per-staff monthly vendor-acquisition targets. Direct anon/authenticated access denied; admin app enforces growth.admin via server actions.';
COMMENT ON TABLE public.growth_vendor_outreach_log IS 'Growth Tracker — one row per vendor contact. Direct anon/authenticated access denied; admin app enforces growth.write via server actions.';
COMMENT ON TABLE public.growth_marketing_campaigns IS 'Growth Tracker — marketing campaign log. Direct anon/authenticated access denied; admin app enforces growth.write via server actions.';
COMMENT ON TABLE public.growth_social_content_log IS 'Growth Tracker — one row per social post. Direct anon/authenticated access denied; admin app enforces growth.write via server actions.';
COMMENT ON TABLE public.growth_social_challenges IS 'Growth Tracker — challenge schedule and results. Direct anon/authenticated access denied; admin app enforces growth.admin/growth.write via server actions.';
COMMENT ON TABLE public.growth_studio_bookings_log IS 'Growth Tracker — studio booking log. Direct anon/authenticated access denied; admin app enforces growth.write via server actions.';
COMMENT ON TABLE public.growth_content_ideas IS 'Growth Tracker — content ideas reference bank. Direct anon/authenticated access denied; admin app enforces growth.admin via server actions.';

NOTIFY pgrst, 'reload schema';
