import { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BackButton } from '@/components/navigation/BackButton';
import { Stepper } from '@/components/digital-cards/Stepper';
import { useCart } from '@/hooks/useCart';
import { useFromGuestPrice } from '@/hooks/useFromGuestPrice';
import { useDigitalCardProducts } from '@/hooks/useDigitalCardProducts';
import { usePackagesContent } from '@/hooks/usePackagesContent';
import { formatTzs, GUEST_STEP, MIN_GUESTS } from '@/lib/cart';
import { ACCENT, ON_ACCENT, TIER_PILL, TIER_PILL_DEFAULT } from '@/theme/brand';
import { useTheme } from '@/theme/useTheme';
import type { CartItem } from '@/types/cart';
import type { DigitalCardProduct } from '@/types/digital-cards';

/** Max designs in the "You might also like" cross-sell grid (2×2 on phones). */
const EXPLORE_LIMIT = 4;

function CartLine({
  item,
  onOpen,
  onRemove,
  onGuestsChange,
}: {
  item: CartItem;
  onOpen: () => void;
  onRemove: () => void;
  onGuestsChange: (guests: number) => void;
}) {
  const { editorial } = useTheme();
  const pill = TIER_PILL[item.tierId ?? ''] ?? TIER_PILL_DEFAULT;

  const confirmRemove = () => {
    Alert.alert('Remove from cart?', `${item.name} will be removed from your cart.`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: onRemove },
    ]);
  };

  return (
    <View className="mt-3 rounded-xl border border-ed-outline-variant p-4">
      <View className="flex-row gap-4">
        <Pressable
          onPress={onOpen}
          className="overflow-hidden rounded-md bg-ed-surface-container-low"
          style={{ width: 72, aspectRatio: 5 / 7 }}
        >
          {item.image ? (
            <Image
              source={{ uri: item.image }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          ) : null}
        </Pressable>

        <View className="min-w-0 flex-1">
          <View className="flex-row items-start justify-between gap-2">
            <Pressable onPress={onOpen} className="min-w-0 flex-1">
              <Text
                className="font-work-sans-bold text-[15px] leading-snug text-ed-on-surface"
                numberOfLines={2}
              >
                {item.name}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.name} from cart`}
              onPress={confirmRemove}
              hitSlop={8}
              className="shrink-0"
            >
              <Ionicons name="trash-outline" size={18} color={editorial.onSurfaceVariant} />
            </Pressable>
          </View>

          {item.tier ? (
            <View
              className="mt-1.5 self-start rounded px-1.5 py-0.5"
              style={{ backgroundColor: pill.bg }}
            >
              <Text
                className="font-work-sans-bold text-[10px] uppercase tracking-wide"
                style={{ color: pill.text }}
              >
                {item.tier} package
              </Text>
            </View>
          ) : null}

          {item.addOns && item.addOns.length > 0 ? (
            <View className="mt-1.5 flex-row flex-wrap gap-1">
              {item.addOns.map((addOn) => (
                <View
                  key={addOn}
                  className="rounded-full border border-ed-outline-variant px-2 py-0.5"
                >
                  <Text
                    className="font-work-sans text-[10px]"
                    style={{ color: editorial.onSurfaceVariant }}
                  >
                    + {addOn}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <View className="mt-2 flex-row items-center gap-1.5">
            <Ionicons name="time-outline" size={13} color={editorial.onSurfaceVariant} />
            <Text
              className="font-work-sans text-xs"
              style={{ color: editorial.onSurfaceVariant }}
            >
              Delivered digitally after checkout
            </Text>
          </View>
        </View>
      </View>

      <View className="mt-4 flex-row items-center justify-between gap-3 border-t border-ed-outline-variant pt-3.5">
        {item.guests != null ? (
          <View>
            <Text
              className="mb-1 font-work-sans-bold text-[10px] uppercase tracking-wide"
              style={{ color: editorial.onSurfaceVariant }}
            >
              Guests
            </Text>
            <Stepper
              compact
              value={item.guests}
              min={MIN_GUESTS}
              onDecrement={() => onGuestsChange(item.guests! - GUEST_STEP)}
              onIncrement={() => onGuestsChange(item.guests! + GUEST_STEP)}
            />
          </View>
        ) : (
          <View />
        )}
        <Text className="font-work-sans-bold text-lg text-ed-on-surface">
          {formatTzs(item.total)}
        </Text>
      </View>
    </View>
  );
}

function RecommendCard({
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
        className="mt-2.5 font-work-sans-bold text-sm leading-snug text-ed-on-surface"
        numberOfLines={2}
      >
        {product.name}
      </Text>
      {fromGuestPrice > 0 ? (
        <Text className="mt-1 font-work-sans text-[13px] text-ed-on-surface-variant">
          {fromLabel} {formatTzs(fromGuestPrice)} {perGuestLabel}
        </Text>
      ) : null}
    </Pressable>
  );
}

export default function CartScreen() {
  const router = useRouter();
  const { editorial } = useTheme();
  const { items, count, subtotal, isPending, removeItem, setGuests } = useCart();
  const products = useDigitalCardProducts();
  const packagesQuery = usePackagesContent();
  const fromGuestPriceQuery = useFromGuestPrice();

  // Digital product — prices are final (VAT-inclusive) and delivery is free,
  // same as the web cart.
  const discount = 0;
  const total = subtotal - discount;

  // Leads with designs in the same categories as the cart, then pads with the rest.
  const recommended = useMemo(() => {
    if (!products.data) return [];
    const cartIds = new Set(items.map((item) => item.id));
    const cartCategories = new Set(
      products.data.filter((p) => cartIds.has(p.id)).map((p) => p.category)
    );
    const available = products.data.filter((p) => !cartIds.has(p.id));
    const related = available.filter((p) => cartCategories.has(p.category));
    const others = available.filter((p) => !cartCategories.has(p.category));
    return [...related, ...others].slice(0, EXPLORE_LIMIT);
  }, [products.data, items]);

  if (isPending) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-ed-bg">
        <ActivityIndicator color={editorial.secondary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-ed-bg" edges={['top']}>
      <View className="flex-row items-center justify-between px-5 pt-2">
        <BackButton />
        <Text
          className="font-work-sans text-sm"
          style={{ color: editorial.onSurfaceVariant }}
        >
          {count === 1 ? '1 design' : `${count} designs`}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-32"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-4">
          <Text className="font-playfair-bold text-2xl text-ed-on-surface">Your cart</Text>

          {items.length === 0 ? (
            <View className="mt-6 items-center rounded-2xl border border-ed-outline-variant py-12">
              <View className="h-12 w-12 items-center justify-center rounded-full bg-ed-surface-container">
                <Ionicons name="cart-outline" size={22} color={editorial.onSurfaceVariant} />
              </View>
              <Text className="mt-3 font-work-sans-bold text-sm text-ed-on-surface">
                Your cart is empty
              </Text>
              <Text
                className="mt-1 px-10 text-center font-work-sans text-xs leading-5"
                style={{ color: editorial.onSurfaceVariant }}
              >
                Browse the collection and add a design to start your order.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.navigate('/cards')}
                className="mt-5 rounded-full px-5 py-3"
                style={{ backgroundColor: editorial.onSurface }}
              >
                <Text
                  className="font-work-sans-bold text-xs uppercase tracking-[1px]"
                  style={{ color: editorial.bg }}
                >
                  Browse designs
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              {items.map((item) => (
                <CartLine
                  key={item.id}
                  item={item}
                  onOpen={() => router.push(`/card/${item.id}`)}
                  onRemove={() => removeItem(item.id)}
                  onGuestsChange={(guests) => setGuests(item.id, guests)}
                />
              ))}

              {/* Price details */}
              <View className="mt-8 border-t border-ed-outline-variant pt-6">
                <Text className="font-work-sans-bold text-[13px] text-ed-on-surface">
                  Price details
                </Text>
                <View className="mt-3 gap-2">
                  <View className="flex-row items-baseline justify-between">
                    <Text
                      className="font-work-sans text-sm"
                      style={{ color: editorial.onSurfaceVariant }}
                    >
                      Price ({count === 1 ? '1 design' : `${count} designs`})
                    </Text>
                    <Text className="font-work-sans-medium text-sm text-ed-on-surface">
                      {formatTzs(subtotal)}
                    </Text>
                  </View>
                  <View className="flex-row items-baseline justify-between">
                    <Text
                      className="font-work-sans text-sm"
                      style={{ color: editorial.onSurfaceVariant }}
                    >
                      Delivery
                    </Text>
                    <Text className="font-work-sans-medium text-sm text-ed-on-surface">
                      Free
                    </Text>
                  </View>
                </View>
                <View className="mt-3 flex-row items-baseline justify-between border-t border-ed-outline-variant pt-3">
                  <Text className="font-work-sans-bold text-base text-ed-on-surface">
                    Total
                  </Text>
                  <Text className="font-work-sans-bold text-[26px] leading-none text-ed-on-surface">
                    {formatTzs(total)}
                  </Text>
                </View>
              </View>

              <View className="mt-4 flex-row items-center justify-center gap-1.5">
                <Ionicons name="shield-checkmark-outline" size={13} color="#059669" />
                <Text
                  className="font-work-sans text-xs"
                  style={{ color: editorial.onSurfaceVariant }}
                >
                  Secure checkout. Pay by mobile money or card.
                </Text>
              </View>
            </>
          )}
        </View>

        {/* You might also like */}
        {recommended.length > 0 ? (
          <View className="mt-10 px-5">
            <Text className="font-playfair-bold text-xl text-ed-on-surface">
              You might also like
            </Text>
            <Text
              className="mt-1 font-work-sans text-sm"
              style={{ color: editorial.onSurfaceVariant }}
            >
              {items.length > 0
                ? 'Designs that pair well with what you picked.'
                : 'Start with one of our most-loved designs.'}
            </Text>
            <View className="mt-6 flex-row flex-wrap justify-between gap-y-6">
              {recommended.map((product) => (
                <RecommendCard
                  key={product.id}
                  product={product}
                  fromGuestPrice={fromGuestPriceQuery.data ?? 0}
                  fromLabel={packagesQuery.data?.fromLabel || 'From'}
                  perGuestLabel={packagesQuery.data?.perGuestLabel || 'per guest'}
                  onPress={() => router.push(`/card/${product.id}`)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky checkout bar — keeps the total and the action reachable without
          scrolling past every line. */}
      {items.length > 0 ? (
        <SafeAreaView edges={['bottom']} className="border-t border-ed-outline-variant bg-ed-surface">
          <View className="flex-row items-center justify-between gap-4 px-5 py-3">
            <View>
              <Text
                className="font-work-sans text-[11px]"
                style={{ color: editorial.onSurfaceVariant }}
              >
                {count === 1 ? '1 design' : `${count} designs`}
              </Text>
              <Text className="font-work-sans-bold text-lg text-ed-on-surface">
                {formatTzs(total)}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: '/coming-soon', params: { title: 'Checkout' } })
              }
              className="flex-1 items-center rounded-full py-3.5"
              style={{ backgroundColor: ACCENT, maxWidth: '58%' }}
            >
              <Text
                className="font-work-sans-bold text-xs uppercase tracking-[1px]"
                style={{ color: ON_ACCENT }}
              >
                Checkout
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      ) : null}
    </SafeAreaView>
  );
}
