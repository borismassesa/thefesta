import type { Locale } from '@/lib/cms/localized'

/**
 * Door-staff Entrance Card Scanner copy — English + Kiswahili.
 * Kept local to the scanner (not CMS) so attendants get instant client-side
 * switching without a CMS round-trip on a venue phone.
 */

export type ScannerStringKey = keyof typeof SCANNER_STRINGS_EN

const SCANNER_STRINGS_EN = {
  // Shared
  lang_label: 'Language',
  scan: 'Scan',
  back_to_scan: 'Back to scan',
  try_again: 'Try again',
  report: 'Report',
  this_event: 'This event',
  search_by_name: 'Search by name',
  clear_search: 'Clear search',

  // Entry
  check_in_title: 'OpusPass Check In',
  check_in_body:
    "Every guest who RSVP'd receives an entrance ticket. Scan its QR code as they arrive to check them in.",
  access_code: 'Access code',
  access_code_placeholder: 'Paste or type the code',
  your_name: 'Your name',
  your_name_hint: 'Recorded against every guest you check in.',
  your_name_placeholder: 'e.g. Asha',
  start_scanning: 'Start scanning',
  access_codes_one_event: 'Access codes work for one event only.',
  how_shift_runs: 'How a shift runs',
  step_code_title: 'Enter your access code',
  step_code_body: 'The couple or the OpusFesta team gives you this before the event.',
  step_scan_title: 'Scan entrance tickets',
  step_scan_body: "Point the camera at the QR code on each guest's ticket.",
  step_done_title: 'Guests are checked in',
  step_done_body: 'Arrivals update live for the couple and the OpusFesta team.',
  your_shift: 'Your shift',
  shift_in_progress: 'Shift in progress',
  continue_scanning: 'Continue scanning',
  arrivals: 'Arrivals',
  guest_list: 'Guest list',
  new_shift: 'New shift',
  end_shift: 'End shift',
  end_shift_title: 'End this shift?',
  end_shift_body: "You'll need the access code again to start scanning for this event.",
  new_shift_title: 'Start a new shift?',
  new_shift_body:
    "You'll need an access code for the other event. {event} stays saved until you enter a different one.",
  end_shift_confirm:
    "End this shift?\n\nYou'll need the access code again to start scanning for this event.",
  new_shift_confirm:
    "Start a new shift?\n\nYou'll need an access code for the other event. {event} stays saved until you enter a different one.",

  // Session gate
  shift_ended: 'This shift has ended. Enter your access code again to keep scanning.',
  enter_code: 'Enter code',

  // Guests
  guest_list_title: 'Guest list',
  filter_waiting: 'Waiting',
  filter_waiting_full: 'Still to arrive',
  filter_in: 'In',
  filter_in_full: 'Checked in',
  filter_all: 'All',
  filter_all_full: 'Everyone',
  filter_aria: 'Guest list filter',
  filter_by_group: 'Filter by group',
  filter_by_group_active: 'Filtering by {group}. Change group',
  select_group: 'Select group',
  all_guests: 'All guests',
  total_count: 'Total {label}',
  group_in_count: '{label} · {n} in',
  empty_search: 'No guests match that search.',
  empty_pending: 'Everyone here has arrived.',
  empty_arrived: 'Nobody from this list has been checked in yet.',
  empty_all: 'No guests on this list yet.',
  load_failed: "Couldn't load the guest list.",
  waiting_party: 'Waiting · party of {n}',
  checked_in_of: 'Checked in · {a} of {b}',
  vip: 'VIP',

  // Arrivals
  checked_in_title: 'Checked in',
  everyone_in: 'Everyone is in',
  everyone_in_body: 'All {guests} invitations scanned. {heads} {people} came through the door.',
  person: 'person',
  people: 'people',
  download_report: 'Download arrivals report',

  // Scan chrome
  check_in: 'Check-in',
  open_guest_list: 'Open the guest list',
  go_back: 'Go back',
  still_to_arrive: 'Still to arrive',
  on_the_list: 'On the list',
  caption_in: 'in',
  caption_invited: 'invited',
  already_scanned: 'Already scanned',
  not_valid: 'Not valid',
  couldnt_check_in: "Couldn't check in",
  camera_blocked:
    'Camera access is blocked. Allow it for this site in your browser settings, then try again.',
  camera_needed: 'OpusPass needs your camera to scan guest entry passes.',
  allow_camera: 'Allow camera',
  caption_waiting: 'waiting',
  through_the_door: '{n} {people} through the door',

  // Share-link gate
  verifying_link: 'Verifying your link…',
  link_not_valid: 'Link not valid',
  enter_code_instead: 'Enter a code instead',
  event: 'Event',
  whos_scanning: "Who's scanning?",
  start_shift_at: 'Enter your name to start your shift at {door}. It is recorded against every guest you check in.',

  // Arrivals extras
  send_final_report: 'Send the couple the final report',
  guest_through_door: 'guest through the door',
  guests_through_door: 'guests through the door',
  invitations_scanned: 'Invitations scanned',
  of_count: '{a} of {b}',
  search_arrived: "Search who's arrived",
  load_arrivals_failed: "Couldn't load arrivals.",
  empty_arrivals_search: 'No arrivals match that name.',
  empty_arrivals:
    'Nobody has been scanned in yet. Arrivals appear here as guests come through the door.',
  something_went_wrong: 'Something went wrong.',
  your_current_shift: 'your current shift',
  checked_in_aria: 'checked in',
  not_yet_arrived_aria: 'not yet arrived',

  // Scan tips
  tips_title: 'Tips for scanning passes',
  tips_heading: 'Scan the pass to check a guest in',
  tip_hold_still: "Point the camera at the QR on the guest's ticket and hold the phone still",
  tip_inside_brackets: 'Keep the whole code inside the brackets, about a hand-span away',
  tip_manual_fallback:
    "If the QR won't scan, type the 8-character ticket code or find the guest by name",
  got_it: 'Got it',
  see_tips: 'See tips',
  dismiss_tips: 'Dismiss scanning tips',
  close: 'Close',

  // Scan camera + result
  point_at_qr: "Point at the QR code on the guest's ticket",
  qr_not_working: 'QR not working? Check in manually',
  admitted_of: '{a} of {b} admitted',
  scan_next_guest: 'Scan next guest',
  find_guest_by_name: 'Find guest by name',
  cancel: 'Cancel',
  enter_pass_or_code: 'Enter Pass ID or ticket code',
  search_by_name_instead: 'Search by name instead',
  enter_code_instead_mode: 'Enter Pass ID or ticket code instead',
  pass_code_hint:
    "Type the Pass ID or ticket code printed under the QR on the guest's ticket. A Pass ID shows the guest for you to check before anyone is admitted.",
  pass_or_ticket_code: 'Pass ID or ticket code',
  search_guest_name: "Search the guest's name",
  load_failed_use_code:
    "Couldn't load the guest list. You can still check a guest in with the code from their ticket.",
  no_guest_matching: 'No guest matching “{query}”.',
  already_in_of: 'Already in, {a} of {b}',
  how_many_arrived: 'How many arrived?',
  invited_for_n: '{name} was invited for {n} guests.',
  pass_accepted: 'Pass accepted',
  invited_n: 'Invited {n}',
  guests_arriving: 'Guests arriving',
  n_of_m: '{a} of {b}',
  /** Ticket product names (Single / Double / Wakwe) — never “full party”. */
  ticket_arriving: '{ticket} is arriving',
  decrease_count: 'Fewer guests',
  increase_count: 'More guests',
  enter_count_arrived: 'Enter count arrived',
  enter_number_between: 'Enter a number between 1 and {n}',
  check_in_1_guest: 'Check in 1 guest',
  check_in_n_guests: 'Check in {n} guests',
  done: 'Done',
} as const

const SCANNER_STRINGS_SW: Record<ScannerStringKey, string> = {
  lang_label: 'Lugha',
  scan: 'Skani',
  back_to_scan: 'Rudi skani',
  try_again: 'Jaribu tena',
  report: 'Ripoti',
  this_event: 'Tukio hili',
  search_by_name: 'Tafuta kwa jina',
  clear_search: 'Futa utafutaji',

  check_in_title: 'OpusPass Check In',
  check_in_body:
    'Kila mgeni aliyejibu RSVP anapata tiketi ya kuingia. Skani msimbo wake wa QR anapowasili ili kumwingiza.',
  access_code: 'Msimbo wa ufikiaji',
  access_code_placeholder: 'Bandika au andika msimbo',
  your_name: 'Jina lako',
  your_name_hint: 'Linarekodiwa kwa kila mgeni unayemwingiza.',
  your_name_placeholder: 'k.m. Asha',
  start_scanning: 'Anza skani',
  access_codes_one_event: 'Misimbo ya ufikiaji hutumika kwa tukio moja tu.',
  how_shift_runs: 'Jinsi zamu inavyoenda',
  step_code_title: 'Ingiza msimbo wako wa ufikiaji',
  step_code_body: 'Wanandoa au timu ya OpusFesta hukupa huu kabla ya tukio.',
  step_scan_title: 'Skani tiketi za kuingia',
  step_scan_body: 'Elekeza kamera kwenye msimbo wa QR kwenye tiketi ya kila mgeni.',
  step_done_title: 'Wageni wameingizwa',
  step_done_body: 'Waliowasili husasishwa moja kwa moja kwa wanandoa na timu ya OpusFesta.',
  your_shift: 'Zamu yako',
  shift_in_progress: 'Zamu inaendelea',
  continue_scanning: 'Endelea skani',
  arrivals: 'Waliowasili',
  guest_list: 'Orodha ya wageni',
  new_shift: 'Zamu mpya',
  end_shift: 'Maliza zamu',
  end_shift_title: 'Maliza zamu hii?',
  end_shift_body: 'Utahitaji msimbo wa ufikiaji tena ili kuanza skani kwa tukio hili.',
  new_shift_title: 'Anza zamu mpya?',
  new_shift_body:
    'Utahitaji msimbo wa ufikiaji kwa tukio lingine. {event} itabaki hadi uweke msimbo tofauti.',
  end_shift_confirm:
    'Maliza zamu hii?\n\nUtahitaji msimbo wa ufikiaji tena ili kuanza skani kwa tukio hili.',
  new_shift_confirm:
    'Anza zamu mpya?\n\nUtahitaji msimbo wa ufikiaji kwa tukio lingine. {event} itabaki hadi uweke msimbo tofauti.',

  shift_ended: 'Zamu hii imeisha. Ingiza msimbo wako wa ufikiaji tena ili uendelee skani.',
  enter_code: 'Ingiza msimbo',

  guest_list_title: 'Orodha ya wageni',
  filter_waiting: 'Wanasubiri',
  filter_waiting_full: 'Bado hawajawasili',
  filter_in: 'Ndani',
  filter_in_full: 'Walioingia',
  filter_all: 'Wote',
  filter_all_full: 'Kila mtu',
  filter_aria: 'Kichujio cha orodha ya wageni',
  filter_by_group: 'Chuja kwa kundi',
  filter_by_group_active: 'Inachujwa kwa {group}. Badilisha kundi',
  select_group: 'Chagua kundi',
  all_guests: 'Wageni wote',
  total_count: 'Jumla {label}',
  group_in_count: '{label} · {n} ndani',
  empty_search: 'Hakuna wageni wanaolingana na utafutaji huo.',
  empty_pending: 'Kila mtu hapa amewasili.',
  empty_arrived: 'Hakuna mtu kutoka orodha hii aliyeingizwa bado.',
  empty_all: 'Bado hakuna wageni kwenye orodha hii.',
  load_failed: 'Imeshindikana kupakia orodha ya wageni.',
  waiting_party: 'Anasubiri · kundi la {n}',
  checked_in_of: 'Ameingizwa · {a} kati ya {b}',
  vip: 'VIP',

  checked_in_title: 'Walioingia',
  everyone_in: 'Kila mtu yuko ndani',
  everyone_in_body: 'Mialiko yote {guests} imeskaniwa. {heads} {people} walipitia mlangoni.',
  person: 'mtu',
  people: 'watu',
  download_report: 'Pakua ripoti ya waliowasili',

  check_in: 'Check-in',
  open_guest_list: 'Fungua orodha ya wageni',
  go_back: 'Rudi nyuma',
  still_to_arrive: 'Bado hawajawasili',
  on_the_list: 'Kwenye orodha',
  caption_in: 'ndani',
  caption_invited: 'walioalikwa',
  already_scanned: 'Tayari imeskaniwa',
  not_valid: 'Si sahihi',
  couldnt_check_in: 'Imeshindikana kuwingiza',
  camera_blocked:
    'Ufikiaji wa kamera umezuiwa. Iruhusu kwa tovuti hii katika mipangilio ya kivinjari, kisha jaribu tena.',
  camera_needed: 'OpusPass inahitaji kamera yako ili skani tiketi za kuingia za wageni.',
  allow_camera: 'Ruhusu kamera',
  caption_waiting: 'wanasubiri',
  through_the_door: '{n} {people} wamepita mlangoni',

  verifying_link: 'Inathibitisha kiungo chako…',
  link_not_valid: 'Kiungo si sahihi',
  enter_code_instead: 'Ingiza msimbo badala yake',
  event: 'Tukio',
  whos_scanning: 'Nani anaskani?',
  start_shift_at:
    'Ingiza jina lako ili uanze zamu yako katika {door}. Linarekodiwa kwa kila mgeni unayemwingiza.',

  send_final_report: 'Tuma ripoti ya mwisho kwa wanandoa',
  guest_through_door: 'mgeni amepitia mlangoni',
  guests_through_door: 'wageni wamepita mlangoni',
  invitations_scanned: 'Mialiko iliyoskaniwa',
  of_count: '{a} kati ya {b}',
  search_arrived: 'Tafuta aliyeingia',
  load_arrivals_failed: 'Imeshindikana kupakia waliowasili.',
  empty_arrivals_search: 'Hakuna waliowasili wanaolingana na jina hilo.',
  empty_arrivals:
    'Bado hakuna mtu aliyeskaniwa. Waliowasili huonekana hapa wageni wanapopita mlangoni.',
  something_went_wrong: 'Kuna hitilafu.',
  your_current_shift: 'zamu yako ya sasa',
  checked_in_aria: 'ameingizwa',
  not_yet_arrived_aria: 'bado hajawasili',

  tips_title: 'Vidokezo vya skani tiketi',
  tips_heading: 'Skani tiketi ili umwingize mgeni',
  tip_hold_still: 'Elekeza kamera kwenye QR kwenye tiketi ya mgeni na ushikilie simu ikae kimya',
  tip_inside_brackets: 'Hakikisha msimbo mzima uko ndani ya mabano, karibu urefu wa mkono',
  tip_manual_fallback:
    'Ikiwa QR haifanyi skani, andika msimbo wa tiketi wa herufi 8 au mtafute mgeni kwa jina',
  got_it: 'Nimeelewa',
  see_tips: 'Ona vidokezo',
  dismiss_tips: 'Funga vidokezo vya skani',
  close: 'Funga',

  point_at_qr: 'Elekeza kwenye msimbo wa QR kwenye tiketi ya mgeni',
  qr_not_working: 'QR haifanyi kazi? Weka taarifa Mwenyewe',
  admitted_of: '{a} kati ya {b} wamekubaliwa',
  scan_next_guest: 'Skani mgeni anayefuata',
  find_guest_by_name: 'Tafuta mgeni kwa jina',
  cancel: 'Ghairi',
  enter_pass_or_code: 'Ingiza Pass ID au msimbo wa tiketi',
  search_by_name_instead: 'Tafuta kwa jina badala yake',
  enter_code_instead_mode: 'Ingiza Pass ID au msimbo wa tiketi badala yake',
  pass_code_hint:
    'Andika Pass ID au msimbo wa tiketi uliochapishwa chini ya QR kwenye tiketi ya mgeni. Pass ID inaonyesha mgeni ili uhakikishe kabla ya kumwingiza.',
  pass_or_ticket_code: 'Pass ID au msimbo wa tiketi',
  search_guest_name: 'Tafuta jina la mgeni',
  load_failed_use_code:
    'Imeshindikana kupakia orodha ya wageni. Bado unaweza kumwingiza mgeni kwa msimbo kutoka tiketi yake.',
  no_guest_matching: 'Hakuna mgeni anayelingana na “{query}”.',
  already_in_of: 'Tayari ndani, {a} kati ya {b}',
  how_many_arrived: 'Wangapi wamewasili?',
  invited_for_n: '{name} alialikwa kwa wageni {n}.',
  pass_accepted: 'Tiketi imekubaliwa',
  invited_n: 'Walioalikwa {n}',
  guests_arriving: 'Wageni wanaowasili',
  n_of_m: '{a} kati ya {b}',
  ticket_arriving: '{ticket} inaowasili',
  decrease_count: 'Wageni wachache',
  increase_count: 'Wageni zaidi',
  enter_count_arrived: 'Ingiza idadi iliyowasili',
  enter_number_between: 'Ingiza nambari kati ya 1 na {n}',
  check_in_1_guest: 'Wingiza mgeni 1',
  check_in_n_guests: 'Wingiza wageni {n}',
  done: 'Maliza',
}

const BY_LOCALE: Record<Locale, Record<ScannerStringKey, string>> = {
  en: SCANNER_STRINGS_EN,
  sw: SCANNER_STRINGS_SW,
}

export function scannerString(locale: Locale, key: ScannerStringKey, vars?: Record<string, string | number>): string {
  let raw = BY_LOCALE[locale]?.[key] ?? SCANNER_STRINGS_EN[key] ?? ''
  if (!vars) return raw
  return raw.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match))
}
