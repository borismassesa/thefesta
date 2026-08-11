'use client'

import { useState } from 'react'
import { MessageCircle } from 'lucide-react'

export function SmsOptIn() {
  const [phone, setPhone] = useState('')
  const [submitted, setSubmitted] = useState(false)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-6">
      <div className="w-10 h-10 rounded-xl bg-[#F0DFF6] text-[#7E5896] flex items-center justify-center">
        <MessageCircle className="w-5 h-5 stroke-[1.5]" />
      </div>
      <h3 className="text-[15px] font-semibold text-gray-900 mt-4">
        Never miss a lead — get WhatsApp alerts
      </h3>
      <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
        Share your number and we&apos;ll WhatsApp you the moment a couple inquires.
        Turn off any time.
      </p>

      {submitted ? (
        <div className="mt-4 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-medium px-3 py-2.5">
          Done — we&apos;ll message {phone} for new inquiries.
        </div>
      ) : (
        <form
          className="mt-4 space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (phone.trim()) setSubmitted(true)
          }}
        >
          <label className="block text-xs font-semibold text-gray-500">Phone number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+255 712 345 678"
            className="w-full border border-gray-200 bg-white rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all"
          />
          <button data-opus-button="primary" data-opus-button-size="medium"
            type="submit"
            className="w-full bg-gray-900 text-white text-sm font-semibold rounded-xl px-4 py-2.5 hover:bg-gray-800 transition-colors"
          >
            Get alerts
          </button>
        </form>
      )}
    </div>
  )
}
