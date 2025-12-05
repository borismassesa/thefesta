'use client';

import { BookmarkIcon } from '@heroicons/react/24/outline';
import { BookmarkIcon as BookmarkSolidIcon } from '@heroicons/react/24/solid';
import { useSavedVendor } from '../../hooks/useSavedVendor';

interface SaveButtonProps {
  vendorId: string;
}

export default function SaveButton({ vendorId }: SaveButtonProps) {
  const { isSaved, loading, toggleSaved } = useSavedVendor(vendorId);

  return (
    <button
      onClick={toggleSaved}
      disabled={loading}
      className={`flex w-full items-center justify-center gap-2 rounded-full border-2 py-3 font-semibold transition-all ${
        isSaved
          ? 'border-dribbble-pink bg-dribbble-pink text-white hover:bg-dribbble-pink/90'
          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600'
      } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {isSaved ? (
        <>
          <BookmarkSolidIcon className="h-5 w-5" />
          Saved
        </>
      ) : (
        <>
          <BookmarkIcon className="h-5 w-5" />
          Save Vendor
        </>
      )}
    </button>
  );
}
