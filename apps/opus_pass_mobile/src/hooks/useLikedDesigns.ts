import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthenticatedSupabase } from '@/lib/supabase';
import {
  addFavorite,
  getLikedProductIds,
  removeFavorite,
} from '@/lib/api/digital-card-favorites';

const QUERY_KEY = ['digital-cards', 'liked-product-ids'];

/**
 * Synced, per-account favorites (replaces the earlier local-only
 * AsyncStorage version) — backed by `invitation_product_favorites`, so
 * liking a card on one device shows it on every device signed into the same
 * account.
 */
export function useLikedDesigns() {
  const client = useAuthenticatedSupabase();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => getLikedProductIds(client),
  });

  const mutation = useMutation({
    mutationFn: async ({
      productId,
      like,
    }: {
      productId: string;
      like: boolean;
    }) => {
      if (like) await addFavorite(client, productId);
      else await removeFavorite(client, productId);
    },
    onMutate: async ({ productId, like }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<string[]>(QUERY_KEY);
      queryClient.setQueryData<string[]>(QUERY_KEY, (current) => {
        const next = new Set(current ?? []);
        if (like) next.add(productId);
        else next.delete(productId);
        return [...next];
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous)
        queryClient.setQueryData(QUERY_KEY, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const liked = new Set(query.data ?? []);

  const toggleLike = (productId: string) => {
    mutation.mutate({ productId, like: !liked.has(productId) });
  };

  return { liked, toggleLike };
}
