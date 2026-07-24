import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthenticatedSupabase } from '@/lib/supabase';
import {
  createVendorReview,
  getCategoryCounts,
  getFeaturedVendors,
  getVendorById,
  getVendorPackages,
  getVendorReviews,
  getVendorsByCategory,
  searchVendors,
  type CreateVendorReviewPayload,
} from '@/lib/api/vendors';
import { MissingInternalUserError, useInternalUserId } from './useInternalUserId';

export function useFeaturedVendors() {
  return useQuery({
    queryKey: ['vendors', 'featured'],
    queryFn: getFeaturedVendors,
  });
}

export function useVendor(id: string | undefined) {
  return useQuery({
    queryKey: ['vendor', id],
    queryFn: () => getVendorById(id!),
    enabled: Boolean(id),
  });
}

export function useVendorsByCategory(category: string | undefined) {
  return useQuery({
    queryKey: ['vendors', 'category', category],
    queryFn: () => getVendorsByCategory(category!),
    enabled: Boolean(category),
  });
}

export function useSearchVendors(query: string) {
  return useQuery({
    queryKey: ['vendors', 'search', query],
    queryFn: () => searchVendors(query),
    enabled: query.trim().length >= 2,
  });
}

export function useVendorReviews(vendorId: string | undefined) {
  return useQuery({
    queryKey: ['vendor-reviews', vendorId],
    queryFn: () => getVendorReviews(vendorId!),
    enabled: Boolean(vendorId),
  });
}

export function useCreateVendorReview() {
  const client = useAuthenticatedSupabase();
  const { data: userId } = useInternalUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Omit<CreateVendorReviewPayload, 'userId'>) => {
      if (!userId) throw new MissingInternalUserError();
      return createVendorReview(client, { ...payload, userId });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['vendor-reviews', variables.vendorId] });
    },
  });
}

export function useVendorPackages(vendorId: string | undefined) {
  return useQuery({
    queryKey: ['vendor-packages', vendorId],
    queryFn: () => getVendorPackages(vendorId!),
    enabled: Boolean(vendorId),
  });
}

export function useCategoryCounts() {
  return useQuery({
    queryKey: ['vendor-category-counts'],
    queryFn: getCategoryCounts,
  });
}
