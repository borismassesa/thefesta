import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useDeleteGuest, useGuests } from '@/hooks/useGuests';
import { getErrorMessage } from '@/lib/errors';
import { useTheme } from '@/theme/useTheme';
import type { GuestWithInvitations, RsvpStatus } from '@/types/dashboard';

type IoniconName = keyof typeof Ionicons.glyphMap;

const STATUS_TONE: Record<RsvpStatus, { label: string; color: string }> = {
  attending: { label: 'Attending', color: '#2D8E5B' },
  maybe: { label: 'Maybe', color: '#C4920A' },
  declined: { label: 'Declined', color: '#D85A30' },
  pending: { label: 'Awaiting', color: '#9CA3AF' },
};

/** The strongest reply across a guest's per-event invitations — a guest who
 *  accepted any event reads as "Attending" rather than "Awaiting" just
 *  because a second event is still open. */
function summaryStatus(guest: GuestWithInvitations): RsvpStatus | null {
  if (guest.invitations.length === 0) return null;
  const order: RsvpStatus[] = ['attending', 'maybe', 'declined', 'pending'];
  return order.find((s) => guest.invitations.some((i) => i.rsvp_status === s)) ?? 'pending';
}

function AddMethodCard({
  icon,
  iconColor,
  title,
  subtitle,
  onPress,
}: {
  icon: IoniconName;
  iconColor: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const { editorial } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      className="mb-3 flex-row items-center rounded-2xl border border-ed-outline-variant bg-ed-surface p-4"
    >
      <Ionicons name={icon} size={24} color={iconColor} />
      <View className="ml-4 flex-1">
        <Text className="font-inter-bold text-body-sm text-ed-on-surface">{title}</Text>
        <Text className="mt-0.5 font-inter text-body-sm text-ed-on-surface-variant">{subtitle}</Text>
      </View>
      <Ionicons name="arrow-forward" size={20} color={editorial.onSurface} />
    </Pressable>
  );
}

function GuestRow({ guest, onEdit, onDelete }: { guest: GuestWithInvitations; onEdit: () => void; onDelete: () => void }) {
  const { editorial } = useTheme();
  const status = summaryStatus(guest);
  const tone = status ? STATUS_TONE[status] : null;
  const partyTotal = guest.invitations.reduce((sum, i) => sum + i.party_size, 0);

  return (
    <Pressable
      onPress={onEdit}
      onLongPress={onDelete}
      className="mb-2.5 flex-row items-center rounded-2xl border border-ed-outline-variant bg-ed-surface p-4"
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: editorial.secondaryContainer }}
      >
        <Text className="font-inter-bold text-body-sm text-ed-on-surface">
          {guest.full_name.trim().charAt(0).toUpperCase() || '?'}
        </Text>
      </View>

      <View className="ml-3.5 flex-1">
        <Text numberOfLines={1} className="font-inter-semibold text-body-sm text-ed-on-surface">
          {guest.full_name}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 font-inter text-caption text-ed-on-surface-variant">
          {[
            guest.group_tag,
            guest.phone ?? guest.whatsapp_phone ?? guest.email,
            guest.invitations.length > 0 ? `${partyTotal} seat${partyTotal === 1 ? '' : 's'}` : 'Not invited yet',
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>

      {tone ? (
        <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: `${tone.color}1F` }}>
          <Text className="font-inter-semibold text-label" style={{ color: tone.color }}>
            {tone.label}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function GuestListTab() {
  const router = useRouter();
  const { editorial } = useTheme();
  const guests = useGuests();
  const deleteGuest = useDeleteGuest();

  const goToGuestForm = (id?: string) =>
    router.push(id ? { pathname: '/guest/[id]', params: { id } } : '/guest/new');

  const confirmDelete = (guest: GuestWithInvitations) => {
    Alert.alert('Remove guest?', `${guest.full_name} will be removed from your guest list.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          deleteGuest.mutate(guest.id, {
            onError: (error) =>
              Alert.alert(
                "Couldn't remove guest",
                getErrorMessage(error, 'Please try again shortly.'),
              ),
          }),
      },
    ]);
  };

  if (guests.isPending) {
    return (
      <View className="items-center py-16">
        <ActivityIndicator color={editorial.secondary} />
      </View>
    );
  }

  if (guests.isError) {
    return (
      <Text className="py-16 text-center font-inter text-body-sm text-ed-error">
        Couldn&rsquo;t load your guest list. Pull to refresh, or try again shortly.
      </Text>
    );
  }

  if (guests.data.length === 0) {
    return (
      <View>
        <Text className="mb-5 font-inter-bold text-screen-title text-ed-on-surface">
          Let&rsquo;s add guests! Choose how:
        </Text>
        <AddMethodCard
          icon="people"
          iconColor="#E08A2E"
          title="Add from contacts"
          subtitle="Pick guests right from your phone."
          onPress={() => router.push({ pathname: '/coming-soon', params: { title: 'Add from contacts' } })}
        />
        <AddMethodCard
          icon="person"
          iconColor="#7FA9E0"
          title="Add one by one"
          subtitle="Type guests' names and contact info."
          onPress={() => goToGuestForm()}
        />
        <AddMethodCard
          icon="share-outline"
          iconColor="#E0C24E"
          title="Send guests a form"
          subtitle="Share your address collection form."
          onPress={() => router.push('/website')}
        />
      </View>
    );
  }

  return (
    <View>
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="font-inter-bold text-screen-title text-ed-on-surface">
          {guests.data.length} guest{guests.data.length === 1 ? '' : 's'}
        </Text>
        <Pressable
          onPress={() => goToGuestForm()}
          className="flex-row items-center gap-1.5 rounded-full px-3.5 py-2"
          style={{ backgroundColor: editorial.secondary }}
        >
          <Ionicons name="add" size={16} color="#FFFFFF" />
          <Text className="font-inter-semibold text-caption text-white">Add</Text>
        </Pressable>
      </View>

      {guests.data.map((guest) => (
        <GuestRow
          key={guest.id}
          guest={guest}
          onEdit={() => goToGuestForm(guest.id)}
          onDelete={() => confirmDelete(guest)}
        />
      ))}

      <Text className="mt-2 text-center font-inter text-caption text-ed-on-surface-variant">
        Tap a guest to edit. Press and hold to remove.
      </Text>
    </View>
  );
}
