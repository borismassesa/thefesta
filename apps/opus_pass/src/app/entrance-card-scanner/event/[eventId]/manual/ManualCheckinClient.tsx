'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CircleCheck, CloudOff, QrCode, Users, UtensilsCrossed, XCircle, type LucideIcon } from 'lucide-react'
import { ManualCheckinForm } from '@/components/scanner/ManualCheckinSheet'
import { PartySizeSheet } from '@/components/scanner/PartySizeSheet'
import { SessionGate } from '@/components/scanner/SessionGate'
import { amendPartySize, lookupAdmission, submitScan, validateScannerSession } from '@/lib/scanner/api/checkin'
import { getErrorMessage } from '@/lib/scanner/errors'
import { vibrateForResult } from '@/lib/scanner/haptics'
import type { ScannerStringKey } from '@/lib/scanner/i18n'
import { clampArrived } from '@/lib/scanner/roster'
import { useScannerSession } from '@/hooks/useScannerSession'
import { useScannerT } from '@/hooks/useScannerT'
import type { CheckinScanResult, ManualLookupResult, RosterEntry } from '@/types/scanner-checkin'

const PASS_ID_LENGTH = 8

const RESULT_STYLES: Record<
  CheckinScanResult['status'],
  { bg: string; icon: LucideIcon; titleKey: ScannerStringKey }
> = {
  success: { bg: '#1B7F4C', icon: CircleCheck, titleKey: 'checked_in_title' },
  duplicate: { bg: '#B4751A', icon: AlertCircle, titleKey: 'already_scanned' },
  invalid: { bg: '#B3261E', icon: XCircle, titleKey: 'not_valid' },
  error: { bg: '#5A5A5A', icon: CloudOff, titleKey: 'couldnt_check_in' },
}

function isMode(value: string | null): value is 'code' | 'name' {
  return value === 'code' || value === 'name'
}

/**
 * Dedicated manual check-in page — typed Pass ID / ticket code or find-by-name.
 * Reached from the scan screen when the QR won't read; not a sheet over the camera.
 */
export default function ManualCheckinClient({ eventId }: { eventId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { session } = useScannerSession()
  const queryClient = useQueryClient()
  const t = useScannerT()

  const initialMode = useMemo(() => {
    const mode = searchParams.get('mode')
    return isMode(mode) ? mode : 'code'
  }, [searchParams])

  const [result, setResult] = useState<CheckinScanResult | null>(null)
  const [partyPrompt, setPartyPrompt] = useState<{
    invitationId: string
    guestName: string
    partySize: number
    groupTag: string | null
  } | null>(null)
  const [pending, setPending] = useState(false)

  const sessionReady = session !== null && session.eventId === eventId
  const scanHref = `/entrance-card-scanner/event/${eventId}/scan`

  const rosterQuery = useQuery({
    queryKey: ['scanner', 'roster', eventId],
    enabled: sessionReady,
    queryFn: async () => {
      const validated = await validateScannerSession(session!.eventId, session!.accessToken)
      if (!validated.ok) throw new Error(validated.error)
      return validated.roster
    },
  })

  const goScan = useCallback(() => {
    router.push(scanHref)
  }, [router, scanHref])

  const admitManually = useCallback(
    async (guest: RosterEntry, arrived: number): Promise<CheckinScanResult> => {
      if (!session) return { status: 'error', message: 'Session expired' }
      const confirmed = clampArrived(arrived, guest.partySize)
      try {
        const manualResult = await submitScan({
          eventId: session.eventId,
          accessToken: session.accessToken,
          invitationId: guest.invitationId,
          manualReason: 'QR could not be scanned',
          requestId: crypto.randomUUID(),
          checkedInPartySize: confirmed === guest.partySize ? undefined : confirmed,
          doorLabel: session.doorLabel,
          attendantName: session.attendantName ?? undefined,
        })
        if (manualResult.status === 'success') {
          void queryClient.invalidateQueries({ queryKey: ['scanner', 'roster', eventId] })
        }
        return manualResult
      } catch (err) {
        return { status: 'error', message: getErrorMessage(err, 'Network error') }
      }
    },
    [session, queryClient, eventId],
  )

  const lookupIdentifier = useCallback(
    async (identifier: string): Promise<ManualLookupResult> => {
      if (!session) return { status: 'error', message: 'Session expired' }
      try {
        const found = await lookupAdmission({
          eventId: session.eventId,
          accessToken: session.accessToken,
          ...(identifier.length === PASS_ID_LENGTH ? { passId: identifier } : { entryCode: identifier }),
        })
        if (found.status === 'error') return { status: 'error', message: found.message }
        if (found.status !== 'found') return { status: 'not_found' }
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
        }
        return { status: 'found', guest }
      } catch (err) {
        return { status: 'error', message: getErrorMessage(err, 'Network error') }
      }
    },
    [session],
  )

  const admitByCode = useCallback(
    async (entryCode: string): Promise<CheckinScanResult> => {
      if (!session) return { status: 'error', message: 'Session expired' }
      try {
        const codeResult = await submitScan({
          eventId: session.eventId,
          accessToken: session.accessToken,
          entryCode,
          manualReason: 'Checked in with ticket code',
          requestId: crypto.randomUUID(),
          doorLabel: session.doorLabel,
          attendantName: session.attendantName ?? undefined,
        })
        if (codeResult.status === 'success') {
          void queryClient.invalidateQueries({ queryKey: ['scanner', 'roster', eventId] })
          if ((codeResult.partySize ?? 1) > 1) {
            const entry = (rosterQuery.data ?? []).find((g) => g.entryCode === entryCode)
            if (entry) {
              setPartyPrompt({
                invitationId: entry.invitationId,
                guestName: codeResult.guestName ?? 'Guest',
                partySize: codeResult.partySize ?? 1,
                groupTag: codeResult.groupTag ?? null,
              })
            }
          }
        }
        return codeResult
      } catch (err) {
        return { status: 'error', message: getErrorMessage(err, 'Network error') }
      }
    },
    [session, queryClient, eventId, rosterQuery.data],
  )

  const correctPartySize = useCallback(
    async (invitationId: string, arrived: number) => {
      if (!session) return
      setPartyPrompt(null)
      setPending(true)
      try {
        const amended = await amendPartySize({
          eventId: session.eventId,
          accessToken: session.accessToken,
          invitationId,
          checkedInPartySize: arrived,
          reason: 'Attendant confirmed how many of the party actually arrived',
          requestId: crypto.randomUUID(),
          doorLabel: session.doorLabel,
        })
        setResult(amended)
      } catch (err) {
        setResult({ status: 'error', message: getErrorMessage(err, 'Network error') })
      } finally {
        setPending(false)
      }
    },
    [session],
  )

  const handleAdmitted = useCallback((manualResult: CheckinScanResult) => {
    setResult(manualResult)
    vibrateForResult(manualResult.status)
  }, [])

  const resultStyle = result ? RESULT_STYLES[result.status] : null

  return (
    <SessionGate eventId={eventId}>
      {() => (
        <>
          {!result || partyPrompt ? (
            <ManualCheckinForm
              initialMode={initialMode}
              onBack={goScan}
              roster={rosterQuery.data ?? []}
              isLoading={rosterQuery.isPending}
              isError={rosterQuery.isError}
              onRetry={() => void rosterQuery.refetch()}
              onAdmit={admitManually}
              onAdmitByCode={admitByCode}
              onLookup={lookupIdentifier}
              onAdmitted={handleAdmitted}
            />
          ) : null}

          <PartySizeSheet
            visible={Boolean(partyPrompt)}
            guestName={partyPrompt?.guestName ?? ''}
            partySize={partyPrompt?.partySize ?? 1}
            groupTag={partyPrompt?.groupTag}
            busy={pending}
            onCancel={() => setPartyPrompt(null)}
            onSubmit={(arrived) => {
              if (!partyPrompt) return
              if (arrived === partyPrompt.partySize) setPartyPrompt(null)
              else void correctPartySize(partyPrompt.invitationId, arrived)
            }}
          />

          {result && resultStyle && !partyPrompt ? (
            <div
              role="alert"
              className="fixed inset-0 z-40 flex flex-col items-center justify-center px-8"
              style={{ backgroundColor: resultStyle.bg }}
            >
              <resultStyle.icon size={72} color="#FFFFFF" />
              <p className="mt-4 text-center text-3xl font-bold text-white">{t(resultStyle.titleKey)}</p>
              {result.guestName ? (
                <p className="mt-2 text-center text-xl font-bold text-white">{result.guestName}</p>
              ) : null}
              {result.isVip ? (
                <span className="mt-3 rounded-full bg-white/25 px-3 py-1 text-[11px] font-bold tracking-[1px] text-white uppercase">
                  {result.groupTag || t('vip')}
                </span>
              ) : null}
              {result.table ? (
                <span className="mt-3 flex items-center gap-1.5 rounded-full bg-white/25 px-3.5 py-1.5">
                  <UtensilsCrossed size={14} color="#FFFFFF" />
                  <span className="text-sm font-bold text-white">{result.table}</span>
                </span>
              ) : null}
              {result.status === 'success' && result.checkedInPartySize ? (
                <p className="mt-3 text-center text-base text-white/90">
                  {t('admitted_of', {
                    a: result.checkedInPartySize,
                    b: result.partySize,
                  })}
                </p>
              ) : null}
              {result.message ? <p className="mt-3 text-center text-sm text-white/90">{result.message}</p> : null}

              <button
                type="button"
                onClick={goScan}
                className="mt-9 flex h-14 w-full max-w-80 items-center justify-center gap-2 rounded-full bg-white"
              >
                <QrCode size={17} color={resultStyle.bg} />
                <span className="text-sm font-bold tracking-[1px] uppercase" style={{ color: resultStyle.bg }}>
                  {t('scan_next_guest')}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setResult(null)
                  router.replace(`/entrance-card-scanner/event/${eventId}/manual?mode=name`)
                }}
                className="mt-3 flex items-center gap-1.5 py-2 text-sm font-medium text-white/85"
              >
                <Users size={15} />
                {t('find_guest_by_name')}
              </button>
            </div>
          ) : null}
        </>
      )}
    </SessionGate>
  )
}
