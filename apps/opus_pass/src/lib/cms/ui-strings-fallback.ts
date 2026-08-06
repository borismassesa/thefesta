// PURE module (no next/headers, no server-only imports) for the OpusPass
// "Site UI" microcopy CMS — the editable, bilingual strings on the site chrome
// (navbar + footer). Because it's pure, BOTH the server loader
// (./ui-strings.ts) and the client provider
// (@/components/providers/UIStringsProvider) import the types + the English
// fallback values from here, without crossing the import-type boundary that
// guards the loader.
//
// Admin write side mirrors these values in
// apps/opus_admin/src/lib/cms/opus-pass-ui-strings.ts (dual-type convention —
// the two apps duplicate CMS types/fallbacks, no shared package).

export type UiArea =
  | 'navbar'
  | 'footer'
  | 'help'
  | 'pricing'
  | 'cart'
  | 'address'
  | 'confirmation'
  | 'checkout-form'
  | 'checkout-payment'
  | 'checkout-summary'
  | 'forms-collect'
  | 'forms-rsvp'
  | 'forms-pledge'
  | 'dashboard-chrome'
  | 'dashboard-orders'
  | 'dashboard-events'
  | 'dashboard-seating'
  | 'dashboard-send'
  | 'dashboard-thank-you'
  | 'dashboard-event-scope'

// One CMS page row per area; section_key is always 'copy'.
//
// NOTE: for the navbar, 'opus-pass-ui-navbar' is now only the SHARED chrome
// source (auth buttons + mobile menu controls). The product-specific mega-menu
// strings live alongside each product's own CMS group and are MERGED at read
// time — see NAVBAR_SOURCES below + loadUiStrings('navbar') in ./ui-strings.ts.
// The content-page areas (help / pricing) use the generic single-row path in
// loadUiStrings (no merge).
export const UI_STRINGS_PAGE_KEY: Record<UiArea, string> = {
  navbar: 'opus-pass-ui-navbar',
  footer: 'opus-pass-ui-footer',
  help: 'opus-pass-ui-help',
  pricing: 'opus-pass-ui-pricing',
  cart: 'opus-pass-ui-cart',
  address: 'opus-pass-ui-address',
  confirmation: 'opus-pass-ui-confirmation',
  'checkout-form': 'opus-pass-ui-checkout-form',
  'checkout-payment': 'opus-pass-ui-checkout-payment',
  'checkout-summary': 'opus-pass-ui-checkout-summary',
  'forms-collect': 'opus-pass-ui-forms-collect',
  'forms-rsvp': 'opus-pass-ui-forms-rsvp',
  'forms-pledge': 'opus-pass-ui-forms-pledge',
  'dashboard-chrome': 'opus-pass-ui-dashboard-chrome',
  'dashboard-orders': 'opus-pass-ui-dashboard-orders',
  'dashboard-events': 'opus-pass-ui-dashboard-events',
  'dashboard-seating': 'opus-pass-ui-dashboard-seating',
  'dashboard-send': 'opus-pass-ui-dashboard-send',
  'dashboard-thank-you': 'opus-pass-ui-dashboard-thank-you',
  'dashboard-event-scope': 'opus-pass-ui-dashboard-event-scope',
}

// The public navbar reads ONE merged 'navbar' namespace, but its keys are now
// authored across four CMS rows: each product's own mega-menu (edited inside
// that product's CMS group) plus the shared navbar chrome (Site UI). The loader
// queries every (page_key, section_key) pair below and Object.assigns them into
// one map, then overlays it onto the canonical English fallback. Order is
// product groups first, shared chrome last (no key overlap, so order is
// cosmetic — kept stable for predictability).
export const NAVBAR_SOURCES: { pageKey: string; sectionKey: string }[] = [
  { pageKey: 'opus-pass-invitations', sectionKey: 'navbar' },
  { pageKey: 'opus-pass-guests', sectionKey: 'navbar' },
  { pageKey: 'opus-pass-websites', sectionKey: 'navbar' },
  { pageKey: 'opus-pass-ui-navbar', sectionKey: 'copy' },
]

// Flat string interfaces — every key resolves to a plain string for consumers.
export interface NavbarStrings {
  // Top-level nav labels (also the mobile menu rows)
  nav_invitations: string
  nav_guests: string
  nav_website: string
  // Invitations mega-menu — featured card
  mega_inv_title: string
  mega_inv_desc: string
  mega_inv_cta: string
  mega_inv_image: string
  // Invitations mega-menu — column headings
  inv_col_browse: string
  inv_col_resources: string
  // Invitations mega-menu — Browse links
  inv_link_all_designs: string
  inv_link_save_the_dates: string
  inv_link_wedding: string
  inv_link_send_off: string
  inv_link_kadi: string
  // Invitations mega-menu — Resources links
  inv_link_wording: string
  inv_link_rsvp_wording: string
  // Invitations mega-menu — photo grid
  inv_grid_title: string
  inv_grid_guest_list: string
  inv_grid_guest_list_image: string
  inv_grid_rsvp_tracking: string
  inv_grid_rsvp_tracking_image: string
  inv_grid_invitations: string
  inv_grid_invitations_image: string
  inv_grid_seating_plan: string
  inv_grid_seating_plan_image: string
  // Guests mega-menu — featured card
  mega_guests_title: string
  mega_guests_desc: string
  mega_guests_cta: string
  mega_guests_image: string
  // Guests mega-menu — column headings
  guests_col_manage: string
  guests_col_resources: string
  // Guests mega-menu — Manage links
  guests_link_list_manager: string
  guests_link_rsvp_tracking: string
  guests_link_whatsapp_sms: string
  guests_link_seating: string
  // Guests mega-menu — Resources links
  guests_link_rsvp_wording: string
  guests_link_etiquette: string
  // Guests mega-menu — photo grid
  guests_grid_title: string
  guests_grid_guest_list: string
  guests_grid_guest_list_image: string
  guests_grid_rsvp_tracking: string
  guests_grid_rsvp_tracking_image: string
  guests_grid_invitations: string
  guests_grid_invitations_image: string
  guests_grid_seating_plan: string
  guests_grid_seating_plan_image: string
  // Website mega-menu — featured card
  mega_website_title: string
  mega_website_desc: string
  mega_website_cta: string
  mega_website_image: string
  // Website mega-menu — column headings
  website_col_features: string
  website_col_resources: string
  // Website mega-menu — Features links
  website_link_free_site: string
  website_link_custom_link: string
  website_link_templates: string
  website_link_rsvp_collection: string
  website_link_venue_travel: string
  // Website mega-menu — Resources links
  website_link_examples: string
  website_link_gallery_tips: string
  website_link_sharing: string
  // Website mega-menu — photo grid
  website_grid_title: string
  website_grid_templates: string
  website_grid_templates_image: string
  website_grid_photo_gallery: string
  website_grid_photo_gallery_image: string
  website_grid_rsvps: string
  website_grid_rsvps_image: string
  website_grid_travel_info: string
  website_grid_travel_info_image: string
  // Auth buttons
  auth_login: string
  auth_signup: string
  auth_dashboard: string
  // Mobile menu controls
  mobile_back: string
  mobile_open: string
  mobile_close: string
}

export interface FooterStrings {
  // Column headings
  col_products: string
  col_templates: string
  col_help: string
  col_company: string
  // Product links
  link_invitations: string
  link_guests: string
  link_website: string
  // Template links
  link_save_the_dates: string
  link_wedding_invitations: string
  link_send_off: string
  link_kadi_michango: string
  // Help links
  link_help_centre: string
  link_pricing: string
  link_contact: string
  // Company links
  link_about: string
  link_careers: string
  link_press: string
  link_status: string
  // Legal
  legal_terms: string
  legal_privacy: string
  legal_cookies: string
  legal_copyright: string
  // Copyright
  copyright: string
}

// ── Help page ────────────────────────────────────────────────────────────────
export interface HelpStrings {
  // Header
  eyebrow: string
  title: string
  intro: string
  // Topic cards (6) — each: title, body, cta
  topic_getting_started_title: string
  topic_getting_started_body: string
  topic_getting_started_cta: string
  topic_pricing_title: string
  topic_pricing_body: string
  topic_pricing_cta: string
  topic_invitations_title: string
  topic_invitations_body: string
  topic_invitations_cta: string
  topic_guests_title: string
  topic_guests_body: string
  topic_guests_cta: string
  topic_website_title: string
  topic_website_body: string
  topic_website_cta: string
  topic_contact_title: string
  topic_contact_body: string
  topic_contact_cta: string
  // FAQ section
  faq_title: string
  faq_intro: string
  // FAQs (8) — each: q + a
  faq_create_event_q: string
  faq_create_event_a: string
  faq_cost_q: string
  faq_cost_a: string
  faq_payment_methods_q: string
  faq_payment_methods_a: string
  faq_guest_experience_q: string
  faq_guest_experience_a: string
  faq_rsvp_tracking_q: string
  faq_rsvp_tracking_a: string
  faq_paper_q: string
  faq_paper_a: string
  faq_change_details_q: string
  faq_change_details_a: string
  faq_support_speed_q: string
  faq_support_speed_a: string
  // Contact CTA
  cta_title: string
  cta_body: string
  cta_contact: string
  cta_whatsapp: string
}

// ── Pricing page ─────────────────────────────────────────────────────────────
export interface PricingStrings {
  // Hero
  hero_title: string
  hero_subtitle: string
  // Tier badges
  badge_basic: string
  badge_popular: string
  badge_premium: string
  badge_luxury: string
  // Tier card chrome
  per_guest_suffix: string
  choose_prefix: string
  // Included section
  included_title: string
  upgrades_title: string
  upgrades_intro: string
  // Comparison cell aria labels
  value_included: string
  value_not_included: string
  // Ways to pay
  pay_title: string
  pay_intro: string
  // Security
  security_encrypted: string
  security_receipt: string
  // Sidebar (FAQ aside)
  faq_title: string
  faq_intro: string
  contact_cta: string
  help_link: string
  // FAQs (6) — each: q + a
  faq_how_charged_q: string
  faq_how_charged_a: string
  faq_large_events_q: string
  faq_large_events_a: string
  faq_payment_q: string
  faq_payment_a: string
  faq_paper_q: string
  faq_paper_a: string
  faq_addons_q: string
  faq_addons_a: string
  faq_upgrade_q: string
  faq_upgrade_a: string
}

// ── Cart page ────────────────────────────────────────────────────────────────
export interface CartStrings {
  // Back link + heading
  back_to_designs: string
  cart_title: string
  // Item count ({n})
  count_one: string
  count_other: string
  // Line item
  item_delivered: string
  item_package_suffix: string // "{tier} Package"
  // Delete popover
  remove_aria: string // "Remove {name}"
  remove_confirm: string
  remove_cancel: string
  remove_confirm_cta: string
  // Guest stepper aria
  guests_fewer: string
  guests_more: string
  guests_input_aria: string
  guests_label: string
  // Empty state
  empty_title: string
  empty_body: string
  empty_cta: string
  // Coupon card
  coupon_title: string
  coupon_subtitle: string
  coupon_placeholder: string
  coupon_apply: string
  coupon_none_active: string
  coupon_none_active_desc: string
  // Price details
  price_title: string
  price_label: string
  discount_label: string
  delivery_label: string
  delivery_free: string
  total_label: string
  // Checkout CTA + trust
  checkout_cta: string
  we_accept: string
  secure_note: string
  // Cross-sell
  explore_title_has: string
  explore_title_empty: string
  explore_subtitle_has: string
  explore_subtitle_empty: string
  explore_view_all: string
  // Mobile sticky bar
  mobile_count_one: string
  mobile_count_other: string
  mobile_checkout: string
}

// ── Delivery address page ────────────────────────────────────────────────────
export interface AddressStrings {
  // Back link
  back_to_cart: string
  // Card header
  header_title: string
  header_desc: string
  // Delivery mode cards
  mode_digital_title: string
  mode_digital_caption: string
  mode_print_title: string
  mode_print_caption: string
  // Form labels + placeholders
  label_full_name: string
  placeholder_full_name: string
  label_email: string
  placeholder_email: string
  label_phone: string
  placeholder_phone: string
  label_city: string
  label_street: string
  placeholder_street: string
  label_notes: string
  placeholder_notes: string
  // Validation
  error_full_name: string
  error_email: string
  error_phone: string
  error_street: string
  // Continue CTA
  continue_cta: string
  // What to expect
  expect_title: string
  expect_confirmation: string
  expect_personalised: string
  expect_revisions: string
  expect_link: string
  expect_rsvp: string
  expect_ticket: string
  expect_print: string
}

// ── Order confirmation page ──────────────────────────────────────────────────
export interface ConfirmationStrings {
  // Empty state
  empty_title: string
  empty_body: string
  empty_cta: string
  // Success header
  success_heading_verifying: string
  success_heading_confirmed: string
  success_body_verifying: string // uses {ref} via surrounding markup — see component
  success_body_confirmed: string
  // Payment status card
  status_verifying_title: string
  status_confirmed_title: string
  status_verifying_body: string
  status_paid_via: string // "Paid via {provider}"
  status_reference_label: string
  status_verifying_eta: string
  status_method_label: string
  status_method_lipa_namba: string
  status_business_number_label: string
  status_payer_label: string
  status_phone_label: string
  status_payment_label: string
  status_details_summary: string
  // Order section
  order_title: string
  meta_delivery_date: string
  meta_order_id: string
  meta_payment_method: string
  item_package_suffix: string // "{tier} Package"
  item_delivered: string
  item_guests_label: string
  // What happens next
  next_title: string
  next_personalise_title: string
  next_personalise_body: string
  next_proof_title: string
  next_proof_body: string
  next_share_title: string
  next_share_body: string
  // Payment summary
  summary_title: string
  summary_price: string
  summary_discount: string
  summary_delivery: string
  summary_delivery_free: string
  summary_total: string
  summary_total_paid: string
  download_invoice: string
  // Actions + trust
  browse_more: string
  back_to_invitations: string
  delivered_note: string
  // Payment badge fallback
  badge_card: string
  // aria
  celebration_aria: string
}

// ── Checkout — form (heading, contact recap, manual-payment fields, validation) ─
export interface CheckoutFormStrings {
  // Back link + page heading
  back_to_contact: string
  page_title: string
  // Blocking-error banner (cart empty / no contact)
  block_title: string
  block_add_contact_cta: string
  // Contact recap
  recap_delivering_to: string
  recap_edit: string
  // Event picker (only shown for couples with 2+ events)
  event_label: string
  event_placeholder: string
  // Manual Lipa Namba form — payer name
  payer_name_label: string
  payer_name_placeholder: string
  payer_name_hint: string
  // Phone field (label differs for Lipa vs push)
  phone_label_lipa: string
  phone_label_push: string // uses {provider}
  phone_placeholder: string
  phone_hint_push: string
  // Transaction reference field
  payref_label: string
  payref_placeholder: string
  payref_hint: string
  // Required-field marker (the asterisk's screen-reader/visual companion lives in markup)
  // Validation messages
  error_cart_empty: string
  error_contact_missing: string
  error_phone: string
  error_payer_name: string
  error_payref: string
  error_event_required: string
}

// ── Checkout — payment (method picker, M-Pesa flows, USSD steps, pay button) ────
export interface CheckoutPaymentStrings {
  // Method picker
  choose_title: string
  method_aria: string
  method_mpesa_desc: string
  method_card_desc: string
  // M-Pesa path toggle
  toggle_push: string
  toggle_lipa: string
  // Push instructions
  push_instructions: string // uses {pay} for the bolded "Pay" word
  push_pay_word: string
  // Lipa Namba panel
  lipa_amount_label: string
  lipa_how_title: string // Swahili "Jinsi ya kufanya malipo"
  lipa_how_subtitle: string
  lipa_network_aria: string
  lipa_dial_prefix_other: string // "Ingia kwenye"
  lipa_dial_prefix_dial: string // "Piga"
  lipa_qr_note: string // Vodacom QR helper (Swahili)
  // Per-network USSD steps. Each step is "{do} — {detail}"; we store do/detail
  // as separate keys keyed by network id + index, so the bolded prefix and the
  // detail can each be translated. The network ids + dial codes + count stay
  // hardcoded in the component.
  step_vodacom_1_do: string
  step_vodacom_1_detail: string
  step_vodacom_2_do: string
  step_vodacom_2_detail: string
  step_vodacom_3_do: string
  step_vodacom_3_detail: string
  step_vodacom_4_do: string
  step_vodacom_4_detail: string
  step_vodacom_5_do: string
  step_vodacom_5_detail: string
  step_tigo_1_do: string
  step_tigo_1_detail: string
  step_tigo_2_do: string
  step_tigo_2_detail: string
  step_tigo_3_do: string
  step_tigo_3_detail: string
  step_tigo_4_do: string
  step_tigo_4_detail: string
  step_tigo_5_do: string
  step_tigo_5_detail: string
  step_tigo_6_do: string
  step_tigo_6_detail: string
  step_airtel_1_do: string
  step_airtel_1_detail: string
  step_airtel_2_do: string
  step_airtel_2_detail: string
  step_airtel_3_do: string
  step_airtel_3_detail: string
  step_airtel_4_do: string
  step_airtel_4_detail: string
  step_airtel_5_do: string
  step_airtel_5_detail: string
  step_airtel_6_do: string
  step_airtel_6_detail: string
  step_other_1_do: string
  step_other_1_detail: string
  step_other_2_do: string
  step_other_2_detail: string
  step_other_3_do: string
  step_other_3_detail: string
  step_other_4_do: string
  step_other_4_detail: string
  step_other_5_do: string
  step_other_5_detail: string
  step_other_6_do: string
  step_other_6_detail: string
  // Network display names (kept as proper nouns in the component, but the
  // "Mitandao mingine & benki" catch-all is editable copy)
  network_other_name: string
  network_other_dial: string
  // Card secure-payment panel
  card_title: string
  card_body: string
  // Pay button — states
  pay_redirecting: string
  pay_awaiting: string
  pay_processing: string
  pay_card_cta: string
  pay_lipa_cta: string // uses {amount}
  pay_push_cta: string // uses {amount}
  // Security reassurance lines
  reassure_lipa: string
  reassure_card: string
  reassure_push: string
  // Waiting overlay (M-Pesa PIN prompt)
  overlay_aria: string
  overlay_title: string
  overlay_body: string // uses {phone} and {amount}
  overlay_waiting: string
  overlay_keep_open: string
}

// ── Checkout — summary (order summary card + ready/revision tiles) ──────────────
export interface CheckoutSummaryStrings {
  summary_title: string
  price_label: string
  discount_label: string
  delivery_label: string
  delivery_free: string
  total_label: string
  ready_title: string
  ready_body: string
  revision_title: string
  revision_body: string
  secure_note: string
}

// ── Collect form (guest contact collector at /collect/[token]) ────────────────
export interface FormsCollectStrings {
  // Field labels + placeholders
  label_name: string
  placeholder_name: string
  label_whatsapp: string
  placeholder_whatsapp: string
  label_email: string
  placeholder_email: string
  // Validation (client-side)
  error_name: string
  // Submit error toast (caught from server action)
  error_submit: string
  // Send button — pending state (idle label is cfg.buttonLabel)
  send_pending: string
  // Success state (emoji stored in the string)
  success_heading: string
  success_body: string // uses {coupleName}
}

// ── RSVP form (public self-RSVP at /rsvp/[token]) ─────────────────────────────
export interface FormsRsvpStrings {
  // Date fallback
  date_tbc: string
  // Validation + toasts
  error_answer_each: string
  toast_saved: string
  error_save: string
  // Empty state (no events)
  empty_greeting: string // uses {name}
  empty_body: string
  // Header
  eyebrow: string
  header_greeting: string // uses {name}
  followup_eyebrow: string
  followup_title: string
  followup_greeting: string
  followup_empty_title: string
  followup_empty_body: string
  // Submitted state
  submitted_title: string
  submitted_body: string
  submitted_change: string
  // Event card
  dress_code_prefix: string // "Dress code:" — value appended in markup
  // RSVP status options
  status_attending: string
  status_maybe: string
  status_declined: string
  // Attending extras
  party_size_label: string
  party_size_one: string // uses {n}
  party_size_other: string // uses {n}
  dietary_label: string
  dietary_optional: string
  dietary_placeholder: string
  message_label: string
  message_optional: string
  // Send button
  send_pending: string
  send_cta: string
  send_details_cta: string
  // Footer
  powered_by: string // uses {coupleName} and {icon}
}

// ── Pledge form (public contribution pledge at /pledge/[token]) ───────────────
export interface FormsPledgeStrings {
  // Field labels + placeholders
  label_name: string
  placeholder_name: string
  label_amount: string
  amount_currency: string
  placeholder_amount: string
  label_ticket_type: string
  ticket_single: string
  ticket_double: string
  label_promised_date: string
  label_whatsapp: string
  placeholder_whatsapp: string
  label_email: string
  placeholder_email: string
  label_message: string
  placeholder_message: string
  // Validation (client-side)
  error_name: string
  error_amount: string
  // Submit error toast (caught from server action)
  error_submit: string
  // Send button — pending state (idle label is cfg.buttonLabel)
  send_pending: string
  // Success state (emoji stored in the string)
  success_heading: string
  success_body: string // uses {coupleName}
  // Link back to a blank form, shown under the success state
  send_another: string
  // Payment card
  pay_title: string
}

// ── Dashboard chrome (persistent shell/nav/account chrome at /my/dashboard) ───
// Only the persistent shell text — sidebar nav labels, collapse/menu controls
// and the account menu. The dashboard PAGE copy is editable separately via the
// dashboard-copy CMS, not here.
export interface DashboardChromeStrings {
  // Sidebar nav labels (the routes/icons stay hardcoded in the component)
  nav_overview: string
  nav_events: string
  nav_pledges: string
  nav_guests: string
  nav_invitations: string
  nav_thank_you: string
  nav_orders: string
  nav_rsvps: string
  nav_website: string
  nav_seating: string
  nav_guestbook: string
  nav_my_orders: string
  nav_cards: string
  nav_card_details: string
  // Sidebar + drawer controls (titles / aria-labels)
  collapse_expand: string
  collapse_collapse: string
  menu_open: string
  menu_close: string
  // Account menu
  account_label: string
  account_title: string // button title + aria-label
  account_settings: string
  account_marketplace: string
  account_marketplace_sub: string
  account_sign_out: string
}

export interface DashboardOrdersStrings {
  // Header
  header_title: string
  header_subtitle: string
  // Empty state
  empty_title: string
  empty_description: string
  empty_action: string
  // Stat cards
  stat_total: string
  stat_in_progress: string
  stat_delivered: string
  // Order tracker notes (note_payment_review_ref uses {ref})
  note_delivered: string
  note_payment_review_ref: string
  note_payment_review: string
  note_personalising: string
  // Unit / plural labels
  unit_guests: string
  unit_design: string
  unit_designs: string
  // Actions
  action_invoice: string
}

export interface DashboardEventsStrings {
  // Page header
  page_title: string
  page_description: string
  // View tabs
  tabs_aria: string
  tab_event_list: string
  tab_create_event: string
  // Empty state (no events)
  empty_title: string
  empty_body: string
  empty_cta: string
  // List item
  untitled_event: string
  badge_public: string
  badge_hidden: string
  aria_edit_event: string
  aria_delete_event: string
  // Editor heading
  back_all_events: string
  heading_new_event: string
  editor_subtitle: string
  // Form fields + placeholders
  field_event_type: string
  placeholder_custom_type: string
  field_event_name: string
  placeholder_event_name: string
  field_partner1: string
  field_partner2: string
  placeholder_partner1: string
  placeholder_partner2: string
  hint_partner_names: string
  hint_max_100: string
  field_start_date: string
  field_start_time: string
  field_end_date: string
  field_end_time: string
  // Location section
  section_location: string
  field_venue_name: string
  reset_address: string
  placeholder_venue_name: string
  field_street_address: string
  field_city: string
  placeholder_city: string
  // Website settings section
  section_website_settings: string
  toggle_public: string
  toggle_allow_rsvp: string
  // Attire + note
  field_attire: string
  placeholder_attire: string
  hint_max_400: string
  field_note: string
  placeholder_note: string
  hint_note_suggestions: string
  // Footer buttons
  delete_event: string
  btn_saving: string
  btn_save_changes: string
  btn_add_event: string
  // Preview card
  preview_label: string
  preview_visible: string
  preview_name_placeholder: string
  preview_add_date: string
  preview_attire_label: string
  preview_note_label: string
  // Promo (sharing) card
  promo_label: string
  promo_body: string
  promo_cta: string
  // Linked paid design card
  linked_order_label: string
  linked_order_empty_new: string
  linked_order_none: string
  linked_order_guests: string // uses {count}
  linked_order_pick_label: string
  linked_order_pick_placeholder: string
  linked_order_pick_cta: string
  linked_order_none_available: string
  toast_order_linked: string
  toast_order_link_error: string
  unlink_aria: string // uses {name}
  toast_order_unlinked: string
  toast_order_unlink_error: string
  // Delete confirmation dialog
  delete_dialog_title: string
  delete_dialog_description: string
  // Toasts + unsaved-changes guard
  unsaved_confirm: string
  toast_name_required: string
  toast_updated: string
  toast_added: string
  toast_error_generic: string
  toast_deleted: string
  toast_delete_error: string
}

export interface DashboardSeatingStrings {
  // Page header
  header_title: string
  header_description: string
  // Empty state — no event yet
  no_event_title: string
  no_event_description: string
  no_event_cta: string
  // Empty state — selected event missing
  event_not_found_title: string
  event_not_found_description: string
  // Toolbar
  toolbar_event_label: string
  toolbar_export: string
  toolbar_share: string
  // Stat tiles
  stat_seated: string
  stat_to_seat: string
  stat_tables: string
  stat_seats_used: string
  // Empty state — no attending guests
  empty_no_guests_title: string
  empty_no_guests_description: string
  // Guest pool ("to be seated")
  pool_title: string
  pool_description: string
  pool_search_placeholder: string
  pool_all_seated: string
  pool_no_matches: string
  // Table cards
  table_edit_aria: string // {table}
  table_empty_line1: string
  table_empty_line2: string
  new_table: string
  // Guest chip + move menu
  chip_remove_aria: string // {name}
  menu_move_to: string
  menu_add_table_first: string
  menu_back_to_pool: string
  // Delete-table confirmation
  delete_confirm_title: string
  delete_confirm_description: string
  delete_confirm_label: string
  // Edit-table dialog
  edit_title: string
  edit_remove: string
  edit_cancel: string
  edit_saving: string
  edit_save: string
  edit_name_label: string
  edit_name_placeholder: string
  edit_capacity_label: string
  edit_top_table_label: string
  edit_top_table_hint: string
  // Shared / exported plan
  plan_doc_title: string // {event}
  plan_doc_not_seated: string // {count}
  plan_doc_subtitle: string // {seated} {tables}
  // Toasts
  toast_move_failed: string
  toast_add_table_failed: string
  toast_remove_table_failed: string
  toast_save_table_failed: string
  toast_copied: string
  toast_copy_failed: string
  toast_popups_blocked: string
  toast_pdf_failed: string
}

export interface DashboardSendStrings {
  // Page header
  heading: string
  subheading: string
  // Card context
  manage_events: string
  card_fallback_label: string
  no_design_subheading: string
  no_design_cta: string
  no_design_pick_cta: string
  card_purchased: string
  card_in_production: string
  card_status_confirmed: string
  card_status_designing: string
  card_status_released: string
  card_step_state_done: string
  card_step_state_now: string
  card_step_state_next: string
  card_locked_title: string
  card_locked_body: string
  card_eta_label: string
  card_eta_caption: string // {n} {m} {date}
  card_eta_late: string // {m}
  /** Promised turnaround in days. Blank or 0 hides the countdown entirely. */
  card_turnaround_days: string
  card_locked_hear_body: string
  card_locked_details_note: string
  card_locked_meanwhile: string
  card_locked_details_cta: string
  card_locked_guests_cta: string
  card_locked_savedates_cta: string
  card_sample_badge: string
  card_sample_note: string
  entrance_purchased: string
  fact_package: string
  fact_design: string
  fact_invites_paid: string
  fact_to_share: string // {n}
  addons_label: string
  // Send funnel + quota
  funnel_invited: string
  funnel_delivered: string
  funnel_viewed: string
  funnel_rsvpd: string
  quota_label: string
  quota_used_suffix: string // {m} (rendered after a bold used-count)
  quota_remaining: string // {n}
  quota_topup: string
  /** Shown instead of "x of y used" when a refund has dropped the active
   *  entitlement below what has already been sent. */
  quota_used_label: string
  quota_available_label: string
  quota_overdrawn: string
  // Public invite link (Broadcast) mode
  broadcast_tag: string
  broadcast_title: string
  broadcast_desc: string
  broadcast_best_for: string
  best_for: string
  sharing_on: string
  sharing_off: string
  sharing_toggle_aria: string
  link_off_placeholder: string
  copy: string
  copy_done: string
  chip_whatsapp: string
  chip_sms: string
  chip_copy_link: string
  chip_open: string
  // Send-invites sub-tabs
  tab_digital_cards: string
  tab_guest_responses: string
  tab_follow_up_questions: string
  tab_pass_ticket: string
  tab_checkins: string
  tab_thank_you: string
  tab_save_the_dates: string
  responses_title: string
  responses_desc: string
  followups_title: string
  followups_desc: string
  save_dates_title: string
  save_dates_desc: string
  save_dates_no_design_desc: string
  save_dates_card_badge: string
  save_dates_templates_title: string
  save_dates_templates_desc: string
  save_dates_template_use: string
  save_dates_template_applied: string
  save_dates_share_title: string
  save_dates_share_description: string
  save_dates_preview_guest: string
  save_dates_enable_cta: string
  save_dates_link_enabled: string
  save_dates_scan_label: string
  save_dates_send_title: string
  save_dates_send_desc: string
  // Live check-ins tab — arrivals as attendants scan entrance passes
  checkin_title: string
  checkin_desc: string
  checkin_live: string
  checkin_offline: string
  checkin_arrived_suffix: string // {n}/{m} guests arrived
  checkin_roster_title: string
  checkin_filter_arrived: string
  checkin_filter_pending: string
  checkin_th_door: string
  checkin_th_attendant: string
  checkin_th_table: string
  checkin_no_table: string
  checkin_th_arrived: string
  checkin_not_arrived: string
  checkin_duplicate: string
  checkin_just_arrived: string
  checkin_empty_none: string
  checkin_empty_arrived: string
  checkin_empty_pending: string
  // Downloadable / shareable attendance report
  checkin_report_download: string
  checkin_report_share: string
  checkin_report_title: string // {event}
  checkin_toast_report_failed: string
  checkin_toast_report_copied: string
  // Personal invites (Targeted) mode
  targeted_tag: string
  targeted_title: string
  targeted_desc: string
  targeted_best_for: string
  remind_awaiting: string // {n}
  send_entrance_passes: string // {n}
  dryrun_pill: string
  dryrun_note: string
  // Entrance Passes mode — only shown once guests start confirming attendance
  entrance_tag: string
  entrance_title: string
  entrance_desc: string
  entrance_best_for: string
  entrance_quota_label: string
  // Guest table
  guest_list: string
  guest_count: string // {n}
  search_placeholder: string
  search_aria: string
  filter_aria: string
  filter_all: string
  filter_notsent: string
  filter_awaiting: string
  filter_attending: string
  send_to_selected: string
  send_entrance_to_selected: string
  empty_search: string
  empty_notsent: string
  empty_awaiting: string
  empty_attending: string
  empty_none: string
  th_guest: string
  th_contact: string
  th_channel: string
  th_ticket: string
  th_card_type: string
  th_status: string
  th_send: string
  channel_whatsapp: string
  channel_sms: string
  row_whatsapp: string
  row_sms: string
  row_copy: string
  // Toasts + bulk-send summary verbs
  toast_sharing_error: string
  toast_link_copied: string
  toast_no_package: string
  send_verb_dryrun: string
  send_verb_reminded: string
  send_verb_sent: string
  send_over_quota: string // {n}
  send_no_phone: string // {n}
  toast_no_awaiting: string
  toast_personal_copied: string
  toast_reminder_ready: string // {name}
  toast_sent_one: string // {name}
  toast_pass_sent: string // {name}
  toast_reminded_one: string // {name}
  toast_send_failed: string // {name}
  toast_nothing_sent: string
  toast_entrance_excluded_notattending: string // {n}
  send_failed_n: string // {n}
  // Bulk-send progress. A big send is minutes of work, so it reports itself
  // as it goes instead of leaving the couple on a spinner.
  progress_title_invites: string
  progress_title_passes: string
  progress_count: string // {n} {m}
  progress_note: string
  progress_stop: string
  progress_stopping: string
  progress_stopped: string // {n}
  progress_results: string
  // Invite preview + test send
  preview_button: string
  preview_title: string
  preview_note: string
  preview_close: string
  entrance_preview_button: string
  entrance_preview_title: string
  entrance_preview_note: string
  test_label: string
  test_placeholder: string
  test_send: string
  test_sent: string
  test_failed: string
  // Per-guest review drawer (Preview & Send)
  review_title_invite: string
  review_title_pass: string
  review_sending_to: string
  review_channel_whatsapp: string
  review_shared_number: string // {names}
  review_edit_guest: string
  review_card_legend: string
  review_pass_legend: string
  review_preparing: string // {name}
  review_card_missing: string
  review_open_full: string
  review_fact_guest: string
  review_fact_ticket: string
  review_fact_passid: string
  review_message_legend: string
  review_approved_tag: string
  review_checks_ready: string
  review_checks_blocked: string
  review_check_phone: string
  review_check_card: string
  review_check_settings: string
  review_check_credit: string
  review_check_live: string
  review_check_attending: string
  review_check_pass: string
  review_fix_edit_guest: string
  review_fix_open_cards: string
  review_fix_settings: string
  review_credit_one: string
  review_credit_free: string
  review_send_invite: string
  review_send_pass: string
  review_send_test: string
  review_sending: string
  review_dryrun: string
  review_sent_invite: string
  review_sent_pass: string
  review_sent_to: string // {phone}
  review_sent_at: string // {time}
  review_done: string
  review_error_title_invite: string
  review_error_title_pass: string
  review_error_quota: string
  review_error_skipped: string
  review_error_failed: string
  review_topup: string
  row_preview_send: string
  row_preview_send_pass: string
  row_preview: string
  row_resend_menu: string
  row_resend_now: string
  row_resend_preview: string
  row_copy_link: string
  // Bulk-send confirm dialog
  confirm_title: string
  confirm_entrance_title: string
  confirm_recipients: string // {n}
  confirm_entrance_body: string // {n}
  confirm_credits: string // {n} {m}
  confirm_cancel: string
  confirm_confirm: string
  // Send report drawer
  results_title: string
  results_sent: string
  results_failed: string
  results_skipped: string
  results_blocked: string
  results_retry: string
  results_close: string
  results_resend_tag: string
  // Confirmed template variables ({{1}}/{{2}}/{{3}})
  settings_legend: string
  field_guest_label: string
  field_host_label: string
  field_category_label: string
  field_category_other: string
  settings_required_note: string
  settings_edit: string
  toast_settings_saved: string
  // Table extras
  add_number: string
  save_number: string
  row_send: string
  row_resend: string
  row_send_pass: string
  // Delivery column: what WhatsApp actually did with the invitation
  th_delivery: string
  delivery_pending: string
  delivery_delivered: string
  delivery_read: string
  delivery_failed: string
  delivery_none: string
  filter_undelivered: string
  funnel_undelivered: string
  entrance_needs_whatsapp: string
  entrance_status_sent: string
  entrance_status_notsent: string
  entrance_status_eligible: string
  entrance_status_noteligible: string
  ticket_legend: string
  ticket_note: string
  ticket_field_category: string
  ticket_field_partner1: string
  ticket_field_partner2: string
  ticket_field_date: string
  ticket_field_venue: string
  ticket_field_city: string
  ticket_field_language: string
  ticket_lang_en: string
  ticket_lang_sw: string
  party_single: string
  party_double: string
  toast_ticket_saved: string
  row_edit: string
  add_guest: string
  row_delete: string
  row_delete_confirm: string
  toast_guest_saved: string
  toast_guest_removed: string
  bulk_delete: string
  bulk_delete_title: string
  bulk_delete_body: string // {n}
  bulk_delete_confirm: string
  toast_guests_removed: string // {n}
  selected_count: string // {n}
  send_all_notsent: string // {n}
  // Event switcher + unassigned-order assignment
  event_switcher_label: string
  unassigned_pill: string
  unassigned_note: string // {n}
  unassigned_guests: string // {n}
  unassigned_assign: string // {event}
  toast_order_assigned: string
}

// The "Thank You" tab: a post-event bulk WhatsApp broadcast to guests
// confirmed attending, included with Elegant/Signature packages.
export interface DashboardThankYouStrings {
  heading: string
  subheading: string
  // Event switcher
  event_switcher_label: string
  // Thank-you card picker (WhatsApp header image, from the invitation
  // catalog) — sending is available to every tier, only the free template
  // picker is gated (Classic/Essential unlock it the same way Pledges does).
  card_heading: string
  card_desc: string
  card_uploaded_label: string
  card_remove: string
  card_none: string
  card_use: string
  card_applied: string
  card_applied_toast: string
  card_apply_failed: string
  card_removed_toast: string
  card_remove_failed: string
  card_locked_badge: string
  card_unlock_cta: string // {fee}
  // Guest table
  search_placeholder: string
  search_aria: string
  select_all_aria: string
  selected_count: string // {n}
  send_to_selected: string
  preview_test: string
  empty_search: string
  empty_none: string
  th_guest: string
  th_contact: string
  th_status: string
  th_send: string
  status_thanked: string
  status_notsent: string
  no_phone: string
  row_send: string
  row_resend: string
  // Toasts + bulk-send summary verbs
  toast_nothing_sent: string
  send_verb_dryrun: string
  send_verb_sent: string
  send_failed_n: string // {n}
  send_no_phone: string // {n}
  // Bulk-send confirm dialog
  confirm_title: string
  confirm_body: string // {n}
  confirm_cancel: string
  confirm_confirm: string
  // Message preview + test send
  preview_title: string
  preview_note: string
  preview_close: string
  test_label: string
  test_placeholder: string
  test_send: string
  test_dryrun_note: string
  toast_test_sent: string
  toast_test_dryrun: string
  toast_test_failed: string
  // Send report drawer
  results_title: string
  results_sent: string
  results_failed: string
  results_skipped: string
  results_retry: string
  results_close: string
}

// Shared "which event are you working on?" chooser + switcher used by the
// event-scoped dashboard pages (Pledges, Send invites, Guest list, RSVPs,
// Seat collection) — see @/components/dashboard/EventScope.
export interface DashboardEventScopeStrings {
  // Full-page chooser (multi-event couples with no selection yet)
  chooser_title: string
  chooser_description: string
  chooser_no_date: string
  chooser_all_option: string
  chooser_all_hint: string
  chooser_manage: string
  // Compact header switcher
  switcher_label: string
  switcher_all: string
}

export type UiStringsByArea = {
  navbar: NavbarStrings
  footer: FooterStrings
  help: HelpStrings
  pricing: PricingStrings
  cart: CartStrings
  address: AddressStrings
  confirmation: ConfirmationStrings
  'checkout-form': CheckoutFormStrings
  'checkout-payment': CheckoutPaymentStrings
  'checkout-summary': CheckoutSummaryStrings
  'forms-collect': FormsCollectStrings
  'forms-rsvp': FormsRsvpStrings
  'forms-pledge': FormsPledgeStrings
  'dashboard-chrome': DashboardChromeStrings
  'dashboard-orders': DashboardOrdersStrings
  'dashboard-events': DashboardEventsStrings
  'dashboard-seating': DashboardSeatingStrings
  'dashboard-send': DashboardSendStrings
  'dashboard-thank-you': DashboardThankYouStrings
  'dashboard-event-scope': DashboardEventScopeStrings
}

export const UI_STRINGS_FALLBACKS: UiStringsByArea = {
  navbar: {
    nav_invitations: 'Digital Cards',
    nav_guests: "Guests & RSVP's",
    nav_website: 'Wedding Website',
    mega_inv_title: 'WEDDING DIGITAL CARDS',
    mega_inv_desc:
      'Designer-worthy digital cards for every wedding moment, sent by WhatsApp or SMS.',
    mega_inv_cta: 'Browse all designs',
    mega_inv_image:
      'https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=800&q=80',
    inv_col_browse: 'Browse',
    inv_col_resources: 'Resources',
    inv_link_all_designs: 'All Designs',
    inv_link_save_the_dates: 'Save the Dates',
    inv_link_wedding: 'Wedding Digital Cards',
    inv_link_send_off: 'Send-Off & Kitchen Party',
    inv_link_kadi: 'Kadi za Michango',
    inv_link_wording: 'Invitation Wording',
    inv_link_rsvp_wording: 'RSVP Wording Ideas',
    inv_grid_title: 'Wedding Paper',
    inv_grid_guest_list: 'Guest List',
    inv_grid_guest_list_image: '/assets/images/mauzo_crew.jpg',
    inv_grid_rsvp_tracking: 'RSVP Tracking',
    inv_grid_rsvp_tracking_image: '/assets/images/churchcouples.jpg',
    inv_grid_invitations: 'Digital Cards',
    inv_grid_invitations_image: '/assets/images/cutesy_couple.jpg',
    inv_grid_seating_plan: 'Seating Plan',
    inv_grid_seating_plan_image: '/assets/images/couples_together.jpg',
    mega_guests_title: 'GUESTS & RSVPS',
    mega_guests_desc:
      'Send digital invites by WhatsApp or SMS and watch RSVPs roll in live.',
    mega_guests_cta: 'Manage your guests',
    mega_guests_image: '/assets/images/mauzo_crew.jpg',
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
    guests_grid_guest_list_image: '/assets/images/mauzo_crew.jpg',
    guests_grid_rsvp_tracking: 'RSVP Tracking',
    guests_grid_rsvp_tracking_image: '/assets/images/churchcouples.jpg',
    guests_grid_invitations: 'Digital Cards',
    guests_grid_invitations_image: '/assets/images/cutesy_couple.jpg',
    guests_grid_seating_plan: 'Seating Plan',
    guests_grid_seating_plan_image: '/assets/images/couples_together.jpg',
    mega_website_title: 'WEDDING WEBSITE',
    mega_website_desc:
      'Build a beautiful wedding website in minutes and share it with your guests.',
    mega_website_cta: 'Create your website',
    mega_website_image:
      'https://images.unsplash.com/photo-1461301214746-1e109215d6d3?auto=format&fit=crop&w=800&q=80',
    website_col_features: 'Features',
    website_col_resources: 'Resources',
    website_link_free_site: 'Free Wedding Website',
    website_link_custom_link: 'Custom Link',
    website_link_templates: 'Beautiful Templates',
    website_link_rsvp_collection: 'RSVP Collection',
    website_link_venue_travel: 'Venue & Travel Info',
    website_link_examples: 'Website Examples',
    website_link_gallery_tips: 'Photo Gallery Tips',
    website_link_sharing: 'Sharing with Guests',
    website_grid_title: 'Website Ideas',
    website_grid_templates: 'Templates',
    website_grid_templates_image: '/assets/images/coupleswithpiano.jpg',
    website_grid_photo_gallery: 'Photo Gallery',
    website_grid_photo_gallery_image: '/assets/images/beautiful_bride.jpg',
    website_grid_rsvps: 'RSVPs',
    website_grid_rsvps_image: '/assets/images/authentic_couple.jpg',
    website_grid_travel_info: 'Travel Info',
    website_grid_travel_info_image: '/assets/images/bride_umbrella.jpg',
    auth_login: 'Log in',
    auth_signup: 'Sign up',
    auth_dashboard: 'Dashboard',
    mobile_back: 'Back',
    mobile_open: 'Open menu',
    mobile_close: 'Close menu',
  },
  footer: {
    col_products: 'Products',
    col_templates: 'Templates',
    col_help: 'Help',
    col_company: 'Company',
    link_invitations: 'Digital Cards',
    link_guests: "Guests & RSVP's",
    link_website: 'Wedding Website',
    link_save_the_dates: 'Save the Dates',
    link_wedding_invitations: 'Wedding Digital Cards',
    link_send_off: 'Send-Off & Kitchen Party',
    link_kadi_michango: 'Kadi za Michango',
    link_help_centre: 'Help Centre',
    link_pricing: 'Pricing',
    link_contact: 'Contact',
    link_about: 'About OpusPass',
    link_careers: 'Careers',
    link_press: 'Press',
    link_status: 'Status',
    legal_terms: 'Terms of Use',
    legal_privacy: 'Privacy Policy',
    legal_cookies: 'Cookie Policy',
    legal_copyright: 'Copyright',
    copyright: '© 2026 OpusPass. All rights reserved.',
  },
  help: {
    eyebrow: 'Help Centre',
    title: 'How can we help?',
    intro:
      'Answers about digital cards, RSVPs, payments and your wedding website — plus a direct line to our team when you need a person.',
    topic_getting_started_title: 'Getting started',
    topic_getting_started_body:
      'Create your event, build a guest list and send your first digital card in minutes.',
    topic_getting_started_cta: 'Get started',
    topic_pricing_title: 'Pricing & payments',
    topic_pricing_body:
      'Per-guest packages, what each one includes, and the mobile-money and card options we accept.',
    topic_pricing_cta: 'View pricing',
    topic_invitations_title: 'Digital Cards',
    topic_invitations_body:
      'Choose a design, customise your wording, preview a proof and deliver by WhatsApp or SMS.',
    topic_invitations_cta: 'Browse designs',
    topic_guests_title: 'Guests & RSVPs',
    topic_guests_body:
      'Track confirmations live, send reminders and scan tickets at the door on the day.',
    topic_guests_cta: 'Explore guest tools',
    topic_website_title: 'Wedding website',
    topic_website_body:
      'Share your story, schedule, venue map and a bilingual RSVP page on a personal site.',
    topic_website_cta: 'See websites',
    topic_contact_title: 'Contact support',
    topic_contact_body:
      'Still stuck? Reach the team by email or WhatsApp and we’ll reply within one business day.',
    topic_contact_cta: 'Get in touch',
    faq_title: 'Popular questions',
    faq_intro:
      'The things couples ask us most. Can’t find your answer? We’re one message away.',
    faq_create_event_q: 'How do I create my event and start inviting guests?',
    faq_create_event_a:
      'Sign in, open your dashboard and create an event with your names, date and venue. Add guests by typing them in or pasting from a spreadsheet, then send each one a personal invitation link by WhatsApp, SMS or email — replies land in your dashboard live.',
    faq_cost_q: 'How much does OpusPass cost?',
    faq_cost_a:
      'Pricing is per guest, and you choose from four packages — Essential, Classic, Elegant and Signature — so the price scales with your headcount. Every package includes the digital card, ticket, delivery and door check-in. See the Pricing page for the full breakdown and what each tier adds.',
    faq_payment_methods_q: 'What payment methods can my guests and I use?',
    faq_payment_methods_a:
      'We accept M-Pesa, Airtel Money, Mixx by Yas and Selcom Pesa, plus Visa and Mastercard. Contribution collection (where guests pledge straight into one event account) is available on the Classic, Elegant and Signature packages.',
    faq_guest_experience_q: 'What does a guest receive?',
    faq_guest_experience_a:
      'Each guest gets a digital card with all your event details and a personal ticket with a unique barcode. They RSVP on a private bilingual page (English & Kiswahili), and on the day their ticket is scanned at the entrance to verify entry.',
    faq_rsvp_tracking_q: 'Can I see who has confirmed and who has arrived?',
    faq_rsvp_tracking_a:
      'Yes. Your RSVP dashboard shows live confirmations and headcount, and on the higher packages it tracks check-ins at the door and shows analytics — so you can plan food and seating accurately.',
    faq_paper_q: 'Do you still offer printed paper cards?',
    faq_paper_a:
      'Most couples go fully digital with a small print run for elders and VIPs. Paper card prints are available as an add-on on any package — just ask and we’ll arrange printing and delivery within Tanzania.',
    faq_change_details_q: 'What if my venue or time changes after I’ve invited everyone?',
    faq_change_details_a:
      'You can message all guests at once from your dashboard — invitations, reminders or quick updates such as a venue or time change reach everyone instantly by WhatsApp or SMS.',
    faq_support_speed_q: 'How quickly does support reply?',
    faq_support_speed_a:
      'We reply to email and WhatsApp within one business day, and usually much faster during office hours. Reach us any time via the Contact page.',
    cta_title: 'Still need a hand?',
    cta_body: 'Our team is based in Dar es Salaam and replies within one business day.',
    cta_contact: 'Contact us',
    cta_whatsapp: 'Chat on WhatsApp',
  },
  pricing: {
    hero_title: 'Simple pricing, per guest.',
    hero_subtitle:
      'Choose the package that fits your celebration. Everything scales with your headcount — no setup fees, no surprises.',
    badge_basic: 'Basic',
    badge_popular: 'Most popular',
    badge_premium: 'Premium',
    badge_luxury: 'Luxury',
    per_guest_suffix: '/ guest',
    choose_prefix: 'Choose',
    included_title: 'Included in every package',
    upgrades_title: 'What the higher tiers add',
    upgrades_intro: 'Compare what each package unlocks beyond the essentials.',
    value_included: 'Included',
    value_not_included: 'Not included',
    pay_title: 'Ways to pay',
    pay_intro:
      'Pay by mobile money or card — in full or in instalments. Every payment is encrypted and handled by our trusted payment partners.',
    security_encrypted:
      'Card and mobile-money details are encrypted end-to-end and processed directly by the provider — OpusPass never sees or stores them.',
    security_receipt:
      'Each transaction is confirmed instantly with a receipt, and contributions go straight into one secure event account you control.',
    faq_title: 'Pricing questions',
    faq_intro:
      'Everything about how billing works. Still curious about something? We’re happy to talk it through.',
    contact_cta: 'Contact us',
    help_link: 'Visit the Help Centre',
    faq_how_charged_q: 'How is the price calculated?',
    faq_how_charged_a:
      'Pricing is per guest. Pick a package, enter your guest count, and the total is simply the per-guest rate times your headcount — so a smaller event costs less and a larger one scales predictably.',
    faq_large_events_q: 'What about very large events?',
    faq_large_events_a:
      'Events above 600 guests get a capped, discounted per-guest rate. Reach out and we’ll confirm the exact figure for your headcount.',
    faq_payment_q: 'What payment methods do you accept?',
    faq_payment_a:
      'M-Pesa, Airtel Money, Mixx by Yas and Selcom Pesa, plus Visa and Mastercard. You can pay in full or split into instalments.',
    faq_paper_q: 'Is paper printing included?',
    faq_paper_a:
      'OpusPass is digital-first, so paper isn’t included by default. Paper card prints are an add-on on any package — we arrange printing and delivery within Tanzania on request.',
    faq_addons_q: 'Can I add extras like a wedding website or on-site scanning?',
    faq_addons_a:
      'Yes — add-ons such as a wedding website, on-site scanning, Save-the-Date and more can be layered onto any package. Add them at checkout or message our team afterwards and we’ll add them to your order.',
    faq_upgrade_q: 'Can I switch to a higher package after I’ve started?',
    faq_upgrade_a:
      'Yes, you can upgrade at any time — we’ll only charge the difference for the guests already on your list. Message our team and we’ll handle the switch for you.',
  },
  cart: {
    back_to_designs: '← Back to designs',
    cart_title: 'Your Cart',
    count_one: '{n} item in cart',
    count_other: '{n} items in cart',
    item_delivered: 'Delivered within 48-72 hours',
    item_package_suffix: '{tier} Package',
    remove_aria: 'Remove {name}',
    remove_confirm: 'Remove this design from your cart?',
    remove_cancel: 'Cancel',
    remove_confirm_cta: 'Remove',
    guests_fewer: 'Fewer guests',
    guests_more: 'More guests',
    guests_input_aria: 'Number of guests',
    guests_label: 'Guests',
    empty_title: 'Your cart is empty.',
    empty_body: 'Browse digital card designs and add one to get started.',
    empty_cta: 'Browse designs',
    coupon_title: 'Apply Coupon',
    coupon_subtitle: 'Have a promo code?',
    coupon_placeholder: 'Coupon code',
    coupon_apply: 'Apply',
    coupon_none_active: 'No promo codes are active right now.',
    coupon_none_active_desc: 'Check back later — discounts will apply here automatically.',
    price_title: 'Price Details',
    price_label: 'Price',
    discount_label: 'Discount',
    delivery_label: 'Delivery Charges',
    delivery_free: 'Free Delivery',
    total_label: 'Total',
    checkout_cta: 'Continue to checkout',
    we_accept: 'We accept:',
    secure_note: 'Secure checkout · designs delivered within 48-72 hours',
    explore_title_has: 'You might also like',
    explore_title_empty: 'Explore digital card designs',
    explore_subtitle_has: 'More designs in the styles you’re shopping.',
    explore_subtitle_empty: 'Popular designs to get you started.',
    explore_view_all: 'View all',
    mobile_count_one: '{n} item',
    mobile_count_other: '{n} items',
    mobile_checkout: 'Checkout',
  },
  address: {
    back_to_cart: '← Back to cart',
    header_title: 'How should we deliver?',
    header_desc:
      'Every order includes your digital card, sent via WhatsApp and email. Add printed cards to have them mailed to you too.',
    mode_digital_title: 'Digital delivery',
    mode_digital_caption: 'Sent via WhatsApp, SMS, and email within 48-72 hours of payment.',
    mode_print_title: 'Digital + printed cards',
    mode_print_caption:
      'Everything digital, plus high-quality prints mailed to your address in 7–14 days.',
    label_full_name: 'Full name',
    placeholder_full_name: 'Mary Mwakasege',
    label_email: 'Email address',
    placeholder_email: 'mary@example.com',
    label_phone: 'WhatsApp / phone number',
    placeholder_phone: '+255 7xx xxx xxx',
    label_city: 'City / region',
    label_street: 'Street address',
    placeholder_street: 'House number, street, building name…',
    label_notes: 'Delivery notes',
    placeholder_notes: 'Gate code, landmarks, best time to call…',
    error_full_name: 'Please enter your full name.',
    error_email: 'Enter a valid email address.',
    error_phone: 'Enter a valid phone number.',
    error_street: 'Please enter your mailing address.',
    continue_cta: 'Continue to payment',
    expect_title: 'What to expect',
    expect_confirmation: 'Instant order confirmation in your inbox',
    expect_personalised: 'Your design personalised by our team within 48-72 hours',
    expect_revisions: 'One free round of revisions to get every detail right',
    expect_link: 'A shareable digital card link for WhatsApp, SMS & email',
    expect_rsvp: 'Live RSVP tracking as your guests respond',
    expect_ticket:
      'An OpusPass ticket with QR code — save it to Apple or Google Wallet and scan at the entrance',
    expect_print: 'High-quality printed cards mailed to you in 7–14 days',
  },
  confirmation: {
    empty_title: 'No recent order found.',
    empty_body: 'Once you complete a purchase, your confirmation will appear here.',
    empty_cta: 'Browse designs',
    success_heading_verifying: 'Asante — we’ve received your order',
    success_heading_confirmed: 'Thank you — your order is confirmed',
    success_body_verifying:
      'The OpusFesta team is verifying your payment{refClause}. Once confirmed, we’ll email your receipt to {email} and your design goes live within 48-72 hours.',
    success_body_confirmed:
      'We’ve emailed your receipt to {email}. Your design goes live within 48-72 hours.',
    status_verifying_title: 'Payment Under Review',
    status_confirmed_title: 'Payment Confirmed',
    status_verifying_body: 'Your payment has been received and is being verified.',
    status_paid_via: 'Paid via {provider}',
    status_reference_label: 'Reference:',
    status_verifying_eta: 'Usually verified within 15 minutes.',
    status_method_label: 'Method',
    status_method_lipa_namba: 'M-Pesa Lipa Namba',
    status_business_number_label: 'Business Number',
    status_payer_label: 'Payer',
    status_phone_label: 'Phone',
    status_payment_label: 'Payment',
    status_details_summary: 'Payment details',
    order_title: 'Your order',
    meta_delivery_date: 'Delivery window',
    meta_order_id: 'Order ID',
    meta_payment_method: 'Payment method',
    item_package_suffix: '{tier} Package',
    item_delivered: 'Delivered within 48-72 hours',
    item_guests_label: 'Guests',
    next_title: 'What happens next',
    next_personalise_title: 'We personalise your design',
    next_personalise_body:
      'Our team tailors your digital card with your details, ready within 48-72 hours.',
    next_proof_title: 'You review a proof',
    next_proof_body:
      'We send a proof for your approval — one free round of revisions is included.',
    next_share_title: 'Share & check in',
    next_share_body:
      'Get a shareable link plus OpusPass tickets with QR codes for entrance scanning.',
    summary_title: 'Payment summary',
    summary_price: 'Price',
    summary_discount: 'Discount',
    summary_delivery: 'Delivery charges',
    summary_delivery_free: 'Free delivery',
    summary_total: 'Total',
    summary_total_paid: 'Total paid',
    download_invoice: 'Download invoice',
    browse_more: 'Browse more designs',
    back_to_invitations: 'Back to digital cards',
    delivered_note: 'Designs delivered within 48-72 hours',
    badge_card: 'Card',
    celebration_aria: 'Celebration',
  },
  'checkout-form': {
    back_to_contact: '← Back to contact details',
    page_title: 'Payment',
    block_title: "We can't process this yet",
    block_add_contact_cta: 'Add one →',
    recap_delivering_to: 'Delivering to',
    recap_edit: 'Edit',
    event_label: 'Which event is this for?',
    event_placeholder: 'Choose an event',
    payer_name_label: 'Name on the account that paid',
    payer_name_placeholder: 'e.g. Mary Mwakasege',
    payer_name_hint:
      'The account holder name the payment came from — as registered with the mobile network or bank.',
    phone_label_lipa: 'Your phone number to confirm your payment',
    phone_label_push: '{provider} phone number',
    phone_placeholder: '+255 7xx xxx xxx',
    phone_hint_push: "You'll get a prompt on your phone to approve the payment.",
    payref_label: 'Transaction reference number',
    payref_placeholder: 'e.g. 9XJ45KQ2RT',
    payref_hint:
      'The confirmation code in the SMS you received after paying. The OpusFesta team uses it to verify your payment.',
    error_cart_empty: 'Your cart is empty — add a design before paying.',
    error_contact_missing: 'Please add your contact details before paying.',
    error_phone: 'Enter a valid phone number.',
    error_payer_name: 'Enter the name on the account the payment came from.',
    error_payref:
      'Enter the confirmation code from your payment SMS (6–25 letters or numbers).',
    error_event_required: 'Please choose which event this is for.',
  },
  'checkout-payment': {
    choose_title: 'Choose how to pay',
    method_aria: 'Payment method',
    method_mpesa_desc: 'Lipa Namba or QR — pay from any network or bank',
    method_card_desc: 'Visa or Mastercard',
    toggle_push: 'Phone prompt',
    toggle_lipa: 'Lipa Namba',
    push_instructions:
      'Enter your M-Pesa number below and tap {pay}. A prompt pops up on your phone — enter your PIN to approve. We confirm automatically, no codes to copy.',
    push_pay_word: 'Pay',
    lipa_amount_label: 'Amount to send',
    lipa_how_title: 'How to pay',
    lipa_how_subtitle: 'How to pay — choose your network and follow the steps.',
    lipa_network_aria: 'Payment network',
    lipa_dial_prefix_other: 'Open',
    lipa_dial_prefix_dial: 'Dial',
    lipa_qr_note:
      'Or scan the QR code: open the M-Pesa App, tap the QR button, scan the QR image above, then enter the amount and your PIN to complete the payment.',
    // English equivalents of the on-screen (Swahili) Vodacom steps.
    step_vodacom_1_do: 'Choose 4',
    step_vodacom_1_detail: 'Pay with M-Pesa',
    step_vodacom_2_do: 'Choose 1',
    step_vodacom_2_detail: 'Pay by phone',
    step_vodacom_3_do: 'Enter Lipa Namba',
    step_vodacom_3_detail: '350298654',
    step_vodacom_4_do: 'Enter amount',
    step_vodacom_4_detail: 'to pay',
    step_vodacom_5_do: 'Enter your PIN',
    step_vodacom_5_detail: 'to confirm the payment',
    step_tigo_1_do: 'Choose 5',
    step_tigo_1_detail: 'PAY BY PHONE',
    step_tigo_2_do: 'Choose 3',
    step_tigo_2_detail: 'Go to other networks',
    step_tigo_3_do: 'Choose 1',
    step_tigo_3_detail: 'M-Pesa',
    step_tigo_4_do: 'Enter M-Pesa Lipa Namba',
    step_tigo_4_detail: '350298654',
    step_tigo_5_do: 'Enter amount',
    step_tigo_5_detail: 'you are paying',
    step_tigo_6_do: 'Enter your PIN',
    step_tigo_6_detail: 'to confirm',
    step_airtel_1_do: 'Choose 5',
    step_airtel_1_detail: 'Pay Bills',
    step_airtel_2_do: 'Choose 1',
    step_airtel_2_detail: 'Pay by phone (All networks)',
    step_airtel_3_do: 'Choose 2',
    step_airtel_3_detail: 'Pay by Voda Lipa',
    step_airtel_4_do: 'Enter amount',
    step_airtel_4_detail: 'of money',
    step_airtel_5_do: 'Enter the reference number',
    step_airtel_5_detail: '350298654',
    step_airtel_6_do: 'Enter your PIN',
    step_airtel_6_detail: 'to confirm',
    step_other_1_do: 'Choose',
    step_other_1_detail: 'PAY BY PHONE',
    step_other_2_do: 'Choose',
    step_other_2_detail: 'Go to other networks',
    step_other_3_do: 'Choose',
    step_other_3_detail: 'M-Pesa',
    step_other_4_do: 'Enter the merchant number',
    step_other_4_detail: '350298654',
    step_other_5_do: 'Enter amount',
    step_other_5_detail: 'to pay',
    step_other_6_do: 'Enter your PIN',
    step_other_6_detail: 'to confirm',
    network_other_name: 'Other networks & banks',
    network_other_dial: "Your network's financial services menu",
    card_title: 'Secure card payment',
    card_body:
      "When you continue, we'll take you to our payment partner's secure page to enter your Visa or Mastercard details and complete 3-D Secure verification. OpusFesta never sees or stores your card number.",
    pay_redirecting: 'Redirecting…',
    pay_awaiting: 'Waiting for approval…',
    pay_processing: 'Processing…',
    pay_card_cta: 'Continue to secure card payment',
    pay_lipa_cta: "I've paid {amount} — submit order",
    pay_push_cta: 'Pay {amount}',
    reassure_lipa:
      'Your order is confirmed once the OpusFesta team verifies the transaction. Your design goes live within 48-72 hours of confirmation.',
    reassure_card:
      'Card payments are processed securely by our payment partner (3-D Secure). Your design goes live within 48-72 hours of confirmation.',
    reassure_push:
      'Approve the prompt on your phone to pay. Your design goes live within 48-72 hours of confirmation.',
    overlay_aria: 'Awaiting payment approval',
    overlay_title: 'Check your phone',
    overlay_body:
      'We sent a payment prompt to {phone}. Enter your M-Pesa PIN to approve {amount}.',
    overlay_waiting: 'Waiting for confirmation…',
    overlay_keep_open: 'Keep this page open — it updates automatically once you approve.',
  },
  'checkout-summary': {
    summary_title: 'Order summary',
    price_label: 'Price',
    discount_label: 'Discount',
    delivery_label: 'Delivery charges',
    delivery_free: 'Free delivery',
    total_label: 'Total',
    ready_title: 'Ready in 48-72 hours',
    ready_body:
      'Your personalised design and OpusPass tickets are delivered within 48-72 hours of payment.',
    revision_title: 'One free revision',
    revision_body:
      "We'll fine-tune the details until your digital card looks just right.",
    secure_note: 'Your payment details are encrypted and processed securely.',
  },
  'forms-collect': {
    label_name: 'Your name',
    placeholder_name: 'Asha Mussa',
    label_whatsapp: 'WhatsApp / mobile',
    placeholder_whatsapp: '0712 345 678',
    label_email: 'Email',
    placeholder_email: 'you@example.com',
    error_name: 'Please enter your name',
    error_submit: 'Could not save your info',
    send_pending: 'Sending…',
    success_heading: 'Thank you! 💚',
    success_body:
      '{coupleName} have your details. You’ll receive your invitation and RSVP link by WhatsApp soon.',
  },
  'forms-rsvp': {
    date_tbc: 'Date to be confirmed',
    error_answer_each: 'Please answer for each event',
    toast_saved: 'Thank you! Your details are saved.',
    error_save: 'Could not save your reply',
    empty_greeting: 'Hi {name}!',
    empty_body: 'Your invitation details are being finalised. Please check back soon.',
    eyebrow: "You're invited",
    header_greeting: "Hi {name}, we'd love to celebrate with you.",
    followup_eyebrow: 'Follow-up questions',
    followup_title: 'A few more details',
    followup_greeting: 'The couple added a few quick questions for you.',
    followup_empty_title: 'No follow-up questions yet',
    followup_empty_body: 'The couple has not added any extra questions for you right now.',
    submitted_title: 'Your details are saved',
    submitted_body: 'Thank you! You can update your details below if anything changes.',
    submitted_change: 'Change my response',
    dress_code_prefix: 'Dress code:',
    status_attending: "I'll be there",
    status_maybe: 'Maybe',
    status_declined: "Can't make it",
    party_size_label: 'How many in your party?',
    party_size_one: '{n} guest',
    party_size_other: '{n} guests',
    dietary_label: 'Dietary needs',
    dietary_optional: '(optional)',
    dietary_placeholder: 'Allergies, preferences…',
    message_label: 'Message to the couple',
    message_optional: '(optional)',
    send_pending: 'Sending…',
    send_cta: 'Send my RSVP',
    send_details_cta: 'Send my details',
    powered_by: 'Powered with {icon} by OpusPass · {coupleName}',
  },
  'forms-pledge': {
    label_name: 'Your name',
    placeholder_name: 'Asha Mussa',
    label_amount: 'Amount you’d like to pledge',
    amount_currency: 'TZS',
    placeholder_amount: '100,000',
    label_ticket_type: 'Ticket type',
    ticket_single: 'Single',
    ticket_double: 'Double',
    label_promised_date: 'When can you pay by?',
    label_whatsapp: 'WhatsApp / mobile',
    placeholder_whatsapp: '0712 345 678',
    label_email: 'Email',
    placeholder_email: 'you@example.com',
    label_message: 'A note for the couple',
    placeholder_message: 'Hongera! Anything you’d like to add…',
    error_name: 'Please enter your name',
    error_amount: 'Please enter the amount you can pledge',
    error_submit: 'Could not save your pledge',
    send_pending: 'Sending…',
    success_heading: 'Thank you! 💚',
    success_body: '{coupleName} have received your pledge. They’ll be in touch with the details.',
    send_another: 'Send another pledge',
    pay_title: 'How to pay',
  },
  'dashboard-chrome': {
    nav_overview: 'Overview',
    nav_events: 'Events',
    nav_pledges: 'Pledges',
    nav_guests: 'Guest list',
    nav_invitations: 'Send invites',
    nav_thank_you: 'Thank you',
    nav_orders: 'Orders',
    nav_rsvps: 'RSVPs',
    nav_website: 'Wedding website',
    nav_seating: 'Seat collection',
    nav_guestbook: 'Guestbook',
    nav_my_orders: 'My Orders',
    nav_cards: 'My cards',
    nav_card_details: 'Card details',
    collapse_expand: 'Expand sidebar',
    collapse_collapse: 'Collapse sidebar',
    menu_open: 'Open menu',
    menu_close: 'Close menu',
    account_label: 'Account',
    account_title: 'Account menu',
    account_settings: 'Profile & settings',
    account_marketplace: 'Vendors & planning',
    account_marketplace_sub: 'on OpusFesta',
    account_sign_out: 'Sign out',
  },
  'dashboard-orders': {
    header_title: 'Orders',
    header_subtitle: 'Track your digital card orders and download invoices.',
    empty_title: 'No orders yet',
    empty_description: 'When you purchase a digital card design, your order and tracking will appear here.',
    empty_action: 'Browse designs',
    stat_total: 'Total orders',
    stat_in_progress: 'In progress',
    stat_delivered: 'Delivered',
    note_delivered: 'Delivered. Your design and OpusPass tickets are ready.',
    note_payment_review_ref: 'Awaiting payment confirmation from the OpusFesta team. Ref {ref}.',
    note_payment_review: 'Awaiting payment confirmation from the OpusFesta team.',
    note_personalising: 'Being personalised. Ready within 48-72 hours of payment.',
    unit_guests: 'guests',
    unit_design: 'design',
    unit_designs: 'designs',
    action_invoice: 'Invoice',
  },
  'dashboard-events': {
    page_title: 'Events',
    page_description:
      'Set up every moment of your ceremony, reception and everything in between.',
    tabs_aria: 'Event views',
    tab_event_list: 'Event list',
    tab_create_event: 'Create event',
    empty_title: 'No events yet',
    empty_body:
      'Add your ceremony, reception, send-off and everything in between. Each one gets its own RSVP link.',
    empty_cta: 'Create your first event',
    untitled_event: 'Untitled event',
    badge_public: 'Public',
    badge_hidden: 'Hidden',
    aria_edit_event: 'Edit event',
    aria_delete_event: 'Delete event',
    back_all_events: 'All events',
    heading_new_event: 'New event',
    editor_subtitle: "Edit the details below, and see how they'll look on your wedding website.",
    field_event_type: 'Event type',
    placeholder_custom_type: 'Name this event type (e.g. Welcome Dinner)',
    field_event_name: 'Event name',
    placeholder_event_name: 'Our ceremony',
    field_partner1: 'Partner 1 name',
    field_partner2: 'Partner 2 name (optional)',
    placeholder_partner1: 'e.g. Claudia Mrema',
    placeholder_partner2: 'e.g. Daniel Kileo',
    hint_partner_names: 'Printed on the Entrance Pass Ticket as first names, e.g. "Claudia & Daniel".',
    hint_max_100: 'Maximum 100 characters',
    field_start_date: 'Event date',
    field_start_time: 'Start time',
    field_end_date: 'End date',
    field_end_time: 'End time',
    section_location: 'Event location',
    field_venue_name: 'Venue name',
    reset_address: 'Reset address →',
    placeholder_venue_name: 'Brooklyn Winery',
    field_street_address: 'Street address',
    field_city: 'City',
    placeholder_city: 'e.g. Dar es Salaam',
    section_website_settings: 'Event settings on website',
    toggle_public: 'Make event public to all guests',
    toggle_allow_rsvp: 'Let guests RSVP on website',
    field_attire: 'Dress code',
    placeholder_attire:
      'This event is black-tie optional. The grass can be soft, so maybe rethink stilettos.',
    hint_max_400: 'Maximum 400 characters',
    field_note: 'Note to guests',
    placeholder_note:
      "There will be a few light bites in addition to cocktails. Can't wait to see you!",
    hint_note_suggestions: 'e.g. parking info, weather tips, or a warm welcome message',
    delete_event: 'Delete event',
    btn_saving: 'Saving…',
    btn_save_changes: 'Save changes',
    btn_add_event: 'Save event',
    preview_label: 'Preview',
    preview_visible: 'Visible to guests',
    preview_name_placeholder: 'Your event name',
    preview_add_date: 'Add an event date',
    preview_attire_label: 'Dress code',
    preview_note_label: 'Note to guests',
    promo_label: 'Sharing',
    promo_body:
      'Each event has its own RSVP link. Send it on WhatsApp, SMS or email and guests reply per event. You can see every response in the guest list.',
    promo_cta: 'Open guest list',
    linked_order_label: 'Paid design',
    linked_order_empty_new: 'Save this event first, then link one of your paid designs to it.',
    linked_order_none: 'No paid design linked to this event yet.',
    linked_order_guests: '{count} guests',
    linked_order_pick_label: 'Link a paid order to this event',
    linked_order_pick_placeholder: 'Choose an unassigned order',
    linked_order_pick_cta: 'Link',
    linked_order_none_available: "You haven't purchased a digital card design yet. Designs you buy show up here to link.",
    toast_order_linked: 'Design linked to this event.',
    toast_order_link_error: 'Could not link that order. Please try again.',
    unlink_aria: 'Unlink {name}',
    toast_order_unlinked: 'Design unlinked. You can now link it to a different event.',
    toast_order_unlink_error: 'Could not unlink that order. Please try again.',
    delete_dialog_title: 'Delete "{name}"?',
    delete_dialog_description:
      "This also removes the event from every guest's invitation. It can't be undone.",
    unsaved_confirm: 'You have unsaved changes. Discard them?',
    toast_name_required: 'Give the event a name',
    toast_updated: 'Event updated',
    toast_added: 'Event added',
    toast_error_generic: 'Something went wrong',
    toast_deleted: 'Event deleted',
    toast_delete_error: 'Could not delete',
  },
  'dashboard-seating': {
    header_title: 'Seat collection',
    header_description:
      'Build a seating plan for each event, assign guests to tables, and share a tidy arrangement with your venue.',
    no_event_title: 'Add an event first',
    no_event_description:
      "Seating is organised per event, so start by creating one. Once you have an event and guests have RSVP'd, you can plan the tables here.",
    no_event_cta: 'Create an event',
    event_not_found_title: 'Event not found',
    event_not_found_description: 'Pick a different event from your list.',
    toolbar_event_label: 'Event',
    toolbar_export: 'Export',
    toolbar_share: 'Share with venue',
    stat_seated: 'seated',
    stat_to_seat: 'to seat',
    stat_tables: 'tables',
    stat_seats_used: 'seats used',
    empty_no_guests_title: 'No attending guests yet',
    empty_no_guests_description:
      'Once guests RSVP "attending" to this event, they will appear here ready to drag onto tables.',
    pool_title: 'To be seated',
    pool_description: 'Attending guests not yet at a table. Drag them onto any table.',
    pool_search_placeholder: 'Search guests',
    pool_all_seated: 'Everyone is seated 🎉',
    pool_no_matches: 'No matches.',
    table_edit_aria: 'Edit {table}',
    table_empty_line1: 'Drag guests here',
    table_empty_line2: 'to fill this table',
    new_table: 'New table',
    chip_remove_aria: 'Remove {name} from table',
    menu_move_to: 'Move to',
    menu_add_table_first: 'Add a table first.',
    menu_back_to_pool: 'Back to "to be seated"',
    delete_confirm_title: 'Remove this table?',
    delete_confirm_description:
      'Guests seated here will go back to the "to be seated" list. This cannot be undone.',
    delete_confirm_label: 'Remove table',
    edit_title: 'Edit table',
    edit_remove: 'Remove',
    edit_cancel: 'Cancel',
    edit_saving: 'Saving…',
    edit_save: 'Save',
    edit_name_label: 'Table name',
    edit_name_placeholder: 'e.g. Familia ya Bibi',
    edit_capacity_label: 'Seats (capacity)',
    edit_top_table_label: 'Top table',
    edit_top_table_hint: ', highlighted for the head party',
    plan_doc_title: '{event}: Seating plan',
    plan_doc_not_seated: 'Not yet seated ({count}):',
    plan_doc_subtitle: 'Seating plan · {seated} seated · {tables} tables',
    toast_move_failed: 'Could not save that change. Please try again.',
    toast_add_table_failed: 'Could not add a table.',
    toast_remove_table_failed: 'Could not remove the table.',
    toast_save_table_failed: 'Could not save the table.',
    toast_copied: 'Seating plan copied. Paste it to your venue or WhatsApp.',
    toast_copy_failed: 'Could not copy. Try the Export button instead.',
    toast_popups_blocked: 'Allow pop-ups to export the plan.',
    toast_pdf_failed: 'Could not generate the PDF. Please try again.',
  },
  'dashboard-send': {
    heading: 'Send invites',
    subheading:
      'Your card is paid for. Now get it into your guests’ hands. Share a public link, or send each guest a personal invite.',
    manage_events: 'Manage events',
    card_fallback_label: 'INVITATION',
    no_design_subheading:
      "You haven't picked a card design for this event yet. Buy one, or use a design you've already paid for, to start sending invites.",
    no_design_cta: 'Browse card designs',
    no_design_pick_cta: 'Pick your paid design',
    card_purchased: 'Card purchased',
    card_in_production: 'Card in production',
    card_status_confirmed: 'Order confirmed',
    card_status_designing: 'Design in progress',
    card_status_released: 'Approved to send',
    card_step_state_done: 'Done',
    card_step_state_now: 'Happening now',
    card_step_state_next: 'Up next',
    card_locked_title: 'Your card is being prepared',
    card_locked_body:
      'Guest sending, delivery stats and your invite quota unlock as soon as the design is approved.',
    card_eta_label: 'Expected ready',
    card_eta_caption: 'Day {n} of {m}, expected by {date}',
    card_eta_late: 'Past the usual {m} days. We are on it.',
    card_turnaround_days: '',
    card_locked_hear_body:
      'Nothing is needed from you. We get in touch the moment your card is ready.',
    card_locked_details_note: 'Your designer is waiting on a few details from you.',
    card_locked_meanwhile: 'While you wait',
    card_locked_details_cta: 'Send your card details',
    card_locked_guests_cta: 'Build your guest list',
    card_locked_savedates_cta: 'Send save the dates',
    card_sample_badge: 'Sample',
    card_sample_note: 'Sample wording shown. Your details are set before release.',
    entrance_purchased: 'Entrance passes ready',
    fact_package: 'Package',
    fact_design: 'Design',
    fact_invites_paid: 'Invites paid',
    fact_to_share: '{n} to share',
    addons_label: 'Add-ons',
    funnel_invited: 'Invited',
    funnel_delivered: 'Delivered',
    funnel_viewed: 'Viewed',
    funnel_rsvpd: 'Responded',
    quota_label: 'Paid invitations',
    quota_used_suffix: 'of {m} used',
    quota_remaining: '{n} remaining',
    quota_topup: 'Add more cards',
    quota_used_label: 'Used',
    quota_available_label: 'Available',
    quota_overdrawn: 'Usage exceeds your active entitlement.',
    broadcast_tag: 'Broadcast',
    broadcast_title: 'Public invite link',
    broadcast_desc:
      'One link you can drop into any WhatsApp group or status. It unfurls into a branded preview, and public responses land in a review queue, so no one can reply as someone else.',
    broadcast_best_for: 'Big group chats and status. Fast reach, lighter control.',
    best_for: 'Best for',
    sharing_on: 'Sharing on',
    sharing_off: 'Sharing off',
    sharing_toggle_aria: 'Toggle public sharing',
    link_off_placeholder: 'Turn on sharing to get your public link',
    copy: 'Copy',
    copy_done: 'Copied ✓',
    chip_whatsapp: 'WhatsApp',
    chip_sms: 'SMS',
    chip_copy_link: 'Copy link',
    chip_open: 'Open',
    tab_digital_cards: 'Digital Cards',
    tab_guest_responses: 'Guest Responses',
    tab_follow_up_questions: 'Follow-up Questions',
    tab_pass_ticket: 'Entrance Pass Ticket',
    tab_checkins: 'Live Check-ins',
    tab_thank_you: 'Thank you',
    tab_save_the_dates: 'Save the dates',
    responses_title: 'Guest responses',
    responses_desc:
      'Track WhatsApp attendance replies, guest details, ticket type, party size, and entrance pass readiness.',
    followups_title: 'Follow-up questions',
    followups_desc:
      'Ask for details after attendance is known, like meals, dietary needs, transport, song requests, and notes.',
    save_dates_title: 'Share save the dates',
    save_dates_desc:
      'Preview your save-the-date card, share the public link, or send it to selected guests.',
    save_dates_no_design_desc:
      'Pick a Save the Date design for this event, then share it from here.',
    save_dates_card_badge: 'Your save the date',
    save_dates_templates_title: 'Save the Date Templates',
    save_dates_templates_desc:
      'Give your save-the-date page a designed look - pick a save-the-date template below.',
    save_dates_template_use: 'Use this template',
    save_dates_template_applied: 'Applied',
    save_dates_share_title: 'Share your save the date link',
    save_dates_share_description:
      'Post it in a family WhatsApp group, or send it directly. Anyone who opens it can view the details - no app or sign-in needed.',
    save_dates_preview_guest: 'Preview as guest',
    save_dates_enable_cta: 'Enable link',
    save_dates_link_enabled: 'Save-the-date link enabled',
    save_dates_scan_label: 'Scan to open',
    save_dates_send_title: 'Send to your guests',
    save_dates_send_desc:
      'Send each guest their save-the-date link via WhatsApp, SMS, or Email - individually or in bulk.',
    checkin_title: 'Live arrivals at the door',
    checkin_desc:
      'Watch guests check in as your attendants scan their Entrance Pass at the door.',
    checkin_live: 'Live',
    checkin_offline: 'Showing last known arrivals',
    checkin_arrived_suffix: 'arrived',
    checkin_roster_title: 'Arrivals',
    checkin_filter_arrived: 'Arrived',
    checkin_filter_pending: 'Not arrived',
    checkin_th_door: 'Door',
    checkin_th_attendant: 'Attendant',
    checkin_th_table: 'Table',
    checkin_no_table: 'Not seated',
    checkin_th_arrived: 'Checked in',
    checkin_not_arrived: 'Not arrived yet',
    checkin_duplicate: 'already scanned',
    checkin_just_arrived: 'Just arrived',
    checkin_empty_none:
      'No confirmed guests yet. Once guests respond as attending, their arrivals show here the moment they are scanned at the door.',
    checkin_empty_arrived:
      'No arrivals yet. Guests appear here as your attendants scan their Entrance Pass.',
    checkin_empty_pending: 'Everyone has arrived. 🎉',
    checkin_report_download: 'Download report',
    checkin_report_share: 'Share',
    checkin_report_title: '{event}: Check-in report',
    checkin_toast_report_failed: 'Could not generate the report. Please try again.',
    checkin_toast_report_copied: 'Check-in report copied. Paste it to share.',
    targeted_tag: 'Targeted',
    targeted_title: 'Personal invites',
    targeted_desc:
      'Send each named guest their own card with Attend / Decline / View location buttons they tap right in WhatsApp, or as an SMS link, no app needed. Every send is tracked below.',
    targeted_best_for: 'Your real guest list. Accurate counts and per-guest status.',
    remind_awaiting: 'Remind {n} awaiting',
    send_entrance_passes: 'Send Entrance Pass to {n} attending',
    dryrun_pill: 'Dry run',
    dryrun_note:
      'WhatsApp Business isn’t connected. Sends are logged only until the Meta account and template are approved.',
    entrance_tag: 'Entrance Passes',
    entrance_title: 'Send tickets to confirmed guests',
    entrance_desc:
      'Guests marked as attending get a personal Entrance Pass Ticket with their own scannable QR code.',
    entrance_best_for: 'Guests who already responded yes. Real check-in QR codes.',
    entrance_quota_label: 'Entrance passes',
    guest_list: 'Guest list',
    guest_count: '{n} guests',
    search_placeholder: 'Search name or number…',
    search_aria: 'Search guests',
    filter_aria: 'Filter guests',
    filter_all: 'All',
    filter_notsent: 'Not sent',
    filter_awaiting: 'Awaiting',
    filter_attending: 'Attending',
    send_to_selected: 'Send to selected',
    send_entrance_to_selected: 'Send Entrance Pass',
    empty_search: 'No guests match your search.',
    empty_notsent: 'Everyone has been sent an invite.',
    empty_awaiting: 'No one is awaiting a reply.',
    empty_attending: 'No one has confirmed attending yet.',
    empty_none: 'No guests yet.',
    th_guest: 'Guest',
    th_contact: 'Contact',
    th_channel: 'Preferred channel',
    th_ticket: 'Ticket',
    th_card_type: 'Card Type',
    th_status: 'Status',
    th_send: 'Send',
    channel_whatsapp: 'WhatsApp',
    channel_sms: 'SMS',
    row_whatsapp: 'WhatsApp',
    row_sms: 'SMS',
    row_copy: 'Copy personal link',
    toast_sharing_error: 'Could not update sharing.',
    toast_link_copied: 'Link copied',
    toast_no_package: 'Buy an invitation package to send.',
    send_verb_dryrun: 'queued (dry run)',
    send_verb_reminded: 'reminded',
    send_verb_sent: 'sent',
    send_over_quota: '{n} over quota',
    send_no_phone: '{n} no phone',
    toast_no_awaiting: 'No one is awaiting a reply right now.',
    toast_personal_copied: 'Personal link copied',
    toast_reminder_ready: 'Reminder ready for {name}',
    toast_sent_one: 'Invitation sent to {name}',
    toast_pass_sent: 'Entrance Pass sent to {name}',
    toast_reminded_one: 'Reminder sent to {name}',
    toast_send_failed: 'Could not send to {name}. Please try again.',
    toast_nothing_sent: 'Nothing was sent. Only confirmed guests with a phone number can receive invites.',
    toast_entrance_excluded_notattending: '{n} selected guests were skipped — only guests who confirmed attending can receive an Entrance Pass.',
    send_failed_n: '{n} failed',
    progress_title_invites: 'Sending invitations',
    progress_title_passes: 'Sending entrance passes',
    progress_count: '{n} of {m}',
    progress_note: 'Keep this page open. Guests are messaged a few at a time, so you can watch it happen.',
    progress_stop: 'Stop',
    progress_stopping: 'Stopping after this batch',
    progress_stopped: 'Stopped. {n} already went out and cannot be recalled.',
    progress_results: 'See results',
    preview_button: 'Preview invite',
    preview_title: 'What your guests receive',
    preview_note: 'The exact WhatsApp message, built from your card and event details. Buttons work right inside WhatsApp.',
    preview_close: 'Close',
    entrance_preview_button: 'Preview ticket',
    entrance_preview_title: 'What your attending guests receive',
    entrance_preview_note: 'The exact ticket image and WhatsApp message a confirmed guest gets, with a real scannable QR code.',
    test_label: 'Send a test to your own WhatsApp',
    test_placeholder: 'e.g. 0712 345 678',
    test_send: 'Send test',
    test_sent: 'Test sent. Check your WhatsApp.',
    test_failed: 'Test could not be sent',
    review_title_invite: 'Review invitation',
    review_title_pass: 'Review entrance pass',
    review_sending_to: 'Sending to',
    review_channel_whatsapp: 'WhatsApp',
    review_shared_number: 'This number is also used by {names}',
    review_edit_guest: 'Guest details incorrect? Edit guest',
    review_card_legend: 'Invitation card',
    review_pass_legend: 'Entrance pass',
    review_preparing: 'Preparing {name}',
    review_card_missing: 'No released invitation card yet',
    review_open_full: 'Open full preview',
    review_fact_guest: 'Guest',
    review_fact_ticket: 'Ticket',
    review_fact_passid: 'Pass ID',
    review_message_legend: 'WhatsApp message',
    review_approved_tag: 'Approved template',
    review_checks_ready: 'Ready to send',
    review_checks_blocked: 'Cannot send yet',
    review_check_phone: 'Phone number available',
    review_check_card: 'Invitation card released',
    review_check_settings: 'Sending settings confirmed',
    review_check_credit: 'Invitation credit available',
    review_check_live: 'WhatsApp sending is live',
    review_check_attending: 'Guest has confirmed attending',
    review_check_pass: 'Entrance pass generated',
    review_fix_edit_guest: 'Edit guest',
    review_fix_open_cards: 'Open card details',
    review_fix_settings: 'Review settings',
    review_credit_one: '1 invitation credit will be used',
    review_credit_free: 'Re-send. No invitation credit is used.',
    review_send_invite: 'Send invitation',
    review_send_pass: 'Send entrance pass',
    review_send_test: 'Run test send',
    review_sending: 'Sending...',
    review_dryrun: 'Test mode. No WhatsApp message will be delivered.',
    review_sent_invite: 'Invitation sent',
    review_sent_pass: 'Entrance pass sent',
    review_sent_to: 'Sent to {phone}',
    review_sent_at: 'Today at {time}',
    review_done: 'Done',
    review_error_title_invite: 'Invitation not sent',
    review_error_title_pass: 'Entrance pass not sent',
    review_error_quota: 'Your invitation allowance changed while you were reviewing. Top up to continue.',
    review_error_skipped: 'This guest could not be sent to.',
    review_error_failed: 'WhatsApp did not accept the message. Try again in a moment.',
    review_topup: 'Top up invitations',
    row_preview_send: 'Preview & Send',
    row_preview_send_pass: 'Preview & Send Pass',
    row_preview: 'Preview',
    row_resend_menu: 'Resend',
    row_resend_now: 'Resend now',
    row_resend_preview: 'Preview before resending',
    row_copy_link: 'Copy invitation link',
    confirm_title: 'Ready to send?',
    confirm_entrance_title: 'Send entrance passes?',
    confirm_recipients: '{n} guests will receive your invitation card on WhatsApp.',
    confirm_entrance_body: '{n} guests will receive their OpusPass Entrance Pass ticket on WhatsApp.',
    confirm_credits: 'This uses {n} of your {m} remaining invites. Re-sends to already-invited guests are free.',
    confirm_cancel: 'Not yet',
    confirm_confirm: 'Send now',
    results_title: 'Send report',
    results_sent: 'Sent to WhatsApp',
    results_failed: 'Failed',
    results_skipped: 'No phone number',
    results_blocked: 'Over quota',
    results_retry: 'Retry failed',
    results_close: 'Done',
    results_resend_tag: 're-send',
    settings_legend: 'Invitation details',
    field_guest_label: 'Preview as guest',
    field_host_label: 'From (host names)',
    field_category_label: 'Event type (Swahili)',
    field_category_other: 'Other: type it in',
    settings_required_note: 'These appear in every invite. Confirm them before sending; you can change them any time.',
    settings_edit: 'Edit',
    toast_settings_saved: 'Invitation details saved',
    add_number: 'Add number',
    save_number: 'Save',
    row_send: 'Send Invites',
    row_resend: 'Resend',
    row_send_pass: 'Send Pass',
    th_delivery: 'Delivery',
    delivery_pending: 'Awaiting',
    delivery_delivered: 'Delivered',
    delivery_read: 'Opened',
    delivery_failed: 'Not delivered',
    delivery_none: 'Not sent',
    filter_undelivered: 'Not delivered',
    funnel_undelivered: 'Not delivered',
    entrance_needs_whatsapp: 'Entrance passes are sent by WhatsApp only — add a WhatsApp number for this guest',
    entrance_status_sent: 'Sent',
    entrance_status_notsent: 'Not sent',
    entrance_status_eligible: 'Eligible',
    entrance_status_noteligible: 'Not eligible',
    ticket_legend: 'Ticket details',
    ticket_note: 'These appear on every Entrance Pass Ticket for this event. Changes update the event itself, so invites and guest response pages stay in sync.',
    ticket_field_category: 'Event category',
    ticket_field_partner1: 'Partner 1 name',
    ticket_field_partner2: 'Partner 2 name (optional)',
    ticket_field_date: 'Event date',
    ticket_field_venue: 'Venue',
    ticket_field_city: 'City',
    ticket_field_language: 'Ticket language',
    ticket_lang_en: 'English',
    ticket_lang_sw: 'Swahili',
    party_single: 'Single',
    party_double: 'Double',
    toast_ticket_saved: 'Ticket details saved',
    row_edit: 'Edit guest',
    add_guest: 'Add guest',
    row_delete: 'Remove guest',
    row_delete_confirm: 'Sure?',
    toast_guest_saved: 'Guest saved',
    toast_guest_removed: 'Guest removed',
    bulk_delete: 'Remove selected',
    bulk_delete_title: 'Remove guests?',
    bulk_delete_body: '{n} guests will be removed from your list, along with their invitation history. This cannot be undone.',
    bulk_delete_confirm: 'Remove',
    toast_guests_removed: '{n} removed',
    selected_count: '{n} selected',
    send_all_notsent: 'Send to all not sent ({n})',
    event_switcher_label: 'Sending for',
    unassigned_pill: 'Action needed',
    unassigned_note: '{n} paid designs are not linked to an event yet. Assign them so they can be sent.',
    unassigned_guests: '{n} invites',
    unassigned_assign: 'Use for {event}',
    toast_order_assigned: 'Design assigned to this event',
  },
  'dashboard-thank-you': {
    heading: 'Thank You',
    subheading: 'Send a thank-you message to everyone who attended, one tap for your whole guest list.',
    event_switcher_label: 'Sending for',
    card_heading: 'Thank-you card',
    card_desc: 'Give your thank-you message a designed look: pick a card below.',
    card_uploaded_label: 'Using your uploaded photo',
    card_remove: 'Remove',
    card_none: 'No catalog designs available yet.',
    card_use: 'Use this card',
    card_applied: 'Applied',
    card_applied_toast: 'Thank-you card applied',
    card_apply_failed: 'Could not apply this card',
    card_removed_toast: 'Thank-you card removed',
    card_remove_failed: 'Could not remove this card',
    card_locked_badge: 'Locked',
    card_unlock_cta: 'Purchase — TZS {fee}',
    search_placeholder: 'Search guests…',
    search_aria: 'Search guests',
    select_all_aria: 'Select all guests',
    selected_count: '{n} selected',
    send_to_selected: 'Send Thank You',
    preview_test: 'Preview & test',
    empty_search: 'No guests match your search.',
    empty_none: 'No guests have confirmed attending this event yet.',
    th_guest: 'Guest',
    th_contact: 'Contact',
    th_status: 'Status',
    th_send: 'Send',
    status_thanked: 'Thanked',
    status_notsent: 'Not sent',
    no_phone: 'No phone number',
    row_send: 'Send',
    row_resend: 'Resend',
    toast_nothing_sent: "Nothing to send: check the guests you've selected have a phone number.",
    send_verb_dryrun: 'queued (test mode)',
    send_verb_sent: 'sent',
    send_failed_n: '{n} failed',
    send_no_phone: '{n} skipped (no phone)',
    confirm_title: 'Send thank-you messages?',
    confirm_body: "You're about to send a thank-you message to {n} guests.",
    confirm_cancel: 'Cancel',
    confirm_confirm: 'Send now',
    preview_title: 'Preview & test send',
    preview_note: 'Send a copy to your own WhatsApp to see exactly what guests will receive.',
    preview_close: 'Close',
    test_label: 'Send a test to',
    test_placeholder: '+255 7XX XXX XXX',
    test_send: 'Send test',
    test_dryrun_note: 'WhatsApp isn’t connected yet — test sends are logged, not delivered.',
    toast_test_sent: 'Test message sent',
    toast_test_dryrun: 'Test queued (WhatsApp not connected yet)',
    toast_test_failed: 'Could not send test message',
    results_title: 'Send results',
    results_sent: 'sent',
    results_failed: 'failed',
    results_skipped: 'skipped',
    results_retry: 'Retry failed',
    results_close: 'Close',
  },
  'dashboard-event-scope': {
    chooser_title: 'Choose an event',
    chooser_description:
      'You have more than one event. Pick the one you want to work on. You can switch at any time from the top of the page.',
    chooser_no_date: 'Date not set',
    chooser_all_option: 'All events',
    chooser_all_hint: 'View everything across all your events',
    chooser_manage: 'Manage events',
    switcher_label: 'Event',
    switcher_all: 'All events',
  },
}
