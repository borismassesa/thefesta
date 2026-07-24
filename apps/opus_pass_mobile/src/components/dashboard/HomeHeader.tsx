import { Image, Pressable, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useCart } from '@/hooks/useCart';
import { ACCENT, ON_ACCENT } from '@/theme/brand';
import { useTheme } from '@/theme/useTheme';

const SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.08,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 4,
};

export function HomeHeader() {
  const { editorial } = useTheme();
  const { user } = useUser();
  const router = useRouter();
  const { count: cartCount } = useCart();

  const iconColor = editorial.onSurface;

  return (
    <View className="flex-row items-center justify-between">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Profile"
        onPress={() => router.push('/profile')}
        style={[
          {
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: editorial.surfaceContainerLowest,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          },
          SHADOW,
        ]}
      >
        {user?.imageUrl ? (
          <Image
            source={{ uri: user.imageUrl }}
            style={{ width: 52, height: 52 }}
          />
        ) : (
          <Ionicons name="person-circle-outline" size={30} color={iconColor} />
        )}
      </Pressable>

      <View
        style={[
          {
            flexDirection: 'row',
            backgroundColor: editorial.surfaceContainerLowest,
            borderRadius: 999,
            paddingHorizontal: 6,
          },
          SHADOW,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scan ticket"
          onPress={() => router.push('/scanner')}
          style={{
            width: 44,
            height: 52,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MaterialCommunityIcons
            name="barcode-scan"
            size={20}
            color={iconColor}
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
          style={{
            width: 44,
            height: 52,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="notifications-outline" size={20} color={iconColor} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="My requests"
          onPress={() => router.navigate('/inquiries')}
          style={{
            width: 44,
            height: 52,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="chatbubbles" size={20} color={iconColor} />
        </Pressable>
        {/* Registry has its own bottom-nav tab, so this slot goes to the cart —
            which is otherwise only reachable from the Cards screens. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cartCount > 0 ? `Cart, ${cartCount} designs` : 'Cart, empty'}
          onPress={() => router.push('/cart')}
          style={{
            width: 44,
            height: 52,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="cart-outline" size={20} color={iconColor} />
          {cartCount > 0 ? (
            <View
              className="absolute right-1.5 top-2 h-[17px] min-w-[17px] items-center justify-center rounded-full px-1"
              style={{ backgroundColor: ACCENT }}
            >
              <Text className="font-work-sans-bold text-[10px]" style={{ color: ON_ACCENT }}>
                {cartCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}
