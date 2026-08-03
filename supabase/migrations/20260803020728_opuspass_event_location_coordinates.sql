-- Optional venue coordinates make the WhatsApp View Location link land on
-- the exact entrance/pin while venue_name/address/city remain the readable
-- guest-facing description. Coordinates are an all-or-nothing pair.

ALTER TABLE public.wedding_events
  ADD COLUMN venue_latitude NUMERIC(9, 6),
  ADD COLUMN venue_longitude NUMERIC(9, 6);

ALTER TABLE public.wedding_events
  ADD CONSTRAINT wedding_events_venue_latitude_range
    CHECK (venue_latitude IS NULL OR venue_latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT wedding_events_venue_longitude_range
    CHECK (venue_longitude IS NULL OR venue_longitude BETWEEN -180 AND 180),
  ADD CONSTRAINT wedding_events_venue_coordinates_pair
    CHECK ((venue_latitude IS NULL) = (venue_longitude IS NULL));

COMMENT ON COLUMN public.wedding_events.venue_latitude IS
  'Optional exact venue latitude in decimal degrees. Must be stored with venue_longitude.';
COMMENT ON COLUMN public.wedding_events.venue_longitude IS
  'Optional exact venue longitude in decimal degrees. Must be stored with venue_latitude.';
