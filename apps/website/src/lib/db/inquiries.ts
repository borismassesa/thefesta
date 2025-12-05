import { supabase } from '../supabase/client';
import type { Inquiry, InquiryInsert, InquiryUpdate } from '../../types/database.types';

/**
 * Create a new inquiry
 */
export async function createInquiry(inquiry: InquiryInsert) {
  const { data, error } = await supabase
    .from('inquiries')
    .insert(inquiry)
    .select()
    .single();

  if (error) throw error;
  return data as Inquiry;
}

/**
 * Get inquiries for a vendor
 */
export async function getVendorInquiries(vendorId: string) {
  const { data, error } = await supabase
    .from('inquiries')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as Inquiry[];
}

/**
 * Get inquiries for a user
 */
export async function getUserInquiries(userId: string) {
  const { data, error } = await supabase
    .from('inquiries')
    .select(`
      *,
      vendors:vendor_id (
        business_name,
        slug,
        logo,
        category
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Update an inquiry
 */
export async function updateInquiry(id: string, updates: InquiryUpdate) {
  const { data, error } = await supabase
    .from('inquiries')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Inquiry;
}

/**
 * Get inquiry by ID
 */
export async function getInquiryById(id: string) {
  const { data, error } = await supabase
    .from('inquiries')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as Inquiry;
}

/**
 * Delete an inquiry
 */
export async function deleteInquiry(id: string) {
  const { error } = await supabase
    .from('inquiries')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
