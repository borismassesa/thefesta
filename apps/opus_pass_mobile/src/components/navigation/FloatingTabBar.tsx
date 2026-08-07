import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';
import { PlanningMenu } from './PlanningMenu';
import { SearchDiscoverGrid } from './SearchDiscoverGrid';
import { FontFamily } from '@/theme/tokens';

type IoniconName = keyof typeof Ionicons.glyphMap;

const TAB_CONFIG: Record<string, { label: string; icon: IoniconName }> = {
  index: { label: 'Home', icon: 'home' },
  cards: { label: 'Cards', icon: 'mail' },
  registry: { label: 'Registry', icon: 'cart' },
  vendors: { label: 'Vendors', icon: 'storefront' },
};

/** Rendered specially below — a raised button that opens the radial
 * PlanningMenu instead of navigating like the other tabs. */
const PLANNING_ROUTE_NAME = 'planning';

const BAR_HEIGHT = 52;

/** Add alpha to a #RRGGBB hex, yielding an rgba() string, so the frosted
 * floating pills stay tied to the palette instead of a hardcoded white. */
function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const FLOATING_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.1,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 6,
};

/**
 * Floating pill tab bar, replacing React Navigation's default edge-to-edge
 * bar (set via `tabBar` on <Tabs>). Tapping the circular search button
 * doesn't navigate — it expands in place into a search input, mirroring the
 * Home icon swapping in as the "close search" affordance (Zola-style).
 */
export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { editorial } = useTheme();
  // Frosted floating-pill surface. Derived from the palette so it flips with
  // dark mode — a hardcoded white bar left light icons/text unreadable in dark.
  const barSurface = withAlpha(editorial.surfaceContainerLow, 0.94);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [planningOpen, setPlanningOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const showEvent = Keyboard.addListener('keyboardWillShow', (e) => {
      setKeyboardOffset(e.endCoordinates.height);
    });
    const hideEvent = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboardOffset(0);
    });
    return () => {
      showEvent.remove();
      hideEvent.remove();
    };
  }, []);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  const dismissSearch = () => {
    setSearchOpen(false);
    setQuery('');
    Keyboard.dismiss();
  };

  const closeSearch = () => {
    dismissSearch();
    if (
      !state.routes[state.index] ||
      state.routes[state.index].name !== 'index'
    ) {
      navigation.navigate('index');
    }
  };

  return (
    <>
      {searchOpen ? <SearchDiscoverGrid onNavigate={dismissSearch} /> : null}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: (keyboardOffset > 0 ? keyboardOffset : insets.bottom) + 8,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          gap: 10,
        }}
      >
        {searchOpen ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close search"
              onPress={closeSearch}
              style={[
                {
                  width: BAR_HEIGHT,
                  height: BAR_HEIGHT,
                  borderRadius: BAR_HEIGHT / 2,
                  backgroundColor: barSurface,
                  borderWidth: 1,
                  borderColor: editorial.outlineVariant,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                FLOATING_SHADOW,
              ]}
            >
              <Ionicons name="home" size={20} color={editorial.onSurface} />
            </Pressable>

            <View
              style={[
                {
                  flex: 1,
                  height: BAR_HEIGHT,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: barSurface,
                  borderRadius: BAR_HEIGHT / 2,
                  borderWidth: 1,
                  borderColor: editorial.outlineVariant,
                  paddingHorizontal: 18,
                },
                FLOATING_SHADOW,
              ]}
            >
              <Ionicons
                name="search"
                size={18}
                color={editorial.onSurfaceVariant}
              />
              <TextInput
                ref={inputRef}
                value={query}
                onChangeText={setQuery}
                placeholder="Search OpusPass"
                placeholderTextColor={editorial.onSurfaceVariant}
                returnKeyType="search"
                style={{
                  flex: 1,
                  marginLeft: 10,
                  fontFamily: FontFamily.regular,
                  fontSize: 15,
                  color: editorial.onSurface,
                }}
              />
            </View>
          </>
        ) : (
          <>
            <View
              style={[
                {
                  flex: 1,
                  flexDirection: 'row',
                  backgroundColor: barSurface,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: editorial.outlineVariant,
                  paddingVertical: 6,
                  paddingHorizontal: 6,
                },
                FLOATING_SHADOW,
              ]}
            >
              {state.routes.map((route, index) => {
                if (route.name === PLANNING_ROUTE_NAME) {
                  const color = planningOpen
                    ? editorial.secondary
                    : editorial.onSurface;

                  return (
                    <Pressable
                      key={route.key}
                      accessibilityRole="button"
                      accessibilityLabel="Planning"
                      onPress={() => setPlanningOpen((prev) => !prev)}
                      style={{
                        flex: 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 8,
                        borderRadius: 999,
                        backgroundColor: planningOpen
                          ? editorial.surfaceContainer
                          : 'transparent',
                      }}
                    >
                      <Ionicons name="sparkles" size={22} color={color} />
                      <Text
                        numberOfLines={1}
                        style={{
                          marginTop: 4,
                          fontSize: 11,
                          fontFamily: FontFamily.semibold,
                          color,
                        }}
                      >
                        Planning
                      </Text>
                    </Pressable>
                  );
                }

                const config = TAB_CONFIG[route.name];
                if (!config) return null;
                const focused = state.index === index;
                const color = focused
                  ? editorial.secondary
                  : editorial.onSurface;

                return (
                  <Pressable
                    key={route.key}
                    accessibilityRole="button"
                    accessibilityLabel={config.label}
                    onPress={() => {
                      const event = navigation.emit({
                        type: 'tabPress',
                        target: route.key,
                        canPreventDefault: true,
                      });
                      if (!focused && !event.defaultPrevented) {
                        navigation.navigate(route.name);
                      }
                    }}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingVertical: 8,
                      borderRadius: 999,
                      backgroundColor: focused
                        ? editorial.surfaceContainer
                        : 'transparent',
                    }}
                  >
                    <Ionicons name={config.icon} size={22} color={color} />
                    <Text
                      numberOfLines={1}
                      style={{
                        marginTop: 4,
                        fontSize: 11,
                        fontFamily: FontFamily.semibold,
                        color,
                      }}
                    >
                      {config.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search"
              onPress={() => setSearchOpen(true)}
              style={[
                {
                  width: BAR_HEIGHT,
                  height: BAR_HEIGHT,
                  borderRadius: BAR_HEIGHT / 2,
                  backgroundColor: barSurface,
                  borderWidth: 1,
                  borderColor: editorial.outlineVariant,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                FLOATING_SHADOW,
              ]}
            >
              <Ionicons name="search" size={20} color={editorial.onSurface} />
            </Pressable>
          </>
        )}
      </View>
      <PlanningMenu
        visible={planningOpen}
        onClose={() => setPlanningOpen(false)}
      />
    </>
  );
}
