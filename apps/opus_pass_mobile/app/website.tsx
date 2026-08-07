import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Modal,
  Pressable,
  Share,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { BackButton } from '@/components/navigation/BackButton';
import { useCoupleProfile, useEnablePublicSharing, useUpcomingEvents } from '@/hooks/useDashboard';
import { getErrorMessage } from '@/lib/errors';
import { publicInviteMessage, publicInviteUrl, formatLongDate } from '@/lib/share';
import { useTheme } from '@/theme/useTheme';
import { coupleFirstNames } from '@/types/dashboard';

export default function WebsiteShareScreen() {
  const { editorial } = useTheme();
  const profile = useCoupleProfile();
  const upcoming = useUpcomingEvents();
  const enableSharing = useEnablePublicSharing();
  const [qrVisible, setQrVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState<'qr' | 'link' | null>(null);

  const venue = useMemo(() => {
    const events = upcoming.data ?? [];
    const wedding = events.find((e) => e.event_type === 'wedding') ?? events[0];
    return wedding?.venue_name ?? null;
  }, [upcoming.data]);

  const isLoading = profile.isPending || upcoming.isPending;

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-ed-bg">
        <View className="px-4 pt-2">
          <BackButton />
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={editorial.secondary} />
        </View>
      </SafeAreaView>
    );
  }

  const coupleNames = coupleFirstNames(profile.data ?? null);

  /** Ensures a public_slug + public_sharing_enabled exist, reusing an
   *  already-reserved slug (e.g. set from the web dashboard) if there is one. */
  const resolveShareUrl = async (): Promise<string> => {
    const existingSlug = profile.data?.public_slug;
    if (existingSlug && profile.data?.public_sharing_enabled) {
      return publicInviteUrl(existingSlug);
    }
    const { slug } = await enableSharing.mutateAsync();
    return publicInviteUrl(slug);
  };

  const handleShareLink = async () => {
    setPendingAction('link');
    try {
      const url = await resolveShareUrl();
      await Share.share({ message: publicInviteMessage(coupleNames, url) });
    } catch (error) {
      Alert.alert(
        "Couldn't share your invite",
        getErrorMessage(error, 'Please try again shortly.'),
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handleShowQr = async () => {
    setPendingAction('qr');
    try {
      await resolveShareUrl();
      setQrVisible(true);
    } catch (error) {
      Alert.alert(
        "Couldn't generate your QR code",
        getErrorMessage(error, 'Please try again shortly.'),
      );
    } finally {
      setPendingAction(null);
    }
  };

  const shareUrl = profile.data?.public_slug ? publicInviteUrl(profile.data.public_slug) : null;

  return (
    <SafeAreaView className="flex-1 bg-ed-bg">
      <View className="px-4 pt-2">
        <BackButton />
      </View>

      <View className="flex-1 px-5 pt-2">
        <View className="flex-1 overflow-hidden rounded-3xl">
          {profile.data?.cover_image_url ? (
            <ImageBackground
              source={{ uri: profile.data.cover_image_url }}
              resizeMode="cover"
              className="flex-1 justify-end"
            >
              <HeroOverlay coupleNames={coupleNames} weddingDate={profile.data?.wedding_date} venue={venue} />
            </ImageBackground>
          ) : (
            <LinearGradient
              colors={[editorial.surfaceContainer, editorial.surfaceContainerHigh]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="flex-1 justify-end"
            >
              <HeroOverlay coupleNames={coupleNames} weddingDate={profile.data?.wedding_date} venue={venue} />
            </LinearGradient>
          )}
        </View>

        <View className="mt-4 flex-row overflow-hidden rounded-3xl border border-ed-outline-variant bg-ed-surface">
          <ShareAction
            icon="qr-code-outline"
            label="Share QR Code"
            loading={pendingAction === 'qr'}
            onPress={handleShowQr}
          />
          <View className="w-px bg-ed-outline-variant" />
          <ShareAction
            icon="share-outline"
            label="Share Link"
            loading={pendingAction === 'link'}
            onPress={handleShareLink}
          />
        </View>
      </View>

      <Modal visible={qrVisible} animationType="fade" transparent onRequestClose={() => setQrVisible(false)}>
        <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: 'rgba(20,16,24,0.72)' }}>
          <View className="w-full items-center rounded-3xl bg-ed-surface p-6">
            <Text className="font-inter-bold text-card-title text-ed-on-surface">{coupleNames}</Text>
            <View className="mt-5 rounded-2xl bg-white p-4">
              {shareUrl ? <QRCode value={shareUrl} size={200} /> : null}
            </View>
            <Text className="mt-5 text-center font-inter text-caption text-ed-on-surface-variant">
              Scan to view the invitation and RSVP
            </Text>
            <Pressable
              onPress={() => setQrVisible(false)}
              className="mt-5 w-full items-center rounded-2xl py-3.5"
              style={{ backgroundColor: editorial.secondary }}
            >
              <Text className="font-inter-bold text-body-sm text-white">Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function HeroOverlay({
  coupleNames,
  weddingDate,
  venue,
}: {
  coupleNames: string;
  weddingDate: string | null | undefined;
  venue: string | null;
}) {
  return (
    <LinearGradient
      colors={['transparent', 'rgba(0,0,0,0.65)']}
      start={{ x: 0, y: 0.3 }}
      end={{ x: 0, y: 1 }}
      className="px-6 pb-8 pt-16"
    >
      <Text className="text-center font-playfair-bold text-display text-white">{coupleNames}</Text>
      {weddingDate ? (
        <Text className="mt-3 text-center font-inter text-body text-white/90">
          {formatLongDate(weddingDate)}
        </Text>
      ) : null}
      {venue ? (
        <Text className="mt-1 text-center font-inter text-body text-white/90">{venue}</Text>
      ) : null}
    </LinearGradient>
  );
}

function ShareAction({
  icon,
  label,
  loading,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  loading: boolean;
  onPress: () => void;
}) {
  const { editorial } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      className="flex-1 items-center gap-2 py-5"
    >
      {loading ? (
        <ActivityIndicator color={editorial.onSurface} />
      ) : (
        <Ionicons name={icon} size={22} color={editorial.onSurface} />
      )}
      <Text className="font-inter-semibold text-body-sm text-ed-on-surface">{label}</Text>
    </Pressable>
  );
}
