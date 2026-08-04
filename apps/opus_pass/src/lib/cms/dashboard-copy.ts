import { draftMode } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase'
import { DEFAULT_LOCALE, resolveLocalized, type Locale, type MaybeLocalized } from './localized'

// Public read side for the editable page-level copy on every OpusPass couple
// dashboard page (/my/dashboard/*). The hero banner of each page is handled
// separately in ./dashboard-hero.ts — this file covers everything else a
// content editor can tweak: empty states, CTA cards, section headings, stat
// labels, search placeholders and feature lists.
//
// Admin write side + field schema: apps/opus_admin/src/lib/cms/opus-pass-dashboard-copy.ts
// Editor: apps/opus_admin/src/app/(admin)/cms/opus-pass/dashboard/[page]/copy/
//
// BOUNDARY RULE: this file imports next/headers, so client components must
// import the *types* from here with `import type` only — never the loader or a
// FALLBACK value — or the Turbopack prod build breaks. Server components may
// call loadDashboardCopy() directly.

export interface HomeDashboardCopy {
  manage_guests_cta: string
  empty_title: string
  empty_description: string
  empty_event_cta: string
  empty_guests_cta: string
  stat_guests: string
  stat_attending: string
  stat_attending_hint: string
  stat_declined: string
  stat_pending: string
  response_title: string
  response_subtitle: string
  meal_title: string
  meal_empty: string
  upcoming_title: string
  upcoming_view_all: string
  upcoming_empty_title: string
  upcoming_empty_cta: string
  recent_title: string
  recent_view_all: string
  recent_empty_title: string
  recent_empty_description: string
  recent_empty_cta: string
  cta_title: string
  cta_description: string
  cta_button: string
}

export interface InvitationsDashboardCopy {
  empty_no_guests_title: string
  empty_no_guests_description: string
  empty_no_guests_cta: string
  empty_not_invited_title: string
  empty_not_invited_description: string
  empty_not_invited_cta: string
  not_invited_link: string
  sent_label: string
  not_sent: string
  toast_copied: string
}

export interface GuestsDashboardCopy {
  add_guests_cta: string
  empty_title: string
  empty_description: string
  empty_add_cta: string
  empty_upload_cta: string
  empty_collect_cta: string
  search_placeholder: string
  no_match_title: string
  upload_spreadsheet_cta: string
  stat_guests_label: string
  stat_adults_label: string
  stat_children_label: string
  nav_manage: string
  nav_collector: string
  nav_pledges: string
  nav_rsvps: string
  collector_heading: string
  collector_edit: string
  collector_empty: string
  collector_customize: string
  collector_copy: string
  collector_setup: string
  filter_label: string
  import_title: string
  import_upload_title: string
  import_upload_hint: string
  import_rules_title: string
  /** One rule per line; rendered as a bulleted list. */
  import_rules_items: string
  import_rules_note: string
  toast_added: string
  toast_updated: string
  toast_removed: string
}

export interface RsvpsDashboardCopy {
  export_cta: string
  empty_title: string
  empty_description: string
  no_match_title: string
  search_placeholder: string
  filter_all_events: string
  clear_filters: string
  toast_updated: string
  th_guest: string
  th_event: string
  th_status: string
  th_party: string
  th_meal: string
}

export interface WebsiteDashboardCopy {
  browse_chip: string
  build_title: string
  build_description: string
  build_primary_cta: string
  build_secondary_cta: string
  benefits_title: string
  /** One feature per line; rendered as a bulleted list. */
  benefits_items: string
  coming_soon_title: string
  coming_soon_description: string
}

export interface PledgesDashboardCopy {
  nav_manage: string
  nav_invite: string
  nav_collection: string
  nav_followups: string
  nav_reports: string
  view_all: string
  view_awaiting: string
  view_pledged: string
  view_partial: string
  view_paid: string
  view_cards: string
  collection_title: string
  collection_desc: string
  goal_title: string
  goal_desc: string
  howtopay_title: string
  howtopay_desc: string
  toast_added: string
  toast_payment: string
  add_pledge_cta: string
  empty_title: string
  empty_description: string
  empty_cta: string
  no_match_title: string
  followups_empty_title: string
  followups_empty_description: string
  reports_empty_title: string
  reports_empty_description: string
  nolink_title: string
  nolink_description: string
  share_title: string
  share_description: string
}

export type DashboardCopyBySlug = {
  home: HomeDashboardCopy
  invitations: InvitationsDashboardCopy
  guests: GuestsDashboardCopy
  rsvps: RsvpsDashboardCopy
  website: WebsiteDashboardCopy
  pledges: PledgesDashboardCopy
}

export type DashboardCopySlug = keyof DashboardCopyBySlug

export const DASHBOARD_COPY_FALLBACKS: DashboardCopyBySlug = {
  home: {
    manage_guests_cta: 'Manage guests',
    empty_title: "Let's set up your celebration",
    empty_description:
      'Add your events, then build your guest list and start sending invitations. Track every RSVP in one place.',
    empty_event_cta: 'Add an event',
    empty_guests_cta: 'Add guests',
    stat_guests: 'Guests',
    stat_attending: 'Attending',
    stat_attending_hint: '{n} expected to attend',
    stat_declined: 'Declined',
    stat_pending: 'Awaiting reply',
    response_title: 'Response progress',
    response_subtitle: '{rate}% of invitations answered',
    meal_title: 'Meal choices',
    meal_empty: 'No meal preferences yet',
    upcoming_title: 'Upcoming events',
    upcoming_view_all: 'View all',
    upcoming_empty_title: 'No upcoming events',
    upcoming_empty_cta: 'Add an event',
    recent_title: 'Recent responses',
    recent_view_all: 'View all',
    recent_empty_title: 'No responses yet',
    recent_empty_description: 'Send invitations to start collecting RSVPs.',
    recent_empty_cta: 'Send invites',
    cta_title: 'Ready to invite more guests?',
    cta_description:
      'Share personal RSVP links over WhatsApp, SMS or email — no app needed for guests.',
    cta_button: 'Send invitations',
  },
  invitations: {
    empty_no_guests_title: 'No guests to invite yet',
    empty_no_guests_description: 'Add guests and invite them to events first.',
    empty_no_guests_cta: 'Go to guest list',
    empty_not_invited_title: 'No one is invited to an event yet',
    empty_not_invited_description:
      'Open the guest list and tick which events each guest is invited to.',
    empty_not_invited_cta: 'Manage invitations',
    not_invited_link: 'Add them to events',
    sent_label: 'Sent',
    not_sent: 'Not sent yet',
    toast_copied: 'RSVP link copied',
  },
  guests: {
    add_guests_cta: 'Add guests',
    empty_title: 'Build your guest list',
    empty_description:
      'Add guests one by one, or upload a spreadsheet to import them in bulk. Each guest gets a personal RSVP link you can send by WhatsApp.',
    empty_add_cta: 'Add guests',
    empty_upload_cta: 'Upload spreadsheet',
    empty_collect_cta: 'Collect addresses',
    search_placeholder: 'Search guests…',
    no_match_title: 'No guests match your search',
    upload_spreadsheet_cta: 'Upload a spreadsheet',
    stat_guests_label: 'Guests',
    stat_adults_label: 'Adults',
    stat_children_label: 'Children',
    nav_manage: 'Manage guest list',
    nav_collector: 'Contact Collector',
    nav_pledges: 'Pledges',
    nav_rsvps: 'Track RSVPs',
    collector_heading: 'Your Contact Collector',
    collector_edit: 'Edit',
    collector_empty: 'No collector link yet — open Contact Collector to generate one.',
    collector_customize: 'Customize',
    collector_copy: 'Copy link',
    collector_setup: 'Set up',
    filter_label: 'Filter',
    import_title: 'Upload spreadsheet',
    import_upload_title: 'Upload a .csv or .xlsx file',
    import_upload_hint:
      'Required: Name / Jina. Optional: Phone / Namba ya Simu, Email / Barua Pepe, Ticket Type (Single or Double). Extra columns are ignored. Only sheets with a recognized Name header are imported.',
    import_rules_title: 'What your file needs',
    import_rules_items: [
      'One guest per row. A couple invited together is one row, not two.',
      'A header row with Name / Jina. Phone, Email and Ticket Type are optional; extra columns are ignored.',
      'A name on every row. Rows without one are skipped.',
      'The phone column formatted as Text, so the leading 0 survives.',
      'One number per row, never repeated. A number already on the list is skipped.',
      'An empty cell where there is no number. Do not type N/A or Hakuna namba.',
      'A full country code for guests abroad, like +254712345678.',
      'In a multi-sheet workbook, every sheet with a recognized Name / Jina header is imported; Review, Summary and Instructions sheets are skipped.',
    ].join('\n'),
    import_rules_note:
      'Use Single or Double in Ticket Type. Blank or unrecognized ticket values import as Single.',
    toast_added: 'Guest added',
    toast_updated: 'Guest updated',
    toast_removed: 'Guest removed',
  },
  rsvps: {
    export_cta: 'Export CSV',
    empty_title: 'No invitations yet',
    empty_description: 'Invite guests to your events to start tracking their RSVPs here.',
    no_match_title: 'No RSVPs match these filters',
    search_placeholder: 'Search by name, group, meal…',
    filter_all_events: 'All events',
    clear_filters: 'Clear filters',
    toast_updated: 'RSVP updated',
    th_guest: 'Guest',
    th_event: 'Event',
    th_status: 'Status',
    th_party: 'Party',
    th_meal: 'Meal / notes',
  },
  website: {
    browse_chip: 'Browse designs',
    build_title: 'Build your wedding website',
    build_description:
      'Pick a design, drop in your story and event details, and share one link with every guest. Bilingual, mobile-first and connected to your RSVPs automatically.',
    build_primary_cta: 'Browse designs',
    build_secondary_cta: 'Add an event first',
    benefits_title: 'What you get',
    benefits_items:
      'Story, schedule, travel and gifts\nLive RSVP from your guest list\nCustom cover photo or short video\nShareable on WhatsApp & SMS',
    coming_soon_title: 'Site builder coming soon',
    coming_soon_description:
      "In the meantime, set your cover above so it's ready the moment the builder lands.",
  },
  pledges: {
    nav_manage: 'Pledges',
    nav_invite: 'Share & preview',
    nav_collection: 'Pledge collection',
    nav_followups: 'Follow-ups',
    nav_reports: 'Reports',
    view_all: 'All pledges',
    view_awaiting: 'Awaiting pledge',
    view_pledged: 'Pledged',
    view_partial: 'Partly paid',
    view_paid: 'Paid',
    view_cards: 'Cards to prepare',
    collection_title: 'Pledge collection',
    collection_desc: 'How contributors pay you — shown on your pledge link and in reminders.',
    goal_title: 'Fundraising goal',
    goal_desc: 'Set a target and the Reports tab shows progress toward it. Leave blank for no goal.',
    howtopay_title: 'How to pay',
    howtopay_desc:
      'Mobile money or bank details contributors use to send their pledge. Add one per provider.',
    toast_added: 'Pledge added',
    toast_payment: 'Payment recorded',
    add_pledge_cta: 'Add pledge',
    empty_title: 'Start collecting pledges',
    empty_description:
      "Add the people you're reaching out to and the amount they pledge, then chase follow-ups until they pay. Share your pledge link to let people pledge themselves.",
    empty_cta: 'Add pledge',
    no_match_title: 'No pledges match this view',
    followups_empty_title: 'No follow-ups needed',
    followups_empty_description:
      'Every pledge is either fully paid or declined. Nice work chasing them down!',
    reports_empty_title: 'No data to report yet',
    reports_empty_description:
      "Once you've added some pledges, you'll see contribution totals and breakdowns here.",
    nolink_title: 'No pledge link yet',
    nolink_description:
      "Your shareable pledge link isn't ready. Refresh the page, or add a pledge to generate one.",
    share_title: 'Share your pledge link',
    share_description:
      'Post it in a family WhatsApp group, or send it directly. Anyone who opens it can pledge a contribution themselves — no app or sign-in needed.',
  },
}

export const DASHBOARD_COPY_PAGE_KEY: Record<DashboardCopySlug, string> = {
  home: 'opus-pass-dashboard-home',
  invitations: 'opus-pass-dashboard-invitations',
  guests: 'opus-pass-dashboard-guests',
  rsvps: 'opus-pass-dashboard-rsvps',
  website: 'opus-pass-dashboard-website',
  pledges: 'opus-pass-dashboard-pledges',
}

const SECTION_KEY = 'copy'

// Stored shape: every copy field is translatable, so a stored value may be a
// localized { en, sw } object OR a legacy plain string. Each key is resolved for
// `locale`; the RETURNED record stays flat strings (consumers are unchanged).
type StoredDashboardCopy = Record<string, MaybeLocalized>

export async function loadDashboardCopy<S extends DashboardCopySlug>(
  slug: S,
  locale: Locale = DEFAULT_LOCALE,
): Promise<DashboardCopyBySlug[S]> {
  const fallback = DASHBOARD_COPY_FALLBACKS[slug]
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fallback
  }
  try {
    const { isEnabled: isDraft } = await draftMode()
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('website_page_sections')
      .select('content, draft_content')
      .eq('page_key', DASHBOARD_COPY_PAGE_KEY[slug])
      .eq('section_key', SECTION_KEY)
      .maybeSingle()
    if (error) {
      console.error(`[opus-pass cms] dashboard-copy (${slug}) query failed`, error)
      return fallback
    }
    const stored = (isDraft ? data?.draft_content ?? data?.content : data?.content) as
      | StoredDashboardCopy
      | undefined
    if (stored) {
      // Resolve PER FIELD rather than spreading `{ ...fallback, ...stored }` —
      // a blind spread would leak stored LocalizedText objects into the string
      // consumers. Iterate the fallback's keys (the canonical field set) and for
      // each key resolve the stored value (or the fallback) for `locale`. The
      // fallback values are plain English strings, so resolveLocalized returns
      // them unchanged when nothing is stored.
      const resolved: Record<string, string> = {}
      for (const key of Object.keys(fallback) as (keyof DashboardCopyBySlug[S])[]) {
        const k = key as string
        resolved[k] = resolveLocalized(stored[k] ?? (fallback[key] as MaybeLocalized), locale)
      }
      // `resolved` is built from exactly the fallback's keys with string values,
      // so it matches the slug's flat copy type — but TS can't narrow a generic
      // Record to the keyed type, so cast through unknown.
      return resolved as unknown as DashboardCopyBySlug[S]
    }
    return fallback
  } catch (err) {
    console.error(`[opus-pass cms] dashboard-copy (${slug}) load failed`, err)
    return fallback
  }
}
