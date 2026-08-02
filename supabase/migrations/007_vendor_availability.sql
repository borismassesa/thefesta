-- Vendor Availability Table
-- Tracks vendor availability and booked dates

CREATE TABLE IF NOT EXISTS vendor_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  is_available BOOLEAN DEFAULT true,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(vendor_id, date)
);

-- Create indexes for performance
CREATE INDEX idx_vendor_availability_vendor_id ON vendor_availability(vendor_id);
CREATE INDEX idx_vendor_availability_date ON vendor_availability(date);
CREATE INDEX idx_vendor_availability_vendor_date ON vendor_availability(vendor_id, date);
CREATE INDEX idx_vendor_availability_available ON vendor_availability(vendor_id, is_available) WHERE is_available = false;

-- Enable RLS
ALTER TABLE vendor_availability ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Anyone can view availability (public read)
CREATE POLICY "Anyone can view vendor availability" ON vendor_availability
  FOR SELECT USING (true);

-- Vendors can manage their own availability
CREATE POLICY "Vendors can manage their own availability" ON vendor_availability
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM vendors
      WHERE vendors.id = vendor_availability.vendor_id
      AND vendors.user_id = auth.uid()
    )
  );

-- Trigger to update updated_at
CREATE TRIGGER update_vendor_availability_updated_at
  BEFORE UPDATE ON vendor_availability
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to get vendor availability for a date range
CREATE OR REPLACE FUNCTION get_vendor_availability(
  vendor_uuid UUID,
  start_date DATE,
  end_date DATE
)
RETURNS TABLE (
  date DATE,
  is_available BOOLEAN,
  reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.generated_date::DATE AS date,
    COALESCE(va.is_available, true) as is_available,
    va.reason
  -- The original committed SRF cast was invalid PostgreSQL syntax. Production
  -- retains that historical statement; this source-only correction lets empty
  -- databases build cleanly, while deployed drift is handled by a forward
  -- restore_vendor_availability migration.
  FROM generate_series(
    start_date::timestamp,
    end_date::timestamp,
    interval '1 day'
  ) AS d(generated_date)
  LEFT JOIN public.vendor_availability va
    ON va.vendor_id = vendor_uuid
   AND va.date = d.generated_date::DATE
  ORDER BY d.generated_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to check if a vendor is available on a specific date
CREATE OR REPLACE FUNCTION check_vendor_availability(
  vendor_uuid UUID,
  check_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
  availability_status BOOLEAN;
BEGIN
  SELECT COALESCE(va.is_available, true) INTO availability_status
  FROM vendor_availability va
  WHERE va.vendor_id = vendor_uuid AND va.date = check_date;
  
  RETURN COALESCE(availability_status, true);
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get booked dates from inquiries
-- This considers inquiries with status 'accepted' or 'pending' as booked
CREATE OR REPLACE FUNCTION get_vendor_booked_dates(
  vendor_uuid UUID,
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  date DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT i.event_date::DATE as date
  FROM inquiries i
  WHERE i.vendor_id = vendor_uuid
    AND i.event_date IS NOT NULL
    AND i.status IN ('pending', 'accepted', 'responded')
    AND (start_date IS NULL OR i.event_date >= start_date)
    AND (end_date IS NULL OR i.event_date <= end_date)
  ORDER BY date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to sync inquiries with availability
-- Marks dates as unavailable when inquiries are accepted
CREATE OR REPLACE FUNCTION sync_inquiry_to_availability()
RETURNS TRIGGER AS $$
BEGIN
  -- When an inquiry is accepted, mark the date as unavailable
  IF NEW.status = 'accepted' AND NEW.event_date IS NOT NULL THEN
    INSERT INTO vendor_availability (vendor_id, date, is_available, reason)
    VALUES (NEW.vendor_id, NEW.event_date, false, 'Booked via inquiry')
    ON CONFLICT (vendor_id, date) 
    DO UPDATE SET 
      is_available = false,
      reason = 'Booked via inquiry',
      updated_at = CURRENT_TIMESTAMP;
  END IF;
  
  -- When an inquiry is declined or closed, mark the date as available again
  IF NEW.status IN ('declined', 'closed') AND NEW.event_date IS NOT NULL THEN
    UPDATE vendor_availability
    SET is_available = true,
        reason = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE vendor_id = NEW.vendor_id 
      AND date = NEW.event_date
      AND reason = 'Booked via inquiry';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to sync inquiries with availability
CREATE TRIGGER sync_inquiry_availability
  AFTER UPDATE OF status ON inquiries
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION sync_inquiry_to_availability();
