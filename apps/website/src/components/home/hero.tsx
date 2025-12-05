'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { MagnifyingGlassIcon, MapPinIcon, UsersIcon, PhotoIcon, HeartIcon } from '@heroicons/react/24/outline';
import { HERO_SLIDES } from '../../app/home-data';

const SEARCH_TABS = [
  { id: 'venues', label: 'Venues', icon: MapPinIcon, placeholder: 'What type of venue are you looking for?' },
  { id: 'vendors', label: 'Vendors', icon: UsersIcon, placeholder: 'What type of vendor do you need?' },
  { id: 'websites', label: 'Wedding Websites', icon: PhotoIcon, placeholder: 'What wedding website features do you need?' },
  { id: 'ideas', label: 'Ideas', icon: HeartIcon, placeholder: 'What are you looking to create?' },
];

const POPULAR_CITIES = [
  'Dar es Salaam',
  'Dodoma',
  'Mwanza',
  'Arusha',
  'Mbeya',
  'Zanzibar City',
];

const TRENDING_TAGS = [
  // Venues
  { label: 'beach venues', category: 'venues', searchTerm: 'beach' },
  { label: 'garden venues', category: 'venues', searchTerm: 'garden' },
  { label: 'ballroom', category: 'venues', searchTerm: 'ballroom' },
  { label: 'outdoor venues', category: 'venues', searchTerm: 'outdoor' },
  { label: 'hotel venues', category: 'venues', searchTerm: 'hotel' },

  // Vendors
  { label: 'photographers', category: 'vendors', searchTerm: 'photographers' },
  { label: 'videographers', category: 'vendors', searchTerm: 'videographers' },
  { label: 'florists', category: 'vendors', searchTerm: 'florists' },
  { label: 'caterers', category: 'vendors', searchTerm: 'caterers' },
  { label: 'DJs', category: 'vendors', searchTerm: 'DJs' },

  // Wedding Websites
  { label: 'RSVP features', category: 'websites', searchTerm: 'RSVP' },
  { label: 'photo galleries', category: 'websites', searchTerm: 'photo gallery' },
  { label: 'modern templates', category: 'websites', searchTerm: 'modern templates' },
  { label: 'elegant themes', category: 'websites', searchTerm: 'elegant' },
  { label: 'custom domains', category: 'websites', searchTerm: 'custom domain' },

  // Ideas
  { label: 'beach wedding', category: 'ideas', searchTerm: 'beach wedding' },
  { label: 'rustic wedding', category: 'ideas', searchTerm: 'rustic wedding' },
  { label: 'modern luxury', category: 'ideas', searchTerm: 'modern luxury' },
  { label: 'vintage style', category: 'ideas', searchTerm: 'vintage style' },
  { label: 'boho chic', category: 'ideas', searchTerm: 'boho chic' },
];

const Hero = () => {
  const [activeTab, setActiveTab] = useState('venues');
  const [searchText, setSearchText] = useState('');
  const [location, setLocation] = useState('');
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  const filteredCities = POPULAR_CITIES.filter(city =>
    city.toLowerCase().includes(location.toLowerCase())
  );

  const handleTrendingTagClick = (tag: typeof TRENDING_TAGS[0]) => {
    setActiveTab(tag.category);
    setSearchText(tag.searchTerm);
    // Scroll to search results section or trigger search
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % HERO_SLIDES.length);
    }, 3000);

    return () => clearInterval(timer);
  }, []);

  return (
    <section className="mx-auto grid w-full max-w-[1400px] grid-cols-1 items-center gap-10 px-6 pt-16 pb-12 md:pt-20 md:pb-16 lg:grid-cols-2 lg:gap-16 lg:pt-24 lg:pb-20">
      <div className="flex animate-fade-in flex-col items-center space-y-8 text-center lg:items-start lg:text-left">
        <h1 className="text-[40px] font-bold leading-[1.05] tracking-tight text-gray-900 md:text-[52px] lg:text-[56px]">
          Everything You Need <br /> to Plan Your Wedding
        </h1>
        <p className="max-w-lg text-lg leading-relaxed text-gray-600 md:text-xl">
          Search over 250,000 local professionals, find the perfect venue, and create your wedding website—all in one place.
        </p>

        <div className="flex w-full max-w-2xl flex-col gap-6">
          <div className="w-full rounded-2xl bg-white p-6 shadow-lg">
            <div className="mb-6 flex items-center justify-center gap-2 lg:justify-start">
              {SEARCH_TABS.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-200 ${
                    activeTab === tab.id
                      ? 'bg-gray-900 text-white shadow-md'
                      : 'bg-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <form className="flex items-center gap-3 rounded-2xl bg-festa-section px-4 py-3" onSubmit={event => event.preventDefault()}>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowCityDropdown(!showCityDropdown)}
                    className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-gray-700 transition-colors hover:text-gray-900"
                  >
                    <MapPinIcon className="h-4 w-4 text-gray-500" />
                    <span className="max-w-[100px] truncate sm:max-w-[120px]">{location || 'Location'}</span>
                  </button>
                  {showCityDropdown && (
                    <>
                      <div
                        className="fixed inset-0 z-[100]"
                        onClick={() => setShowCityDropdown(false)}
                      />
                      <div className="absolute left-0 top-full z-[101] mt-2 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl sm:w-72">
                        <div className="border-b border-gray-100 bg-gray-50 px-4 py-2">
                          <input
                            type="text"
                            value={location}
                            onChange={e => setLocation(e.target.value)}
                            placeholder="Search cities..."
                            className="w-full border-none bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none focus:ring-0"
                            autoFocus
                          />
                        </div>
                        <div className="max-h-64 overflow-y-auto py-1">
                          {filteredCities.length > 0 ? (
                            filteredCities.map(city => (
                              <button
                                key={city}
                                type="button"
                                onClick={() => {
                                  setLocation(city);
                                  setShowCityDropdown(false);
                                }}
                                className="block w-full px-4 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
                              >
                                <div className="flex items-center gap-2">
                                  <MapPinIcon className="h-3.5 w-3.5 text-gray-400" />
                                  <span>{city}</span>
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="px-4 py-8 text-center text-sm text-gray-500">
                              No cities found
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="h-6 w-px bg-gray-300" />

                <input
                  type="text"
                  value={searchText}
                  onChange={event => setSearchText(event.target.value)}
                  placeholder={SEARCH_TABS.find(tab => tab.id === activeTab)?.placeholder}
                  className="flex-1 border-none bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none focus:ring-0"
                />

                <button
                  type="submit"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-dribbble-pink text-white shadow-lg shadow-purple-200 transition-colors hover:bg-dribbble-pink/90"
                  aria-label="Search"
                >
                  <MagnifyingGlassIcon className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <span className="shrink-0 font-bold text-black">Trending:</span>
            {TRENDING_TAGS.filter(tag => tag.category === activeTab).slice(0, 4).map(tag => (
              <button
                key={tag.label}
                type="button"
                onClick={() => handleTrendingTagClick(tag)}
                className="shrink-0 whitespace-nowrap rounded-full bg-white px-4 py-2 text-gray-700 shadow-sm transition-all hover:shadow-md"
              >
                {tag.label}
              </button>
            ))}
          </div>
        </div>

      </div>

      <div className="relative hidden aspect-[4/3] w-full overflow-hidden rounded-[2.5rem] bg-gray-100 shadow-2xl lg:block">
        {HERO_SLIDES.map((slide, index) => (
          <div
            key={slide.id}
            className={`absolute inset-0 h-full w-full transition-opacity duration-700 ease-in-out ${
              index === currentSlide ? 'z-10 opacity-100' : 'z-0 opacity-0'
            }`}
            style={{ backgroundColor: slide.color }}
          >
            <video autoPlay muted loop playsInline poster={slide.poster} className="h-full w-full object-cover">
              <source src={slide.video} type="video/mp4" />
            </video>
          </div>
        ))}

        <div className="absolute bottom-6 right-6 z-20 flex cursor-pointer items-center gap-3 rounded-full bg-white/90 px-4 py-2 shadow-lg transition-all hover:bg-white">
          <span className="text-sm font-semibold text-gray-900 transition-all duration-300">
            {HERO_SLIDES[currentSlide].author}
          </span>
          <Image
            src={HERO_SLIDES[currentSlide].avatar}
            alt={HERO_SLIDES[currentSlide].author || 'Artist'}
            width={32}
            height={32}
            className="h-8 w-8 rounded-full border border-gray-200"
          />
        </div>

        <div className="absolute bottom-6 left-6 z-20 flex gap-2">
          {HERO_SLIDES.map((slide, idx) => (
            <span
              key={slide.id}
              className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentSlide ? 'w-6 bg-white' : 'w-1.5 bg-white/50'}`}
            />
          ))}
        </div>
      </div>

    </section>
  );
};

export default Hero;
