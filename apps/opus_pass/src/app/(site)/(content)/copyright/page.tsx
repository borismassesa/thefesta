import type { Metadata } from 'next'
import LegalDoc, { type LegalSection } from '../_legal/LegalDoc'

export const metadata: Metadata = {
  title: 'Copyright & IP | OpusPass',
  description: 'How OpusPass handles copyright, trademarks and intellectual-property reports.',
}

const sections: LegalSection[] = [
  {
    id: 'overview',
    title: 'Overview',
    body: (
      <p>
        OpusPass respects the intellectual-property rights of others and expects our
        users to do the same. This page explains how to report content you believe
        infringes your rights, what happens if your content is removed, and how we
        handle repeat infringers.
      </p>
    ),
  },
  {
    id: 'report',
    title: 'Report an infringement',
    body: (
      <>
        <p>
          If you believe content on OpusPass infringes your copyright or trademark,
          email <a href="mailto:legal@opusfesta.com">legal@opusfesta.com</a> with:
        </p>
        <ul>
          <li>a description of the work you believe has been infringed;</li>
          <li>the link or location of the content on OpusPass;</li>
          <li>your contact details (name, email, phone);</li>
          <li>
            a statement that you have a good-faith belief the use isn&rsquo;t authorised, and
            that the information in your notice is accurate;
          </li>
          <li>your physical or electronic signature.</li>
        </ul>
        <p>
          We&rsquo;ll review valid reports and take appropriate action, which may include
          removing the content.
        </p>
      </>
    ),
  },
  {
    id: 'counter-notice',
    title: 'If your content was removed',
    body: (
      <p>
        If we remove content you posted and you believe that was a mistake, you can
        send a counter-notice to{' '}
        <a href="mailto:legal@opusfesta.com">legal@opusfesta.com</a> explaining why you
        have the right to use it, along with your contact details. We&rsquo;ll review and,
        where appropriate, restore the content.
      </p>
    ),
  },
  {
    id: 'repeat-infringers',
    title: 'Repeat infringers',
    body: (
      <p>
        It&rsquo;s our policy to suspend or terminate, in appropriate circumstances, the
        accounts of users who repeatedly infringe the intellectual-property rights of
        others.
      </p>
    ),
  },
  {
    id: 'trademarks',
    title: 'Trademarks',
    body: (
      <p>
        The OpusPass and OpusFesta names and logos are trademarks of OpusFesta. You may
        not use them in a way that suggests endorsement or affiliation without our
        written permission.
      </p>
    ),
  },
  {
    id: 'templates',
    title: 'Templates and fonts',
    body: (
      <p>
        Our digital card templates, artwork and fonts are licensed to you for creating and
        sharing your own event digital cards through OpusPass. They remain the property of
        OpusFesta or our licensors and may not be resold, redistributed or used outside
        the Service. See our <a href="/terms">Terms of Use</a> for the full licence.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact us',
    body: (
      <p>
        For any intellectual-property matter, email{' '}
        <a href="mailto:legal@opusfesta.com">legal@opusfesta.com</a>.
      </p>
    ),
  },
]

export default function CopyrightPage() {
  return (
    <LegalDoc
      eyebrow="Legal"
      title="Copyright & IP"
      updated="May 2026"
      intro={
        <p>
          OpusPass respects intellectual-property rights and expects our users to do
          the same. Here&rsquo;s how to report infringement and how we respond.
        </p>
      }
      sections={sections}
    />
  )
}
