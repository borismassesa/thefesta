import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  PhoneIcon,
  GlobeAltIcon,
  CheckBadgeIcon,
  CalendarDaysIcon,
  UserGroupIcon,
  PhotoIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import { getVendorBySlug, incrementVendorViews } from '../../../lib/db/vendors';
import VendorProfileLayout from '../../../components/vendors/vendor-profile-layout';

export const dynamic = 'force-dynamic';

interface VendorProfilePageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function VendorProfilePage({ params }: VendorProfilePageProps) {
  const { slug } = await params;

  let vendor;
  try {
    vendor = await getVendorBySlug(slug);
    await incrementVendorViews(vendor.id);
  } catch (error) {
    notFound();
  }

  if (!vendor) {
    notFound();
  }

  const location = vendor.location || { city: '', country: '' };
  const stats = vendor.stats || { viewCount: 0, inquiryCount: 0, saveCount: 0, averageRating: 0, reviewCount: 0 };
  const contactInfo = vendor.contactInfo || { email: '', phone: null, website: null };
  const socialLinks = vendor.socialLinks || { instagram: null, facebook: null, twitter: null, tiktok: null };
  const priceRangeDisplay = vendor.priceRange || 'Contact for pricing';

  // Get portfolio images for gallery
  const galleryImages = vendor.portfolio && vendor.portfolio.length > 0
    ? vendor.portfolio.flatMap((item: { images: string[] }) => item.images).slice(0, 6)
    : [vendor.coverImage || 'https://picsum.photos/seed/default/1200/600'];

  return (
    <VendorProfileLayout
      category={vendor.category}
      businessName={vendor.businessName}
      bio={vendor.bio}
      location={location}
      stats={stats}
      priceRangeDisplay={priceRangeDisplay}
      photoGallery={
        <section id="photos" className="mx-auto max-w-7xl px-4 lg:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 h-[400px] md:h-[500px] relative">
            {/* Main large image - Left side */}
            <div className="relative h-full rounded-lg overflow-hidden">
              <Image
                src={galleryImages[0]}
                alt={vendor.businessName || 'Vendor cover image'}
                fill
                className="object-cover"
                priority
              />
            </div>

            {/* Right side - 2x2 grid */}
            <div className="hidden md:grid grid-cols-2 grid-rows-2 gap-2">
              {galleryImages.slice(1, 5).map((image: string, idx: number) => (
                <div key={idx} className="relative h-full rounded-lg overflow-hidden">
                  <Image
                    src={image}
                    alt={`${vendor.businessName || 'Vendor'} gallery image ${idx + 2}`}
                    fill
                    className="object-cover"
                  />
                  {idx === 3 && (
                    <button className="absolute inset-0 bg-black/60 flex items-center justify-center text-white hover:bg-black/70 transition-colors group">
                      <div className="flex items-center gap-2">
                        <PhotoIcon className="w-6 h-6" />
                        <span className="font-semibold text-lg">See all ({galleryImages.length})</span>
                      </div>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      }
      sidebar={<InquirySidebar priceRange={priceRangeDisplay} />}
    >
      {/* Deals Section */}
      <section id="deals" className="space-y-6">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Deals</h3>
        <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-6 flex items-start justify-between">
          <div className="flex gap-4">
            <div className="text-3xl">🎁</div>
            <div>
              <p className="text-sm text-gray-600 dark:text-slate-400 mb-1">Offer · Expires on 12/30/2025</p>
              <p className="font-bold text-gray-900 dark:text-white">Book Your 2026 or 2027 Wedding at 2025 Rates!</p>
            </div>
          </div>
          <button className="text-dribbble-pink font-semibold hover:underline whitespace-nowrap">Claim Deal</button>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white">About this vendor</h3>
          <div className="flex gap-4">
            {socialLinks.facebook && (
              <a href={socialLinks.facebook} target="_blank" rel="noopener noreferrer" className="text-gray-800 dark:text-slate-300 hover:text-dribbble-pink transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </a>
            )}
            {socialLinks.instagram && (
              <a href={socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="text-gray-800 dark:text-slate-300 hover:text-dribbble-pink transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
              </a>
            )}
            {contactInfo.website && (
              <a href={contactInfo.website} target="_blank" rel="noopener noreferrer" className="text-gray-800 dark:text-slate-300 hover:text-dribbble-pink transition-colors">
                <GlobeAltIcon className="w-5 h-5" />
              </a>
            )}
            {contactInfo.phone && (
              <a href={`tel:${contactInfo.phone}`} className="text-gray-800 dark:text-slate-300 hover:text-dribbble-pink transition-colors">
                <PhoneIcon className="w-5 h-5" />
              </a>
            )}
          </div>
        </div>

        {vendor.description && (
          <>
            <p className="text-gray-700 dark:text-slate-300 leading-relaxed">
              {vendor.description}
            </p>
            <button className="text-black dark:text-white font-semibold underline decoration-2 underline-offset-4 hover:text-dribbble-pink">
              Read more
            </button>
          </>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 mt-6">
          {vendor.verified && (
            <div className="flex items-center gap-3 text-gray-700 dark:text-slate-300 text-sm">
              <CheckBadgeIcon className="w-5 h-5 text-blue-500" />
              <span>Verified Vendor</span>
            </div>
          )}
          {vendor.yearsInBusiness && (
            <div className="flex items-center gap-3 text-gray-700 dark:text-slate-300 text-sm">
              <CalendarDaysIcon className="w-5 h-5" />
              <span>+{vendor.yearsInBusiness} years in business</span>
            </div>
          )}
          {vendor.teamSize && (
            <div className="flex items-center gap-3 text-gray-700 dark:text-slate-300 text-sm">
              <UserGroupIcon className="w-5 h-5" />
              <span>Team of {vendor.teamSize} members</span>
            </div>
          )}
        </div>
      </section>

      {/* Services Offered (if available) */}
      {vendor.servicesOffered && vendor.servicesOffered.length > 0 && (
        <section className="border-t border-gray-200 dark:border-slate-700 pt-10">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Services offered</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8">
            {vendor.servicesOffered.map((service: string, index: number) => (
              <div key={index} className="text-gray-700 dark:text-slate-300">{service}</div>
            ))}
          </div>
        </section>
      )}

      {/* Portfolio (if available) */}
      {vendor.portfolio && vendor.portfolio.length > 0 && (
        <section className="border-t border-gray-200 dark:border-slate-700 pt-10">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Portfolio</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {vendor.portfolio.map((item: { id: string; title: string; description?: string; images: string[] }) => (
              <div key={item.id} className="space-y-3">
                <div className="relative aspect-[4/3] rounded-lg overflow-hidden">
                  <Image
                    src={item.images[0]}
                    alt={item.title || 'Portfolio item'}
                    fill
                    className="object-cover"
                  />
                </div>
                <h4 className="font-semibold text-gray-900 dark:text-white">{item.title}</h4>
                {item.description && (
                  <p className="text-sm text-gray-600 dark:text-slate-400">{item.description}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pricing Section */}
      <section id="pricing" className="border-t border-gray-200 dark:border-slate-700 pt-10">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Pricing details</h3>

        <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-6 mb-6">
          <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Starting prices</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-start gap-3">
              <div className="text-2xl">🥂</div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Reception</p>
                <p className="text-xl font-bold text-dribbble-pink">{priceRangeDisplay}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="text-2xl">🏛️</div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Ceremony</p>
                <p className="text-xl font-bold text-dribbble-pink">{priceRangeDisplay}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="text-2xl">🍹</div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Bar services</p>
                <p className="text-gray-700 dark:text-slate-300">$1 per person</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="text-2xl">🍽️</div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Catering</p>
                <p className="text-gray-700 dark:text-slate-300">Contact for price</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 text-sm text-gray-600 dark:text-slate-400">
          <p>• Couples usually spend $15,200</p>
          <p>• Starting prices don&apos;t include service fees, taxes, gratuity, and rental fees.</p>
          <p>• Guest count and seasonality may also affect prices. Peak season for this venue is Apr-Sept.</p>
        </div>

        <div className="mt-6 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-6">
          <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Are you interested?</h4>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">Reach out and share your wedding details.</p>
          <a href="#contact" className="inline-block px-6 py-2 rounded-full border-2 border-dribbble-pink text-dribbble-pink font-semibold hover:bg-dribbble-pink hover:text-white transition-colors">
            Get a personalized quote
          </a>
        </div>
      </section>

      {/* Amenities Section */}
      <section id="amenities" className="border-t border-gray-200 dark:border-slate-700 pt-10">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Amenities + details</h3>

        {vendor.servicesOffered && vendor.servicesOffered.length > 0 ? (
          <>
            <div className="mb-8">
              <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Amenities</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                {vendor.servicesOffered.slice(0, 6).map((service: string, index: number) => (
                  <div key={index} className="text-gray-700 dark:text-slate-300">
                    {service}
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-8">
              <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Ceremony Types</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-gray-700 dark:text-slate-300">
                <div>Civil Union</div>
                <div>Commitment Ceremony</div>
                <div>Elopement</div>
                <div>Interfaith Ceremony</div>
                <div>Non-Religious Ceremony</div>
                <div>Religious Ceremony</div>
                <div>Second Wedding</div>
                <div>Vow Renewal Ceremony</div>
              </div>
            </div>

            <div className="mb-8">
              <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Guest Capacity</h4>
              <p className="text-gray-700 dark:text-slate-300">300+</p>
            </div>

            <div className="mb-8">
              <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Settings</h4>
              <p className="text-gray-700 dark:text-slate-300">Garden</p>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Venue Service Offerings</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-gray-700 dark:text-slate-300">
                <div>Cakes & Desserts</div>
                <div>Food & Catering</div>
                <div>Planning</div>
                <div>Rentals & Equipment</div>
                <div>Service Staff</div>
              </div>
            </div>
          </>
        ) : (
          <p className="text-gray-700 dark:text-slate-300">Contact us to learn more about our amenities and features.</p>
        )}

        <div className="mt-8 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6">
          <div className="flex gap-4">
            <div className="text-3xl">💬</div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Any questions?</h4>
              <a href="#contact" className="text-dribbble-pink font-semibold hover:underline">
                Start a conversation
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Availability Section */}
      <section id="availability" className="border-t border-gray-200 dark:border-slate-700 pt-10">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Availability</h3>

        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-8 mb-6">
          <div className="text-center">
            <div className="inline-block p-4 bg-gray-100 dark:bg-slate-800 rounded-full mb-4">
              <CalendarDaysIcon className="w-8 h-8 text-gray-600 dark:text-slate-300" />
            </div>
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No availability details yet</h4>
            <p className="text-gray-600 dark:text-slate-400 mb-4">
              Looking for the perfect match?{' '}
              <Link href="/vendors" className="text-dribbble-pink hover:underline font-medium">
                Continue browsing vendors
              </Link>
            </p>
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <h4 className="font-semibold text-gray-900 dark:text-white mb-3">💡 Booking Tips</h4>
          <ul className="space-y-2 text-sm text-gray-700 dark:text-slate-300">
            <li>• Popular wedding dates book 12-18 months in advance</li>
            <li>• Consider off-peak seasons (Nov-Mar) for better availability and pricing</li>
            <li>• Friday and Sunday weddings often have more availability than Saturdays</li>
            <li>• Contact the venue directly to check real-time availability for your date</li>
          </ul>
        </div>
      </section>

      {/* Reviews Section */}
      <section id="reviews" className="border-t border-gray-200 dark:border-slate-700 pt-10">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Reviews</h3>
        <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-6">
          <div className="flex flex-col md:flex-row items-center gap-8 mb-8">
            <div className="text-center md:text-left">
              <div className="text-5xl font-bold text-gray-900 dark:text-white">{stats.averageRating || 5.0}</div>
              <div className="text-sm text-gray-500 dark:text-slate-400 mt-1">out of 5.0</div>
              <div className="flex text-dribbble-pink justify-center md:justify-start my-2">
                {[...Array(5)].map((_, i) => (
                  <StarSolidIcon key={i} className="w-5 h-5" />
                ))}
              </div>
              <div className="text-gray-600 dark:text-slate-400">{stats.reviewCount || 0} reviews</div>
            </div>
            <div className="flex-1 w-full space-y-2">
              {(() => {
                const reviews = (vendor as any).reviews || [];
                const ratingDist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
                reviews.forEach((review: any) => {
                  if (review.rating >= 1 && review.rating <= 5) {
                    ratingDist[review.rating as 1 | 2 | 3 | 4 | 5]++;
                  }
                });
                const total = reviews.length || 1;

                return [5, 4, 3, 2, 1].map((star) => {
                  const count = ratingDist[star as 1 | 2 | 3 | 4 | 5];
                  const percentage = Math.round((count / total) * 100);

                  return (
                    <div key={star} className="flex items-center gap-3">
                      <span className="w-12 text-sm text-gray-600 dark:text-slate-400 underline cursor-pointer hover:text-gray-900 dark:hover:text-white">{star} Star</span>
                      <div className="flex-1 h-3 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gray-800 dark:bg-white transition-all"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                      <span className="w-10 text-right text-sm text-gray-600 dark:text-slate-400">{percentage}%</span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-slate-700 pt-6">
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400 mb-6">
              <span>👤</span>
              <p>Your trust is our goal. Our community relies on honest reviews to help you make those big decisions with ease.</p>
            </div>
            <button className="w-full md:w-auto px-6 py-2 rounded-full border border-dribbble-pink text-dribbble-pink font-semibold hover:bg-gray-50 dark:hover:bg-slate-800 transition">
              Write a review
            </button>
          </div>
        </div>

        {/* Individual Review Cards */}
        {(vendor as any).reviews && (vendor as any).reviews.length > 0 && (
          <div className="mt-8 space-y-6">
            {(vendor as any).reviews.slice(0, 5).map((review: any) => (
              <div key={review.id} className="border border-gray-200 dark:border-slate-700 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  {/* User Avatar */}
                  <div className="flex-shrink-0">
                    {review.user?.avatar ? (
                      <Image
                        src={review.user.avatar}
                        alt={review.user.name || 'User'}
                        width={48}
                        height={48}
                        className="rounded-full"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-slate-700 flex items-center justify-center">
                        <span className="text-xl text-gray-600 dark:text-slate-300">
                          {review.user?.name?.charAt(0) || 'U'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1">
                    {/* User Info and Rating */}
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{review.user?.name || 'Anonymous'}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex text-dribbble-pink">
                            {[...Array(5)].map((_, i) => (
                              <StarSolidIcon
                                key={i}
                                className={`w-4 h-4 ${i < review.rating ? 'text-dribbble-pink' : 'text-gray-300 dark:text-slate-600'}`}
                              />
                            ))}
                          </div>
                          {review.verified && (
                            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                              <CheckBadgeIcon className="w-4 h-4" />
                              Verified
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-sm text-gray-500 dark:text-slate-400">
                        {new Date(review.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                    </div>

                    {/* Review Title */}
                    {review.title && (
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-2">{review.title}</h4>
                    )}

                    {/* Review Content */}
                    <p className="text-gray-700 dark:text-slate-300 leading-relaxed mb-3">{review.content}</p>

                    {/* Event Info */}
                    {review.event_type && (
                      <p className="text-sm text-gray-600 dark:text-slate-400 mb-3">
                        Event: {review.event_type}
                        {review.event_date && ` • ${new Date(review.event_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}`}
                      </p>
                    )}

                    {/* Review Images */}
                    {review.images && review.images.length > 0 && (
                      <div className="flex gap-2 mb-3">
                        {review.images.slice(0, 3).map((image: string, idx: number) => (
                          <div key={idx} className="relative w-24 h-24 rounded-lg overflow-hidden">
                            <Image
                              src={image}
                              alt={`Review image ${idx + 1}`}
                              fill
                              className="object-cover"
                            />
                          </div>
                        ))}
                        {review.images.length > 3 && (
                          <div className="w-24 h-24 rounded-lg bg-gray-100 dark:bg-slate-800 flex items-center justify-center">
                            <span className="text-sm text-gray-600 dark:text-slate-400">+{review.images.length - 3} more</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Helpful Button */}
                    <div className="flex items-center gap-4 pt-3 border-t border-gray-100 dark:border-slate-700">
                      <button className="text-sm text-gray-600 dark:text-slate-400 hover:text-dribbble-pink transition-colors flex items-center gap-1">
                        <span>👍</span>
                        <span>Helpful ({review.helpful || 0})</span>
                      </button>
                    </div>

                    {/* Vendor Response */}
                    {review.vendor_response && (
                      <div className="mt-4 ml-4 pl-4 border-l-2 border-gray-200 dark:border-slate-700">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Response from {vendor.businessName}</p>
                        <p className="text-sm text-gray-700 dark:text-slate-300">{review.vendor_response}</p>
                        {review.vendor_responded_at && (
                          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                            {new Date(review.vendor_responded_at).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* View More Reviews Button */}
            {(vendor as any).reviews.length > 5 && (
              <div className="text-center">
                <button className="px-6 py-2 rounded-full border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 font-semibold hover:border-dribbble-pink hover:text-dribbble-pink transition-colors">
                  View all {(vendor as any).reviews.length} reviews
                </button>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-4 text-center">
            <div className="text-3xl mb-2">💗</div>
            <p className="font-bold text-gray-900 dark:text-white">TheFesta</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stats.averageRating || 5.0}/5</p>
            <p className="text-sm text-gray-600 dark:text-slate-400">{stats.reviewCount || 5} reviews</p>
          </div>
          <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-4 text-center">
            <div className="text-3xl mb-2">🔍</div>
            <p className="font-bold text-gray-900 dark:text-white">Google</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">4.3/5</p>
            <p className="text-sm text-gray-600 dark:text-slate-400">800 reviews</p>
          </div>
        </div>

        <div className="mt-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6">
          <div className="flex gap-4">
            <div className="text-3xl">💬</div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Any questions?</h4>
              <a href="#contact" className="text-dribbble-pink font-semibold hover:underline">
                Start a conversation
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="border-t border-gray-200 dark:border-slate-700 pt-10">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Service area & Contact info</h3>

        {/* Map placeholder */}
        <div className="mb-6 h-64 bg-gray-100 dark:bg-slate-800 rounded-lg overflow-hidden relative">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <MapPinIcon className="w-12 h-12 text-gray-400 dark:text-slate-500 mx-auto mb-2" />
              <p className="text-gray-500 dark:text-slate-400">Map view</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 mb-8">
          {location.city && (
            <div className="flex items-start gap-3">
              <MapPinIcon className="w-5 h-5 text-gray-700 dark:text-slate-400 mt-0.5" />
              <div>
                <p className="text-gray-700 dark:text-slate-300">{location.city}, {location.country}</p>
                <a href="#" className="text-sm text-dribbble-pink hover:underline">Open map</a>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-slate-700 pt-6 space-y-4">
          {contactInfo.phone && (
            <div className="flex items-center gap-3">
              <PhoneIcon className="w-5 h-5 text-gray-700 dark:text-slate-400" />
              <a href={`tel:${contactInfo.phone}`} className="text-gray-700 dark:text-slate-300 hover:text-dribbble-pink font-medium">
                {contactInfo.phone}
              </a>
            </div>
          )}
          {contactInfo.website && (
            <div className="flex items-center gap-3">
              <GlobeAltIcon className="w-5 h-5 text-gray-700 dark:text-slate-400" />
              <a href={contactInfo.website} target="_blank" rel="noopener noreferrer" className="text-gray-700 dark:text-slate-300 hover:text-dribbble-pink font-medium">
                Website
              </a>
            </div>
          )}
          {socialLinks.facebook && (
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-gray-700 dark:text-slate-400" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              <a href={socialLinks.facebook} target="_blank" rel="noopener noreferrer" className="text-gray-700 dark:text-slate-300 hover:text-dribbble-pink font-medium">
                Facebook
              </a>
            </div>
          )}
          {socialLinks.instagram && (
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-gray-700 dark:text-slate-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
              <a href={socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="text-gray-700 dark:text-slate-300 hover:text-dribbble-pink font-medium">
                Instagram
              </a>
            </div>
          )}
        </div>

        <div className="mt-8 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6">
          <div className="flex gap-4">
            <div className="text-3xl">📅</div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Want to book a visit?</h4>
              <a href="#contact" className="text-dribbble-pink font-semibold hover:underline">
                Start a conversation
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-gray-200 dark:border-slate-700 pt-8">
          <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Wedding vendors in {location.city}</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {['Bridal Salons', 'Beauty Salons', 'Caterers', 'DJs', 'Florists', 'Reception Venues', 'Videographers', 'Wedding Bands', 'Wedding Photographers', 'Wedding Planners'].map((category) => (
              <a key={category} href={`/vendors?category=${encodeURIComponent(category)}`} className="text-sm text-gray-700 dark:text-slate-300 hover:text-dribbble-pink hover:underline">
                {location.city} {category}
              </a>
            ))}
          </div>
        </div>
      </section>
    </VendorProfileLayout>
  );
}

// Inquiry Sidebar Component
function InquirySidebar({ priceRange }: { priceRange: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-sm rounded-lg p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Start the convo</h3>
        <p className="text-xs text-gray-500 dark:text-slate-400">*=Required</p>
      </div>
      <p className="text-gray-800 dark:text-slate-200 font-semibold mb-6">{priceRange} starting price</p>

      <form className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <input
              type="text"
              id="fname"
              className="peer w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-800 rounded px-3 pt-4 pb-2 text-sm focus:outline-none focus:border-gray-900 dark:focus:border-white placeholder-transparent dark:text-white"
              placeholder="First name"
            />
            <label
              htmlFor="fname"
              className="absolute left-3 top-1 text-xs text-gray-500 dark:text-slate-400 transition-all peer-placeholder-shown:top-3 peer-placeholder-shown:text-sm peer-focus:top-1 peer-focus:text-xs"
            >
              First name*
            </label>
          </div>
          <div className="relative">
            <input
              type="text"
              id="lname"
              className="peer w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-800 rounded px-3 pt-4 pb-2 text-sm focus:outline-none focus:border-gray-900 dark:focus:border-white placeholder-transparent dark:text-white"
              placeholder="Last name"
            />
            <label
              htmlFor="lname"
              className="absolute left-3 top-1 text-xs text-gray-500 dark:text-slate-400 transition-all peer-placeholder-shown:top-3 peer-placeholder-shown:text-sm peer-focus:top-1 peer-focus:text-xs"
            >
              Last name*
            </label>
          </div>
        </div>

        <div className="relative">
          <input
            type="email"
            id="email"
            className="peer w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-800 rounded px-3 pt-4 pb-2 text-sm focus:outline-none focus:border-gray-900 dark:focus:border-white placeholder-transparent dark:text-white"
            placeholder="Email"
          />
          <label
            htmlFor="email"
            className="absolute left-3 top-1 text-xs text-gray-500 dark:text-slate-400 transition-all peer-placeholder-shown:top-3 peer-placeholder-shown:text-sm peer-focus:top-1 peer-focus:text-xs"
          >
            Email*
          </label>
        </div>

        <div className="space-y-2">
          <div className="relative">
            <input
              type="text"
              id="wedding-date"
              className="peer w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-800 rounded px-3 pt-4 pb-2 text-sm focus:outline-none focus:border-gray-900 dark:focus:border-white placeholder-transparent dark:text-white"
              placeholder="Wedding date"
            />
            <label
              htmlFor="wedding-date"
              className="absolute left-3 top-1 text-xs text-gray-500 dark:text-slate-400 transition-all peer-placeholder-shown:top-3 peer-placeholder-shown:text-sm peer-focus:top-1 peer-focus:text-xs"
            >
              Wedding date*
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
            <input type="checkbox" className="rounded border-gray-300 dark:border-slate-600" />
            <span>My wedding date is flexible</span>
          </label>
        </div>

        <div className="relative">
          <select
            id="guests"
            className="peer w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-800 rounded px-3 pt-4 pb-2 text-sm focus:outline-none focus:border-gray-900 dark:focus:border-white dark:text-white"
          >
            <option value="">Select...</option>
            <option value="1-50">1-50</option>
            <option value="51-100">51-100</option>
            <option value="101-200">101-200</option>
            <option value="201+">201+</option>
          </select>
          <label
            htmlFor="guests"
            className="absolute left-3 top-1 text-xs text-gray-500 dark:text-slate-400"
          >
            Number of guests*
          </label>
        </div>

        <div className="relative">
          <input
            type="tel"
            id="phone"
            className="peer w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-800 rounded px-3 pt-4 pb-2 text-sm focus:outline-none focus:border-gray-900 dark:focus:border-white placeholder-transparent dark:text-white"
            placeholder="Phone number"
          />
          <label
            htmlFor="phone"
            className="absolute left-3 top-1 text-xs text-gray-500 dark:text-slate-400 transition-all peer-placeholder-shown:top-3 peer-placeholder-shown:text-sm peer-focus:top-1 peer-focus:text-xs"
          >
            Phone number
          </label>
        </div>

        <div className="relative">
          <textarea
            id="message"
            rows={4}
            className="peer w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-800 rounded px-3 pt-4 pb-2 text-sm focus:outline-none focus:border-gray-900 dark:focus:border-white placeholder-transparent resize-none dark:text-white"
            placeholder="Message"
          ></textarea>
          <label
            htmlFor="message"
            className="absolute left-3 top-1 text-xs text-gray-500 dark:text-slate-400 transition-all peer-placeholder-shown:top-3 peer-placeholder-shown:text-sm peer-focus:top-1 peer-focus:text-xs"
          >
            Introduce yourself and share your wedding details...
          </label>
        </div>

        <div className="text-xs text-gray-600 dark:text-slate-400 space-y-2">
          <p className="font-semibold">Why use TheFesta to message vendors?</p>
          <p className="leading-relaxed">
            By clicking &quot;Request Quote&quot;, you accept our Terms of Use and agree to TheFesta creating an account for you.
            Your messages may be monitored for quality, safety, and security according to our Acceptable Content Policy.
            See our Privacy Policy to learn how we handle your data.
          </p>
        </div>

        <button
          type="submit"
          className="w-full bg-dribbble-pink hover:bg-dribbble-pink/90 text-white font-bold py-3 rounded-full transition-colors shadow-sm"
        >
          Request Quote
        </button>

        <p className="text-xs text-center text-gray-500 dark:text-slate-400 flex items-center justify-center gap-1">
          <span>⏱️</span>
          <span>Typically responds within 24h</span>
        </p>
      </form>
    </div>
  );
}
