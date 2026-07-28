-- Auto-Release Escrow Funds (Airbnb-style)
-- Automatically releases funds 48-72 hours after work completion
-- Similar to Airbnb's 48-72h after check-in release

-- Add configuration table for escrow settings
CREATE TABLE IF NOT EXISTS escrow_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT INTO escrow_settings (setting_key, setting_value, description) VALUES
  ('auto_release_enabled', 'true', 'Enable automatic release of escrow funds'),
  ('release_delay_hours', '72', 'Hours to wait after work completion before auto-release (48-72h window)'),
  ('customer_confirmation_required', 'false', 'Require customer confirmation before release'),
  ('dispute_window_hours', '48', 'Hours customer can open dispute after work completion'),
  ('admin_review_threshold', '1000000', 'Amount (TZS) requiring admin review before release')
ON CONFLICT (setting_key) DO NOTHING;

-- Function to get escrow setting
CREATE OR REPLACE FUNCTION get_escrow_setting(setting_key_param VARCHAR(100))
RETURNS TEXT AS $$
DECLARE
  setting_value TEXT;
BEGIN
  SELECT setting_value INTO setting_value
  FROM escrow_settings
  WHERE setting_key = setting_key_param;
  
  RETURN COALESCE(setting_value, NULL);
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to check if escrow hold is ready for auto-release
CREATE OR REPLACE FUNCTION is_escrow_ready_for_release(hold_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  hold_rec escrow_holds;
  release_delay_hours INTEGER;
  auto_release_enabled BOOLEAN;
  hours_since_completion NUMERIC;
BEGIN
  -- Get hold record
  SELECT * INTO hold_rec FROM escrow_holds WHERE id = hold_uuid;
  
  IF NOT FOUND OR hold_rec.status != 'held' THEN
    RETURN false;
  END IF;
  
  -- Check if work is completed
  IF NOT hold_rec.work_completed OR hold_rec.work_completed_at IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if dispute is open
  IF hold_rec.dispute_opened AND NOT hold_rec.dispute_resolved THEN
    RETURN false;
  END IF;
  
  -- Check auto-release setting
  SELECT get_escrow_setting('auto_release_enabled')::BOOLEAN INTO auto_release_enabled;
  IF NOT auto_release_enabled THEN
    RETURN false;
  END IF;
  
  -- Get release delay setting
  SELECT COALESCE(get_escrow_setting('release_delay_hours')::INTEGER, 72) INTO release_delay_hours;
  
  -- Calculate hours since work completion
  hours_since_completion := EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - hold_rec.work_completed_at)) / 3600;
  
  -- Check if delay period has passed (48-72h review window)
  IF hours_since_completion >= release_delay_hours THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to auto-release eligible escrow holds
-- This would typically be called by a scheduled job (cron)
CREATE OR REPLACE FUNCTION auto_release_eligible_escrow_holds()
RETURNS TABLE (
  released_count INTEGER,
  released_holds UUID[]
) AS $$
DECLARE
  hold_record RECORD;
  released_ids UUID[] := ARRAY[]::UUID[];
  count INTEGER := 0;
BEGIN
  -- Find all holds ready for auto-release
  FOR hold_record IN
    SELECT id
    FROM escrow_holds
    WHERE status = 'held'
      AND work_completed = true
      AND (dispute_opened = false OR dispute_resolved = true)
      AND is_escrow_ready_for_release(id)
  LOOP
    -- Release the hold
    BEGIN
      PERFORM release_escrow_funds(
        hold_record.id,
        'automatic',
        'Auto-released after work completion and delay period',
        NULL
      );
      
      released_ids := array_append(released_ids, hold_record.id);
      count := count + 1;
    EXCEPTION
      WHEN OTHERS THEN
        -- Log error but continue with other holds
        RAISE WARNING 'Failed to auto-release escrow hold %: %', hold_record.id, SQLERRM;
    END;
  END LOOP;
  
  RETURN QUERY SELECT count, released_ids;
END;
$$ LANGUAGE plpgsql;

-- Create index for efficient auto-release queries
CREATE INDEX IF NOT EXISTS idx_escrow_holds_auto_release ON escrow_holds(work_completed, status, work_completed_at)
  WHERE status = 'held' AND work_completed = true;

-- Function to get holds ready for auto-release (for monitoring)
CREATE OR REPLACE FUNCTION get_holds_ready_for_auto_release()
RETURNS TABLE (
  hold_id UUID,
  vendor_id UUID,
  vendor_amount DECIMAL(12, 2),
  work_completed_at TIMESTAMP WITH TIME ZONE,
  hours_since_completion NUMERIC,
  ready_for_release BOOLEAN
) AS $$
DECLARE
  release_delay_hours INTEGER;
BEGIN
  SELECT COALESCE(get_escrow_setting('release_delay_hours')::INTEGER, 24) INTO release_delay_hours;
  
  RETURN QUERY
  SELECT
    eh.id as hold_id,
    eh.vendor_id,
    eh.vendor_amount,
    eh.work_completed_at,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - eh.work_completed_at)) / 3600 as hours_since_completion,
    (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - eh.work_completed_at)) / 3600 >= release_delay_hours) as ready_for_release
  FROM escrow_holds eh
  WHERE eh.status = 'held'
    AND eh.work_completed = true
    AND (eh.dispute_opened = false OR eh.dispute_resolved = true)
  ORDER BY eh.work_completed_at ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Note: To set up automatic execution, use Supabase's pg_cron extension or external scheduler
-- Example cron job (runs every hour):
-- SELECT cron.schedule('auto-release-escrow', '0 * * * *', 'SELECT auto_release_eligible_escrow_holds();');
