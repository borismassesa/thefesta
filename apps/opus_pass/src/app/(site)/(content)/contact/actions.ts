'use server'

import { sendEmail, isEmailConfigured } from '@/lib/email'

export type ContactSubmission = {
  name: string
  email: string
  topic: string
  message: string
}

export type ContactResult = { ok: true } | { ok: false; error: string }

const CONTACT_INBOX = process.env.CONTACT_INBOX_EMAIL || 'hello@opusfesta.com'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export async function submitContactMessage(input: ContactSubmission): Promise<ContactResult> {
  const name = input.name.trim()
  const email = input.email.trim()
  const message = input.message.trim()
  const topic = input.topic.trim()

  if (!name || !email || !message) {
    return { ok: false, error: 'Please fill in your name, email and message.' }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'That email address doesn’t look right.' }
  }
  if (!isEmailConfigured()) {
    return {
      ok: false,
      error: 'Email delivery isn’t configured yet — please reach us via WhatsApp or email directly.',
    }
  }

  const subject = topic ? `New contact form message — ${topic}` : 'New contact form message'
  const html = `
    <p><strong>Name:</strong> ${escapeHtml(name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    ${topic ? `<p><strong>Topic:</strong> ${escapeHtml(topic)}</p>` : ''}
    <p><strong>Message:</strong></p>
    <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
  `
  const text = `Name: ${name}\nEmail: ${email}${topic ? `\nTopic: ${topic}` : ''}\n\nMessage:\n${message}`

  const result = await sendEmail({
    to: CONTACT_INBOX,
    subject,
    html,
    text,
    replyTo: email,
  })

  if (!result.sent) {
    return { ok: false, error: 'Something went wrong sending your message. Please try again or email us directly.' }
  }
  return { ok: true }
}
