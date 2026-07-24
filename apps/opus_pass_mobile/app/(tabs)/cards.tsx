import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInvitationProducts } from '@/hooks/useInvitationProducts';
import { useInvitationCategories } from '@/hooks/useInvitationCategories';
import { useFromGuestPrice } from '@/hooks/useFromGuestPrice';
import { useLikedDesigns } from '@/hooks/useLikedDesigns';
import { useCart } from '@/hooks/useCart';
import type { InvitationProduct } from '@/types/invitations';
import { matchesCategory } from '@/lib/api/invitation-categories';
import { ACCENT, ON_ACCENT } from '@/theme/brand';
import { useTheme } from '@/theme/useTheme';
import { EmptyState } from '@/components/ui/EmptyState';

type TopTab = 'designs' | 'favorites' | 'drafts' | 'orders';

const TOP_TABS: { key: TopTab; label: string }[] = [
  { key: 'designs', label: 'Designs' },
  { key: 'favorites', label: 'Favorites' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'orders', label: 'Orders' },
];

const PAGE_SIZE = 12;

// The Filters screen's "Price" options are the only facet backed by real
// product data (`price_now`) today — the rest (style, color, photo, foil,
// orientation, paper/digital) are placeholder options with no matching
// product field yet, so they round-trip through the Filters screen but
// don't narrow results here.
const PRICE_RANGES: Record<string, (price: number) => boolean> = {
  'Under TZS 5,000': (price) => price < 5000,
  'TZS 5,000–10,000': (price) => price >= 5000 && price <= 10000,
  'TZS 10,000+': (price) => price > 10000,
};

// Sized off screen width so this many swatches sit fully visible plus a
// partial peek of the next one, hinting there's more to scroll to.
const VISIBLE_CATEGORY_SWATCHES = 3;
const NEXT_CATEGORY_PEEK = 0.6;
const CATEGORY_SWATCH_GAP = 16; // matches gap-4
const CATEGORY_ROW_PADDING = 20; // matches px-5

function buildFaqs(label: string) {
  return [
    {
      question: `When should we send ${label} for our wedding?`,
      answer: `Aim to get ${label} in your guests' hands 6–8 months before the big day, earlier if you're planning a destination wedding or a holiday-weekend date so everyone has time to arrange travel.`,
    },
    {
      question: `Whose name goes first on ${label}?`,
      answer: `There's no strict rule anymore. Many couples list names alphabetically or in whichever order reads best; some still follow the bride-first tradition. Pick what feels right for you.`,
    },
    {
      question: `What information should we include on ${label}?`,
      answer: `Keep it simple: both your names, the wedding date, and the city or venue. Save the finer details, like the schedule and RSVP link, for the invitation or your wedding website.`,
    },
    {
      question: `Is it okay to send ${label} digitally only?`,
      answer: `Absolutely. A digital send reaches guests instantly and costs less, a great option if you're working with a tight timeline or budget.`,
    },
    {
      question: `Do ${label} need to match our invitation suite?`,
      answer: `It's a nice touch but not required. Many couples choose a simpler, more casual design here and save the fuller suite for formal invitations.`,
    },
    {
      question: 'Should we include our wedding website URL?',
      answer: `Yes, if it's ready. Adding your website gives guests a place to find travel, accommodation, and registry details as soon as they save the date.`,
    },
  ];
}

function formatTzs(amount: number) {
  return `TZS ${amount.toLocaleString('en-US')}`;
}

function DesignCard({
  product,
  fromGuestPrice,
  liked,
  onToggleLike,
}: {
  product: InvitationProduct;
  fromGuestPrice: number;
  liked: boolean;
  onToggleLike: () => void;
}) {
  // Mirrors apps/opus_pass/src/components/guests/productInfo.tsx: every card
  // shows the same package-tier "from" price, not its own digital_unit_price
  // (that field is only a presence fallback — its value is never shown once
  // fromGuestPrice is known).
  const displayPrice =
    fromGuestPrice > 0 ? fromGuestPrice : product.digital_unit_price;
  const priceLabel = fromGuestPrice > 0 ? 'per guest' : 'per design';

  return (
    <View className="w-full">
      <View className="relative">
        <Image
          source={{ uri: product.image_url }}
          className="aspect-[3/4] w-full rounded-xl bg-ed-surface-container-low"
          resizeMode="cover"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Unlike design' : 'Like design'}
          onPress={onToggleLike}
          hitSlop={8}
          className="absolute right-2 top-2 h-8 w-8 items-center justify-center rounded-full"
          style={{ backgroundColor: 'rgba(255,255,255,0.9)' }}
        >
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={16}
            color={liked ? '#E0245E' : '#1A1A1A'}
          />
        </Pressable>
        {product.badge === 'premium' ? (
          <View
            className="absolute bottom-2 right-2 h-6 w-6 items-center justify-center rounded-full"
            style={{ backgroundColor: 'rgba(255,255,255,0.9)' }}
          >
            <Ionicons name="diamond-outline" size={13} color="#B8860B" />
          </View>
        ) : null}
      </View>
      <Text
        className="mt-2 font-work-sans-semibold text-sm text-ed-on-surface"
        numberOfLines={1}
      >
        {product.name}
      </Text>
      {displayPrice && displayPrice > 0 ? (
        <View className="mt-0.5 flex-row flex-wrap items-baseline gap-x-1.5">
          <Text className="font-work-sans-semibold text-xs text-ed-on-surface">
            From {formatTzs(displayPrice)}
          </Text>
          <Text className="font-work-sans text-[11px] text-ed-on-surface-variant">
            {priceLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function FaqItem({
  question,
  answer,
  open,
  onToggle,
}: {
  question: string;
  answer: string;
  open: boolean;
  onToggle: () => void;
}) {
  const { editorial } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={onToggle}
      className="border-t border-ed-outline-variant py-4"
    >
      <View className="flex-row items-center">
        <Ionicons
          name={open ? 'remove-outline' : 'add-outline'}
          size={20}
          color={editorial.onSurface}
        />
        <Text className="ml-3 flex-1 font-work-sans-semibold text-[15px] text-ed-on-surface">
          {question}
        </Text>
      </View>
      {open ? (
        <Text className="ml-8 mt-2.5 font-work-sans text-sm leading-5 text-ed-on-surface-variant">
          {answer}
        </Text>
      ) : null}
    </Pressable>
  );
}

export default function CardsScreen() {
  const router = useRouter();
  const { filters: filtersParam, tab: initialTabParam } = useLocalSearchParams<{
    filters?: string;
    tab?: TopTab;
  }>();
  const { editorial } = useTheme();
  const products = useInvitationProducts();
  const categories = useInvitationCategories();
  const fromGuestPriceQuery = useFromGuestPrice();
  const fromGuestPrice = fromGuestPriceQuery.data ?? 0;
  const { width: windowWidth } = useWindowDimensions();
  const categorySwatchSize = Math.floor(
    (windowWidth -
      CATEGORY_ROW_PADDING * 2 -
      CATEGORY_SWATCH_GAP * VISIBLE_CATEGORY_SWATCHES) /
      (VISIBLE_CATEGORY_SWATCHES + NEXT_CATEGORY_PEEK)
  );
  const [activeTab, setActiveTab] = useState<TopTab>('designs');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const { liked, toggleLike } = useLikedDesigns();
  const { count: cartCount } = useCart();
  const [page, setPage] = useState(1);
  const [openFaqs, setOpenFaqs] = useState<Set<number>>(new Set());

  const toggleFaq = (index: number) => {
    setOpenFaqs((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  useEffect(() => {
    if (
      initialTabParam &&
      TOP_TABS.some((tab) => tab.key === initialTabParam)
    ) {
      setActiveTab(initialTabParam);
      // Consume the param so navigating here again with the same tab value
      // (e.g. tapping Favorites twice) still triggers this effect instead
      // of being ignored as an unchanged dependency.
      router.setParams({ tab: undefined });
    }
  }, [initialTabParam, router]);

  useEffect(() => {
    if (!activeCategory && categories.data && categories.data.length > 0) {
      setActiveCategory(categories.data[0].slug);
    }
  }, [categories.data, activeCategory]);

  const activeCategoryDef =
    categories.data?.find((c) => c.slug === activeCategory) ?? null;

  const activeFilters = useMemo<Record<string, string[]>>(() => {
    if (!filtersParam) return {};
    try {
      return JSON.parse(filtersParam) as Record<string, string[]>;
    } catch {
      return {};
    }
  }, [filtersParam]);

  const favoriteDesigns = useMemo(
    () => (products.data ?? []).filter((p) => liked.has(p.id)),
    [products.data, liked]
  );

  const categoryDesigns = useMemo(() => {
    if (!activeCategoryDef) return [];
    let matches = (products.data ?? []).filter((p) =>
      matchesCategory(p, activeCategoryDef)
    );

    const trimmedQuery = query.trim().toLowerCase();
    if (trimmedQuery) {
      matches = matches.filter((p) =>
        [p.name, p.designer]
          .filter((value): value is string => !!value)
          .some((value) => value.toLowerCase().includes(trimmedQuery))
      );
    }

    const priceLabels = activeFilters.price ?? [];
    if (priceLabels.length > 0) {
      const priceChecks = priceLabels
        .map((label) => PRICE_RANGES[label])
        .filter((check): check is (price: number) => boolean => !!check);
      if (priceChecks.length > 0) {
        matches = matches.filter((p) =>
          priceChecks.some((check) => check(p.price_now))
        );
      }
    }

    return matches;
  }, [products.data, activeCategoryDef, query, activeFilters]);

  const totalPages = Math.max(1, Math.ceil(categoryDesigns.length / PAGE_SIZE));
  const pagedDesigns = useMemo(
    () => categoryDesigns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [categoryDesigns, page]
  );

  useEffect(() => {
    setPage(1);
    setOpenFaqs(new Set());
  }, [activeCategory, query, activeFilters]);

  const faqs = useMemo(
    () =>
      activeCategoryDef ? buildFaqs(activeCategoryDef.label.toLowerCase()) : [],
    [activeCategoryDef]
  );

  return (
    <SafeAreaView className="flex-1 bg-ed-bg" edges={['top']}>
      {/* Title row */}
      <View className="flex-row items-center justify-between px-5 pt-2">
        <Text className="font-playfair-bold text-2xl text-ed-on-surface">
          Cards
        </Text>
        <View className="flex-row items-center rounded-full bg-ed-surface-container px-1.5">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan ticket"
            onPress={() => router.push('/scanner')}
            className="h-10 w-9 items-center justify-center"
          >
            <MaterialCommunityIcons
              name="barcode-scan"
              size={18}
              color={editorial.onSurface}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            onPress={() =>
              router.push({
                pathname: '/coming-soon',
                params: { title: 'Notifications' },
              })
            }
            className="h-10 w-9 items-center justify-center"
          >
            <Ionicons
              name="notifications-outline"
              size={18}
              color={editorial.onSurface}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="My requests"
            onPress={() => router.navigate('/inquiries')}
            className="h-10 w-9 items-center justify-center"
          >
            <Ionicons
              name="chatbubbles"
              size={18}
              color={editorial.onSurface}
            />
          </Pressable>
          {/* Registry lives in the bottom nav — this slot is the cart only. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={cartCount > 0 ? `Cart, ${cartCount} designs` : 'Cart, empty'}
            onPress={() => router.push('/cart')}
            className="h-10 w-9 items-center justify-center"
          >
            <Ionicons name="cart-outline" size={18} color={editorial.onSurface} />
            {cartCount > 0 ? (
              <View
                className="absolute right-0 top-1 h-[17px] min-w-[17px] items-center justify-center rounded-full px-1"
                style={{ backgroundColor: ACCENT }}
              >
                <Text
                  className="font-work-sans-bold text-[10px]"
                  style={{ color: ON_ACCENT }}
                >
                  {cartCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      {/* Top tabs */}
      <View className="mt-4 flex-row border-b border-ed-outline-variant px-5">
        {TOP_TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              className="mr-6 pb-2.5"
            >
              <Text
                className={`font-work-sans-semibold text-[15px] ${
                  active ? 'text-ed-on-surface' : 'text-ed-on-surface-variant'
                }`}
              >
                {tab.label}
              </Text>
              {active ? (
                <View className="mt-2.5 h-0.5 w-full bg-ed-on-surface" />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {activeTab === 'designs' ? (
        <>
          <ScrollView
            className="flex-1"
            contentContainerClassName="px-5 pb-32 pt-4"
            showsVerticalScrollIndicator={false}
          >
            {/* Card category picker */}
            {categories.isPending ? (
              <View className="items-center py-6">
                <ActivityIndicator color={editorial.secondary} />
              </View>
            ) : categories.isError || !activeCategoryDef ? (
              <Text className="text-center font-work-sans text-sm text-ed-error">
                Couldn't load categories. Pull to refresh, or try again shortly.
              </Text>
            ) : (
              <>
                <Text className="text-center font-work-sans-semibold text-xl text-ed-on-surface">
                  {activeCategoryDef.label} Cards
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="mt-3 -mx-5 px-5"
                >
                  <View className="flex-row gap-4">
                    {categories.data.map((category) => {
                      const active = activeCategory === category.slug;
                      return (
                        <Pressable
                          key={category.slug}
                          onPress={() => setActiveCategory(category.slug)}
                          className="items-center"
                        >
                          <View
                            className="overflow-hidden rounded-full"
                            style={{
                              width: categorySwatchSize,
                              height: categorySwatchSize,
                            }}
                          >
                            <Image
                              source={category.image}
                              className="h-full w-full"
                              resizeMode="cover"
                            />
                          </View>
                          <Text
                            className={`mt-1.5 text-center font-work-sans text-xs ${
                              active
                                ? 'text-ed-on-surface'
                                : 'text-ed-on-surface-variant'
                            }`}
                            style={{ maxWidth: categorySwatchSize + 16 }}
                            numberOfLines={1}
                          >
                            {category.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </>
            )}

            {/* Search + filters */}
            <View className="mt-5 flex-row items-center gap-2">
              <View className="flex-1 flex-row items-center rounded-full border border-ed-outline-variant bg-ed-surface px-4 py-2.5">
                <Ionicons name="search-outline" size={16} color="#6B7280" />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search for designs"
                  placeholderTextColor="#9CA3AF"
                  className="ml-2 flex-1 font-work-sans text-sm text-ed-on-surface"
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Filters"
                onPress={() =>
                  router.push({
                    pathname: '/filters',
                    params: { selected: JSON.stringify(activeFilters) },
                  })
                }
                className="flex-row items-center gap-1.5 rounded-full border border-ed-outline-variant bg-ed-surface px-3.5 py-2.5"
              >
                <Ionicons name="options-outline" size={16} color="#1A1A1A" />
                <Text className="font-work-sans-medium text-sm text-ed-on-surface">
                  Filters
                </Text>
              </Pressable>
            </View>

            {/* Design grid */}
            {products.isPending || !activeCategoryDef ? (
              <View className="mt-16 items-center">
                <ActivityIndicator color={editorial.secondary} />
              </View>
            ) : products.isError ? (
              <Text className="mt-16 text-center font-work-sans text-sm text-ed-error">
                Couldn't load designs. Pull to refresh, or try again shortly.
              </Text>
            ) : categoryDesigns.length === 0 ? (
              <Text className="mt-16 text-center font-work-sans text-sm text-ed-on-surface-variant">
                No {activeCategoryDef.label.toLowerCase()} designs available
                yet.
              </Text>
            ) : (
              <>
                <View className="mt-5 flex-row flex-wrap justify-between gap-y-5">
                  {pagedDesigns.map((product) => (
                    <Pressable
                      key={product.id}
                      onPress={() => router.push(`/card/${product.id}`)}
                      className="w-[48%]"
                    >
                      <DesignCard
                        product={product}
                        fromGuestPrice={fromGuestPrice}
                        liked={liked.has(product.id)}
                        onToggleLike={() => toggleLike(product.id)}
                      />
                    </Pressable>
                  ))}
                </View>

                {totalPages > 1 ? (
                  <View className="mt-6 flex-row items-center justify-between">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Previous page"
                      disabled={page <= 1}
                      onPress={() => setPage((p) => Math.max(1, p - 1))}
                      className="flex-row items-center gap-1.5"
                    >
                      <Ionicons
                        name="arrow-back-outline"
                        size={15}
                        color={page <= 1 ? '#C4C4C4' : '#1A1A1A'}
                      />
                      <Text
                        className={`font-work-sans-medium text-sm ${
                          page <= 1
                            ? 'text-ed-on-surface-variant'
                            : 'text-ed-on-surface'
                        }`}
                      >
                        Previous
                      </Text>
                    </Pressable>

                    <View className="rounded-lg border border-ed-outline-variant px-4 py-2">
                      <Text className="font-work-sans-medium text-sm text-ed-on-surface">
                        Page {page} / {totalPages}
                      </Text>
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Next page"
                      disabled={page >= totalPages}
                      onPress={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      className="flex-row items-center gap-1.5"
                    >
                      <Text
                        className={`font-work-sans-medium text-sm ${
                          page >= totalPages
                            ? 'text-ed-on-surface-variant'
                            : 'text-ed-on-surface'
                        }`}
                      >
                        Next
                      </Text>
                      <Ionicons
                        name="arrow-forward-outline"
                        size={15}
                        color={page >= totalPages ? '#C4C4C4' : '#1A1A1A'}
                      />
                    </Pressable>
                  </View>
                ) : null}

                <View className="mb-10 mt-10">
                  <Text className="text-center font-playfair-bold text-2xl text-ed-on-surface">
                    {activeCategoryDef.label} Cards
                    {'\n'}Frequently Asked Questions
                  </Text>
                  <Text className="mt-3 text-center font-work-sans text-sm text-ed-on-surface-variant">
                    Take a look at our most commonly asked questions and
                    answers.
                  </Text>
                  <View className="mt-6 border-b border-ed-outline-variant">
                    {faqs.map((faq, index) => (
                      <FaqItem
                        key={faq.question}
                        question={faq.question}
                        answer={faq.answer}
                        open={openFaqs.has(index)}
                        onToggle={() => toggleFaq(index)}
                      />
                    ))}
                  </View>
                </View>
              </>
            )}
          </ScrollView>
        </>
      ) : activeTab === 'favorites' ? (
        favoriteDesigns.length === 0 ? (
          <EmptyState
            icon="heart-outline"
            label="No favorites yet — tap the heart on a design to save it."
          />
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerClassName="px-5 pb-32 pt-4"
            showsVerticalScrollIndicator={false}
          >
            <View className="flex-row flex-wrap justify-between gap-y-5">
              {favoriteDesigns.map((product) => (
                <Pressable
                  key={product.id}
                  onPress={() => router.push(`/card/${product.id}`)}
                  className="w-[48%]"
                >
                  <DesignCard
                    product={product}
                    fromGuestPrice={fromGuestPrice}
                    liked
                    onToggleLike={() => toggleLike(product.id)}
                  />
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )
      ) : activeTab === 'drafts' ? (
        <EmptyState icon="document-outline" label="No drafts yet." />
      ) : (
        <EmptyState icon="receipt-outline" label="No orders yet." />
      )}
    </SafeAreaView>
  );
}
