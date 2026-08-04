// Shared types / fallbacks / page-key map + field schema for the OpusPass couple
// dashboard "Page copy" CMS sections (one per dashboard page). The hero banner of
// each page is handled separately in ./opus-pass-dashboard-hero.ts.
//
// Editor (schema-driven, one component for all pages):
//   apps/opus_admin/src/app/(admin)/cms/opus-pass/dashboard/[page]/copy/
// Public loader on the OpusPass side:
//   apps/opus_pass/src/lib/cms/dashboard-copy.ts
//
// The content for every page is a flat record of string fields. The editor
// renders fields generically from COPY_FIELD_SCHEMA, so adding/removing a field
// is just an edit to the fallback + schema here (and the public consumer).

import type { MaybeLocalized } from '@/lib/cms/localized'

export type DashboardCopySlug =
  | 'home'
  | 'invitations'
  | 'guests'
  | 'rsvps'
  | 'website'
  | 'pledges'

// Each copy field is translatable: stored as a localized { en, sw } object (or a
// legacy plain string). The editor reads/writes this shape via <BilingualField>.
export type DashboardCopyContent = Record<string, MaybeLocalized>

export type DashboardCopyRow = {
  id: string
  page_key: string
  section_key: string
  content: DashboardCopyContent
  draft_content: DashboardCopyContent | null
  is_published: boolean
  updated_at: string
}

export const DASHBOARD_COPY_FALLBACK: Record<DashboardCopySlug, DashboardCopyContent> = {
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
      'Columns we recognize: Name / Jina, Phone / Namba ya Simu, Email / Barua Pepe. We import guest rows from every sheet and use the first row as a header if it looks like one.',
    import_rules_title: 'What your file needs',
    import_rules_items: [
      'One guest per row. A couple invited together is one row, not two.',
      'A header row naming the columns: Name / Jina, Phone / Namba ya Simu, Email / Barua Pepe. Extra columns are ignored.',
      'A name on every row. Rows without one are skipped.',
      'The phone column formatted as Text, so the leading 0 survives.',
      'One number per row, never repeated. A number already on the list is skipped.',
      'An empty cell where there is no number. Do not type N/A or Hakuna namba.',
      'A full country code for guests abroad, like +254712345678.',
      'Test and draft tabs deleted. Every tab with a header row is imported.',
    ].join('\n'),
    import_rules_note:
      'Everyone imports as a Single ticket. Mark the Double tickets here once the upload is done.',
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

export const DASHBOARD_COPY_PUBLIC_PATH: Record<DashboardCopySlug, string> = {
  home: '/my/dashboard',
  invitations: '/my/dashboard/invitations',
  guests: '/my/dashboard/guests',
  rsvps: '/my/dashboard/rsvps',
  website: '/my/dashboard/website',
  pledges: '/my/dashboard/pledges',
}

export const DASHBOARD_COPY_LABEL: Record<DashboardCopySlug, string> = {
  home: 'Dashboard home',
  invitations: 'Digital Cards',
  guests: 'Guest list',
  rsvps: 'RSVPs',
  website: 'Wedding website',
  pledges: 'Pledges',
}

export const DASHBOARD_COPY_SLUGS: readonly DashboardCopySlug[] = [
  'home',
  'invitations',
  'guests',
  'rsvps',
  'website',
  'pledges',
] as const

export function isDashboardCopySlug(value: string): value is DashboardCopySlug {
  return (DASHBOARD_COPY_SLUGS as readonly string[]).includes(value)
}

// ── Field schema that drives the generic editor ──────────────────────────────

export type CopyFieldKind = 'text' | 'textarea' | 'list' | 'image'

export type CopyField = {
  key: string
  label: string
  kind: CopyFieldKind
  max?: number
  hint?: string
  /** Storage path prefix for `kind: 'image'` fields — e.g. 'opus-pass/navbar/invitations'. */
  pathPrefix?: string
}

export type CopyFieldGroup = {
  legend: string
  fields: CopyField[]
}

export const COPY_FIELD_SCHEMA: Record<DashboardCopySlug, CopyFieldGroup[]> = {
  home: [
    {
      legend: 'Header',
      fields: [{ key: 'manage_guests_cta', label: 'Header button', kind: 'text', max: 40 }],
    },
    {
      legend: 'Empty state (no events or guests yet)',
      fields: [
        { key: 'empty_title', label: 'Title', kind: 'text', max: 80 },
        { key: 'empty_description', label: 'Description', kind: 'textarea', max: 240 },
        { key: 'empty_event_cta', label: 'Primary button', kind: 'text', max: 40 },
        { key: 'empty_guests_cta', label: 'Secondary button', kind: 'text', max: 40 },
      ],
    },
    {
      legend: 'Stat cards',
      fields: [
        { key: 'stat_guests', label: 'Guests label', kind: 'text', max: 30 },
        { key: 'stat_attending', label: 'Attending label', kind: 'text', max: 30 },
        {
          key: 'stat_attending_hint',
          label: 'Attending hint',
          kind: 'text',
          max: 60,
          hint: '{n} = expected headcount',
        },
        { key: 'stat_declined', label: 'Declined label', kind: 'text', max: 30 },
        { key: 'stat_pending', label: 'Awaiting label', kind: 'text', max: 30 },
      ],
    },
    {
      legend: 'Response & meals',
      fields: [
        { key: 'response_title', label: 'Response title', kind: 'text', max: 40 },
        {
          key: 'response_subtitle',
          label: 'Response subtitle',
          kind: 'text',
          max: 60,
          hint: '{rate} = % answered',
        },
        { key: 'meal_title', label: 'Meal choices title', kind: 'text', max: 40 },
        { key: 'meal_empty', label: 'No meals message', kind: 'text', max: 60 },
      ],
    },
    {
      legend: 'Upcoming events',
      fields: [
        { key: 'upcoming_title', label: 'Section title', kind: 'text', max: 40 },
        { key: 'upcoming_view_all', label: 'View-all link', kind: 'text', max: 30 },
        { key: 'upcoming_empty_title', label: 'Empty title', kind: 'text', max: 60 },
        { key: 'upcoming_empty_cta', label: 'Empty button', kind: 'text', max: 40 },
      ],
    },
    {
      legend: 'Recent responses',
      fields: [
        { key: 'recent_title', label: 'Section title', kind: 'text', max: 40 },
        { key: 'recent_view_all', label: 'View-all link', kind: 'text', max: 30 },
        { key: 'recent_empty_title', label: 'Empty title', kind: 'text', max: 60 },
        { key: 'recent_empty_description', label: 'Empty description', kind: 'textarea', max: 160 },
        { key: 'recent_empty_cta', label: 'Empty button', kind: 'text', max: 40 },
      ],
    },
    {
      legend: 'Bottom call-to-action',
      fields: [
        { key: 'cta_title', label: 'Title', kind: 'text', max: 80 },
        { key: 'cta_description', label: 'Description', kind: 'textarea', max: 200 },
        { key: 'cta_button', label: 'Button', kind: 'text', max: 40 },
      ],
    },
  ],
  invitations: [
    {
      legend: 'Empty state — no guests',
      fields: [
        { key: 'empty_no_guests_title', label: 'Title', kind: 'text', max: 80 },
        { key: 'empty_no_guests_description', label: 'Description', kind: 'textarea', max: 200 },
        { key: 'empty_no_guests_cta', label: 'Button', kind: 'text', max: 40 },
      ],
    },
    {
      legend: 'Empty state — no one invited',
      fields: [
        { key: 'empty_not_invited_title', label: 'Title', kind: 'text', max: 80 },
        { key: 'empty_not_invited_description', label: 'Description', kind: 'textarea', max: 200 },
        { key: 'empty_not_invited_cta', label: 'Button', kind: 'text', max: 40 },
      ],
    },
    {
      legend: 'Guest rows & messages',
      fields: [
        { key: 'not_invited_link', label: 'Not-invited link', kind: 'text', max: 40 },
        { key: 'sent_label', label: 'Sent label', kind: 'text', max: 20 },
        { key: 'not_sent', label: 'Not-sent label', kind: 'text', max: 30 },
        { key: 'toast_copied', label: 'Link-copied toast', kind: 'text', max: 40 },
      ],
    },
  ],
  guests: [
    {
      legend: 'Header & search',
      fields: [
        { key: 'add_guests_cta', label: 'Header button', kind: 'text', max: 40 },
        { key: 'upload_spreadsheet_cta', label: 'Upload button', kind: 'text', max: 40 },
        { key: 'filter_label', label: 'Filter button', kind: 'text', max: 30 },
        { key: 'search_placeholder', label: 'Search placeholder', kind: 'text', max: 60 },
        { key: 'no_match_title', label: 'No-match message', kind: 'text', max: 60 },
        { key: 'import_title', label: 'Import modal title', kind: 'text', max: 40 },
      ],
    },
    {
      legend: 'Spreadsheet upload',
      fields: [
        { key: 'import_upload_title', label: 'Upload box title', kind: 'text', max: 60 },
        { key: 'import_upload_hint', label: 'Upload box hint', kind: 'textarea', max: 260 },
        { key: 'import_rules_title', label: 'Requirements heading', kind: 'text', max: 60 },
        {
          key: 'import_rules_items',
          label: 'Requirements',
          kind: 'list',
          hint: 'One requirement per line',
        },
        { key: 'import_rules_note', label: 'Requirements footnote', kind: 'textarea', max: 200 },
      ],
    },
    {
      legend: 'Toasts',
      fields: [
        { key: 'toast_added', label: 'Guest-added', kind: 'text', max: 40 },
        { key: 'toast_updated', label: 'Guest-updated', kind: 'text', max: 40 },
        { key: 'toast_removed', label: 'Guest-removed', kind: 'text', max: 40 },
      ],
    },
    {
      legend: 'Sub-navigation tabs',
      fields: [
        { key: 'nav_manage', label: 'Manage tab', kind: 'text', max: 30 },
        { key: 'nav_collector', label: 'Contact Collector tab', kind: 'text', max: 30 },
        { key: 'nav_pledges', label: 'Pledges tab', kind: 'text', max: 30 },
        { key: 'nav_rsvps', label: 'Track RSVPs tab', kind: 'text', max: 30 },
      ],
    },
    {
      legend: 'Headcount tiles',
      fields: [
        { key: 'stat_guests_label', label: 'Guests label', kind: 'text', max: 30 },
        { key: 'stat_adults_label', label: 'Adults label', kind: 'text', max: 30 },
        { key: 'stat_children_label', label: 'Children label', kind: 'text', max: 30 },
      ],
    },
    {
      legend: 'Contact Collector card',
      fields: [
        { key: 'collector_heading', label: 'Heading', kind: 'text', max: 40 },
        { key: 'collector_edit', label: 'Edit link', kind: 'text', max: 20 },
        { key: 'collector_empty', label: 'No-link message', kind: 'text', max: 100 },
        { key: 'collector_customize', label: 'Customize button', kind: 'text', max: 30 },
        { key: 'collector_copy', label: 'Copy-link button', kind: 'text', max: 30 },
        { key: 'collector_setup', label: 'Set-up button', kind: 'text', max: 30 },
      ],
    },
    {
      legend: 'Empty state (no guests yet)',
      fields: [
        { key: 'empty_title', label: 'Title', kind: 'text', max: 80 },
        { key: 'empty_description', label: 'Description', kind: 'textarea', max: 240 },
        { key: 'empty_add_cta', label: 'Add button', kind: 'text', max: 40 },
        { key: 'empty_upload_cta', label: 'Upload button', kind: 'text', max: 40 },
        { key: 'empty_collect_cta', label: 'Collect button', kind: 'text', max: 40 },
      ],
    },
  ],
  rsvps: [
    {
      legend: 'Header, search & filters',
      fields: [
        { key: 'export_cta', label: 'Export button', kind: 'text', max: 40 },
        { key: 'search_placeholder', label: 'Search placeholder', kind: 'text', max: 60 },
        { key: 'filter_all_events', label: 'All-events option', kind: 'text', max: 40 },
        { key: 'clear_filters', label: 'Clear-filters link', kind: 'text', max: 30 },
        { key: 'no_match_title', label: 'No-match message', kind: 'text', max: 60 },
        { key: 'toast_updated', label: 'RSVP-updated toast', kind: 'text', max: 40 },
      ],
    },
    {
      legend: 'Table headers',
      fields: [
        { key: 'th_guest', label: 'Guest column', kind: 'text', max: 20 },
        { key: 'th_event', label: 'Event column', kind: 'text', max: 20 },
        { key: 'th_status', label: 'Status column', kind: 'text', max: 20 },
        { key: 'th_party', label: 'Party column', kind: 'text', max: 20 },
        { key: 'th_meal', label: 'Meal/notes column', kind: 'text', max: 30 },
      ],
    },
    {
      legend: 'Empty state (no invitations yet)',
      fields: [
        { key: 'empty_title', label: 'Title', kind: 'text', max: 80 },
        { key: 'empty_description', label: 'Description', kind: 'textarea', max: 200 },
      ],
    },
  ],
  website: [
    {
      legend: 'Build-your-website card',
      fields: [
        { key: 'browse_chip', label: 'Header chip', kind: 'text', max: 40 },
        { key: 'build_title', label: 'Title', kind: 'text', max: 80 },
        { key: 'build_description', label: 'Description', kind: 'textarea', max: 280 },
        { key: 'build_primary_cta', label: 'Primary button', kind: 'text', max: 40 },
        { key: 'build_secondary_cta', label: 'Secondary button', kind: 'text', max: 40 },
      ],
    },
    {
      legend: 'What you get',
      fields: [
        { key: 'benefits_title', label: 'Title', kind: 'text', max: 40 },
        {
          key: 'benefits_items',
          label: 'Features',
          kind: 'list',
          hint: 'One feature per line',
        },
      ],
    },
    {
      legend: 'Coming-soon notice',
      fields: [
        { key: 'coming_soon_title', label: 'Title', kind: 'text', max: 80 },
        { key: 'coming_soon_description', label: 'Description', kind: 'textarea', max: 200 },
      ],
    },
  ],
  pledges: [
    {
      legend: 'Header & search',
      fields: [
        { key: 'add_pledge_cta', label: 'Header button', kind: 'text', max: 40 },
        { key: 'no_match_title', label: 'No-match message', kind: 'text', max: 60 },
      ],
    },
    {
      legend: 'Sub-navigation tabs',
      fields: [
        { key: 'nav_manage', label: 'Pledges tab', kind: 'text', max: 30 },
        { key: 'nav_invite', label: 'Share & preview tab', kind: 'text', max: 30 },
        { key: 'nav_collection', label: 'Collection tab', kind: 'text', max: 30 },
        { key: 'nav_followups', label: 'Follow-ups tab', kind: 'text', max: 30 },
        { key: 'nav_reports', label: 'Reports tab', kind: 'text', max: 30 },
      ],
    },
    {
      legend: 'Filter views',
      fields: [
        { key: 'view_all', label: 'All pledges', kind: 'text', max: 30 },
        { key: 'view_awaiting', label: 'Awaiting pledge', kind: 'text', max: 30 },
        { key: 'view_pledged', label: 'Pledged', kind: 'text', max: 30 },
        { key: 'view_partial', label: 'Partly paid', kind: 'text', max: 30 },
        { key: 'view_paid', label: 'Paid', kind: 'text', max: 30 },
        { key: 'view_cards', label: 'Cards to prepare', kind: 'text', max: 30 },
      ],
    },
    {
      legend: 'Collection settings',
      fields: [
        { key: 'collection_title', label: 'Section title', kind: 'text', max: 40 },
        { key: 'collection_desc', label: 'Section description', kind: 'textarea', max: 160 },
        { key: 'goal_title', label: 'Goal title', kind: 'text', max: 40 },
        { key: 'goal_desc', label: 'Goal description', kind: 'textarea', max: 160 },
        { key: 'howtopay_title', label: 'How-to-pay title', kind: 'text', max: 40 },
        { key: 'howtopay_desc', label: 'How-to-pay description', kind: 'textarea', max: 160 },
      ],
    },
    {
      legend: 'Toasts',
      fields: [
        { key: 'toast_added', label: 'Pledge-added', kind: 'text', max: 40 },
        { key: 'toast_payment', label: 'Payment-recorded', kind: 'text', max: 40 },
      ],
    },
    {
      legend: 'Empty state (no pledges yet)',
      fields: [
        { key: 'empty_title', label: 'Title', kind: 'text', max: 80 },
        { key: 'empty_description', label: 'Description', kind: 'textarea', max: 280 },
        { key: 'empty_cta', label: 'Button', kind: 'text', max: 40 },
      ],
    },
    {
      legend: 'Share your link',
      fields: [
        { key: 'share_title', label: 'Title', kind: 'text', max: 80 },
        { key: 'share_description', label: 'Description', kind: 'textarea', max: 240 },
        { key: 'nolink_title', label: 'No-link title', kind: 'text', max: 80 },
        { key: 'nolink_description', label: 'No-link description', kind: 'textarea', max: 200 },
      ],
    },
    {
      legend: 'Follow-ups & reports empty states',
      fields: [
        { key: 'followups_empty_title', label: 'Follow-ups title', kind: 'text', max: 80 },
        {
          key: 'followups_empty_description',
          label: 'Follow-ups description',
          kind: 'textarea',
          max: 200,
        },
        { key: 'reports_empty_title', label: 'Reports title', kind: 'text', max: 80 },
        {
          key: 'reports_empty_description',
          label: 'Reports description',
          kind: 'textarea',
          max: 200,
        },
      ],
    },
  ],
}
