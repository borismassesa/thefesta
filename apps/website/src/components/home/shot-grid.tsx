'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { getVendors } from '../../lib/db/vendors';
import type { Vendor } from '../../types/database.types';

const ShotGrid = () => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchVendors() {
      try {
        const data = await getVendors({ limit: 8 });
        setVendors(data);
      } catch (error) {
        console.error('Error fetching vendors:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchVendors();
  }, []);

  if (loading) {
    return (
      <section className="mx-auto max-w-7xl px-6 pb-16">
        <div className="flex items-center justify-center py-20">
          <p className="text-slate-500 dark:text-slate-400">Loading vendors...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-7xl px-6 pb-16">
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {vendors.map(vendor => {
          const rating = vendor.stats?.averageRating || 0;
          const reviewCount = vendor.stats?.reviewCount || 0;
          const location = vendor.location?.city ? `${vendor.location.city}, ${vendor.location.region}` : 'Location TBA';
          const viewCount = vendor.stats?.viewCount || Math.floor(Math.random() * 5000) + 500;
          const formattedViews = viewCount >= 1000 ? `${(viewCount / 1000).toFixed(1)}k` : viewCount.toString();

          return (
            <Link
              key={vendor.id}
              href={`/vendors/${vendor.slug}`}
              className="group flex flex-col gap-3 cursor-pointer"
            >
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 shadow-md group-hover:shadow-2xl transition-all duration-500 group-hover:scale-[1.03]">
                {/* Main Image */}
                <Image
                  src={vendor.coverImage || 'https://picsum.photos/seed/default/600/450'}
                  alt={vendor.businessName || 'Wedding vendor'}
                  fill
                  sizes="(min-width: 1280px) 24vw, (min-width: 768px) 48vw, 100vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-110"
                  priority={false}
                />

                {/* Gradient Overlay - appears on hover */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 backdrop-blur-sm" />

                {/* Quick Info Overlay - slides up on hover */}
                <div className="absolute inset-x-0 bottom-0 p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-out bg-black/30 backdrop-blur-md border-t border-white/10">
                  <div className="space-y-3">
                    {/* Rating & Reviews */}
                    {reviewCount > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-400 fill-current" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          <span className="text-sm font-semibold text-white">{rating.toFixed(1)}</span>
                        </div>
                        <span className="text-xs text-white/80">({reviewCount} reviews)</span>
                      </div>
                    )}

                    {/* Location */}
                    <div className="flex items-center gap-2 text-white/90">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                      </svg>
                      <span className="text-xs font-medium truncate">{location}</span>
                    </div>

                    {/* Price Range */}
                    {vendor.priceRange && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/70">Starting from</span>
                        <span className="text-sm font-bold text-white">{vendor.priceRange}</span>
                      </div>
                    )}

                    {/* Bio snippet */}
                    {vendor.bio && (
                      <p className="text-xs text-white/80 line-clamp-2 leading-relaxed">
                        {vendor.bio}
                      </p>
                    )}

                    {/* CTA Button */}
                    <button className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-white/95 hover:bg-white px-4 py-2.5 text-xs font-semibold text-slate-900 transition-all hover:gap-3 backdrop-blur-sm shadow-lg">
                      <span>View Profile</span>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>

              </div>

              {/* Card Footer - always visible */}
              <div className="flex items-start gap-3 px-1">
                <Image
                  src={vendor.logo || `https://ui-avatars.com/api/?name=${encodeURIComponent(vendor.businessName)}&background=random&size=48`}
                  alt={`${vendor.businessName} logo`}
                  width={36}
                  height={36}
                  className="h-9 w-9 rounded-full object-cover border border-slate-200 dark:border-slate-700 shadow-sm"
                />
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    {vendor.verified && (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-dribbble-pink transition-colors line-clamp-1">
                      {vendor.businessName}
                    </h3>
                  </div>
                  <span className="inline-block px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 w-fit">
                    {vendor.category}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 flex-shrink-0 self-start mt-0.5">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                    <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-[10px] font-semibold">
                    {formattedViews}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
};

export default ShotGrid;
