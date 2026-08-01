import { redirect } from 'next/navigation'

/**
 * Templates was a second list of the same cards, with its own detail page.
 *
 * Setting one card up therefore meant working across two top-level tabs, and
 * coming back landed on a list rather than on the card. Layer mapping now lives
 * under the card itself. Kept as a redirect so existing links and bookmarks
 * still arrive somewhere sensible.
 */
export default function TemplatesRedirect() {
  redirect('/opus-pass/digital-cards/cards')
}
