import type {
  Vendor,
  VendorCategoryId,
  VendorPricingPackage,
  VendorReview,
} from './vendors'

/* ───────────────────────────────────────────────────────────────
   City coordinates — rough central points for embedded Google maps
─────────────────────────────────────────────────────────────── */
const CITY_COORDS: Record<string, { lat: number; lng: number; area: string[] }> = {
  'Dar es Salaam': {
    lat: -6.7924,
    lng: 39.2083,
    area: ['Dar es Salaam', 'Bagamoyo', 'Mbezi Beach', 'Oyster Bay', 'Msasani'],
  },
  'Zanzibar': {
    lat: -6.1659,
    lng: 39.2026,
    area: ['Stone Town', 'Nungwi', 'Kendwa', 'Paje', 'Matemwe'],
  },
  'Arusha': {
    lat: -3.3731,
    lng: 36.6827,
    area: ['Arusha', 'Karatu', 'Usa River', 'Tengeru'],
  },
  'Moshi': {
    lat: -3.3349,
    lng: 37.3406,
    area: ['Moshi', 'Marangu', 'Machame', 'Himo'],
  },
  'Mwanza': {
    lat: -2.5164,
    lng: 32.9175,
    area: ['Mwanza', 'Ilemela', 'Nyamagana', 'Kisesa'],
  },
  'Dodoma': {
    lat: -6.1630,
    lng: 35.7516,
    area: ['Dodoma', 'Chamwino', 'Bahi'],
  },
}

const STREET_NAMES = [
  'Toure Drive', 'Msasani Peninsula', 'Haile Selassie Road',
  'Chole Road', 'Old Bagamoyo Road', 'Nyerere Avenue',
  'Kenyatta Avenue', 'Uhuru Street', 'Kilimani Road',
  'Seaview Avenue', 'Oceanfront Lane', 'Mbezi Gardens Rd',
]

const IMAGE_POOL = [
  '/assets/images/coupleswithpiano.jpg',
  '/assets/images/brideincar.jpg',
  '/assets/images/mauzo_crew.jpg',
  '/assets/images/flowers_pinky.jpg',
  '/assets/images/authentic_couple.jpg',
  '/assets/images/beautiful_bride.jpg',
  '/assets/images/bridering.jpg',
  '/assets/images/couples_together.jpg',
  '/assets/images/cutesy_couple.jpg',
  '/assets/images/beautyinbride.jpg',
  '/assets/images/bridewithumbrella.jpg',
  '/assets/images/churchcouples.jpg',
  '/assets/images/bride_umbrella.jpg',
  '/assets/images/hand_rings.jpg',
  '/assets/images/ring_piano.jpg',
]

/* ───────────────────────────────────────────────────────────────
   Deterministic pseudo-random helpers
─────────────────────────────────────────────────────────────── */
function seedFrom(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0
  return h || 1
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)]
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/* ───────────────────────────────────────────────────────────────
   Price-range parsing — "TZS 7M – 14M" → { low: 7, high: 14 }
─────────────────────────────────────────────────────────────── */
function parseRange(range: string): { low: number; high: number } {
  const matches = range.match(/([\d.]+)/g)
  if (!matches || matches.length === 0) return { low: 1, high: 3 }
  const nums = matches.map(Number).filter((n) => !isNaN(n))
  if (nums.length === 1) return { low: nums[0] * 0.8, high: nums[0] * 1.4 }
  return { low: nums[0], high: nums[nums.length - 1] }
}

function fmtPrice(tzsMillions: number): string {
  if (tzsMillions >= 10) return `TZS ${Math.round(tzsMillions)}M`
  return `TZS ${tzsMillions.toFixed(1).replace(/\.0$/, '')}M`
}

/* ───────────────────────────────────────────────────────────────
   Category templates
─────────────────────────────────────────────────────────────── */
type PackageBlueprint = {
  label: string
  /** multiplier against the lowest price number in priceRange */
  tierFactor: number
  services: string[]
  note?: string
}

type CategoryTemplate = {
  services: string[]
  packages: PackageBlueprint[]
  faqs: { question: string; answer: string }[]
  teamRoles: string[]
  aboutParagraphs: (vendor: Vendor) => string
  reviewSeeds: string[]
}

const GENERIC_FAQS = [
  {
    question: 'How far in advance should we book?',
    answer:
      'Most couples secure us 6–12 months out, especially for peak wedding months (June–September and December). Once a deposit is in, the date is yours.',
  },
  {
    question: 'Do you travel outside your home city?',
    answer:
      'Yes. We regularly work across Tanzania and the region. Travel, accommodation, and per diem for the team are calculated separately and added to your quote.',
  },
  {
    question: 'What does the deposit look like?',
    answer:
      'A 30% non-refundable retainer secures your date. The balance is split over milestone payments, with the final installment due 14 days before the wedding.',
  },
  {
    question: 'Can we customise a package?',
    answer:
      "Absolutely. The packages listed are starting points — tell us what matters most for your day and we'll shape a quote around it.",
  },
  {
    question: "Do you work with other vendors we've already booked?",
    answer:
      'Always. We coordinate closely with your planner, venue, photographer, and other suppliers so the day runs seamlessly.',
  },
  {
    question: 'What happens if the weather turns?',
    answer:
      'We build a weather contingency into every event — whether that means a backup indoor space, covered staging, or rescheduling outdoor portraits to a better window.',
  },
]

const CATEGORY_TEMPLATES: Partial<Record<VendorCategoryId, CategoryTemplate>> = {
  venues: {
    services: [
      'Full venue buyout for ceremony & reception',
      'On-site accommodation for couple and bridal party',
      'In-house catering and bar packages',
      'Pre-wedding tasting session',
      'Furniture, linens, and tableware included',
      'Dedicated day-of venue coordinator',
      'Ceremony setup and reception changeover',
      'Complimentary overnight stay for the couple',
      'Parking and guest transfers on request',
      'Weather contingency planning',
    ],
    packages: [
      {
        label: 'Intimate',
        tierFactor: 1,
        services: [
          'Up to 100 guests',
          'Ceremony site + reception space',
          'Tables, chairs, and linens',
          'Dedicated venue coordinator',
          '8-hour event window',
        ],
      },
      {
        label: 'Signature',
        tierFactor: 1.55,
        services: [
          'Up to 220 guests',
          'Full ceremony + reception spaces',
          'In-house catering starter menu',
          'Bar package (soft + beer/wine)',
          'Pre-wedding tasting',
          '10-hour event window',
        ],
      },
      {
        label: 'Signature + Stay',
        tierFactor: 2.1,
        services: [
          'Up to 320 guests',
          'Exclusive weekend buyout',
          'Full catering and premium bar',
          'Overnight rooms for bridal party',
          'On-site ceremony coordinator',
          'Rehearsal dinner included',
        ],
      },
    ],
    faqs: [
      {
        question: 'What is the maximum guest capacity?',
        answer:
          'We comfortably host from 80 to 320 guests for seated dinners, with flexible layouts for larger cocktail-style receptions.',
      },
      {
        question: 'Can we bring our own caterer or must we use yours?',
        answer:
          'We work with preferred caterers and can open the venue to approved outside kitchens for a small corkage/service fee.',
      },
      {
        question: 'Do you have accommodation on-site?',
        answer:
          'Yes — on-site suites and villas for the couple and bridal party, plus partner rates at nearby hotels for guests.',
      },
      {
        question: 'What time does the event need to end?',
        answer:
          'Music and bar service wind down at 1am as standard. Late licences can be arranged — let us know during planning.',
      },
      {
        question: 'Is there a backup plan for rain?',
        answer:
          'Every outdoor venue includes a covered tent or indoor conversion plan at no extra charge.',
      },
      {
        question: 'Are there fitting rooms for the bridal party?',
        answer:
          'Yes, private getting-ready suites for the bridal party and groomsmen, stocked with mirrors, refreshments, and ironing facilities.',
      },
    ],
    teamRoles: [
      'Venue Director',
      'Events Coordinator',
      'Head of Hospitality',
      'Executive Chef',
      'Guest Relations Lead',
    ],
    aboutParagraphs: (v) => [
      v.excerpt,
      `${v.name} has hosted over ${120 + (seedFrom(v.id) % 200)} weddings since opening, from intimate family ceremonies to 300-guest multi-day celebrations. The estate is fully licensed for civil ceremonies, with purpose-built ceremony lawns, covered reception halls, and private getting-ready suites.`,
      `Every wedding is led by a dedicated venue coordinator who becomes your single point of contact from the first site visit to the final send-off. They liaise with your planner, manage setup and breakdown, and make sure timings stay on track throughout the day.`,
      `Couples love us for the balance of space and service — a beautiful setting that still feels personal, with a team that takes care of every small detail so you can be fully present on the day.`,
    ].join('\n\n'),
    reviewSeeds: [
      'Our wedding at {VENDOR} was the day of our dreams. The grounds looked like a storybook — coordinator was incredibly organised and anticipated every need. Every guest commented on how seamless it all felt.',
      'Worth every shilling. {VENDOR} handled 210 guests without a single hiccup — the food was exceptional, the staff were warm, and the ceremony lawn at sunset will stay with us forever.',
      'We toured 8 venues before choosing {VENDOR}. The personal attention from the coordinator, the beautifully kept grounds, and the fact that everything we needed was on-site sealed it. Zero regrets.',
      'Communication throughout planning was excellent. The tasting, the rehearsal, the day itself — everything ran on time and felt elevated without being stuffy.',
      'Great space, beautiful setting. One or two small mix-ups on the day but the team handled them quickly and professionally. Would recommend.',
      'Absolutely stunning venue. The accommodation for our bridal party was a lifesaver — everyone stayed on-site and we had a proper rehearsal dinner the night before.',
      'The value for money is outstanding. Guests thought we spent far more than we did. The grounds do half the work for you.',
      'Our day-of coordinator at {VENDOR} was the MVP. She caught a timeline issue during cocktail hour and fixed it before we even knew there was a problem.',
    ],
  },

  photographers: {
    services: [
      'Full-day coverage (10 hours)',
      'Second shooter for broader coverage',
      'Bridal prep and getting-ready coverage',
      'Engagement / pre-wedding session',
      'Edited online gallery within 3 weeks',
      'High-resolution print-ready digital files',
      'Drone aerials (licensed)',
      'Custom photo album design',
      'Destination wedding coverage',
      'Social media highlight reel',
    ],
    packages: [
      {
        label: 'Essential',
        tierFactor: 1,
        services: [
          '6 hours coverage',
          'Lead photographer',
          'Online gallery (200+ edited photos)',
          'Print-ready digital files',
          'Delivery in 4 weeks',
        ],
      },
      {
        label: 'Full Day',
        tierFactor: 1.5,
        services: [
          '10 hours coverage',
          'Lead + second shooter',
          'Bridal prep coverage',
          'Online gallery (500+ edited photos)',
          'Engagement session',
          'Delivery in 3 weeks',
        ],
      },
      {
        label: 'Signature Story',
        tierFactor: 2.1,
        services: [
          'Full-day + rehearsal dinner',
          'Two photographers',
          'Drone aerials',
          'Engagement + bridal session',
          'Hand-designed photo album',
          'Private viewing and curation call',
          'Delivery in 2 weeks',
        ],
      },
    ],
    faqs: [
      {
        question: 'How long until we see our photos?',
        answer:
          'Sneak peeks in 48-72 hours, and the full edited gallery within 3 weeks. We also deliver social-ready squares for Instagram inside a week.',
      },
      {
        question: 'Do you shoot film or digital?',
        answer:
          'Primarily digital on high-end Sony mirrorless bodies, with a film back-up for the ceremony and first dance if the couple wants that texture.',
      },
      {
        question: 'Can we have the unedited files?',
        answer:
          "We deliver only our edited selects — typically 40–50 per hour of coverage. Raw files stay in our archive so we can keep our quality promise.",
      },
      {
        question: 'Will you travel for destination weddings?',
        answer:
          'Yes. Travel and accommodation are quoted per destination. We have a current East African passport and regional visa coverage.',
      },
      {
        question: 'Do you offer an engagement session?',
        answer:
          'Included with the Full Day and Signature packages — it doubles as a get-comfortable session so you feel relaxed on the wedding day itself.',
      },
      {
        question: 'What happens if you are sick on the day?',
        answer:
          'We have a network of trusted associate photographers. If the lead cannot shoot, we send a fully briefed associate photographer of the same calibre.',
      },
    ],
    teamRoles: [
      'Lead Photographer & Owner',
      'Second Shooter',
      'Retoucher & Gallery Manager',
      'Studio Producer',
      'Client Experience Lead',
    ],
    aboutParagraphs: (v) => [
      v.excerpt,
      `We have photographed over ${140 + (seedFrom(v.id) % 160)} weddings across Tanzania and East Africa. Our style is warm, documentary, and lightly editorial — we lean into candid moments over posed setups, and we shoot for real skin tones and natural light.`,
      `Every wedding includes a pre-shoot planning call to walk through the day, a hand-edited online gallery, and print-ready digital files. We never farm out editing — every image you see is touched by us.`,
      `Beyond the photos themselves, clients tell us the day flows better with us there. We read the room, stay out of the way when it matters, and make sure the important moments (the first look, the vows, the speeches) are always covered.`,
    ].join('\n\n'),
    reviewSeeds: [
      'The photos from {VENDOR} are unreal. Every time I open the gallery I cry. They captured moments we didnt even know were happening — my grandmother laughing, my husband wiping a tear during vows. Worth every shilling.',
      'Booked {VENDOR} based on their Instagram and they exceeded what I thought was possible. Calm presence, never in the way, and the final gallery arrived two weeks early.',
      'Our engagement session with {VENDOR} broke the ice and made the wedding day shoot feel effortless. Highly recommend doing that add-on if it is available.',
      'Professional, punctual, and kind. The second shooter caught angles our lead photographer physically couldn\'t be at. The coverage is complete in a way I didn\'t expect.',
      'Beautiful images and colour grading. A few shots I wish we had gotten, but overall a lovely gallery that we\'ll treasure.',
      'The drone footage is jaw-dropping. Having aerial shots of the ceremony and reception makes the album feel like a magazine feature.',
      'They worked seamlessly with our videographer and coordinator. No turf battles, just a team that made everyone look good.',
      'Could not be happier. The sneak peeks arrived 48-72 hours after the wedding and kept us floating on the honeymoon high for weeks.',
    ],
  },

  videographers: {
    services: [
      'Full-day cinematic coverage',
      'Highlight reel (3–5 min)',
      'Full-length ceremony edit',
      'Speeches and first dance cut',
      'Drone aerial coverage (licensed)',
      'Same-day edit screened at reception',
      'Engagement teaser film',
      'Raw ceremony footage delivery',
      'Social media vertical cuts',
      'Destination wedding coverage',
    ],
    packages: [
      {
        label: 'Documentary',
        tierFactor: 1,
        services: [
          '6 hours coverage',
          '3-min highlight film',
          'Ceremony edit',
          'Delivery in 6 weeks',
        ],
      },
      {
        label: 'Cinematic',
        tierFactor: 1.6,
        services: [
          '10 hours coverage',
          '5-min highlight film',
          'Full ceremony & speeches edit',
          'Drone aerials',
          'Vertical social cut',
          'Delivery in 4 weeks',
        ],
      },
      {
        label: 'Feature Story',
        tierFactor: 2.2,
        services: [
          'Two-shooter team',
          '10-min feature film',
          'Same-day edit screening',
          'Engagement teaser',
          'Raw footage archive',
          'Premiere evening with couple',
          'Delivery in 3 weeks',
        ],
      },
    ],
    faqs: GENERIC_FAQS,
    teamRoles: [
      'Director & Lead Shooter',
      'Second Camera',
      'Editor',
      'Drone Operator',
      'Audio Technician',
    ],
    aboutParagraphs: (v) => [
      v.excerpt,
      `Our films are built around sound and story — clean audio from the vows, real laughter from the speeches, and a visual grade that holds up a decade from now. We shoot on cinema-grade cameras and mix audio from multiple sources so your ceremony sounds as good as it looks.`,
      `Every wedding includes a planning call, a shoot day with our multi-camera team, and a careful edit. Highlight films typically run 3–5 minutes; full feature cuts run 10–15. You can share, stream, and download everything through a private client portal.`,
    ].join('\n\n'),
    reviewSeeds: [
      'Watching the highlight reel from {VENDOR} is like reliving the day — they captured sounds I forgot, expressions we missed, speeches from angles we never saw. Absolute magic.',
      'The same-day edit played at our reception brought the whole room to tears. I don\'t know how they turned around something so polished in hours but wow.',
      'Professional team, gorgeous colour grading, and the audio from the ceremony is crystal clear. Our vows will be part of our family archive forever.',
      'Drone coverage of the beach ceremony made the film feel cinematic. Worth the extra spend.',
      'Editing turnaround took a little longer than promised but the final film exceeded expectations.',
      'Seamless coordination with our photographer. They stayed out of each other\'s way and somehow got completely different coverage of the same moments.',
      'The vertical cuts for Instagram were a lovely surprise. Our friends still share them.',
      'Our feature film is 12 minutes long and I have watched it at least 40 times. Highly recommend.',
    ],
  },

  'djs-bands': {
    services: [
      'Ceremony sound system and mics',
      'DJ set for cocktails & reception',
      'Live band performance',
      'Bongo Flava and Afrobeats sets',
      'International Top 40 and dance sets',
      'Curated playlist consultation',
      'Dance floor lighting rig',
      'Fog/haze machines for dance floor',
      'Wireless mics for speeches',
      'MC / emcee services',
    ],
    packages: [
      {
        label: 'Ceremony + Cocktails',
        tierFactor: 1,
        services: [
          '4 hours coverage',
          'Ceremony PA and 2 wireless mics',
          'Cocktail hour DJ set',
          'Basic dance floor lighting',
        ],
      },
      {
        label: 'Full Reception',
        tierFactor: 1.6,
        services: [
          '8 hours coverage',
          'Ceremony + reception sound',
          'DJ + MC combo',
          'Upgraded lighting and haze',
          'Curated playlist consultation',
        ],
      },
      {
        label: 'Hybrid Live Set',
        tierFactor: 2.3,
        services: [
          '10 hours coverage',
          'Live band (4 pieces) + DJ',
          'Full sound and lighting rig',
          'MC services',
          'Custom song requests learned',
          'After-party set until 1am',
        ],
      },
    ],
    faqs: GENERIC_FAQS,
    teamRoles: [
      'Lead DJ & Owner',
      'MC / Emcee',
      'Band Leader',
      'Sound Engineer',
      'Lighting Tech',
    ],
    aboutParagraphs: (v) => [
      v.excerpt,
      `We read the room. Whether the crowd wants Bongo Flava classics, international house, or a soft acoustic ceremony set, we match the energy and move with it. Every wedding gets a planning call so we know your must-plays, do-not-plays, and the songs with personal meaning.`,
      `Our rig is road-ready and redundant. Duplicate speakers, back-up mics, and a dedicated sound tech on every gig mean the audio stays rock-solid from first look to last dance.`,
    ].join('\n\n'),
    reviewSeeds: [
      'The dance floor did NOT empty. {VENDOR} read the room perfectly — they nailed the transition from our first dance into a full Bongo Flava set and the energy never dipped.',
      'Our MC from {VENDOR} kept the programme flowing without being cheesy. Guests are still talking about it.',
      'The live band is phenomenal. They learned our first-dance song from a voice note and it sounded like the studio version.',
      'Booked them for the ceremony sound and it was worth it just for the crystal-clear audio on the vows and speeches.',
      'Great DJ, professional crew. One mic issue early on but it was sorted within a minute.',
      'The lighting rig completely transformed our venue after sunset. Looked like a proper nightclub.',
      'They played for 8 hours and never lost the crowd. Our wedding felt like a festival.',
      'Would book again in a heartbeat. Professional, kind, and genuinely enjoying their craft.',
    ],
  },

  florists: {
    services: [
      'Ceremony arch and altar florals',
      'Bridal bouquet and bridesmaid bouquets',
      'Boutonnieres and corsages',
      'Reception tablescapes and centrepieces',
      'Hanging floral installations',
      'Aisle florals and petals',
      'Cake floral accents',
      'Setup and teardown on-site',
      'Custom colour palette design',
      'Floral mock-up before wedding',
    ],
    packages: [
      {
        label: 'Ceremony Only',
        tierFactor: 1,
        services: [
          'Bridal bouquet',
          'Ceremony arch',
          'Aisle florals',
          '4 bridesmaid bouquets',
          'Boutonnieres (x4)',
        ],
      },
      {
        label: 'Ceremony + Reception',
        tierFactor: 1.7,
        services: [
          'Full ceremony package',
          '10 centrepieces',
          'Cake floral accent',
          'Setup and teardown',
          'Pre-wedding colour palette mock-up',
        ],
      },
      {
        label: 'Full Design',
        tierFactor: 2.5,
        services: [
          'Complete ceremony design',
          'Hanging installation over dance floor',
          'Reception tablescape (20 tables)',
          'Seating chart florals',
          'Dedicated floral designer on-day',
          'Post-event delivery to family homes',
        ],
      },
    ],
    faqs: GENERIC_FAQS,
    teamRoles: [
      'Lead Designer & Owner',
      'Senior Florist',
      'Installation Lead',
      'Studio Coordinator',
      'Workshop Florist',
    ],
    aboutParagraphs: (v) => [
      v.excerpt,
      `We source the freshest blooms from local growers and curated importers so everything looks perfect on the day — and often for days after. Every wedding includes a design mood-board call, a colour-palette mock-up, and a dedicated installation crew on-site.`,
      `We are known for our sculptural arches and overflowing tablescapes, but our favourite work often sits in the small details — bouquet ribbons, cake garlands, signage florals, and the tiny corsage that makes Grandma feel part of the day.`,
    ].join('\n\n'),
    reviewSeeds: [
      'The florals from {VENDOR} made my jaw drop when I walked into the ceremony. The arch was the centrepiece of every photo and I still cannot believe how lush and full everything was.',
      'They matched our exact colour palette (soft coral and sage) and worked seamlessly with our venue layout. Installation and teardown were invisible — we barely saw them.',
      'Our centrepieces were show-stopping. We had a hanging floral installation over the dance floor that everyone wanted photos under.',
      'Communication was warm and professional. The mood-board call helped us settle on a direction quickly.',
      'Fresh, beautiful blooms. A handful of bouquet flowers wilted slightly by the end of the night but that was our fault for not refrigerating.',
      'Premium service, premium price, worth it. Our wedding photos are walking floral advertisements for them.',
      'They even delivered the centrepieces to family homes after the reception. Beautiful touch.',
      'If you want floral drama that looks natural and not overworked, this is the team.',
    ],
  },

  caterers: {
    services: [
      'Pre-wedding tasting session',
      'Custom menu design',
      'Buffet-style service',
      'Plated dinner service',
      'Cocktail hour canapés',
      'Bar and beverage package',
      'Professional waitstaff',
      'All crockery, glassware, and linens',
      'Dietary accommodations (vegan, halal, GF)',
      'Late-night snack station',
    ],
    packages: [
      {
        label: 'Classic Buffet',
        tierFactor: 1,
        services: [
          'Up to 120 guests',
          '3-course buffet',
          'Soft drinks package',
          'Waitstaff and service setup',
          'Crockery and linens',
        ],
      },
      {
        label: 'Signature Dinner',
        tierFactor: 1.6,
        services: [
          'Up to 220 guests',
          'Cocktail hour canapés',
          '3-course plated dinner',
          'Bar package (beer + wine)',
          'Pre-wedding tasting',
          'Late-night snack station',
        ],
      },
      {
        label: 'Chef\'s Table',
        tierFactor: 2.4,
        services: [
          'Up to 280 guests',
          'Custom tasting menu',
          '5-course plated service',
          'Premium open bar',
          'Two tastings before the day',
          'Personal chef table visit',
          'Post-event send-off bites',
        ],
      },
    ],
    faqs: GENERIC_FAQS,
    teamRoles: [
      'Executive Chef & Owner',
      'Head of Service',
      'Sous Chef',
      'Beverage Manager',
      'Events Coordinator',
    ],
    aboutParagraphs: (v) => [
      v.excerpt,
      `Our menus celebrate East African flavour — Swahili coastal dishes, Chagga highland cuisine, and global comfort plates — all built around the season and the region. Every wedding includes a tasting session so you select the exact dishes you love.`,
      `We bring our own kitchen, full service team, and everything from crockery to cloth napkins. Dietary needs (vegan, halal, gluten-free, allergies) are handled individually — no guest gets a lesser version of the meal.`,
    ].join('\n\n'),
    reviewSeeds: [
      'Guests are STILL talking about the food at our wedding. {VENDOR} designed a menu that honoured my husband\'s Chagga heritage and my Tanzanian roots, and every dish landed. Outstanding.',
      'The tasting alone was worth the package — we tried six dishes with the chef and narrowed our menu with his guidance. Ten out of ten experience.',
      'Professional waitstaff, beautifully plated food, and zero dietary issues across 180 guests. Genuinely impressive logistics.',
      'The bar service was excellent. Signature cocktail named after us, which was a cute touch.',
      'Service was slightly slow between courses but the food was delicious so guests didn\'t mind.',
      'Booked the Chef\'s Table package and it was the best money we spent. Guests think they attended a high-end restaurant, not a wedding.',
      'Our late-night snack station was a hit — samosas and mandazi at midnight kept the dance floor going.',
      'Beautiful presentation, generous portions. Absolutely would book them again for anniversary or family celebration.',
    ],
  },

  'hair-makeup': {
    services: [
      'Bridal hair and makeup',
      'Bridesmaid hair and makeup',
      'Mother of the bride styling',
      'Trial run before the wedding',
      'Airbrush foundation',
      'False lashes application',
      'On-location service',
      'Touch-up kit and instructions',
      'Traditional bridal styling',
      'Second-look touch-up at reception',
    ],
    packages: [
      {
        label: 'Bridal Only',
        tierFactor: 1,
        services: [
          'Trial session before wedding',
          'Wedding-day hair and makeup',
          'False lashes',
          'Touch-up kit',
          'On-location service',
        ],
      },
      {
        label: 'Bride + Party',
        tierFactor: 1.7,
        services: [
          'Bride (trial + day of)',
          '4 bridesmaids',
          'Mother of the bride',
          'Coordinated styling palette',
          'On-location team',
        ],
      },
      {
        label: 'Full Bridal Party',
        tierFactor: 2.3,
        services: [
          'Bride with trial',
          '6+ bridesmaids',
          'Mothers of bride & groom',
          'Second-look touch-up at reception',
          'Two-stylist team on-site',
          'Traditional look for ceremony + modern for reception',
        ],
      },
    ],
    faqs: GENERIC_FAQS,
    teamRoles: [
      'Lead Makeup Artist & Owner',
      'Senior Hair Stylist',
      'Junior MUA',
      'Studio Manager',
      'Assisting Stylist',
    ],
    aboutParagraphs: (v) => [
      v.excerpt,
      `Our bridal looks are polished and photograph-ready — we use high-pigment, long-wear products that hold through ceremony tears, reception dancing, and outdoor portrait sessions in East African humidity.`,
      `Every bride gets a trial session before the wedding so we can dial in the exact look together. On the day, we travel to your getting-ready location and time our schedule around photography so everyone is ready when they need to be.`,
    ].join('\n\n'),
    reviewSeeds: [
      'I cried when I saw myself in the mirror. {VENDOR} somehow made me look like me but elevated — my husband cried, my mum cried, and the photos are incredible. Makeup held through an outdoor ceremony in full sun.',
      'Trial session was worth it. We adjusted my eye look and lip colour before the day so there were no surprises.',
      'Full bridal party of 7 was done on schedule with two stylists on-site. Efficient, kind, and a beautifully coordinated look across the party.',
      'Second-look touch-up at the reception was a lifesaver — fresh lipstick and powder before the first dance.',
      'Hair held through 6 hours of dancing in humid conditions. I don\'t know what hairspray they use but it\'s magic.',
      'The makeup was beautifully done but a touch heavier than my trial. Still gorgeous, just something to confirm on the day.',
      'Wonderful calm energy in the getting-ready room. They genuinely helped me stay present on a huge day.',
      'Photographer commented on how well the makeup photographed. Zero shine, natural skin, perfect application.',
    ],
  },
}

const REVIEW_AUTHORS = [
  'Amani Jengo', 'Neema Kileo', 'Brian Mushi', 'Sophia Mwanga',
  'Daniel Otieno', 'Zainab Issa', 'Grace Mboya', 'Kevin Wanjiru',
  'Leila Mohamed', 'Peter Masanja', 'Joyce Mrutu', 'Naomi Shayo',
  'Tariq Said', 'Ruth Chacha', 'Elias Komba', 'Mary Nyange',
]

const WEDDING_MONTHS = ['January', 'February', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const TEAM_NAMES = [
  ['Halima', 'Senga'], ['Godfrey', 'Rweyemamu'], ['Esther', 'Mkumbo'],
  ['Mussa', 'Ngalawa'], ['Brenda', 'Kimaro'], ['Joseph', 'Kabutho'],
  ['Linda', 'Mashaka'], ['Peter', 'Majaliwa'], ['Aisha', 'Omari'],
  ['David', 'Malima'], ['Mercy', 'Tarimo'], ['John', 'Mollel'],
]

const TEAM_BIOS = [
  'Trained in East Africa and London; has led over 80 weddings with us.',
  'Brings 7+ years of hospitality experience and a calm presence on the day.',
  'Known across the team for last-minute problem solving and warm guest care.',
  'Fluent in Swahili, English, and French — a favourite with international guests.',
  'Joined from a luxury resort background; obsessed with timeline precision.',
  'The quiet force behind every set-up. If it looks effortless, she did it.',
  'Four weddings a month, zero dropped balls. We don\'t know how he does it.',
  'Studied at the Culinary Institute; runs our tasting sessions and menu design.',
  'Started as an assistant three seasons ago; now leads our weekend team.',
  'Certified drone operator and licensed driver; handles our aerial coverage.',
]

const RESPONSE_TIMES = ['Within an hour', 'Within 2 hours', 'Within 4 hours', 'Within 72 hours']
const LANGUAGE_SETS: string[][] = [
  ['English', 'Swahili'],
  ['English', 'Swahili', 'French'],
  ['English', 'Swahili', 'Arabic'],
  ['Swahili', 'English', 'French', 'Italian'],
]

/* ───────────────────────────────────────────────────────────────
   Generators
─────────────────────────────────────────────────────────────── */
function generateGallery(vendorId: string, heroSrc: string): string[] {
  const rand = mulberry32(seedFrom(vendorId))
  const pool = IMAGE_POOL.filter((p) => p !== heroSrc)
  const shuffled = shuffle(pool, rand)
  return [heroSrc, ...shuffled.slice(0, 9)]
}

function generatePricingDetails(
  vendor: Vendor,
  template: CategoryTemplate,
): VendorPricingPackage[] {
  const { low } = parseRange(vendor.priceRange)
  return template.packages.map((pkg) => ({
    label: pkg.label,
    value: fmtPrice(low * pkg.tierFactor),
    services: pkg.services,
    note: pkg.note,
  }))
}

function generateTeam(
  vendor: Vendor,
  template: CategoryTemplate,
): NonNullable<Vendor['team']> {
  const rand = mulberry32(seedFrom(vendor.id + ':team'))
  const rand2 = mulberry32(seedFrom(vendor.id + ':avatars'))
  const count = 3
  const roles = shuffle(template.teamRoles, rand).slice(0, count)
  const names = shuffle(TEAM_NAMES, rand).slice(0, count)
  const bios = shuffle(TEAM_BIOS, rand).slice(0, count)
  const avatars = shuffle(IMAGE_POOL, rand2).slice(0, count)

  return roles.map((role, i) => ({
    name: `${names[i][0]} ${names[i][1]}`,
    role,
    bio: bios[i],
    avatar: avatars[i],
  }))
}

function generateReviews(
  vendor: Vendor,
  template: CategoryTemplate,
): VendorReview[] {
  const rand = mulberry32(seedFrom(vendor.id + ':reviews'))
  const targetCount = Math.min(vendor.reviewCount, 12)
  const count = Math.max(5, Math.min(targetCount, 10))

  const authors = shuffle(REVIEW_AUTHORS, rand).slice(0, count)
  const texts = shuffle(template.reviewSeeds, rand)

  const now = new Date()

  return authors.map((author, i) => {
    const text = texts[i % texts.length].replaceAll('{VENDOR}', vendor.name)
    // Mostly 4-5 stars, occasional 3-star for realism
    const ratingRoll = rand()
    const rating =
      ratingRoll < 0.62 ? 5
      : ratingRoll < 0.88 ? 4.5
      : ratingRoll < 0.96 ? 4
      : 3.5

    const daysAgo = Math.floor(rand() * 520) + 10
    const d = new Date(now)
    d.setDate(d.getDate() - daysAgo)
    const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

    const weddingMonth = pick(WEDDING_MONTHS, rand)
    const weddingYear = 2023 + Math.floor(rand() * 3)
    const weddingDate = `${weddingMonth} ${weddingYear}`

    // 30% of reviews have photo media
    const hasMedia = rand() < 0.3
    const media = hasMedia
      ? shuffle(IMAGE_POOL, rand).slice(0, 1 + Math.floor(rand() * 3)).map((src) => ({
          type: 'photo' as const,
          src,
        }))
      : undefined

    return {
      id: `${vendor.id}-rv-${i + 1}`,
      author,
      rating,
      text,
      date,
      weddingDate,
      media,
    }
  })
}

function generateLocation(vendor: Vendor) {
  const coords = CITY_COORDS[vendor.city]
  if (!coords) return undefined
  const rand = mulberry32(seedFrom(vendor.id + ':loc'))
  // Offset slightly so the marker isn't always exactly on city centre
  const lat = coords.lat + (rand() - 0.5) * 0.04
  const lng = coords.lng + (rand() - 0.5) * 0.04
  const street = pick(STREET_NAMES, rand)
  const number = 10 + Math.floor(rand() * 180)
  return {
    address: `${number} ${street}, ${vendor.city}, Tanzania`,
    lat,
    lng,
  }
}

function generateStartingPrice(vendor: Vendor): string {
  const { low } = parseRange(vendor.priceRange)
  return fmtPrice(low)
}

function generateAwards(vendor: Vendor): string[] | undefined {
  if (vendor.rating < 4.7) return undefined
  const rand = mulberry32(seedFrom(vendor.id + ':awards'))
  const pool = [
    "OpusFesta Couples' Choice 2025",
    'Zanzibar Tourism Excellence Award 2024',
    'East Africa Wedding Awards — Top 10',
    'Best of Tanzania Weddings 2023',
    'Featured in Bride East Africa Magazine',
  ]
  const count = 1 + Math.floor(rand() * 2)
  return shuffle(pool, rand).slice(0, count)
}

/* ───────────────────────────────────────────────────────────────
   Main enrichment entry
─────────────────────────────────────────────────────────────── */
export function enrichVendor(base: Vendor): Vendor {
  const template =
    CATEGORY_TEMPLATES[base.categoryId] ??
    CATEGORY_TEMPLATES.photographers! // sensible default

  const coords = CITY_COORDS[base.city]
  const rand = mulberry32(seedFrom(base.id + ':meta'))

  const about = base.about ?? template.aboutParagraphs(base)
  const gallery = base.gallery ?? generateGallery(base.id, base.heroMedia.src)
  const startingPrice = base.startingPrice ?? generateStartingPrice(base)
  const responseTime = base.responseTime ?? pick(RESPONSE_TIMES, rand)
  const locallyOwned = base.locallyOwned ?? true
  const yearsInBusiness =
    base.yearsInBusiness ?? 3 + (seedFrom(base.id) % 14)
  const languages = base.languages ?? pick(LANGUAGE_SETS, rand)
  const awards = base.awards ?? generateAwards(base)
  const capacity =
    base.capacity ??
    (base.categoryId === 'venues'
      ? { min: 60 + (seedFrom(base.id) % 60), max: 180 + (seedFrom(base.id) % 200) }
      : base.categoryId === 'caterers'
      ? { min: 50, max: 350 }
      : undefined)
  const services = base.services ?? template.services
  const pricingDetails =
    base.pricingDetails ?? generatePricingDetails(base, template)
  const detailedReviews =
    base.detailedReviews ?? generateReviews(base, template)
  const faqs = base.faqs ?? template.faqs
  const location = base.location ?? generateLocation(base)
  const serviceArea = base.serviceArea ?? coords?.area ?? [base.city]
  const team = base.team ?? generateTeam(base, template)
  const socialLinks = base.socialLinks ?? {
    instagram: `https://instagram.com/${base.slug.replace(/-/g, '')}`,
    facebook: `https://facebook.com/${base.slug}`,
    website: `https://${base.slug}.co.tz`,
  }

  return {
    ...base,
    about,
    gallery,
    startingPrice,
    responseTime,
    locallyOwned,
    yearsInBusiness,
    languages,
    awards,
    capacity,
    services,
    pricingDetails,
    detailedReviews,
    faqs,
    location,
    serviceArea,
    team,
    socialLinks,
  }
}
