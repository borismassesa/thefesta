import { buildContributorInviteEmail } from '@/lib/contributor-invite-email'
import { buildCardReviewEmail } from '@/lib/card-review-email'
import { buildDesignBriefEmail } from '@/lib/design-brief-email'
import { buildEditorialNotificationEmail } from '@/lib/editorial-notification-email'
import {
  buildChangesRequestedEmail,
  buildSubmissionApprovedEmail,
  buildSubmissionRejectedEmail,
} from '@/lib/submission-decision-email'

const SAMPLE = {
  authorEmail: 'aisha.mwangi@example.com',
  authorName: 'Aisha Mwangi',
  reviewer: { name: 'Boris Massesa', email: 'boris@opusfesta.com' },
  articleTitle: 'Five florists I would trust with my wedding',
  draftLink: 'https://admin.opusfesta.com/contribute/drafts/sample-id',
  publicLink: 'https://opusfesta.com/advice-and-ideas/five-florists-id-trust',
  reviewLink: 'https://admin.opusfesta.com/operations/articles/submissions/sample-id',
  inviteLink: 'https://admin.opusfesta.com/contribute/invite/sample-token',
  excerpt:
    'Choosing a florist felt like the most personal decision of the wedding. Here are the five we trusted, why, and what we asked them on day one.',
  heroImageUrl:
    'https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=1200&q=80',
}

export type TemplatePreview = {
  slug: string
  title: string
  description: string
  recipient: string
  trigger: string
  build: () => { subject: string; text: string; html: string }
}

export const TEMPLATE_PREVIEWS: TemplatePreview[] = [
  {
    slug: 'design-brief',
    title: 'New card to design',
    description:
      'Tells the design team a paid card has landed and the 48-hour design window has started.',
    recipient: 'Design team (DESIGN_NOTIFY_EMAIL, else staff with cms.write)',
    trigger: 'Finance approves a digital card payment',
    build: () =>
      buildDesignBriefEmail({
        ref: 'OF-2026-E746BC',
        contactName: 'Tausi Swedi',
        eventDate: '2026-08-08',
        // Fixed so the preview renders the same deadline every time.
        approvedAt: '2026-07-29T09:00:00.000Z',
        cardNames: ['Opus Royal Ivory', 'Amani Champagne Royale'],
        digitalCards: 200,
        printedCards: 25,
        adminBaseUrl: 'https://admin.opusfesta.com',
      }),
  },
  {
    slug: 'card-review',
    title: 'Card ready for review',
    description:
      'Tells whoever can release cards that a finished design is waiting on a second pair of eyes. Nothing reaches the couple until someone approves it.',
    recipient: 'Reviewers (CARD_REVIEW_NOTIFY_EMAIL, else staff with cms.publish)',
    trigger: 'A designer submits a card for review',
    build: () =>
      buildCardReviewEmail({
        designId: '9cad6b64-bd4a-4dfb-9fb4-8946449bddfe',
        cardName: 'Opus Royal Ivory',
        orderRef: 'OF-2026-A9A2C0',
        coupleName: 'Tausi Swedi',
        eventDate: '2026-08-08',
        submittedBy: 'designer@opusfesta.com',
        fieldsFilled: 19,
        fieldsTotal: 19,
        adminBaseUrl: 'https://admin.opusfesta.com',
      }),
  },
  {
    slug: 'contributor-invite',
    title: 'Contributor invitation',
    description: "Sent when an admin invites someone to write an article.",
    recipient: 'Author',
    trigger: 'Admin clicks "Invite contributor"',
    build: () =>
      buildContributorInviteEmail({
        recipientEmail: SAMPLE.authorEmail,
        recipientName: SAMPLE.authorName,
        articleTitle: SAMPLE.articleTitle,
        inviteLink: SAMPLE.inviteLink,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      }),
  },
  {
    slug: 'editorial-notification',
    title: 'New submission notification',
    description: "Sent to the editorial inbox when an author submits a draft.",
    recipient: 'admin@opusfesta.com (or admin_whitelist fallback)',
    trigger: 'Author clicks "Submit for review"',
    build: () =>
      buildEditorialNotificationEmail({
        authorName: SAMPLE.authorName,
        authorEmail: SAMPLE.authorEmail,
        articleTitle: SAMPLE.articleTitle,
        category: 'Vendors',
        wordCount: 1240,
        reviewLink: SAMPLE.reviewLink,
        submittedAt: new Date().toISOString(),
      }),
  },
  {
    slug: 'changes-requested',
    title: 'Changes requested',
    description: 'Sent to the author when an editor leaves notes and unlocks the draft.',
    recipient: 'Author',
    trigger: 'Editor clicks "Request changes" with notes',
    build: () =>
      buildChangesRequestedEmail({
        authorName: SAMPLE.authorName,
        authorEmail: SAMPLE.authorEmail,
        articleTitle: SAMPLE.articleTitle,
        notes:
          'The opening is great, but the section on Mwanza vendors needs more specificity — could you name two or three you would actually recommend?\n\nAlso, the closing paragraph repeats a point from the intro. Otherwise, lovely draft.',
        draftLink: SAMPLE.draftLink,
        reviewer: SAMPLE.reviewer,
      }),
  },
  {
    slug: 'rejected',
    title: 'Submission declined',
    description: 'Sent to the author when an editor declines to publish.',
    recipient: 'Author',
    trigger: 'Editor clicks "Reject"',
    build: () =>
      buildSubmissionRejectedEmail({
        authorName: SAMPLE.authorName,
        authorEmail: SAMPLE.authorEmail,
        articleTitle: SAMPLE.articleTitle,
        notes:
          "We're not running vendor recommendation pieces right now while we redesign that section. Please pitch us again in a couple of months when we relaunch.",
        draftLink: SAMPLE.draftLink,
        reviewer: SAMPLE.reviewer,
      }),
  },
  {
    slug: 'approved-published',
    title: 'Approved & published',
    description: 'Sent when an editor approves and publishes immediately. Uses sage/emerald.',
    recipient: 'Author',
    trigger: 'Editor clicks "Approve & publish"',
    build: () =>
      buildSubmissionApprovedEmail({
        authorName: SAMPLE.authorName,
        authorEmail: SAMPLE.authorEmail,
        articleTitle: SAMPLE.articleTitle,
        notes: null,
        draftLink: SAMPLE.draftLink,
        reviewer: SAMPLE.reviewer,
        published: true,
        publicLink: SAMPLE.publicLink,
        excerpt: SAMPLE.excerpt,
        heroImageUrl: SAMPLE.heroImageUrl,
      }),
  },
  {
    slug: 'approved-queued',
    title: 'Approved as draft (queued)',
    description: 'Sent when an editor approves but does not publish yet.',
    recipient: 'Author',
    trigger: 'Editor clicks "Approve as draft post"',
    build: () =>
      buildSubmissionApprovedEmail({
        authorName: SAMPLE.authorName,
        authorEmail: SAMPLE.authorEmail,
        articleTitle: SAMPLE.articleTitle,
        notes: null,
        draftLink: SAMPLE.draftLink,
        reviewer: SAMPLE.reviewer,
        published: false,
        publicLink: null,
        excerpt: SAMPLE.excerpt,
        heroImageUrl: SAMPLE.heroImageUrl,
      }),
  },
]

export function findPreview(slug: string): TemplatePreview | undefined {
  return TEMPLATE_PREVIEWS.find((tmpl) => tmpl.slug === slug)
}
