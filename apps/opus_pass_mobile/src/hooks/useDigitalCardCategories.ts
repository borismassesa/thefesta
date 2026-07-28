import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getDigitalCardCategories } from '@/lib/api/digital-card-categories';

export function useDigitalCardCategories() {
  return useQuery({
    queryKey: ['digital-cards', 'categories'],
    queryFn: () => {
      if (!supabase) throw new Error('Supabase is not configured');
      return getDigitalCardCategories(supabase);
    },
  });
}
