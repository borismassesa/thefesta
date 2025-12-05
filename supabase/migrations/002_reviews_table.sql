-- Add Reviews Table to TheFesta Platform
-- This migration creates the reviews table and related triggers

-- Reviews Table
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  content TEXT NOT NULL,
  images TEXT[] DEFAULT '{}',
  event_type VARCHAR(100),
  event_date DATE,
  verified BOOLEAN DEFAULT false,
  helpful INTEGER DEFAULT 0,
  vendor_response TEXT,
  vendor_responded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Ensure one review per user per vendor
  CONSTRAINT unique_user_vendor_review UNIQUE (user_id, vendor_id)
);

-- Create indexes for reviews
CREATE INDEX idx_reviews_vendor_id ON reviews(vendor_id);
CREATE INDEX idx_reviews_user_id ON reviews(user_id);
CREATE INDEX idx_reviews_rating ON reviews(rating);
CREATE INDEX idx_reviews_verified ON reviews(verified);
CREATE INDEX idx_reviews_created_at ON reviews(created_at DESC);

-- Function to update vendor rating stats
CREATE OR REPLACE FUNCTION update_vendor_rating_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE vendors
  SET stats = jsonb_set(
    jsonb_set(
      stats,
      '{averageRating}',
      to_jsonb((
        SELECT ROUND(AVG(rating)::numeric, 1)
        FROM reviews
        WHERE vendor_id = COALESCE(NEW.vendor_id, OLD.vendor_id)
      ))
    ),
    '{reviewCount}',
    to_jsonb((
      SELECT COUNT(*)
      FROM reviews
      WHERE vendor_id = COALESCE(NEW.vendor_id, OLD.vendor_id)
    ))
  )
  WHERE id = COALESCE(NEW.vendor_id, OLD.vendor_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update vendor stats on review changes
CREATE TRIGGER update_vendor_rating_on_review_insert
  AFTER INSERT ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_vendor_rating_stats();

CREATE TRIGGER update_vendor_rating_on_review_update
  AFTER UPDATE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_vendor_rating_stats();

CREATE TRIGGER update_vendor_rating_on_review_delete
  AFTER DELETE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_vendor_rating_stats();

-- Function to increment review helpful count
CREATE OR REPLACE FUNCTION increment_review_helpful(review_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE reviews
  SET helpful = helpful + 1
  WHERE id = review_uuid;
END;
$$ LANGUAGE plpgsql;

-- Auto-update updated_at on reviews
CREATE TRIGGER update_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security for reviews
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Users can read all verified reviews
CREATE POLICY "Anyone can view verified reviews"
  ON reviews FOR SELECT
  USING (verified = true OR auth.uid() = user_id);

-- Users can create reviews for vendors (one per vendor)
CREATE POLICY "Authenticated users can create reviews"
  ON reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own reviews
CREATE POLICY "Users can update own reviews"
  ON reviews FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own reviews
CREATE POLICY "Users can delete own reviews"
  ON reviews FOR DELETE
  USING (auth.uid() = user_id);

-- Vendors can respond to their reviews
CREATE POLICY "Vendors can respond to their reviews"
  ON reviews FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM vendors
      WHERE vendors.id = reviews.vendor_id
      AND vendors.user_id = auth.uid()
    )
  );
