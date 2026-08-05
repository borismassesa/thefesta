'use client'

import { useState, useTransition } from 'react'
import { useUser } from '@clerk/nextjs'
import { toast } from 'sonner'
import { Button, Field, inputClass } from '@/components/dashboard/controls'
import { cn } from '@/lib/utils'
import { upsertCoupleProfile } from '@/lib/dashboard/actions'
import type { CoupleProfileLite } from '@/lib/dashboard/queries'

export default function InformationForm({ profile }: { profile: CoupleProfileLite | null }) {
  const { user, isLoaded } = useUser()
  // This is a couple's account, so "your information" is the two partners'
  // names (couple_profiles), not a single account holder.
  const [partner1, setPartner1] = useState(profile?.partner1_name ?? '')
  const [partner2, setPartner2] = useState(profile?.partner2_name ?? '')
  const [pending, startTransition] = useTransition()

  function save() {
    if (!partner1.trim()) {
      toast.error('Enter at least one name')
      return
    }
    startTransition(async () => {
      try {
        // upsertCoupleProfile rewrites the whole row, so pass the rest of the
        // saved profile through unchanged — only the names are edited here.
        await upsertCoupleProfile({
          partner1_name: partner1.trim(),
          partner2_name: partner2.trim() || null,
          wedding_date: profile?.wedding_date ?? null,
          whatsapp_phone: profile?.whatsapp_phone ?? null,
          city: profile?.city ?? null,
          pledge_payment_instructions: profile?.pledge_payment_instructions ?? null,
          pledge_goal_amount: profile?.pledge_goal_amount ?? null,
        })
        toast.success('Saved')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not save')
      }
    })
  }

  const email = user?.primaryEmailAddress?.emailAddress ?? ''

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold text-[#1A1A1A]">Your information</h2>
        <div className="mt-4 rounded-2xl border border-black/[0.08] bg-white p-5 shadow-sm sm:p-6">
          <div className="grid gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Partner 1 name" required>
                <input
                  className={inputClass}
                  value={partner1}
                  onChange={(e) => setPartner1(e.target.value)}
                  placeholder="e.g. Boris"
                />
              </Field>
              <Field label="Partner 2 name">
                <input
                  className={inputClass}
                  value={partner2}
                  onChange={(e) => setPartner2(e.target.value)}
                  placeholder="e.g. Grace"
                />
              </Field>
            </div>
            <Field label="Email address" required hint="To change your email, use Password and security.">
              <input
                className={cn(inputClass, 'cursor-not-allowed bg-black/[0.03] text-[#1A1A1A]/55')}
                value={email}
                disabled
                readOnly
              />
            </Field>
          </div>
          <div className="mt-5">
            <Button onClick={save} disabled={pending}>
              {pending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </div>

      <ConnectedAccounts />
    </div>
  )
}

function ConnectedAccounts() {
  const { user, isLoaded } = useUser()
  const [pending, setPending] = useState(false)
  const google = user?.externalAccounts.find((a) => a.provider === 'google')

  async function connect() {
    if (!user) return
    setPending(true)
    try {
      const account = await user.createExternalAccount({
        strategy: 'oauth_google',
        redirectUrl: window.location.href,
      })
      const redirect = account.verification?.externalVerificationRedirectURL
      if (redirect) window.location.href = redirect.toString()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not connect')
      setPending(false)
    }
  }

  async function disconnect() {
    if (!google) return
    setPending(true)
    try {
      await google.destroy()
      await user?.reload()
      toast.success('Disconnected')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not disconnect')
    } finally {
      setPending(false)
    }
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-[#1A1A1A]">Connected accounts</h2>
      <p className="mt-1 text-sm text-[#1A1A1A]/55">Connect your accounts to sign in faster.</p>
      <div className="mt-4 rounded-2xl border border-black/[0.08] bg-white p-5 shadow-sm sm:p-6">
        {!isLoaded ? null : google ? (
          <>
            <p className="mb-2 text-sm font-semibold text-[#1A1A1A]">Currently connected</p>
            <button
              type="button"
              onClick={disconnect}
              disabled={pending}
              className="text-sm font-medium text-[#7E5896] underline underline-offset-2 hover:text-[#5f4171] disabled:opacity-50"
            >
              Disconnect with Google
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={connect}
            disabled={pending}
            className="text-sm font-medium text-[#7E5896] underline underline-offset-2 hover:text-[#5f4171] disabled:opacity-50"
          >
            Connect with Google
          </button>
        )}
      </div>
    </div>
  )
}
