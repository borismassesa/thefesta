import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BackButton } from '@/components/navigation/BackButton';
import { CountSegments, GroupChip } from '@/components/scanner/CountSegments';
import { GroupFilterSheet } from '@/components/scanner/GroupFilterSheet';
import { GuestAvatar } from '@/components/scanner/GuestAvatar';
import { GuestConfirmCard } from '@/components/scanner/GuestConfirmCard';
import { PartyBadge } from '@/components/scanner/PartyBadge';
import { submitScan, validateScannerSession } from '@/lib/api/checkin';
import { withGuestDetail } from '@/lib/api/guestDetail';
import { getErrorMessage } from '@/lib/errors';
import {
  arrivedHeads,
  clampArrived,
  countLabel,
  groupRoster,
  UNGROUPED_LABEL,
} from '@/lib/scannerRoster';
import { useScannerSession } from '@/hooks/useScannerSession';
import { useTheme } from '@/theme/useTheme';
import type { RosterEntry } from '@/types/checkin';

/** Brand green, matching the live/active pills used elsewhere in the product. */
const LIVE_GREEN = '#9FE870';

/** Used only when the server rejects an admission without saying why. */
const FALLBACK_ADMIT_ERROR: Record<'duplicate' | 'invalid' | 'error', string> = {
  duplicate: 'This guest is already checked in.',
  invalid: 'This guest can no longer be admitted to this event.',
  error: 'Check-in failed. Nothing was recorded — try again.',
};

type Filter = 'all' | 'pending' | 'arrived';

function isFilter(value: unknown): value is Filter {
  return value === 'all' || value === 'pending' || value === 'arrived';
}

/**
 * Manual check-in fallback: a guest whose phone is dead, whose pass never
 * arrived, or whose QR won't scan in bad light still has to get through the
 * door. Every admission from here is recorded with a reason so the couple's
 * audit trail distinguishes it from a real scan.
 *
 * Organised the way guests actually turn up — in groups, a family or a bus at
 * a time — so the attendant narrows to sixty names before searching rather
 * than scrolling four hundred.
 */
export default function ScannerGuestsScreen() {
  const { eventId, filter: filterParam } = useLocalSearchParams<{
    eventId: string;
    filter?: string;
  }>();
  const router = useRouter();
  const { editorial } = useTheme();
  const { session, isLoading: sessionLoading } = useScannerSession();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState('');
  // Seeded from the count the attendant tapped on the scan screen, so
  // "8 still to arrive" lands on exactly those eight.
  const [filter, setFilter] = useState<Filter>(isFilter(filterParam) ? filterParam : 'all');
  const [groupTag, setGroupTag] = useState<string | null>(null);
  const [groupSheetOpen, setGroupSheetOpen] = useState(false);
  const [confirming, setConfirming] = useState<RosterEntry | null>(null);
  const [phonePending, setPhonePending] = useState(false);
  /** Which guest-detail lookup is the current one, so a superseded reply
   *  cannot speak for the guest now on screen. */
  const detailRequest = useRef(0);
  const [admitting, setAdmitting] = useState(false);
  const [admitError, setAdmitError] = useState<string | null>(null);

  const rosterQuery = useQuery({
    queryKey: ['scanner', 'roster', eventId],
    enabled: Boolean(session && session.eventId === eventId),
    queryFn: async () => {
      const validated = await validateScannerSession(session!.eventId, session!.accessToken);
      if (!validated.ok) throw new Error(validated.error);
      return validated.roster;
    },
  });

  const roster = useMemo(() => rosterQuery.data ?? [], [rosterQuery.data]);
  const groups = useMemo(() => groupRoster(roster), [roster]);

  /** Counts describe the group in view, not the whole event — otherwise the
   *  segment bar contradicts the list under it. */
  const inGroup = useMemo(
    () =>
      groupTag === null
        ? roster
        : roster.filter((g) => (g.groupTag?.trim() || UNGROUPED_LABEL) === groupTag),
    [roster, groupTag]
  );
  const arrivedCount = inGroup.filter((g) => g.checkedInAt).length;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return inGroup
      .filter((g) => (needle ? g.fullName.toLowerCase().includes(needle) : true))
      .filter((g) =>
        filter === 'arrived' ? g.checkedInAt : filter === 'pending' ? !g.checkedInAt : true
      );
  }, [inGroup, query, filter]);

  /** Sections mirror the couple's own groups, biggest first, names A–Z inside. */
  const sections = useMemo(
    () =>
      groupRoster(visible).map((group) => ({
        title: group.tag,
        // Under the arrived filter the heads figure has to be who actually
        // walked in, not who was expected — otherwise a section of three
        // part-arrived parties reads "3 guests · 9 people" with 5 in the room.
        subtitle: countLabel(
          group.guests.length,
          filter === 'arrived' ? arrivedHeads(group.guests) : group.heads
        ),
        data: [...group.guests].sort((a, b) => a.fullName.localeCompare(b.fullName)),
      })),
    [visible, filter]
  );

  /**
   * Show the confirm card, then fill in the phone number.
   *
   * The card opens immediately on the roster row rather than waiting: the
   * attendant is identifying somebody standing in front of them, and holding
   * the whole card back for a contact detail would put a network round trip
   * in front of every admission. The number arrives a moment later, or not at
   * all, and neither blocks admitting.
   */
  const openConfirm = async (guest: RosterEntry) => {
    setConfirming(guest);
    if (!session) return;
    // Only the newest pick owns the card. Two taps in a row leave two lookups
    // in flight, and whichever returns first must not speak for the other:
    // without this, a fast lookup for the guest the attendant has already
    // moved off would clear the pending flag and make the guest now on screen
    // read "Not recorded" until their own slower lookup landed.
    const request = (detailRequest.current += 1);
    setPhonePending(true);
    try {
      const detailed = await withGuestDetail(
        { eventId: session.eventId, accessToken: session.accessToken },
        guest
      );
      if (detailRequest.current !== request) return;
      setConfirming((current) =>
        current?.invitationId === detailed.invitationId ? detailed : current
      );
    } finally {
      if (detailRequest.current === request) setPhonePending(false);
    }
  };

  const admit = async (guest: RosterEntry, arrived: number) => {
    if (!session || admitting) return;
    setAdmitting(true);
    setAdmitError(null);
    // Same 1..party_size range the server enforces. Left undefined when the
    // full party arrived so the server's authoritative party_size fills the
    // default — the roster copy here could be stale.
    const confirmed = clampArrived(arrived, guest.partySize);
    try {
      // submitScan resolves rather than throws for every domain outcome —
      // a rejected pass, an already-used one, a 429, an expired session. So
      // the status has to be read: closing the card on all of them is how a
      // guest walks in against a check-in that was never recorded.
      const result = await submitScan({
        eventId: session.eventId,
        accessToken: session.accessToken,
        invitationId: guest.invitationId,
        // Required by the API — this is what marks the admission as
        // scan-less in the audit trail.
        manualReason: 'No scannable pass',
        // Deliberate per-tap admission, so a new id every time. It gives this
        // admission its own row in the server-side scan audit trail.
        requestId: Crypto.randomUUID(),
        checkedInPartySize: confirmed === guest.partySize ? undefined : confirmed,
        doorLabel: session.doorLabel,
        attendantName: session.attendantName ?? undefined,
      });
      // The roster is refetched either way: on a duplicate it is the server
      // that knows this guest is already in, and the row should say so.
      await queryClient.invalidateQueries({ queryKey: ['scanner', 'roster', eventId] });
      if (result.status === 'success') {
        setConfirming(null);
        return;
      }
      setAdmitError(result.message ?? FALLBACK_ADMIT_ERROR[result.status]);
    } catch (err) {
      // Network failure or the 15s request timeout. postJson already names
      // the unreachable host, which is the detail worth surfacing.
      setAdmitError(getErrorMessage(err, FALLBACK_ADMIT_ERROR.error));
    } finally {
      setAdmitting(false);
    }
  };

  if (sessionLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-ed-bg">
        <ActivityIndicator color={editorial.secondary} />
      </SafeAreaView>
    );
  }

  if (!session || session.eventId !== eventId) {
    return (
      <SafeAreaView className="flex-1 bg-ed-bg" edges={['top']}>
        <View className="flex-1 items-center justify-center px-10">
          <Text className="text-center font-work-sans text-sm text-ed-on-surface-variant">
            This shift has ended. Enter your access code again to continue.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/scanner')}
            className="mt-5 rounded-full bg-ed-primary-container px-6 py-3"
          >
            <Text className="font-work-sans-bold text-xs uppercase tracking-[1px] text-ed-on-primary">
              Enter code
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-ed-bg" edges={['top']}>
      <View className="flex-row items-center gap-2 px-4 pt-2">
        <BackButton />
        <View className="min-w-0 flex-1">
          <Text className="font-work-sans-bold text-base text-ed-on-surface" numberOfLines={1}>
            Guest list
          </Text>
          <Text className="font-work-sans text-xs text-ed-on-surface-variant" numberOfLines={1}>
            {groupTag ?? session.eventName ?? 'This event'}
          </Text>
        </View>
      </View>

      <View className="px-5 pt-3">
        {/* Counts first, search second: the attendant usually arrives here by
            tapping a number and wants to see that number's list, not to type. */}
        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            <CountSegments
              activeKey={filter}
              onSelect={(key) => setFilter(key as Filter)}
              segments={[
                {
                  key: 'pending',
                  icon: 'time-outline',
                  label: 'Still to arrive',
                  caption: 'waiting',
                  count: inGroup.length - arrivedCount,
                },
                {
                  key: 'arrived',
                  icon: 'checkmark',
                  label: 'Checked in',
                  caption: 'in',
                  count: arrivedCount,
                },
                {
                  key: 'all',
                  icon: 'people-outline',
                  label: 'On the list',
                  caption: 'all',
                  count: inGroup.length,
                },
              ]}
            />
          </View>
          {groups.length > 1 ? (
            <GroupChip activeTag={groupTag} onPress={() => setGroupSheetOpen(true)} />
          ) : null}
        </View>

        <View className="mt-3 flex-row items-center rounded-full border border-ed-outline-variant bg-ed-surface px-4 py-2.5">
          <Ionicons name="search-outline" size={16} color={editorial.onSurfaceVariant} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name"
            placeholderTextColor={editorial.onSurfaceVariant}
            autoCorrect={false}
            className="ml-2 flex-1 font-work-sans text-sm text-ed-on-surface"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={17} color={editorial.onSurfaceVariant} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {rosterQuery.isPending ? (
        <View className="mt-16 items-center">
          <ActivityIndicator color={editorial.secondary} />
        </View>
      ) : rosterQuery.isError ? (
        <Text className="mt-16 px-10 text-center font-work-sans text-sm text-ed-error">
          Couldn&apos;t load the guest list. Pull down to retry.
        </Text>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(g) => g.invitationId}
          contentContainerClassName="px-5 pb-16 pt-4"
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          refreshing={rosterQuery.isFetching}
          onRefresh={() => rosterQuery.refetch()}
          ListEmptyComponent={
            <View className="mt-16 items-center px-10">
              <Ionicons
                name={query ? 'search-outline' : 'people-outline'}
                size={30}
                color={editorial.onSurfaceVariant}
              />
              <Text className="mt-3 text-center font-work-sans text-sm text-ed-on-surface-variant">
                {query
                  ? 'No guests match that search.'
                  : filter === 'pending'
                    ? 'Everyone here has arrived.'
                    : filter === 'arrived'
                      ? 'Nobody from this list has been checked in yet.'
                      : 'No guests on this list yet.'}
              </Text>
            </View>
          }
          renderSectionHeader={({ section }) => (
            <View className="mb-2 mt-3 flex-row items-baseline justify-between">
              <Text
                className="shrink font-work-sans-bold text-[15px] text-ed-on-surface"
                numberOfLines={1}
              >
                {section.title}
              </Text>
              <Text className="ml-3 shrink-0 font-work-sans text-xs text-ed-on-surface-variant">
                {section.subtitle}
              </Text>
            </View>
          )}
          renderItem={({ item }) => {
            const arrived = Boolean(item.checkedInAt);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.fullName}, ${arrived ? 'checked in' : 'not yet arrived'}`}
                onPress={() => {
                  setAdmitError(null);
                  void openConfirm(item);
                }}
                className="mb-3 flex-row items-center gap-3 rounded-2xl border border-ed-outline-variant bg-ed-surface p-4"
              >
                <GuestAvatar fullName={item.fullName} colorKey={item.groupTag} />

                <View className="min-w-0 flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text
                      className="shrink font-work-sans-bold text-sm text-ed-on-surface"
                      numberOfLines={1}
                    >
                      {item.fullName}
                    </Text>
                    {item.isVip ? (
                      <View
                        className="shrink-0 rounded-full px-2 py-0.5"
                        style={{ backgroundColor: LIVE_GREEN }}
                      >
                        <Text
                          className="font-work-sans-bold text-[9px] uppercase"
                          style={{ color: '#1A1A1A' }}
                        >
                          VIP
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {/* The badge names the ticket type, so the subtitle only
                      carries what the badge can't: arrival detail or the
                      printed code for the manual fallback. */}
                  {arrived || item.entryCode ? (
                    <Text className="mt-0.5 font-work-sans text-xs text-ed-on-surface-variant">
                      {arrived
                        ? `Arrived, ${item.checkedInPartySize ?? item.partySize} of ${item.partySize}`
                        : item.entryCode}
                    </Text>
                  ) : null}
                </View>

                {arrived ? (
                  <Ionicons name="checkmark-circle" size={24} color="#1B7F4C" />
                ) : (
                  <PartyBadge partySize={item.partySize} />
                )}
              </Pressable>
            );
          }}
        />
      )}

      <GroupFilterSheet
        visible={groupSheetOpen}
        onClose={() => setGroupSheetOpen(false)}
        roster={roster}
        groups={groups}
        activeTag={groupTag}
        onSelect={setGroupTag}
      />

      <GuestConfirmCard
        visible={Boolean(confirming)}
        guest={confirming}
        busy={admitting}
        error={admitError}
        phonePending={phonePending}
        onCancel={() => {
          setConfirming(null);
          setAdmitError(null);
        }}
        onConfirm={(guest, arrived) => void admit(guest, arrived)}
      />
    </SafeAreaView>
  );
}
