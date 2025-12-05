'use client';

import { useState, useEffect } from 'react';
import { isVendorSaved, toggleSaveVendor } from '../lib/db/saved-vendors';
import { useAuth } from './useAuth';

export function useSavedVendor(vendorId: string) {
  const { user, isAuthenticated } = useAuth();
  const [isSaved, setIsSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated && user) {
      isVendorSaved(user.id, vendorId)
        .then(setIsSaved)
        .catch(console.error);
    }
  }, [isAuthenticated, user, vendorId]);

  const toggleSaved = async () => {
    if (!user) {
      // Redirect to login or show modal
      console.error('User must be logged in to save vendors');
      return;
    }

    setLoading(true);
    try {
      const result = await toggleSaveVendor(user.id, vendorId);
      setIsSaved(result.saved);
    } catch (error) {
      console.error('Failed to toggle saved vendor:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    isSaved,
    loading,
    toggleSaved,
  };
}
