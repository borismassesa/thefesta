import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';

// Ported from apps/of_mobile/src/components/layout/PlanningMenu.tsx — same
// arc-fan animation, adapted to OpusPass's routes and design tokens.

type IonIcon = keyof typeof Ionicons.glyphMap;

const MENU_ITEMS: { key: string; label: string; icon: IonIcon; route: Href }[] =
  [
    {
      key: 'budget',
      label: 'Budget Advisor',
      icon: 'logo-usd',
      route: { pathname: '/coming-soon', params: { title: 'Budget Advisor' } },
    },
    {
      key: 'checklist',
      label: 'Checklist',
      icon: 'list-outline',
      route: '/checklist',
    },
    {
      key: 'guests',
      label: 'Guest List',
      icon: 'people-outline',
      route: '/guests',
    },
    {
      key: 'inspiration',
      label: 'Inspiration',
      icon: 'images-outline',
      route: { pathname: '/coming-soon', params: { title: 'Inspiration' } },
    },
  ];

const RADIUS = 120;
const ITEM_COUNT = MENU_ITEMS.length;
const START_ANGLE = 160;
const END_ANGLE = 20;
const ANGLE_STEP = (START_ANGLE - END_ANGLE) / (ITEM_COUNT - 1);
const ARC_ANGLES = Array.from(
  { length: ITEM_COUNT },
  (_, i) => START_ANGLE - i * ANGLE_STEP
);

const POSITIONS = ARC_ANGLES.map((deg) => {
  const rad = (deg * Math.PI) / 180;
  return { x: Math.cos(rad) * RADIUS, y: -Math.sin(rad) * RADIUS };
});

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ITEM_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.15,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 5,
};

interface PlanningMenuProps {
  visible: boolean;
  onClose: () => void;
}

export function PlanningMenu({ visible, onClose }: PlanningMenuProps) {
  const router = useRouter();
  const animValue = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(animValue, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    } else {
      Animated.timing(animValue, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setMounted(false));
    }
  }, [visible, animValue]);

  if (!mounted) return null;

  const backdropOpacity = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable onPress={onClose} style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: 'rgba(20,16,24,0.55)',
              opacity: backdropOpacity,
            },
          ]}
        />
      </Pressable>

      {MENU_ITEMS.map((item, index) => {
        const pos = POSITIONS[index];

        const itemScale = animValue.interpolate({
          inputRange: [0, 1],
          outputRange: [0.2, 1],
        });
        const itemOpacity = animValue.interpolate({
          inputRange: [0, 0.4, 1],
          outputRange: [0, 0, 1],
        });
        const translateX = animValue.interpolate({
          inputRange: [0, 1],
          outputRange: [0, pos.x],
        });
        const translateY = animValue.interpolate({
          inputRange: [0, 1],
          outputRange: [40, pos.y],
        });

        return (
          <Animated.View
            key={item.key}
            style={{
              position: 'absolute',
              bottom: 56,
              left: SCREEN_WIDTH / 2 - 36,
              transform: [{ translateX }, { translateY }, { scale: itemScale }],
              opacity: itemOpacity,
              alignItems: 'center',
              width: 72,
            }}
            pointerEvents="auto"
          >
            <Pressable
              onPress={() => {
                onClose();
                router.push(item.route);
              }}
              className="items-center"
            >
              <View
                className="h-12 w-12 items-center justify-center rounded-full bg-ed-secondary"
                style={ITEM_SHADOW}
              >
                <Ionicons name={item.icon} size={20} color="#fff" />
              </View>
              <Text
                className="mt-2 text-center font-inter-bold text-label text-white"
                numberOfLines={2}
              >
                {item.label}
              </Text>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}
