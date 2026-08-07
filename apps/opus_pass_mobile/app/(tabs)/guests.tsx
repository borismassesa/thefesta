import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EventsTab } from '@/components/guests/EventsTab';
import { GuestListTab } from '@/components/guests/GuestListTab';
import { MessagesTab } from '@/components/guests/MessagesTab';
import { RsvpsTab } from '@/components/guests/RsvpsTab';
import { useTheme } from '@/theme/useTheme';

const TABS = [
  { id: 'guest-list', label: 'Guest List' },
  { id: 'events', label: 'Events' },
  { id: 'rsvps', label: 'RSVPs' },
  { id: 'messages', label: 'Messages' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function GuestsScreen() {
  const { editorial } = useTheme();
  const [activeTab, setActiveTab] = useState<TabId>('guest-list');

  return (
    <SafeAreaView className="flex-1 bg-ed-bg" edges={['top']}>
      <View className="border-b border-ed-outline-variant bg-ed-bg px-5 pt-4">
        <Text className="font-inter-bold text-screen-title text-ed-on-surface">Guests &amp; RSVP</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="mt-4 gap-6 pr-5"
        >
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <Pressable
                key={tab.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setActiveTab(tab.id)}
                className="pb-2.5"
                style={{
                  borderBottomWidth: 2,
                  borderBottomColor: active ? editorial.onSurface : 'transparent',
                }}
              >
                <Text
                  className={`text-body-sm ${
                    active
                      ? 'font-inter-bold text-ed-on-surface'
                      : 'font-inter text-ed-on-surface-variant'
                  }`}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-32 pt-6"
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'guest-list' ? <GuestListTab /> : null}
        {activeTab === 'events' ? <EventsTab /> : null}
        {activeTab === 'rsvps' ? <RsvpsTab /> : null}
        {activeTab === 'messages' ? <MessagesTab /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
