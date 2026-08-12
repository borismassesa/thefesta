import type { Metadata } from 'next'
import LegalDoc, { type LegalSection } from '../_legal/LegalDoc'

export const metadata: Metadata = {
  title: 'Cookie Policy | OpusPass',
  description: 'How OpusPass uses cookies and similar technologies, and how to control them.',
}

const sections: LegalSection[] = [
  {
    id: 'what-are-cookies',
    title: 'What are cookies?',
    body: (
      <p>
        Cookies are small text files a website stores on your device. We also use
        similar technologies like local storage and pixels. Together we call these
        &ldquo;cookies&rdquo;. They help OpusPass work properly, remember your preferences and
        understand how the Service is used.
      </p>
    ),
  },
  {
    id: 'how-we-use',
    title: 'How we use cookies',
    body: (
      <p>
        We use cookies to keep you signed in, secure your session, remember choices
        such as your language, hold the items in your cart, and measure how people use
        OpusPass so we can improve it.
      </p>
    ),
  },
  {
    id: 'types',
    title: 'Types of cookies we use',
    body: (
      <ul>
        <li>
          <strong>Essential</strong> — needed to run the Service, sign you in and keep
          it secure. These can&rsquo;t be switched off.
        </li>
        <li>
          <strong>Preferences</strong> — remember settings like language and saved
          designs so the Service feels familiar.
        </li>
        <li>
          <strong>Analytics</strong> — help us understand which features are used so we
          can improve them. These are aggregated and don&rsquo;t identify you personally.
        </li>
      </ul>
    ),
  },
  {
    id: 'managing',
    title: 'Managing cookies',
    body: (
      <p>
        Most browsers let you view, block or delete cookies through their settings.
        Blocking essential cookies may stop parts of OpusPass from working. Where the
        law requires consent for non-essential cookies, we&rsquo;ll ask before setting them.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <p>
        We may update this Cookie Policy as our Service evolves. We&rsquo;ll post any changes
        here and update the date above.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact us',
    body: (
      <p>
        Questions about cookies? Email{' '}
        <a href="mailto:privacy@opusfesta.com">privacy@opusfesta.com</a>.
      </p>
    ),
  },
]

export default function CookiesPage() {
  return (
    <LegalDoc
      eyebrow="Legal"
      title="Cookie Policy"
      updated="May 2026"
      intro={
        <p>
          This policy explains how OpusPass uses cookies and similar technologies,
          and how you can control them.
        </p>
      }
      sections={sections}
    />
  )
}
