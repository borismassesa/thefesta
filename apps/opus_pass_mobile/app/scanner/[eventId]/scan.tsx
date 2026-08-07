import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BackButton } from '@/components/navigation/BackButton';
import { CountSegments } from '@/components/scanner/CountSegments';
import { ManualCheckinSheet } from '@/components/scanner/ManualCheckinSheet';
import { PartySizeSheet } from '@/components/scanner/PartySizeSheet';
import { ScanTipsBanner, ScanTipsModal } from '@/components/scanner/ScanTipsModal';
import { amendPartySize, lookupAdmission, submitScan, validateScannerSession } from '@/lib/api/checkin';
import { getErrorMessage } from '@/lib/errors';
import { arrivedHeads, clampArrived } from '@/lib/scannerRoster';
import { useScannerSession } from '@/hooks/useScannerSession';
import { useScannerTips } from '@/hooks/useScannerTips';
import { useTheme } from '@/theme/useTheme';
import type { CheckinScanResult, ManualLookupResult, RosterEntry } from '@/types/checkin';

/** Ignore repeat decodes of the same code for this long — a QR held in frame
 *  fires continuously, and without this every guest triggers a burst of
 *  identical requests that all resolve as "duplicate". */
const RESCAN_COOLDOWN_MS = 2500;

/** Side of the square scan target the corner brackets frame. */
const RETICLE_SIZE = 256;

/** A Pass ID is eight characters; a legacy entry code is six. */
const PASS_ID_LENGTH = 8;

const RESULT_STYLES: Record<
  CheckinScanResult['status'],
  { bg: string; icon: keyof typeof Ionicons.glyphMap; title: string }
> = {
  success: { bg: '#1B7F4C', icon: 'checkmark-circle', title: 'Checked in' },
  duplicate: { bg: '#B4751A', icon: 'alert-circle', title: 'Already scanned' },
  invalid: { bg: '#B3261E', icon: 'close-circle', title: 'Not valid' },
  error: { bg: '#5A5A5A', icon: 'cloud-offline', title: "Couldn't check in" },
};

export default function ScanScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const { editorial } = useTheme();
  const { session, isLoading } = useScannerSession();
  const [permission, requestPermission] = useCameraPermissions();

  const [result, setResult] = useState<CheckinScanResult | null>(null);
  const [pending, setPending] = useState(false);
  /** Party-size prompt, shown only when the guest RSVP'd for more than one.
   *  Identified by QR token after a camera scan, or by invitation id after a
   *  typed-code admission — the amend endpoint accepts either. */
  const [partyPrompt, setPartyPrompt] = useState<{
    qrToken?: string;
    invitationId?: string;
    guestName: string;
    partySize: number;
    groupTag: string | null;
  } | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  /** Which way the manual sheet opens: typing the printed code (the usual
   *  case, reached from "QR not working") or searching a name. */
  const [manualMode, setManualMode] = useState<'code' | 'name'>('code');
  const tips = useScannerTips();

  // Refs, not state: the camera callback fires many times a second and must
  // read the latest value without re-subscribing or re-rendering.
  const lastScanRef = useRef<{ token: string; at: number; requestId: string } | null>(null);
  const busyRef = useRef(false);
  /** Outcome of the last attempt, so the camera callback can tell a retry of a
   *  failed scan from a deliberate second admission. */
  const lastResultRef = useRef<CheckinScanResult['status'] | null>(null);

  const queryClient = useQueryClient();

  /**
   * Arrival progress for the header. Shares a cache key with the guest-list
   * screen, so moving between the two doesn't refetch, and one invalidation
   * after a scan updates both.
   */
  const rosterQuery = useQuery({
    queryKey: ['scanner', 'roster', eventId],
    enabled: Boolean(session && session.eventId === eventId),
    queryFn: async () => {
      const validated = await validateScannerSession(session!.eventId, session!.accessToken);
      if (!validated.ok) throw new Error(validated.error);
      return validated.roster;
    },
  });

  const roster = rosterQuery.data ?? [];
  const totalGuests = roster.length;
  const arrivedGuests = roster.filter((g) => g.checkedInAt).length;
  const headsIn = arrivedHeads(roster);

  useEffect(() => {
    if (!permission?.granted && permission?.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  const runScan = useCallback(
    async (args: { qrToken: string; checkedInPartySize?: number; requestId: string }) => {
      if (!session) return;
      busyRef.current = true;
      setPending(true);
      try {
        const scanResult = await submitScan({
          eventId: session.eventId,
          accessToken: session.accessToken,
          qrToken: args.qrToken,
          checkedInPartySize: args.checkedInPartySize,
          requestId: args.requestId,
          doorLabel: session.doorLabel,
          attendantName: session.attendantName ?? undefined,
        });
        setResult(scanResult);
        lastResultRef.current = scanResult.status;
        if (scanResult.status === 'success') {
          // Keep the header count honest without blocking the next scan.
          void queryClient.invalidateQueries({ queryKey: ['scanner', 'roster', eventId] });
          // A successful scan is proof the coaching worked: retire the tips
          // banner on its own rather than leaving it to fight the reticle
          // for attention all night.
          if (tips.bannerVisible) tips.dismissBanner();
        }
        // Haptics matter here: attendants work in the dark, often not looking
        // at the screen between guests.
        await Haptics.notificationAsync(
          scanResult.status === 'success'
            ? Haptics.NotificationFeedbackType.Success
            : scanResult.status === 'duplicate'
              ? Haptics.NotificationFeedbackType.Warning
              : Haptics.NotificationFeedbackType.Error
        );
      } catch (err) {
        setResult({
          status: 'error',
          message: getErrorMessage(err, 'Network error'),
        });
        // The request may still have landed. Marking the attempt as failed is
        // what lets the next scan of this pass reuse its id and be replayed
        // rather than admitting the party twice.
        lastResultRef.current = 'error';
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setPending(false);
        busyRef.current = false;
      }
    },
    [session, queryClient, eventId, tips]
  );

  /**
   * Correct the headcount after the pass is already scanned in.
   *
   * Uses the amend endpoint rather than re-scanning: a re-scan admits MORE of
   * the party (or reports the pass exhausted) and can never lower a headcount.
   * Only the amend path is allowed to reduce it, and only with a reason.
   */
  const correctPartySize = useCallback(
    async (target: { qrToken?: string; invitationId?: string }, arrived: number) => {
      if (!session) return;
      setPartyPrompt(null);
      setPending(true);
      try {
        const amended = await amendPartySize({
          eventId: session.eventId,
          accessToken: session.accessToken,
          qrToken: target.qrToken,
          invitationId: target.invitationId,
          checkedInPartySize: arrived,
          reason: 'Attendant confirmed how many of the party actually arrived',
          requestId: Crypto.randomUUID(),
          doorLabel: session.doorLabel,
        });
        setResult(amended);
        lastResultRef.current = amended.status;
      } catch (err) {
        setResult({
          status: 'error',
          message: getErrorMessage(err, 'Network error'),
        });
        // Same reasoning as runScan, and it matters more here: the amend may
        // well have landed and freed headroom. Without this, the next re-scan
        // of the pass mints a fresh id and re-admits the heads this correction
        // just released — silently undoing it, and reporting success.
        lastResultRef.current = 'error';
      } finally {
        setPending(false);
      }
    },
    [session]
  );

  /**
   * Admit a guest picked from the manual sheet. Sends `invitationId` rather
   * than a QR token, plus the reason that marks it scan-less in the audit
   * trail. Returns the result so the sheet can hand it back and the standard
   * result overlay reports it exactly like a scan.
   */
  const admitManually = useCallback(
    async (guest: RosterEntry, arrived: number): Promise<CheckinScanResult> => {
      if (!session) return { status: 'error', message: 'Session expired' };
      // Same 1..party_size range the server enforces. Left undefined when the
      // full party arrived so the server's authoritative party_size fills the
      // default — the roster copy here could be stale.
      const confirmed = clampArrived(arrived, guest.partySize);
      try {
        const manualResult = await submitScan({
          eventId: session.eventId,
          accessToken: session.accessToken,
          invitationId: guest.invitationId,
          manualReason: 'QR could not be scanned',
          // A fresh id per tap: a manual admission is always a deliberate
          // action, so it should never be replayed. It still gives the
          // admission its own row in the server-side audit trail.
          requestId: Crypto.randomUUID(),
          checkedInPartySize: confirmed === guest.partySize ? undefined : confirmed,
          doorLabel: session.doorLabel,
          attendantName: session.attendantName ?? undefined,
        });
        if (manualResult.status === 'success') {
          void queryClient.invalidateQueries({ queryKey: ['scanner', 'roster', eventId] });
        }
        return manualResult;
      } catch (err) {
        return {
          status: 'error',
          message: getErrorMessage(err, 'Network error'),
        };
      }
    },
    [session, queryClient, eventId]
  );

  /**
   * Find a guest by Pass ID WITHOUT admitting them.
   *
   * A guest reads their Pass ID out precisely because something already went
   * wrong — dead battery, cracked screen, a QR that will not scan. The
   * attendant needs to see who they are looking at before anyone is admitted,
   * so this resolves and returns; the confirm card then makes admission a
   * deliberate second tap.
   */
  const lookupIdentifier = useCallback(
    async (identifier: string): Promise<ManualLookupResult> => {
      if (!session) return { status: 'error', message: 'Session expired' };
      try {
        const found = await lookupAdmission({
          eventId: session.eventId,
          accessToken: session.accessToken,
          // Sent under the right name for its shape. The sheet uses this for
          // typed identifiers AND for a guest picked off the roster, whose
          // resolvable identifier may be either kind.
          ...(identifier.length === PASS_ID_LENGTH
            ? { passId: identifier }
            : { entryCode: identifier }),
        });
        // The server distinguishes "no such guest" from "I could not answer",
        // and so must the door: reporting a reachability failure as an unknown
        // Pass ID sends a guest with a valid ticket away.
        if (found.status === 'error') return { status: 'error', message: found.message };
        if (found.status !== 'found') return { status: 'not_found' };
        const guest: RosterEntry = {
          invitationId: found.invitationId,
          fullName: found.guestName,
          entryCode: found.entryCode,
          passId: found.passId,
          partySize: found.rsvpdPartySize,
          checkedInAt: found.firstCheckedInAt,
          checkedInPartySize: found.alreadyAdmitted || null,
          checkedInDoor: null,
          checkedInBy: null,
          groupTag: found.groupTag,
          isVip: found.isVip,
          phone: found.guestPhone,
          table: found.tableName,
        };
        return { status: 'found', guest };
      } catch (err) {
        // Names the host it could not reach, which is nearly always the actual
        // problem (wrong network, server down, stale dev URL).
        return { status: 'error', message: getErrorMessage(err, 'Network error') };
      }
    },
    [session],
  );

  /** Admit by the short code printed on the ticket. Resolved server-side, so
   *  this works even when the roster failed to load on this device. */
  const admitByCode = useCallback(
    async (entryCode: string): Promise<CheckinScanResult> => {
      if (!session) return { status: 'error', message: 'Session expired' };
      try {
        const codeResult = await submitScan({
          eventId: session.eventId,
          accessToken: session.accessToken,
          entryCode,
          manualReason: 'Checked in with ticket code',
          requestId: Crypto.randomUUID(),
          doorLabel: session.doorLabel,
          attendantName: session.attendantName ?? undefined,
        });
        if (codeResult.status === 'success') {
          void queryClient.invalidateQueries({ queryKey: ['scanner', 'roster', eventId] });
          // Unlike a roster pick there is no confirm card on this path, so a
          // multi-person party gets the same after-the-fact headcount prompt a
          // scan does, amending by invitation id. The id has to come from the
          // local roster (the scan response doesn't carry it) — when the
          // roster failed to load, the admission simply stands at full party.
          if ((codeResult.partySize ?? 1) > 1) {
            const entry = (rosterQuery.data ?? []).find((g) => g.entryCode === entryCode);
            if (entry) {
              setPartyPrompt({
                invitationId: entry.invitationId,
                guestName: codeResult.guestName ?? 'Guest',
                partySize: codeResult.partySize ?? 1,
                groupTag: codeResult.groupTag ?? null,
              });
            }
          }
        }
        return codeResult;
      } catch (err) {
        return {
          status: 'error',
          message: getErrorMessage(err, 'Network error'),
        };
      }
    },
    [session, queryClient, eventId, rosterQuery.data]
  );

  /** Show the manual admission through the same overlay a scan produces. */
  const handleManualAdmitted = useCallback(async (manualResult: CheckinScanResult) => {
    // Cleared so the party-size prompt doesn't fire off a stale QR token from
    // an earlier camera scan.
    lastScanRef.current = null;
    lastResultRef.current = manualResult.status;
    setResult(manualResult);
    await Haptics.notificationAsync(
      manualResult.status === 'success'
        ? Haptics.NotificationFeedbackType.Success
        : manualResult.status === 'duplicate'
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Error
    );
  }, []);

  const handleBarcode = useCallback(
    ({ data }: { data: string }) => {
      if (!data || busyRef.current || partyPrompt || result) return;

      const now = Date.now();
      const last = lastScanRef.current;
      if (last && last.token === data && now - last.at < RESCAN_COOLDOWN_MS) return;

      // Reuse the previous attempt's id when re-scanning the same pass after
      // an ERROR. That attempt may well have admitted the party before the
      // response was lost, and admission is a counter now: a fresh id would
      // let a family of four walk in twice on one pass. Any other re-scan is a
      // deliberate new admission (the rest of the party arriving) and gets a
      // new id.
      const retrying = last?.token === data && lastResultRef.current === 'error';
      const requestId = retrying && last ? last.requestId : Crypto.randomUUID();
      lastScanRef.current = { token: data, at: now, requestId };

      // We can't know the party size until the server resolves the token, so
      // scan first and let the result drive whether we need to ask.
      void runScan({ qrToken: data, requestId });
    },
    [runScan, partyPrompt, result]
  );

  // Once a successful scan comes back for a multi-person party, offer the
  // correction step rather than assuming everyone arrived together.
  useEffect(() => {
    if (
      result?.status === 'success' &&
      (result.partySize ?? 1) > 1 &&
      lastScanRef.current &&
      !partyPrompt
    ) {
      setPartyPrompt({
        qrToken: lastScanRef.current.token,
        guestName: result.guestName ?? 'Guest',
        partySize: result.partySize ?? 1,
        groupTag: result.groupTag ?? null,
      });
    }
  }, [result, partyPrompt]);

  const dismiss = () => {
    setResult(null);
    setPartyPrompt(null);
  };

  if (isLoading) {
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
          <Ionicons name="lock-closed-outline" size={32} color={editorial.onSurfaceVariant} />
          <Text className="mt-3 text-center font-inter text-body-sm text-ed-on-surface-variant">
            This shift has ended. Enter your access code again to keep scanning.
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

  if (!permission?.granted) {
    return (
      <SafeAreaView className="flex-1 bg-ed-bg" edges={['top']}>
        <View className="px-4 pt-2">
          <BackButton />
        </View>
        <View className="flex-1 items-center justify-center px-10">
          <Ionicons name="camera-outline" size={32} color={editorial.onSurfaceVariant} />
          <Text className="mt-3 text-center font-inter text-body-sm text-ed-on-surface-variant">
            {permission?.canAskAgain === false
              ? 'Camera access is blocked. Enable it for OpusPass in your device settings to scan guest passes.'
              : 'OpusPass needs your camera to scan guest entry passes.'}
          </Text>
          {permission?.canAskAgain !== false ? (
            <Pressable
              accessibilityRole="button"
              onPress={requestPermission}
              className="mt-5 rounded-full bg-ed-primary-container px-6 py-3"
            >
              <Text className="font-inter-bold text-caption uppercase tracking-[1px] text-ed-on-primary">
                Allow camera
              </Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  const resultStyle = result ? RESULT_STYLES[result.status] : null;
  /** Anything covering the camera also has to stop it decoding: the feed keeps
   *  running behind a modal, and a code drifting through frame while the
   *  attendant is reading a sheet would fire a scan they never asked for. */
  const cameraBlocked = Boolean(result || partyPrompt || manualOpen || tips.showTips);

  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={cameraBlocked ? undefined : handleBarcode}
      />

      {/* Header. A scrim, not per-button pills: white text over a live camera
          feed is unreadable the moment someone walks past in a light shirt,
          and a gradient keeps it legible without boxing in every element. */}
      <View pointerEvents="box-none" className="absolute left-0 right-0 top-0">
        <LinearGradient
          colors={['rgba(0,0,0,0.78)', 'rgba(0,0,0,0.45)', 'transparent']}
          pointerEvents="box-none"
        >
          <SafeAreaView edges={['top']}>
            <View className="flex-row items-center gap-3 px-4 pb-6 pt-1">
              {/* Matches BackButton's shape and icon, but can't use it
                  directly: that component fills with a light surface token,
                  which disappears against a camera feed. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go back"
                onPress={() => router.back()}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                className="h-10 w-10 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: 'rgba(255,255,255,0.16)' }}
              >
                <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
              </Pressable>

              <View className="min-w-0 flex-1">
                <Text
                  className="text-center font-inter-bold text-body-sm text-white"
                  numberOfLines={1}
                >
                  {session.eventName ?? 'Check-in'}
                </Text>
                {/* Icon-led facts rather than a dot-joined string, matching
                    the shift card on the entry screen. */}
                <View className="mt-1 flex-row items-center justify-center gap-3">
                  <View className="flex-row items-center gap-1">
                    <MaterialCommunityIcons
                      name="door-open"
                      size={12}
                      color="rgba(255,255,255,0.65)"
                    />
                    <Text
                      className="font-inter text-label"
                      style={{ color: 'rgba(255,255,255,0.65)' }}
                      numberOfLines={1}
                    >
                      {session.doorLabel}
                    </Text>
                  </View>
                  {session.attendantName ? (
                    <View className="flex-row items-center gap-1">
                      <Ionicons
                        name="person-outline"
                        size={11}
                        color="rgba(255,255,255,0.65)"
                      />
                      <Text
                        className="font-inter text-label"
                        style={{ color: 'rgba(255,255,255,0.65)' }}
                        numberOfLines={1}
                      >
                        {session.attendantName}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open the guest list"
                onPress={() => router.push(`/scanner/${eventId}/guests`)}
                hitSlop={12}
                className="h-10 w-10 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: 'rgba(255,255,255,0.16)' }}
              >
                {/* Not a magnifier: over a camera that reads as zoom. */}
                <Ionicons name="people-outline" size={20} color="#FFFFFF" />
              </Pressable>
            </View>

            {/* The state of the door in three numbers. Every one is a way in
                to the matching list, so the counts an attendant is asked for
                all night double as the navigation to answer follow-ups. */}
            {totalGuests > 0 ? (
              <View className="-mt-3 px-4 pb-2">
                <CountSegments
                  tone="camera"
                  segments={[
                    {
                      key: 'pending',
                      icon: 'time-outline',
                      label: 'Still to arrive',
                      caption: 'waiting',
                      count: totalGuests - arrivedGuests,
                    },
                    {
                      key: 'arrived',
                      icon: 'checkmark',
                      label: 'Checked in',
                      caption: 'in',
                      count: arrivedGuests,
                    },
                    {
                      key: 'all',
                      icon: 'people-outline',
                      label: 'On the list',
                      caption: 'invited',
                      count: totalGuests,
                    },
                  ]}
                  onSelect={(key) => {
                    if (key === 'arrived') router.push(`/scanner/${eventId}/arrivals`);
                    else router.push(`/scanner/${eventId}/guests?filter=${key}`);
                  }}
                />
                {/* Headcount only once there is one: at zero it's a third row
                    of chrome saying nothing the bar doesn't. No status dot —
                    it implied "live" without anything establishing that. */}
                {headsIn > 0 ? (
                  <Text
                    className="mt-1.5 text-center font-inter text-label"
                    style={{ color: 'rgba(255,255,255,0.65)' }}
                  >
                    {headsIn} {headsIn === 1 ? 'person' : 'people'} through the door
                  </Text>
                ) : null}
              </View>
            ) : null}

            {tips.ready && tips.bannerVisible ? (
              <View className="pb-2 pt-1">
                <ScanTipsBanner onOpen={tips.openTips} onDismiss={tips.dismissBanner} />
              </View>
            ) : null}
          </SafeAreaView>
        </LinearGradient>
      </View>

      {/* Reticle. Dimming everything outside it both aims the attendant at
          the right spot and stops a busy venue background reading as part of
          the UI — a bare outline on a live feed looked unfinished. */}
      {!cameraBlocked ? (
        <>
          <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
            <View
              className="items-center justify-center"
              style={{ width: RETICLE_SIZE, height: RETICLE_SIZE }}
            >
              {/* Corner brackets rather than a full box: they frame the target
                  without drawing a hard edge across the guest's ticket. */}
              {(
                [
                  { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 20 },
                  { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 20 },
                  { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 20 },
                  { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 20 },
                ] as const
              ).map((corner, i) => (
                <View
                  key={i}
                  style={{
                    position: 'absolute',
                    width: 44,
                    height: 44,
                    borderColor: '#FFFFFF',
                    ...corner,
                  }}
                />
              ))}
            </View>
            <Text
              className="mt-7 font-inter text-body-sm"
              style={{ color: 'rgba(255,255,255,0.85)' }}
            >
              Point at the QR code on the guest&apos;s ticket
            </Text>
          </View>

          {/* Manual fallback, always visible rather than hidden behind the
              header icon: a QR that won't scan (cracked screen, dead phone,
              printed ticket in bad light) is exactly when the attendant is
              under pressure and shouldn't have to hunt for the way out. */}
          <View className="absolute bottom-0 left-0 right-0">
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']}>
              <SafeAreaView edges={['bottom']}>
                <View className="px-5 pb-3 pt-10">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Check a guest in manually"
                    onPress={() => {
                      setManualMode('code');
                      setManualOpen(true);
                    }}
                    className="h-14 flex-row items-center justify-center gap-2 rounded-full"
                    style={{ backgroundColor: 'rgba(255,255,255,0.16)' }}
                  >
                    <Ionicons name="create-outline" size={17} color="#FFFFFF" />
                    <Text className="font-inter-bold text-body-sm text-white">
                      QR not working? Check in manually
                    </Text>
                  </Pressable>
                </View>
              </SafeAreaView>
            </LinearGradient>
          </View>
        </>
      ) : null}

      {pending ? (
        <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <ActivityIndicator color="#FFFFFF" size="large" />
        </View>
      ) : null}

      {/* Party-size correction */}
      <PartySizeSheet
        visible={Boolean(partyPrompt)}
        guestName={partyPrompt?.guestName ?? ''}
        partySize={partyPrompt?.partySize ?? 1}
        groupTag={partyPrompt?.groupTag}
        busy={pending}
        // Closing without a number keeps the full party the scan already
        // recorded, which is the common case — a family walking in together.
        onCancel={() => setPartyPrompt(null)}
        onSubmit={(arrived) => {
          if (!partyPrompt) return;
          // An unchanged count is already what the server stored; sending it
          // back would be a round trip that changes nothing, so drop straight
          // to the result overlay instead.
          if (arrived === partyPrompt.partySize) setPartyPrompt(null);
          else
            void correctPartySize(
              { qrToken: partyPrompt.qrToken, invitationId: partyPrompt.invitationId },
              arrived
            );
        }}
      />

      {/* Scan result */}
      {result && resultStyle && !partyPrompt ? (
        <Pressable
          onPress={dismiss}
          className="absolute inset-0 items-center justify-center px-8"
          style={{ backgroundColor: resultStyle.bg }}
        >
          <Ionicons name={resultStyle.icon} size={72} color="#FFFFFF" />
          <Text className="mt-4 text-center font-inter-bold text-screen-title text-white">
            {resultStyle.title}
          </Text>
          {result.guestName ? (
            <Text className="mt-2 text-center font-inter-bold text-card-title text-white">
              {result.guestName}
            </Text>
          ) : null}
          {result.isVip ? (
            <View className="mt-3 rounded-full bg-white/25 px-3 py-1">
              <Text className="font-inter-bold text-label uppercase tracking-[1px] text-white">
                {result.groupTag || 'VIP'}
              </Text>
            </View>
          ) : null}
          {/* Where this guest sits — so the attendant can point them straight
              to their table on arrival. Only shown once they've been seated
              in the couple's Seat collection. */}
          {result.table ? (
            <View className="mt-3 flex-row items-center gap-1.5 rounded-full bg-white/25 px-3.5 py-1.5">
              <Ionicons name="restaurant-outline" size={14} color="#FFFFFF" />
              <Text className="font-inter-bold text-body-sm text-white">{result.table}</Text>
            </View>
          ) : null}
          {result.status === 'success' && result.checkedInPartySize ? (
            <Text className="mt-3 text-center font-inter text-body text-white/90">
              {result.checkedInPartySize} of {result.partySize} admitted
            </Text>
          ) : null}
          {result.message ? (
            <Text className="mt-3 text-center font-inter text-body-sm text-white/90">
              {result.message}
            </Text>
          ) : null}
          {/* An explicit control, not just the tap-anywhere hint that was
              here before: at a busy door the attendant needs an obvious,
              thumb-sized target to move to the next guest, and a hint that
              only reads as text is easy to miss mid-queue. Tapping the
              backdrop still works as a shortcut. */}
          <Pressable
            accessibilityRole="button"
            onPress={dismiss}
            className="mt-9 h-14 w-full max-w-[320px] flex-row items-center justify-center gap-2 rounded-full"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            <Ionicons name="qr-code" size={17} color={resultStyle.bg} />
            <Text
              className="font-inter-bold text-body-sm uppercase tracking-[1px]"
              style={{ color: resultStyle.bg }}
            >
              Scan next guest
            </Text>
          </Pressable>

          {/* The manual path stays reachable without going back to the camera
              first — a guest whose pass just failed is still standing there. */}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              dismiss();
              setManualMode('name');
              setManualOpen(true);
            }}
            className="mt-3 flex-row items-center gap-1.5 py-2"
          >
            <Ionicons name="people-outline" size={15} color="rgba(255,255,255,0.85)" />
            <Text
              className="font-inter-medium text-body-sm"
              style={{ color: 'rgba(255,255,255,0.85)' }}
            >
              Find guest by name
            </Text>
          </Pressable>
        </Pressable>
      ) : null}

      <ManualCheckinSheet
        visible={manualOpen}
        initialMode={manualMode}
        onClose={() => setManualOpen(false)}
        roster={rosterQuery.data ?? []}
        isLoading={rosterQuery.isPending}
        isError={rosterQuery.isError}
        onRetry={() => void rosterQuery.refetch()}
        onAdmit={admitManually}
        onAdmitByCode={admitByCode}
        onLookup={lookupIdentifier}
        onAdmitted={handleManualAdmitted}
      />

      <ScanTipsModal visible={tips.showTips} onClose={tips.closeTips} />
    </View>
  );
}
