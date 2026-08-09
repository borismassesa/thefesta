import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BackButton } from '@/components/navigation/BackButton';
import { PartyBadge } from '@/components/scanner/PartyBadge';
import { reportLink, validateScannerSession } from '@/lib/api/checkin';
import { getErrorMessage } from '@/lib/errors';
import { eventDayLabel, formatEventTime } from '@/lib/eventTime';
import { arrivedHeads } from '@/lib/scannerRoster';
import { useScannerSession } from '@/hooks/useScannerSession';
import { useTheme } from '@/theme/useTheme';
import type { RosterEntry } from '@/types/checkin';

/** Brand green, matching the live/active pills used elsewhere in the product. */
const LIVE_GREEN = '#9FE870';

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

  /** One fact, led by the icon that says what kind of fact it is. */
  const MetaItem = ({
    icon,
    label,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
  }) => (
    <View className="flex-row items-center gap-1.5">
      <Ionicons name={icon} size={13} color={editorial.onSurfaceVariant} />
      <Text className="font-inter text-caption text-ed-on-surface-variant">{label}</Text>
    </View>
  );
  const { session, isLoading: sessionLoading } = useScannerSession();

  const [query, setQuery] = useState('');
  const [reportOpening, setReportOpening] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const rosterQuery = useQuery({
    queryKey: ['scanner', 'roster', eventId],
    enabled: Boolean(session && session.eventId === eventId),
    queryFn: async () => {
      const validated = await validateScannerSession(session!.eventId, session!.accessToken);
      if (!validated.ok) throw new Error(validated.error);
      return validated.roster;
    },
    // No polling: a background refetch every 15s shared this query with the
    // pull-to-refresh indicator, so the list flashed every few seconds all
    // night, and a screen that redraws while you are reading it is its own
    // problem.
    //
    // Be clear about the cost, because it is not just flicker. This screen
    // refreshes on mount, when a check-in made on THIS device invalidates the
    // roster, and on pull. Nothing refreshes it when another door admits
    // somebody, so an arrival scanned at a second gate is invisible here
    // until an attendant pulls down — not for fifteen seconds, but for as
    // long as nobody thinks to. If watching every gate live turns out to
    // matter, the fix is to poll only while this screen is focused and bind
    // the indicator to user-initiated refetches alone, not to restore this.
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
      const label = eventDayLabel(guest.checkedInAt);
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
   * Open the check-in report as a PDF.
   *
   * The same document, from the same renderer, that the couple downloads from
   * their dashboard. This screen used to build its own plain-text summary and
   * push it through the share sheet, which meant the report an attendant
   * handed over at the end of the night and the one the couple downloaded were
   * two different documents describing the same event.
   *
   * Opened in a browser rather than written to a file: it keeps the scanner
   * free of native file and sharing modules, so this works on the dev client
   * already installed, and the phone's own PDF viewer already offers save,
   * print and share better than a bespoke screen would.
   */
  const openReport = async () => {
    if (!session || reportOpening) return;
    setReportOpening(true);
    setReportError(null);
    try {
      const url = await reportLink(session.eventId, session.accessToken);
      await WebBrowser.openBrowserAsync(url);
    } catch (err) {
      // Named inline rather than thrown away: this is the end of a shift and
      // the attendant needs to know whether to try again or go and tell
      // somebody the report never came.
      setReportError(getErrorMessage(err, "Couldn't open the report."));
    } finally {
      setReportOpening(false);
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
          <Text className="text-center font-inter text-body-sm text-ed-on-surface-variant">
            This shift has ended. Enter your access code again to continue.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/scanner')}
            className="mt-5 rounded-full bg-ed-primary-container px-6 py-3"
          >
            <Text className="font-inter-bold text-caption uppercase tracking-[1px] text-ed-on-primary">
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
          accessibilityLabel="Download arrivals report"
          onPress={() => void openReport()}
          disabled={rosterQuery.isPending}
          className="h-10 flex-row items-center gap-1.5 rounded-full bg-ed-surface-container px-4"
          style={{ opacity: rosterQuery.isPending ? 0.5 : 1 }}
        >
          {reportOpening ? (
            <ActivityIndicator size="small" color={editorial.onSurface} />
          ) : (
            <Ionicons name="download-outline" size={16} color={editorial.onSurface} />
          )}
          <Text className="font-inter-semibold text-caption text-ed-on-surface">Report</Text>
        </Pressable>
      </View>
      <View className="px-5 pt-3">
        <Text
          className="font-inter-semibold text-label uppercase tracking-[0.18em] text-ed-on-surface-variant"
          numberOfLines={1}
        >
          {session.eventName ?? 'This event'}
        </Text>
        <Text className="mt-1 font-inter-bold text-screen-title text-ed-on-surface">Checked in</Text>
      </View>

      {/* Getting every guest in is the whole job, and it lands late in a long
          shift — worth marking rather than leaving as a progress bar that
          quietly reaches the end. */}
      {totalGuests > 0 && arrived.length === totalGuests ? (
        <View className="mx-5 mt-5 overflow-hidden rounded-3xl border border-ed-outline-variant bg-ed-surface">
          <View className="flex-row items-center gap-4 p-5">
            <View className="min-w-0 flex-1">
              <Text className="font-inter-bold text-screen-title leading-8 text-ed-on-surface">
                Everyone is in
              </Text>
              <Text className="mt-1.5 font-inter text-body-sm text-ed-on-surface-variant">
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
            onPress={() => void openReport()}
            className="flex-row items-center justify-center gap-2 border-t border-ed-outline-variant py-4"
          >
            <Ionicons name="download-outline" size={17} color={editorial.onSurface} />
            <Text className="font-inter-semibold text-body-sm text-ed-on-surface">
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
          <Text className="font-inter-bold text-display leading-[42px] text-ed-on-surface">
            {headsIn}
          </Text>
          <Text className="flex-1 font-inter text-body-sm text-ed-on-surface-variant">
            {headsIn === 1 ? 'guest through the door' : 'guests through the door'}
          </Text>
        </View>

        <View className="mt-5 border-t border-ed-outline-variant pt-4">
          <View className="flex-row items-baseline justify-between">
            <Text className="font-inter text-caption text-ed-on-surface-variant">
              Invitations scanned
            </Text>
            <Text className="font-inter-semibold text-caption text-ed-on-surface">
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
              className="ml-2 flex-1 font-inter text-body-sm text-ed-on-surface"
            />
          </View>
        </View>
      ) : null}

      {/* Sits under the header, next to the button that failed. A report that
          silently does not arrive is the kind of thing nobody notices until
          the couple asks for it a week later. */}
      {reportError ? (
        <View
          accessibilityRole="alert"
          className="mx-5 mb-2 flex-row items-start gap-2 rounded-token-md px-3 py-2"
          style={{ backgroundColor: `${editorial.error}1A` }}
        >
          <Ionicons name="alert-circle" size={16} color={editorial.error} style={{ marginTop: 1 }} />
          <Text
            className="min-w-0 flex-1 font-inter text-caption"
            style={{ color: editorial.error }}
          >
            {reportError}
          </Text>
        </View>
      ) : null}

      {rosterQuery.isPending ? (
        <View className="mt-16 items-center">
          <ActivityIndicator color={editorial.secondary} />
        </View>
      ) : rosterQuery.isError ? (
        <Text className="mt-16 px-10 text-center font-inter text-body-sm text-ed-error">
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
              <Text className="mt-3 text-center font-inter text-body-sm text-ed-on-surface-variant">
                {query
                  ? 'No arrivals match that name.'
                  : 'Nobody has been scanned in yet. Arrivals appear here as guests come through the door.'}
              </Text>
            </View>
          }
          renderSectionHeader={({ section }) =>
            sections.length > 1 || section.title !== 'Today' ? (
              <Text className="mb-2 mt-2 font-inter-bold text-label uppercase tracking-[2px] text-ed-on-surface-variant">
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
                      className="shrink font-inter-bold text-body-sm text-ed-on-surface"
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
                          className="font-inter-bold text-label uppercase"
                          style={{ color: '#1A1A1A' }}
                        >
                          VIP
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Facts as icon-led items, not a middot run-on. Each line of
                      a dot-separated list looks like the same kind of thing, so
                      the door and the attendant read as one sentence; an icon
                      per fact says what each one IS before it is read. */}
                  <View className="mt-1.5 flex-row flex-wrap items-center gap-x-3 gap-y-1.5">
                    {/* The ticket, named the way it was sold. */}
                    <PartyBadge partySize={item.partySize} />
                    {/* Only when it disagrees with the ticket: a Double with one
                        person is the thing worth noticing here. */}
                    {admitted !== item.partySize ? (
                      <MetaItem
                        icon="people-outline"
                        label={`${admitted} of ${item.partySize} arrived`}
                      />
                    ) : null}
                    {item.checkedInDoor ? (
                      <MetaItem icon="enter-outline" label={item.checkedInDoor} />
                    ) : null}
                    {attendant ? <MetaItem icon="person-outline" label={attendant} /> : null}
                  </View>

                  {manual ? (
                    <View className="mt-1.5">
                      <MetaItem icon="create-outline" label={manualMethodOf(item.checkedInBy)} />
                    </View>
                  ) : null}
                </View>

                <Text className="shrink-0 font-inter-medium text-caption text-ed-on-surface-variant">
                  {formatEventTime(item.checkedInAt)}
                </Text>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
