import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  type LayoutChangeEvent,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Share,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/theme/useTheme';
import { ACCENT, ON_ACCENT } from '@/theme/brand';
import { useVendor, useVendorPackages, useVendorReviews } from '@/hooks/useVendors';
import { useMarkVendorBooked, useSavedVendorStatus } from '@/hooks/useSavedVendors';
import { useStartConversation } from '@/hooks/useMessages';
import { EmptyState } from '@/components/ui/EmptyState';
import { SaveVendorButton } from '@/components/vendors/SaveVendorButton';
import { Avatar } from '@/components/vendors/ui/Avatar';
import {
  buildConnectLinks,
  buildServiceArea,
  formatVendorAddress,
  shortVendorLocation,
  vendorImages,
} from '@/lib/vendor-format';
import {
  authorColor,
  formatLanguages,
  formatReviewDate,
  getServiceDescription,
  getServiceIcon,
  parsePackagePrice,
  PKG_BADGE_ICONS,
  PKG_BADGE_TONES,
  ratingLabel,
} from '@/lib/vendor-detail';
import type { VendorFaq, VendorListing, VendorPackageDetail, VendorReview } from '@/types/vendor';

const ACCENT_HOVER = '#b97fd0';
const STAR_ON = '#FBBF24';
const STAR_OFF = '#D1D5DB';

/* ───────────────────────── shared bits ───────────────────────── */

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  const rounded = Math.round(rating);
  return (
    <View className="flex-row items-center" style={{ gap: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= rounded ? 'star' : 'star'}
          size={size}
          color={i <= rounded ? STAR_ON : STAR_OFF}
        />
      ))}
    </View>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View className="mb-5">
      <Text className="font-work-sans-bold text-xl text-ed-on-surface">{title}</Text>
      {subtitle ? (
        <Text className="mt-1 font-work-sans text-[13px] text-ed-on-surface-variant">{subtitle}</Text>
      ) : null}
    </View>
  );
}

/** Top-bordered section wrapper matching the web's divided content column. */
function Section({
  children,
  first = false,
  onLayout,
}: {
  children: React.ReactNode;
  first?: boolean;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  return (
    <View onLayout={onLayout} className={`px-5 py-8 ${first ? '' : 'border-t border-ed-outline-variant'}`}>
      {children}
    </View>
  );
}

/* ───────────────────────── section nav tabs ───────────────────────── */

const NAV_TABS = ['Photos', 'About', 'Services', 'Pricing', 'Team', "FAQ's", 'Location', 'Reviews'] as const;
type NavTab = (typeof NAV_TABS)[number];

function VendorNavTabs({
  active,
  onSelect,
  onSurface,
  onSurfaceVariant,
}: {
  active: NavTab;
  onSelect: (tab: NavTab) => void;
  onSurface: string;
  onSurfaceVariant: string;
}) {
  return (
    <View className="border-b border-ed-outline-variant bg-ed-bg">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 20 }}
      >
        {NAV_TABS.map((tab) => {
          const isActive = active === tab;
          return (
            <Pressable key={tab} onPress={() => onSelect(tab)} className="items-center pt-3">
              <Text
                className="font-work-sans-bold text-[13px]"
                style={{ color: isActive ? onSurface : onSurfaceVariant }}
              >
                {tab}
              </Text>
              <View
                className="mt-2.5 h-0.5 w-full rounded-full"
                style={{ backgroundColor: isActive ? onSurface : 'transparent' }}
              />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* ───────────────────────── header ───────────────────────── */

function VendorHeader({
  vendor,
  rating,
  reviewCount,
  onShare,
}: {
  vendor: VendorListing;
  rating: number;
  reviewCount: number;
  onShare: () => void;
}) {
  const city = shortVendorLocation(vendor.location);
  const label = ratingLabel(rating);
  return (
    <View className="px-5 pt-5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="font-playfair-bold text-3xl leading-9 text-ed-on-surface">
            {vendor.business_name}
          </Text>
          <Text className="mt-2 font-work-sans-bold text-[11px] uppercase tracking-[2px] text-ed-on-surface-variant">
            {vendor.category}
          </Text>

          <View className="mt-3 gap-1.5">
            {reviewCount > 0 ? (
              <View className="flex-row items-center gap-1.5">
                <StarRow rating={rating} size={15} />
                <Text className="ml-0.5 font-work-sans-bold text-sm text-ed-on-surface">
                  {rating.toFixed(1)}
                </Text>
                <Text className="font-work-sans-bold text-xs" style={{ color: label.color }}>
                  {label.text}
                </Text>
                <Text className="text-ed-on-surface-variant"> · </Text>
                <Text className="font-work-sans-medium text-sm text-ed-on-surface underline">
                  {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}
                </Text>
              </View>
            ) : (
              <Text className="font-work-sans text-xs italic text-ed-on-surface-variant">
                No reviews yet
              </Text>
            )}
            {city ? (
              <View className="flex-row items-center gap-1">
                <Ionicons name="location-outline" size={15} color="#6b7280" />
                <Text className="font-work-sans text-sm text-ed-on-surface-variant">{city}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View className="flex-row items-center gap-2.5">
          <Pressable
            onPress={onShare}
            className="h-10 w-10 items-center justify-center rounded-full border border-ed-outline-variant"
            accessibilityLabel="Share vendor"
          >
            <Ionicons name="share-outline" size={18} color="#6b7280" />
          </Pressable>
          <View className="h-10 w-10 items-center justify-center rounded-full border border-ed-outline-variant">
            <SaveVendorButton vendorId={vendor.id} size={18} color="#6b7280" />
          </View>
        </View>
      </View>
    </View>
  );
}

/* ───────────────────────── about ───────────────────────── */

const ABOUT_COLLAPSE_LIMIT = 300;

function AboutText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const trimmed = text.trim();
  const hasMore = trimmed.length > ABOUT_COLLAPSE_LIMIT;

  let preview = trimmed;
  if (hasMore && !expanded) {
    const slice = trimmed.slice(0, ABOUT_COLLAPSE_LIMIT);
    const lastSpace = slice.lastIndexOf(' ');
    preview = slice.slice(0, lastSpace > 0 ? lastSpace : ABOUT_COLLAPSE_LIMIT).trimEnd() + '…';
  }

  return (
    <View>
      <Text className="font-work-sans text-sm leading-6 text-ed-on-surface-variant">
        {expanded || !hasMore ? trimmed : preview}
      </Text>
      {hasMore ? (
        <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={6} className="mt-2 self-start">
          <Text className="font-work-sans-bold text-sm text-ed-on-surface underline">
            {expanded ? 'Show less' : 'Read more'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function AboutFact({ icon, children }: { icon: keyof typeof Ionicons.glyphMap; children: React.ReactNode }) {
  return (
    <View className="w-1/2 flex-row items-center gap-2 py-1.5 pr-2">
      <Ionicons name={icon} size={14} color="#9ca3af" />
      <Text className="flex-1 font-work-sans text-[13px] text-ed-on-surface-variant">{children}</Text>
    </View>
  );
}

function VendorAboutSection({
  vendor,
  onMessage,
  messagePending,
}: {
  vendor: VendorListing;
  onMessage: () => void;
  messagePending: boolean;
}) {
  const about = vendor.description || vendor.bio;
  const team = vendor.team ?? [];
  const social = vendor.social_links ?? {};
  const singular = vendor.category.toLowerCase().replace(/s$/, '');

  const avatarUri =
    vendor.logo && vendor.logo.trim() !== ''
      ? vendor.logo
      : team[0]?.avatar && team[0].avatar.trim() !== ''
        ? team[0].avatar
        : vendor.cover_image && vendor.cover_image.trim() !== ''
          ? vendor.cover_image
          : null;

  const socials: { key: string; icon: keyof typeof Ionicons.glyphMap; color: string; url: string }[] = [];
  const open = (url: string) => Linking.openURL(url).catch(() => {});
  if (social.instagram)
    socials.push({
      key: 'ig',
      icon: 'logo-instagram',
      color: '#E4405F',
      url: social.instagram.startsWith('http')
        ? social.instagram
        : `https://instagram.com/${social.instagram.replace(/^@/, '')}`,
    });
  if (social.facebook)
    socials.push({
      key: 'fb',
      icon: 'logo-facebook',
      color: '#1877F2',
      url: social.facebook.startsWith('http') ? social.facebook : `https://facebook.com/${social.facebook}`,
    });
  if (social.tiktok)
    socials.push({
      key: 'tt',
      icon: 'logo-tiktok',
      color: '#111827',
      url: social.tiktok.startsWith('http')
        ? social.tiktok
        : `https://www.tiktok.com/@${social.tiktok.replace(/^@+/, '')}`,
    });
  if (social.whatsapp)
    socials.push({
      key: 'wa',
      icon: 'logo-whatsapp',
      color: '#25D366',
      url: social.whatsapp.startsWith('http')
        ? social.whatsapp
        : `https://wa.me/${social.whatsapp.replace(/[^0-9]/g, '')}`,
    });
  if (social.website)
    socials.push({ key: 'web', icon: 'globe-outline', color: '#9ca3af', url: social.website });

  return (
    <View>
      <SectionHeading title={`About this ${singular}`} />

      <View className="flex-row gap-5">
        {/* Profile card */}
        <View className="w-[112px] items-center">
          <View className="h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-ed-surface-container">
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} className="h-full w-full" resizeMode="cover" />
            ) : (
              <Text className="font-work-sans-bold text-3xl text-ed-on-surface-variant">
                {(vendor.business_name || '?').slice(0, 2).toUpperCase()}
              </Text>
            )}
          </View>
          <Text className="mt-3 text-center font-work-sans-bold text-sm text-ed-on-surface">
            {vendor.business_name}
          </Text>
          <Text className="mt-0.5 text-center font-work-sans text-xs text-ed-on-surface-variant">
            {team[0]?.role ?? vendor.category}
          </Text>

          {socials.length > 0 ? (
            <View className="mt-3 flex-row flex-wrap justify-center gap-3">
              {socials.map((s) => (
                <Pressable key={s.key} onPress={() => open(s.url)} hitSlop={6}>
                  <Ionicons name={s.icon} size={22} color={s.color} />
                </Pressable>
              ))}
            </View>
          ) : null}

          <Pressable
            onPress={onMessage}
            disabled={messagePending}
            className="mt-4 w-full items-center rounded-full bg-[#1A1A1A] py-2.5"
            accessibilityRole="button"
          >
            {messagePending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="font-work-sans-bold text-[13px] text-white">Message Vendor</Text>
            )}
          </Pressable>
        </View>

        {/* Text + facts */}
        <View className="flex-1">
          {about ? <AboutText text={about} /> : null}

          <View className="mt-4 flex-row flex-wrap">
            {vendor.verified ? (
              <AboutFact icon="checkmark-circle">
                <Text className="font-work-sans-medium text-ed-on-surface">Verified vendor</Text>
              </AboutFact>
            ) : null}
            {vendor.response_time_hours ? (
              <AboutFact icon="flash-outline">Responds within {vendor.response_time_hours}</AboutFact>
            ) : null}
            {vendor.locally_owned ? (
              <AboutFact icon="home-outline">Locally owned business</AboutFact>
            ) : null}
            {vendor.years_in_business != null ? (
              <AboutFact icon="calendar-outline">
                {vendor.years_in_business} years in business
              </AboutFact>
            ) : null}
            {vendor.languages && vendor.languages.length > 0 ? (
              <AboutFact icon="globe-outline">Speaks {formatLanguages(vendor.languages)}</AboutFact>
            ) : null}
            {team.length > 0 ? (
              <AboutFact icon="people-outline">
                {team.length} team member{team.length !== 1 ? 's' : ''}
              </AboutFact>
            ) : null}
            {vendor.subcategories && vendor.subcategories.length > 0 ? (
              <AboutFact icon="sparkles-outline">{vendor.subcategories.slice(0, 2).join(', ')}</AboutFact>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

/* ───────────────────────── services ───────────────────────── */

function VendorServicesSection({ vendor }: { vendor: VendorListing }) {
  const services = vendor.services_offered ?? [];
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  if (services.length === 0) return null;

  return (
    <View>
      <SectionHeading title="Services" subtitle={`Everything included when you book ${vendor.business_name}.`} />
      <View className="overflow-hidden rounded-3xl border border-ed-outline-variant bg-ed-surface">
        {services.map((service, i) => {
          const isOpen = openIdx === i;
          return (
            <View key={service} className={i > 0 ? 'border-t border-ed-outline-variant' : ''}>
              <Pressable
                onPress={() => setOpenIdx(isOpen ? null : i)}
                className="flex-row items-center gap-3 px-5 py-4"
              >
                <Ionicons name={getServiceIcon(service)} size={16} color={ACCENT_HOVER} />
                <Text className="flex-1 font-work-sans-medium text-sm text-ed-on-surface">{service}</Text>
                <Ionicons
                  name={isOpen ? 'chevron-up' : 'chevron-down'}
                  size={15}
                  color="#9ca3af"
                />
              </Pressable>
              {isOpen ? (
                <View className="border-t border-ed-outline-variant bg-ed-surface-container-low px-5 py-4">
                  <Text className="font-work-sans text-[13px] leading-5 text-ed-on-surface-variant">
                    {getServiceDescription(service, vendor.business_name)}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* ───────────────────────── packages ───────────────────────── */

function PackageCard({
  pkg,
  popular,
  selected,
  onToggle,
}: {
  pkg: VendorPackageDetail;
  popular: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const customBadge = pkg.badge?.label?.trim() ? pkg.badge : null;
  const tone = customBadge ? PKG_BADGE_TONES[customBadge.tone ?? 'dark'] ?? PKG_BADGE_TONES.dark : null;
  const badgeIcon = customBadge ? PKG_BADGE_ICONS[customBadge.icon ?? 'star'] ?? 'star' : 'star';
  const items = pkg.includes ?? [];

  return (
    <Pressable
      onPress={onToggle}
      className={`rounded-3xl bg-ed-surface p-5 ${selected ? 'border-2' : 'border border-ed-outline-variant'}`}
      style={selected ? { borderColor: ACCENT } : undefined}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`Select ${pkg.name} package${pkg.price ? `, TZS ${pkg.price}` : ''}`}
    >
      {selected ? (
        <View
          className="absolute right-4 top-4 h-6 w-6 items-center justify-center rounded-full"
          style={{ backgroundColor: ACCENT }}
        >
          <Ionicons name="checkmark" size={14} color={ON_ACCENT} />
        </View>
      ) : null}

      {customBadge && tone ? (
        <View
          className="mb-3 flex-row items-center gap-1 self-start rounded-full px-3 py-1"
          style={{ backgroundColor: tone.bg }}
        >
          <Ionicons name={badgeIcon} size={11} color={tone.fg} />
          <Text
            className="font-work-sans-bold text-[9px] uppercase tracking-[1.5px]"
            style={{ color: tone.fg }}
          >
            {customBadge.label}
          </Text>
        </View>
      ) : popular ? (
        <View className="mb-3 self-start rounded-full px-3 py-1" style={{ backgroundColor: ACCENT }}>
          <Text
            className="font-work-sans-bold text-[9px] uppercase tracking-[1.5px]"
            style={{ color: ON_ACCENT }}
          >
            Most popular
          </Text>
        </View>
      ) : null}

      <Text className="font-work-sans-bold text-[10px] uppercase tracking-[2px] text-ed-on-surface-variant">
        {pkg.name}
      </Text>
      <Text className="mt-2 font-work-sans-bold text-2xl text-ed-on-surface">
        {pkg.price ? `TZS ${pkg.price}` : 'On request'}
      </Text>

      <View className="my-4 h-px bg-ed-outline-variant" />

      {pkg.description ? (
        <Text className="mb-3 font-work-sans text-[13px] leading-5 text-ed-on-surface-variant">
          {pkg.description}
        </Text>
      ) : null}

      {items.length > 0 ? (
        <View>
          <Text className="mb-2 font-work-sans-semibold text-[10px] uppercase tracking-[1.5px] text-ed-on-surface-variant">
            Includes
          </Text>
          {items.map((item) => (
            <View
              key={item}
              className="flex-row items-center gap-3 border-b border-ed-outline-variant py-2"
            >
              <Ionicons name="checkmark" size={14} color={ACCENT_HOVER} />
              <Text className="flex-1 font-work-sans text-[13px] text-ed-on-surface-variant">{item}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

function VendorPricingSection({
  vendor,
  packages,
  selectedPackageId,
  onTogglePackage,
}: {
  vendor: VendorListing;
  packages: VendorPackageDetail[];
  selectedPackageId: string | null;
  onTogglePackage: (pkg: VendorPackageDetail) => void;
}) {
  const sorted = useMemo(
    () => [...packages].sort((a, b) => parsePackagePrice(a.price) - parsePackagePrice(b.price)),
    [packages],
  );
  const anyBadge = sorted.some((p) => p.badge?.label?.trim());
  const popularIdx = anyBadge ? -1 : sorted.length > 1 ? Math.floor(sorted.length / 2) : -1;

  return (
    <View>
      <SectionHeading
        title="Packages"
        subtitle="Choose the package that fits your day. Every option includes our full commitment."
      />

      {sorted.length > 0 ? (
        <View className="gap-3">
          {sorted.map((pkg, i) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              popular={!anyBadge && i === popularIdx}
              selected={selectedPackageId === pkg.id}
              onToggle={() => onTogglePackage(pkg)}
            />
          ))}
        </View>
      ) : (
        <View className="items-center rounded-3xl border border-dashed border-ed-outline-variant p-8">
          <Text className="font-work-sans text-sm text-ed-on-surface-variant">
            Contact {vendor.business_name} for package pricing
          </Text>
        </View>
      )}

      <View className="mt-4 flex-row items-start gap-3 rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3">
        <Ionicons name="warning-outline" size={16} color="#f59e0b" />
        <Text className="flex-1 font-work-sans text-[13px] leading-5 text-[#92400e]">
          <Text className="font-work-sans-bold text-[#92400e]">Starting rates only. </Text>
          Final price varies by date, number of guests, and selected add-ons.
        </Text>
      </View>
    </View>
  );
}

/* ───────────────────────── team ───────────────────────── */

function VendorTeamSection({ vendor }: { vendor: VendorListing }) {
  const team = vendor.team ?? [];
  if (team.length === 0) return null;

  return (
    <View>
      <SectionHeading
        title="Meet the Team"
        subtitle={`The people behind ${vendor.business_name} — your day is in their hands.`}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 20, paddingRight: 8 }}
      >
        {team.map((member) => (
          <View key={member.id} className="w-40 items-center">
            <Avatar name={member.name} uri={member.avatar} size={80} />
            <Text className="mt-3 text-center font-work-sans-bold text-base text-ed-on-surface">
              {member.name}
            </Text>
            {member.role ? (
              <Text className="mt-1 text-center font-work-sans-bold text-[10px] uppercase tracking-[2px] text-ed-on-surface-variant">
                {member.role}
              </Text>
            ) : null}
            <View className="my-3 h-px w-8 bg-ed-outline-variant" />
            {member.bio ? (
              <Text className="text-center font-work-sans text-[13px] leading-5 text-ed-on-surface-variant">
                {member.bio}
              </Text>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/* ───────────────────────── faq ───────────────────────── */

function VendorFaqSection({ vendor, onMessage }: { vendor: VendorListing; onMessage: () => void }) {
  const faqs: VendorFaq[] = (vendor.faqs ?? []).filter((f) => f.question?.trim() && f.answer?.trim());
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  if (faqs.length === 0) return null;

  return (
    <View>
      <SectionHeading
        title="Frequently Asked Questions"
        subtitle={`Everything couples typically ask before booking ${vendor.business_name}.`}
      />

      <View className="overflow-hidden rounded-3xl border border-ed-outline-variant bg-ed-surface">
        {faqs.map((faq, i) => {
          const isOpen = openIdx === i;
          return (
            <View key={faq.id ?? i} className={i > 0 ? 'border-t border-ed-outline-variant' : ''}>
              <Pressable
                onPress={() => setOpenIdx(isOpen ? null : i)}
                className="flex-row items-start gap-3 px-5 py-4"
              >
                <View
                  className="mt-0.5 h-6 w-6 items-center justify-center rounded-full"
                  style={{ backgroundColor: isOpen ? '#1A1A1A' : '#F4F4F4' }}
                >
                  <Text
                    className="font-work-sans-bold text-[11px]"
                    style={{ color: isOpen ? '#FFFFFF' : '#9CA3AF' }}
                  >
                    {i + 1}
                  </Text>
                </View>
                <Text className="flex-1 font-work-sans-bold text-sm leading-5 text-ed-on-surface">
                  {faq.question}
                </Text>
                <Ionicons
                  name={isOpen ? 'chevron-up' : 'chevron-down'}
                  size={15}
                  color="#9ca3af"
                  style={{ marginTop: 2 }}
                />
              </Pressable>
              {isOpen ? (
                <View className="border-t border-ed-outline-variant bg-ed-surface-container-low px-5 py-4 pl-14">
                  <Text className="font-work-sans text-[13px] leading-5 text-ed-on-surface-variant">
                    {faq.answer}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <Pressable
        onPress={onMessage}
        className="mt-4 flex-row items-center gap-3 rounded-2xl border border-ed-outline-variant bg-ed-surface-container-low px-4 py-3.5"
      >
        <View className="h-8 w-8 items-center justify-center rounded-full bg-[#1A1A1A]">
          <Ionicons name="book-outline" size={14} color="#FFFFFF" />
        </View>
        <Text className="flex-1 font-work-sans text-[13px] leading-5 text-ed-on-surface-variant">
          Still have questions?{' '}
          <Text className="font-work-sans-bold text-ed-on-surface">
            Send {vendor.business_name} a message
          </Text>{' '}
          — they typically respond {vendor.response_time_hours ? `within ${vendor.response_time_hours}` : 'within 48 hours'}.
        </Text>
      </Pressable>
    </View>
  );
}

/* ───────────────────────── reviews ───────────────────────── */

function ReviewsSummary({
  avg,
  reviewCount,
  reviews,
}: {
  avg: number;
  reviewCount: number;
  reviews: VendorReview[];
}) {
  const dist = useMemo(() => {
    return [5, 4, 3, 2, 1].map((star) => {
      const n = reviews.filter((r) => Math.round(r.rating) === star).length;
      const pct = reviewCount > 0 ? Math.round((n / reviewCount) * 100) : 0;
      return { star, pct };
    });
  }, [reviews, reviewCount]);

  return (
    <View className="overflow-hidden rounded-3xl border border-ed-outline-variant">
      <View className="items-center gap-2 border-b border-ed-outline-variant p-6">
        <View className="flex-row items-baseline gap-1.5">
          <Text className="font-work-sans-bold text-5xl text-ed-on-surface">{avg.toFixed(1)}</Text>
          <Text className="font-work-sans text-sm text-ed-on-surface-variant">out of 5.0</Text>
        </View>
        <StarRow rating={avg} size={18} />
        <Text className="font-work-sans text-sm text-ed-on-surface-variant">
          {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}
        </Text>
      </View>

      <View className="gap-2.5 p-6">
        {dist.map(({ star, pct }) => (
          <View key={star} className="flex-row items-center gap-3">
            <Text className="w-12 font-work-sans text-[13px] text-ed-on-surface-variant">{star} Star</Text>
            <View className="h-2.5 flex-1 overflow-hidden rounded-full bg-ed-surface-container">
              <View className="h-full rounded-full bg-[#1A1A1A]" style={{ width: `${pct}%` }} />
            </View>
            <Text className="w-10 text-right font-work-sans text-[13px] text-ed-on-surface-variant">
              {pct}%
            </Text>
          </View>
        ))}
      </View>

      <View className="flex-row items-center gap-3 border-t border-ed-outline-variant bg-ed-surface-container-low px-6 py-3">
        <Ionicons name="people-outline" size={16} color="#9ca3af" />
        <Text className="flex-1 font-work-sans text-xs text-ed-on-surface-variant">
          Your trust is our goal. Our community relies on honest reviews to help couples make confident
          decisions.
        </Text>
      </View>
    </View>
  );
}

const REVIEW_PAGE = 4;

function VendorReviewsSection({
  reviews,
  avg,
  reviewCount,
}: {
  reviews: VendorReview[];
  avg: number;
  reviewCount: number;
}) {
  const [visible, setVisible] = useState(REVIEW_PAGE);

  return (
    <View>
      <SectionHeading title="Reviews" />

      {reviewCount > 0 ? <ReviewsSummary avg={avg} reviewCount={reviewCount} reviews={reviews} /> : null}

      {reviews.length > 0 ? (
        <View className="mt-2">
          {reviews.slice(0, visible).map((review) => (
            <View key={review.id} className="border-t border-ed-outline-variant py-5">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1 flex-row items-start gap-3">
                  {review.user.avatar ? (
                    <Avatar name={review.user.name} uri={review.user.avatar} size={44} />
                  ) : (
                    <View
                      className="h-11 w-11 items-center justify-center rounded-full"
                      style={{ backgroundColor: authorColor(review.user.name) }}
                    >
                      <Text className="font-work-sans-bold text-base text-white">
                        {review.user.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View className="flex-1">
                    <Text className="font-work-sans-bold text-sm text-ed-on-surface">
                      {review.user.name}
                    </Text>
                    <View className="mt-0.5 flex-row items-center gap-1.5">
                      <StarRow rating={review.rating} size={13} />
                      <Text className="font-work-sans-bold text-sm text-ed-on-surface">
                        {review.rating.toFixed(1)}
                      </Text>
                    </View>
                  </View>
                </View>
                <Text className="font-work-sans text-[13px] text-ed-on-surface-variant">
                  {formatReviewDate(review.created_at)}
                </Text>
              </View>

              {review.content ? (
                <Text className="ml-14 mt-3 font-work-sans text-sm leading-6 text-ed-on-surface-variant">
                  {review.content}
                </Text>
              ) : null}
              {review.event_type ? (
                <Text className="ml-14 mt-2 font-work-sans text-xs text-ed-on-surface-variant">
                  {review.event_type}
                </Text>
              ) : null}
            </View>
          ))}

          {visible < reviews.length ? (
            <View className="mt-6 items-center gap-3">
              <Text className="font-work-sans-medium text-xs text-ed-on-surface-variant">
                Showing {Math.min(visible, reviews.length)} of {reviews.length} reviews
              </Text>
              <Pressable
                onPress={() => setVisible((v) => v + REVIEW_PAGE)}
                className="flex-row items-center gap-2 rounded-full bg-[#1A1A1A] px-8 py-3"
              >
                <Text className="font-work-sans-bold text-sm text-white">Read more reviews</Text>
                <Ionicons name="chevron-down" size={15} color="#FFFFFF" />
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : (
        <View className="items-center rounded-3xl border border-dashed border-ed-outline-variant p-8">
          <Text className="font-work-sans text-sm text-ed-on-surface-variant">
            No reviews yet — be the first to share your experience.
          </Text>
        </View>
      )}
    </View>
  );
}

/* ───────────────────────── gallery lightbox ───────────────────────── */

function GalleryModal({
  images,
  visible,
  onClose,
}: {
  images: string[];
  visible: boolean;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black">
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
          {images.map((uri) => (
            <View key={uri} style={{ width, height }} className="items-center justify-center">
              <Image source={{ uri }} style={{ width, height: height * 0.8 }} resizeMode="contain" />
            </View>
          ))}
        </ScrollView>
        <Pressable
          onPress={onClose}
          style={{ top: insets.top + 8 }}
          className="absolute right-5 h-10 w-10 items-center justify-center rounded-full bg-white/15"
          accessibilityLabel="Close gallery"
        >
          <Ionicons name="close" size={22} color="#FFFFFF" />
        </Pressable>
      </View>
    </Modal>
  );
}

/* ───────────────────────── screen ───────────────────────── */

export default function VendorDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { editorial } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: vendor, isLoading, error } = useVendor(id);
  const { data: packages } = useVendorPackages(id);
  const { data: reviews } = useVendorReviews(id);
  const savedStatus = useSavedVendorStatus(id);
  const markBooked = useMarkVendorBooked();
  const startConversation = useStartConversation();

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<VendorPackageDetail | null>(null);

  // Section nav — mirrors the web's sticky tab rail. RN has no anchor
  // scrolling, so each Section reports its y-offset via onLayout (relative to
  // the content column) and we combine it with that column's own offset
  // (relative to the ScrollView) to get an absolute scroll target.
  const scrollRef = useRef<ScrollView>(null);
  const contentTopRef = useRef(0);
  const sectionOffsets = useRef<Partial<Record<NavTab, number>>>({});
  const tabsHeightRef = useRef(44);
  const activeTabRef = useRef<NavTab>('About');
  const [activeTab, setActiveTab] = useState<NavTab>('About');

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-ed-bg">
        <ActivityIndicator color={editorial.onSurfaceVariant} />
      </SafeAreaView>
    );
  }

  if (error || !vendor) {
    return (
      <SafeAreaView className="flex-1 bg-ed-bg" edges={['top']}>
        <View className="flex-row items-center gap-3 px-5 pt-2">
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={24} color={editorial.onSurface} />
          </Pressable>
        </View>
        <EmptyState icon="alert-circle-outline" label="This vendor could not be loaded." />
      </SafeAreaView>
    );
  }

  const images = vendorImages(vendor);
  const hero = images[0];
  const reviewList = reviews ?? [];
  const reviewCount = vendor.stats?.reviewCount ?? reviewList.length;
  const avg =
    vendor.stats?.averageRating ??
    (reviewList.length > 0
      ? reviewList.reduce((sum, r) => sum + r.rating, 0) / reviewList.length
      : 0);
  const address = formatVendorAddress(vendor.location);
  const connectLinks = buildConnectLinks(vendor);
  const isBooked = savedStatus === 'booked';

  const onShare = () =>
    Share.share({
      message: `${vendor.business_name} on OpusFesta`,
      url: `https://opusfesta.com/vendors/${vendor.slug}`,
    }).catch(() => {});

  const onMarkBooked = () => {
    if (isBooked) return;
    Alert.alert('Mark as booked?', `Confirm you have booked ${vendor.business_name}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark booked',
        onPress: () =>
          markBooked.mutate(vendor.id, {
            onError: (err) =>
              Alert.alert('Could not update', err instanceof Error ? err.message : 'Please try again.'),
          }),
      },
    ]);
  };

  const openLink = (url: string) =>
    Linking.openURL(url).catch(() => Alert.alert('Could not open link'));

  const onTogglePackage = (pkg: VendorPackageDetail) => {
    setSelectedPackage((current) => (current?.id === pkg.id ? null : pkg));
  };

  const goToBooking = () => {
    if (selectedPackage) {
      router.push({
        pathname: '/booking/[vendorId]',
        params: { vendorId: vendor.id, package: selectedPackage.name, price: selectedPackage.price ?? '' },
      });
    } else {
      router.push(`/booking/${vendor.id}`);
    }
  };

  const onMessage = () => {
    if (startConversation.isPending) return;
    startConversation.mutate(vendor.id, {
      onSuccess: (thread) => router.push(`/chat/${thread.id}`),
      onError: (err) =>
        Alert.alert(
          'Could not open conversation',
          err instanceof Error ? err.message : 'Please try again.',
        ),
    });
  };

  const serviceArea = buildServiceArea(vendor);
  const hasFaqs = (vendor.faqs ?? []).some((f) => f.question?.trim() && f.answer?.trim());

  const registerSection = (tab: NavTab) => (e: LayoutChangeEvent) => {
    sectionOffsets.current[tab] = e.nativeEvent.layout.y;
  };

  const scrollToTab = (tab: NavTab) => {
    if (tab === 'Photos') {
      if (hero) setGalleryOpen(true);
      return;
    }
    const offset = sectionOffsets.current[tab];
    if (offset == null) return;
    scrollRef.current?.scrollTo({
      y: Math.max(contentTopRef.current + offset - tabsHeightRef.current - 12, 0),
      animated: true,
    });
    activeTabRef.current = tab;
    setActiveTab(tab);
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const threshold = e.nativeEvent.contentOffset.y - contentTopRef.current + tabsHeightRef.current + 60;
    let next: NavTab = 'About';
    for (const tab of NAV_TABS) {
      const offset = sectionOffsets.current[tab];
      if (offset != null && offset <= threshold) next = tab;
    }
    if (next !== activeTabRef.current) {
      activeTabRef.current = next;
      setActiveTab(next);
    }
  };

  return (
    <View className="flex-1 bg-ed-bg">
      {/* Top bar — back to category, matching web's uppercase crumb */}
      <View style={{ paddingTop: insets.top + 8 }} className="flex-row items-center px-5 pb-3">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="flex-row items-center gap-1.5"
          accessibilityLabel="Back to vendors"
        >
          <Ionicons name="arrow-back" size={14} color={editorial.onSurfaceVariant} />
          <Text className="font-work-sans-bold text-[11px] uppercase tracking-[2px] text-ed-on-surface-variant">
            {vendor.category} vendors
          </Text>
        </Pressable>
      </View>

      <View onLayout={(e) => { tabsHeightRef.current = e.nativeEvent.layout.height; }}>
        <VendorNavTabs
          active={activeTab}
          onSelect={scrollToTab}
          onSurface={editorial.onSurface}
          onSurfaceVariant={editorial.onSurfaceVariant}
        />
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
        onScroll={handleScroll}
        scrollEventThrottle={32}
      >
        {/* Gallery */}
        <View className="px-4 pt-4">
          <Pressable
            onPress={() => hero && setGalleryOpen(true)}
            className="h-60 overflow-hidden rounded-2xl bg-ed-surface-container"
            accessibilityLabel="View photos"
          >
            {hero ? (
              <>
                <Image source={{ uri: hero }} className="h-full w-full" resizeMode="cover" />
                {images.length > 1 ? (
                  <>
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.45)']}
                      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 72 }}
                    />
                    <View className="absolute bottom-3 right-3 flex-row items-center gap-1.5 rounded-full bg-white/95 px-3 py-2">
                      <Ionicons name="grid-outline" size={14} color="#1A1A1A" />
                      <Text className="font-work-sans-bold text-[13px] text-[#1A1A1A]">See all</Text>
                      <Text className="font-work-sans text-xs text-gray-500">({images.length})</Text>
                    </View>
                  </>
                ) : null}
              </>
            ) : (
              <View className="h-full w-full items-center justify-center border border-dashed border-ed-outline-variant">
                <View className="mb-3 h-16 w-16 items-center justify-center rounded-full bg-ed-surface">
                  <Text className="font-work-sans-bold text-2xl text-ed-on-surface-variant">
                    {(vendor.business_name || '?').slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <Text className="font-work-sans-bold text-sm text-ed-on-surface">
                  {vendor.business_name}
                </Text>
                <Text className="mt-1 font-work-sans text-xs text-ed-on-surface-variant">
                  This vendor hasn&rsquo;t uploaded photos yet.
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        <VendorHeader vendor={vendor} rating={avg} reviewCount={reviewCount} onShare={onShare} />

        {isBooked ? (
          <View className="mt-3 px-5">
            <View className="flex-row items-center gap-1.5 self-start rounded-full bg-[#dcfce7] px-3 py-1">
              <Ionicons name="checkmark-circle" size={13} color="#16a34a" />
              <Text className="font-work-sans-bold text-[11px] text-[#16a34a]">Booked</Text>
            </View>
          </View>
        ) : null}

        <View
          className="mt-2"
          onLayout={(e) => { contentTopRef.current = e.nativeEvent.layout.y; }}
        >
          <Section first onLayout={registerSection('About')}>
            <VendorAboutSection
              vendor={vendor}
              onMessage={onMessage}
              messagePending={startConversation.isPending}
            />
          </Section>

          {vendor.services_offered && vendor.services_offered.length > 0 ? (
            <Section onLayout={registerSection('Services')}>
              <VendorServicesSection vendor={vendor} />
            </Section>
          ) : null}

          <Section onLayout={registerSection('Pricing')}>
            <VendorPricingSection
              vendor={vendor}
              packages={packages ?? []}
              selectedPackageId={selectedPackage?.id ?? null}
              onTogglePackage={onTogglePackage}
            />
          </Section>

          {vendor.team && vendor.team.length > 0 ? (
            <Section onLayout={registerSection('Team')}>
              <VendorTeamSection vendor={vendor} />
            </Section>
          ) : null}

          {hasFaqs ? (
            <Section onLayout={registerSection("FAQ's")}>
              <VendorFaqSection vendor={vendor} onMessage={onMessage} />
            </Section>
          ) : null}

          {address || serviceArea.length > 0 ? (
            <Section onLayout={registerSection('Location')}>
              <SectionHeading title="Location & Service Area" />
              {address ? (
                <View className="flex-row items-center justify-between gap-3 border-b border-ed-outline-variant pb-3">
                  <View className="flex-1 flex-row items-center gap-2">
                    <Ionicons name="location-outline" size={15} color="#9ca3af" />
                    <Text className="flex-1 font-work-sans text-sm text-ed-on-surface" numberOfLines={1}>
                      {address}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      openLink(
                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
                      )
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Open in Maps"
                  >
                    <Text className="font-work-sans-bold text-sm text-ed-on-surface underline">
                      Open map
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {serviceArea.length > 0 ? (
                <View className={address ? 'mt-4' : ''}>
                  <Text className="mb-3 font-work-sans-bold text-[11px] uppercase tracking-[2px] text-ed-on-surface-variant">
                    Service area
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {serviceArea.map((area) => (
                      <View
                        key={area}
                        className="flex-row items-center gap-1.5 rounded-full border border-ed-outline-variant bg-ed-surface-container-low px-3.5 py-2"
                      >
                        <Ionicons name="location-outline" size={12} color="#9ca3af" />
                        <Text className="font-work-sans-medium text-sm text-ed-on-surface">{area}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </Section>
          ) : null}

          <Section onLayout={registerSection('Reviews')}>
            <VendorReviewsSection reviews={reviewList} avg={avg} reviewCount={reviewCount} />
          </Section>

          {connectLinks.length > 0 ? (
            <Section>
              <SectionHeading title="Connect" />
              <View>
                {connectLinks.map((link) => (
                  <Pressable
                    key={link.key}
                    className="flex-row items-center gap-3 py-2.5"
                    onPress={() => openLink(link.url)}
                    accessibilityRole="button"
                    accessibilityLabel={link.label}
                  >
                    <Ionicons name={link.icon} size={18} color={editorial.onSurface} />
                    <Text className="flex-1 font-work-sans text-sm text-ed-on-surface">{link.label}</Text>
                    <Ionicons name="open-outline" size={14} color={editorial.onSurfaceVariant} />
                  </Pressable>
                ))}
              </View>
            </Section>
          ) : null}
        </View>
      </ScrollView>

      {/* Sticky bottom action bar */}
      <View
        style={{ paddingBottom: insets.bottom + 12 }}
        className="absolute bottom-0 w-full flex-row items-center gap-3 border-t border-ed-outline-variant bg-ed-surface px-5 pt-3"
      >
        <Pressable
          onPress={onMarkBooked}
          className={`h-12 w-12 items-center justify-center rounded-full border ${
            isBooked ? 'border-[#16a34a] bg-[#dcfce7]' : 'border-ed-outline-variant'
          }`}
          accessibilityLabel={isBooked ? 'Booked' : 'Mark as booked'}
        >
          <Ionicons name="checkmark" size={22} color={isBooked ? '#16a34a' : editorial.onSurfaceVariant} />
        </Pressable>
        <Pressable
          className="flex-1 items-center rounded-full py-3.5"
          style={{ backgroundColor: ACCENT }}
          onPress={goToBooking}
          accessibilityRole="button"
          accessibilityLabel={
            selectedPackage ? `Request a quote for ${selectedPackage.name}` : 'Request a quote'
          }
        >
          <Text className="font-work-sans-bold text-sm" style={{ color: ON_ACCENT }} numberOfLines={1}>
            {selectedPackage ? `Request a quote · ${selectedPackage.name}` : 'Request a quote'}
          </Text>
        </Pressable>
      </View>

      <GalleryModal images={images} visible={galleryOpen} onClose={() => setGalleryOpen(false)} />
    </View>
  );
}
