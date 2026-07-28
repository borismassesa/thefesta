import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getFromGuestPrice } from '@/lib/api/wedding-packages';

export function useFromGuestPrice() {
  return useQuery({
    queryKey: ['digital-cards', 'from-guest-price'],
    queryFn: () => {
      if (!supabase) throw new Error('Supabase is not configured');
      return getFromGuestPrice(supabase);
    },
  });
}
