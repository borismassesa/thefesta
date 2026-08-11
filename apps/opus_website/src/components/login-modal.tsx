'use client'

import { X } from 'lucide-react'
import { SignIn } from '@clerk/nextjs'

const LOGIN_IMAGE = '/assets/images/authentic_couple.jpg'

export default function LoginModal({ onClose, onSwitchToSignup }: {
  onClose: () => void
  onSwitchToSignup: () => void
}) {
  return (
    <div data-lenis-prevent className="fixed inset-0 z-200 flex">
      <div
        className="relative flex w-full h-full bg-white overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Log in to OpusFesta"
      >
        {/* ── Left image panel (desktop only) ── */}
        <div className="hidden md:block md:w-[40%] shrink-0 relative h-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LOGIN_IMAGE}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Overlay gradient + branding */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent flex flex-col justify-end px-10 pb-12">
            <p className="text-white/70 text-sm tracking-wide mb-1">Welcome back to</p>
            <p className="text-white text-3xl font-black tracking-tight leading-tight">OpusFesta</p>
            <p className="text-white/40 text-xs tracking-widest uppercase mt-4">Your day. Your way.</p>
          </div>
        </div>

        {/* ── Right form panel ── */}
        <div className="flex flex-col bg-white overflow-y-auto w-full md:w-[60%]" data-lenis-prevent>
          {/* Header */}
          <div className="shrink-0 flex items-center justify-between px-6 pt-14 pb-8 max-w-2xl mx-auto w-full">
            <div className="flex-1" />
            <button data-opus-button="control"
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors shrink-0"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Clerk SignIn */}
          <div className="px-8 pt-2 pb-4 max-w-2xl mx-auto w-full">
            <div className="mb-5">
              <h2 className="text-2xl font-bold text-[#1A1A1A] leading-tight mb-1">
                Welcome back.
              </h2>
              <p className="text-sm text-gray-500">Sign in with Google, Apple, or your email.</p>
            </div>

            <SignIn
              routing="hash"
              appearance={{
                elements: {
                  rootBox: 'w-full',
                  card: 'shadow-none p-0 bg-transparent',
                  headerTitle: 'hidden',
                  headerSubtitle: 'hidden',
                  socialButtonsBlockButton:
                    'rounded-xl border border-gray-200 font-semibold text-[#1A1A1A] hover:bg-gray-50',
                  dividerLine: 'bg-gray-200',
                  dividerText: 'text-gray-400 text-xs',
                  formFieldInput:
                    'rounded-xl border-gray-200 focus:border-[#1A1A1A] text-sm py-4',
                  formButtonPrimary:
                    'rounded-full bg-[#1A1A1A] hover:bg-black/80 text-sm font-bold',
                  footerActionLink: 'text-[#1A1A1A] font-semibold',
                  formFieldInputShowPasswordButton: 'text-gray-400 hover:text-[#1A1A1A]',
                  identityPreviewText: 'text-sm text-gray-600',
                  formResendCodeLink: 'text-[#1A1A1A]',
                  forgotPasswordLink: 'text-[#1A1A1A] font-semibold text-sm',
                },
              }}
              fallbackRedirectUrl="/"
              signUpUrl="#"
            />

            <p className="text-sm text-gray-500 text-center mt-6">
              Don&apos;t have an account?{' '}
              <button data-opus-button="control"
                type="button"
                onClick={onSwitchToSignup}
                className="font-semibold text-[#1A1A1A] hover:underline"
              >
                Get started
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
