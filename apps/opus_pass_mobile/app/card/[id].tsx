import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { BackButton } from '@/components/navigation/BackButton';
import { Stepper } from '@/components/digital-cards/Stepper';
import { useCart } from '@/hooks/useCart';
import { useDigitalCardProducts } from '@/hooks/useDigitalCardProducts';
import { useLikedDesigns } from '@/hooks/useLikedDesigns';
import { usePackagesContent } from '@/hooks/usePackagesContent';
import { useProductAddonsFaqContent } from '@/hooks/useProductAddonsFaqContent';
import { buildItemSummary, formatTzs, GUEST_STEP, MIN_GUESTS } from '@/lib/cart';
import { ACCENT, ON_ACCENT, TIER_PILL, TIER_PILL_DEFAULT } from '@/theme/brand';
import { useTheme } from '@/theme/useTheme';
import type { CartItem } from '@/types/cart';
import type { DigitalCardProduct } from '@/types/digital-cards';
import type { PackageTier, TierBadgeIcon, TierBadgeTone } from '@/types/packages';
import type { AddOn, FaqItem } from '@/types/product-addons-faq';

/** Darker eyebrow gray (Tailwind gray-700) the web uses for section labels — one shade past this app's onSurfaceVariant token. */
const EYEBROW_GRAY = '#374151';

/** Product descriptions are TipTap-authored HTML on the web; strip tags for plain-text display here. */
function stripHtml(html: string) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const BADGE_INFO: Record<
  string,
  { label: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  most_popular: { label: 'Most Popular', icon: 'flame-outline' },
  premium: { label: 'Premium Template', icon: 'diamond-outline' },
  trending: { label: 'Trending This Week', icon: 'trending-up-outline' },
};

/** Mirrors ProductDetailClient.tsx's TIER_BADGE_TONE — the tier badge pill colors. */
const TIER_BADGE_TONE: Record<TierBadgeTone, { bg: string; text: string }> = {
  slate: { bg: '#475569', text: '#FFFFFF' },
  accent: { bg: ACCENT, text: ON_ACCENT },
  gold: { bg: '#D4B65C', text: '#3A2C06' },
};

/** Mirrors ProductDetailClient.tsx's TIER_BADGE_ICON — admin-chosen icon before the badge label. 'none' renders no icon. */
function TierBadgeIconGlyph({
  icon,
  color,
  size = 12,
}: {
  icon: TierBadgeIcon;
  color: string;
  size?: number;
}) {
  switch (icon) {
    case 'sparkles':
      return <Ionicons name="sparkles" size={size} color={color} />;
    case 'star':
      return <Ionicons name="star" size={size} color={color} />;
    case 'diamond':
      return <Ionicons name="diamond" size={size} color={color} />;
    case 'gem':
      return <MaterialCommunityIcons name="diamond-stone" size={size} color={color} />;
    case 'crown':
      return <MaterialCommunityIcons name="crown" size={size} color={color} />;
    case 'heart':
      return <Ionicons name="heart" size={size} color={color} />;
    case 'award':
      return <Ionicons name="ribbon" size={size} color={color} />;
    case 'zap':
      return <Ionicons name="flash" size={size} color={color} />;
    case 'flame':
      return <Ionicons name="flame" size={size} color={color} />;
    case 'party':
      return <MaterialCommunityIcons name="party-popper" size={size} color={color} />;
    default:
      return null;
  }
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <Text
      className="font-inter-bold text-label uppercase tracking-[2px]"
      style={{ color: EYEBROW_GRAY }}
    >
      {children}
    </Text>
  );
}

function RelatedCard({
  product,
  fromGuestPrice,
  fromLabel,
  perGuestLabel,
  onPress,
}: {
  product: DigitalCardProduct;
  fromGuestPrice: number;
  fromLabel: string;
  perGuestLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="w-[48%]">
      <View
        className="overflow-hidden rounded-sm bg-ed-surface-container-low"
        style={{ aspectRatio: 5 / 7 }}
      >
        <Image
          source={{ uri: product.image_url }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
      </View>
      <Text
        className="mt-2.5 font-inter-bold text-body-sm leading-snug text-ed-on-surface"
        numberOfLines={2}
      >
        {product.name}
      </Text>
      {fromGuestPrice > 0 ? (
        <Text className="mt-1 font-inter text-caption text-ed-on-surface-variant">
          {fromLabel} {formatTzs(fromGuestPrice)} {perGuestLabel}
        </Text>
      ) : null}
    </Pressable>
  );
}

function TierCard({
  tier,
  active,
  onPress,
  perGuestLabel,
}: {
  tier: PackageTier;
  active: boolean;
  onPress: () => void;
  perGuestLabel: string;
}) {
  const pill = TIER_PILL[tier.id] ?? TIER_PILL_DEFAULT;
  const badgeTone = TIER_BADGE_TONE[tier.badge_tone] ?? TIER_BADGE_TONE.slate;

  return (
    <View style={{ width: '48%' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={onPress}
        className="rounded-lg p-3"
        style={{
          backgroundColor: pill.bg,
          borderWidth: active ? 1.5 : 1,
          borderColor: active ? pill.activeBorder : pill.idleBorder,
        }}
      >
        <Text className="font-inter-bold text-caption text-ed-on-surface">{tier.name}</Text>
        <Text className="mt-0.5 font-inter-bold text-body-sm text-ed-on-surface">
          {formatTzs(tier.price_per_guest)}{' '}
          <Text className="font-inter-medium text-label text-ed-on-surface-variant">
            {perGuestLabel}
          </Text>
        </Text>
        <Text
          className="mt-1.5 font-inter text-label leading-tight text-ed-on-surface-variant"
          numberOfLines={3}
        >
          {tier.best_for}
        </Text>
      </Pressable>

      {tier.badge_label ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: -10, left: 0, right: 0, alignItems: 'center' }}
        >
          <View
            className="flex-row items-center gap-1 rounded-full px-2 py-1"
            style={{ backgroundColor: badgeTone.bg }}
          >
            {tier.badge_icon && tier.badge_icon !== 'none' ? (
              <TierBadgeIconGlyph icon={tier.badge_icon} color={badgeTone.text} size={11} />
            ) : null}
            <Text
              className="font-inter-bold text-label uppercase tracking-wide"
              style={{ color: badgeTone.text }}
            >
              {tier.badge_label}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function IncludedAddOnCard({
  addon,
  includedPillLabel,
}: {
  addon: AddOn;
  includedPillLabel: string;
}) {
  return (
    <View
      className="mt-3 rounded-md p-4"
      style={{ borderWidth: 1, borderColor: '#CDEBA6', backgroundColor: '#F4FBE9' }}
    >
      <View className="flex-row items-start gap-3">
        <View
          className="mt-0.5 h-5 w-5 items-center justify-center rounded-md"
          style={{ backgroundColor: '#5C6B4D' }}
        >
          <Ionicons name="checkmark" size={13} color="#FFFFFF" />
        </View>
        <View className="flex-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="font-inter-bold text-body-sm text-ed-on-surface">
              {addon.includedTitle || addon.title}
            </Text>
            <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: '#9FE870' }}>
              <Text
                className="font-inter-bold text-label uppercase tracking-wide"
                style={{ color: '#1A1A1A' }}
              >
                {includedPillLabel || 'Included'}
              </Text>
            </View>
          </View>
          <Text className="mt-1 font-inter text-caption leading-4 text-ed-on-surface-variant">
            {addon.includedDescription || addon.description}
          </Text>
        </View>
      </View>
    </View>
  );
}

function AddOnCard({
  addon,
  priceFromLabel,
  howManyLabel,
  selected,
  qty,
  onToggle,
  onQtyChange,
  onCallForQuote,
}: {
  addon: AddOn;
  priceFromLabel: string;
  howManyLabel: string;
  selected: boolean;
  qty: number;
  onToggle: () => void;
  onQtyChange: (qty: number) => void;
  onCallForQuote: () => void;
}) {
  const { editorial } = useTheme();

  const priceLabel =
    addon.pricingMode === 'flat'
      ? `${formatTzs(addon.flatFee)}${addon.flatFeeLabel ? ` ${addon.flatFeeLabel}` : ''}`
      : addon.pricingMode === 'per_unit'
        ? `${priceFromLabel} ${formatTzs(addon.unitPrice)}${addon.unitLabel ? ` ${addon.unitLabel}` : ''}`
        : '';

  return (
    <View
      className="mt-3 rounded-md border"
      style={{ borderColor: selected ? editorial.onSurface : editorial.outlineVariant }}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        onPress={onToggle}
        className="flex-row items-start gap-3 p-4"
      >
        <View
          className="mt-0.5 h-5 w-5 items-center justify-center rounded-md border"
          style={{
            borderColor: selected ? editorial.onSurface : editorial.outline,
            backgroundColor: selected ? editorial.onSurface : 'transparent',
          }}
        >
          {selected ? (
            <Ionicons name="checkmark" size={13} color={editorial.bg} />
          ) : null}
        </View>
        <View className="flex-1">
          <Text className="font-inter-bold text-body-sm text-ed-on-surface">{addon.title}</Text>
          <Text className="mt-0.5 font-inter text-caption leading-4 text-ed-on-surface-variant">
            {addon.description}
          </Text>
          {priceLabel ? (
            <Text className="mt-1.5 font-inter-bold text-caption text-ed-on-surface">
              {priceLabel}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {selected && addon.pricingMode === 'per_unit' ? (
        <View className="flex-row items-center justify-between gap-3 border-t border-ed-outline-variant px-4 pb-4 pt-4">
          <View className="min-w-0 flex-1">
            <Text className="font-inter-bold text-caption text-ed-on-surface">
              {howManyLabel}
            </Text>
            <Text className="mt-0.5 font-inter text-label text-ed-on-surface-variant">
              {formatTzs(addon.unitPrice)} {addon.unitLabel}
            </Text>
          </View>
          <Stepper
            value={qty}
            min={addon.minQty}
            onDecrement={() => onQtyChange(Math.max(addon.minQty, qty - addon.qtyStep))}
            onIncrement={() => onQtyChange(qty + addon.qtyStep)}
          />
        </View>
      ) : null}

      {selected && addon.pricingMode === 'quote' ? (
        <View className="flex-row items-center justify-between gap-3 border-t border-ed-outline-variant px-4 pb-4 pt-4">
          <Text className="flex-1 font-inter-bold text-caption text-ed-on-surface">
            {addon.quoteLabel}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onCallForQuote}
            className="shrink-0 rounded-full border px-3 py-1"
            style={{ borderColor: editorial.onSurface }}
          >
            <Text
              className="font-inter-bold text-label uppercase tracking-wide"
              style={{ color: editorial.onSurface }}
            >
              {addon.quoteCtaLabel || 'Call us'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function InfoAccordionItem({
  faq,
  open,
  onToggle,
  onLinkPress,
}: {
  faq: FaqItem;
  open: boolean;
  onToggle: () => void;
  onLinkPress: () => void;
}) {
  const { editorial } = useTheme();
  const bodyText = faq.body.replace('{link}', '').trim();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={onToggle}
      className="border-b border-ed-outline-variant py-4"
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text className="flex-1 font-inter-medium text-body-sm text-ed-on-surface">
          {faq.title}
        </Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={editorial.onSurfaceVariant}
        />
      </View>
      {open ? (
        <Text className="mt-2 font-inter text-body-sm leading-5 text-ed-on-surface-variant">
          {bodyText}
          {faq.link_href && faq.link_label ? (
            <Text
              onPress={onLinkPress}
              className="font-inter-semibold text-ed-on-surface"
            >
              {' '}
              {faq.link_label}
            </Text>
          ) : null}
        </Text>
      ) : null}
    </Pressable>
  );
}

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { editorial } = useTheme();
  const products = useDigitalCardProducts();
  const { width: windowWidth } = useWindowDimensions();
  const { liked: likedIds, toggleLike } = useLikedDesigns();
  const packagesQuery = usePackagesContent();
  const addonsFaqQuery = useProductAddonsFaqContent();
  const { addItem, has, count: cartCount } = useCart();

  const [slide, setSlide] = useState(0);
  /** Transient "Added to cart" confirmation — the app's stand-in for the web's toast. */
  const [toast, setToast] = useState<string | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [guestCount, setGuestCount] = useState(MIN_GUESTS);
  const [selectedAddOns, setSelectedAddOns] = useState<
    Record<string, { selected: boolean; qty: number }>
  >({});
  const [openFaqIds, setOpenFaqIds] = useState<Set<string>>(new Set());

  const product = useMemo(
    () => products.data?.find((p) => p.id === id),
    [products.data, id]
  );

  const slides = useMemo(() => {
    if (!product) return [];
    return [product.image_url, ...(product.designs ?? [])];
  }, [product]);

  // Mirrors ProductDetailClient.tsx: same-category products first, then everything else, capped at 4 (a 2×2 grid on phones).
  const related = useMemo(() => {
    if (!product || !products.data) return [];
    const sameCategory = products.data.filter(
      (p) => p.id !== product.id && p.category === product.category
    );
    const others = products.data.filter(
      (p) => p.id !== product.id && p.category !== product.category
    );
    return [...sameCategory, ...others].slice(0, 4);
  }, [products.data, product]);

  const tiers = useMemo(
    () => packagesQuery.data?.tiers ?? [],
    [packagesQuery.data]
  );

  // The lowest per-guest tier price — the "From TZS X per guest" anchor shown
  // on every "Similar designs" card, same anchor the catalog grid uses (see
  // useFromGuestPrice / getFromGuestPrice, which reads this same CMS row).
  const fromGuestPrice = useMemo(() => {
    const prices = tiers.map((t) => t.price_per_guest).filter((n) => n > 0);
    return prices.length > 0 ? Math.min(...prices) : 0;
  }, [tiers]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (selectedTierId || tiers.length === 0) return;
    const featured = tiers.find((t) => t.featured);
    setSelectedTierId((featured ?? tiers[0]).id);
  }, [tiers, selectedTierId]);

  const selectedTier = tiers.find((t) => t.id === selectedTierId) ?? null;

  // Mirrors the web configurator: switching tiers clears any add-on selection
  // that becomes free-included under the new tier, so it's never double-charged.
  useEffect(() => {
    if (!selectedTierId || !addonsFaqQuery.data) return;
    setSelectedAddOns((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const addon of addonsFaqQuery.data!.addons) {
        if (addon.includedInTierIds.includes(selectedTierId) && next[addon.id]?.selected) {
          next[addon.id] = { ...next[addon.id], selected: false };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [selectedTierId, addonsFaqQuery.data]);

  const toggleAddOn = (addon: AddOn) => {
    setSelectedAddOns((prev) => {
      const current = prev[addon.id];
      return {
        ...prev,
        [addon.id]: {
          selected: !current?.selected,
          qty: current?.qty ?? addon.defaultQty ?? addon.minQty ?? 1,
        },
      };
    });
  };

  const setAddOnQty = (addon: AddOn, qty: number) => {
    setSelectedAddOns((prev) => ({
      ...prev,
      [addon.id]: { selected: true, qty: Math.max(addon.minQty, qty) },
    }));
  };

  const callForQuote = () => {
    const phone = addonsFaqQuery.data?.quotePhoneNumber;
    if (phone) Linking.openURL(`tel:${phone.replace(/(?!^\+)[^\d]/g, '')}`);
  };

  const toggleFaqOpen = (faqId: string) => {
    setOpenFaqIds((prev) => {
      const next = new Set(prev);
      if (next.has(faqId)) next.delete(faqId);
      else next.add(faqId);
      return next;
    });
  };

  const digitalSubtotal = selectedTier ? selectedTier.price_per_guest * guestCount : 0;

  const addOnLines = useMemo(() => {
    if (!addonsFaqQuery.data || !selectedTierId) return [];
    return addonsFaqQuery.data.addons
      .filter(
        (addon) =>
          addon.pricingMode !== 'quote' &&
          !addon.includedInTierIds.includes(selectedTierId)
      )
      .map((addon) => {
        const sel = selectedAddOns[addon.id];
        if (!sel?.selected) return null;
        const amount =
          addon.pricingMode === 'flat' ? addon.flatFee : addon.unitPrice * sel.qty;
        // Same cart label the web builds, e.g. "120 paper prints".
        const cartLabel =
          addon.pricingMode === 'per_unit'
            ? `${sel.qty.toLocaleString('en-US')} ${addon.title.toLowerCase()}`
            : addon.title;
        return { addon, amount, cartLabel };
      })
      .filter(
        (line): line is { addon: AddOn; amount: number; cartLabel: string } =>
          line !== null
      );
  }, [addonsFaqQuery.data, selectedAddOns, selectedTierId]);

  const addOnsSubtotal = addOnLines.reduce((sum, line) => sum + line.amount, 0);
  const total = digitalSubtotal + addOnsSubtotal;

  // Mirrors buildCartItem() in ProductDetailClient.tsx — same fields, so a line
  // added here matches the one the web cart would have stored.
  const buildCartItem = (design: DigitalCardProduct): CartItem => {
    const cartAddOns = addOnLines.map((line) => line.cartLabel);
    return {
      id: design.id,
      name: design.name,
      designer: design.designer,
      image: design.image_url || design.designs?.[0],
      summary: buildItemSummary({
        tier: selectedTier?.name,
        guests: guestCount,
        addOns: cartAddOns,
      }),
      tier: selectedTier?.name,
      tierId: selectedTier?.id,
      guests: guestCount,
      pricePerGuest: selectedTier?.price_per_guest,
      extrasTotal: addOnsSubtotal,
      addOns: cartAddOns,
      total,
    };
  };

  const handleAddToCart = () => {
    if (!product) return;
    // One line per design: re-adding a design already in the cart updates that
    // line (new guest count / options) rather than stacking a duplicate, so the
    // confirmation says "Updated" — an unchanged cart badge would otherwise
    // look broken.
    const alreadyInCart = has(product.id);
    addItem(buildCartItem(product));
    setToast(alreadyInCart ? 'Updated in your cart' : 'Added to cart');
  };

  const handleBuyNow = () => {
    if (!product) return;
    addItem(buildCartItem(product));
    router.push('/cart');
  };

  if (products.isPending) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-ed-bg">
        <ActivityIndicator color={editorial.secondary} />
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView className="flex-1 bg-ed-bg" edges={['top']}>
        <View className="px-4 pt-2">
          <BackButton />
        </View>
        <View className="flex-1 items-center justify-center px-10">
          <Ionicons
            name="alert-circle-outline"
            size={32}
            color={editorial.onSurfaceVariant}
          />
          <Text className="mt-3 text-center font-inter text-body-sm text-ed-on-surface-variant">
            We couldn't find this design. It may no longer be available.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const badge = product.badge ? BADGE_INFO[product.badge] : null;
  const description = product.description ? stripHtml(product.description) : null;
  const liked = likedIds.has(product.id);

  return (
    <SafeAreaView className="flex-1 bg-ed-bg" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 pt-2">
        <BackButton />
        {/* One grouped pill rather than three separate circles — mirrors the
            action cluster in HomeHeader. */}
        <View className="flex-row items-center rounded-full bg-ed-surface-container px-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={liked ? 'Unlike design' : 'Like design'}
            onPress={() => toggleLike(product.id)}
            className="h-10 w-10 items-center justify-center"
          >
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={18}
              color={liked ? '#E0245E' : editorial.onSurface}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share design"
            onPress={() =>
              router.push({
                pathname: '/coming-soon',
                params: { title: 'Share design' },
              })
            }
            className="h-10 w-10 items-center justify-center"
          >
            <Ionicons name="share-outline" size={18} color={editorial.onSurface} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={cartCount > 0 ? `Cart, ${cartCount} designs` : 'Cart, empty'}
            onPress={() => router.push('/cart')}
            className="h-10 w-10 items-center justify-center"
          >
            <Ionicons name="cart-outline" size={18} color={editorial.onSurface} />
            {cartCount > 0 ? (
              <View
                className="absolute right-0 top-1 h-[17px] min-w-[17px] items-center justify-center rounded-full px-1"
                style={{ backgroundColor: ACCENT }}
              >
                <Text
                  className="font-inter-bold text-label"
                  style={{ color: ON_ACCENT }}
                >
                  {cartCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-12"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero carousel — 5:7, matching the app's canonical digital card aspect ratio */}
        <View className="mt-2">
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => {
              const next = Math.round(
                event.nativeEvent.contentOffset.x / windowWidth
              );
              setSlide(next);
            }}
          >
            {slides.map((uri, index) => (
              <View
                key={`${uri}-${index}`}
                style={{ width: windowWidth }}
                className="px-5"
              >
                <View
                  className="w-full overflow-hidden rounded-2xl bg-ed-surface-container-low"
                  style={{ aspectRatio: 5 / 7 }}
                >
                  <Image
                    source={{ uri }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                </View>
              </View>
            ))}
          </ScrollView>

          {badge ? (
            <View
              className="absolute left-8 top-3 flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
              style={{ backgroundColor: 'rgba(255,255,255,0.92)' }}
            >
              <Ionicons name={badge.icon} size={13} color="#B8860B" />
              <Text className="font-inter-semibold text-label text-ed-on-surface">
                {badge.label}
              </Text>
            </View>
          ) : null}

          {slides.length > 1 ? (
            <View className="mt-3 flex-row items-center justify-center gap-1.5">
              {slides.map((_, index) => (
                <View
                  key={index}
                  className="h-1.5 rounded-full"
                  style={{
                    width: index === slide ? 16 : 6,
                    backgroundColor:
                      index === slide
                        ? editorial.onSurface
                        : editorial.outlineVariant,
                  }}
                />
              ))}
            </View>
          ) : null}
        </View>

        <View className="px-5">
          {/* Category + title */}
          <Text
            className="mt-6 font-inter-bold text-label uppercase tracking-[2px]"
            style={{ color: editorial.onSurfaceVariant }}
          >
            {product.category}
          </Text>
          <Text className="mt-1.5 font-inter-bold text-screen-title text-ed-on-surface">
            {product.name}
          </Text>

          {/* Description */}
          <View className="mt-5 border-t border-ed-outline-variant pt-5">
            <Text className="mb-2 font-inter-medium text-body-sm text-ed-on-surface">
              {addonsFaqQuery.data?.descriptionLabel || 'Description'}
            </Text>
            {description ? (
              <>
                <Text
                  className="font-inter text-body-sm leading-6 text-ed-on-surface-variant"
                  numberOfLines={descriptionExpanded ? undefined : 4}
                >
                  {description}
                </Text>
                {description.length > 180 ? (
                  <Pressable
                    onPress={() => setDescriptionExpanded((v) => !v)}
                    className="mt-1.5"
                  >
                    <Text className="font-inter-semibold text-body-sm text-ed-on-surface">
                      {descriptionExpanded
                        ? addonsFaqQuery.data?.readLessLabel || 'Read less'
                        : addonsFaqQuery.data?.readMoreLabel || 'Read more'}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <Text className="font-inter text-body-sm leading-6 text-ed-on-surface-variant">
                {product.name} is a signature design, sent digitally to every guest by WhatsApp or SMS.
              </Text>
            )}
          </View>

          {/* Choose your package */}
          {packagesQuery.isPending ? (
            <View className="mt-8 items-center">
              <ActivityIndicator color={editorial.secondary} />
            </View>
          ) : tiers.length > 0 ? (
            <View className="mt-8">
              <SectionEyebrow>
                {packagesQuery.data?.heading || 'Choose your package'}
              </SectionEyebrow>
              {packagesQuery.data?.subheading ? (
                <Text
                  className="mt-1 font-inter text-caption"
                  style={{ color: editorial.onSurfaceVariant }}
                >
                  {packagesQuery.data.subheading}
                </Text>
              ) : null}

              <View className="mt-3 flex-row flex-wrap justify-between gap-y-4">
                {tiers.map((tier) => (
                  <TierCard
                    key={tier.id}
                    tier={tier}
                    active={tier.id === selectedTierId}
                    onPress={() => setSelectedTierId(tier.id)}
                    perGuestLabel={packagesQuery.data?.perGuestLabel || 'per guest'}
                  />
                ))}
              </View>

              {/* Guest count stepper */}
              <View className="mt-5 flex-row items-center justify-between gap-3">
                <View className="min-w-0 flex-1">
                  <Text className="font-inter-bold text-caption text-ed-on-surface">
                    {packagesQuery.data?.cardsCountLabel ||
                      'Number of digital cards & OpusPass tickets'}
                  </Text>
                  <Text
                    className="mt-0.5 font-inter text-label"
                    style={{ color: editorial.onSurfaceVariant }}
                  >
                    {(packagesQuery.data?.minGuestsTemplate || 'Minimum {count} guests').replace(
                      '{count}',
                      String(MIN_GUESTS)
                    )}
                  </Text>
                </View>
                <Stepper
                  value={guestCount}
                  min={MIN_GUESTS}
                  onDecrement={() =>
                    setGuestCount((n) => Math.max(MIN_GUESTS, n - GUEST_STEP))
                  }
                  onIncrement={() => setGuestCount((n) => n + GUEST_STEP)}
                />
              </View>

              {/* Package includes */}
              {selectedTier ? (
                <View className="mt-6">
                  <SectionEyebrow>
                    {selectedTier.name}{' '}
                    {packagesQuery.data?.includesSuffixLabel || 'package includes'}
                  </SectionEyebrow>
                  <View className="mt-2.5">
                    {selectedTier.includes.map((bullet) => (
                      <View
                        key={bullet.id}
                        className="mb-1.5 flex-row items-start gap-2"
                      >
                        <Ionicons
                          name="checkmark"
                          size={14}
                          color="#059669"
                          style={{ marginTop: 3 }}
                        />
                        <Text className="flex-1 font-inter text-caption leading-5 text-ed-on-surface">
                          {bullet.label}
                          {bullet.note ? (
                            <Text style={{ color: editorial.onSurfaceVariant }}>
                              {' '}
                              — {bullet.note}
                            </Text>
                          ) : null}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Add-ons */}
              {addonsFaqQuery.isPending ? (
                <View className="mt-8 items-center">
                  <ActivityIndicator color={editorial.secondary} />
                </View>
              ) : addonsFaqQuery.data && addonsFaqQuery.data.addons.length > 0 ? (
                <View className="mt-8 border-t border-ed-outline-variant pt-6">
                  <Text className="font-inter-bold text-caption text-ed-on-surface">
                    {addonsFaqQuery.data.addonsHeading || 'Available optional add-ons'}
                  </Text>
                  {addonsFaqQuery.data.addons.map((addon) => {
                    if (addon.includedInTierIds.includes(selectedTierId ?? '')) {
                      return (
                        <IncludedAddOnCard
                          key={addon.id}
                          addon={addon}
                          includedPillLabel={addonsFaqQuery.data!.includedPillLabel}
                        />
                      );
                    }
                    const selected = Boolean(selectedAddOns[addon.id]?.selected);
                    return (
                      <AddOnCard
                        key={addon.id}
                        addon={addon}
                        priceFromLabel={addonsFaqQuery.data!.priceFromLabel}
                        howManyLabel={addonsFaqQuery.data!.howManyLabel}
                        selected={selected}
                        qty={
                          selectedAddOns[addon.id]?.qty ??
                          addon.defaultQty ??
                          addon.minQty ??
                          1
                        }
                        onToggle={() => toggleAddOn(addon)}
                        onQtyChange={(qty) => setAddOnQty(addon, qty)}
                        onCallForQuote={callForQuote}
                      />
                    );
                  })}
                </View>
              ) : null}

              {/* Order summary */}
              <View className="mt-8 border-t border-ed-outline-variant pt-6">
                <Text className="font-inter-bold text-caption text-ed-on-surface">
                  Order summary
                </Text>
                <View className="mt-3 gap-2">
                  {selectedTier ? (
                    <View className="flex-row items-baseline justify-between gap-2">
                      <Text
                        className="flex-1 font-inter text-body-sm"
                        style={{ color: editorial.onSurfaceVariant }}
                      >
                        {selectedTier.name} ({guestCount} guests)
                      </Text>
                      <Text className="font-inter-medium text-body-sm text-ed-on-surface">
                        {formatTzs(digitalSubtotal)}
                      </Text>
                    </View>
                  ) : null}
                  {addOnLines.map(({ addon, amount }) => (
                    <View
                      key={addon.id}
                      className="flex-row items-baseline justify-between gap-2"
                    >
                      <Text
                        className="flex-1 font-inter text-body-sm"
                        style={{ color: editorial.onSurfaceVariant }}
                      >
                        {addon.title}
                      </Text>
                      <Text className="font-inter-medium text-body-sm text-ed-on-surface">
                        {formatTzs(amount)}
                      </Text>
                    </View>
                  ))}
                </View>
                <View className="mt-3 flex-row items-baseline justify-between border-t border-ed-outline-variant pt-3">
                  <Text className="font-inter-bold text-body text-ed-on-surface">
                    Total
                  </Text>
                  <Text className="font-inter-bold text-screen-title leading-none text-ed-on-surface">
                    {formatTzs(total)}
                  </Text>
                </View>
              </View>

              {/* Add to cart / Buy now */}
              <View className="mt-6 flex-row gap-3">
                <Pressable
                  accessibilityRole="button"
                  onPress={handleAddToCart}
                  className="flex-1 items-center rounded-full border py-3.5"
                  style={{ borderColor: editorial.onSurface }}
                >
                  <Text
                    className="font-inter-bold text-caption uppercase tracking-[1px]"
                    style={{ color: editorial.onSurface }}
                  >
                    Add to cart
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleBuyNow}
                  className="flex-1 items-center rounded-full py-3.5"
                  style={{ backgroundColor: ACCENT }}
                >
                  <Text
                    className="font-inter-bold text-caption uppercase tracking-[1px]"
                    style={{ color: ON_ACCENT }}
                  >
                    Buy now
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/coming-soon',
                  params: { title: 'Customize this design' },
                })
              }
              className="mt-6 items-center rounded-full py-4"
              style={{ backgroundColor: ACCENT }}
            >
              <Text
                className="font-inter-bold text-caption uppercase tracking-[1px]"
                style={{ color: ON_ACCENT }}
              >
                Continue with this design
              </Text>
            </Pressable>
          )}

          {/* Info accordion */}
          {addonsFaqQuery.data && addonsFaqQuery.data.faq.length > 0 ? (
            <View className="mt-8 border-t border-ed-outline-variant">
              {addonsFaqQuery.data.faq.map((faq) => (
                <InfoAccordionItem
                  key={faq.id}
                  faq={faq}
                  open={openFaqIds.has(faq.id)}
                  onToggle={() => toggleFaqOpen(faq.id)}
                  onLinkPress={() =>
                    faq.link_href
                      ? router.push(faq.link_href as Href)
                      : router.push({
                          pathname: '/coming-soon',
                          params: { title: faq.link_label || faq.title },
                        })
                  }
                />
              ))}
            </View>
          ) : null}
        </View>

        {/* Similar designs */}
        {related.length > 0 ? (
          <View className="mt-10 px-5">
            <Text className="font-inter-bold text-section-title text-ed-on-surface">
              {addonsFaqQuery.data?.similarDesignsHeading || 'Similar designs'}
            </Text>
            <View className="mt-6 flex-row flex-wrap justify-between gap-y-6">
              {related.map((item) => (
                <RelatedCard
                  key={item.id}
                  product={item}
                  fromGuestPrice={fromGuestPrice}
                  fromLabel={packagesQuery.data?.fromLabel || 'From'}
                  perGuestLabel={packagesQuery.data?.perGuestLabel || 'per guest'}
                  onPress={() => router.push(`/card/${item.id}`)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Add-to-cart confirmation — mirrors the web toast, with the same
          "one line per design" wording and a way straight to the cart. */}
      {toast ? (
        <View className="absolute inset-x-4 bottom-6">
          <View
            className="flex-row items-center justify-between gap-3 rounded-2xl px-4 py-3.5"
            style={{ backgroundColor: editorial.onSurface }}
          >
            <View className="min-w-0 flex-1">
              <Text
                className="font-inter-bold text-body-sm"
                style={{ color: editorial.bg }}
              >
                {toast}
              </Text>
              <Text
                className="mt-0.5 font-inter text-caption"
                style={{ color: editorial.bg, opacity: 0.75 }}
                numberOfLines={1}
              >
                {product.name} — {formatTzs(total)}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setToast(null);
                router.push('/cart');
              }}
              className="shrink-0 rounded-full px-3.5 py-2"
              style={{ backgroundColor: ACCENT }}
            >
              <Text
                className="font-inter-bold text-label uppercase tracking-wide"
                style={{ color: ON_ACCENT }}
              >
                View cart
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
