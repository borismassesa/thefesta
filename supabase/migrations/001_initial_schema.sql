-- TheFesta Platform - Phase 1 MVP Database Schema
-- This migration creates all tables needed for the initial marketplace launch

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create ENUM types
CREATE TYPE user_role AS ENUM ('user', 'vendor', 'admin');
CREATE TYPE vendor_category AS ENUM (
  'Venues', 'Photographers', 'Videographers', 'Caterers',
  'Wedding Planners', 'Florists', 'DJs & Music', 'Beauty & Makeup',
  'Bridal Salons', 'Cake & Desserts', 'Decorators', 'Officiants',
  'Rentals', 'Transportation'
);
CREATE TYPE vendor_tier AS ENUM ('free', 'pro', 'premium');
CREATE TYPE inquiry_status AS ENUM ('pending', 'responded', 'accepted', 'declined', 'closed');
CREATE TYPE saved_vendor_status AS ENUM ('saved', 'contacted', 'booked', 'archived');
CREATE TYPE price_range AS ENUM ('$', '$$', '$$$', '$$$$');

-- Users Table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  phone VARCHAR(50),
  avatar TEXT,
  role user_role DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on email for faster lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Vendors Table
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(255) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_name VARCHAR(255) NOT NULL,
  category vendor_category NOT NULL,
  subcategories TEXT[] DEFAULT '{}',
  bio TEXT,
  description TEXT,
  logo TEXT,
  cover_image TEXT,

  -- Location stored as JSONB
  location JSONB NOT NULL DEFAULT '{}',

  price_range price_range,
  verified BOOLEAN DEFAULT false,
  tier vendor_tier DEFAULT 'free',

  -- Stats stored as JSONB
  stats JSONB DEFAULT '{
    "viewCount": 0,
    "inquiryCount": 0,
    "saveCount": 0,
    "averageRating": 0,
    "reviewCount": 0
  }',

  -- Contact info stored as JSONB
  contact_info JSONB NOT NULL DEFAULT '{}',

  -- Social links stored as JSONB
  social_links JSONB DEFAULT '{
    "instagram": null,
    "facebook": null,
    "twitter": null,
    "tiktok": null
  }',

  years_in_business INTEGER,
  team_size INTEGER,
  services_offered TEXT[] DEFAULT '{}',

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for vendors
CREATE INDEX idx_vendors_slug ON vendors(slug);
CREATE INDEX idx_vendors_user_id ON vendors(user_id);
CREATE INDEX idx_vendors_category ON vendors(category);
CREATE INDEX idx_vendors_tier ON vendors(tier);
CREATE INDEX idx_vendors_verified ON vendors(verified);
CREATE INDEX idx_vendors_location ON vendors USING GIN (location);

-- Portfolio Items Table
CREATE TABLE portfolio (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  images TEXT[] NOT NULL DEFAULT '{}',
  description TEXT,
  event_type VARCHAR(100),
  event_date DATE,
  featured BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for portfolio
CREATE INDEX idx_portfolio_vendor_id ON portfolio(vendor_id);
CREATE INDEX idx_portfolio_featured ON portfolio(featured);
CREATE INDEX idx_portfolio_display_order ON portfolio(display_order);

-- Inquiries Table
CREATE TABLE inquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  event_type VARCHAR(100) NOT NULL,
  event_date DATE,
  guest_count INTEGER,
  budget VARCHAR(100),
  location VARCHAR(255),
  message TEXT NOT NULL,
  status inquiry_status DEFAULT 'pending',
  vendor_response TEXT,
  responded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for inquiries
CREATE INDEX idx_inquiries_vendor_id ON inquiries(vendor_id);
CREATE INDEX idx_inquiries_user_id ON inquiries(user_id);
CREATE INDEX idx_inquiries_status ON inquiries(status);
CREATE INDEX idx_inquiries_created_at ON inquiries(created_at DESC);

-- Saved Vendors Table
CREATE TABLE saved_vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  notes TEXT,
  status saved_vendor_status DEFAULT 'saved',
  priority INTEGER DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Ensure a user can only save a vendor once
  UNIQUE(user_id, vendor_id)
);

-- Create indexes for saved vendors
CREATE INDEX idx_saved_vendors_user_id ON saved_vendors(user_id);
CREATE INDEX idx_saved_vendors_vendor_id ON saved_vendors(vendor_id);
CREATE INDEX idx_saved_vendors_status ON saved_vendors(status);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to all tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_portfolio_updated_at BEFORE UPDATE ON portfolio
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inquiries_updated_at BEFORE UPDATE ON inquiries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_saved_vendors_updated_at BEFORE UPDATE ON saved_vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_vendors ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view their own data" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own data" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Vendors policies (public read, owner write)
CREATE POLICY "Anyone can view published vendors" ON vendors
  FOR SELECT USING (true);

CREATE POLICY "Vendors can insert their own profile" ON vendors
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Vendors can update their own profile" ON vendors
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Vendors can delete their own profile" ON vendors
  FOR DELETE USING (auth.uid() = user_id);

-- Portfolio policies
CREATE POLICY "Anyone can view portfolio items" ON portfolio
  FOR SELECT USING (true);

CREATE POLICY "Vendors can manage their own portfolio" ON portfolio
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM vendors
      WHERE vendors.id = portfolio.vendor_id
      AND vendors.user_id = auth.uid()
    )
  );

-- Inquiries policies
CREATE POLICY "Vendors can view their inquiries" ON inquiries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM vendors
      WHERE vendors.id = inquiries.vendor_id
      AND vendors.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view their own inquiries" ON inquiries
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Anyone can create inquiries" ON inquiries
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Vendors can update their inquiries" ON inquiries
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM vendors
      WHERE vendors.id = inquiries.vendor_id
      AND vendors.user_id = auth.uid()
    )
  );

-- Saved vendors policies
CREATE POLICY "Users can view their saved vendors" ON saved_vendors
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can save vendors" ON saved_vendors
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their saved vendors" ON saved_vendors
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their saved vendors" ON saved_vendors
  FOR DELETE USING (auth.uid() = user_id);

-- Function to increment vendor stats
CREATE OR REPLACE FUNCTION increment_vendor_stat(
  vendor_uuid UUID,
  stat_name TEXT,
  increment_by INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
  UPDATE vendors
  SET stats = jsonb_set(
    stats,
    ARRAY[stat_name],
    to_jsonb(COALESCE((stats->stat_name)::INTEGER, 0) + increment_by)
  )
  WHERE id = vendor_uuid;
END;
$$ LANGUAGE plpgsql;

-- Trigger to increment inquiry count when new inquiry is created
CREATE OR REPLACE FUNCTION increment_inquiry_count()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM increment_vendor_stat(NEW.vendor_id, 'inquiryCount', 1);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_inquiry_created
  AFTER INSERT ON inquiries
  FOR EACH ROW
  EXECUTE FUNCTION increment_inquiry_count();

-- Trigger to update vendor save count
CREATE OR REPLACE FUNCTION update_vendor_save_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM increment_vendor_stat(NEW.vendor_id, 'saveCount', 1);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM increment_vendor_stat(OLD.vendor_id, 'saveCount', -1);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_saved_vendor_change
  AFTER INSERT OR DELETE ON saved_vendors
  FOR EACH ROW
  EXECUTE FUNCTION update_vendor_save_count();
