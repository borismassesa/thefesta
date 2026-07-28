import { hasCompletePayout } from '../onboarding/payout'
import { type OnboardingDraft } from '../onboarding/draft'
import { sellsProducts, type VendorVertical } from '../onboarding/verticals'

export type SectionStatus = 'complete' | 'partial' | 'empty' | 'auto'

/** Sections that only make sense when the vendor sells booked time. */
const BOOKING_ONLY_SECTIONS = new Set(['services', 'packages', 'availability'])

export type StorefrontSection = {
  id: string
  label: string
  hint: string
  href: string
  status: SectionStatus
  required: boolean
  pageTitle: string
  pageDescription: string
}

const aboutComplete = (d: OnboardingDraft) =>
  d.bio.trim().length >= 80 && d.yearsInBusiness.trim() !== '' && d.languages.length > 0

const contactComplete = (d: OnboardingDraft) =>
  d.phone.trim() !== '' && d.whatsapp.trim() !== '' && d.email.trim() !== ''

const hoursComplete = (d: OnboardingDraft) =>
  Object.values(d.hours).some((h) => h.open && h.from && h.to)

const socialsCount = (d: OnboardingDraft) =>
  [d.socials.website, d.socials.instagram, d.socials.facebook, d.socials.tiktok].filter(
    (s) => s && s.trim() !== '',
  ).length

const packagesComplete = (d: OnboardingDraft) =>
  d.packages.length > 0 && d.packages.every((p) => p.name.trim() && p.price.trim())

const policiesComplete = (d: OnboardingDraft) =>
  Boolean(d.cancellationLevel) && Boolean(d.reschedulePolicy) && d.depositPercent.trim() !== ''

const payoutComplete = (d: OnboardingDraft) => hasCompletePayout(d)

// FAQ is an optional section — vendors may have one cornerstone Q&A or
// none at all. Treating the section as "partial" until 3 are filled in
// is overkill; the sidebar should reward any answered Q&A with a tick
// (same optional-friendly treatment as the Recognition section). Empty
// → empty; one or more valid pairs → complete.
const faqStatus = (d: OnboardingDraft): SectionStatus => {
  const valid = d.faqs.filter((f) => f.question.trim() && f.answer.trim()).length
  if (valid === 0) return 'empty'
  return 'complete'
}

const teamStatus = (d: OnboardingDraft): SectionStatus => {
  const valid = d.team.filter((m) => m.name.trim() && m.role.trim()).length
  if (valid === 0) return 'empty'
  if (valid >= 1) return 'complete'
  return 'partial'
}

const servicesStatus = (d: OnboardingDraft): SectionStatus => {
  const total = d.specialServices.length + d.customServices.length
  if (total === 0) return 'empty'
  if (total >= 3) return 'complete'
  return 'partial'
}

// Availability is wholly optional: a vendor with a wide-open calendar is a
// perfectly valid (and desirable) state, so we never nag with 'partial'. Any
// date the vendor has blocked marks the section complete; none leaves it empty.
const availabilityStatus = (d: OnboardingDraft): SectionStatus =>
  d.availability.length > 0 ? 'complete' : 'empty'

const PORTFOLIO_TARGET = 6
const COVER_SLOTS = 4

// Photos are stored in component state (blobs are too big for localStorage),
// so the editor reports back counts for both the fixed cover slots and the
// portfolio gallery. Both must hit their thresholds for the green tick.
const photosStatus = (d: OnboardingDraft): SectionStatus => {
  const covers = d.coverPhotoCount
  const portfolio = d.photoCount
  if (covers === 0 && portfolio === 0) return 'empty'
  if (covers >= COVER_SLOTS && portfolio >= PORTFOLIO_TARGET) return 'complete'
  return 'partial'
}

// Recognition is wholly optional — every field is a bonus trust signal, not
// a requirement. Plenty of legit vendors have no awards and don't yet have
// an established response time. Treat the section as complete the moment a
// vendor adds anything; otherwise leave it empty. We never return 'partial'
// here so the sidebar doesn't nag a vendor who simply has no awards yet.
const recognitionStatus = (d: OnboardingDraft): SectionStatus => {
  const hasAwards = d.awards.trim() !== '' || d.awardCertificates.length > 0
  const hasResponseTime = d.responseTimeHours.trim() !== ''
  if (hasAwards || hasResponseTime || d.locallyOwned) return 'complete'
  return 'empty'
}

/**
 * The storefront checklist, scoped to the vendor's vertical.
 *
 * Services, Packages & pricing and Availability all describe booked time:
 * what couples can book you for, what a tier costs, which dates you're free.
 * A gift shop or an attire seller has none of that — their offer is the
 * Products list, which is moderation-driven and deliberately outside the
 * completeness ring. Including those three for them would leave two required
 * sections permanently unfinishable and pin the ring below 100%.
 */
export function getStorefrontSections(
  d: OnboardingDraft,
  vertical: VendorVertical = 'service',
): StorefrontSection[] {
  // Profile is binary by design — couples need every contact channel before
  // booking, so a half-filled profile is treated as not started.
  const profileFilled =
    aboutComplete(d) && contactComplete(d) && hoursComplete(d) && socialsCount(d) > 0

  const bookingSections = !sellsProducts(vertical)

  return ([
    {
      id: 'about',
      label: 'Profile',
      hint: 'About, contact, hours, socials',
      href: '/storefront/about',
      status: profileFilled ? 'complete' : 'empty',
      required: true,
      pageTitle: 'Profile',
      pageDescription: 'Your bio, business hours, and contact details.',
    },
    {
      id: 'photos',
      label: 'Photos & videos',
      hint: 'Hero gallery and portfolio',
      href: '/storefront/photos',
      status: photosStatus(d),
      required: true,
      pageTitle: 'Photos & videos',
      pageDescription: 'Your hero shot, portfolio gallery, and video reels.',
    },
    {
      id: 'services',
      label: 'Services',
      hint: 'What couples can book you for',
      href: '/storefront/services',
      status: servicesStatus(d),
      required: true,
      pageTitle: 'Services offered',
      pageDescription: 'What couples can book — also powers search filters.',
    },
    {
      id: 'recognition',
      label: 'Awards & Recognition',
      hint: 'Awards, response time, badges',
      href: '/storefront/recognition',
      status: recognitionStatus(d),
      required: false,
      pageTitle: 'Awards & Recognition',
      pageDescription: 'Awards, response time, and trust badges.',
    },
    {
      id: 'packages',
      label: 'Packages & pricing',
      hint: 'Service tiers and pricing',
      href: '/storefront/packages',
      status: packagesComplete(d) && policiesComplete(d) && payoutComplete(d)
        ? 'complete'
        : packagesComplete(d)
          ? 'partial'
          : 'empty',
      required: true,
      pageTitle: 'Packages & pricing',
      pageDescription: 'Service tiers, deposits, and how you get paid.',
    },
    {
      id: 'team',
      label: 'Team members',
      hint: 'Staff bios and photos',
      href: '/storefront/team',
      status: teamStatus(d),
      required: false,
      pageTitle: 'Team members',
      pageDescription: 'Names, roles, and short bios for your team.',
    },
    {
      id: 'faq',
      label: 'FAQ',
      hint: 'Answer common questions upfront',
      href: '/storefront/faq',
      status: faqStatus(d),
      required: false,
      pageTitle: 'Frequently asked questions',
      pageDescription: 'Pre-empt the questions couples always ask.',
    },
    {
      id: 'availability',
      label: 'Availability & hours',
      hint: 'Block booked dates and set your weekly hours',
      href: '/storefront/availability',
      status: availabilityStatus(d),
      required: false,
      pageTitle: 'Availability & hours',
      pageDescription:
        'Block the dates you are already booked and set the weekly hours couples can reach you.',
    },
  ] as StorefrontSection[]).filter((s) =>
    bookingSections ? true : !BOOKING_ONLY_SECTIONS.has(s.id),
  )
}

export function computeCompleteness(sections: StorefrontSection[]) {
  const trackable = sections.filter((s) => s.status !== 'auto')
  const total = trackable.length
  const complete = trackable.filter((s) => s.status === 'complete').length

  const required = trackable.filter((s) => s.required)
  const optional = trackable.filter((s) => !s.required)

  const requiredComplete = required.filter((s) => s.status === 'complete').length
  const requiredPartial = required.filter((s) => s.status === 'partial').length
  const requiredTotal = required.length

  const optionalComplete = optional.filter((s) => s.status === 'complete').length
  const optionalTotal = optional.length

  // The headline number tracks REQUIRED readiness only. Optional sections used
  // to add bonus credit, but that let the ring read 100% while a required
  // section was still missing — a dishonest number that contradicted the
  // "required" warning shown right beside it. Now optional polish is reported
  // separately (optionalComplete/optionalTotal) and never inflates the gate.
  // Partial required sections earn half a slot so progress still moves as the
  // vendor fills a section in.
  const earned = requiredComplete + requiredPartial * 0.5
  const percent =
    requiredTotal === 0 ? 100 : Math.round((earned / requiredTotal) * 100)

  // "Ready" is the meaningful milestone: every required section is complete, so
  // couples have everything they need to discover and book this vendor.
  const isReady = requiredComplete === requiredTotal

  const requiredMissing = sections.filter(
    (s) => s.required && s.status !== 'complete' && s.status !== 'auto',
  )
  const optionalMissing = sections.filter(
    (s) => !s.required && s.status !== 'complete' && s.status !== 'auto',
  )

  return {
    percent,
    isReady,
    complete,
    total,
    requiredComplete,
    requiredTotal,
    optionalComplete,
    optionalTotal,
    requiredMissing,
    optionalMissing,
  }
}
