// Database types for TheFesta Platform - Phase 1 MVP

export type UserRole = 'user' | 'vendor' | 'admin';

export type VendorCategory =
  | 'Venues'
  | 'Photographers'
  | 'Videographers'
  | 'Caterers'
  | 'Wedding Planners'
  | 'Florists'
  | 'DJs & Music'
  | 'Beauty & Makeup'
  | 'Bridal Salons'
  | 'Cake & Desserts'
  | 'Decorators'
  | 'Officiants'
  | 'Rentals'
  | 'Transportation';

export type VendorTier = 'free' | 'pro' | 'premium';

export type InquiryStatus = 'pending' | 'responded' | 'accepted' | 'declined' | 'closed';

export type SavedVendorStatus = 'saved' | 'contacted' | 'booked' | 'archived';

export type PriceRange = '$' | '$$' | '$$$' | '$$$$';

// User Type
export interface User {
  id: string;
  email: string;
  password: string;
  name: string | null;
  phone: string | null;
  avatar: string | null;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

// Vendor Type
export interface Vendor {
  id: string;
  slug: string;
  userId: string;
  businessName: string;
  category: VendorCategory;
  subcategories: string[];
  bio: string | null;
  description: string | null;
  logo: string | null;
  coverImage: string | null;
  location: {
    city: string;
    region: string;
    country: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  priceRange: PriceRange | null;
  verified: boolean;
  tier: VendorTier;
  stats: {
    viewCount: number;
    inquiryCount: number;
    saveCount: number;
    averageRating: number;
    reviewCount: number;
  };
  contactInfo: {
    email: string;
    phone: string | null;
    website: string | null;
  };
  socialLinks: {
    instagram: string | null;
    facebook: string | null;
    twitter: string | null;
    tiktok: string | null;
  };
  yearsInBusiness: number | null;
  teamSize: number | null;
  servicesOffered: string[];
  createdAt: string;
  updatedAt: string;
}

// Portfolio Item Type
export interface PortfolioItem {
  id: string;
  vendorId: string;
  title: string;
  images: string[];
  description: string | null;
  eventType: string | null;
  eventDate: string | null;
  featured: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

// Inquiry Type
export interface Inquiry {
  id: string;
  vendorId: string;
  userId: string | null;
  name: string;
  email: string;
  phone: string | null;
  eventType: string;
  eventDate: string | null;
  guestCount: number | null;
  budget: string | null;
  location: string | null;
  message: string;
  status: InquiryStatus;
  vendorResponse: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Saved Vendor Type
export interface SavedVendor {
  id: string;
  userId: string;
  vendorId: string;
  notes: string | null;
  status: SavedVendorStatus;
  priority: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// Review Type (Phase 2 - included for reference)
export interface Review {
  id: string;
  vendorId: string;
  userId: string;
  rating: number;
  title: string | null;
  content: string;
  images: string[];
  eventType: string | null;
  eventDate: string | null;
  verified: boolean;
  helpful: number;
  vendorResponse: string | null;
  vendorRespondedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Database Insert Types (omit auto-generated fields)
export type UserInsert = Omit<User, 'id' | 'createdAt' | 'updatedAt'>;
export type VendorInsert = Omit<Vendor, 'id' | 'createdAt' | 'updatedAt'>;
export type PortfolioItemInsert = Omit<PortfolioItem, 'id' | 'createdAt' | 'updatedAt'>;
export type InquiryInsert = Omit<Inquiry, 'id' | 'createdAt' | 'updatedAt'>;
export type SavedVendorInsert = Omit<SavedVendor, 'id' | 'createdAt' | 'updatedAt'>;

// Database Update Types (all fields optional except id)
export type UserUpdate = Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt'>>;
export type VendorUpdate = Partial<Omit<Vendor, 'id' | 'createdAt' | 'updatedAt'>>;
export type PortfolioItemUpdate = Partial<Omit<PortfolioItem, 'id' | 'createdAt' | 'updatedAt'>>;
export type InquiryUpdate = Partial<Omit<Inquiry, 'id' | 'createdAt' | 'updatedAt'>>;
export type SavedVendorUpdate = Partial<Omit<SavedVendor, 'id' | 'createdAt' | 'updatedAt'>>;
