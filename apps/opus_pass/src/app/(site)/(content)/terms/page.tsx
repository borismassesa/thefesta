import type { Metadata } from 'next'
import LegalDoc, { type LegalSection } from '../_legal/LegalDoc'

export const metadata: Metadata = {
  title: 'Terms of Use | OpusPass',
  description: 'The terms governing your use of OpusPass.',
}

const sections: LegalSection[] = [
  {
    id: 'about',
    title: 'About these terms',
    body: (
      <>
        <p>
          OpusPass is a digital wedding-card and RSVP service operated by
          OpusFesta. These Terms of Use are an agreement between you and OpusFesta
          (&ldquo;OpusPass&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) and govern your access to and use of our
          websites, apps and services (together, the &ldquo;Service&rdquo;).
        </p>
        <p>
          By creating an account, sending a digital card or otherwise using the
          Service, you agree to these terms. If you don&rsquo;t agree, please don&rsquo;t use
          OpusPass.
        </p>
      </>
    ),
  },
  {
    id: 'using-opuspass',
    title: 'Using OpusPass',
    body: (
      <>
        <p>
          You must be at least 18 years old, or the age of legal majority where you
          live, to create an account. You&rsquo;re responsible for the activity on your
          account and for keeping your sign-in details secure.
        </p>
        <p>
          You agree to provide accurate information and to keep it up to date. We may
          update, suspend or stop offering features of the Service at any time.
        </p>
      </>
    ),
  },
  {
    id: 'your-content',
    title: 'Your content',
    body: (
      <>
        <p>
          You keep ownership of everything you add to OpusPass — your event details,
          photos, wording and the guest list you build or import (&ldquo;Your Content&rdquo;).
          You grant us a limited licence to host, store and display Your Content
          solely to operate the Service for you, such as rendering your digital card and
          delivering it to the guests you choose.
        </p>
        <p>
          You&rsquo;re responsible for Your Content and confirm that you have the right to
          share it, including the contact details of guests you add. Please only
          invite people who are happy to hear from you about your event.
        </p>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <>
        <p>When using OpusPass, you agree not to:</p>
        <ul>
          <li>use the Service for spam, unlawful, harmful or deceptive purposes;</li>
          <li>upload content you don&rsquo;t have the right to use, or that infringes someone else&rsquo;s rights;</li>
          <li>import or message contacts who haven&rsquo;t agreed to hear from you;</li>
          <li>attempt to break, overload, reverse-engineer or gain unauthorised access to the Service.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'payments',
    title: 'Payments and refunds',
    body: (
      <>
        <p>
          Some features are paid. Prices are shown before you buy and may be charged in
          Tanzanian Shillings via mobile money, card or other supported methods. By
          purchasing, you authorise us and our payment partners to charge the amount
          shown.
        </p>
        <p>
          Because digital card products are delivered immediately and
          personalised to your event, purchases are generally non-refundable except
          where required by law or stated otherwise at checkout.
        </p>
      </>
    ),
  },
  {
    id: 'intellectual-property',
    title: 'Our intellectual property',
    body: (
      <p>
        The OpusPass name, logo, designs, templates, fonts and software are owned by
        OpusFesta or our licensors and are protected by intellectual-property laws.
        Using our templates to create your digital card doesn&rsquo;t transfer ownership of
        the underlying design to you. See our{' '}
        <a href="/copyright">Copyright &amp; IP policy</a> for how to report
        infringement.
      </p>
    ),
  },
  {
    id: 'termination',
    title: 'Suspension and termination',
    body: (
      <p>
        You can stop using OpusPass and close your account at any time. We may suspend
        or end your access if you breach these terms, misuse the Service, or to protect
        OpusPass, our users or guests. Sections that by their nature should survive
        (such as content licences, disclaimers and liability limits) will continue to
        apply.
      </p>
    ),
  },
  {
    id: 'disclaimers',
    title: 'Disclaimers',
    body: (
      <p>
        OpusPass is provided &ldquo;as is&rdquo;. While we work hard to keep the Service reliable,
        we don&rsquo;t promise it will always be uninterrupted or error-free, and we&rsquo;re not
        responsible for the timing or delivery of messages by third-party networks
        (for example, SMS, WhatsApp or email providers).
      </p>
    ),
  },
  {
    id: 'liability',
    title: 'Limitation of liability',
    body: (
      <p>
        To the extent permitted by law, OpusFesta won&rsquo;t be liable for indirect or
        consequential losses, and our total liability connected to the Service is
        limited to the amount you paid us in the 12 months before the claim. Nothing
        in these terms limits liability that can&rsquo;t be limited under Tanzanian law.
      </p>
    ),
  },
  {
    id: 'governing-law',
    title: 'Governing law',
    body: (
      <p>
        These terms are governed by the laws of the United Republic of Tanzania, and
        the courts of Tanzania will have jurisdiction over any dispute, without
        affecting any mandatory consumer-protection rights you have where you live.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to these terms',
    body: (
      <p>
        We may update these terms from time to time. If we make material changes we&rsquo;ll
        post the updated terms here and update the date above. Continuing to use
        OpusPass after changes take effect means you accept the updated terms.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact us',
    body: (
      <p>
        Questions about these terms? Email{' '}
        <a href="mailto:hello@opusfesta.com">hello@opusfesta.com</a>.
      </p>
    ),
  },
]

export default function TermsPage() {
  return (
    <LegalDoc
      eyebrow="Legal"
      title="Terms of Use"
      updated="May 2026"
      intro={
        <p>
          Welcome to OpusPass. These terms explain the rules for using our
          digital-card and RSVP service, what you can expect from us, and what we
          expect from you. We&rsquo;ve kept them as plain as we can.
        </p>
      }
      sections={sections}
    />
  )
}
