// Schema / fallback for the OpusPass public navbar's GUESTS & RSVP's mega-menu.
// Moved out of the "Site UI" navbar area into the Guests & RSVPs product CMS
// group. Stored as one website_page_sections row:
//   page_key 'opus-pass-guests', section_key 'navbar'.
//
// Merged back into the public 'navbar' namespace at read time — see
// apps/opus_pass/src/lib/cms/ui-strings.ts NAVBAR_SOURCES.
//
// Fallback English values + labels/maxes preserved verbatim from the original
// UI_STRINGS_SCHEMA/UI_STRINGS_FALLBACK navbar groups.

import type { MaybeLocalized } from '@/lib/cms/localized'
import type { CopyFieldGroup } from '@/lib/cms/opus-pass-dashboard-copy'

export const GUESTS_NAVBAR_PAGE_KEY = 'opus-pass-guests'
export const NAVBAR_SECTION_KEY = 'navbar'

export const GUESTS_NAVBAR_FALLBACK: Record<string, MaybeLocalized> = {
  nav_guests: "Guests & RSVP's",
  mega_guests_title: 'GUESTS & RSVPS',
  mega_guests_desc:
    'Send digital invites by WhatsApp or SMS and watch RSVPs roll in live.',
  mega_guests_cta: 'Manage your guests',
  guests_col_manage: 'Manage',
  guests_col_resources: 'Resources',
  guests_link_list_manager: 'Guest List Manager',
  guests_link_rsvp_tracking: 'RSVP Tracking',
  guests_link_whatsapp_sms: 'WhatsApp & SMS Send',
  guests_link_seating: 'Seating Chart',
  guests_link_rsvp_wording: 'RSVP Wording Ideas',
  guests_link_etiquette: 'Guest Etiquette Tips',
  guests_grid_title: 'Guest Tools',
  guests_grid_guest_list: 'Guest List',
  guests_grid_rsvp_tracking: 'RSVP Tracking',
  guests_grid_invitations: 'Digital Cards',
  guests_grid_seating_plan: 'Seating Plan',
  mega_guests_image: '/assets/images/mauzo_crew.jpg',
  guests_grid_guest_list_image: '/assets/images/mauzo_crew.jpg',
  guests_grid_rsvp_tracking_image: '/assets/images/churchcouples.jpg',
  guests_grid_invitations_image: '/assets/images/cutesy_couple.jpg',
  guests_grid_seating_plan_image: '/assets/images/couples_together.jpg',
}

export const GUESTS_NAVBAR_SCHEMA: CopyFieldGroup[] = [
  {
    legend: 'Top nav label',
    fields: [{ key: 'nav_guests', label: "Guests & RSVP's", kind: 'text', max: 40 }],
  },
  {
    legend: 'Mega-menu card',
    fields: [
      { key: 'mega_guests_title', label: 'Card title', kind: 'text', max: 40 },
      { key: 'mega_guests_desc', label: 'Card description', kind: 'textarea', max: 160 },
      { key: 'mega_guests_cta', label: 'Card link', kind: 'text', max: 40 },
      {
        key: 'mega_guests_image',
        label: 'Card image',
        kind: 'image',
        pathPrefix: 'opus-pass/navbar/guests',
      },
    ],
  },
  {
    legend: 'Columns & links',
    fields: [
      { key: 'guests_col_manage', label: 'Manage column heading', kind: 'text', max: 30 },
      { key: 'guests_col_resources', label: 'Resources column heading', kind: 'text', max: 30 },
      { key: 'guests_link_list_manager', label: 'Link — Guest List Manager', kind: 'text', max: 40 },
      { key: 'guests_link_rsvp_tracking', label: 'Link — RSVP Tracking', kind: 'text', max: 40 },
      { key: 'guests_link_whatsapp_sms', label: 'Link — WhatsApp & SMS Send', kind: 'text', max: 40 },
      { key: 'guests_link_seating', label: 'Link — Seating Chart', kind: 'text', max: 40 },
      { key: 'guests_link_rsvp_wording', label: 'Link — RSVP Wording Ideas', kind: 'text', max: 40 },
      { key: 'guests_link_etiquette', label: 'Link — Guest Etiquette Tips', kind: 'text', max: 40 },
    ],
  },
  {
    legend: 'Photo grid',
    fields: [
      { key: 'guests_grid_title', label: 'Photo grid heading', kind: 'text', max: 30 },
      { key: 'guests_grid_guest_list', label: 'Photo — Guest List', kind: 'text', max: 30 },
      {
        key: 'guests_grid_guest_list_image',
        label: 'Photo image — Guest List',
        kind: 'image',
        pathPrefix: 'opus-pass/navbar/guests',
      },
      { key: 'guests_grid_rsvp_tracking', label: 'Photo — RSVP Tracking', kind: 'text', max: 30 },
      {
        key: 'guests_grid_rsvp_tracking_image',
        label: 'Photo image — RSVP Tracking',
        kind: 'image',
        pathPrefix: 'opus-pass/navbar/guests',
      },
      { key: 'guests_grid_invitations', label: 'Photo — Digital Cards', kind: 'text', max: 30 },
      {
        key: 'guests_grid_invitations_image',
        label: 'Photo image — Digital Cards',
        kind: 'image',
        pathPrefix: 'opus-pass/navbar/guests',
      },
      { key: 'guests_grid_seating_plan', label: 'Photo — Seating Plan', kind: 'text', max: 30 },
      {
        key: 'guests_grid_seating_plan_image',
        label: 'Photo image — Seating Plan',
        kind: 'image',
        pathPrefix: 'opus-pass/navbar/guests',
      },
    ],
  },
]
