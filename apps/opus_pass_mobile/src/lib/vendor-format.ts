import { marketLabel } from '@opusfesta/lib';
import { formatTzs } from '@/lib/cart';
import type { VendorListing, VendorLocation, VendorPackageDetail } from '@/types/vendor';

/** Production rows use '' for unset contact/social fields rather than null. */
function present(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Package prices are stored pre-formatted ("1,500,000"), so parse before comparing. */
function parsePackagePrice(price: string | null): number | null {
  if (!present(price)) return null;
  const digits = price.replace(/[^0-9.]/g, '');
  if (!digits) return null;
  const parsed = Number.parseFloat(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * `vendors.price_range` is null across production rows, so the "from" price is
 * derived from the cheapest package instead. Returns null when a vendor has
 * published no priced packages — callers should show "Contact for pricing".
 */
export function startingPriceLabel(packages: VendorPackageDetail[] | undefined): string | null {
  if (!packages?.length) return null;

  const prices = packages
    .map((pkg) => parsePackagePrice(pkg.price))
    .filter((price): price is number => price !== null);

  if (!prices.length) return null;
  return formatTzs(Math.min(...prices));
}

export function formatVendorAddress(location: VendorLocation | null): string {
  if (!location) return '';
  const parts = [
    location.street,
    location.ward,
    location.district,
    location.city,
    location.region,
  ].filter(present);
  return Array.from(new Set(parts)).join(', ');
}

/** Short form for cards — the most specific single place name available. */
export function shortVendorLocation(location: VendorLocation | null): string {
  if (!location) return '';
  return location.city || location.district || location.region || '';
}

/**
 * Resolves the vendor's home + service markets to display labels, matching
 * the web storefront's "Service area" chip row. `home_market` sorts first,
 * the vendor's city is appended when it isn't already covered by a market.
 */
export function buildServiceArea(vendor: VendorListing): string[] {
  const homeMarket = present(vendor.home_market) ? vendor.home_market.trim() : null;
  const otherMarkets = Array.isArray(vendor.service_markets)
    ? vendor.service_markets.filter((id): id is string => present(id))
    : [];
  const ids = Array.from(new Set([...(homeMarket ? [homeMarket] : []), ...otherMarkets]));
  const labels = ids.map(marketLabel);

  const city = shortVendorLocation(vendor.location);
  if (present(city) && !labels.includes(city)) labels.push(city);

  return labels;
}

export interface ConnectLink {
  key: string;
  label: string;
  icon: 'call-outline' | 'globe-outline' | 'logo-whatsapp' | 'logo-instagram' | 'logo-facebook';
  url: string;
}

/** Builds the detail screen's Connect rows, skipping blank/empty-string fields. */
export function buildConnectLinks(vendor: VendorListing): ConnectLink[] {
  const contact = vendor.contact_info ?? {};
  const social = vendor.social_links ?? {};
  const links: ConnectLink[] = [];

  if (present(contact.phone)) {
    links.push({
      key: 'phone',
      label: 'Call',
      icon: 'call-outline',
      url: `tel:${contact.phone.replace(/\s/g, '')}`,
    });
  }

  const whatsapp = present(contact.whatsapp) ? contact.whatsapp : social.whatsapp;
  if (present(whatsapp)) {
    links.push({
      key: 'whatsapp',
      label: 'WhatsApp',
      icon: 'logo-whatsapp',
      url: `https://wa.me/${whatsapp.replace(/[^0-9]/g, '')}`,
    });
  }

  if (present(social.website)) {
    links.push({ key: 'website', label: 'Website', icon: 'globe-outline', url: social.website });
  }

  if (present(social.instagram)) {
    const handle = social.instagram.replace(/^@/, '');
    links.push({
      key: 'instagram',
      label: 'Instagram',
      icon: 'logo-instagram',
      url: handle.startsWith('http') ? handle : `https://instagram.com/${handle}`,
    });
  }

  if (present(social.facebook)) {
    links.push({
      key: 'facebook',
      label: 'Facebook',
      icon: 'logo-facebook',
      url: social.facebook.startsWith('http')
        ? social.facebook
        : `https://facebook.com/${social.facebook}`,
    });
  }

  return links;
}

/** Cover first, then gallery — de-duplicated, since cover is often also in gallery. */
export function vendorImages(vendor: Pick<VendorListing, 'cover_image' | 'gallery_urls'>): string[] {
  const images = [vendor.cover_image, ...(vendor.gallery_urls ?? [])].filter(present);
  return Array.from(new Set(images));
}
