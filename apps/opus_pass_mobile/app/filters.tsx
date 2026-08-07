import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';

interface FilterOption {
  label: string;
  count: number;
  swatch?: string;
}

interface FilterSection {
  key: string;
  label: string;
  options: FilterOption[];
}

const FILTER_SECTIONS: FilterSection[] = [
  {
    key: 'style',
    label: 'Style',
    options: [
      { label: 'Art Deco', count: 1 },
      { label: 'Black & White', count: 8 },
      { label: 'Bold', count: 6 },
      { label: 'Botanical', count: 7 },
      { label: 'Bright', count: 5 },
      { label: 'Classic', count: 3 },
      { label: 'Country', count: 3 },
      { label: 'Dark', count: 1 },
      { label: 'Destination', count: 1 },
      { label: 'Effortless', count: 5 },
      { label: 'Elegant', count: 7 },
      { label: 'Floral', count: 9 },
      { label: 'Modern', count: 6 },
      { label: 'Rustic', count: 4 },
      { label: 'Vintage', count: 5 },
      { label: 'Whimsical', count: 3 },
    ],
  },
  {
    key: 'color',
    label: 'Color',
    options: [
      { label: 'Black', count: 4, swatch: '#1A1A1A' },
      { label: 'Blue', count: 6, swatch: '#3B5B92' },
      { label: 'Gold', count: 5, swatch: '#C9A227' },
      { label: 'Green', count: 7, swatch: '#4C6B4F' },
      { label: 'Pink', count: 8, swatch: '#E8A0BF' },
      { label: 'White', count: 3, swatch: '#FFFFFF' },
    ],
  },
  {
    key: 'price',
    label: 'Price',
    options: [
      { label: 'Under TZS 5,000', count: 6 },
      { label: 'TZS 5,000–10,000', count: 9 },
      { label: 'TZS 10,000+', count: 4 },
    ],
  },
  {
    key: 'photo',
    label: 'Photo',
    options: [
      { label: 'With Photo', count: 12 },
      { label: 'Without Photo', count: 18 },
    ],
  },
  {
    key: 'foil',
    label: 'Foil',
    options: [
      { label: 'Foil', count: 7 },
      { label: 'No Foil', count: 23 },
    ],
  },
  {
    key: 'orientation',
    label: 'Orientation',
    options: [
      { label: 'Portrait', count: 20 },
      { label: 'Landscape', count: 8 },
      { label: 'Square', count: 2 },
    ],
  },
  {
    key: 'paperDigital',
    label: 'Paper & Digital',
    options: [
      { label: 'Paper', count: 25 },
      { label: 'Digital', count: 25 },
    ],
  },
];

function Checkbox({ checked }: { checked: boolean }) {
  const { editorial } = useTheme();
  return (
    <View
      className={`h-5 w-5 items-center justify-center rounded-md border ${
        checked ? 'border-ed-on-surface bg-ed-on-surface' : 'border-ed-outline'
      }`}
    >
      {checked ? (
        <Ionicons name="checkmark" size={14} color={editorial.bg} />
      ) : null}
    </View>
  );
}

function parseInitialSelection(raw: string | undefined) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, values]) => [key, new Set(values)])
    );
  } catch {
    return {};
  }
}

export default function FiltersScreen() {
  const router = useRouter();
  const { editorial } = useTheme();
  const { selected: initialSelected } = useLocalSearchParams<{
    selected?: string;
  }>();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Record<string, Set<string>>>(() =>
    parseInitialSelection(initialSelected)
  );

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleOption = (sectionKey: string, option: string) => {
    setSelected((prev) => {
      const current = new Set(prev[sectionKey] ?? []);
      if (current.has(option)) current.delete(option);
      else current.add(option);
      return { ...prev, [sectionKey]: current };
    });
  };

  const totalSelected = useMemo(
    () => Object.values(selected).reduce((sum, set) => sum + set.size, 0),
    [selected]
  );

  const resetAll = () => setSelected({});

  return (
    <SafeAreaView className="flex-1 bg-ed-bg">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-2">
        <Text className="font-inter-bold text-screen-title text-ed-on-surface">
          Filters
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          hitSlop={8}
          className="h-9 w-9 items-center justify-center"
        >
          <Ionicons name="close" size={24} color={editorial.onSurface} />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-6 pt-4"
        showsVerticalScrollIndicator={false}
      >
        {FILTER_SECTIONS.map((section) => {
          const isOpen = expanded.has(section.key);
          const sectionSelected = selected[section.key] ?? new Set<string>();

          return (
            <View
              key={section.key}
              className="border-b border-ed-outline-variant px-5"
            >
              <Pressable
                onPress={() => toggleExpanded(section.key)}
                className="flex-row items-center justify-between py-4"
              >
                <View className="flex-row items-center gap-2">
                  <Text className="font-inter text-body text-ed-on-surface">
                    {section.label}
                  </Text>
                  {sectionSelected.size > 0 ? (
                    <View className="h-5 min-w-5 items-center justify-center rounded-full bg-ed-on-surface px-1.5">
                      <Text className="font-inter-semibold text-label text-ed-bg">
                        {sectionSelected.size}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Ionicons
                  name={isOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={editorial.onSurfaceVariant}
                />
              </Pressable>

              {isOpen ? (
                <View className="pb-2">
                  {section.options.map((option) => {
                    const active = sectionSelected.has(option.label);
                    return (
                      <Pressable
                        key={option.label}
                        onPress={() => toggleOption(section.key, option.label)}
                        style={({ pressed }) => [
                          {
                            backgroundColor: pressed
                              ? editorial.surfaceContainer
                              : 'transparent',
                          },
                        ]}
                        className="-mx-2 flex-row items-center gap-3 rounded-xl px-2 py-3"
                      >
                        <Checkbox checked={active} />
                        {option.swatch ? (
                          <View
                            className="h-4 w-4 rounded-full border border-ed-outline-variant"
                            style={{ backgroundColor: option.swatch }}
                          />
                        ) : null}
                        <Text className="font-inter text-body text-ed-on-surface">
                          {option.label}{' '}
                          <Text className="text-ed-on-surface-variant">
                            ({option.count})
                          </Text>
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      {/* Footer */}
      <View className="flex-row items-center justify-between border-t border-ed-outline-variant px-5 py-4">
        <Pressable onPress={resetAll} disabled={totalSelected === 0}>
          <Text
            className={`font-inter-semibold text-body-sm ${
              totalSelected === 0
                ? 'text-ed-on-surface-variant'
                : 'text-ed-on-surface'
            }`}
          >
            Reset All Filters
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            const serialized = Object.fromEntries(
              Object.entries(selected)
                .filter(([, values]) => values.size > 0)
                .map(([key, values]) => [key, [...values]])
            );
            router.navigate({
              pathname: '/(tabs)/cards',
              params: { filters: JSON.stringify(serialized) },
            });
          }}
          className="rounded-full bg-ed-primary-container px-6 py-3"
        >
          <Text className="font-inter-semibold text-body-sm text-ed-on-primary">
            Show Results{totalSelected > 0 ? ` (${totalSelected})` : ''}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
