import type { Metadata } from 'next'
import LegalDoc, { type LegalSection } from '../_legal/LegalDoc'

export const metadata: Metadata = {
  title: 'Privacy Policy | OpusPass',
  description: 'How OpusPass collects, uses and protects your data and your guests’ data.',
}

const sections: LegalSection[] = [
  {
    id: 'summary',
    title: 'Summary',
    body: (
      <>
        <p>
          OpusPass (operated by OpusFesta) helps you create wedding digital cards and
          collect RSVPs. This policy explains what personal information we collect,
          how we use it, and the choices and rights you and your guests have. We don&rsquo;t
          sell your data.
        </p>
        <p>
          We handle personal information in line with Tanzania&rsquo;s Personal Data
          Protection Act, 2022 and its regulations.
        </p>
      </>
    ),
  },
  {
    id: 'what-we-collect',
    title: 'Information we collect',
    body: (
      <>
        <p>We collect:</p>
        <ul>
          <li><strong>Account information</strong> — your name, email, phone number and sign-in details.</li>
          <li><strong>Event content</strong> — the wording, dates, photos and design choices you add to your digital cards.</li>
          <li><strong>Guest information</strong> — the names and contact details you add or import to send digital cards and track replies.</li>
          <li><strong>RSVP responses</strong> — replies, meal choices and notes your guests submit.</li>
          <li><strong>Payment information</strong> — handled by our payment partners; we receive confirmation, not full card or mobile-money credentials.</li>
          <li><strong>Usage and device data</strong> — how you interact with the Service, collected through cookies and similar technologies.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'how-we-use',
    title: 'How we use information',
    body: (
      <>
        <p>We use personal information to:</p>
        <ul>
          <li>create and render your digital cards and deliver them to the guests you choose;</li>
          <li>collect and show you RSVP responses;</li>
          <li>process payments and send receipts;</li>
          <li>provide support and respond to your messages;</li>
          <li>keep the Service secure and prevent abuse;</li>
          <li>improve our features and, where you&rsquo;ve agreed, send you updates.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'guest-data',
    title: 'Guest data and RSVPs',
    body: (
      <p>
        When you add or import guests, you act as the controller of that information and
        OpusPass processes it on your behalf to deliver your digital cards and collect
        replies. Please only add guests who are happy to hear from you. We use guest
        contact details solely to send the digital cards you choose and to manage your
        RSVPs — never to market our own products to your guests.
      </p>
    ),
  },
  {
    id: 'sharing',
    title: 'How we share information',
    body: (
      <>
        <p>We share personal information only as needed to run the Service:</p>
        <ul>
          <li>with delivery partners (SMS, WhatsApp, email) to send your digital cards;</li>
          <li>with payment providers to process transactions;</li>
          <li>with hosting and infrastructure providers that store data securely on our behalf;</li>
          <li>where required by law, or to protect the rights and safety of OpusPass, our users and guests.</li>
        </ul>
        <p>We never sell personal information.</p>
      </>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies and tracking',
    body: (
      <p>
        We use cookies and similar technologies to keep you signed in, remember your
        preferences and understand how the Service is used. You can control these — see
        our <a href="/cookies">Cookie Policy</a> for details.
      </p>
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep it',
    body: (
      <p>
        We keep personal information for as long as your account is active or as needed
        to provide the Service, then for a reasonable period to meet legal, accounting
        and dispute-resolution needs. You can ask us to delete your event and guest
        data when you no longer need it.
      </p>
    ),
  },
  {
    id: 'your-rights',
    title: 'Your rights',
    body: (
      <>
        <p>Subject to applicable law, you have the right to:</p>
        <ul>
          <li>access the personal information we hold about you;</li>
          <li>correct information that&rsquo;s inaccurate or out of date;</li>
          <li>ask us to delete your information;</li>
          <li>object to or restrict certain processing, and withdraw consent;</li>
          <li>request a copy of your information in a portable format.</li>
        </ul>
        <p>
          To exercise these rights, email{' '}
          <a href="mailto:privacy@opusfesta.com">privacy@opusfesta.com</a>. You may
          also lodge a complaint with Tanzania&rsquo;s Personal Data Protection Commission.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'Security',
    body: (
      <p>
        We use technical and organisational measures — including encryption in transit
        and access controls — to protect personal information. No system is perfectly
        secure, but we work to keep your data safe and will notify you and the relevant
        authority of a breach where the law requires.
      </p>
    ),
  },
  {
    id: 'children',
    title: 'Children’s privacy',
    body: (
      <p>
        OpusPass is intended for adults planning events. We don&rsquo;t knowingly collect
        personal information from children. If you believe a child has provided us
        information, contact us and we&rsquo;ll remove it.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <p>
        We may update this policy from time to time. If we make material changes we&rsquo;ll
        post the new version here and update the date above.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact us',
    body: (
      <p>
        Questions about your privacy? Email{' '}
        <a href="mailto:privacy@opusfesta.com">privacy@opusfesta.com</a>.
      </p>
    ),
  },
]

export default function PrivacyPage() {
  return (
    <LegalDoc
      eyebrow="Legal"
      title="Privacy Policy"
      updated="May 2026"
      intro={
        <p>
          Your privacy — and that of the guests you invite — matters to us. This
          policy explains what we collect, how we use it, and the choices you have.
        </p>
      }
      sections={sections}
    />
  )
}
