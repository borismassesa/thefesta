import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Share, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCoupleProfile, useEnablePublicSharing } from '@/hooks/useDashboard';
import { useGuests } from '@/hooks/useGuests';
import {
  collectAddressesMessage,
  dayOfDetailsMessage,
  publicInviteMessage,
  publicInviteUrl,
  rsvpReminderMessage,
  updatesMessage,
  whatsappUrl,
} from '@/lib/share';
import { getErrorMessage } from '@/lib/errors';
import { useTheme } from '@/theme/useTheme';
import { coupleFirstNames, type GuestWithInvitations } from '@/types/dashboard';

interface MessageTemplate {
  id: string;
  label: string;
  build: (coupleNames: string, link: string) => string;
  /** Narrows the broadcast to the guests the template is actually about. */
  audience?: (guest: GuestWithInvitations) => boolean;
}

const TEMPLATES: MessageTemplate[] = [
  { id: 'share-website', label: 'Share your website', build: publicInviteMessage },
  { id: 'collect-addresses', label: 'Collect addresses', build: collectAddressesMessage },
  {
    id: 'remind-rsvp',
    label: 'Remind guests to RSVP',
    build: rsvpReminderMessage,
    audience: (guest) => guest.invitations.some((i) => i.rsvp_status === 'pending'),
  },
  {
    id: 'day-of',
    label: 'Send day-of details',
    build: dayOfDetailsMessage,
    audience: (guest) => guest.invitations.some((i) => i.rsvp_status === 'attending'),
  },
  { id: 'updates', label: 'Send updates', build: updatesMessage },
];

export function MessagesTab() {
  const { editorial } = useTheme();
  const profile = useCoupleProfile();
  const guests = useGuests();
  const enableSharing = useEnablePublicSharing();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const coupleNames = coupleFirstNames(profile.data ?? null);

  /** Ensures a public invite link exists before any template can reference it. */
  const resolveShareUrl = async (): Promise<string> => {
    const slug = profile.data?.public_slug;
    if (slug && profile.data?.public_sharing_enabled) return publicInviteUrl(slug);
    const created = await enableSharing.mutateAsync();
    return publicInviteUrl(created.slug);
  };

  const audienceFor = (template: MessageTemplate) => {
    const all = guests.data ?? [];
    return template.audience ? all.filter(template.audience) : all;
  };

  /** One tap sends to one guest via WhatsApp; for a broadcast we hand the
   *  composed text to the OS share sheet, since there's no bulk WhatsApp API. */
  const runTemplate = async (template: MessageTemplate) => {
    setPendingId(template.id);
    try {
      const url = await resolveShareUrl();
      const message = template.build(coupleNames, url);
      const audience = audienceFor(template);
      const single = audience.length === 1 ? audience[0] : null;
      const phone = single?.whatsapp_phone ?? single?.phone ?? null;

      if (phone) {
        await Linking.openURL(whatsappUrl(phone, message));
      } else {
        await Share.share({ message });
      }
    } catch (error) {
      Alert.alert(
        "Couldn't open that message",
        getErrorMessage(error, 'Please try again shortly.'),
      );
    } finally {
      setPendingId(null);
    }
  };

  if (profile.isPending || guests.isPending) {
    return (
      <View className="items-center py-16">
        <ActivityIndicator color={editorial.secondary} />
      </View>
    );
  }

  return (
    <View>
      <View className="mb-6 flex-row items-start gap-4 rounded-2xl bg-ed-surface-container p-4">
        <Ionicons name="chatbubbles" size={26} color={editorial.secondary} />
        <View className="flex-1">
          <Text className="font-inter-bold text-body-sm text-ed-on-surface">Reach out to guests</Text>
          <Text className="mt-1 font-inter text-body-sm leading-5 text-ed-on-surface-variant">
            Easily share details and send reminders to your guests.
          </Text>
        </View>
      </View>

      <Text className="mb-3 font-inter-bold text-body-sm text-ed-on-surface">Choose a template:</Text>

      {TEMPLATES.map((template) => {
        const audience = audienceFor(template);
        return (
          <Pressable
            key={template.id}
            onPress={() => runTemplate(template)}
            disabled={pendingId !== null}
            className="mb-3 flex-row items-center rounded-2xl border border-ed-outline-variant bg-ed-surface p-4"
          >
            <View className="flex-1">
              <Text className="font-inter-bold text-body-sm text-ed-on-surface">{template.label}</Text>
              <Text className="mt-0.5 font-inter text-caption text-ed-on-surface-variant">
                {audience.length} guest{audience.length === 1 ? '' : 's'}
              </Text>
            </View>
            {pendingId === template.id ? (
              <ActivityIndicator color={editorial.onSurfaceVariant} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={editorial.onSurfaceVariant} />
            )}
          </Pressable>
        );
      })}

      <Text className="mt-2 font-inter text-caption leading-5 text-ed-on-surface-variant">
        Messages open in WhatsApp when a template targets a single guest with a number on file.
        Otherwise the text is handed to your share sheet so you can pick where to send it.
      </Text>
    </View>
  );
}
