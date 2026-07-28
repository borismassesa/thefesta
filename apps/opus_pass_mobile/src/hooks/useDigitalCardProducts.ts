import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getDigitalCardProducts } from '@/lib/api/digital-cards-products';

export function useDigitalCardProducts() {
  return useQuery({
    queryKey: ['digital-cards', 'products'],
    queryFn: () => {
      if (!supabase) throw new Error('Supabase is not configured');
      return getDigitalCardProducts(supabase);
    },
  });
}
