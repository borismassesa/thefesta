import { ImageBackground, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useTheme } from '@/theme/useTheme';

type IoniconName = keyof typeof Ionicons.glyphMap;

interface Tile {
  label: string;
  icon: IoniconName;
  route: Href;
  image: number;
}

const TILES: Tile[] = [
  {
    label: 'Add Gifts',
    icon: 'gift-outline',
    route: { pathname: '/coming-soon', params: { title: 'Add Gifts' } },
    image: require('../../../assets/images/dashboard/add-gifts.jpg'),
  },
  {
    label: 'Registry',
    icon: 'pricetags-outline',
    route: '/registry',
    image: require('../../../assets/images/dashboard/registry.jpg'),
  },
  {
    label: 'Track RSVPs',
    icon: 'checkmark-done-outline',
    route: '/guests',
    image: require('../../../assets/images/dashboard/track-rsvps.jpg'),
  },
  {
    label: 'Brands A-Z',
    icon: 'pricetag-outline',
    route: { pathname: '/coming-soon', params: { title: 'Brands A-Z' } },
    image: require('../../../assets/images/dashboard/brands-a-z.jpg'),
  },
  {
    label: 'Vendors',
    icon: 'storefront-outline',
    route: '/vendors',
    image: require('../../../assets/images/dashboard/vendors.jpg'),
  },
  {
    label: 'Website',
    icon: 'globe-outline',
    route: { pathname: '/coming-soon', params: { title: 'Wedding Website' } },
    image: require('../../../assets/images/dashboard/website.jpg'),
  },
  {
    label: 'Save the Dates',
    icon: 'calendar-outline',
    route: '/cards',
    image: require('../../../assets/images/dashboard/save-the-dates.jpg'),
  },
  {
    label: 'Digital Cards',
    icon: 'mail-outline',
    route: '/cards',
    image: require('../../../assets/images/dashboard/invitations.jpg'),
  },
  {
    label: 'Thank You Cards',
    icon: 'heart-outline',
    route: '/cards',
    image: require('../../../assets/images/dashboard/thank-you-cards.jpg'),
  },
];

interface SearchDiscoverGridProps {
  onNavigate: () => void;
}

export function SearchDiscoverGrid({ onNavigate }: SearchDiscoverGridProps) {
  const router = useRouter();
  const { editorial } = useTheme();

  const goTo = (route: Href) => {
    onNavigate();
    router.push(route);
  };

  return (
    <View
      pointerEvents="auto"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: editorial.bg,
      }}
    >
      <ScrollView
        contentContainerClassName="px-5 pb-40"
        showsVerticalScrollIndicator={false}
        style={{ paddingTop: 64 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cart"
          onPress={() =>
            goTo({ pathname: '/coming-soon', params: { title: 'Cart' } })
          }
          className="mb-4 h-11 w-11 items-center justify-center self-end rounded-full bg-ed-surface-container"
        >
          <Ionicons name="cart-outline" size={20} color={editorial.onSurface} />
        </Pressable>

        <View className="flex-row flex-wrap justify-between gap-y-4">
          {TILES.map((tile) => (
            <Pressable
              key={tile.label}
              onPress={() => goTo(tile.route)}
              className="aspect-square w-[48%] overflow-hidden rounded-2xl"
            >
              <ImageBackground
                source={tile.image}
                resizeMode="cover"
                className="flex-1 justify-between p-4"
              >
                <View
                  className="absolute inset-0"
                  style={{ backgroundColor: 'rgba(0,0,0,0.28)' }}
                />
                <Text
                  className="font-inter-semibold text-body text-white"
                  style={{
                    textShadowColor: 'rgba(0,0,0,0.4)',
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 3,
                  }}
                >
                  {tile.label}
                </Text>
                <View
                  className="h-11 w-11 items-center justify-center self-end rounded-xl"
                  style={{ backgroundColor: 'rgba(255,255,255,0.92)' }}
                >
                  <Ionicons
                    name={tile.icon}
                    size={20}
                    color={editorial.secondary}
                  />
                </View>
              </ImageBackground>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={() =>
            goTo({ pathname: '/coming-soon', params: { title: 'Help' } })
          }
          className="mt-6 flex-row items-center justify-between rounded-2xl bg-ed-surface-container-low p-5"
        >
          <View className="flex-1 pr-4">
            <Text className="font-inter-semibold text-body text-ed-on-surface">
              Have wedding planning questions?
            </Text>
            <Text className="mt-1 font-inter text-body-sm text-ed-on-surface-variant">
              Get help with your to-dos.
            </Text>
          </View>
          <View className="h-10 w-10 items-center justify-center rounded-full border border-ed-outline-variant">
            <Ionicons
              name="heart-outline"
              size={18}
              color={editorial.onSurface}
            />
          </View>
        </Pressable>
      </ScrollView>
    </View>
  );
}
