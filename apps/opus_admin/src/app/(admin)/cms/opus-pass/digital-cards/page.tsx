import { redirect } from 'next/navigation'

export default function OpusPassDigitalCardsCmsRoot() {
  // Land on the first real tab. There is no `hero` route under invitations —
  // redirecting there 404'd the whole section on entry.
  redirect('/cms/opus-pass/digital-cards/products')
}
