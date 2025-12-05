import { supabase } from '../supabase/client';
import type { SavedVendor, SavedVendorInsert, SavedVendorUpdate } from '../../types/database.types';

/**
 * Save a vendor
 */
export async function saveVendor(savedVendor: SavedVendorInsert) {
  const { data, error } = await supabase
    .from('saved_vendors')
    .insert(savedVendor)
    .select()
    .single();

  if (error) throw error;
  return data as SavedVendor;
}

/**
 * Unsave a vendor
 */
export async function unsaveVendor(userId: string, vendorId: string) {
  const { error } = await supabase
    .from('saved_vendors')
    .delete()
    .eq('user_id', userId)
    .eq('vendor_id', vendorId);

  if (error) throw error;
}

/**
 * Check if a vendor is saved by user
 */
export async function isVendorSaved(userId: string, vendorId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('saved_vendors')
    .select('id')
    .eq('user_id', userId)
    .eq('vendor_id', vendorId)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned
  return !!data;
}

/**
 * Get all saved vendors for a user
 */
export async function getSavedVendors(userId: string, status?: string) {
  let query = supabase
    .from('saved_vendors')
    .select(`
      *,
      vendors:vendor_id (
        id,
        slug,
        business_name,
        category,
        logo,
        cover_image,
        location,
        price_range,
        verified,
        tier,
        stats,
        contact_info
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data;
}

/**
 * Update saved vendor details
 */
export async function updateSavedVendor(id: string, updates: SavedVendorUpdate) {
  const { data, error } = await supabase
    .from('saved_vendors')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as SavedVendor;
}

/**
 * Get saved vendor count for a user
 */
export async function getSavedVendorCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('saved_vendors')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) throw error;
  return count || 0;
}

/**
 * Toggle vendor saved status
 */
export async function toggleSaveVendor(userId: string, vendorId: string) {
  const isSaved = await isVendorSaved(userId, vendorId);

  if (isSaved) {
    await unsaveVendor(userId, vendorId);
    return { saved: false };
  } else {
    await saveVendor({
      userId,
      vendorId,
      status: 'saved',
      priority: 0,
      tags: [],
      notes: null,
    });
    return { saved: true };
  }
}
