import Link from 'next/link';
import { ArrowRightIcon } from '@heroicons/react/24/outline';
import { CATEGORIES } from '../../app/home-data';

const CategoryBar = () => {
  return (
    <div className="w-full">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-medium text-slate-900 dark:text-white">Explore Vendors</h2>
          <Link
            href="/vendors"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors dark:text-slate-400 dark:hover:text-white"
          >
            View all
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>

        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-2">
          {CATEGORIES.slice(1, 9).map((vendorType) => (
            <Link
              key={vendorType}
              href={`/vendors?category=${encodeURIComponent(vendorType)}` as any}
              className="flex-shrink-0 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
            >
              {vendorType}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CategoryBar;
