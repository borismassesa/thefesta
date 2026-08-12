import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import LegalDoc, { type LegalSection } from '../../_legal/LegalDoc'
import { getLocale } from '@/lib/cms/locale'
import type { Locale } from '@/lib/cms/localized'

// Cancellation terms for the off-the-shelf side of OpusPass: catalogue digital
// card packages, the on-site attendant add-on and premium printed cards. These
// are the rules that have been in force since June 2026 and are unchanged here.
//
// They used to live at /cancellation. That URL now carries OP-CCS-POL-001, which
// covers custom card design commissions only, so this page keeps the package
// rules addressable and the two cross-reference each other. Do not merge them:
// they govern different purchases.

const pageMetadata: Record<Locale, Metadata> = {
  en: {
    title: 'Cancellation & Refund Policy: Digital Card Packages | OpusPass',
    description:
      'How cancellations and refunds work for OpusPass digital card packages, the on-site attendant add-on, and premium printed cards.',
  },
  sw: {
    title: 'Sera ya Kufuta na Kurejesha Fedha: Vifurushi vya Kadi za Kidijitali | OpusPass',
    description:
      'Jinsi kufuta oda na kurejesha fedha kunavyofanyika kwa vifurushi vya kadi za kidijitali, huduma ya msimamizi wa siku ya tukio, na kadi zilizochapishwa za OpusPass.',
  },
}

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata[await getLocale()]
}

type CancellationCopy = {
  eyebrow: string
  title: string
  updated: string
  intro: ReactNode
  sections: LegalSection[]
  labels: {
    lastUpdated: string
    tableOfContents: string
  }
}

const copy: Record<Locale, CancellationCopy> = {
  en: {
    eyebrow: 'Legal',
    title: 'Cancellation & Refund Policy: Digital Card Packages',
    updated: 'June 2026',
    intro: (
      <>
        <p>
          This policy explains how cancellations and refunds work across OpusPass digital card
          packages, add-ons, and printed cards.
        </p>
        <p>
          If you commissioned a <strong>custom card design</strong>, with a brief, a designer and
          drafts to approve, that purchase is covered by our{' '}
          <a href="/cancellation">Payment, Cancellation &amp; Refund Policy (OP-CCS-POL-001)</a>{' '}
          instead.
        </p>
      </>
    ),
    labels: {
      lastUpdated: 'Last updated',
      tableOfContents: 'Table of Contents',
    },
    sections: [
      {
        id: 'digital-packages',
        title: 'Digital packages',
        body: (
          <p>
            You can cancel for a <strong>full refund any time before your digital cards are sent</strong>.
            Once invites have gone out, the package is non-refundable. The cards and tickets are already
            live to your guests and the work has been delivered.
          </p>
        ),
      },
      {
        id: 'attendant-add-on',
        title: 'On-site attendant add-on',
        body: (
          <p>
            The on-site scanning attendant can be cancelled up to <strong>7 days before your event</strong>{' '}
            for a full refund. Within 7 days of the event the attendant has already been scheduled and travel
            arranged, so this add-on is non-refundable, though we&rsquo;ll always try to accommodate a date
            change where we can.
          </p>
        ),
      },
      {
        id: 'printed-cards',
        title: 'Premium printed cards',
        body: (
          <p>
            Printed cards can be cancelled for a full refund any time <strong>before they go to print</strong>.
            Once printing has started the cards are made to order, so the print portion of your order is
            non-refundable. Your digital package is unaffected and follows the policy above.
          </p>
        ),
      },
      {
        id: 'changes',
        title: 'Changing your event details',
        body: (
          <p>
            Because your digital cards are online, you can <strong>update event details such as venue,
            date, or time at no cost</strong>, even after invites are sent. Every guest sees the change
            instantly, so a reschedule never means buying again.
          </p>
        ),
      },
      {
        id: 'how-to-cancel',
        title: 'How to cancel',
        body: (
          <p>
            Email{' '}
            <a href="mailto:support@opusfesta.com">support@opusfesta.com</a>{' '}
            or message us on WhatsApp with
            your order details. Approved refunds are returned to your original payment method (M-Pesa, Airtel
            Money, Mixx by Yas, Selcom Pesa, Visa, or Mastercard) within 7&ndash;14 business days.
          </p>
        ),
      },
    ],
  },
  sw: {
    eyebrow: 'Kisheria',
    title: 'Sera ya Kufuta na Kurejesha Fedha: Vifurushi vya Kadi za Kidijitali',
    updated: 'Juni 2026',
    intro: (
      <>
        <p>
          Sera hii inaeleza jinsi kufuta oda na kurejesha fedha kunavyofanyika kwa vifurushi vya kadi
          za kidijitali vya OpusPass, huduma za ziada, na kadi zilizochapishwa.
        </p>
        <p>
          Kama uliagiza <strong>usanifu maalum wa kadi</strong>, wenye maelezo ya awali, msanifu na
          rasimu za kuidhinisha, ununuzi huo unahusika na{' '}
          <a href="/cancellation">Sera ya Malipo, Kughairi na Marejesho ya Fedha (OP-CCS-POL-001)</a>{' '}
          badala yake.
        </p>
      </>
    ),
    labels: {
      lastUpdated: 'Ilisasishwa mwisho',
      tableOfContents: 'Yaliyomo',
    },
    sections: [
      {
        id: 'digital-packages',
        title: 'Vifurushi vya kidijitali',
        body: (
          <p>
            Unaweza kufuta na kupata <strong>refund kamili wakati wowote kabla kadi zako za kidijitali hazijatumwa</strong>.
            Baada ya mialiko kutumwa, kifurushi hakiwezi kurejeshewa fedha kwa sababu kadi na tiketi tayari
            zipo live kwa wageni wako na kazi imeshakamilishwa.
          </p>
        ),
      },
      {
        id: 'attendant-add-on',
        title: 'Huduma ya msimamizi wa siku ya tukio',
        body: (
          <p>
            Huduma ya msimamizi wa kuscan tiketi eneo la tukio inaweza kufutwa hadi <strong>siku 7 kabla ya tukio lako</strong>{' '}
            na kupata refund kamili. Ndani ya siku 7 kabla ya tukio, msimamizi huwa ameshapangwa na safari
            imeandaliwa, hivyo huduma hii haiwezi kurejeshewa fedha. Hata hivyo, tutajitahidi kusaidia kubadilisha
            tarehe pale inapowezekana.
          </p>
        ),
      },
      {
        id: 'printed-cards',
        title: 'Kadi zilizochapishwa premium',
        body: (
          <p>
            Kadi zilizochapishwa zinaweza kufutwa na kurejeshewa fedha kamili wakati wowote <strong>kabla hazijaanza kuchapishwa</strong>.
            Baada ya uchapishaji kuanza, kadi hutengenezwa maalum kwa oda yako, hivyo sehemu ya uchapishaji haiwezi
            kurejeshewa fedha. Kifurushi chako cha kidijitali hakiathiriki na kinafuata sera iliyo hapo juu.
          </p>
        ),
      },
      {
        id: 'changes',
        title: 'Kubadilisha taarifa za tukio',
        body: (
          <p>
            Kwa sababu kadi zako za kidijitali zipo mtandaoni, unaweza <strong>kubadilisha taarifa za tukio
            kama ukumbi, tarehe, au muda bila gharama</strong>, hata baada ya mialiko kutumwa. Kila mgeni
            ataona mabadiliko mara moja, hivyo kupanga upya tarehe hakumaanishi kununua tena.
          </p>
        ),
      },
      {
        id: 'how-to-cancel',
        title: 'Jinsi ya kufuta',
        body: (
          <p>
            Tuma email kwenda{' '}
            <a href="mailto:support@opusfesta.com">support@opusfesta.com</a>{' '}au tutumie ujumbe WhatsApp ukiwa na
            taarifa za oda yako. Refund zilizoidhinishwa hurejeshwa kwenye njia yako ya awali ya malipo (M-Pesa,
            Airtel Money, Mixx by Yas, Selcom Pesa, Visa, au Mastercard) ndani ya siku 7&ndash;14 za kazi.
          </p>
        ),
      },
    ],
  },
}

export default async function DigitalCardsCancellationPage() {
  const locale = await getLocale()
  const content = copy[locale]

  return (
    <LegalDoc
      eyebrow={content.eyebrow}
      title={content.title}
      updated={content.updated}
      intro={content.intro}
      sections={content.sections}
      labels={content.labels}
    />
  )
}
