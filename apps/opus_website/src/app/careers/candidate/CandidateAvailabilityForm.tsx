'use client'

import { useState } from 'react'
import { submitCandidateAvailability } from './actions'

function zonedLocalToIso(value: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value); if (!match) return ''
  const desired = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])); let guess = desired
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  for (let index = 0; index < 3; index += 1) { const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value])); const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute)); guess += desired - represented }
  return new Date(guess).toISOString()
}

export default function CandidateAvailabilityForm({ applicationId, defaultTimezone }: { applicationId: string; defaultTimezone: string }) {
  const [timezone, setTimezone] = useState(defaultTimezone)
  return <form action={submitCandidateAvailability.bind(null, applicationId)} onSubmit={(event) => { const form = event.currentTarget; const start = (form.elements.namedItem('starts_at_local') as HTMLInputElement).value; const end = (form.elements.namedItem('ends_at_local') as HTMLInputElement).value; (form.elements.namedItem('starts_at_iso') as HTMLInputElement).value = zonedLocalToIso(start, timezone); (form.elements.namedItem('ends_at_iso') as HTMLInputElement).value = zonedLocalToIso(end, timezone) }} className="mt-4 grid gap-2 sm:grid-cols-2"><input type="hidden" name="starts_at_iso" /><input type="hidden" name="ends_at_iso" /><input name="starts_at_local" type="datetime-local" required aria-label="Available from" className="rounded-lg border border-gray-200 px-2 py-2 text-sm" /><input name="ends_at_local" type="datetime-local" required aria-label="Available until" className="rounded-lg border border-gray-200 px-2 py-2 text-sm" /><select name="timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} aria-label="Time zone" className="rounded-lg border border-gray-200 px-2 py-2 text-sm"><option value="Africa/Dar_es_Salaam">Africa/Dar es Salaam</option><option value="Africa/Nairobi">Africa/Nairobi</option><option value="Africa/Kampala">Africa/Kampala</option><option value="UTC">UTC</option><option value="Europe/London">Europe/London</option><option value="America/New_York">America/New York</option><option value="America/Vancouver">America/Vancouver</option></select><button className="rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white">Share availability</button></form>
}
