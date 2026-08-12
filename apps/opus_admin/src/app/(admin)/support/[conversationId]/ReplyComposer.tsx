'use client'

import { useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Send, Sparkles } from 'lucide-react'

const CANNED: Array<{ label: string; text: string }> = [
  { label: 'Greeting', text: 'Hi! Thanks for reaching out. I am looking into this for you now.' },
  { label: 'Ask details', text: 'Could you share your event date and any booking details so I can help faster?' },
  { label: 'Escalating', text: 'I have passed this to the right team and will update you here shortly.' },
  { label: 'Anything else', text: 'Is there anything else I can help you with?' },
]

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button data-opus-button="primary" data-opus-button-size="medium"
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-full bg-[#7E5896] px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-[#6d4a83] disabled:opacity-50"
    >
      <Send className="h-4 w-4" />
      {pending ? 'Sending...' : 'Send reply'}
    </button>
  )
}

export default function ReplyComposer({
  action,
  conversationId,
  contactEmail,
}: {
  action: (formData: FormData) => void
  conversationId: string
  contactEmail: string | null
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [body, setBody] = useState('')

  function insert(text: string) {
    setBody((b) => (b.trim() ? `${b.trim()} ${text}` : text))
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      if (body.trim()) formRef.current?.requestSubmit()
    }
  }

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={() => setBody('')}
      className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
    >
      <input type="hidden" name="conversationId" value={conversationId} />

      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400">
          <Sparkles className="h-3 w-3" /> Quick replies
        </span>
        {CANNED.map((c) => (
          <button data-opus-button="neutral" data-opus-button-size="small"
            key={c.label}
            type="button"
            onClick={() => insert(c.text)}
            className="rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-[#C9A0DC] hover:bg-[#F0DFF6] hover:text-[#7E5896]"
          >
            {c.label}
          </button>
        ))}
      </div>

      <textarea
        name="body"
        required
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Reply to the customer..."
        className="w-full resize-y rounded-xl border border-gray-200 p-3 text-sm text-[#1A1A1A] outline-none transition-colors focus:border-[#C9A0DC] focus:ring-2 focus:ring-[#F0DFF6]"
      />

      <div className="mt-2.5 flex items-center justify-between gap-3">
        <p className="text-xs text-gray-400">
          {contactEmail ? (
            <>
              Also emailed to <span className="font-medium text-gray-500">{contactEmail}</span>
            </>
          ) : (
            'No email on file; the reply shows in their chat widget.'
          )}{' '}
          <span className="text-gray-300">·</span> <kbd className="font-sans">⌘/Ctrl+Enter</kbd> to send
        </p>
        <SubmitButton />
      </div>
    </form>
  )
}
