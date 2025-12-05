import { supabase } from '../supabase/client';
import type { Review } from '../../types/database.types';

/**
 * Get all reviews for a vendor
 */
export async function getVendorReviews(vendorId: string, options?: {
  limit?: number;
  offset?: number;
  orderBy?: 'recent' | 'rating' | 'helpful';
}) {
  let query = supabase
    .from('reviews')
    .select(`
      *,
      users:user_id (
        id,
        name,
        avatar
      )
    `)
    .eq('vendor_id', vendorId);

  // Apply ordering
  switch (options?.orderBy) {
    case 'rating':
      query = query.order('rating', { ascending: false });
      break;
    case 'helpful':
      query = query.order('helpful', { ascending: false });
      break;
    case 'recent':
    default:
      query = query.order('created_at', { ascending: false });
      break;
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data;
}

/**
 * Get review statistics for a vendor
 */
export async function getVendorReviewStats(vendorId: string) {
  const { data, error } = await supabase
    .from('reviews')
    .select('rating')
    .eq('vendor_id', vendorId);

  if (error) throw error;

  if (!data || data.length === 0) {
    return {
      averageRating: 0,
      totalReviews: 0,
      ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    };
  }

  const ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let totalRating = 0;

  data.forEach((review) => {
    const rating = review.rating as 1 | 2 | 3 | 4 | 5;
    ratingDistribution[rating]++;
    totalRating += rating;
  });

  return {
    averageRating: totalRating / data.length,
    totalReviews: data.length,
    ratingDistribution,
  };
}

/**
 * Create a new review
 */
export async function createReview(review: Omit<Review, 'id' | 'createdAt' | 'updatedAt' | 'helpful' | 'verified'>) {
  const { data, error } = await supabase
    .from('reviews')
    .insert({
      ...review,
      helpful: 0,
      verified: false,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Mark review as helpful
 */
export async function markReviewHelpful(reviewId: string) {
  const { error } = await supabase.rpc('increment_review_helpful', {
    review_uuid: reviewId,
  });

  if (error) throw error;
}
