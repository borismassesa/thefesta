'use client'

import { useState, useTransition } from 'react'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { submitContactMessage } from './actions'

// Topic pills mirror the real Help Centre categories (apps/opus_pass/src/app/(content)/help/page.tsx)
// so a visitor picks something that maps to an actual part of the product —
// plus one open-ended catch-all for anything else.
const TOPICS = [
  'Getting started',
  'Pricing & payments',
  'Digital cards',
  'Guests & RSVPs',
  'Wedding website',
  'Something else',
] as const

const fieldClass =
  'block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[14px] text-[#1A1A1A] placeholder:text-gray-400 transition focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/25'

export default function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [topic, setTopic] = useState<string>('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await submitContactMessage({ name, email, topic, message })
      if (result.ok) {
        setDone(true)
      } else {
        setError(result.error)
      }
    })
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white p-10 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#F2EFE9] text-[#5C6B4D]">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="mt-4 font-serif text-xl text-[#403d39]">Thanks — your message is in.</h2>
        <p className="mt-2 max-w-sm text-[14px] text-gray-600 leading-relaxed">
          We’ll reply to {email || 'your email'} within one business day.
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8"
    >
      <h2 className="font-serif text-xl text-[#403d39]">Tell us what’s going on.</h2>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-name" className="text-[13px] font-medium text-gray-700">
            Your name
          </label>
          <input
            id="contact-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Amina Juma"
            required
            className={`mt-1.5 ${fieldClass}`}
          />
        </div>
        <div>
          <label htmlFor="contact-email" className="text-[13px] font-medium text-gray-700">
            Your email address
          </label>
          <input
            id="contact-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            required
            className={`mt-1.5 ${fieldClass}`}
          />
        </div>
      </div>

      <p className="mt-5 text-[13px] font-medium text-gray-700">
        What&apos;s this about? <span className="font-normal text-gray-400">(optional)</span>
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {TOPICS.map((option) => {
          const active = topic === option
          return (
            <button data-opus-button="control"
              key={option}
              type="button"
              onClick={() => setTopic(active ? '' : option)}
              aria-pressed={active}
              className={`rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors ${
                active
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              {option}
            </button>
          )
        })}
      </div>

      <div className="mt-5">
        <label htmlFor="contact-message" className="text-[13px] font-medium text-gray-700">
          Your message
        </label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us what you need help with."
          required
          rows={4}
          className={`mt-1.5 resize-y ${fieldClass}`}
        />
      </div>

      {error && (
        <p className="mt-4 text-[13px] font-medium text-red-600">{error}</p>
      )}

      <button data-opus-button="primary" data-opus-button-size="large"
        type="submit"
        disabled={pending}
        className="mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[#1A1A1A] px-6 py-3.5 text-[14px] font-bold text-white transition-colors hover:bg-gray-800 disabled:opacity-60"
      >
        {pending ? 'Sending…' : 'Send your request'}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
      <p className="mt-3 text-center text-[12px] text-gray-500">
        Replies within one business day.
      </p>
    </form>
  )
}
