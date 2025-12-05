'use client';

import { useState } from 'react';
import Image from 'next/image';
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import type { PortfolioItem } from '../../types/database.types';

interface PortfolioGalleryProps {
  items: PortfolioItem[];
}

export default function PortfolioGallery({ items }: PortfolioGalleryProps) {
  const [selectedItem, setSelectedItem] = useState<PortfolioItem | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const openLightbox = (item: PortfolioItem, imageIndex = 0) => {
    setSelectedItem(item);
    setCurrentImageIndex(imageIndex);
  };

  const closeLightbox = () => {
    setSelectedItem(null);
    setCurrentImageIndex(0);
  };

  const nextImage = () => {
    if (selectedItem && currentImageIndex < selectedItem.images.length - 1) {
      setCurrentImageIndex(currentImageIndex + 1);
    }
  };

  const prevImage = () => {
    if (currentImageIndex > 0) {
      setCurrentImageIndex(currentImageIndex - 1);
    }
  };

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-gray-300 p-12 text-center dark:border-slate-700">
        <p className="text-gray-500 dark:text-slate-400">No portfolio items yet</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className="group relative overflow-hidden rounded-2xl bg-gray-100 dark:bg-slate-900">
            {item.images.length > 0 && (
              <div
                className="relative aspect-[4/3] cursor-pointer"
                onClick={() => openLightbox(item, 0)}
              >
                <Image
                  src={item.images[0]}
                  alt={item.title || 'Portfolio item'}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-black/0 transition-all duration-300 group-hover:bg-black/40" />
                {item.images.length > 1 && (
                  <div className="absolute bottom-3 right-3 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white">
                    +{item.images.length - 1}
                  </div>
                )}
              </div>
            )}
            <div className="p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white">{item.title}</h3>
              {item.description && (
                <p className="mt-1 text-sm text-gray-600 line-clamp-2 dark:text-slate-400">
                  {item.description}
                </p>
              )}
              {item.eventType && (
                <span className="mt-2 inline-block rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-slate-800 dark:text-slate-300">
                  {item.eventType}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95"
          onClick={closeLightbox}
        >
          <button
            onClick={closeLightbox}
            className="absolute top-6 right-6 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>

          <div className="relative h-full w-full max-w-6xl p-12" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-full flex-col items-center justify-center gap-6">
              {/* Image */}
              <div className="relative h-[70vh] w-full">
                <Image
                  src={selectedItem.images[currentImageIndex]}
                  alt={selectedItem.title || 'Portfolio item'}
                  fill
                  className="object-contain"
                />
              </div>

              {/* Image Navigation */}
              {selectedItem.images.length > 1 && (
                <div className="flex items-center gap-4">
                  <button
                    onClick={prevImage}
                    disabled={currentImageIndex === 0}
                    className={`flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 ${
                      currentImageIndex === 0 ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <ChevronLeftIcon className="h-6 w-6" />
                  </button>

                  <span className="text-sm text-white">
                    {currentImageIndex + 1} / {selectedItem.images.length}
                  </span>

                  <button
                    onClick={nextImage}
                    disabled={currentImageIndex === selectedItem.images.length - 1}
                    className={`flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 ${
                      currentImageIndex === selectedItem.images.length - 1 ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <ChevronRightIcon className="h-6 w-6" />
                  </button>
                </div>
              )}

              {/* Info */}
              <div className="text-center">
                <h3 className="text-xl font-bold text-white">{selectedItem.title}</h3>
                {selectedItem.description && (
                  <p className="mt-2 text-gray-300">{selectedItem.description}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
