import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BackButton } from '@/components/navigation/BackButton';
import { validateScannerSession } from '@/lib/api/checkin';
import { arrivedHeads, expectedHeads } from '@/lib/scannerRoster';
import { useScannerSession } from '@/hooks/useScannerSession';
import { useTheme } from '@/theme/useTheme';
import type { RosterEntry } from '@/types/checkin';

/** Brand green, matching the live/active pills used elsewhere in the product. */
const LIVE_GREEN = '#9FE870';

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const REPORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "As at 21:04, 18 Jul 2027" — a shared report needs to say when it was taken,
 *  since arrivals keep coming after it's sent. */
function reportStamp(d: Date): string {
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `As at ${time}, ${d.getDate()} ${REPORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * The attendant's audit label is built server-side as
 * "Asha (Main Gate) [pass_id] (manual: Phone battery dead)". Everything after
 * the name is shown separately or not at all, so strip both the parenthesised
 * parts and the bracketed identifier to leave just the name.
 */
function attendantOf(checkedInBy: string | null): string | null {
  if (!checkedInBy) return null;
  const name = checkedInBy
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .trim();
  return name || null;
}

/** True when the admission came from the manual fallback rather than a scan. */
function wasManual(checkedInBy: string | null): boolean {
  return /\(manual:/i.test(checkedInBy ?? '');
}

/**
 * How this guest was identified, in words rather than the server's token.
 *
 * The audit label carries "[roster_pick]", "[pass_id]" and friends — names
 * for the code that writes them, not for the person reading the arrivals log
 * at 11pm. The distinction is worth keeping, though: "found in the guest
 * list" and "read their Pass ID out" are different amounts of evidence that
 * the right person walked in, which is exactly what someone auditing a manual
 * admission is trying to weigh.
 */
function manualMethodOf(checkedInBy: string | null): string {
  const match = /\[([a-z_]+)\]/i.exec(checkedInBy ?? '');
  switch (match?.[1]) {
    case 'roster_pick':
      return 'Checked in from the guest list';
    case 'pass_id':
      return 'Checked in with a typed Pass ID';
    case 'legacy_entry_code':
      return 'Checked in with a typed ticket code';
    default:
      // Older admissions predate the identifier tag entirely.
      return 'Checked in manually';
  }
}

/** Group arrivals under a relative day heading so a long night stays readable. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
}

/**
 * Arrivals log: who has actually been scanned in, newest first.
 *
 * Distinct from the guest-list screen, which answers "is this person on the
 * list?" while standing in front of them. This answers "who has come in so
 * far?" — the question the couple and the OpusFesta team ask during the
 * event — so it is ordered by arrival time and carries the time, door and
 * attendant rather than search-and-admit controls.
 */
export default function ArrivalsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const { editorial } = useTheme();
  const { session, isLoading: sessionLoading } = useScannerSession();

  const [query, setQuery] = useState('');

  const rosterQuery = useQuery({
    queryKey: ['scanner', 'roster', eventId],
    enabled: Boolean(session && session.eventId === eventId),
    queryFn: async () => {
      const validated = await validateScannerSession(session!.eventId, session!.accessToken);
      if (!validated.ok) throw new Error(validated.error);
      return validated.roster;
    },
    // Arrivals land continuously while a door is open, and other attendants
    // scanning at other doors won't trigger a refetch here on their own.
    refetchInterval: 15000,
  });

  const arrived = useMemo(
    () =>
      (rosterQuery.data ?? [])
        .filter((g): g is RosterEntry & { checkedInAt: string } => Boolean(g.checkedInAt))
        .sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt)),
    [rosterQuery.data]
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return arrived;
    return arrived.filter((g) => g.fullName.toLowerCase().includes(needle));
  }, [arrived, query]);

  /** Newest-first arrivals grouped by day. */
  const sections = useMemo(() => {
    const groups: { title: string; data: (RosterEntry & { checkedInAt: string })[] }[] = [];
    for (const guest of visible) {
      const label = dayLabel(guest.checkedInAt);
      const last = groups[groups.length - 1];
      if (last && last.title === label) last.data.push(guest);
      else groups.push({ title: label, data: [guest] });
    }
    return groups;
  }, [visible]);

  const totalGuests = rosterQuery.data?.length ?? 0;
  // Headcount, not row count: a party of 3 arriving is 3 people through the
  // door. Shared with the other scanner screens — these are the numbers the
  // couple is catered and billed against, so they derive in exactly one place.
  const headsIn = arrivedHeads(arrived);

  /**
   * End-of-night summary, handed off through the native share sheet (WhatsApp,
   * email, notes). Plain text rather than a file: attendants send this to the
   * couple on WhatsApp, and there's no export/storage pipeline on mobile yet.
   */
  const shareReport = () => {
    const roster = rosterQuery.data ?? [];
    const notArrived = roster.filter((g) => !g.checkedInAt);
    const expected = expectedHeads(roster);

    const lines = [
      `${session?.eventName ?? 'Event'} — arrivals`,
      reportStamp(new Date()),
      '',
      `${headsIn} of ${expected} guests through the door`,
      `${arrived.length} of ${totalGuests} invitations scanned`,
      '',
      `ARRIVED (${arrived.length})`,
      ...(arrived.length > 0
        ? [...arrived]
            // Oldest first reads as the order people actually walked in.
            .sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt))
            .map((g) => {
              const heads = g.checkedInPartySize ?? g.partySize;
              const door = g.checkedInDoor ? ` · ${g.checkedInDoor}` : '';
              return `${timeOf(g.checkedInAt)}  ${g.fullName}${heads > 1 ? ` (${heads})` : ''}${door}`;
            })
        : ['None yet']),
      '',
      `NOT ARRIVED (${notArrived.length})`,
      ...(notArrived.length > 0
        ? notArrived.map((g) => `${g.fullName}${g.partySize > 1 ? ` (${g.partySize})` : ''}`)
        : ['Everyone is in']),
    ];

    Share.share({ message: lines.join('\n') }).catch(() => {
      // Share sheet dismissed — nothing to recover from.
    });
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
      {/* Back button on its own row, then a proper page heading — matches the
          checklist/policy screens rather than cramming everything beside the
          arrow. */}
      <View className="flex-row items-center justify-between px-4 pt-2">
        <BackButton />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share arrivals report"
          onPress={shareReport}
          disabled={rosterQuery.isPending}
          className="h-10 flex-row items-center gap-1.5 rounded-full bg-ed-surface-container px-4"
          style={{ opacity: rosterQuery.isPending ? 0.5 : 1 }}
        >
          <Ionicons name="share-outline" size={16} color={editorial.onSurface} />
          <Text className="font-work-sans-semibold text-[13px] text-ed-on-surface">Report</Text>
        </Pressable>
      </View>
      <View className="px-5 pt-3">
        <Text
          className="font-work-sans-semibold text-[11px] uppercase tracking-[0.18em] text-ed-on-surface-variant"
          numberOfLines={1}
        >
          {session.eventName ?? 'This event'}
        </Text>
        <Text className="mt-1 font-playfair-bold text-3xl text-ed-on-surface">Checked in</Text>
      </View>

      {/* Getting every guest in is the whole job, and it lands late in a long
          shift — worth marking rather than leaving as a progress bar that
          quietly reaches the end. */}
      {totalGuests > 0 && arrived.length === totalGuests ? (
        <View className="mx-5 mt-5 overflow-hidden rounded-3xl border border-ed-outline-variant bg-ed-surface">
          <View className="flex-row items-center gap-4 p-5">
            <View className="min-w-0 flex-1">
              <Text className="font-playfair-bold text-[26px] leading-8 text-ed-on-surface">
                Everyone is in
              </Text>
              <Text className="mt-1.5 font-work-sans text-sm text-ed-on-surface-variant">
                All {totalGuests} invitations scanned. {headsIn}{' '}
                {headsIn === 1 ? 'person' : 'people'} came through the door.
              </Text>
            </View>
            <View
              className="h-16 w-16 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: LIVE_GREEN }}
            >
              <Ionicons name="checkmark" size={32} color="#14532D" />
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={shareReport}
            className="flex-row items-center justify-center gap-2 border-t border-ed-outline-variant py-4"
          >
            <Ionicons name="share-outline" size={17} color={editorial.onSurface} />
            <Text className="font-work-sans-semibold text-sm text-ed-on-surface">
              Send the couple the final report
            </Text>
          </Pressable>
        </View>
      ) : (
      /* The two numbers a door attendant actually wants: how many people are
          in the room (the headline), and how far through the guest list they
          are (progress). Scanned-vs-total is a ratio, so it reads as a bar
          rather than a second competing figure in a cell. */
      <View className="mx-5 mt-5 rounded-3xl border border-ed-outline-variant bg-ed-surface p-5">
        <View className="flex-row items-baseline gap-2">
          <Text className="font-playfair-bold text-[40px] leading-[42px] text-ed-on-surface">
            {headsIn}
          </Text>
          <Text className="flex-1 font-work-sans text-[15px] text-ed-on-surface-variant">
            {headsIn === 1 ? 'guest through the door' : 'guests through the door'}
          </Text>
        </View>

        <View className="mt-5 border-t border-ed-outline-variant pt-4">
          <View className="flex-row items-baseline justify-between">
            <Text className="font-work-sans text-[13px] text-ed-on-surface-variant">
              Invitations scanned
            </Text>
            <Text className="font-work-sans-semibold text-[13px] text-ed-on-surface">
              {arrived.length} of {totalGuests}
            </Text>
          </View>
          <View
            className="mt-2 h-1.5 overflow-hidden rounded-full"
            style={{ backgroundColor: editorial.surfaceContainerHigh }}
          >
            <View
              className="h-full rounded-full"
              style={{
                // Guard the empty-roster case: 0/0 should read as no progress,
                // not NaN width.
                width: `${totalGuests > 0 ? Math.round((arrived.length / totalGuests) * 100) : 0}%`,
                backgroundColor: editorial.secondary,
              }}
            />
          </View>
        </View>
      </View>
      )}

      {arrived.length > 0 ? (
        <View className="px-5 pt-4">
          <View className="flex-row items-center rounded-full border border-ed-outline-variant bg-ed-surface px-4 py-2.5">
            <Ionicons name="search-outline" size={16} color={editorial.onSurfaceVariant} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search who's arrived"
              placeholderTextColor={editorial.onSurfaceVariant}
              autoCorrect={false}
              className="ml-2 flex-1 font-work-sans text-sm text-ed-on-surface"
            />
          </View>
        </View>
      ) : null}

      {rosterQuery.isPending ? (
        <View className="mt-16 items-center">
          <ActivityIndicator color={editorial.secondary} />
        </View>
      ) : rosterQuery.isError ? (
        <Text className="mt-16 px-10 text-center font-work-sans text-sm text-ed-error">
          Couldn&apos;t load arrivals. Pull down to retry.
        </Text>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(g) => g.invitationId}
          contentContainerClassName="px-5 pb-16 pt-4"
          keyboardShouldPersistTaps="handled"
          refreshing={rosterQuery.isFetching}
          onRefresh={() => rosterQuery.refetch()}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={
            <View className="mt-16 items-center px-10">
              <Ionicons
                name={query ? 'search-outline' : 'people-outline'}
                size={32}
                color={editorial.onSurfaceVariant}
              />
              <Text className="mt-3 text-center font-work-sans text-sm text-ed-on-surface-variant">
                {query
                  ? 'No arrivals match that name.'
                  : 'Nobody has been scanned in yet. Arrivals appear here as guests come through the door.'}
              </Text>
            </View>
          }
          renderSectionHeader={({ section }) =>
            sections.length > 1 || section.title !== 'Today' ? (
              <Text className="mb-2 mt-2 font-work-sans-bold text-[11px] uppercase tracking-[2px] text-ed-on-surface-variant">
                {section.title}
              </Text>
            ) : null
          }
          renderItem={({ item }) => {
            const admitted = item.checkedInPartySize ?? item.partySize;
            const attendant = attendantOf(item.checkedInBy);
            const manual = wasManual(item.checkedInBy);
            return (
              <View className="mb-3 flex-row items-start gap-3 rounded-2xl border border-ed-outline-variant bg-ed-surface p-4">
                <View
                  className="mt-0.5 h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${LIVE_GREEN}55` }}
                >
                  <Ionicons name="checkmark" size={18} color="#1B7F4C" />
                </View>

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

                  <Text className="mt-0.5 font-work-sans text-xs text-ed-on-surface-variant">
                    {admitted === item.partySize
                      ? admitted === 1
                        ? 'Came alone'
                        : `Party of ${admitted}`
                      : `${admitted} of ${item.partySize} arrived`}
                    {item.checkedInDoor ? ` · ${item.checkedInDoor}` : ''}
                    {attendant ? ` · ${attendant}` : ''}
                  </Text>

                  {manual ? (
                    <View className="mt-1.5 flex-row items-center gap-1">
                      <Ionicons
                        name="create-outline"
                        size={12}
                        color={editorial.onSurfaceVariant}
                      />
                      <Text className="font-work-sans text-[11px] text-ed-on-surface-variant">
                        {manualMethodOf(item.checkedInBy)}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <Text className="shrink-0 font-work-sans-medium text-xs text-ed-on-surface-variant">
                  {timeOf(item.checkedInAt)}
                </Text>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
