import { supabase } from '../supabase/client';
import type { Vendor, VendorInsert, VendorUpdate, VendorCategory } from '../../types/database.types';

/**
 * Get all vendors with optional filtering
 */
export async function getVendors(filters?: {
  category?: VendorCategory;
  priceRange?: string;
  location?: string;
  verified?: boolean;
  limit?: number;
  offset?: number;
}) {
  let query = supabase
    .from('vendors')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.category) {
    query = query.eq('category', filters.category);
  }

  if (filters?.priceRange) {
    query = query.eq('price_range', filters.priceRange);
  }

  if (filters?.verified !== undefined) {
    query = query.eq('verified', filters.verified);
  }

  if (filters?.location) {
    query = query.ilike('location->>city', `%${filters.location}%`);
  }

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  if (filters?.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data as Vendor[];
}

/**
 * Get a single vendor by slug
 */
export async function getVendorBySlug(slug: string) {
  const { data, error } = await supabase
    .from('vendors')
    .select(`
      *,
      portfolio (*),
      reviews:reviews (
        *,
        user:users (
          id,
          name,
          avatar
        )
      )
    `)
    .eq('slug', slug)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get a vendor by ID
 */
export async function getVendorById(id: string) {
  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as Vendor;
}

/**
 * Create a new vendor profile
 */
export async function createVendor(vendor: VendorInsert) {
  const { data, error } = await supabase
    .from('vendors')
    .insert(vendor)
    .select()
    .single();

  if (error) throw error;
  return data as Vendor;
}

/**
 * Update a vendor profile
 */
export async function updateVendor(id: string, updates: VendorUpdate) {
  const { data, error } = await supabase
    .from('vendors')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Vendor;
}

/**
 * Delete a vendor profile
 */
export async function deleteVendor(id: string) {
  const { error } = await supabase
    .from('vendors')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/**
 * Increment vendor view count
 */
export async function incrementVendorViews(vendorId: string) {
  const { error } = await supabase.rpc('increment_vendor_stat', {
    vendor_uuid: vendorId,
    stat_name: 'viewCount',
    increment_by: 1,
  });

  if (error) throw error;
}

/**
 * Search vendors by text query
 */
export async function searchVendors(query: string, limit = 20) {
  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .or(`business_name.ilike.%${query}%,description.ilike.%${query}%,bio.ilike.%${query}%`)
    .limit(limit);

  if (error) throw error;
  return data as Vendor[];
}

/**
 * Get featured vendors (pro/premium tier)
 */
export async function getFeaturedVendors(limit = 8) {
  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .in('tier', ['pro', 'premium'])
    .eq('verified', true)
    .order('stats->>saveCount', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data as Vendor[];
}
