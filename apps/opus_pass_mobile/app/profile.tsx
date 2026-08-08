import { useState } from 'react';
import { withAuthGate } from '@/components/auth/withAuthGate';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/navigation/BackButton';
import { useCoupleProfile } from '@/hooks/useDashboard';
import { formatShortDate } from '@/lib/format-date';
import { queryClient } from '@/lib/query-client';
import { useTheme } from '@/theme/useTheme';
import { coupleFirstNames } from '@/types/dashboard';
import type { ThemePreference } from '@/theme/ColorSchemeProvider';

type IoniconName = keyof typeof Ionicons.glyphMap;

const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

const THEME_CYCLE: ThemePreference[] = ['system', 'light', 'dark'];

function ProfileSection({ children }: { children: React.ReactNode }) {
  return (
    <View className="mt-5 overflow-hidden rounded-2xl border border-ed-outline-variant bg-ed-surface">
      {children}
    </View>
  );
}

function ProfileRow({
  icon,
  label,
  value,
  onPress,
  last,
  destructive,
}: {
  icon: IoniconName;
  label: string;
  value?: string;
  onPress: () => void;
  last?: boolean;
  destructive?: boolean;
}) {
  const { editorial } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center px-4 py-3.5 ${last ? '' : 'border-b border-ed-outline-variant'}`}
    >
      <Ionicons name={icon} size={20} color={destructive ? editorial.error : editorial.onSurface} />
      <Text
        className={`ml-3 flex-1 font-inter text-body-sm ${
          destructive ? 'text-ed-error' : 'text-ed-on-surface'
        }`}
      >
        {label}
      </Text>
      {value ? (
        <Text className="mr-1 font-inter text-body-sm text-ed-on-surface-variant">{value}</Text>
      ) : null}
      {!destructive ? (
        <Ionicons name="chevron-forward" size={18} color={editorial.onSurfaceVariant} />
      ) : null}
    </Pressable>
  );
}

function ProfileScreen() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();
  const profile = useCoupleProfile();
  const { preference, setPreference } = useTheme();
  const [signingOut, setSigningOut] = useState(false);

  const goToComingSoon = (title: string) => router.push({ pathname: '/coming-soon', params: { title } });

  const coupleName = profile.data ? coupleFirstNames(profile.data) : (user?.fullName ?? 'Your account');
  const weddingDate = profile.data?.wedding_date ? formatShortDate(profile.data.wedding_date) : null;

  const cycleTheme = () => {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(preference) + 1) % THEME_CYCLE.length];
    setPreference(next);
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      // Drop every cached query with the session. `internal-user-id` is
      // staleTime: Infinity, so without this a second sign-in in the same app
      // run would keep the previous user's id and key their writes to it.
      queryClient.clear();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-ed-bg">
      <View className="flex-row items-center justify-between px-4 pt-2">
        <BackButton />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
          onPress={() => goToComingSoon('Edit profile')}
          className="h-10 w-10 items-center justify-center rounded-full bg-ed-surface-container"
        >
          <Ionicons name="pencil" size={18} color="#1A1A1A" />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-16 pt-2"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="mt-2 items-center">
          <View className="h-24 w-24 overflow-hidden rounded-full border border-ed-outline-variant bg-ed-surface">
            {user?.imageUrl ? (
              <Image source={{ uri: user.imageUrl }} style={{ width: 96, height: 96 }} />
            ) : (
              <View className="h-24 w-24 items-center justify-center">
                <Ionicons name="person-circle-outline" size={60} color="#9CA3AF" />
              </View>
            )}
          </View>
          <Text className="mt-3 font-inter-bold text-section-title text-ed-on-surface">{coupleName}</Text>
          {weddingDate ? (
            <Text className="mt-0.5 font-inter text-body-sm text-ed-on-surface-variant">{weddingDate}</Text>
          ) : null}
        </View>

        {/* Your Wedding */}
        <ProfileSection>
          <ProfileRow icon="heart-outline" label="Wedding Details" onPress={() => goToComingSoon('Wedding Details')} />
          <ProfileRow icon="people-outline" label="Guests" onPress={() => router.navigate('/guests')} />
          <ProfileRow icon="mail-outline" label="Cards" onPress={() => router.navigate('/cards')} />
          <ProfileRow
            icon="globe-outline"
            label="Wedding Website"
            onPress={() => router.push('/website')}
            last
          />
        </ProfileSection>

        {/* Account */}
        <ProfileSection>
          <ProfileRow icon="person-circle-outline" label="Account" onPress={() => goToComingSoon('Account')} />
          <ProfileRow icon="card-outline" label="Payments & Billing" onPress={() => goToComingSoon('Payments & Billing')} />
          <ProfileRow icon="lock-closed-outline" label="Privacy" onPress={() => goToComingSoon('Privacy')} />
          <ProfileRow
            icon="notifications-outline"
            label="Notifications"
            onPress={() => goToComingSoon('Notifications')}
          />
          <ProfileRow
            icon="color-palette-outline"
            label="Appearance"
            value={THEME_LABELS[preference]}
            onPress={cycleTheme}
            last
          />
        </ProfileSection>

        {/* Support */}
        <ProfileSection>
          <ProfileRow icon="help-circle-outline" label="Help & Support" onPress={() => goToComingSoon('Help & Support')} />
          <ProfileRow
            icon="share-social-outline"
            label="Invite a co-planner"
            onPress={() => goToComingSoon('Invite a co-planner')}
          />
          <ProfileRow
            icon="receipt-outline"
            label="Cancellation & Refund Policy"
            onPress={() => router.push('/cancellation')}
            last
          />
        </ProfileSection>

        {/* Sign out */}
        <ProfileSection>
          <ProfileRow
            icon="log-out-outline"
            label={signingOut ? 'Signing out…' : 'Sign Out'}
            onPress={handleSignOut}
            destructive
            last
          />
        </ProfileSection>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Signed-in only. Wrapper, not a route group — see withAuthGate. */
export default withAuthGate(ProfileScreen);
