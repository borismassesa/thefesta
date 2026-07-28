// PURE module (no next/headers, no server-only imports) for the vendors_portal
// operational-portal "Site UI" microcopy CMS — the editable, bilingual strings
// on the day-to-day vendor dashboard chrome, /verify, and (eventually) the
// rest of the (portal) app. Because it's pure, BOTH the server loader
// (./portal-ui.ts) and the client provider
// (@/components/providers/PortalUIStringsProvider) import the types + the
// English fallback values from here, without crossing the import-type
// boundary that guards the loader.
//
// Mirrors apps/opus_pass/src/lib/cms/ui-strings-fallback.ts exactly.
//
// Admin write side mirrors these values in
// apps/opus_admin/src/lib/cms/vendors-portal-ui-strings.ts (dual-type
// convention — the two apps duplicate CMS types/fallbacks, no shared
// package).
//
// Areas below cover the FULL roster the admin CMS is scaffolded for. Only
// `portal-chrome` and `verify` have real content this phase — the rest ship
// as empty Record<string, string> stubs so the type machinery, admin nav, and
// page_key map are all correct today and need no rework when later phases add
// their fields.

export type PortalUiArea =
  | 'portal-chrome'
  | 'dashboard'
  | 'verify'
  | 'settings'
  | 'reviews'
  | 'leads'
  | 'bookings'
  | 'auth'
  | 'storefront-chrome'
  | 'storefront-about'
  | 'storefront-packages'
  | 'storefront-services'
  | 'storefront-faq'
  | 'storefront-photos-team'
  | 'storefront-availability'
  | 'onboarding'

// One CMS page row per area; section_key is always 'copy'.
export const PORTAL_UI_PAGE_KEY: Record<PortalUiArea, string> = {
  'portal-chrome': 'vendors-portal-ui-portal-chrome',
  dashboard: 'vendors-portal-ui-dashboard',
  verify: 'vendors-portal-ui-verify',
  settings: 'vendors-portal-ui-settings',
  reviews: 'vendors-portal-ui-reviews',
  leads: 'vendors-portal-ui-leads',
  bookings: 'vendors-portal-ui-bookings',
  auth: 'vendors-portal-ui-auth',
  'storefront-chrome': 'vendors-portal-ui-storefront-chrome',
  'storefront-about': 'vendors-portal-ui-storefront-about',
  'storefront-packages': 'vendors-portal-ui-storefront-packages',
  'storefront-services': 'vendors-portal-ui-storefront-services',
  'storefront-faq': 'vendors-portal-ui-storefront-faq',
  'storefront-photos-team': 'vendors-portal-ui-storefront-photos-team',
  'storefront-availability': 'vendors-portal-ui-storefront-availability',
  onboarding: 'vendors-portal-ui-onboarding',
}

// Flat string interfaces — every key resolves to a plain string for
// consumers. Fields grouped by the component/section they came from.
export interface PortalChromeStrings {
  // Sidebar top items
  nav_dashboard: string
  nav_leads: string
  // Sidebar main items
  nav_storefront: string
  nav_bookings: string
  nav_reviews: string
  // Sidebar growth items
  nav_lead_preferences: string
  nav_plans: string
  nav_boost_storefront: string
  badge_new: string
  nav_insights: string
  // Sidebar bottom items
  nav_help_center: string
  nav_feedback: string
  nav_settings: string
  // Sidebar section dividers
  section_your_business: string
  section_grow: string
  // Sidebar search + aria labels
  search_placeholder: string
  aria_expand_sidebar: string
  aria_collapse_sidebar: string
  aria_search: string
  // Header greeting (root/dashboard) — {vendorName} is interpolated
  greeting_title: string
  greeting_subtitle: string
  // Header page headings — Leads / Reviews
  page_leads_subtitle: string
  page_reviews_subtitle: string
  // Header storefront fallback heading (hydrating / no matched section)
  storefront_fallback_title: string
  storefront_fallback_subtitle: string
  // Header bookings headings
  page_bookings_subtitle: string
  page_bookings_calendar_title: string
  page_bookings_calendar_subtitle: string
  booking_detail_fallback_title: string
  booking_detail_fallback_subtitle: string
  // Header buttons / aria labels
  aria_help: string
  aria_notifications: string
  aria_profile_settings: string
  view_public_storefront: string
}

export interface VerifyStrings {
  // Header
  heading_under_review: string
  heading_corrections: string
  heading_default: string
  subtitle_under_review: string
  subtitle_corrections: string
  subtitle_default: string
  action_required_pill: string
  edit_application_prompt: string
  edit_application_link: string
  sign_out: string
  // Journey section
  journey_title: string
  journey_aria_label: string
  journey_complete_of: string // "{done}/{total} complete"
  // Journey step: Application
  step_application_title: string
  step_application_description: string
  step_application_done_label: string
  // Journey step: Payout setup
  step_payout_title: string
  step_payout_description: string
  step_payout_done_label: string
  // Journey step: Identity verification
  step_identity_title: string
  step_identity_done_description: string
  step_identity_active_description: string
  step_identity_done_label: string
  step_identity_active_label: string
  // Journey step: Optional documents
  step_optional_title: string
  step_optional_done_added_description: string
  step_optional_done_skipped_description: string
  step_optional_active_description: string
  step_optional_locked_description: string
  step_optional_done_added_label: string
  step_optional_done_skipped_label: string
  step_optional_active_label: string
  optional_doc_tin_title: string
  optional_doc_tin_description: string
  optional_doc_license_title: string
  optional_doc_license_description: string
  optional_doc_awaiting_review: string
  optional_doc_optional_pill: string
  skip_to_agreement: string
  continue_to_agreement: string
  // Journey step: Vendor agreement
  step_agreement_title: string
  step_agreement_done_description: string
  step_agreement_active_description: string
  step_agreement_locked_id_description: string
  step_agreement_locked_optional_description: string
  step_agreement_done_label: string
  step_agreement_active_default_label: string
  step_agreement_signed_of: string // "{done}/{total} signed"
  // Journey step: Under review
  step_review_title: string
  step_review_active_description: string
  step_review_locked_description: string
  step_review_active_label: string
  // Document upload actions (shared by TIN/license slots)
  upload_business_license_tab: string
  upload_sole_proprietor_tab: string
  upload_uploaded_prefix: string // "uploaded {relative}"
  upload_admin_notes_prefix: string
  upload_uploading: string
  upload_replace_file: string
  upload_document: string
  upload_corrected_document: string
  upload_file_types_hint: string
  // Agreement docs list
  agreement_intro: string // "{count} parts" template
  agreement_download_pdf: string
  agreement_pdf_unavailable: string
  agreement_pdf_unavailable_suffix: string
  agreement_open_new_tab: string
  agreement_ack_prefix: string // "I have read {title} ({code}) and agree..."
  agreement_business_info_full_title: string
  agreement_business_info_schedule_title: string
  agreement_sehemu_b: string
  agreement_confirm_hint: string
  agreement_name_label: string
  agreement_name_hint: string
  agreement_signature_label: string
  agreement_signed_label: string
  agreement_sign_button: string
  agreement_hide_button: string
  agreement_signing_button: string
  agreement_submit_button: string
  // SEHEMU B business-identification fields (full contract)
  field_business_name_label: string
  field_business_name_hint: string
  field_tin_label: string
  field_tin_hint: string
  field_business_address_label: string
  field_business_address_hint: string
  field_contact_person_label: string
  field_contact_person_hint: string
  field_email_label: string
  field_email_hint: string
  field_phone_label: string
  field_phone_hint: string
  field_service_type_label: string
  field_service_type_hint: string
  // SEHEMU B business-identification fields (schedules — lighter block)
  field_position_label: string
  field_position_hint: string
  field_nida_label: string
  field_nida_hint: string
  // Footer
  need_help_prompt: string
  contact_email_label: string
  // Validation / submit errors
  validation_ack_required: string
  validation_name_required: string
  validation_fill_before_signing: string // "Fill in {label} before signing."
  submit_generic_error: string
  // Relative time (document/signature timestamps)
  relative_just_now: string
  relative_minutes_ago: string // "{n}m ago"
  relative_hours_ago: string // "{n}h ago"
  relative_days_ago: string // "{n}d ago"
  // National ID capture step
  id_step_title: string
  id_step_front: string
  id_step_back: string
  id_step_selfie: string
  id_step_retake: string
  id_step_capture: string
  id_step_qr_prompt: string
  id_step_qr_button: string
  id_capture_hint_selfie: string
  id_capture_hint_card: string
  id_error_bad_type: string
  id_error_empty_file: string
  id_error_too_large: string
  id_error_read_failed: string
  id_qr_mint_error: string
  id_tile_captured: string
  id_tile_not_captured: string
  id_tile_replace_by_upload: string
  id_tile_upload_instead: string
  id_qr_heading: string
  id_qr_description: string
  id_qr_alt: string
  id_selfie_hint_ready: string
  id_selfie_hint_locked: string
  // Signature pad
  signature_placeholder: string
  signature_hint: string
  signature_clear: string
  signature_aria_label: string
  // Errors / status screens (suspended, generic)
  status_suspended_title: string
  status_suspended_body: string
}

export interface DashboardStrings {
  // Status banners (non-live vendor states)
  banner_no_application: string
  banner_pending_approval: string
  banner_suspended: string
  banner_no_env: string
  // Empty-state box (non-live vendor states)
  empty_title_pending: string
  empty_title_suspended: string
  empty_title_default: string
  empty_subtitle: string
  // Section headers
  section_up_next: string
  section_up_next_hint: string
  section_leads: string
  section_leads_hint: string
  section_performance: string
  section_performance_hint: string
  section_insights: string
  section_insights_hint: string
  // "Up next" stat cards
  stat_this_week: string
  stat_this_week_sub: string
  stat_this_month: string
  stat_this_month_sub: string
  stat_confirmed_value: string
  stat_confirmed_value_sub: string
  // Computed lead/performance stat labels (matched by LeadStat.key)
  stat_new_inquiries: string
  stat_conversion_rate: string
  stat_avg_response_time: string
  stat_booked_leads: string
  stat_profile_views: string
  stat_inquiry_rate: string
  stat_response_time: string
  // Computed stat `sub` values (matched by literal English sub text)
  sub_this_week: string
  sub_this_month: string
  sub_last_30_days: string
  sub_vs_last_month: string
  // Empty chart cards
  empty_funnel_title: string
  empty_funnel_hint: string
  empty_sources_title: string
  empty_sources_hint: string
  empty_views_title: string
  empty_views_hint: string
  empty_bookings_revenue_title: string
  empty_bookings_revenue_hint: string
  // Upcoming bookings card
  upcoming_next_event: string // "Next event {relative} — {couple}"
  upcoming_no_events: string
  upcoming_open_link: string
  upcoming_empty_desc: string
  // Recent inquiries card
  recent_inquiries_header: string
  recent_inquiries_subtitle: string
  recent_inquiries_view_all: string
  inquiry_status_new: string
  inquiry_status_replied: string
  inquiry_status_booked: string
  inquiry_status_declined: string
  inquiry_status_closed: string
  // Conversion funnel card
  funnel_header: string
  funnel_subtitle: string
  funnel_end_to_end_suffix: string // "{pct}% end-to-end"
  funnel_baseline_label: string
  funnel_stage_inquiries: string
  funnel_stage_replied: string
  funnel_stage_quoted: string
  funnel_stage_booked: string
  // Lead sources card
  lead_sources_header: string
  lead_sources_subtitle: string
  lead_sources_share_label: string
  source_search: string
  source_featured: string
  source_direct: string
  source_referral: string
}

export interface SettingsStrings {
  fallback_name: string
  aria_change_photo: string
  section_account: string
  section_business: string
  row_full_name: string
  row_email: string
  row_password_security: string
  row_password_security_value: string
  row_business_name: string
  row_category: string
  row_account_status: string
  phone_label: string
  phone_placeholder: string
  phone_add: string
  phone_add_button: string
  phone_edit: string
  phone_save: string
  phone_saving: string
  phone_saved: string
  phone_cancel: string
  phone_error_generic: string
  phone_error_network: string
  action_edit: string
  action_manage: string
  aria_manage_security: string
  aria_edit_storefront: string
  status_active: string
  status_pending_review: string
  sign_out: string
}

export interface ReviewsStrings {
  banner_no_application: string
  banner_pending_approval: string
  banner_suspended: string
  banner_no_env: string
  stats_average_rating: string
  stats_out_of_5: string
  stats_from_prefix: string
  stats_review_singular: string
  stats_review_plural: string
  stats_rating_distribution: string
  stats_footer_note: string
  invite_coming_soon_title: string
  invite_coming_soon_hint: string
  invite_all_caught_up_title: string
  invite_all_caught_up_hint: string
  invite_request_title: string
  invite_request_hint: string
  invite_invited_pill: string
  invite_send_button: string
  invite_dismiss_title: string
  invite_dismiss_aria: string // "Dismiss {couple}"
  sort_label: string
  sort_recent: string
  sort_highest: string
  sort_lowest: string
  sort_awaiting_reply: string
  filter_all: string // "All {count}"
  filter_with_photos: string
  filter_awaiting: string // "Awaiting ({count})"
  empty_no_reviews: string
  empty_no_match_filters: string
  card_pinned_pill: string
  card_wedding_label: string
  card_reviewed_prefix: string
  action_unpin: string
  action_pin: string
  action_report: string
  reply_your_reply_prefix: string
  reply_edit: string
  reply_remove: string
  reply_placeholder: string
  reply_public_hint: string
  reply_cancel: string
  reply_post: string
  reply_publicly_button: string
  relative_today: string
  relative_yesterday: string
  relative_days_ago: string
  relative_weeks_ago: string
  relative_months_ago: string
  relative_years_ago: string
}

export interface LeadsStrings {
  tab_prospects: string
  tab_inquiries: string
  tab_conversations: string
  tab_prospects_hint: string
  tab_inquiries_hint: string
  tab_conversations_hint: string
  banner_no_application: string
  banner_pending_approval: string
  banner_suspended: string
  banner_no_env: string
  status_new: string
  status_replied: string
  status_booked: string
  status_declined: string
  status_closed: string
  empty_no_application: string
  empty_pending_approval: string
  empty_suspended: string
  empty_search_results: string // "No {tab} found for \"{query}\"."
  empty_prospects_default: string
  empty_conversations_default: string
  empty_inquiries_default: string
  search_placeholder: string
  sort_aria_label: string
  sort_title: string // "Sort: {option}"
  sort_newest: string
  sort_oldest: string
  sort_event: string
  lead_date_label: string // "Wedding date · {date}"
  date_tbc: string
  reply_button_label: string
  reply_composer_placeholder: string
  reply_menu_attach_label: string
  reply_menu_attach_aria: string
  reply_file_photos_videos: string
  reply_file_document: string
  reply_cancel_button: string
  reply_send_button: string
  reply_sending_button: string
  reply_error_file_too_large: string // "\"{filename}\" is larger than 25MB"
  reply_error_too_many_files: string
  reply_file_remove_label: string // "Remove {filename}"
  conversation_section_label: string
  conversation_loading: string
  conversation_empty: string
  proposal_panel_label: string
  proposal_field_event_date: string
  proposal_field_venue: string
  proposal_field_venue_placeholder: string
  proposal_field_guests: string
  proposal_field_guests_placeholder: string
  proposal_field_package: string
  proposal_field_package_select: string
  proposal_field_amount_label: string
  proposal_field_amount_placeholder: string
  proposal_field_details_label: string
  proposal_field_details_placeholder: string
  optional_suffix: string
  proposal_preview_label: string
  proposal_preview_total_label: string
  proposal_preview_tbc: string
  proposal_preview_date_label: string
  proposal_cancel_button: string
  proposal_send_button: string
  proposal_send_button_sending: string
  proposal_state_label: string
  proposal_state_waiting: string
  proposal_state_countered: string
  proposal_state_accepted: string
  proposal_invoice_total: string
  counter_title: string
  counter_amount_label: string
  counter_decline_button: string
  counter_back_button: string
  counter_accept_button: string
  counter_accept_button_loading: string
  counter_back_hint: string
  decline_panel_label: string
  decline_textarea_placeholder: string
  decline_cancel_button: string
  decline_confirm_button: string
  decline_confirm_button_loading: string
  action_mark_booked: string
  action_decline: string
  action_archive: string
  toast_reply_sent: string
  toast_reply_error: string
  toast_close_success: string
  toast_close_error: string
  toast_decline_success: string
  toast_decline_error: string
  toast_proposal_sent: string
  toast_proposal_error: string
  toast_counter_accepted: string
  toast_counter_error: string
  toast_status_changed: string // "Lead status updated to {status}."
  toast_status_error: string
  sample_data_prefix: string // "[SAMPLE] {name}"
  empty_detail_message: string
  anonymous_lead: string
  dev_default_vendor_name: string
}

export interface BookingsStrings {
  view_pipeline: string
  view_calendar: string
  new_booking: string
  banner_no_application: string
  banner_pending_approval: string
  banner_suspended: string
  banner_no_env: string
  needs_attention_header: string
  attention_urgent: string
  attention_follow_up: string
  attention_this_week: string
  attention_prep: string
  attention_just_done: string
  filter_all: string
  search_placeholder: string
  search_aria_label: string
  sort_aria_label: string
  sort_soonest: string
  sort_highest_value: string
  sort_recent_activity: string
  table_couple: string
  table_event_date: string
  table_stage: string
  table_value: string
  table_deposit: string
  table_last_activity: string
  table_open: string
  deposit_forfeited: string
  deposit_paid: string
  deposit_pending: string
  no_messages_yet: string
  slot_left_suffix: string
  empty_no_bookings_title: string
  empty_no_bookings_desc: string
  empty_filter_title: string
  empty_filter_desc: string
  back_to_pipeline: string
  view_month: string
  view_week: string
  view_day: string
  calendar_today: string
  calendar_previous: string
  calendar_next: string
  weekday_mon: string
  weekday_tue: string
  weekday_wed: string
  weekday_thu: string
  weekday_fri: string
  weekday_sat: string
  weekday_sun: string
  month_january: string
  month_february: string
  month_march: string
  month_april: string
  month_may: string
  month_june: string
  month_july: string
  month_august: string
  month_september: string
  month_october: string
  month_november: string
  month_december: string
  availability_open: string
  availability_limited: string
  availability_unavailable: string
  availability_closed: string
  availability_booking: string
  availability_over_capacity: string
  booking_status_pending: string
  booking_status_confirmed: string
  booking_status_completed: string
  stage_quoted: string
  stage_reserved: string
  stage_cancelled: string
  attention_item_singular: string
  attention_item_plural: string
  cta_send_reminder: string
  cta_open_contract: string
  cta_send_review_request: string
  cta_open_brief: string
  stat_upcoming_bookings: string
  stat_upcoming_hint: string
  stat_off_days: string
  stat_off_days_hint: string
  stat_over_capacity: string
  stat_over_capacity_hint: string // "Days exceeding {capacity}/day"
  capacity_title: string
  capacity_desc: string
  capacity_per_day: string
  capacity_decrease: string
  capacity_increase: string
  capacity_over_capacity_singular: string // "day over capacity"
  capacity_over_capacity_plural: string // "days over capacity"
  capacity_upcoming_bookings_suffix: string // "upcoming bookings"
  panel_selected_date: string
  panel_close: string
  panel_operating: string
  panel_off: string
  panel_booked: string // "{bookings} / {capacity} booked"
  panel_status_label: string
  panel_button_operating: string
  panel_button_mark_off: string
  panel_off_day_note_label: string
  panel_off_day_placeholder: string
  panel_off_day_hint: string
  panel_bookings_header: string // "Bookings ({bookings})"
  panel_no_bookings: string
  panel_clear_off_day: string
  day_view_no_bookings_off: string
  day_view_no_bookings: string
  day_view_continues: string // "(continues — {couple})"
  empty_panel_title: string
  empty_panel_desc: string
  week_view_over: string
  day_view_booked: string // "{bookings} / {capacity} booked"
  day_view_over_capacity: string // "Over capacity ({bookings} / {capacity})"
  block_weekday_tooltip: string // "Block all {weekday}s this month"
  detail_stage_expires: string // "Slot expires in {duration}"
  summary_header: string
  summary_package: string
  summary_total_value: string
  summary_venue: string
  summary_hours: string
  summary_deposit_label: string // "Deposit ({percent}%)"
  summary_balance: string
  summary_deposit_paid: string
  summary_deposit_pending: string
  summary_balance_due: string // "due {date}"
  action_mark_quote_accepted: string
  action_send_contract: string
  action_mark_deposit_received: string
  action_confirm_booking: string
  action_open_brief: string
  action_request_review: string
  message_quote_accepted: string
  message_contract_sent: string
  message_deposit_received: string
  message_booking_confirmed: string
  message_brief_submitted: string
  message_review_requested: string
  message_booking_rescheduled: string
  message_booking_cancelled: string
  message_invoice_issued: string
  message_action_error: string
  timeline_header: string
  payments_header: string
  payments_total: string // "Total {amount}"
  payment_status_paid: string
  payment_status_scheduled: string
  payment_status_pending: string
  payment_deposit_awaiting_transfer: string
  payment_deposit_sent_with_contract: string
  payment_deposit_received_hint: string
  payment_balance_not_scheduled: string
  payment_balance_due_hint: string // "Due {date}"
  messages_header: string
  messages_open_thread: string
  messages_from: string // "From {couple} · {time}"
  couple_card_header: string
  couple_whatsapp: string
  documents_header: string
  doc_contract: string
  doc_contract_signed: string
  doc_contract_awaiting: string
  doc_contract_not_sent: string
  doc_invoice: string
  doc_invoice_issued: string
  doc_invoice_not_issued: string
  doc_brief: string
  doc_brief_submitted: string
  doc_brief_awaiting: string
  doc_download: string // "Download {doc}"
  quick_actions_header: string
  quick_action_send_reminder: string
  quick_action_reschedule: string
  quick_action_cancel: string
  quick_action_send_invoice: string
  quick_action_mark_review: string
  reschedule_title: string
  reschedule_new_date_label: string
  reschedule_start_time_label: string
  reschedule_end_time_label: string
  reschedule_confirm: string
  reschedule_cancel: string
  reschedule_saving: string
  cancel_title: string
  cancel_desc: string
  cancel_reason_label: string
  cancel_reason_placeholder: string
  cancel_confirm: string
  cancel_cancelling: string
  cancel_keep: string
}

export interface StorefrontChromeStrings {
  banner_title: string
  banner_desc: string
  publish_success: string
  discard_success: string
  discard_button: string
  publish_button: string
}

export interface StorefrontFaqStrings {
  suggestions_header: string
  toggle_hide: string
  toggle_show_all: string
  suggestions_hint: string
  suggested_question_1: string
  suggested_question_2: string
  suggested_question_3: string
  suggested_question_4: string
  suggested_question_5: string
  suggested_question_6: string
  suggested_question_7: string
  empty_desc: string
  add_question: string
  add_another_question: string
  counts_complete_total: string // "{complete} complete · {total} total"
  saved_label: string
  saving_label: string
  save_button: string
  done_button: string
  question_index_label: string // "Question {index}"
  remove_question_aria: string
  field_question_label: string
  field_answer_label: string
  question_placeholder: string
  answer_placeholder: string
}

export interface StorefrontServicesStrings {
  banner_no_application: string
  banner_pending_approval: string
  banner_suspended: string
  banner_no_env: string
  fallback_category_label: string
  services_header: string // "{category} services"
  services_hint: string
  custom_header: string
  custom_hint: string
  custom_count_suffix: string // "{count} {suffix}"
  custom_empty: string
  remove_custom_aria: string // "Remove {label}"
  custom_field_label: string
  custom_placeholder: string
  add_service_button: string
  total_label_singular: string
  total_label_plural: string
  min_services_hint: string
  readonly_notice: string
  saving_label: string
  save_button: string
  next_button: string
  success_saved: string
  duplicate_preset_error: string // "{label} is already selected as a preset."
  duplicate_custom_error: string // "{label} is already in your list."
}

// Covers the storefront "Photos", "Team" AND "Recognition" tabs — grouped
// into one area/admin page since they're all lightweight storefront-editor
// sub-sections. Recognition keys ship first; photos/team keys are added as
// those tabs are wired.
export interface StorefrontPhotosTeamStrings {
  // Recognition — status meta
  status_pending_label: string
  status_pending_desc: string
  status_verified_label: string
  status_verified_desc: string
  status_needs_info_label: string
  status_needs_info_desc: string
  status_rejected_label: string
  status_rejected_desc: string
  // Recognition — page intro
  optional_pill: string
  optional_intro: string
  // Recognition — awards card
  card_awards_title: string
  verified_badge_title: string
  verified_badge_desc: string
  card_verified_count: string // "{count} verified"
  card_pending_count: string // "{count} pending"
  empty_awards_title: string
  empty_awards_desc: string
  upload_form_header: string
  field_award_title_label: string
  field_award_title_placeholder: string
  field_issuer_label: string
  field_issuer_placeholder: string
  field_year_label: string
  field_year_placeholder: string
  field_certificate_label: string
  accepted_files_hint: string
  submit_for_review_button: string
  // Recognition — response time card
  card_response_time_title: string
  field_reply_window_label: string
  field_reply_window_placeholder: string
  reply_window_hint: string // "Shown to couples as “Replies within {time}”. ..."
  reply_window_placeholder_var: string // fallback shown inside {time} when empty
  // Recognition — trust badges card
  card_trust_badges_title: string
  locally_owned_label: string
  locally_owned_desc: string
  // Recognition — footer bar
  footer_verified_count: string // "{count} verified"
  footer_pending_count: string // "{count} pending review"
  saved_label: string
  saving_label: string
  save_button: string
  next_button: string
  // Recognition — certificate row
  reviewer_note_label: string
  view_uploaded_file: string
  remove_certificate_aria: string
  remove_button_title: string
  submitted_label: string
  // Recognition — file drop
  choose_file_button: string
  drag_hint: string
  clear_file_aria: string
  // Team
  empty_team_desc: string
  add_team_member_button: string
  add_another_member_button: string
  team_counts_complete_total: string // "{complete} complete · {total} total"
  avatar_invalid_file_error: string
  uploading_photo_label: string
  field_full_name_label: string
  field_full_name_placeholder: string
  field_role_label: string
  field_role_placeholder: string
  field_short_bio_label: string
  field_short_bio_placeholder: string
  remove_member_aria: string
  avatar_replace_photo_aria: string
  avatar_upload_photo_aria: string
  avatar_photo_label: string
  avatar_replace_label: string
  avatar_upload_label: string
  avatar_remove_photo_aria: string
  // Photos — cover photos section
  cover_title: string
  cover_hint: string // "...Fill all {count} — slot {count} is portrait..."
  cover_upload_button: string
  cover_rules_header: string
  cover_rule_1: string
  cover_rule_2: string
  cover_rule_3: string
  cover_rule_4: string
  cover_rule_5: string
  cover_display_hint: string
  cover_pro_tip_prefix: string
  cover_pro_tip_text: string // "a {orientation} photo will look best."
  orientation_landscape: string
  orientation_portrait: string
  // Photos — portfolio section
  portfolio_title: string
  portfolio_hint: string // "Add at least {min} photos..."
  portfolio_upload_button: string
  portfolio_rules_header: string
  portfolio_rule_1: string
  portfolio_rule_2: string
  portfolio_rule_3: string
  portfolio_rule_4: string
  portfolio_rule_5: string
  portfolio_remaining_singular: string // "{remaining} more photo"
  portfolio_remaining_plural: string // "{remaining} more photos"
  portfolio_remaining_suffix: string // "to reach the {min}-photo recommendation..."
  add_photo_label: string
  // Photos — video reels section
  video_title: string
  video_hint: string
  video_upload_button: string
  video_rules_header: string
  video_rule_1: string
  video_rule_2: string
  video_rule_3: string
  video_rule_4: string
  video_rule_5: string
  video_link_header: string
  field_video_url_label: string
  field_video_url_placeholder: string
  field_video_title_label: string
  field_video_title_placeholder: string
  add_reel_button: string
  add_video_label: string
  // Photos — save/status
  save_error_prefix: string
  save_success_photos_videos: string
  footer_photo_singular: string
  footer_photo_plural: string
  footer_video_singular: string
  footer_video_plural: string
  uploading_photos_singular: string // "Uploading {count} photo…"
  uploading_photos_plural: string // "Uploading {count} photos…"
  uploading_videos_singular: string // "Uploading {count} video…"
  uploading_videos_plural: string // "Uploading {count} videos…"
  save_photos_button: string
  // Photos — upload error messages
  error_only_images: string
  error_file_too_large: string // "{filename}: file is over 10 MB after compression — try a smaller original."
  error_upload_failed_generic: string
  error_file_message: string // "{filename}: {message}"
  error_storage_rejected: string // "{filename}: storage rejected upload ({status}{body})"
  portfolio_partial_fail: string // "{success} of {total} uploaded · {failed} failed ({firstError}{more})"
  cover_partial_fail: string // "{success} of {total} covers uploaded · {firstError}{more}"
  video_partial_fail_singular: string // "{count} video upload failed ({firstError}{more})"
  video_partial_fail_plural: string // "{count} video uploads failed ({firstError}{more})"
  more_errors_suffix: string
  // Photos — tile actions (shared across photo/video/cover tiles)
  move_up_aria: string
  move_down_aria: string
  edit_caption_aria: string
  delete_aria: string
  caption_placeholder: string
  cancel_aria: string
  edit_title_aria: string
  open_video_aria: string // "Open {title}"
  title_placeholder: string
  // Photos — cover slot view
  cover_photo_alt: string
  replace_label: string
  remove_cover_aria: string
  remove_title_attr: string
  upload_cover_aria: string
  required_badge: string
  // Photos — auto-extracted video titles
  fallback_youtube_title: string
  fallback_vimeo_title: string
  fallback_video_title: string
}

// Stub interfaces for areas not yet built (content ships in a later phase).
// `Record<string,string>` so an empty `{}` fallback still satisfies the type.
export interface AuthStrings {
  footer_copyright: string
  footer_privacy_policy: string
  footer_terms: string
  auth_stalled_desc: string
  retry_button: string
  loading_aria: string
  oauth_google_button: string
  oauth_redirecting: string
  or_divider: string
  field_email_label: string
  field_email_placeholder: string
  signin_panel_title: string
  signin_panel_subtitle: string
  signin_heading: string
  signin_subtitle_forgot: string
  signin_subtitle_reset: string // "Enter the code we sent to {email} and choose a new password."
  signin_subtitle_default: string
  signin_stalled_title: string
  error_additional_verification: string
  error_incorrect_password: string
  password_failed_hint: string
  reset_email_send_error: string
  reset_incomplete_error: string
  reset_invalid_code_error: string
  oauth_google_error: string
  field_password_label: string
  forgot_password_link: string
  field_password_placeholder: string
  signin_submit_button: string
  signing_in_label: string
  new_to_opusfesta: string
  create_account_link: string
  back_to_signin_button: string
  send_reset_code_button: string
  sending_label: string
  verification_code_label: string
  new_password_label: string
  new_password_placeholder: string
  reset_submit_button: string
  resetting_label: string
  reset_partial_error: string
  signup_panel_title: string
  signup_panel_subtitle: string
  signup_heading: string
  signup_subtitle_verify: string // "Enter the 6-digit code we sent to {email}."
  signup_subtitle_default: string
  signup_stalled_title: string
  signup_create_error: string
  existing_account_title: string
  existing_account_desc: string // "{email} is already registered..."
  signin_instead_button: string
  field_first_name_label: string
  field_first_name_placeholder: string
  field_last_name_label: string
  field_last_name_placeholder: string
  create_account_button: string
  creating_account_label: string
  signup_verify_incomplete_error: string
  resend_error: string
  verify_continue_button: string
  verifying_label: string
  use_different_details_button: string
  resend_code_button: string
  already_have_account: string
  signin_link: string
  sso_finishing_label: string
}
export interface StorefrontAboutStrings {
  banner_no_application: string
  banner_pending_approval: string
  banner_suspended: string
  banner_no_env: string
  section_owner_title: string
  section_owner_hint: string
  field_logo_label: string
  field_logo_hint: string
  field_business_name_label: string
  field_business_name_placeholder: string
  field_first_name_label: string
  field_last_name_label: string
  field_years_in_business_label: string
  field_years_in_business_placeholder: string
  section_address_title: string
  section_address_hint: string
  field_house_number_label: string
  field_house_number_placeholder: string
  field_street_label: string
  field_street_placeholder: string
  field_ward_label: string
  field_ward_placeholder: string
  field_district_label: string
  field_district_placeholder: string
  field_region_label: string
  field_region_placeholder: string
  field_landmark_label: string
  field_landmark_placeholder: string
  field_postal_label: string
  field_postal_placeholder: string
  section_contact_title: string
  section_contact_hint: string
  field_phone_label: string
  field_whatsapp_label: string
  field_email_label: string
  field_email_placeholder: string
  section_socials_title: string
  section_socials_hint: string
  social_website_label: string
  social_website_placeholder: string
  social_whatsapp_label: string
  social_whatsapp_placeholder: string
  social_instagram_label: string
  social_instagram_placeholder: string
  social_facebook_label: string
  social_facebook_placeholder: string
  social_tiktok_label: string
  social_tiktok_placeholder: string
  section_service_area_title: string
  home_market_not_set: string
  home_market_hint: string
  home_market_badge: string
  field_extra_markets_label: string
  section_bio_title: string
  section_bio_hint: string
  field_short_description_label: string
  short_description_hint: string // "One line couples see... {count}/200"
  field_description_label: string
  bio_hint_empty: string // "Min {min} characters."
  bio_hint_remaining_singular: string // "{remaining} more character to go (min {min})."
  bio_hint_remaining_plural: string // "{remaining} more characters to go (min {min})."
  bio_hint_good: string // "{count} characters — looking good."
  field_languages_label: string
  section_style_title: string
  field_style_label: string
  field_personality_label: string
  unsaved_changes: string
  save_hint: string
  readonly_notice: string
  saving_label: string
  save_button: string
  next_button: string
  success_saved: string
}
export interface StorefrontPackagesStrings {
  banner_no_application: string
  banner_pending_approval: string
  banner_suspended: string
  banner_no_env: string
  card_packages_title: string
  starting_from_prefix: string
  hint_editable: string
  hint_readonly: string
  example_badge_1: string
  example_badge_2: string
  example_badge_3: string
  empty_packages_prefix: string
  pricing_page_link_text: string
  badge_saved_success: string
  card_policies_title: string
  label_deposit: string
  label_cancellation: string
  label_reschedule: string
  deposit_confirm_suffix: string // "{percent}% to confirm"
  card_payout_title: string
  payout_hint: string
  label_primary_method: string
  label_method: string
  label_bank: string
  label_network: string
  label_account_number: string
  label_lipa_namba: string
  label_number: string
  phone_prefix: string // "+255 {number}"
  label_account_holder: string
  other_methods_suffix: string // "{count} more on file"
  label_other_methods: string
  empty_payout_prefix: string
  payout_step_link_text: string
  footer_package_singular: string
  footer_package_plural: string
  footer_with_badges_suffix: string
  policies_saved_success: string
  saving_label: string
  save_button: string
  next_button: string
  edit_badge_title: string
  readonly_title: string
  add_badge_button: string
  add_badge_title: string
  untitled_package: string
  customise_badge_header: string
  close_aria: string
  field_label_label: string
  label_field_placeholder: string
  icon_section_label: string
  colour_section_label: string
  preview_fallback: string
  remove_badge_button: string
  cancel_button: string
  save_badge_button: string
  edit_link_text: string
}

export interface StorefrontAvailabilityStrings {
  intro_text: string
  weekday_short_sun: string
  weekday_short_mon: string
  weekday_short_tue: string
  weekday_short_wed: string
  weekday_short_thu: string
  weekday_short_fri: string
  weekday_short_sat: string
  weekday_full_mon: string
  weekday_full_tue: string
  weekday_full_wed: string
  weekday_full_thu: string
  weekday_full_fri: string
  weekday_full_sat: string
  weekday_full_sun: string
  month_january: string
  month_february: string
  month_march: string
  month_april: string
  month_may: string
  month_june: string
  month_july: string
  month_august: string
  month_september: string
  month_october: string
  month_november: string
  month_december: string
  today_button: string
  prev_month_aria: string
  next_month_aria: string
  status_open: string
  status_limited: string
  status_unavailable: string
  status_closed: string
  close_aria: string
  note_label: string
  note_placeholder: string
  clear_date_button: string
  done_button: string
  save_hint: string
  hours_header: string
  copy_mon_to_fri_button: string
  hours_hint: string
  hours_open_count_singular: string // "{count} day open per week"
  hours_open_count_plural: string // "{count} days open per week"
  footer_unavailable_count: string // "{count} unavailable"
  footer_limited_count: string // "{count} limited"
  footer_days_open_singular: string // "{count} day open"
  footer_days_open_plural: string // "{count} days open"
  saved_label: string
  saving_label: string
  save_button: string
  next_button: string
}

// Migrated from the static bilingual dictionary that used to live in
// lib/onboarding/strings.ts (DICT). Keys are the original dotted names
// (e.g. 'profile.location.house.label') so `useOnboardT()` could be
// re-pointed at this CMS area without touching any of its ~20 call sites.
// The EN values below are the fallback; the existing hand-translated SW
// values were seeded straight into the DB via migration so nothing
// regressed when this area went live-editable.
export interface OnboardingStrings {
  'common.back': string
  'common.continue': string
  'common.next_step': string
  'common.skip_for_now': string
  'common.cancel': string
  'common.got_it': string
  'common.why_we_ask': string
  'common.try_again': string
  'common.remove': string
  'common.not_set': string
  'common.close': string
  'common.edit': string
  'common.yes': string
  'common.no': string
  'common.other': string
  'common.none_selected': string
  'common.select_all_that_apply': string
  'stepper.aria.home': string
  'stepper.aria.progress': string
  'stepper.profile': string
  'stepper.details': string
  'stepper.pricing': string
  'stepper.review': string
  'category.title': string
  'category.custom_placeholder': string
  'category.error.title': string
  'category.error.body': string
  'vows.title': string
  'vows.subtitle': string
  'vows.cta': string
  'vows.why.title': string
  'vows.why.body1': string
  'vows.why.body2': string
  'profile.name.title': string
  'profile.name.first.label': string
  'profile.name.last.label': string
  'profile.name.business.label': string
  'profile.name.business.placeholder': string
  'profile.name.logo.label': string
  'profile.name.logo.hint': string
  'profile.location.title': string
  'profile.location.house.label': string
  'profile.location.house.placeholder': string
  'profile.location.street.label': string
  'profile.location.street.placeholder': string
  'profile.location.ward.label': string
  'profile.location.ward.placeholder': string
  'profile.location.district.label': string
  'profile.location.district.placeholder': string
  'profile.location.region.label': string
  'profile.location.region.placeholder': string
  'profile.location.landmark.label': string
  'profile.location.landmark.placeholder': string
  'profile.location.postal.label': string
  'profile.location.postal.placeholder': string
  'profile.location.phone.label': string
  'profile.location.phone.placeholder': string
  'profile.location.why.title': string
  'profile.location.why.body1': string
  'profile.location.why.body2': string
  'profile.contact.title': string
  'profile.contact.subtitle': string
  'profile.contact.email.label': string
  'profile.contact.email.placeholder': string
  'profile.contact.email.hint': string
  'profile.contact.whatsapp.label': string
  'profile.contact.whatsapp.placeholder': string
  'profile.contact.same_as_phone': string
  'profile.contact.why.title': string
  'profile.contact.why.body1': string
  'profile.contact.why.body2': string
  'profile.socials.title': string
  'profile.socials.subtitle': string
  'profile.socials.instagram.label': string
  'profile.socials.instagram.placeholder': string
  'profile.socials.tiktok.label': string
  'profile.socials.tiktok.placeholder': string
  'profile.socials.facebook.label': string
  'profile.socials.facebook.placeholder': string
  'profile.socials.website.label': string
  'profile.socials.website.placeholder': string
  'profile.socials.why.title': string
  'profile.socials.why.body1': string
  'profile.socials.why.body2': string
  'profile.markets.title': string
  'profile.markets.subtitle': string
  'profile.markets.home_suffix': string
  'profile.markets.why.title': string
  'profile.markets.why.body1': string
  'profile.markets.why.body2': string
  'details.about.title': string
  'details.about.subtitle': string
  'details.about.bio.label': string
  'details.about.bio.placeholder': string
  'details.about.bio.hint_more_one': string
  'details.about.bio.hint_more_other': string
  'details.about.bio.hint_ok': string
  'details.about.description.label': string
  'details.about.description.placeholder': string
  'details.about.description.hint': string
  'details.about.years.label': string
  'details.about.years.placeholder': string
  'details.about.languages.label': string
  'details.services.title': string
  'details.services.custom.heading': string
  'details.services.custom.hint': string
  'details.services.custom.label': string
  'details.services.custom.placeholder': string
  'details.services.custom.add': string
  'details.services.custom.remove': string
  'details.style.title': string
  'details.style.subtitle': string
  'details.personality.title': string
  'details.personality.subtitle': string
  'pricing.title': string
  'pricing.subtitle': string
  'pricing.starting_from.label': string
  'pricing.starting_from.placeholder': string
  'pricing.starting_from.hint': string
  'pricing.custom_quotes.label': string
  'pricing.custom_quotes.hint': string
  'pricing.your_packages': string
  'pricing.use_suggested': string
  'pricing.start_from_scratch': string
  'pricing.empty': string
  'pricing.use_suggested_for': string
  'pricing.package_n': string
  'pricing.package.name.label': string
  'pricing.package.name.placeholder': string
  'pricing.package.price.label': string
  'pricing.package.price.placeholder': string
  'pricing.package.desc.label': string
  'pricing.package.desc.placeholder': string
  'pricing.package.included.label': string
  'pricing.package.item_n.placeholder': string
  'pricing.add_item': string
  'pricing.add_package': string
  'pricing.remove_package': string
  'pricing.remove_item': string
  'pricing.replace.title': string
  'pricing.replace.body': string
  'pricing.replace.confirm': string
  'pricing.replace.cancel': string
  'pricing.clear.title': string
  'pricing.clear.body_one': string
  'pricing.clear.body_other': string
  'pricing.clear.confirm': string
  'pricing.clear.cancel': string
  'pricing.why.title': string
  'pricing.why.body1': string
  'pricing.why.body2': string
  'policies.title': string
  'policies.subtitle': string
  'policies.deposit.title': string
  'policies.deposit.subtitle': string
  'policies.deposit.custom.label': string
  'policies.deposit.custom.placeholder': string
  'policies.deposit.custom.error': string
  'policies.cancellation.title': string
  'policies.cancellation.subtitle': string
  'policies.reschedule.title': string
  'policies.reschedule.subtitle': string
  'policies.why.title': string
  'policies.why.body1': string
  'policies.why.body2': string
  'payout.title': string
  'payout.subtitle': string
  'payout.method_n': string
  'payout.primary': string
  'payout.make_primary': string
  'payout.method.label': string
  'payout.method.placeholder': string
  'payout.bank.label': string
  'payout.bank.placeholder': string
  'payout.network.label': string
  'payout.network.placeholder': string
  'payout.network.hint': string
  'payout.holder.label': string
  'payout.holder.placeholder': string
  'payout.holder.hint': string
  'payout.add_method': string
  'payout.max_reached': string
  'payout.remove_method': string
  'payout.provider.bank': string
  'payout.provider.merchant': string
  'payout.provider.mobile': string
  'payout.number.hint': string
  'payout.why.title': string
  'payout.why.body1': string
  'payout.why.body2': string
  'review.title': string
  'review.subtitle_edit': string
  'review.subtitle_new': string
  'review.section.profile': string
  'review.section.online': string
  'review.section.about': string
  'review.section.style': string
  'review.section.services': string
  'review.section.packages': string
  'review.section.policies': string
  'review.section.payout': string
  'review.row.business_name': string
  'review.row.category': string
  'review.row.owner': string
  'review.row.location': string
  'review.row.service_area': string
  'review.row.phone': string
  'review.row.whatsapp': string
  'review.row.email': string
  'review.row.instagram': string
  'review.row.tiktok': string
  'review.row.facebook': string
  'review.row.website': string
  'review.row.description': string
  'review.row.bio': string
  'review.row.years': string
  'review.row.languages': string
  'review.row.awards': string
  'review.row.response_time': string
  'review.row.replies_within': string
  'review.row.locally_owned': string
  'review.row.style': string
  'review.row.personality': string
  'review.row.deposit': string
  'review.row.deposit_pct': string
  'review.row.cancellation': string
  'review.row.reschedule': string
  'review.row.method': string
  'review.row.bank': string
  'review.row.network': string
  'review.row.account_number': string
  'review.row.lipa_namba': string
  'review.row.number': string
  'review.row.account_holder': string
  'review.packages.starting_from': string
  'review.packages.empty': string
  'review.packages.custom_quotes': string
  'review.packages.popular': string
  'review.packages.untitled': string
  'review.error': string
  'review.footer.save.primary': string
  'review.footer.save.secondary': string
  'review.footer.submit.primary': string
  'review.footer.submit.secondary': string
  'review.footer.saving': string
  'review.footer.submitting': string
  'review.footer.save_changes': string
  'review.footer.submit_application': string
  'review.done.badge': string
  'review.done.title': string
  'review.done.celebration_aria': string
  'review.done.body': string
  'review.done.cta': string
  'review.done.later_prefix': string
  'review.done.later_link': string
  'review.done.later_suffix': string
}

export type PortalUiStringsByArea = {
  'portal-chrome': PortalChromeStrings
  dashboard: DashboardStrings
  verify: VerifyStrings
  settings: SettingsStrings
  reviews: ReviewsStrings
  leads: LeadsStrings
  bookings: BookingsStrings
  auth: AuthStrings
  'storefront-chrome': StorefrontChromeStrings
  'storefront-about': StorefrontAboutStrings
  'storefront-packages': StorefrontPackagesStrings
  'storefront-services': StorefrontServicesStrings
  'storefront-faq': StorefrontFaqStrings
  'storefront-photos-team': StorefrontPhotosTeamStrings
  'storefront-availability': StorefrontAvailabilityStrings
  onboarding: OnboardingStrings
}

export const PORTAL_UI_STRINGS_FALLBACKS: PortalUiStringsByArea = {
  'portal-chrome': {
    nav_dashboard: 'Dashboard',
    nav_leads: 'Leads',
    nav_storefront: 'Storefront',
    nav_bookings: 'Bookings',
    nav_reviews: 'Reviews',
    nav_lead_preferences: 'Lead preferences',
    nav_plans: 'Plans',
    nav_boost_storefront: 'Boost storefront',
    badge_new: 'NEW',
    nav_insights: 'Insights',
    nav_help_center: 'Help center',
    nav_feedback: 'Feedback',
    nav_settings: 'Settings',
    section_your_business: 'Your business',
    section_grow: 'Grow',
    search_placeholder: 'Search…',
    aria_expand_sidebar: 'Expand sidebar',
    aria_collapse_sidebar: 'Collapse sidebar',
    aria_search: 'Search',
    greeting_title: 'Welcome back, {vendorName}.',
    greeting_subtitle: "Here's what's happening with your storefront today.",
    page_leads_subtitle: 'Inquiries from interested couples. Reply within 48-72 hours to boost your match rate.',
    page_reviews_subtitle: 'Auto-collected from couples after every event. Reply, pin, or request a review.',
    storefront_fallback_title: 'Storefront',
    storefront_fallback_subtitle: 'Manage your storefront.',
    page_bookings_subtitle: 'Track every couple from quote to wedding day.',
    page_bookings_calendar_title: 'Bookings calendar',
    page_bookings_calendar_subtitle: 'See every booked, pending, and off-day at a glance.',
    booking_detail_fallback_title: 'Booking',
    booking_detail_fallback_subtitle: 'Booking details and timeline.',
    aria_help: 'Help',
    aria_notifications: 'Notifications',
    aria_profile_settings: 'Profile settings',
    view_public_storefront: 'View public storefront',
  },
  dashboard: {
    banner_no_application: "You haven't started a vendor application yet. Apply to do business on OpusFesta to access the dashboard.",
    banner_pending_approval: 'Your vendor application is awaiting OpusFesta verification. The dashboard unlocks once your account is approved.',
    banner_suspended: 'Your vendor account is suspended. Contact OpusFesta support if you believe this is a mistake.',
    banner_no_env: 'DEV: Vendor backend not connected — showing seed data. Check Supabase env vars and that migrations are applied to your Supabase project.',
    empty_title_pending: 'Your dashboard will appear here once OpusFesta approves your vendor profile.',
    empty_title_suspended: 'Your vendor account is suspended.',
    empty_title_default: "Your dashboard will appear here once you've applied and been approved.",
    empty_subtitle: "You'll see leads, upcoming events, and storefront performance once your account is active.",
    section_up_next: 'Up next',
    section_up_next_hint: 'Upcoming events and reservations',
    section_leads: 'Leads',
    section_leads_hint: 'Inquiries, conversion, sources',
    section_performance: 'Performance',
    section_performance_hint: 'How your storefront is doing',
    section_insights: 'Insights',
    section_insights_hint: 'Bookings and revenue trends',
    stat_this_week: 'This week',
    stat_this_week_sub: 'events scheduled',
    stat_this_month: 'This month',
    stat_this_month_sub: 'upcoming bookings',
    stat_confirmed_value: 'Confirmed value',
    stat_confirmed_value_sub: 'across all confirmed events',
    stat_new_inquiries: 'New inquiries',
    stat_conversion_rate: 'Conversion rate',
    stat_avg_response_time: 'Avg response time',
    stat_booked_leads: 'Booked leads',
    stat_profile_views: 'Profile views',
    stat_inquiry_rate: 'Inquiry rate',
    stat_response_time: 'Response time',
    sub_this_week: 'This week',
    sub_this_month: 'This month',
    sub_last_30_days: 'Last 30 days',
    sub_vs_last_month: 'vs last month',
    empty_funnel_title: 'Conversion funnel',
    empty_funnel_hint: 'No inquiries in the last 90 days yet. Your funnel will appear once couples start reaching out.',
    empty_sources_title: 'Where leads come from',
    empty_sources_hint: "Once couples discover your storefront, you'll see the breakdown here.",
    empty_views_title: 'Profile views',
    empty_views_hint: "Your storefront hasn't been viewed yet. Track activity will show here as visits roll in.",
    empty_bookings_revenue_title: 'Bookings & revenue',
    empty_bookings_revenue_hint: 'No confirmed bookings yet. This trend chart unlocks once you accept and invoice your first event.',
    upcoming_next_event: 'Next event {relative} — {couple}',
    upcoming_no_events: 'No upcoming events',
    upcoming_open_link: 'Open bookings',
    upcoming_empty_desc: 'Nothing on the horizon yet. Quoted couples will appear here once they reserve.',
    recent_inquiries_header: 'Recent inquiries',
    recent_inquiries_subtitle: 'Couples who reached out recently.',
    recent_inquiries_view_all: 'View all',
    inquiry_status_new: 'New',
    inquiry_status_replied: 'Replied',
    inquiry_status_booked: 'Booked',
    inquiry_status_declined: 'Declined',
    inquiry_status_closed: 'Closed',
    funnel_header: 'Conversion funnel',
    funnel_subtitle: 'How leads move from inquiry to booked — last 90 days',
    funnel_end_to_end_suffix: '{pct}% end-to-end',
    funnel_baseline_label: 'baseline',
    funnel_stage_inquiries: 'Inquiries',
    funnel_stage_replied: 'Replied',
    funnel_stage_quoted: 'Quoted',
    funnel_stage_booked: 'Booked',
    lead_sources_header: 'Where leads come from',
    lead_sources_subtitle: 'Share of inquiries by source — last 90 days',
    lead_sources_share_label: 'Share',
    source_search: 'Search',
    source_featured: 'Featured',
    source_direct: 'Direct',
    source_referral: 'Referral',
  },
  verify: {
    heading_under_review: "We're reviewing your application",
    heading_corrections: 'Re-upload the documents we flagged',
    heading_default: 'Verify your business',
    subtitle_under_review:
      "Thanks for submitting everything, you're all done. Here's the full picture of your verification while our team reviews it.",
    subtitle_corrections: 'Pick up the flagged item below and re-submit. Re-reviews are typically completed within 1 business day.',
    subtitle_default: "Three steps to admin review. Most vendors hear back within 2 to 3 business days once they've finished.",
    action_required_pill: 'Action required',
    edit_application_prompt: 'Need to update your business details?',
    edit_application_link: 'Edit application',
    sign_out: 'Sign out',
    journey_title: 'Your verification journey',
    journey_aria_label: 'Verification progress',
    journey_complete_of: '{done}/{total} complete',
    step_application_title: 'Application',
    step_application_description: 'Business profile, services, packages, and portfolio captured during onboarding.',
    step_application_done_label: 'Submitted',
    step_payout_title: 'Payout setup',
    step_payout_description: 'Payout method recorded during onboarding. The final name match happens during admin review.',
    step_payout_done_label: 'Submitted',
    step_identity_title: 'Identity verification',
    step_identity_done_description: 'National ID (front + back) and liveness selfie captured. Awaiting admin review.',
    step_identity_active_description:
      'Take a photo of the front and back of your Tanzania National ID (NIDA), then a quick selfie to confirm it’s you.',
    step_identity_done_label: 'Awaiting review',
    step_identity_active_label: 'In progress',
    step_optional_title: 'Optional documents',
    step_optional_done_added_description: 'Optional documents added. Thanks, this helps speed up review.',
    step_optional_done_skipped_description: 'Skipped for now. Your National ID alone is enough to get approved.',
    step_optional_active_description:
      'Not required to get approved. Your National ID is enough. Adding your TIN or business license builds trust and can speed up review.',
    step_optional_locked_description: 'Unlocks once your identity is verified.',
    step_optional_done_added_label: 'Added',
    step_optional_done_skipped_label: 'Skipped',
    step_optional_active_label: 'Optional',
    optional_doc_tin_title: 'TRA TIN certificate',
    optional_doc_tin_description: 'Your tax ID certificate from the Tanzania Revenue Authority.',
    optional_doc_license_title: 'Business license',
    optional_doc_license_description: 'BRELA registration, council license, or a sole-proprietor declaration.',
    optional_doc_awaiting_review: 'Awaiting review',
    optional_doc_optional_pill: 'Optional',
    skip_to_agreement: 'Skip to agreement',
    continue_to_agreement: 'Continue to agreement',
    step_agreement_title: 'Vendor agreement',
    step_agreement_done_description:
      'All {count} documents signed. Separate from the Vendor Vows you accepted during onboarding.',
    step_agreement_active_description:
      'Read and e-sign each part of the OpusFesta Mkataba wa Watoa Huduma (OF-LGL-AGR-002): the main contract and its two schedules. Each is signed separately. This is the legally binding agreement, distinct from the Vendor Vows pledge.',
    step_agreement_locked_id_description: 'Unlocks once your identity is verified.',
    step_agreement_locked_optional_description: 'Add the optional documents above, or skip, to continue.',
    step_agreement_done_label: 'Signed',
    step_agreement_active_default_label: 'In progress',
    step_agreement_signed_of: '{done}/{total} signed',
    step_review_title: 'Under review',
    step_review_active_description:
      "Everything's in. Our team is verifying your details, documents, payout, and portfolio, and we'll email you the moment your dashboard unlocks. Usually 2 to 3 business days.",
    step_review_locked_description: 'Once the steps above are complete, our team verifies your details and approves your storefront. Usually 2 to 3 business days.',
    step_review_active_label: 'In progress',
    upload_business_license_tab: 'Business license',
    upload_sole_proprietor_tab: 'Sole-proprietor declaration',
    upload_uploaded_prefix: 'uploaded {relative}',
    upload_admin_notes_prefix: 'Admin notes:',
    upload_uploading: 'Uploading…',
    upload_replace_file: 'Replace file',
    upload_document: 'Upload document',
    upload_corrected_document: 'Upload corrected document',
    upload_file_types_hint: 'JPG · PNG · WEBP · PDF · up to 10MB',
    agreement_intro:
      'The agreement comes in {count} parts: the main contract and its two schedules. Read and e-sign each one separately. They’re all part of the same binding contract (OF-LGL-AGR-002).',
    agreement_download_pdf: 'Download PDF',
    agreement_pdf_unavailable: 'Your browser can’t display the PDF inline.',
    agreement_pdf_unavailable_suffix: 'to read it in full before signing.',
    agreement_open_new_tab: 'Open the document in a new tab',
    agreement_ack_prefix: 'I have read {title} ({code}) and agree to its terms on behalf of my business.',
    agreement_business_info_full_title: 'Taarifa za Biashara',
    agreement_business_info_schedule_title: 'Taarifa za Mtoa Huduma',
    agreement_sehemu_b: 'SEHEMU B',
    agreement_confirm_hint: 'Confirm the details that appear on the signature page. Edit anything that’s out of date.',
    agreement_name_label: 'Type your full legal name to sign',
    agreement_name_hint: 'Must match the name on your National ID. Your IP and timestamp are recorded for the signature audit trail.',
    agreement_signature_label: 'Or draw your signature',
    agreement_signed_label: 'Signed',
    agreement_sign_button: 'Sign',
    agreement_hide_button: 'Hide',
    agreement_signing_button: 'Signing…',
    agreement_submit_button: 'Sign and submit',
    field_business_name_label: 'Jina la Biashara',
    field_business_name_hint: 'Business name',
    field_tin_label: 'TIN',
    field_tin_hint: 'Tax Identification Number',
    field_business_address_label: 'Anwani ya Biashara',
    field_business_address_hint: 'Business address',
    field_contact_person_label: 'Mtu wa Mawasiliano',
    field_contact_person_hint: 'Contact person',
    field_email_label: 'Barua Pepe',
    field_email_hint: 'Email',
    field_phone_label: 'WhatsApp / Simu',
    field_phone_hint: 'WhatsApp / phone',
    field_service_type_label: 'Aina ya Huduma',
    field_service_type_hint: 'Type of service',
    field_position_label: 'Cheo',
    field_position_hint: 'Position / title',
    field_nida_label: 'Kitambulisho (NIDA)',
    field_nida_hint: 'National ID number',
    need_help_prompt: 'Need help?',
    contact_email_label: 'vendors@opusfesta.com',
    validation_ack_required: 'Tick the acknowledgement box before signing.',
    validation_name_required: 'Type your full legal name to sign.',
    validation_fill_before_signing: 'Fill in {label} before signing.',
    submit_generic_error: 'Something went wrong while submitting your signature. Please try again.',
    relative_just_now: 'just now',
    relative_minutes_ago: '{n}m ago',
    relative_hours_ago: '{n}h ago',
    relative_days_ago: '{n}d ago',
    id_step_title: 'Identity verification',
    id_step_front: 'ID — Front',
    id_step_back: 'ID — Back',
    id_step_selfie: 'Liveness selfie',
    id_step_retake: 'Retake',
    id_step_capture: 'Take photo',
    id_step_qr_prompt: 'Or scan this QR code with your phone to capture from there instead.',
    id_step_qr_button: 'Use my phone instead',
    id_capture_hint_selfie: 'Center your face in the oval, look at the camera, then take the photo.',
    id_capture_hint_card: 'Fit the card inside the frame, then take the photo.',
    id_error_bad_type: 'Upload a JPG, PNG, or WEBP photo of your ID.',
    id_error_empty_file: 'That file is empty — pick another photo.',
    id_error_too_large: 'Photo is too large (max 15 MB). Pick a smaller one.',
    id_error_read_failed: 'Could not read that photo — try another.',
    id_qr_mint_error: 'Couldn’t generate a phone link — capture here on this device instead.',
    id_tile_captured: 'Captured',
    id_tile_not_captured: 'Not captured yet',
    id_tile_replace_by_upload: 'Replace by upload',
    id_tile_upload_instead: 'Upload instead',
    id_qr_heading: 'No camera here? Use your phone',
    id_qr_description: 'Scan this code with your phone’s camera to take the ID photos and selfie there. They’ll appear here automatically.',
    id_qr_alt: 'QR code to capture on your phone',
    id_selfie_hint_ready: 'Take a quick selfie so we can confirm it’s really you.',
    id_selfie_hint_locked: 'Unlocks after both sides of your ID are captured.',
    signature_placeholder: 'Sign here with your finger or mouse',
    signature_hint: 'Drawing your signature is optional — typing your full legal name above is what we record on the agreement.',
    signature_clear: 'Clear',
    signature_aria_label: 'Signature pad',
    status_suspended_title: 'Your account is suspended',
    status_suspended_body: 'Contact OpusFesta support if you believe this is a mistake.',
  },
  settings: {
    fallback_name: 'Your profile',
    aria_change_photo: 'Change photo',
    section_account: 'Account',
    section_business: 'Business',
    row_full_name: 'Full name',
    row_email: 'Email',
    row_password_security: 'Password & security',
    row_password_security_value: 'Manage 2FA, passwords, and connected accounts',
    row_business_name: 'Business name',
    row_category: 'Category',
    row_account_status: 'Account status',
    phone_label: 'Phone',
    phone_placeholder: '+255 7XX XXX XXX',
    phone_add: 'Add phone number',
    phone_add_button: 'Add',
    phone_edit: 'Edit',
    phone_save: 'Save',
    phone_saving: 'Saving…',
    phone_saved: 'Saved ✓',
    phone_cancel: 'Cancel',
    phone_error_generic: 'Failed to save. Please try again.',
    phone_error_network: 'Network error. Please try again.',
    action_edit: 'Edit',
    action_manage: 'Manage',
    aria_manage_security: 'Manage security',
    aria_edit_storefront: 'Edit storefront',
    status_active: 'Active',
    status_pending_review: 'Pending review',
    sign_out: 'Sign out',
  },
  reviews: {
    banner_no_application: "You haven't started a vendor application yet. Apply to do business on OpusFesta to start collecting reviews.",
    banner_pending_approval: 'Your vendor application is awaiting OpusFesta verification. Reviews unlock once your account is approved.',
    banner_suspended: 'Your vendor account is suspended. Contact OpusFesta support if you believe this is a mistake.',
    banner_no_env: 'DEV: Vendor backend not connected — showing seed data. Check Supabase env vars and that migrations are applied to your Supabase project.',
    stats_average_rating: 'Average rating',
    stats_out_of_5: '/ 5',
    stats_from_prefix: 'from',
    stats_review_singular: 'review',
    stats_review_plural: 'reviews',
    stats_rating_distribution: 'Rating distribution',
    stats_footer_note: "OpusFesta auto-collects reviews from couples after each event — you can't write or delete them, but you can reply, pin, or report. Verified reviews boost search ranking.",
    invite_coming_soon_title: 'Review invites coming soon',
    invite_coming_soon_hint: "Invites unlock once the bookings module ships — couples need a completed booking before we can email them on your behalf.",
    invite_all_caught_up_title: 'All caught up',
    invite_all_caught_up_hint: 'No past bookings are waiting on a review invite.',
    invite_request_title: 'Request reviews',
    invite_request_hint: "Past bookings that haven't left a review yet. We send the couple a polite, OpusFesta-branded email — your storefront's rating only updates if they post.",
    invite_invited_pill: 'Invited',
    invite_send_button: 'Invite',
    invite_dismiss_title: 'Dismiss',
    invite_dismiss_aria: 'Dismiss {couple}',
    sort_label: 'Sort',
    sort_recent: 'Most recent',
    sort_highest: 'Highest',
    sort_lowest: 'Lowest',
    sort_awaiting_reply: 'Awaiting reply',
    filter_all: 'All {count}',
    filter_with_photos: 'With photos',
    filter_awaiting: 'Awaiting ({count})',
    empty_no_reviews: 'No reviews yet — couples leave reviews after their event.',
    empty_no_match_filters: 'No reviews match these filters.',
    card_pinned_pill: 'Pinned',
    card_wedding_label: 'Wedding',
    card_reviewed_prefix: 'Reviewed',
    action_unpin: 'Unpin',
    action_pin: 'Pin to top',
    action_report: 'Report',
    reply_your_reply_prefix: 'Your reply',
    reply_edit: 'Edit',
    reply_remove: 'Remove',
    reply_placeholder: 'Thank the couple, address any concern with grace, keep it short. Other couples will read this.',
    reply_public_hint: 'Replies are public. Stick to facts; never share private contact info.',
    reply_cancel: 'Cancel',
    reply_post: 'Post reply',
    reply_publicly_button: 'Reply publicly',
    relative_today: 'today',
    relative_yesterday: 'yesterday',
    relative_days_ago: '{n}d ago',
    relative_weeks_ago: '{n}w ago',
    relative_months_ago: '{n}mo ago',
    relative_years_ago: '{n}y ago',
  },
  leads: {
    tab_prospects: 'Prospects',
    tab_inquiries: 'Inquiries',
    tab_conversations: 'Conversations',
    tab_prospects_hint: 'New leads awaiting your first reply',
    tab_inquiries_hint: 'Active conversations you have replied to',
    tab_conversations_hint: 'Booked, declined, and archived leads',
    banner_no_application: "You haven't started a vendor application yet. Apply to do business on OpusFesta to receive leads.",
    banner_pending_approval: 'Your vendor application is awaiting OpusFesta verification. Leads unlock once your account is approved.',
    banner_suspended: 'Your vendor account is suspended. Contact OpusFesta support if you believe this is a mistake.',
    banner_no_env: 'DEV: Vendor backend not connected — showing seed data. Check Supabase env vars and that migrations are applied to your Supabase project.',
    status_new: 'New',
    status_replied: 'Replied',
    status_booked: 'Booked',
    status_declined: 'Declined',
    status_closed: 'Closed',
    empty_no_application: 'No vendor application yet.',
    empty_pending_approval: 'Awaiting verification.',
    empty_suspended: 'Account suspended.',
    empty_search_results: 'No {tab} found for "{query}".',
    empty_prospects_default: 'No new prospects right now. Fresh leads land here first.',
    empty_conversations_default: 'No resolved leads yet. Booked and archived leads appear here.',
    empty_inquiries_default: 'No active inquiries yet. Reply to a prospect to start a conversation.',
    search_placeholder: 'Search couples…',
    sort_aria_label: 'Sort leads',
    sort_title: 'Sort: {option}',
    sort_newest: 'Newest first',
    sort_oldest: 'Oldest first',
    sort_event: 'Event date soonest',
    lead_date_label: 'Wedding date · {date}',
    date_tbc: 'Date TBC',
    reply_button_label: 'Reply',
    reply_composer_placeholder: 'Write a personalised reply…',
    reply_menu_attach_label: 'Attach',
    reply_menu_attach_aria: 'Add attachment',
    reply_file_photos_videos: 'Photos & videos',
    reply_file_document: 'Document',
    reply_cancel_button: 'Cancel',
    reply_send_button: 'Send reply',
    reply_sending_button: 'Sending…',
    reply_error_file_too_large: '"{filename}" is larger than 25MB',
    reply_error_too_many_files: 'You can attach up to 6 files',
    reply_file_remove_label: 'Remove {filename}',
    conversation_section_label: 'Conversation',
    conversation_loading: 'Loading…',
    conversation_empty: 'No messages yet. Use "Reply" to start the conversation.',
    proposal_panel_label: 'Send proposal (recap + quote)',
    proposal_field_event_date: 'Event date',
    proposal_field_venue: 'Venue',
    proposal_field_venue_placeholder: 'e.g. Mlimani City Hall',
    proposal_field_guests: 'Guests',
    proposal_field_guests_placeholder: 'e.g. 150',
    proposal_field_package: 'Package',
    proposal_field_package_select: 'Select a package',
    proposal_field_amount_label: 'Invoice amount (TZS)',
    proposal_field_amount_placeholder: 'e.g. 2500000',
    proposal_field_details_label: 'Invoice details',
    proposal_field_details_placeholder: "What's included, timeline, any conditions…",
    optional_suffix: '(optional)',
    proposal_preview_label: 'Preview',
    proposal_preview_total_label: 'Invoice total',
    proposal_preview_tbc: 'TBC',
    proposal_preview_date_label: 'Date',
    proposal_cancel_button: 'Cancel',
    proposal_send_button: 'Send proposal',
    proposal_send_button_sending: 'Sending…',
    proposal_state_label: 'Proposal',
    proposal_state_waiting: 'Waiting for client response',
    proposal_state_countered: 'Client sent a counter',
    proposal_state_accepted: 'Proposal accepted',
    proposal_invoice_total: 'Invoice total',
    counter_title: 'Counter from client',
    counter_amount_label: 'Counter amount:',
    counter_decline_button: 'Decline',
    counter_back_button: 'Counter back',
    counter_accept_button: 'Accept counter',
    counter_accept_button_loading: 'Accepting…',
    counter_back_hint: '"Counter back" sends a revised proposal. Use the proposal form below to set new terms.',
    decline_panel_label: 'Decline — add a reason',
    decline_textarea_placeholder: 'e.g. Date not available, outside service area…',
    decline_cancel_button: 'Cancel',
    decline_confirm_button: 'Confirm decline',
    decline_confirm_button_loading: 'Declining…',
    action_mark_booked: 'Mark as booked',
    action_decline: 'Decline',
    action_archive: 'Archive',
    toast_reply_sent: 'Reply sent.',
    toast_reply_error: 'Could not send reply.',
    toast_close_success: 'Lead marked as closed.',
    toast_close_error: 'Could not close this lead.',
    toast_decline_success: 'Lead declined.',
    toast_decline_error: 'Could not decline this lead.',
    toast_proposal_sent: 'Proposal sent.',
    toast_proposal_error: 'Could not send proposal.',
    toast_counter_accepted: 'Counter accepted. Lead moved to booked.',
    toast_counter_error: 'Could not accept counter offer.',
    toast_status_changed: 'Lead status updated to {status}.',
    toast_status_error: 'Could not update lead status.',
    sample_data_prefix: '[SAMPLE] {name}',
    empty_detail_message: 'Select an inquiry to view details.',
    anonymous_lead: 'Anonymous lead',
    dev_default_vendor_name: 'Your Business',
  },
  bookings: {
    view_pipeline: 'Pipeline',
    view_calendar: 'Calendar',
    new_booking: 'New booking',
    banner_no_application: "You haven't started a vendor application yet. Apply to do business on OpusFesta to manage bookings.",
    banner_pending_approval: 'Your vendor application is awaiting OpusFesta verification. Bookings unlock once your account is approved.',
    banner_suspended: 'Your vendor account is suspended. Contact OpusFesta support if you believe this is a mistake.',
    banner_no_env: 'DEV: Vendor backend not connected — showing seed data. Check Supabase env vars and that migrations are applied to your Supabase project.',
    needs_attention_header: 'Needs attention',
    attention_urgent: 'Urgent',
    attention_follow_up: 'Follow up',
    attention_this_week: 'This week',
    attention_prep: 'Prep',
    attention_just_done: 'Just done',
    filter_all: 'All',
    search_placeholder: 'Search couple, venue…',
    search_aria_label: 'Search bookings',
    sort_aria_label: 'Sort bookings',
    sort_soonest: 'Soonest event',
    sort_highest_value: 'Highest value',
    sort_recent_activity: 'Recent activity',
    table_couple: 'Couple',
    table_event_date: 'Event date',
    table_stage: 'Stage',
    table_value: 'Value',
    table_deposit: 'Deposit',
    table_last_activity: 'Last activity',
    table_open: 'Open',
    deposit_forfeited: 'Forfeited',
    deposit_paid: 'Paid',
    deposit_pending: 'Pending',
    no_messages_yet: 'No messages yet',
    slot_left_suffix: 'left',
    empty_no_bookings_title: 'No bookings yet',
    empty_no_bookings_desc: 'Couples who accept your quotes show up here. Add a manual booking if you took an inquiry off-platform.',
    empty_filter_title: 'No bookings match these filters',
    empty_filter_desc: 'Try clearing the search or switching to "All" to see every booking.',
    back_to_pipeline: 'Back to pipeline',
    view_month: 'Month',
    view_week: 'Week',
    view_day: 'Day',
    calendar_today: 'Today',
    calendar_previous: 'Previous',
    calendar_next: 'Next',
    weekday_mon: 'Mon',
    weekday_tue: 'Tue',
    weekday_wed: 'Wed',
    weekday_thu: 'Thu',
    weekday_fri: 'Fri',
    weekday_sat: 'Sat',
    weekday_sun: 'Sun',
    month_january: 'January',
    month_february: 'February',
    month_march: 'March',
    month_april: 'April',
    month_may: 'May',
    month_june: 'June',
    month_july: 'July',
    month_august: 'August',
    month_september: 'September',
    month_october: 'October',
    month_november: 'November',
    month_december: 'December',
    availability_open: 'Open',
    availability_limited: 'Limited',
    availability_unavailable: 'Unavailable',
    availability_closed: 'Closed',
    availability_booking: 'Booking',
    availability_over_capacity: 'Over capacity',
    booking_status_pending: 'Pending',
    booking_status_confirmed: 'Confirmed',
    booking_status_completed: 'Completed',
    stage_quoted: 'Quoted',
    stage_reserved: 'Reserved',
    stage_cancelled: 'Cancelled',
    attention_item_singular: 'item',
    attention_item_plural: 'items',
    cta_send_reminder: 'Send reminder',
    cta_open_contract: 'Open contract',
    cta_send_review_request: 'Send request',
    cta_open_brief: 'Open brief',
    stat_upcoming_bookings: 'Upcoming bookings',
    stat_upcoming_hint: 'Confirmed and pending events',
    stat_off_days: 'Off days set',
    stat_off_days_hint: 'Vacation, training, etc.',
    stat_over_capacity: 'Over capacity',
    stat_over_capacity_hint: 'Days exceeding {capacity}/day',
    capacity_title: 'Parallel-booking capacity',
    capacity_desc: "How many weddings your team can run on the same day. Solo vendors stay at 1; venues and multi-team studios can accept more. Couples can't request a date once it fills up.",
    capacity_per_day: '/ day',
    capacity_decrease: 'Decrease capacity',
    capacity_increase: 'Increase capacity',
    capacity_over_capacity_singular: 'day over capacity',
    capacity_over_capacity_plural: 'days over capacity',
    capacity_upcoming_bookings_suffix: 'upcoming bookings',
    panel_selected_date: 'Selected date',
    panel_close: 'Close panel',
    panel_operating: 'Operating',
    panel_off: 'Off',
    panel_booked: '{bookings} / {capacity} booked',
    panel_status_label: 'Operating status',
    panel_button_operating: 'Operating',
    panel_button_mark_off: 'Mark off',
    panel_off_day_note_label: 'Off-day note',
    panel_off_day_placeholder: 'e.g. Personal leave, training day',
    panel_off_day_hint: "Saves on blur. Couples don't see this — only that the date is unavailable.",
    panel_bookings_header: 'Bookings ({bookings})',
    panel_no_bookings: 'No bookings on this date.',
    panel_clear_off_day: 'Clear off-day mark',
    day_view_no_bookings_off: 'No bookings — and the day is marked off.',
    day_view_no_bookings: 'No bookings on this day yet.',
    day_view_continues: '(continues — {couple})',
    empty_panel_title: 'Click any date',
    empty_panel_desc: 'Mark it as off-day or see the bookings already scheduled for that date.',
    week_view_over: 'over',
    day_view_booked: '{bookings} / {capacity} booked',
    day_view_over_capacity: 'Over capacity ({bookings} / {capacity})',
    block_weekday_tooltip: 'Block all {weekday}s this month',
    detail_stage_expires: 'Slot expires in {duration}',
    summary_header: 'Summary',
    summary_package: 'Package',
    summary_total_value: 'Total value',
    summary_venue: 'Venue',
    summary_hours: 'Hours',
    summary_deposit_label: 'Deposit ({percent}%)',
    summary_balance: 'Balance',
    summary_deposit_paid: 'Paid',
    summary_deposit_pending: 'Pending',
    summary_balance_due: 'due {date}',
    action_mark_quote_accepted: 'Mark quote accepted',
    action_send_contract: 'Send contract',
    action_mark_deposit_received: 'Mark deposit received',
    action_confirm_booking: 'Confirm booking',
    action_open_brief: 'Open day-of brief',
    action_request_review: 'Request review',
    message_quote_accepted: 'Offer marked as accepted.',
    message_contract_sent: 'Contract marked as sent.',
    message_deposit_received: 'Deposit recorded as received.',
    message_booking_confirmed: 'Booking confirmed.',
    message_brief_submitted: 'Day-of brief marked as submitted.',
    message_review_requested: 'Review request marked as sent.',
    message_booking_rescheduled: 'Booking rescheduled.',
    message_booking_cancelled: 'Booking cancelled.',
    message_invoice_issued: 'Invoice marked as issued.',
    message_action_error: 'Could not update booking.',
    timeline_header: 'Timeline',
    payments_header: 'Payments',
    payments_total: 'Total {amount}',
    payment_status_paid: 'Paid',
    payment_status_scheduled: 'Scheduled',
    payment_status_pending: 'Pending',
    payment_deposit_awaiting_transfer: 'Awaiting transfer',
    payment_deposit_sent_with_contract: 'Sent with contract',
    payment_deposit_received_hint: 'Received',
    payment_balance_not_scheduled: 'Not yet scheduled',
    payment_balance_due_hint: 'Due {date}',
    messages_header: 'Latest message',
    messages_open_thread: 'Open thread',
    messages_from: 'From {couple} · {time}',
    couple_card_header: 'Contact',
    couple_whatsapp: 'WhatsApp',
    documents_header: 'Documents',
    doc_contract: 'Contract',
    doc_contract_signed: 'Signed',
    doc_contract_awaiting: 'Sent — awaiting signature',
    doc_contract_not_sent: 'Not yet sent',
    doc_invoice: 'Invoice',
    doc_invoice_issued: 'Issued',
    doc_invoice_not_issued: 'Not issued',
    doc_brief: 'Day-of brief',
    doc_brief_submitted: 'Submitted',
    doc_brief_awaiting: 'Awaiting from couple',
    doc_download: 'Download {doc}',
    quick_actions_header: 'Quick actions',
    quick_action_send_reminder: 'Send reminder',
    quick_action_reschedule: 'Reschedule',
    quick_action_cancel: 'Cancel booking',
    quick_action_send_invoice: 'Send invoice',
    quick_action_mark_review: 'Mark for review',
    reschedule_title: 'Reschedule booking',
    reschedule_new_date_label: 'New date',
    reschedule_start_time_label: 'Start time',
    reschedule_end_time_label: 'End time',
    reschedule_confirm: 'Confirm reschedule',
    reschedule_cancel: 'Cancel',
    reschedule_saving: 'Saving…',
    cancel_title: 'Cancel this booking?',
    cancel_desc: 'This will mark the booking as cancelled. Contact the couple separately if a refund or communication is needed.',
    cancel_reason_label: 'Reason (optional)',
    cancel_reason_placeholder: 'e.g. Couple changed plans, venue no longer available…',
    cancel_confirm: 'Yes, cancel booking',
    cancel_cancelling: 'Cancelling…',
    cancel_keep: 'Keep booking',
  },
  auth: {
    footer_copyright: '© OpusFesta. All rights reserved.',
    footer_privacy_policy: 'Privacy Policy',
    footer_terms: 'Terms & Conditions',
    auth_stalled_desc: "We couldn't reach the authentication service. Please try again.",
    retry_button: 'Retry',
    loading_aria: 'Loading',
    oauth_google_button: 'Continue with Google',
    oauth_redirecting: 'Redirecting…',
    or_divider: 'or',
    field_email_label: 'Email address',
    field_email_placeholder: 'you@business.co.tz',
    signin_panel_title: 'Welcome back to OpusFesta',
    signin_panel_subtitle: 'Pick up right where you left off — your leads, bookings, and storefront, all in one place.',
    signin_heading: 'Sign in to your account',
    signin_subtitle_forgot: "Enter your email and we'll send a reset code.",
    signin_subtitle_reset: 'Enter the code we sent to {email} and choose a new password.',
    signin_subtitle_default: 'Welcome back — sign in to manage your storefront.',
    signin_stalled_title: 'Sign-in is temporarily unavailable',
    error_additional_verification: 'Additional verification is required to sign in.',
    error_incorrect_password: 'Incorrect email or password.',
    password_failed_hint: 'Signed up with Google? Use Continue with Google above. To set a password, use Forgot password?.',
    reset_email_send_error: "We couldn't send a reset code to that email.",
    reset_incomplete_error: "That code didn't complete the reset. Please try again.",
    reset_invalid_code_error: 'Invalid or expired code.',
    oauth_google_error: "Couldn't continue with Google.",
    field_password_label: 'Password',
    forgot_password_link: 'Forgot password?',
    field_password_placeholder: 'Enter your password',
    signin_submit_button: 'Sign in',
    signing_in_label: 'Signing in…',
    new_to_opusfesta: 'New to OpusFesta?',
    create_account_link: 'Create an account',
    back_to_signin_button: 'Back to sign in',
    send_reset_code_button: 'Send reset code',
    sending_label: 'Sending…',
    verification_code_label: 'Verification code',
    new_password_label: 'New password',
    new_password_placeholder: 'At least 8 characters',
    reset_submit_button: 'Reset password & sign in',
    resetting_label: 'Resetting…',
    reset_partial_error: 'Your password was reset, but sign-in needs another step.',
    signup_panel_title: 'Grow your business with OpusFesta',
    signup_panel_subtitle: 'List your services, reach couples planning their big day, and manage every booking — leads, quotes, and payments — from one dashboard.',
    signup_heading: 'Create your vendor account',
    signup_subtitle_verify: 'Enter the 6-digit code we sent to {email}.',
    signup_subtitle_default: 'Apply to do business on OpusFesta — it takes a couple of minutes.',
    signup_stalled_title: 'Sign-up is temporarily unavailable',
    signup_create_error: "We couldn't create your account. Please check your details and try again.",
    existing_account_title: 'You already have an OpusFesta account',
    existing_account_desc: '{email} is already registered. Your OpusFesta login works across the whole platform, so just sign in to start your vendor application.',
    signin_instead_button: 'Sign in instead',
    field_first_name_label: 'First name',
    field_first_name_placeholder: 'Amani',
    field_last_name_label: 'Last name',
    field_last_name_placeholder: 'Mushi',
    create_account_button: 'Create account',
    creating_account_label: 'Creating account…',
    signup_verify_incomplete_error: "That code didn't complete sign-up. Please try again.",
    resend_error: 'Could not resend the code.',
    verify_continue_button: 'Verify & continue',
    verifying_label: 'Verifying…',
    use_different_details_button: 'Use different details',
    resend_code_button: 'Resend code',
    already_have_account: 'Already have an account?',
    signin_link: 'Sign in',
    sso_finishing_label: 'Finishing sign-in',
  },
  'storefront-chrome': {
    banner_title: 'You have unpublished storefront changes',
    banner_desc: 'Couples on opusfesta.com still see your last published storefront. Publish to push your edits live.',
    publish_success: 'Storefront published. Couples on opusfesta.com see your latest now.',
    discard_success: 'Draft discarded.',
    discard_button: 'Discard',
    publish_button: 'Publish',
  },
  'storefront-about': {
    banner_no_application: "You haven't started a vendor application yet. Apply to do business on OpusFesta to edit your storefront.",
    banner_pending_approval: 'Your vendor application is awaiting OpusFesta verification. Editing unlocks once your account is approved.',
    banner_suspended: 'Your vendor account is suspended. Contact OpusFesta support if you believe this is a mistake.',
    banner_no_env: 'DEV: Vendor backend not connected — Save is disabled. Check Supabase env vars and that migrations are applied to your Supabase project.',
    section_owner_title: 'Owner & business',
    section_owner_hint: 'Who runs the storefront and how the business is registered.',
    field_logo_label: 'Logo or profile picture',
    field_logo_hint: 'Square works best. Shown on your public storefront.',
    field_business_name_label: 'Business name',
    field_business_name_placeholder: 'e.g. Festa Films',
    field_first_name_label: 'First name',
    field_last_name_label: 'Last name',
    field_years_in_business_label: 'Years in business',
    field_years_in_business_placeholder: 'e.g. 5',
    section_address_title: 'Business address',
    section_address_hint: 'Only your city and region appear publicly. Full address stays private.',
    field_house_number_label: 'Building / Plot number',
    field_house_number_placeholder: 'e.g. Plot 24, Building 12B',
    field_street_label: 'Street / Village',
    field_street_placeholder: 'e.g. Mwenge',
    field_ward_label: 'Ward',
    field_ward_placeholder: 'e.g. Kinondoni',
    field_district_label: 'District',
    field_district_placeholder: 'e.g. Kinondoni',
    field_region_label: 'Region',
    field_region_placeholder: 'Select region',
    field_landmark_label: 'Landmark / directions (optional)',
    field_landmark_placeholder: 'e.g. Near Mlimani City, opposite the mosque',
    field_postal_label: 'P.O. Box / Postal code (optional)',
    field_postal_placeholder: 'e.g. P.O. Box 1234 or 11101',
    section_contact_title: 'Contact details',
    section_contact_hint: 'Shared with couples after booking, not on your public storefront.',
    field_phone_label: 'Business phone',
    field_whatsapp_label: 'WhatsApp number',
    field_email_label: 'Business email',
    field_email_placeholder: 'hello@yourbusiness.co.tz',
    section_socials_title: 'Social media & website',
    section_socials_hint: 'Optional. Helps couples explore your work.',
    social_website_label: 'Website',
    social_website_placeholder: 'https://yourstudio.co.tz',
    social_whatsapp_label: 'WhatsApp Business',
    social_whatsapp_placeholder: '+255 754 123 456',
    social_instagram_label: 'Instagram',
    social_instagram_placeholder: '@yourstudio',
    social_facebook_label: 'Facebook',
    social_facebook_placeholder: 'facebook.com/yourstudio',
    social_tiktok_label: 'TikTok',
    social_tiktok_placeholder: '@yourstudio',
    section_service_area_title: 'Service area',
    home_market_not_set: 'Home market not set',
    home_market_hint: 'Home market, auto-set from your region above.',
    home_market_badge: 'Home',
    field_extra_markets_label: 'Additional markets you serve',
    section_bio_title: 'Bio',
    section_bio_hint: 'What couples read first on your storefront.',
    field_short_description_label: 'Short description',
    short_description_hint: 'One line couples see on your listing card. Leave blank to use the start of your bio. {count}/200',
    field_description_label: 'Description',
    bio_hint_empty: 'Min {min} characters.',
    bio_hint_remaining_singular: '{remaining} more character to go (min {min}).',
    bio_hint_remaining_plural: '{remaining} more characters to go (min {min}).',
    bio_hint_good: '{count} characters — looking good.',
    field_languages_label: 'Languages spoken with clients',
    section_style_title: 'Style & personality',
    field_style_label: 'Style',
    field_personality_label: 'Personality',
    unsaved_changes: 'You have unsaved changes.',
    save_hint: 'Everything on this page saves to your storefront when you click Save.',
    readonly_notice: 'Read-only — owner or manager role can edit.',
    saving_label: 'Saving…',
    save_button: 'Save changes',
    next_button: 'Next',
    success_saved: 'Profile saved.',
  },
  'storefront-packages': {
    banner_no_application: "You haven't started a vendor application yet. Apply to do business on OpusFesta to edit your packages.",
    banner_pending_approval: 'Your vendor application is awaiting OpusFesta verification. Editing unlocks once your account is approved.',
    banner_suspended: 'Your vendor account is suspended. Contact OpusFesta support if you believe this is a mistake.',
    banner_no_env: 'DEV: Vendor backend not connected — Save is disabled. Check Supabase env vars and that migrations are applied to your Supabase project.',
    card_packages_title: 'Packages',
    starting_from_prefix: 'Starting from',
    hint_editable: 'Click the pill on any card to set your own label, icon, and colour — e.g.',
    hint_readonly: 'Read-only — owner or manager role can edit. Examples:',
    example_badge_1: 'Platinum',
    example_badge_2: 'Best Value',
    example_badge_3: 'Most Booked',
    empty_packages_prefix: 'No packages yet. Add them on the',
    pricing_page_link_text: 'pricing page',
    badge_saved_success: 'Badge saved.',
    card_policies_title: 'Booking policies',
    label_deposit: 'Deposit',
    label_cancellation: 'Cancellation',
    label_reschedule: 'Reschedule',
    deposit_confirm_suffix: '{percent}% to confirm',
    card_payout_title: 'Payout',
    payout_hint: 'Saved securely from your onboarding payout step. Use Edit to change your bank or mobile-money details.',
    label_primary_method: 'Primary method',
    label_method: 'Method',
    label_bank: 'Bank',
    label_network: 'Network',
    label_account_number: 'Account number',
    label_lipa_namba: 'Lipa Namba',
    label_number: 'Number',
    phone_prefix: '+255 {number}',
    label_account_holder: 'Account holder',
    other_methods_suffix: '{count} more on file',
    label_other_methods: 'Other methods',
    empty_payout_prefix: 'No payout method on file yet. Add one on the',
    payout_step_link_text: 'payout step',
    footer_package_singular: 'package',
    footer_package_plural: 'packages',
    footer_with_badges_suffix: 'with custom badges',
    policies_saved_success: 'Booking policies saved.',
    saving_label: 'Saving…',
    save_button: 'Save',
    next_button: 'Next',
    edit_badge_title: 'Edit badge',
    readonly_title: 'Read-only',
    add_badge_button: 'Add badge',
    add_badge_title: 'Add a badge',
    untitled_package: 'Untitled package',
    customise_badge_header: 'Customise badge',
    close_aria: 'Close',
    field_label_label: 'Label',
    label_field_placeholder: 'e.g. Platinum, Best Value',
    icon_section_label: 'Icon',
    colour_section_label: 'Colour',
    preview_fallback: 'Preview',
    remove_badge_button: 'Remove badge',
    cancel_button: 'Cancel',
    save_badge_button: 'Save',
    edit_link_text: 'Edit',
  },
  'storefront-services': {
    banner_no_application: "You haven't started a vendor application yet. Apply to do business on OpusFesta to edit your services.",
    banner_pending_approval: 'Your vendor application is awaiting OpusFesta verification. Editing unlocks once your account is approved.',
    banner_suspended: 'Your vendor account is suspended. Contact OpusFesta support if you believe this is a mistake.',
    banner_no_env: 'DEV: Vendor backend not connected — Save is disabled. Check Supabase env vars and that migrations are applied to your Supabase project.',
    fallback_category_label: 'Vendor',
    services_header: '{category} services',
    services_hint: 'Pick what couples can book you for. These power search filters too.',
    custom_header: 'Your own services',
    custom_hint: "Add anything specific to your business that isn't in the list above.",
    custom_count_suffix: '{count} added',
    custom_empty: 'No custom services yet. Add one below — e.g. "Polaroid guest book" or "Drone aerial portraits".',
    remove_custom_aria: 'Remove {label}',
    custom_field_label: 'Add a custom service',
    custom_placeholder: 'e.g. Bridal henna sessions',
    add_service_button: 'Add service',
    total_label_singular: 'service selected',
    total_label_plural: 'services selected',
    min_services_hint: '— pick at least 3 so couples can find you in filters',
    readonly_notice: 'Read-only — owner or manager role can edit.',
    saving_label: 'Saving…',
    save_button: 'Save changes',
    next_button: 'Next',
    success_saved: 'Services saved.',
    duplicate_preset_error: '"{label}" is already selected as a preset.',
    duplicate_custom_error: '"{label}" is already in your list.',
  },
  'storefront-faq': {
    suggestions_header: 'Suggested questions',
    toggle_hide: 'Hide',
    toggle_show_all: 'Show all',
    suggestions_hint: 'Click to add — you can edit the answer afterwards.',
    suggested_question_1: 'How early should we book you?',
    suggested_question_2: 'Do you travel outside Dar es Salaam?',
    suggested_question_3: "What's included in your packages?",
    suggested_question_4: 'How does your deposit work?',
    suggested_question_5: 'Do you handle traditional ceremonies?',
    suggested_question_6: 'What happens if it rains?',
    suggested_question_7: 'How long until we get our final files?',
    empty_desc: 'No FAQs yet. Pick a suggestion above or write your own — couples spend less time messaging you and more time booking.',
    add_question: 'Add a question',
    add_another_question: 'Add another question',
    counts_complete_total: '{complete} complete · {total} total',
    saved_label: 'Saved.',
    saving_label: 'Saving…',
    save_button: 'Save FAQs',
    done_button: 'Done',
    question_index_label: 'Question {index}',
    remove_question_aria: 'Remove question',
    field_question_label: 'Question',
    field_answer_label: 'Answer',
    question_placeholder: 'e.g. How early should we book you?',
    answer_placeholder: 'Be specific and friendly — couples are reading this to decide.',
  },
  'storefront-photos-team': {
    status_pending_label: 'Awaiting verification',
    status_pending_desc: 'OpusFesta usually reviews certificates within 2 business days.',
    status_verified_label: 'Verified by OpusFesta',
    status_verified_desc: 'A verified badge now appears on your storefront beside this award.',
    status_needs_info_label: 'Needs more info',
    status_needs_info_desc: 'Reviewer asked a question — see notes below and re-upload if needed.',
    status_rejected_label: 'Could not verify',
    status_rejected_desc: 'Re-upload a clearer copy or remove this entry.',
    optional_pill: 'Optional',
    optional_intro: "Fill in whatever applies — couples don't expect every vendor to have awards, and skipping this section doesn't hurt your storefront. If you do have an award worth showing, verifying it earns you the OpusFesta badge beside it on your public profile.",
    card_awards_title: 'Awards & verified recognition (optional)',
    verified_badge_title: 'Verified awards earn you the OpusFesta badge',
    verified_badge_desc: 'Upload the certificate or a screenshot showing the awarding body and your name. We review within 2 business days, then attach a verified badge beside the award on your public storefront.',
    card_verified_count: '{count} verified',
    card_pending_count: '{count} pending',
    empty_awards_title: 'No awards? No problem.',
    empty_awards_desc: "This section is purely for vendors who've won industry recognition. Skip it and your storefront still looks great — couples don't filter by awards.",
    upload_form_header: 'Submit a new award for verification',
    field_award_title_label: 'Award title',
    field_award_title_placeholder: 'e.g. Best Photography Studio',
    field_issuer_label: 'Awarding body / issuer',
    field_issuer_placeholder: 'e.g. Tanzania Wedding Awards',
    field_year_label: 'Year',
    field_year_placeholder: 'e.g. 2024',
    field_certificate_label: 'Certificate file',
    accepted_files_hint: 'Accepted: PDF, PNG, JPG. Up to 10 MB.',
    submit_for_review_button: 'Submit for review',
    card_response_time_title: 'Response time (optional)',
    field_reply_window_label: 'Typical reply window',
    field_reply_window_placeholder: 'e.g. 1 hour',
    reply_window_hint: 'Shown to couples as "Replies within {time}". Once you have real inquiries, OpusFesta auto-tracks this from your conversation history.',
    reply_window_placeholder_var: 'X',
    card_trust_badges_title: 'Trust badges (optional)',
    locally_owned_label: 'Locally owned & operated',
    locally_owned_desc: 'A trust badge couples appreciate — Tanzanian-owned vendors only.',
    footer_verified_count: '{count} verified',
    footer_pending_count: '{count} pending review',
    saved_label: 'Saved.',
    saving_label: 'Saving…',
    save_button: 'Save',
    next_button: 'Next',
    reviewer_note_label: 'Reviewer note:',
    view_uploaded_file: 'View uploaded file',
    remove_certificate_aria: 'Remove certificate',
    remove_button_title: 'Remove',
    submitted_label: 'submitted',
    choose_file_button: 'Choose file',
    drag_hint: 'Drag a PDF or image in, or click choose file.',
    clear_file_aria: 'Clear file',
    empty_team_desc: 'No team members yet. Add at least the lead person couples will be working with — even solo vendors benefit from a personal "About me".',
    add_team_member_button: 'Add a team member',
    add_another_member_button: 'Add another member',
    team_counts_complete_total: '{complete} complete · {total} total',
    avatar_invalid_file_error: 'Choose an image file (JPEG, PNG, or WebP).',
    uploading_photo_label: 'Uploading photo…',
    field_full_name_label: 'Full name',
    field_full_name_placeholder: 'e.g. Mussa Ngalawa',
    field_role_label: 'Role',
    field_role_placeholder: 'e.g. Lead Photographer, Owner, Coordinator',
    field_short_bio_label: 'Short bio',
    field_short_bio_placeholder: "Two or three sentences. What they bring, what they're known for.",
    remove_member_aria: 'Remove member',
    avatar_replace_photo_aria: 'Replace photo',
    avatar_upload_photo_aria: 'Upload photo',
    avatar_photo_label: 'Photo',
    avatar_replace_label: 'Replace',
    avatar_upload_label: 'Upload',
    avatar_remove_photo_aria: 'Remove photo',
    cover_title: 'Cover photos',
    cover_hint: 'These run as a carousel on your storefront and search cards. Fill all {count} — slot {count} is portrait for mobile. Pick or drop multiple photos at once and they fill empty slots in order.',
    cover_upload_button: 'Upload covers',
    cover_rules_header: 'Your cover photos',
    cover_rule_1: 'Landscape 16:9 works best for the first three; the fourth is portrait 3:4 for mobile.',
    cover_rule_2: 'Photos are auto-cropped from the center.',
    cover_rule_3: "Don't use photos with watermarks.",
    cover_rule_4: 'Pick or drop multiple files — empty slots fill in order, extras overflow to the portfolio.',
    cover_rule_5: 'Max photo size: 10 MB.',
    cover_display_hint: 'Each photo is displayed on desktop and mobile web.',
    cover_pro_tip_prefix: 'Pro tip:',
    cover_pro_tip_text: 'a {orientation} photo will look best.',
    orientation_landscape: 'landscape',
    orientation_portrait: 'portrait',
    portfolio_title: 'Portfolio',
    portfolio_hint: 'Add at least {min} photos so couples can scroll your work. Upload as many as you like — drag in or browse. Hover any photo to reorder, edit caption, or delete.',
    portfolio_upload_button: 'Upload photos',
    portfolio_rules_header: 'Photo quality rules',
    portfolio_rule_1: 'High-resolution — at least 1920×1280px so they stay crisp on retina screens.',
    portfolio_rule_2: 'JPG or PNG. HEIC files are auto-converted on upload.',
    portfolio_rule_3: 'Mix landscape and a couple of portraits so the gallery flows.',
    portfolio_rule_4: "Don't use photos with watermarks or third-party logos.",
    portfolio_rule_5: 'Max photo size: 15 MB.',
    portfolio_remaining_singular: '{remaining} more photo',
    portfolio_remaining_plural: '{remaining} more photos',
    portfolio_remaining_suffix: 'to reach the {min}-photo recommendation. Vendors with full portfolios get up to 2× more inquiries.',
    add_photo_label: 'Add photo',
    video_title: 'Video reels',
    video_hint: 'Upload as many video files as you like, or paste YouTube/Vimeo URLs. Couples who watch a reel are far more likely to inquire.',
    video_upload_button: 'Upload videos',
    video_rules_header: 'Video quality rules',
    video_rule_1: 'Resolution at least 1080p (1920×1080); 4K is even better.',
    video_rule_2: 'MP4 or MOV. H.264 is the safest codec across browsers.',
    video_rule_3: '30–90 seconds per reel converts best — couples drop off after 90s.',
    video_rule_4: 'No watermarks, intros longer than 3 s, or third-party logos.',
    video_rule_5: 'Max video size: 250 MB. For longer cuts, paste a YouTube/Vimeo link below.',
    video_link_header: 'Or paste a YouTube / Vimeo link',
    field_video_url_label: 'Video URL',
    field_video_url_placeholder: 'https://youtube.com/watch?v=…',
    field_video_title_label: 'Title (optional)',
    field_video_title_placeholder: 'e.g. Highlight reel',
    add_reel_button: 'Add reel',
    add_video_label: 'Add video',
    save_error_prefix: "Couldn't save:",
    save_success_photos_videos: 'Photos & videos saved.',
    footer_photo_singular: 'photo',
    footer_photo_plural: 'photos',
    footer_video_singular: 'video',
    footer_video_plural: 'videos',
    uploading_photos_singular: 'Uploading {count} photo…',
    uploading_photos_plural: 'Uploading {count} photos…',
    uploading_videos_singular: 'Uploading {count} video…',
    uploading_videos_plural: 'Uploading {count} videos…',
    save_photos_button: 'Save photos',
    error_only_images: 'Only image files are allowed.',
    error_file_too_large: '{filename}: file is over 10 MB after compression — try a smaller original.',
    error_upload_failed_generic: 'Upload failed.',
    error_file_message: '{filename}: {message}',
    error_storage_rejected: '{filename}: storage rejected upload ({status}{body})',
    portfolio_partial_fail: '{success} of {total} uploaded · {failed} failed ({firstError}{more})',
    cover_partial_fail: '{success} of {total} covers uploaded · {firstError}{more}',
    video_partial_fail_singular: '{count} video upload failed ({firstError}{more})',
    video_partial_fail_plural: '{count} video uploads failed ({firstError}{more})',
    more_errors_suffix: '; …',
    move_up_aria: 'Move up',
    move_down_aria: 'Move down',
    edit_caption_aria: 'Edit caption',
    delete_aria: 'Delete',
    caption_placeholder: 'Add a caption…',
    cancel_aria: 'Cancel',
    edit_title_aria: 'Edit title',
    open_video_aria: 'Open {title}',
    title_placeholder: 'Add a title…',
    cover_photo_alt: 'Cover photo',
    replace_label: 'Replace',
    remove_cover_aria: 'Remove cover photo',
    remove_title_attr: 'Remove',
    upload_cover_aria: 'Upload cover photo',
    required_badge: 'Required',
    fallback_youtube_title: 'YouTube video',
    fallback_vimeo_title: 'Vimeo video',
    fallback_video_title: 'Video',
  },
  'storefront-availability': {
    intro_text: "Tap a date to set it unavailable or limited, and add a private note for context. Days you are closed every week show greyed automatically from your hours. Couples see your open dates and hours on your public storefront.",
    weekday_short_sun: 'Sun',
    weekday_short_mon: 'Mon',
    weekday_short_tue: 'Tue',
    weekday_short_wed: 'Wed',
    weekday_short_thu: 'Thu',
    weekday_short_fri: 'Fri',
    weekday_short_sat: 'Sat',
    weekday_full_mon: 'Monday',
    weekday_full_tue: 'Tuesday',
    weekday_full_wed: 'Wednesday',
    weekday_full_thu: 'Thursday',
    weekday_full_fri: 'Friday',
    weekday_full_sat: 'Saturday',
    weekday_full_sun: 'Sunday',
    month_january: 'January',
    month_february: 'February',
    month_march: 'March',
    month_april: 'April',
    month_may: 'May',
    month_june: 'June',
    month_july: 'July',
    month_august: 'August',
    month_september: 'September',
    month_october: 'October',
    month_november: 'November',
    month_december: 'December',
    today_button: 'Today',
    prev_month_aria: 'Previous month',
    next_month_aria: 'Next month',
    status_open: 'Open',
    status_limited: 'Limited',
    status_unavailable: 'Unavailable',
    status_closed: 'Closed',
    close_aria: 'Close',
    note_label: 'Note (only you see this)',
    note_placeholder: "e.g. Fully booked. Asha & Juma's wedding",
    clear_date_button: 'Clear date',
    done_button: 'Done',
    save_hint: 'Changes apply when you hit Save below.',
    hours_header: 'Business hours',
    copy_mon_to_fri_button: 'Copy Mon to Fri',
    hours_hint: 'The days and times couples can reach you. Unchecked days show greyed on the calendar.',
    hours_open_count_singular: '{count} day open per week',
    hours_open_count_plural: '{count} days open per week',
    footer_unavailable_count: '{count} unavailable',
    footer_limited_count: '{count} limited',
    footer_days_open_singular: '{count} day open',
    footer_days_open_plural: '{count} days open',
    saved_label: 'Saved.',
    saving_label: 'Saving…',
    save_button: 'Save',
    next_button: 'Next',
  },
  onboarding: {
    'common.back': 'Back',
    'common.continue': 'Continue',
    'common.next_step': 'Next step',
    'common.skip_for_now': 'Skip for now',
    'common.cancel': 'Cancel',
    'common.got_it': 'Got it',
    'common.why_we_ask': 'Why we ask',
    'common.try_again': 'Try again',
    'common.remove': 'Remove',
    'common.not_set': 'Not set',
    'common.close': 'Close',
    'common.edit': 'Edit',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.other': 'Other',
    'common.none_selected': 'None selected',
    'common.select_all_that_apply': 'Select all that apply.',
    'stepper.aria.home': 'OpusFesta home',
    'stepper.aria.progress': 'Onboarding progress',
    'stepper.profile': '{label} profile',
    'stepper.details': 'Details',
    'stepper.pricing': 'Pricing',
    'stepper.review': 'Review',
    'category.title': 'What type of vendor are you?',
    'category.custom_placeholder': 'Describe your vendor type…',
    'category.error.title': 'Could not load this step',
    'category.error.body': 'Something went wrong loading the category selection. Tap below to try again.',
    'vows.title': 'Before we start, meet our Vendor Vows',
    'vows.subtitle': 'As an OpusFesta vendor, you pledge to uphold these values:',
    'vows.cta': 'Say "I do"',
    'vows.why.title': 'Why the Vendor Vows?',
    'vows.why.body1': 'The Vendor Vows are how OpusFesta keeps the marketplace a respectful, trusted space for every couple in Tanzania.',
    'vows.why.body2': 'Couples can see which vendors have signed the vows, and we may remove vendors who don\'t uphold them. Signing is a one-time pledge. You won\'t see this screen again.',
    'profile.name.title': 'What is your name?',
    'profile.name.first.label': 'First name',
    'profile.name.last.label': 'Last name',
    'profile.name.business.label': 'Business name',
    'profile.name.business.placeholder': 'e.g. Festa Films',
    'profile.name.logo.label': 'Logo or profile picture',
    'profile.name.logo.hint': 'Optional. Square works best. Shown on your storefront.',
    'profile.location.title': 'Where is your business located?',
    'profile.location.house.label': 'Building / Plot number',
    'profile.location.house.placeholder': 'e.g. Plot 24, Building 12B',
    'profile.location.street.label': 'Street / Village',
    'profile.location.street.placeholder': 'e.g. Mwenge',
    'profile.location.ward.label': 'Ward',
    'profile.location.ward.placeholder': 'e.g. Kinondoni',
    'profile.location.district.label': 'District',
    'profile.location.district.placeholder': 'e.g. Kinondoni',
    'profile.location.region.label': 'Region',
    'profile.location.region.placeholder': 'Select region',
    'profile.location.landmark.label': 'Landmark / directions (optional)',
    'profile.location.landmark.placeholder': 'e.g. Near Mlimani City, opposite the mosque',
    'profile.location.postal.label': 'P.O. Box / Postal code (optional)',
    'profile.location.postal.placeholder': 'e.g. P.O. Box 1234 or 11101',
    'profile.location.phone.label': 'Business phone (Tanzania)',
    'profile.location.phone.placeholder': '754 123 456',
    'profile.location.why.title': 'Why we ask for your address',
    'profile.location.why.body1': 'We use your address to set your home market and to surface your storefront to couples planning weddings nearby.',
    'profile.location.why.body2': 'Your full street address stays private. Only your city and region appear on your public storefront. Your phone number is shared only after a couple sends you an inquiry.',
    'profile.contact.title': 'How should couples reach you?',
    'profile.contact.subtitle': 'We send inquiry alerts to your email and your WhatsApp. Most Tanzanian couples message vendors on WhatsApp first.',
    'profile.contact.email.label': 'Business email',
    'profile.contact.email.placeholder': 'hello@yourstudio.co.tz',
    'profile.contact.email.hint': 'We use this for inquiry alerts, payouts, and account recovery. Never shown publicly.',
    'profile.contact.whatsapp.label': 'WhatsApp number',
    'profile.contact.whatsapp.placeholder': '754 123 456',
    'profile.contact.same_as_phone': 'Same as my business phone (+255 …)',
    'profile.contact.why.title': 'Why we ask for email and WhatsApp',
    'profile.contact.why.body1': 'Inquiries arrive at both your email and your WhatsApp so you never miss a couple, and so couples get a fast first response, which is the single biggest driver of bookings on OpusFesta.',
    'profile.contact.why.body2': 'Your WhatsApp number is only shared with couples after they send you an inquiry. Email is never shown publicly.',
    'profile.socials.title': 'Where can couples see your work online?',
    'profile.socials.subtitle': 'Couples almost always check Instagram and TikTok before reaching out. Add at least one. You can leave the rest blank.',
    'profile.socials.instagram.label': 'Instagram',
    'profile.socials.instagram.placeholder': 'yourstudio_tz',
    'profile.socials.tiktok.label': 'TikTok',
    'profile.socials.tiktok.placeholder': 'yourstudio',
    'profile.socials.facebook.label': 'Facebook page',
    'profile.socials.facebook.placeholder': 'facebook.com/yourstudio or YourStudio',
    'profile.socials.website.label': 'Website',
    'profile.socials.website.placeholder': 'https://yourstudio.co.tz',
    'profile.socials.why.title': 'Why we ask for socials',
    'profile.socials.why.body1': 'Vendors with at least one linked social account get 3-4× more inquiries than those without. Couples want to scroll your real work, not just your packages.',
    'profile.socials.why.body2': 'Instagram and TikTok matter most for visual categories (photo, video, decor, beauty). Facebook is still where many TZ couples find venues. You can always add or remove these later from your dashboard.',
    'profile.markets.title': 'Based on your address, {market} is your home market.',
    'profile.markets.subtitle': 'Expand your service area by selecting the markets where you\'ll travel for your standard fees. You can add more markets later.',
    'profile.markets.home_suffix': '(home)',
    'profile.markets.why.title': 'Why we ask about service area',
    'profile.markets.why.body1': 'Your service area decides where OpusFesta shows your storefront. Couples planning a wedding in Zanzibar, Arusha, or anywhere you’ve selected will see you in their search results.',
    'profile.markets.why.body2': 'Pick only the markets where you\'ll travel for your standard fee. You can add per-trip travel charges later. You can update this anytime from your dashboard.',
    'details.about.title': 'Tell couples about your work',
    'details.about.subtitle': 'This is the first thing couples will read on your storefront. Be specific about what makes your work yours. Couples decide quickly.',
    'details.about.bio.label': 'About your business',
    'details.about.bio.placeholder': 'e.g. Editorial documentary photographer that captures atmosphere, not just moments. Based in Dar es Salaam, available across East Africa.',
    'details.about.bio.hint_more_one': '{n} more character to go (min {min}).',
    'details.about.bio.hint_more_other': '{n} more characters to go (min {min}).',
    'details.about.bio.hint_ok': '{n} characters. Looking good.',
    'details.about.description.label': 'Short description',
    'details.about.description.placeholder': 'One line couples see on your listing card. If you leave it blank, we use the start of your bio.',
    'details.about.description.hint': '{n}/200 characters.',
    'details.about.years.label': 'Years in business',
    'details.about.years.placeholder': 'e.g. 11',
    'details.about.languages.label': 'Languages spoken with clients',
    'details.services.title': 'Do you offer any of these special services?',
    'details.services.custom.heading': 'Other services',
    'details.services.custom.hint': 'Add anything specific to your business that isn\'t in the list above.',
    'details.services.custom.label': 'Add another service',
    'details.services.custom.placeholder': 'e.g. Bridal henna sessions',
    'details.services.custom.add': 'Add',
    'details.services.custom.remove': 'Remove',
    'details.style.title': 'Let\'s talk style. Which style do you enjoy capturing most?',
    'details.style.subtitle': 'We know you can probably do multiple styles. We want to connect you with couples who value what you love to do.',
    'details.personality.title': 'What\'s one word clients would use to describe your personality?',
    'details.personality.subtitle': 'We\'re sure you can adapt to any group, but we want to know the trait you\'re most proud of.',
    'pricing.title': 'Let\'s talk pricing',
    'pricing.subtitle': 'Tanzanian couples shop by package. Add the tiers you offer. Bronze / Silver / Gold, hours of coverage, or whatever fits how you sell.',
    'pricing.starting_from.label': 'Starting from (shown on storefront)',
    'pricing.starting_from.placeholder': 'e.g. 1,500,000',
    'pricing.starting_from.hint': 'Optional headline price couples see first. Leave blank to show the lowest package price.',
    'pricing.custom_quotes.label': 'I also offer custom quotes',
    'pricing.custom_quotes.hint': 'Couples can ask for a tailored package outside these tiers.',
    'pricing.your_packages': 'Your packages',
    'pricing.use_suggested': 'Use suggested',
    'pricing.start_from_scratch': 'Start from scratch',
    'pricing.empty': 'No packages yet. Pick a starting point. You can switch later.',
    'pricing.use_suggested_for': 'Use suggested for {category}',
    'pricing.package_n': 'Package {n}',
    'pricing.package.name.label': 'Name',
    'pricing.package.name.placeholder': 'e.g. Signature, 6-hour, Gold',
    'pricing.package.price.label': 'Price (TSh)',
    'pricing.package.price.placeholder': 'e.g. 2,500,000',
    'pricing.package.desc.label': 'One-line description',
    'pricing.package.desc.placeholder': 'e.g. 6-hour ceremony + reception coverage',
    'pricing.package.included.label': 'What\'s included',
    'pricing.package.item_n.placeholder': 'Item {n}',
    'pricing.add_item': 'Add item',
    'pricing.add_package': 'Add another package',
    'pricing.remove_package': 'Remove package',
    'pricing.remove_item': 'Remove item',
    'pricing.replace.title': 'Replace your packages?',
    'pricing.replace.body': 'We\'ll swap in the suggested templates for {category}. Anything you\'ve typed into the current packages will be lost.',
    'pricing.replace.confirm': 'Replace packages',
    'pricing.replace.cancel': 'Keep mine',
    'pricing.clear.title': 'Start from scratch?',
    'pricing.clear.body_one': 'We\'ll clear your {n} package and let you pick a starting point again. Anything you\'ve typed will be lost.',
    'pricing.clear.body_other': 'We\'ll clear your {n} packages and let you pick a starting point again. Anything you\'ve typed will be lost.',
    'pricing.clear.confirm': 'Clear and start over',
    'pricing.clear.cancel': 'Keep my packages',
    'pricing.why.title': 'Why we ask about pricing',
    'pricing.why.body1': 'Tanzanian couples typically shop by package. Bronze / Silver / Gold or by hours of coverage. Sharing your tiers helps couples self-qualify before reaching out, so the inquiries you get are more likely to convert.',
    'pricing.why.body2': 'We only show your storefront to couples whose budget reaches your starting price, and you can edit packages anytime from your dashboard.',
    'policies.title': 'Booking policies',
    'policies.subtitle': 'These show up at checkout so couples know exactly what they’re agreeing to. You can change them anytime. Existing bookings keep the policy that was active when they confirmed.',
    'policies.deposit.title': 'Deposit to confirm a booking',
    'policies.deposit.subtitle': 'How much of the package price couples pay upfront to lock in their date.',
    'policies.deposit.custom.label': 'Custom percentage',
    'policies.deposit.custom.placeholder': 'e.g. 25',
    'policies.deposit.custom.error': 'Enter a value between 5 and 100.',
    'policies.cancellation.title': 'Cancellation policy',
    'policies.cancellation.subtitle': 'What couples get back if they cancel before the event.',
    'policies.reschedule.title': 'Reschedule policy',
    'policies.reschedule.subtitle': 'What happens when a couple needs to move their date.',
    'policies.why.title': 'Why we ask about policies',
    'policies.why.body1': 'Couples want to know the rules before they pay a deposit. Vendors with clear, fair policies convert significantly better, and OpusFesta uses your policies to handle cancellations and refunds automatically. So you don\'t have to argue.',
    'policies.why.body2': 'Pick the level that matches your real cancellation costs. You can always update these for new bookings, and existing bookings keep the policy they were created under.',
    'payout.title': 'Where should we send your payouts?',
    'payout.subtitle': 'OpusFesta releases the deposit when a booking confirms and the balance after the event. Add one or more destinations — mobile money, Lipa Namba, or any TZ bank — and pick which one is primary.',
    'payout.method_n': 'Payout method {n}',
    'payout.primary': 'Primary',
    'payout.make_primary': 'Make primary',
    'payout.method.label': 'Method',
    'payout.method.placeholder': 'Select a payout method',
    'payout.bank.label': 'Bank',
    'payout.bank.placeholder': 'Select bank',
    'payout.network.label': 'Network',
    'payout.network.placeholder': 'Which provider issued this Lipa Namba?',
    'payout.network.hint': 'Your Lipa Namba is registered with one of these networks. Pick whichever issued your merchant account.',
    'payout.holder.label': 'Account holder / business name',
    'payout.holder.placeholder': 'As registered with your provider',
    'payout.holder.hint': 'Must match the name registered with {provider}, or payouts will be rejected.',
    'payout.add_method': 'Add another payout method',
    'payout.max_reached': 'You can add up to {max} payout methods.',
    'payout.remove_method': 'Remove payout method {n}',
    'payout.provider.bank': 'your bank',
    'payout.provider.merchant': 'your merchant account',
    'payout.provider.mobile': 'your mobile money provider',
    'payout.number.hint': 'Usually 5–7 digits. You\'ll find it on your M-Pesa for Business / merchant statement.',
    'payout.why.title': 'When and how do payouts work?',
    'payout.why.body1': 'We hold each booking’s funds in escrow. The deposit is released to your account within 48-72 hours of the couple confirming, and the balance is released within 48-72 hours after the event.',
    'payout.why.body2': 'Money goes to your primary method by default; the others are kept on file as alternates. Mobile money payouts arrive instantly. Bank transfers take 1–2 business days. We never charge a payout fee. TZS in, TZS out.',
    'review.title': 'Review your storefront',
    'review.subtitle_edit': 'Here\'s everything couples will see. Update any details and save — your application status won\'t change.',
    'review.subtitle_new': 'Here\'s everything couples will see. Make any final edits, then submit for review.',
    'review.section.profile': 'Profile',
    'review.section.online': 'Online presence',
    'review.section.about': 'About',
    'review.section.style': 'Style & personality',
    'review.section.services': 'Special services',
    'review.section.packages': 'Packages',
    'review.section.policies': 'Booking policies',
    'review.section.payout': 'Payout',
    'review.row.business_name': 'Business name',
    'review.row.category': 'Category',
    'review.row.owner': 'Owner',
    'review.row.location': 'Location',
    'review.row.service_area': 'Service area',
    'review.row.phone': 'Phone',
    'review.row.whatsapp': 'WhatsApp',
    'review.row.email': 'Email',
    'review.row.instagram': 'Instagram',
    'review.row.tiktok': 'TikTok',
    'review.row.facebook': 'Facebook',
    'review.row.website': 'Website',
    'review.row.description': 'Description',
    'review.row.bio': 'About your business',
    'review.row.years': 'Years in business',
    'review.row.languages': 'Languages',
    'review.row.awards': 'Awards & recognition',
    'review.row.response_time': 'Response time',
    'review.row.replies_within': 'Replies within {time}',
    'review.row.locally_owned': 'Locally owned',
    'review.row.style': 'Style',
    'review.row.personality': 'Personality',
    'review.row.deposit': 'Deposit',
    'review.row.deposit_pct': '{pct}% to confirm',
    'review.row.cancellation': 'Cancellation',
    'review.row.reschedule': 'Reschedule',
    'review.row.method': 'Method',
    'review.row.bank': 'Bank',
    'review.row.network': 'Network',
    'review.row.account_number': 'Account number',
    'review.row.lipa_namba': 'Lipa Namba',
    'review.row.number': 'Number',
    'review.row.account_holder': 'Account holder',
    'review.packages.starting_from': 'Starting from TSh {price}',
    'review.packages.empty': 'No packages added.',
    'review.packages.custom_quotes': 'Custom quotes available on request.',
    'review.packages.popular': 'Popular',
    'review.packages.untitled': 'Untitled package',
    'review.error': 'Something went wrong submitting your application. Please check your connection and try again.',
    'review.footer.save.primary': 'Save your changes.',
    'review.footer.save.secondary': 'We\'ll update your storefront — you\'ll stay exactly where you are in the process.',
    'review.footer.submit.primary': 'Ready when you are.',
    'review.footer.submit.secondary': 'Once you submit, we\'ll ask for a couple of documents to verify your business.',
    'review.footer.saving': 'Saving…',
    'review.footer.submitting': 'Submitting…',
    'review.footer.save_changes': 'Save changes',
    'review.footer.submit_application': 'Submit application',
    'review.done.badge': 'Application complete',
    'review.done.title': 'You\'re in. Let\'s verify your business.',
    'review.done.celebration_aria': 'Celebration',
    'review.done.body': 'Your application is submitted. A couple more documents and our team can approve your storefront. Usually 2–3 business days.',
    'review.done.cta': 'Continue to verification',
    'review.done.later_prefix': 'Or ',
    'review.done.later_link': 'save and continue later',
    'review.done.later_suffix': '. We\'ll email you a reminder.',
  },
}
