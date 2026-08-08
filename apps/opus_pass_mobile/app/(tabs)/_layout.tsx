import { Tabs } from 'expo-router';
import { AuthGate } from '@/components/auth/AuthGate';
import { FloatingTabBar } from '@/components/navigation/FloatingTabBar';

export default function TabsLayout() {
  return (
    <AuthGate>
      <Tabs
        initialRouteName="index"
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <FloatingTabBar {...props} />}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="cards" options={{ title: 'Cards' }} />
        <Tabs.Screen name="planning" options={{ title: 'Planning' }} />
        <Tabs.Screen name="registry" options={{ title: 'Registry' }} />
        <Tabs.Screen name="vendors" options={{ title: 'Vendors' }} />
        {/* Hidden from the tab bar (omitted from FloatingTabBar's TAB_CONFIG) —
            still reachable via Guest List in the Planning radial menu. */}
        <Tabs.Screen name="guests" options={{ title: 'Guests', href: null }} />
      </Tabs>
    </AuthGate>
  );
}
