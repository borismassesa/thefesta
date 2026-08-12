'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowRight, Loader2, TriangleAlert, User } from 'lucide-react'
import { validateScannerSession } from '@/lib/api/checkin'
import { useScannerSession } from '@/hooks/useScannerSession'

/**
 * The shareable link landing: /event/{eventId}?token={doorCode}.
 *
 * The couple sends this link to whoever is working the door; opening it
 * validates the code and starts a shift with no typed code at all. This is
 * the web's counterpart to the mobile app's typed-code entry — the code rides
 * in the URL instead.
 *
 * The token is scrubbed from the address bar as soon as the session is saved:
 * a door code left in browser history, in a screenshot of the address bar, or
 * in a forwarded "it doesn't work" message is a working credential.
 */
export default function EventGatePage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { eventId } = use(params)
  const { token } = use(searchParams)
  const router = useRouter()
  const { session, isLoading: sessionLoading, saveSession } = useScannerSession()

  const [state, setState] = useState<'checking' | 'attendant' | 'error'>('checking')
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [pending, setPending] = useState<{ doorLabel: string; eventName: string | null; expiresAt: string | null } | null>(null)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    if (sessionLoading) return

    // No token: a live shift for this event goes straight to the camera;
    // anything else belongs on the code form.
    if (!token) {
      if (session && session.eventId === eventId) router.replace(`/event/${eventId}/scan`)
      else router.replace('/')
      return
    }

    let cancelled = false
    validateScannerSession(eventId, token)
      .then((validated) => {
        if (cancelled) return
        if (!validated.ok) {
          setState('error')
          setError(validated.error || 'This link is no longer valid.')
          return
        }
        // An admin-assigned code IS the attendant's identity — no name step,
        // straight to the camera, same as the mobile entry resolving one.
        if (validated.attendantName) {
          saveSession({
            eventId,
            accessToken: token,
            doorLabel: validated.doorLabel,
            attendantName: validated.attendantName,
            eventName: validated.event?.name ?? null,
            expiresAt: validated.expiresAt ?? null,
          })
          router.replace(`/event/${eventId}/scan`)
          return
        }
        // A couple self-serve code carries no name. Keep whatever this device
        // used before (a returning attendant on the same phone), otherwise ask
        // once — the name rides along on every check-in they record.
        const carried = session?.eventId === eventId ? session.attendantName : null
        if (carried) {
          saveSession({
            eventId,
            accessToken: token,
            doorLabel: validated.doorLabel,
            attendantName: carried,
            eventName: validated.event?.name ?? null,
            expiresAt: validated.expiresAt ?? null,
          })
          router.replace(`/event/${eventId}/scan`)
          return
        }
        setPending({
          doorLabel: validated.doorLabel,
          eventName: validated.event?.name ?? null,
          expiresAt: validated.expiresAt ?? null,
        })
        setState('attendant')
      })
      .catch(() => {
        if (cancelled) return
        setState('error')
        setError('Could not reach the server. Check your connection and try again.')
      })

    return () => {
      cancelled = true
    }
    // Re-validate only when the eventId/token pair changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, token, sessionLoading])

  const startShift = (e: React.FormEvent) => {
    e.preventDefault()
    if (!pending || !token || starting) return
    setStarting(true)
    saveSession({
      eventId,
      accessToken: token,
      doorLabel: pending.doorLabel,
      // The mobile entry screen treats the name as optional: an unnamed
      // shift records the door alone, and the audit trail still holds.
      attendantName: name.trim() || null,
      eventName: pending.eventName,
      expiresAt: pending.expiresAt,
    })
    router.replace(`/event/${eventId}/scan`)
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6">
      <Image
        src="/assets/logo/OpusPass Logo.svg"
        alt="OpusPass"
        width={203}
        height={65}
        priority
        unoptimized
        className="h-9 w-auto"
      />

      <div className="mt-10 w-full max-w-sm">
        {state === 'checking' ? (
          <div className="flex items-center justify-center gap-3 text-[#1A1A1A]">
            <Loader2 className="h-5 w-5 animate-spin text-[#8e57b3]" />
            <p className="text-sm text-[#1A1A1A]/70">Verifying your link…</p>
          </div>
        ) : null}

        {state === 'error' ? (
          <div className="text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-500">
              <TriangleAlert className="h-5 w-5" />
            </span>
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-[#1A1A1A]">Link not valid</h1>
            <p className="mt-3 text-sm text-[#1A1A1A]/60">{error}</p>
            <button
              type="button"
              onClick={() => router.replace('/')}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-[#C9A0DC] px-6 py-3.5 text-sm font-bold text-[#1A1A1A] transition-colors hover:bg-[#b97fd0]"
            >
              Enter a code instead
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        {state === 'attendant' ? (
          <form onSubmit={startShift}>
            <p className="text-[11px] font-semibold tracking-wide text-[#8e57b3] uppercase">
              {pending?.eventName ?? 'Event'}
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#1A1A1A]">Who&apos;s scanning?</h1>
            <p className="mt-3 text-sm text-[#1A1A1A]/60">
              Enter your name to start your shift at{' '}
              <span className="font-medium text-[#1A1A1A]">{pending?.doorLabel}</span>. It is recorded against every
              guest you check in.
            </p>

            <div className="mt-8 flex items-center gap-3 rounded-xl border border-black/12 bg-white px-4 py-1 transition-colors focus-within:border-[#C9A0DC] focus-within:ring-2 focus-within:ring-[#C9A0DC]/30">
              <User className="h-4 w-4 shrink-0 text-[#1A1A1A]/40" />
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoCapitalize="words"
                autoComplete="name"
                enterKeyHint="go"
                className="w-full bg-transparent py-3 text-sm text-[#1A1A1A] outline-none placeholder:text-gray-500"
              />
            </div>

            <button
              type="submit"
              disabled={starting}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#C9A0DC] px-6 py-3.5 text-sm font-bold text-[#1A1A1A] transition-colors hover:bg-[#b97fd0] disabled:opacity-50"
            >
              {starting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Start scanning
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </form>
        ) : null}
      </div>
    </main>
  )
}
