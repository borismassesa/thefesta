'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useSignIn } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AuthShell from '@/components/AuthShell'
import CodeBoxes from '@/components/CodeBoxes'
import { usePortalT } from '@/components/providers/PortalUIStringsProvider'

// Fully headless sign-in — the counterpart to SignUpClient. We own the markup,
// Clerk owns the auth (useSignIn: create / authenticateWithRedirect /
// prepareFirstFactor / attemptFirstFactor / setActive). No Clerk <SignIn>
// component, so no Clerk card chrome — it matches the custom sign-up exactly.
//
// Flows:
//   • password: email + password → activate session → /dashboard
//   • OAuth:    Google → hand off, return through /sso-callback
//   • reset:    "Forgot password" → Clerk emails a code → set a new password

const AFTER_SIGN_IN_URL = '/dashboard'
const STALL_THRESHOLD_MS = 15000
const BLOCKED_REDIRECT_PREFIXES = ['/sign-in', '/sign-up', '/sso-callback']

type Step = 'password' | 'forgot' | 'reset'

// Pull a human message out of a Clerk error, else a fallback.
function clerkError(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'errors' in err) {
    const errs = (err as { errors?: Array<{ longMessage?: string; message?: string }> }).errors
    const first = errs?.[0]
    if (first) return first.longMessage || first.message || fallback
  }
  return fallback
}

function safeRedirectPath(raw: string | undefined): string {
  if (!raw) return AFTER_SIGN_IN_URL

  try {
    const origin =
      typeof window === 'undefined' ? 'https://vendors.opusfesta.local' : window.location.origin
    const url = new URL(raw, origin)
    if (url.origin !== origin) return AFTER_SIGN_IN_URL

    const path = `${url.pathname}${url.search}${url.hash}`
    if (
      !path.startsWith('/') ||
      path.startsWith('//') ||
      BLOCKED_REDIRECT_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
    ) {
      return AFTER_SIGN_IN_URL
    }
    return path
  } catch {
    return AFTER_SIGN_IN_URL
  }
}

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-[15px] text-[#1A1A1A] outline-none transition focus:border-[#C9A0DC] focus:ring-2 focus:ring-[#C9A0DC]/25 placeholder:text-gray-400'
const buttonClass =
  'flex w-full items-center justify-center rounded-lg bg-[#1A1A1A] py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-60'
const oauthButtonClass =
  'flex w-full items-center justify-center gap-2.5 rounded-lg border border-gray-300 bg-white py-3 text-sm font-medium text-[#1A1A1A] transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60'
const labelClass = 'mb-2 block text-sm font-medium text-[#1A1A1A]'
const linkClass = 'font-medium text-[#7E5896] underline-offset-2 hover:underline disabled:opacity-60'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}

export default function SignInClient({
  redirectUrl,
  initialEmail,
}: {
  redirectUrl?: string
  initialEmail?: string
}) {
  const { isLoaded, signIn, setActive } = useSignIn()
  const router = useRouter()
  const t = usePortalT('auth')

  const [step, setStep] = useState<Step>('password')
  const [email, setEmail] = useState(initialEmail ?? '')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Set after a failed password sign-in, to hint that the account may be a
  // password-less Google account (shared OpusFesta login).
  const [passwordFailed, setPasswordFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [oauthBusy, setOauthBusy] = useState<'google' | null>(null)
  const [stalled, setStalled] = useState(false)

  useEffect(() => {
    if (isLoaded) return
    const t = setTimeout(() => setStalled(true), STALL_THRESHOLD_MS)
    return () => clearTimeout(t)
  }, [isLoaded])

  async function activate(createdSessionId: string | null) {
    if (createdSessionId && setActive) {
      await setActive({ session: createdSessionId })
      router.push(safeRedirectPath(redirectUrl))
      return true
    }
    return false
  }

  async function onPassword(e: FormEvent) {
    e.preventDefault()
    if (!isLoaded || !signIn || busy) return
    setError(null)
    setPasswordFailed(false)
    setBusy(true)
    try {
      const res = await signIn.create({ identifier: email.trim(), password })
      if (res.status === 'complete') {
        if (!(await activate(res.createdSessionId))) {
          setError(t('error_additional_verification'))
        }
      } else {
        setError(t('error_additional_verification'))
      }
    } catch (err) {
      // A failed password sign-in is often a Google account (no password) since
      // OpusFesta shares one login across the platform. Surface that as a hint
      // rather than probing supportedFirstFactors, which Clerk enumeration
      // protection can hide (it would wrongly block a real password user).
      setError(clerkError(err, t('error_incorrect_password')))
      setPasswordFailed(true)
    } finally {
      setBusy(false)
    }
  }

  async function onForgot(e: FormEvent) {
    e.preventDefault()
    if (!isLoaded || !signIn || busy) return
    setError(null)
    setBusy(true)
    try {
      await signIn.create({ strategy: 'reset_password_email_code', identifier: email.trim() })
      setStep('reset')
    } catch (err) {
      setError(clerkError(err, t('reset_email_send_error')))
    } finally {
      setBusy(false)
    }
  }

  async function onReset(e: FormEvent) {
    e.preventDefault()
    if (!isLoaded || !signIn || busy) return
    setError(null)
    setBusy(true)
    try {
      const res = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: code.trim(),
        password: newPassword,
      })
      if (res.status === 'complete') {
        if (!(await activate(res.createdSessionId))) {
          setError(t('reset_partial_error'))
        }
      } else {
        setError(t('reset_incomplete_error'))
      }
    } catch (err) {
      setError(clerkError(err, t('reset_invalid_code_error')))
    } finally {
      setBusy(false)
    }
  }

  async function onOAuth(provider: 'google') {
    if (!isLoaded || !signIn || oauthBusy) return
    setError(null)
    setOauthBusy(provider)
    try {
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: safeRedirectPath(redirectUrl),
      })
    } catch (err) {
      setError(clerkError(err, t('oauth_google_error')))
      setOauthBusy(null)
    }
  }

  function backToSignIn() {
    setStep('password')
    setCode('')
    setNewPassword('')
    setError(null)
  }

  const subtitle =
    step === 'forgot'
      ? t('signin_subtitle_forgot')
      : step === 'reset'
        ? t('signin_subtitle_reset', { email })
        : t('signin_subtitle_default')

  return (
    <AuthShell
      panelTitle={t('signin_panel_title')}
      panelSubtitle={t('signin_panel_subtitle')}
    >
      <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[#1A1A1A]">
        {t('signin_heading')}
      </h1>
      <p className="mt-2 text-[15px] text-gray-500">{subtitle}</p>

      {!isLoaded ? (
        <div className="mt-6 py-14 text-center">
          {stalled ? (
            <>
              <p className="text-sm font-medium text-[#1A1A1A]">{t('signin_stalled_title')}</p>
              <p className="mx-auto mt-2 max-w-xs text-sm text-gray-500">
                {t('auth_stalled_desc')}
              </p>
              <button data-opus-button="control"
                type="button"
                onClick={() => window.location.reload()}
                className={`mt-5 ${buttonClass}`}
              >
                {t('retry_button')}
              </button>
            </>
          ) : (
            <div
              className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-[#C9A0DC]"
              role="status"
              aria-label={t('loading_aria')}
            />
          )}
        </div>
      ) : (
        <div className="mt-6">
          {error && (
            <p
              className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-600"
              role="alert"
            >
              {error}
            </p>
          )}

          {passwordFailed && step === 'password' && (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
              {t('password_failed_hint')}
            </p>
          )}


          {step === 'password' && (
            <>
              <button data-opus-button="control"
                type="button"
                onClick={() => onOAuth('google')}
                disabled={Boolean(oauthBusy)}
                className={`w-full ${oauthButtonClass}`}
              >
                <GoogleIcon />
                {oauthBusy === 'google' ? t('oauth_redirecting') : t('oauth_google_button')}
              </button>

              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-gray-200" />
                <span className="text-xs font-medium uppercase tracking-wider text-gray-400">{t('or_divider')}</span>
                <span className="h-px flex-1 bg-gray-200" />
              </div>

              <form onSubmit={onPassword} className="space-y-4">
                <div>
                  <label htmlFor="email" className={labelClass}>
                    {t('field_email_label')}
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('field_email_placeholder')}
                    className={inputClass}
                  />
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label htmlFor="password" className="block text-sm font-medium text-[#1A1A1A]">
                      {t('field_password_label')}
                    </label>
                    <button data-opus-button="control"
                      type="button"
                      onClick={() => {
                        setStep('forgot')
                        setError(null)
                      }}
                      className={linkClass}
                    >
                      {t('forgot_password_link')}
                    </button>
                  </div>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('field_password_placeholder')}
                    className={inputClass}
                  />
                </div>
                <button data-opus-button="primary" data-opus-button-size="medium" type="submit" disabled={busy} className={buttonClass}>
                  {busy ? t('signing_in_label') : t('signin_submit_button')}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-gray-500">
                {t('new_to_opusfesta')}{' '}
                <Link href="/sign-up" className={linkClass}>
                  {t('create_account_link')}
                </Link>
              </p>
            </>
          )}

          {step === 'forgot' && (
            <form onSubmit={onForgot} className="space-y-4">
              <div>
                <label htmlFor="forgot-email" className={labelClass}>
                  {t('field_email_label')}
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('field_email_placeholder')}
                  className={inputClass}
                />
              </div>
              <button data-opus-button="primary" data-opus-button-size="medium" type="submit" disabled={busy} className={buttonClass}>
                {busy ? t('sending_label') : t('send_reset_code_button')}
              </button>
              <button data-opus-button="control"
                type="button"
                onClick={backToSignIn}
                className="block w-full text-center text-sm text-gray-500 hover:text-[#1A1A1A]"
              >
                {t('back_to_signin_button')}
              </button>
            </form>
          )}

          {step === 'reset' && (
            <form onSubmit={onReset} className="space-y-4">
              <div>
                <span className={labelClass}>{t('verification_code_label')}</span>
                <CodeBoxes value={code} onChange={setCode} autoFocus disabled={busy} />
              </div>
              <div>
                <label htmlFor="new-password" className={labelClass}>
                  {t('new_password_label')}
                </label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('new_password_placeholder')}
                  className={inputClass}
                />
              </div>
              <button data-opus-button="primary" data-opus-button-size="medium"
                type="submit"
                disabled={busy || code.replace(/\D/g, '').length < 6}
                className={buttonClass}
              >
                {busy ? t('resetting_label') : t('reset_submit_button')}
              </button>
              <button data-opus-button="control"
                type="button"
                onClick={backToSignIn}
                className="block w-full text-center text-sm text-gray-500 hover:text-[#1A1A1A]"
              >
                {t('back_to_signin_button')}
              </button>
            </form>
          )}
        </div>
      )}
    </AuthShell>
  )
}
