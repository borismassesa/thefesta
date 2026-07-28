// Schema / fallback for the OpusPass public navbar's INVITATIONS mega-menu.
// These strings used to live in the "Site UI" navbar area; they now belong to
// the Invitations product CMS group so the people who own that product own its
// nav copy. Stored as one website_page_sections row:
//   page_key 'opus-pass-invitations', section_key 'navbar'.
//
// The public navbar (apps/opus_pass) merges this row with the other product
// navbar rows + the shared chrome row back into one 'navbar' namespace at read
// time (see apps/opus_pass/src/lib/cms/ui-strings.ts NAVBAR_SOURCES).
//
// Fallback English values + labels/maxes are preserved verbatim from the
// original UI_STRINGS_SCHEMA/UI_STRINGS_FALLBACK navbar groups.

import type { MaybeLocalized } from '@/lib/cms/localized'
import type { CopyFieldGroup } from '@/lib/cms/opus-pass-dashboard-copy'

export const DIGITAL_CARDS_NAVBAR_PAGE_KEY = 'opus-pass-invitations'
export const NAVBAR_SECTION_KEY = 'navbar'

export const DIGITAL_CARDS_NAVBAR_FALLBACK: Record<string, MaybeLocalized> = {
  nav_invitations: 'Digital Cards',
  mega_inv_title: 'WEDDING INVITATIONS',
  mega_inv_desc:
    'Designer-worthy digital invitations for every wedding moment, sent by WhatsApp or SMS.',
  mega_inv_cta: 'Browse all designs',
  inv_col_browse: 'Browse',
  inv_col_resources: 'Resources',
  inv_link_all_designs: 'All Designs',
  inv_link_save_the_dates: 'Save the Dates',
  inv_link_wedding: 'Wedding Invitations',
  inv_link_send_off: 'Send-Off & Kitchen Party',
  inv_link_kadi: 'Kadi za Michango',
  inv_link_wording: 'Invitation Wording',
  inv_link_rsvp_wording: 'RSVP Wording Ideas',
  inv_grid_title: 'Wedding Paper',
  inv_grid_guest_list: 'Guest List',
  inv_grid_rsvp_tracking: 'RSVP Tracking',
  inv_grid_invitations: 'Digital Cards',
  inv_grid_seating_plan: 'Seating Plan',
  mega_inv_image:
    'https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=800&q=80',
  inv_grid_guest_list_image: '/assets/images/mauzo_crew.jpg',
  inv_grid_rsvp_tracking_image: '/assets/images/churchcouples.jpg',
  inv_grid_invitations_image: '/assets/images/cutesy_couple.jpg',
  inv_grid_seating_plan_image: '/assets/images/couples_together.jpg',
}

export const DIGITAL_CARDS_NAVBAR_SCHEMA: CopyFieldGroup[] = [
  {
    legend: 'Top nav label',
    fields: [{ key: 'nav_invitations', label: 'Digital Cards', kind: 'text', max: 40 }],
  },
  {
    legend: 'Mega-menu card',
    fields: [
      { key: 'mega_inv_title', label: 'Card title', kind: 'text', max: 40 },
      { key: 'mega_inv_desc', label: 'Card description', kind: 'textarea', max: 160 },
      { key: 'mega_inv_cta', label: 'Card link', kind: 'text', max: 40 },
      {
        key: 'mega_inv_image',
        label: 'Card image',
        kind: 'image',
        pathPrefix: 'opus-pass/navbar/invitations',
      },
    ],
  },
  {
    legend: 'Columns & links',
    fields: [
      { key: 'inv_col_browse', label: 'Browse column heading', kind: 'text', max: 30 },
      { key: 'inv_col_resources', label: 'Resources column heading', kind: 'text', max: 30 },
      { key: 'inv_link_all_designs', label: 'Link — All Designs', kind: 'text', max: 40 },
      { key: 'inv_link_save_the_dates', label: 'Link — Save the Dates', kind: 'text', max: 40 },
      { key: 'inv_link_wedding', label: 'Link — Wedding Invitations', kind: 'text', max: 40 },
      { key: 'inv_link_send_off', label: 'Link — Send-Off & Kitchen Party', kind: 'text', max: 40 },
      { key: 'inv_link_kadi', label: 'Link — Kadi za Michango', kind: 'text', max: 40 },
      { key: 'inv_link_wording', label: 'Link — Invitation Wording', kind: 'text', max: 40 },
      { key: 'inv_link_rsvp_wording', label: 'Link — RSVP Wording Ideas', kind: 'text', max: 40 },
    ],
  },
  {
    legend: 'Photo grid',
    fields: [
      { key: 'inv_grid_title', label: 'Photo grid heading', kind: 'text', max: 30 },
      { key: 'inv_grid_guest_list', label: 'Photo — Guest List', kind: 'text', max: 30 },
      {
        key: 'inv_grid_guest_list_image',
        label: 'Photo image — Guest List',
        kind: 'image',
        pathPrefix: 'opus-pass/navbar/invitations',
      },
      { key: 'inv_grid_rsvp_tracking', label: 'Photo — RSVP Tracking', kind: 'text', max: 30 },
      {
        key: 'inv_grid_rsvp_tracking_image',
        label: 'Photo image — RSVP Tracking',
        kind: 'image',
        pathPrefix: 'opus-pass/navbar/invitations',
      },
      { key: 'inv_grid_invitations', label: 'Photo — Digital Cards', kind: 'text', max: 30 },
      {
        key: 'inv_grid_invitations_image',
        label: 'Photo image — Digital Cards',
        kind: 'image',
        pathPrefix: 'opus-pass/navbar/invitations',
      },
      { key: 'inv_grid_seating_plan', label: 'Photo — Seating Plan', kind: 'text', max: 30 },
      {
        key: 'inv_grid_seating_plan_image',
        label: 'Photo image — Seating Plan',
        kind: 'image',
        pathPrefix: 'opus-pass/navbar/invitations',
      },
    ],
  },
]
