import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import LegalDoc, { type LegalSection } from '../_legal/LegalDoc'
import { getLocale } from '@/lib/cms/locale'
import type { Locale } from '@/lib/cms/localized'

// OP-CCS-POL-001 v1.0 - Payment, Cancellation & Refund Policy for the OpusPass
// custom card design service. Board-approved public document: the wording here
// mirrors the approved policy, so treat edits as legal changes, not copy tweaks.
//
// Scope is custom design commissions only. Catalogue digital card packages, the
// on-site attendant and printed cards keep their own terms at
// /cancellation/digital-cards, cross-referenced from section 18.

const WEBSITE = 'opuspass.opusfesta.com'
const EMAIL = 'support@opusfesta.com'
const PHONE = '+255 799 202 171'
const WHATSAPP_HREF = 'https://wa.me/255799202171'

const pageMetadata: Record<Locale, Metadata> = {
  en: {
    title: 'Payment, Cancellation & Refund Policy | OpusPass',
    description:
      'How you pay for a custom card design through OpusPass, what happens if you cancel or postpone, and when you are entitled to money back.',
  },
  sw: {
    title: 'Sera ya Malipo, Kughairi na Marejesho ya Fedha | OpusPass',
    description:
      'Jinsi unavyolipia usanifu maalum wa kadi kupitia OpusPass, kinachotokea ukighairi au kuahirisha, na ni lini unastahili kurejeshewa fedha.',
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
    title: 'Payment, Cancellation & Refund Policy',
    updated: '1 August 2026',
    intro: (
      <>
        <p>
          <strong>OpusPass Custom Card Design Service</strong>
        </p>
        <p>
          This policy explains how you pay for a custom card design through OpusPass, what happens
          if you need to cancel or change your plans, and when you are entitled to money back.
        </p>
        <p>
          It applies to custom card design commissions purchased through OpusPass. It does not apply
          to our other services, which are listed in section 18.
        </p>
        <p>
          We have written this in plain language on purpose. If anything here is unclear, ask us.
          The contact details are at the end.
        </p>
      </>
    ),
    labels: {
      lastUpdated: 'Effective',
      tableOfContents: 'Table of Contents',
    },
    sections: [
      {
        id: 'policy-details',
        title: 'Policy details',
        body: (
          <div className="overflow-x-auto">
            <table>
              <tbody>
                <tr>
                  <th scope="row" className="w-44">Policy ID</th>
                  <td>OP-CCS-POL-001</td>
                </tr>
                <tr>
                  <th scope="row">Version</th>
                  <td>1.0</td>
                </tr>
                <tr>
                  <th scope="row">Effective date</th>
                  <td>1 August 2026</td>
                </tr>
                <tr>
                  <th scope="row">Last updated</th>
                  <td>1 August 2026</td>
                </tr>
                <tr>
                  <th scope="row">Next review</th>
                  <td>1 August 2027</td>
                </tr>
                <tr>
                  <th scope="row">Owner</th>
                  <td>Chief Strategy &amp; Finance Officer, OpusFesta Company Limited</td>
                </tr>
                <tr>
                  <th scope="row">Approved by</th>
                  <td>Board of Directors, OpusFesta Company Limited</td>
                </tr>
                <tr>
                  <th scope="row">Classification</th>
                  <td>Public</td>
                </tr>
              </tbody>
            </table>
          </div>
        ),
      },
      {
        id: 'definitions',
        title: '1. Definitions',
        body: (
          <>
            <p>In this policy:</p>
            <p>
              <strong>&ldquo;We&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;, &ldquo;OpusFesta&rdquo;</strong>{' '}
              means OpusFesta Company Limited, the company described in section 22.
            </p>
            <p>
              <strong>&ldquo;You&rdquo;, &ldquo;your&rdquo;, &ldquo;the Customer&rdquo;</strong> means
              the person who places and pays for an Order, whether or not they hold an OpusPass
              account.
            </p>
            <p>
              <strong>&ldquo;OpusPass&rdquo;</strong> means our online platform at {WEBSITE},
              including the customer order page and any account you hold with us.
            </p>
            <p>
              <strong>&ldquo;Order&rdquo;</strong> means a single custom card design commission,
              identified by an order number.
            </p>
            <p>
              <strong>&ldquo;Package&rdquo;</strong> means the service tier you selected at checkout,
              which determines the price, the delivery time and the number of Revisions included.
            </p>
            <p>
              <strong>&ldquo;Deposit&rdquo;</strong> means the first payment, being 50% of the Package
              price unless we have agreed otherwise in writing.
            </p>
            <p>
              <strong>&ldquo;Balance&rdquo;</strong> means the remainder of the amount owing on your
              Order after the Deposit and any other payments have been credited.
            </p>
            <p>
              <strong>&ldquo;Brief&rdquo;</strong> means the information you give us about your event
              and what you want on your card, submitted through OpusPass.
            </p>
            <p>
              <strong>&ldquo;Draft&rdquo;</strong> means a version of your design that we have shared
              with you for review.
            </p>
            <p>
              <strong>&ldquo;Revision&rdquo;</strong> means{' '}
              <strong>one consolidated set of requested changes</strong>, submitted together. Changes
              sent separately over several messages after we have started work on your requested
              changes count as separate Revisions.
            </p>
            <p>
              <strong>&ldquo;Correction&rdquo;</strong> means fixing something we got wrong, such as a
              misspelled name, a wrong date, or a file that does not work. Corrections are free and
              are not Revisions.
            </p>
            <p>
              <strong>&ldquo;Approval&rdquo;</strong> means the moment you accept a Draft, as defined
              in section 6.
            </p>
            <p>
              <strong>&ldquo;Delivery&rdquo;</strong> means the moment we release your final files to
              your OpusPass account, which happens once your Order is fully paid.
            </p>
            <p>
              <strong>&ldquo;Refund&rdquo;</strong> means money returned to you.
            </p>
            <p>
              <strong>&ldquo;Credit Note&rdquo;</strong> means credit issued by us that can be used
              against OpusFesta services instead of a cash Refund.
            </p>
            <p>
              <strong>&ldquo;Business Day&rdquo;</strong> means Monday to Friday, excluding public
              holidays in the United Republic of Tanzania.
            </p>
          </>
        ),
      },
      {
        id: 'how-payment-works',
        title: '2. How payment works',
        body: (
          <>
            <p>
              Your card design is paid in <strong>two parts</strong>, following normal practice in
              Tanzania:
            </p>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th className="w-32">Payment</th>
                    <th>When</th>
                    <th>How much</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Deposit</th>
                    <td>Before design work begins</td>
                    <td>50% of the Package price</td>
                  </tr>
                  <tr>
                    <th scope="row">Balance</th>
                    <td>After you approve the finished design</td>
                    <td>The remainder</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              You may pay either part by <strong>mobile money, Visa or Mastercard</strong> (confirmed
              within minutes) or by <strong>Lipa Namba</strong> (confirmed by our Finance team,
              usually within a few hours and always within one Business Day).
            </p>
            <p>
              <strong>What each payment unlocks:</strong>
            </p>
            <ul>
              <li>
                The <strong>Deposit</strong> starts the work. Your Order enters our design queue and a
                designer is assigned.
              </li>
              <li>
                The <strong>Balance</strong> releases your files. Until it is paid, you can view and
                comment on your design as a watermarked preview, but the final files are held.
              </li>
            </ul>
            <p>
              Your order page always shows your total, what you have paid, and what remains.
            </p>
          </>
        ),
      },
      {
        id: 'part-payments',
        title: '3. If you pay more or less than the amount due',
        body: (
          <>
            <p>
              <strong>If you pay less</strong>, nothing is lost. The amount you sent is credited to
              your Order and we will message you with exactly how much remains. Your Order waits at
              that step until the amount is complete.
            </p>
            <p>
              <strong>If you pay more</strong>, the extra is automatically applied to your Balance.
              You do not need to ask.
            </p>
          </>
        ),
      },
      {
        id: 'what-we-need',
        title: '4. What we need from you',
        body: (
          <>
            <p>So that we can do our work, you agree to:</p>
            <ul>
              <li>
                give us correct information in your Brief, including the{' '}
                <strong>correct spelling of all names</strong>;
              </li>
              <li>
                check every Draft carefully, particularly names, dates, times and venue details;
              </li>
              <li>
                send your requested changes as <strong>one consolidated list</strong> rather than in
                separate messages;
              </li>
              <li>
                respond to our questions within a reasonable time, so that your Order can meet your
                event date;
              </li>
              <li>
                only upload photographs, logos and other material that{' '}
                <strong>you own or have permission to use</strong>, and tell us if you are unsure.
              </li>
            </ul>
            <p>
              If you upload material you do not have the right to use, you are responsible for that,
              and you agree to cover any claim made against us as a result.
            </p>
            <p>
              We check names and dates carefully, but the final check is yours. Once you approve a
              Draft, that is the design we produce.
            </p>
          </>
        ),
      },
      {
        id: 'revisions',
        title: '5. Revisions and corrections',
        body: (
          <>
            <p>
              Your Package includes a set number of <strong>Revisions</strong>: changes you request to
              the design itself, such as colours, layout or wording. The number is shown on your order
              page.
            </p>
            <p>
              <strong>Corrections are always free and never count as a Revision.</strong> If we have
              spelled a name wrongly, used the wrong date, or given you a file that does not work,
              tell us and we will fix it at no charge. Our mistakes are ours to fix.
            </p>
            <p>
              If you use all your Revisions and want more, you can add them. The cost is added to your
              Balance, so you still make only one final payment.
            </p>
          </>
        ),
      },
      {
        id: 'approval',
        title: '6. What counts as Approval',
        body: (
          <>
            <p>
              Because Approval affects your Refund rights, we define it precisely.{' '}
              <strong>Approval happens only through OpusPass</strong>, in one of three ways:
            </p>
            <ol>
              <li>
                You select <strong>Approve</strong> on your order page; or
              </li>
              <li>
                You <strong>pay your Balance in full</strong>, which we treat as acceptance of the
                current Draft; or
              </li>
              <li>
                The <strong>review period for your Package ends</strong> without a response from you,
                after we have sent you at least two reminders. The review period is shown on your
                order page and is between 5 and 7 days depending on your Package.
              </li>
            </ol>
            <p>
              A message to us saying you are happy, whether by WhatsApp, SMS, email or phone, is{' '}
              <strong>not</strong> Approval on its own. If you tell us that way, we will ask you to
              confirm on your order page. This protects both of us.
            </p>
            <p>Every Approval is recorded with a date and time on your Order.</p>
          </>
        ),
      },
      {
        id: 'postponing',
        title: '7. Changing your event date',
        body: (
          <>
            <p>
              <strong>Postponing is free.</strong> If your event moves, tell us and we will update
              your Order and continue on the new timeline.
            </p>
            <p>
              You may postpone{' '}
              <strong>twice at no charge, within 24 months of your original order date</strong>. This
              is not a cancellation and does not affect anything you have paid.
            </p>
            <p>
              Beyond two postponements, or beyond 24 months, we will do our best to help, but we may
              need to treat it as a new Order. Designers, prices and available styles change over
              time.
            </p>
          </>
        ),
      },
      {
        id: 'cancelling',
        title: '8. Cancelling your Order',
        body: (
          <>
            <p>
              If you cancel, what you receive back depends on{' '}
              <strong>how much design work has already been done</strong> when you tell us.
            </p>
            <p>
              The percentages below apply to the <strong>Deposit</strong> you have paid.
            </p>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Where your Order has reached</th>
                    <th className="w-28">Refund</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Deposit not yet confirmed</td>
                    <td>Nothing has been taken from you</td>
                  </tr>
                  <tr>
                    <td>Deposit confirmed, Brief not yet complete</td>
                    <td>
                      <strong>100%</strong>
                    </td>
                  </tr>
                  <tr>
                    <td>Brief complete, waiting in the queue</td>
                    <td>
                      <strong>90%</strong>
                    </td>
                  </tr>
                  <tr>
                    <td>Designer assigned, work not yet started</td>
                    <td>
                      <strong>80%</strong>
                    </td>
                  </tr>
                  <tr>
                    <td>Work started, no Draft shared with you yet</td>
                    <td>
                      <strong>60%</strong>
                    </td>
                  </tr>
                  <tr>
                    <td>First Draft shared with you</td>
                    <td>
                      <strong>30%</strong>
                    </td>
                  </tr>
                  <tr>
                    <td>You have requested changes to a Draft</td>
                    <td>
                      <strong>10%</strong>
                    </td>
                  </tr>
                  <tr>
                    <td>You have approved a Draft</td>
                    <td>
                      <strong>0%</strong>
                    </td>
                  </tr>
                  <tr>
                    <td>Files delivered</td>
                    <td>
                      <strong>0%</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              <strong>We use the stage your Order had reached on the day you contacted us</strong>,
              not the day we process your request. If we are slow to respond, that is our problem, not
              yours.
            </p>
            <p>
              <strong>Your Balance is never owed on a cancelled Order.</strong> If you cancel after
              approving your design, you simply do not receive the files. We will not pursue you for
              the remainder.
            </p>
            <p>
              Each stage above is recorded on your Order with a date and time, so there is never any
              question about which one applies.
            </p>
          </>
        ),
      },
      {
        id: 'full-refunds',
        title: '9. When we refund everything',
        body: (
          <>
            <p>
              You receive a <strong>full Refund of everything you have paid</strong>, at any stage,
              and we absorb any transaction charges, if:
            </p>
            <ul>
              <li>we cannot assign a designer in time for your event;</li>
              <li>
                we are late by more than double the delivery time we promised, and you choose to
                cancel;
              </li>
              <li>the design we deliver is faulty and cannot be fixed;</li>
              <li>we cancel your Order for any reason of our own.</li>
            </ul>
            <p>If we have let you down, a Refund is the least we will do.</p>
          </>
        ),
      },
      {
        id: 'event-called-off',
        title: '10. If your event is called off',
        body: (
          <>
            <p>
              We understand that this happens, and that it is rarely a good day.
            </p>
            <p>
              You do not need to explain anything to us or provide any proof. Whatever stage your
              Order has reached, we will offer you a{' '}
              <strong>Credit Note for the full amount you have paid</strong>, valid for 24 months,
              which you may use yourself or give to someone else.
            </p>
            <p>
              If you would prefer money back instead, section 8 applies. But the Credit Note is
              available to you regardless of that table, and our team can offer it to you straight
              away. You do not need to ask for a manager.
            </p>
          </>
        ),
      },
      {
        id: 'credit-notes',
        title: '11. Credit Notes',
        body: (
          <>
            <p>
              In place of any cash Refund, we can issue a Credit Note worth{' '}
              <strong>110% of the Refund amount</strong>. So if TSh 50,000 is owed to you, you receive
              TSh 55,000 in credit.
            </p>
            <p>Credit Notes:</p>
            <ul>
              <li>
                are valid for <strong>12 months</strong> from issue (24 months where section 10
                applies);
              </li>
              <li>
                may be <strong>transferred to another person</strong>, once;
              </li>
              <li>
                may be used <strong>across more than one Order</strong>. If you do not use the full
                value at once, the remainder stays on the Credit Note;
              </li>
              <li>
                may be used together with a cash payment where the Order costs more than the credit;
              </li>
              <li>
                <strong>cannot be exchanged for cash</strong>, and expire if unused by the date shown.
              </li>
            </ul>
            <p>The expiry date does not extend when you make a partial redemption.</p>
          </>
        ),
      },
      {
        id: 'no-response',
        title: '12. If we do not hear from you',
        body: (
          <>
            <p>
              Some Orders stop moving because we are waiting on you. We will always chase before
              anything happens.
            </p>
            <p>
              <strong>Waiting for your Brief or your review:</strong> we will remind you by WhatsApp,
              SMS and email. If we have had no response for <strong>90 days</strong>, we may archive
              your Order. Archived Orders can be reopened. Contact us and we will restore it.
            </p>
            <p>
              <strong>Waiting for your Balance after Approval:</strong> your files are held until you
              pay. We will remind you, and if your event is close we will call you. If your Balance is
              unpaid <strong>21 days</strong> after Approval, your Order is closed and your Deposit is
              retained. Your design is not destroyed. If you pay later, we will release your files as
              normal.
            </p>
            <p>
              We would much rather finish your card than keep your Deposit. If something has gone
              wrong, tell us.
            </p>
          </>
        ),
      },
      {
        id: 'requesting-a-refund',
        title: '13. How to request a Refund, and how long it takes',
        body: (
          <>
            <p>
              <strong>To request:</strong> message us on{' '}
              <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
              , call us, or use the Help option on your order page. Requests made by any of these
              routes are recorded against your Order in the same way and carry the same date.
            </p>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Step</th>
                    <th className="w-56">Timeframe</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>We tell you our decision</td>
                    <td>
                      Within <strong>3 Business Days</strong>
                    </td>
                  </tr>
                  <tr>
                    <td>Money sent by mobile money</td>
                    <td>
                      Within <strong>7 Business Days</strong> of approval
                    </td>
                  </tr>
                  <tr>
                    <td>Money sent by bank transfer</td>
                    <td>
                      Within <strong>14 Business Days</strong> of approval
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              Refunds of card and mobile money payments are returned to the account you paid from.
              Refunds of Lipa Namba payments are sent to the mobile money number registered on your
              Order. For your protection, we will not send a Refund to a different number without
              additional verification.
            </p>
          </>
        ),
      },
      {
        id: 'ownership',
        title: '14. Who owns the design',
        body: (
          <>
            <p>
              <strong>Before your Order is fully paid</strong>, we own everything. Previews are shared
              with you for review only. You may not print, publish, forward or otherwise use a
              watermarked preview.
            </p>
            <p>
              <strong>Once your Order is fully paid</strong>, you receive a{' '}
              <strong>permanent, non-exclusive licence</strong> to use the finished design for your
              own event. That includes printing it, sharing it with your guests, sending it by
              WhatsApp, and using it on social media.
            </p>
            <p>
              <strong>We keep ownership of the source files</strong> and of the underlying design
              work, including fonts, layouts, illustrations and templates. You may not resell the
              design, licence it to anyone else, or use it commercially, and you may not remove or
              alter our credit where it appears.
            </p>
            <p>
              <strong>Material you give us</strong>, such as photographs, logos and artwork, remains
              yours. By uploading it you confirm you have the right to use it, and you give us
              permission to use it in producing your card.
            </p>
            <p>
              <strong>Showing your design in our portfolio:</strong> we may display finished designs
              in our portfolio, on our website and in our marketing, with personal details such as
              guest names removed. If you would prefer we did not, tell us at any time and we will
              not, with no effect on anything else in this policy.
            </p>
          </>
        ),
      },
      {
        id: 'privacy',
        title: '15. Your privacy',
        body: (
          <>
            <p>
              Processing a Refund means handling personal information, including your name, phone
              number and payment details. We handle this in accordance with the{' '}
              <strong>
                <a href="/privacy">OpusFesta Privacy Policy</a> (OF-LGL-POL-003)
              </strong>{' '}
              and applicable Tanzanian data protection law.
            </p>
            <p>
              We keep records of your Order, your payments and our communications with you for as long
              as we are required to, and use them only for operating your Order, meeting our legal
              obligations, and resolving disputes.
            </p>
          </>
        ),
      },
      {
        id: 'chargebacks',
        title: '16. Chargebacks and payment disputes',
        body: (
          <>
            <p>
              If you raise a dispute or chargeback with your bank or mobile money provider, then until
              the provider resolves it:
            </p>
            <ul>
              <li>
                work on your Order <strong>stops</strong>, and any assigned designer is stood down;
              </li>
              <li>
                your files and previews are <strong>frozen</strong> and cannot be accessed;
              </li>
              <li>
                any Refund request you have with us is <strong>paused</strong>;
              </li>
              <li>
                your OpusPass account may be <strong>suspended</strong>.
              </li>
            </ul>
            <p>
              We will cooperate fully with your provider and provide our records of the Order.
            </p>
            <p>
              <strong>Please talk to us first.</strong> A chargeback usually takes weeks. We answer
              Refund requests in three Business Days.
            </p>
          </>
        ),
      },
      {
        id: 'events-outside-our-control',
        title: '17. Events outside our control',
        body: (
          <>
            <p>
              Neither of us is responsible for failing to meet an obligation under this policy where
              that failure is caused by something outside our reasonable control, including natural
              disasters, flooding, fire, epidemic or pandemic, war or civil unrest, government action,
              strikes, and failures of electricity, internet, telecommunications or mobile money
              networks.
            </p>
            <p>
              If that happens, we will tell you as soon as we can and agree a new timeline with you.
              If the delay makes your Order pointless, for example if it runs past your event date,
              you may cancel and we will refund you <strong>in full</strong>, without applying section
              8.
            </p>
          </>
        ),
      },
      {
        id: 'not-covered',
        title: '18. What this policy does not cover',
        body: (
          <>
            <ul>
              <li>
                <strong>Printing, guest numbers, venues and other vendors.</strong> This policy covers
                the design of your card only.
              </li>
              <li>
                <strong>Our other services.</strong> These have their own terms:
                <ul>
                  <li>
                    OpusPass digital card packages, the on-site attendant add-on and premium printed
                    cards:{' '}
                    <a href="/cancellation/digital-cards">
                      Cancellation &amp; Refund Policy for digital card packages
                    </a>
                  </li>
                  <li>Vendor bookings through OpusFesta: OF-LGL-POL-001</li>
                  <li>OpusStudio photography, videography and content: OS-LGL-POL-001</li>
                  <li>
                    OpusPass platform use generally: <a href="/terms">OP-LGL-TOS-001</a>
                  </li>
                  <li>
                    Privacy: <a href="/privacy">OF-LGL-POL-003</a>
                  </li>
                </ul>
              </li>
            </ul>
            <p>
              Where this policy and another OpusFesta document disagree about a custom card design
              Order, this policy applies.
            </p>
          </>
        ),
      },
      {
        id: 'disagreements',
        title: '19. If you disagree with our decision',
        body: (
          <>
            <p>
              Ask us to review it. Refund decisions are reviewed by our Chief Strategy &amp; Finance
              Officer, and beyond that by our Chief Executive Officer. We would rather hear from you
              directly than have you leave unhappy.
            </p>
            <p>If we still cannot agree, section 20 applies.</p>
          </>
        ),
      },
      {
        id: 'governing-law',
        title: '20. Governing law and disputes',
        body: (
          <>
            <p>
              This policy is governed by the laws of the{' '}
              <strong>United Republic of Tanzania</strong>.
            </p>
            <p>
              If a dispute arises, we both agree to try to resolve it by discussion first. If that
              does not work within 30 days, we agree to attempt mediation in Dar es Salaam before
              starting court proceedings. Failing that, the courts of the United Republic of Tanzania
              have jurisdiction.
            </p>
            <p>
              Nothing in this policy limits any right you have under Tanzanian consumer protection
              law.
            </p>
            <p>
              <strong>Language:</strong> This policy is published in Kiswahili and English. Where the
              two versions differ in meaning, <strong>the Kiswahili version prevails</strong>.
            </p>
          </>
        ),
      },
      {
        id: 'changes',
        title: '21. Changes to this policy',
        body: (
          <p>
            We may update this policy from time to time. The version that applies to your Order is{' '}
            <strong>the version in force on the day you placed it</strong>, and we will keep previous
            versions available on request. We will tell you about material changes before they take
            effect.
          </p>
        ),
      },
      {
        id: 'contact',
        title: '22. Who we are, and how to reach us',
        body: (
          <>
            <div className="overflow-x-auto">
              <table>
                <tbody>
                  <tr>
                    <th scope="row" className="w-44">Registered name</th>
                    <td>OpusFesta Company Limited</td>
                  </tr>
                  <tr>
                    <th scope="row">Registered address</th>
                    <td>
                      Samaki Wabichi Annex, Mbezi Beach, P.O. Box 7787, Dar es Salaam, United Republic
                      of Tanzania
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Website</th>
                    <td>{WEBSITE}</td>
                  </tr>
                  <tr>
                    <th scope="row">Email</th>
                    <td>
                      <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">WhatsApp</th>
                    <td>
                      <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer">
                        {PHONE}
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Phone</th>
                    <td>{PHONE}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[13px] text-gray-400">
              OP-CCS-POL-001 v1.0 &middot; OpusFesta Company Limited
            </p>
          </>
        ),
      },
    ],
  },
  sw: {
    eyebrow: 'Kisheria',
    title: 'Sera ya Malipo, Kughairi na Marejesho ya Fedha',
    updated: '1 Agosti 2026',
    intro: (
      <>
        <p>
          <strong>Huduma ya Usanifu Maalum wa Kadi, OpusPass</strong>
        </p>
        <p>
          Sera hii inaeleza jinsi unavyolipia usanifu maalum wa kadi kupitia OpusPass, kinachotokea
          iwapo utahitaji kughairi au kubadilisha mipango yako, na ni lini unastahili kurejeshewa
          fedha zako.
        </p>
        <p>
          Inahusu oda za usanifu maalum wa kadi zilizonunuliwa kupitia OpusPass. Haihusu huduma zetu
          nyingine, ambazo zimeorodheshwa katika kifungu cha 18.
        </p>
        <p>
          Tumeandika sera hii kwa lugha rahisi kwa makusudi. Kama kuna jambo lolote hapa ambalo
          halieleweki, tuulize. Mawasiliano yetu yapo mwishoni.
        </p>
      </>
    ),
    labels: {
      lastUpdated: 'Inaanza kutumika',
      tableOfContents: 'Yaliyomo',
    },
    sections: [
      {
        id: 'policy-details',
        title: 'Taarifa za sera',
        body: (
          <div className="overflow-x-auto">
            <table>
              <tbody>
                <tr>
                  <th scope="row" className="w-44">Namba ya Sera</th>
                  <td>OP-CCS-POL-001-SW</td>
                </tr>
                <tr>
                  <th scope="row">Toleo</th>
                  <td>1.0</td>
                </tr>
                <tr>
                  <th scope="row">Tarehe ya kuanza kutumika</th>
                  <td>1 Agosti 2026</td>
                </tr>
                <tr>
                  <th scope="row">Ilisasishwa mara ya mwisho</th>
                  <td>1 Agosti 2026</td>
                </tr>
                <tr>
                  <th scope="row">Mapitio yajayo</th>
                  <td>1 Agosti 2027</td>
                </tr>
                <tr>
                  <th scope="row">Mmiliki</th>
                  <td>Afisa Mkuu wa Mikakati na Fedha, OpusFesta Company Limited</td>
                </tr>
                <tr>
                  <th scope="row">Imeidhinishwa na</th>
                  <td>Bodi ya Wakurugenzi, OpusFesta Company Limited</td>
                </tr>
                <tr>
                  <th scope="row">Aina</th>
                  <td>Ya Umma</td>
                </tr>
              </tbody>
            </table>
          </div>
        ),
      },
      {
        id: 'definitions',
        title: '1. Tafsiri za maneno',
        body: (
          <>
            <p>Katika sera hii:</p>
            <p>
              <strong>&ldquo;Sisi&rdquo;, &ldquo;wetu&rdquo;, &ldquo;OpusFesta&rdquo;</strong>{' '}
              inamaanisha OpusFesta Company Limited, kampuni iliyoelezwa katika kifungu cha 22.
            </p>
            <p>
              <strong>&ldquo;Wewe&rdquo;, &ldquo;yako&rdquo;, &ldquo;Mteja&rdquo;</strong> inamaanisha
              mtu anayeweka na kulipia Oda, iwe ana akaunti ya OpusPass au la.
            </p>
            <p>
              <strong>&ldquo;OpusPass&rdquo;</strong> inamaanisha mfumo wetu wa mtandaoni ulioko{' '}
              {WEBSITE}, ikijumuisha ukurasa wa oda yako na akaunti yoyote uliyo nayo kwetu.
            </p>
            <p>
              <strong>&ldquo;Oda&rdquo;</strong> inamaanisha kazi moja ya usanifu maalum wa kadi,
              inayotambulika kwa namba ya oda.
            </p>
            <p>
              <strong>&ldquo;Kifurushi&rdquo;</strong> inamaanisha kiwango cha huduma ulichochagua
              wakati wa kulipia, ambacho huamua bei, muda wa kukamilisha, na idadi ya Marekebisho
              yanayojumuishwa.
            </p>
            <p>
              <strong>&ldquo;Malipo ya Awali&rdquo;</strong> inamaanisha malipo ya kwanza, yaani
              asilimia 50 ya bei ya Kifurushi, isipokuwa kama tumekubaliana vinginevyo kwa maandishi.
            </p>
            <p>
              <strong>&ldquo;Salio&rdquo;</strong> inamaanisha kiasi kilichobaki kwenye Oda yako baada
              ya Malipo ya Awali na malipo mengine yoyote kuhesabiwa.
            </p>
            <p>
              <strong>&ldquo;Maelezo ya Awali&rdquo;</strong> inamaanisha taarifa unazotupatia kuhusu
              tukio lako na unachotaka kiwe kwenye kadi yako, zilizowasilishwa kupitia OpusPass.
            </p>
            <p>
              <strong>&ldquo;Rasimu&rdquo;</strong> inamaanisha toleo la usanifu wako ambalo
              tumekuonesha ili uipitie.
            </p>
            <p>
              <strong>&ldquo;Marekebisho&rdquo;</strong> inamaanisha{' '}
              <strong>orodha moja iliyounganishwa ya mabadiliko unayoomba</strong>, yaliyowasilishwa
              kwa pamoja. Mabadiliko yanayotumwa kwa nyakati tofauti baada ya sisi kuanza kufanyia
              kazi maombi yako ya awali huhesabiwa kama Marekebisho mengine.
            </p>
            <p>
              <strong>&ldquo;Masahihisho&rdquo;</strong> inamaanisha kurekebisha kosa tulilolifanya
              sisi, kama vile jina lililoandikwa vibaya, tarehe isiyo sahihi, au faili lisilofanya
              kazi. Masahihisho ni bure na si Marekebisho.
            </p>
            <p>
              <strong>&ldquo;Idhini&rdquo;</strong> inamaanisha wakati unapokubali Rasimu, kama
              ilivyoelezwa katika kifungu cha 6.
            </p>
            <p>
              <strong>&ldquo;Ukabidhi&rdquo;</strong> inamaanisha wakati tunapotoa mafaili yako ya
              mwisho kwenye akaunti yako ya OpusPass, jambo linalotokea pale Oda yako inapolipwa
              kikamilifu.
            </p>
            <p>
              <strong>&ldquo;Marejesho&rdquo;</strong> inamaanisha fedha zinazorudishwa kwako.
            </p>
            <p>
              <strong>&ldquo;Hati ya Thamani&rdquo; (Credit Note)</strong> inamaanisha thamani
              tunayokupatia ambayo unaweza kuitumia kulipia huduma za OpusFesta badala ya kurejeshewa
              fedha taslimu.
            </p>
            <p>
              <strong>&ldquo;Siku ya Kazi&rdquo;</strong> inamaanisha Jumatatu hadi Ijumaa, bila
              kujumuisha sikukuu za taifa za Jamhuri ya Muungano wa Tanzania.
            </p>
          </>
        ),
      },
      {
        id: 'how-payment-works',
        title: '2. Jinsi malipo yanavyofanyika',
        body: (
          <>
            <p>
              Usanifu wa kadi yako hulipwa kwa <strong>sehemu mbili</strong>, kufuatana na utaratibu
              wa kawaida hapa Tanzania:
            </p>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th className="w-36">Malipo</th>
                    <th>Lini</th>
                    <th>Kiasi gani</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Malipo ya Awali</th>
                    <td>Kabla kazi ya usanifu haijaanza</td>
                    <td>Asilimia 50 ya bei ya Kifurushi</td>
                  </tr>
                  <tr>
                    <th scope="row">Salio</th>
                    <td>Baada ya kuidhinisha usanifu uliokamilika</td>
                    <td>Kiasi kilichobaki</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              Unaweza kulipa sehemu yoyote kwa{' '}
              <strong>simu (mobile money), Visa au Mastercard</strong> (huthibitishwa ndani ya dakika
              chache) au kwa <strong>Lipa Namba</strong> (huthibitishwa na timu yetu ya Fedha, mara
              nyingi ndani ya saa chache na kila mara ndani ya Siku moja ya Kazi).
            </p>
            <p>
              <strong>Kila malipo hufungua nini:</strong>
            </p>
            <ul>
              <li>
                <strong>Malipo ya Awali</strong> huanzisha kazi. Oda yako huingia kwenye foleni yetu
                ya usanifu na msanifu hupangiwa.
              </li>
              <li>
                <strong>Salio</strong> hutoa mafaili yako. Hadi litakapolipwa, unaweza kuona na kutoa
                maoni kuhusu usanifu wako kama picha yenye alama ya maji, lakini mafaili ya mwisho
                hushikiliwa.
              </li>
            </ul>
            <p>
              Ukurasa wa oda yako huonesha kila wakati jumla yako, ulicholipa, na kilichobaki.
            </p>
          </>
        ),
      },
      {
        id: 'part-payments',
        title: '3. Ukilipa zaidi au pungufu ya kiasi kinachotakiwa',
        body: (
          <>
            <p>
              <strong>Ukilipa pungufu</strong>, hakuna kinachopotea. Kiasi ulichotuma huhesabiwa
              kwenye Oda yako na tutakutumia ujumbe kukueleza ni kiasi gani hasa kimebaki. Oda yako
              husubiri hatua hiyo hadi kiasi kitakapokamilika.
            </p>
            <p>
              <strong>Ukilipa zaidi</strong>, kiasi cha ziada huhamishiwa moja kwa moja kwenye Salio
              lako. Huhitaji kuomba.
            </p>
          </>
        ),
      },
      {
        id: 'what-we-need',
        title: '4. Tunachohitaji kutoka kwako',
        body: (
          <>
            <p>Ili tuweze kufanya kazi yetu, unakubali:</p>
            <ul>
              <li>
                kutupatia taarifa sahihi katika Maelezo yako ya Awali, ikiwa ni pamoja na{' '}
                <strong>tahajia sahihi ya majina yote</strong>;
              </li>
              <li>
                kupitia kila Rasimu kwa makini, hasa majina, tarehe, nyakati na maelezo ya ukumbi;
              </li>
              <li>
                kutuma maombi yako ya mabadiliko kama{' '}
                <strong>orodha moja iliyounganishwa</strong> badala ya ujumbe uliotawanyika;
              </li>
              <li>
                kujibu maswali yetu ndani ya muda unaofaa, ili Oda yako iweze kufika kabla ya tarehe
                ya tukio lako;
              </li>
              <li>
                kupakia picha, nembo na vitu vingine ambavyo{' '}
                <strong>unavimiliki au una ruhusa ya kuvitumia</strong>, na kutuambia kama huna
                uhakika.
              </li>
            </ul>
            <p>
              Ukipakia kitu ambacho huna haki ya kukitumia, wajibu ni wako, na unakubali kubeba
              gharama ya madai yoyote yatakayoletwa dhidi yetu kutokana na hilo.
            </p>
            <p>
              Sisi hukagua majina na tarehe kwa makini, lakini ukaguzi wa mwisho ni wako. Ukishaidhinisha
              Rasimu, huo ndio usanifu tutakaotengeneza.
            </p>
          </>
        ),
      },
      {
        id: 'revisions',
        title: '5. Marekebisho na masahihisho',
        body: (
          <>
            <p>
              Kifurushi chako kinajumuisha idadi maalum ya <strong>Marekebisho</strong>: mabadiliko
              unayoomba kwenye usanifu wenyewe, kama rangi, mpangilio au maneno. Idadi yake imeoneshwa
              kwenye ukurasa wa oda yako.
            </p>
            <p>
              <strong>Masahihisho ni bure kila wakati na hayahesabiwi kamwe kama Marekebisho.</strong>{' '}
              Kama tumeandika jina vibaya, tumetumia tarehe isiyo sahihi, au tumekupa faili lisilofanya
              kazi, tuambie na tutalirekebisha bila malipo. Makosa yetu ni jukumu letu kuyarekebisha.
            </p>
            <p>
              Ukimaliza Marekebisho yako yote na ukataka mengine, unaweza kuyaongeza. Gharama
              huongezwa kwenye Salio lako, hivyo bado unafanya malipo ya mwisho mara moja tu.
            </p>
          </>
        ),
      },
      {
        id: 'approval',
        title: '6. Nini kinahesabika kama Idhini',
        body: (
          <>
            <p>
              Kwa kuwa Idhini inaathiri haki zako za Marejesho, tunaifafanua kwa usahihi.{' '}
              <strong>Idhini hutolewa kupitia OpusPass pekee</strong>, kwa mojawapo ya njia tatu:
            </p>
            <ol>
              <li>
                Unabonyeza <strong>Idhinisha</strong> kwenye ukurasa wa oda yako; au
              </li>
              <li>
                Unalipa <strong>Salio lako kikamilifu</strong>, jambo tunalolichukulia kama kukubali
                Rasimu iliyopo; au
              </li>
              <li>
                <strong>Muda wa mapitio wa Kifurushi chako unaisha</strong> bila majibu kutoka kwako,
                baada ya sisi kukutumia angalau vikumbusho viwili. Muda wa mapitio umeoneshwa kwenye
                ukurasa wa oda yako na ni kati ya siku 5 na 7 kutegemea Kifurushi chako.
              </li>
            </ol>
            <p>
              Ujumbe unaotuambia kuwa umefurahishwa, iwe kwa WhatsApp, SMS, barua pepe au simu,{' '}
              <strong>si Idhini</strong> peke yake. Ukituambia kwa njia hiyo, tutakuomba uthibitishe
              kwenye ukurasa wa oda yako. Hii inatulinda sisi wote wawili.
            </p>
            <p>Kila Idhini huhifadhiwa na tarehe na saa kwenye Oda yako.</p>
          </>
        ),
      },
      {
        id: 'postponing',
        title: '7. Kubadilisha tarehe ya tukio lako',
        body: (
          <>
            <p>
              <strong>Kuahirisha ni bure.</strong> Iwapo tukio lako litahamishwa, tuambie na
              tutabadilisha Oda yako na kuendelea kwa ratiba mpya.
            </p>
            <p>
              Unaweza kuahirisha{' '}
              <strong>mara mbili bila malipo, ndani ya miezi 24 tangu tarehe ya oda yako ya awali.</strong>{' '}
              Hii si kughairi na haiathiri chochote ulicholipa.
            </p>
            <p>
              Zaidi ya maahirisho mawili, au zaidi ya miezi 24, tutajitahidi kukusaidia, lakini huenda
              tukalazimika kuichukulia kama Oda mpya. Wasanifu, bei na mitindo inayopatikana hubadilika
              kadri muda unavyopita.
            </p>
          </>
        ),
      },
      {
        id: 'cancelling',
        title: '8. Kughairi Oda yako',
        body: (
          <>
            <p>
              Ukighairi, kiasi utakachorejeshewa hutegemea{' '}
              <strong>ni kazi kiasi gani ya usanifu tayari imeshafanyika</strong> wakati unapotuambia.
            </p>
            <p>
              Asilimia zilizo hapa chini zinahusu <strong>Malipo ya Awali</strong> uliyoyalipa.
            </p>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Oda yako imefika wapi</th>
                    <th className="w-28">Marejesho</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Malipo ya Awali hayajathibitishwa bado</td>
                    <td>Hakuna kilichochukuliwa kwako</td>
                  </tr>
                  <tr>
                    <td>Malipo ya Awali yamethibitishwa, Maelezo ya Awali hayajakamilika</td>
                    <td>
                      <strong>100%</strong>
                    </td>
                  </tr>
                  <tr>
                    <td>Maelezo ya Awali yamekamilika, inasubiri kwenye foleni</td>
                    <td>
                      <strong>90%</strong>
                    </td>
                  </tr>
                  <tr>
                    <td>Msanifu amepangiwa, kazi haijaanza</td>
                    <td>
                      <strong>80%</strong>
                    </td>
                  </tr>
                  <tr>
                    <td>Kazi imeanza, hakuna Rasimu iliyooneshwa kwako bado</td>
                    <td>
                      <strong>60%</strong>
                    </td>
                  </tr>
                  <tr>
                    <td>Rasimu ya kwanza imeoneshwa kwako</td>
                    <td>
                      <strong>30%</strong>
                    </td>
                  </tr>
                  <tr>
                    <td>Umeomba mabadiliko kwenye Rasimu</td>
                    <td>
                      <strong>10%</strong>
                    </td>
                  </tr>
                  <tr>
                    <td>Umeidhinisha Rasimu</td>
                    <td>
                      <strong>0%</strong>
                    </td>
                  </tr>
                  <tr>
                    <td>Mafaili yamekabidhiwa</td>
                    <td>
                      <strong>0%</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              <strong>Tunatumia hatua ambayo Oda yako ilikuwa imefikia siku uliyotuwasiliana</strong>,
              si siku tunayoshughulikia ombi lako. Kama sisi tumechelewa kujibu, hilo ni tatizo letu,
              si lako.
            </p>
            <p>
              <strong>Salio halidaiwi kamwe kwenye Oda iliyoghairiwa.</strong> Ukighairi baada ya
              kuidhinisha usanifu wako, hutapata tu mafaili. Hatutakufuatilia kwa ajili ya kiasi
              kilichobaki.
            </p>
            <p>
              Kila hatua iliyo hapo juu huhifadhiwa kwenye Oda yako na tarehe na saa, hivyo hakuna
              wakati wowote wa kubishana kuhusu hatua ipi inahusika.
            </p>
          </>
        ),
      },
      {
        id: 'full-refunds',
        title: '9. Wakati tunaporejesha kila kitu',
        body: (
          <>
            <p>
              Unapata <strong>Marejesho kamili ya kila ulicholipa</strong>, katika hatua yoyote, na
              sisi tunabeba gharama zote za muamala, iwapo:
            </p>
            <ul>
              <li>hatuwezi kupanga msanifu kwa wakati kabla ya tukio lako;</li>
              <li>tumechelewa kwa zaidi ya mara mbili ya muda tuliouahidi, na ukachagua kughairi;</li>
              <li>usanifu tunaokukabidhi una hitilafu na hauwezi kurekebishwa;</li>
              <li>tumeghairi Oda yako kwa sababu yoyote yetu wenyewe.</li>
            </ul>
            <p>
              Kama tumekuangusha, marejesho ni kiwango cha chini kabisa tutakachofanya.
            </p>
          </>
        ),
      },
      {
        id: 'event-called-off',
        title: '10. Iwapo tukio lako limefutwa',
        body: (
          <>
            <p>
              Tunaelewa kuwa hili hutokea, na kwamba mara chache huwa siku njema.
            </p>
            <p>
              Huhitaji kutueleza chochote wala kutoa ushahidi wowote. Bila kujali Oda yako imefika
              hatua gani, tutakupatia{' '}
              <strong>Hati ya Thamani ya kiasi chote ulicholipa</strong>, yenye uhalali wa miezi 24,
              ambayo unaweza kuitumia mwenyewe au kumpa mtu mwingine.
            </p>
            <p>
              Kama utapendelea kurudishiwa fedha badala yake, kifungu cha 8 kinatumika. Lakini Hati ya
              Thamani inapatikana kwako bila kujali jedwali hilo, na timu yetu inaweza kukupatia mara
              moja. Huhitaji kuomba meneja.
            </p>
          </>
        ),
      },
      {
        id: 'credit-notes',
        title: '11. Hati za Thamani',
        body: (
          <>
            <p>
              Badala ya Marejesho yoyote ya fedha taslimu, tunaweza kutoa Hati ya Thamani yenye
              thamani ya <strong>asilimia 110 ya kiasi cha Marejesho</strong>. Hivyo kama unadaiwa TSh
              50,000, unapata thamani ya TSh 55,000.
            </p>
            <p>Hati za Thamani:</p>
            <ul>
              <li>
                zina uhalali wa <strong>miezi 12</strong> tangu kutolewa (miezi 24 pale kifungu cha 10
                kinapohusika);
              </li>
              <li>
                zinaweza <strong>kuhamishiwa kwa mtu mwingine</strong>, mara moja tu;
              </li>
              <li>
                zinaweza kutumika <strong>kwenye zaidi ya Oda moja</strong>. Usipotumia thamani yote
                kwa mara moja, kilichobaki hubaki kwenye Hati;
              </li>
              <li>
                zinaweza kutumika pamoja na malipo ya fedha pale Oda inapogharimu zaidi ya thamani ya
                Hati;
              </li>
              <li>
                <strong>haziwezi kubadilishwa kuwa fedha taslimu</strong>, na hupitwa na muda
                zisipotumika kabla ya tarehe iliyooneshwa.
              </li>
            </ul>
            <p>Tarehe ya mwisho haiongezwi unapotumia sehemu ya thamani tu.</p>
          </>
        ),
      },
      {
        id: 'no-response',
        title: '12. Tusipopata majibu kutoka kwako',
        body: (
          <>
            <p>
              Baadhi ya Oda husimama kwa sababu tunakusubiri wewe. Tutakufuatilia kwanza kabla ya
              lolote kutokea.
            </p>
            <p>
              <strong>Tukisubiri Maelezo yako ya Awali au mapitio yako:</strong> tutakukumbusha kwa
              WhatsApp, SMS na barua pepe. Kama hatujapata majibu kwa <strong>siku 90</strong>,
              tunaweza kuweka Oda yako kwenye kumbukumbu. Oda zilizowekwa kwenye kumbukumbu zinaweza
              kufunguliwa tena. Wasiliana nasi na tutairejesha.
            </p>
            <p>
              <strong>Tukisubiri Salio lako baada ya Idhini:</strong> mafaili yako hushikiliwa hadi
              ulipe. Tutakukumbusha, na kama tukio lako liko karibu tutakupigia simu. Kama Salio
              halijalipwa <strong>siku 21</strong> baada ya Idhini, Oda yako hufungwa na Malipo yako
              ya Awali hubaki kwetu. Usanifu wako hauharibiwi. Ukilipa baadaye, tutatoa mafaili yako
              kama kawaida.
            </p>
            <p>
              Tungependelea zaidi kumaliza kadi yako kuliko kubaki na Malipo yako ya Awali. Kama kuna
              jambo limekwenda vibaya, tuambie.
            </p>
          </>
        ),
      },
      {
        id: 'requesting-a-refund',
        title: '13. Jinsi ya kuomba Marejesho, na muda unaochukua',
        body: (
          <>
            <p>
              <strong>Kuomba:</strong> tutumie ujumbe kwa{' '}
              <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
              , tupigie simu, au tumia kipengele cha Msaada kwenye ukurasa wa oda yako. Maombi
              yanayotolewa kwa njia yoyote kati ya hizi huhifadhiwa kwenye Oda yako kwa namna moja na
              hubeba tarehe ile ile.
            </p>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Hatua</th>
                    <th className="w-56">Muda</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Tunakueleza uamuzi wetu</td>
                    <td>
                      Ndani ya <strong>Siku 3 za Kazi</strong>
                    </td>
                  </tr>
                  <tr>
                    <td>Fedha kutumwa kwa simu (mobile money)</td>
                    <td>
                      Ndani ya <strong>Siku 7 za Kazi</strong> tangu kuidhinishwa
                    </td>
                  </tr>
                  <tr>
                    <td>Fedha kutumwa kwa benki</td>
                    <td>
                      Ndani ya <strong>Siku 14 za Kazi</strong> tangu kuidhinishwa
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              Marejesho ya malipo yaliyofanywa kwa kadi na kwa simu hurudishwa kwenye akaunti
              uliyotumia kulipa. Marejesho ya malipo ya Lipa Namba hutumwa kwenye namba ya simu
              iliyosajiliwa kwenye Oda yako. Kwa usalama wako, hatutatuma Marejesho kwenye namba
              tofauti bila uthibitisho wa ziada.
            </p>
          </>
        ),
      },
      {
        id: 'ownership',
        title: '14. Nani anamiliki usanifu',
        body: (
          <>
            <p>
              <strong>Kabla Oda yako haijalipwa kikamilifu</strong>, sisi tunamiliki kila kitu. Picha
              za awali hushirikishwa nawe kwa ajili ya mapitio pekee. Huruhusiwi kuchapisha,
              kusambaza, kutuma kwa wengine wala kutumia picha yenye alama ya maji.
            </p>
            <p>
              <strong>Oda yako ikishalipwa kikamilifu</strong>, unapata{' '}
              <strong>leseni ya kudumu, isiyo ya pekee</strong> ya kutumia usanifu uliokamilika kwa
              ajili ya tukio lako mwenyewe. Hii inajumuisha kuuchapisha, kuushirikisha na wageni wako,
              kuutuma kwa WhatsApp, na kuutumia kwenye mitandao ya kijamii.
            </p>
            <p>
              <strong>Sisi tunabaki na umiliki wa mafaili ya asili</strong> na wa kazi ya msingi ya
              usanifu, ikiwa ni pamoja na fonti, mipangilio, michoro na violezo. Huruhusiwi kuuza
              usanifu huo, kumpa mtu mwingine leseni, wala kuutumia kibiashara, na huruhusiwi kuondoa
              au kubadilisha jina letu pale linapoonekana.
            </p>
            <p>
              <strong>Vitu unavyotupatia</strong>, yaani picha, nembo na michoro, vinabaki kuwa vyako.
              Kwa kuvipakia, unathibitisha kuwa una haki ya kuvitumia, na unatupa ruhusa ya kuvitumia
              katika kutengeneza kadi yako.
            </p>
            <p>
              <strong>Kuonesha usanifu wako kwenye kazi zetu:</strong> tunaweza kuonesha usanifu
              uliokamilika kwenye orodha ya kazi zetu, tovuti yetu na matangazo yetu, huku taarifa
              binafsi kama majina ya wageni zikiwa zimeondolewa. Kama utapendelea tusifanye hivyo,
              tuambie wakati wowote na hatutafanya, bila kuathiri chochote kingine katika sera hii.
            </p>
          </>
        ),
      },
      {
        id: 'privacy',
        title: '15. Faragha yako',
        body: (
          <>
            <p>
              Kushughulikia Marejesho kunahusisha kushika taarifa binafsi, ikiwa ni pamoja na jina
              lako, namba ya simu na taarifa za malipo. Tunazishughulikia kwa mujibu wa{' '}
              <strong>
                <a href="/privacy">Sera ya Faragha ya OpusFesta</a> (OF-LGL-POL-003)
              </strong>{' '}
              na sheria husika za ulinzi wa taarifa za Tanzania.
            </p>
            <p>
              Tunahifadhi kumbukumbu za Oda yako, malipo yako na mawasiliano yetu nawe kwa muda
              tunaotakiwa kisheria, na tunazitumia tu kwa ajili ya kuendesha Oda yako, kutimiza wajibu
              wetu wa kisheria, na kutatua migogoro.
            </p>
          </>
        ),
      },
      {
        id: 'chargebacks',
        title: '16. Migogoro ya malipo na chargeback',
        body: (
          <>
            <p>
              Ukifungua mgogoro au <em>chargeback</em> (madai ya kurudishiwa fedha kupitia benki au
              mtoa huduma wa malipo ya simu), basi hadi mtoa huduma atakapoumaliza:
            </p>
            <ul>
              <li>
                kazi ya Oda yako <strong>husimama</strong>, na msanifu yeyote aliyepangwa huondolewa;
              </li>
              <li>
                mafaili na picha zako <strong>hufungiwa</strong> na haziwezi kufikiwa;
              </li>
              <li>
                ombi lolote la Marejesho ulilo nalo kwetu <strong>husimamishwa</strong>;
              </li>
              <li>
                akaunti yako ya OpusPass inaweza <strong>kusimamishwa</strong>.
              </li>
            </ul>
            <p>
              Tutashirikiana kikamilifu na mtoa huduma wako na kutoa kumbukumbu zetu za Oda.
            </p>
            <p>
              <strong>Tafadhali zungumza nasi kwanza.</strong> <em>Chargeback</em> huchukua wiki
              kadhaa. Sisi hujibu maombi ya Marejesho ndani ya Siku tatu za Kazi.
            </p>
          </>
        ),
      },
      {
        id: 'events-outside-our-control',
        title: '17. Matukio yaliyo nje ya uwezo wetu',
        body: (
          <>
            <p>
              Hakuna upande wowote kati yetu utakaowajibika kwa kushindwa kutimiza wajibu chini ya
              sera hii pale kushindwa huko kunaposababishwa na jambo lililo nje ya uwezo wake wa
              kawaida, ikiwa ni pamoja na majanga ya asili, mafuriko, moto, magonjwa ya mlipuko, vita
              au machafuko, hatua za serikali, migomo, na kukatika kwa umeme, intaneti, mawasiliano ya
              simu au mifumo ya malipo ya simu.
            </p>
            <p>
              Hilo likitokea, tutakuambia haraka iwezekanavyo na tutakubaliana nawe ratiba mpya. Kama
              ucheleweshaji huo utafanya Oda yako isiwe na maana, kwa mfano ikapita tarehe ya tukio
              lako, unaweza kughairi na tutakurejeshea <strong>fedha zote</strong>, bila kutumia
              kifungu cha 8.
            </p>
          </>
        ),
      },
      {
        id: 'not-covered',
        title: '18. Yasiyohusika na sera hii',
        body: (
          <>
            <ul>
              <li>
                <strong>Uchapishaji, idadi ya wageni, kumbi na watoa huduma wengine.</strong> Sera hii
                inahusu usanifu wa kadi yako pekee.
              </li>
              <li>
                <strong>Huduma zetu nyingine.</strong> Hizi zina masharti yake:
                <ul>
                  <li>
                    Vifurushi vya kadi za kidijitali vya OpusPass, huduma ya msimamizi wa siku ya
                    tukio na kadi zilizochapishwa premium:{' '}
                    <a href="/cancellation/digital-cards">
                      Sera ya Kufuta na Kurejesha Fedha kwa vifurushi vya kadi za kidijitali
                    </a>
                  </li>
                  <li>Kuweka nafasi kwa watoa huduma kupitia OpusFesta: OF-LGL-POL-001</li>
                  <li>Upigaji picha, video na maudhui ya OpusStudio: OS-LGL-POL-001</li>
                  <li>
                    Matumizi ya jukwaa la OpusPass kwa ujumla: <a href="/terms">OP-LGL-TOS-001</a>
                  </li>
                  <li>
                    Faragha: <a href="/privacy">OF-LGL-POL-003</a>
                  </li>
                </ul>
              </li>
            </ul>
            <p>
              Pale sera hii na waraka mwingine wa OpusFesta zinapotofautiana kuhusu Oda ya usanifu
              maalum wa kadi, sera hii ndiyo inayotumika.
            </p>
          </>
        ),
      },
      {
        id: 'disagreements',
        title: '19. Kama hukubaliani na uamuzi wetu',
        body: (
          <>
            <p>
              Tuombe tuupitie upya. Maamuzi ya Marejesho hupitiwa na Afisa Mkuu wetu wa Mikakati na
              Fedha, na zaidi ya hapo na Afisa Mkuu Mtendaji wetu. Tungependelea zaidi kusikia kutoka
              kwako moja kwa moja kuliko kukuacha ukiwa hujaridhika.
            </p>
            <p>Kama bado hatutakubaliana, kifungu cha 20 kinatumika.</p>
          </>
        ),
      },
      {
        id: 'governing-law',
        title: '20. Sheria inayotumika na utatuzi wa migogoro',
        body: (
          <>
            <p>
              Sera hii inaongozwa na sheria za{' '}
              <strong>Jamhuri ya Muungano wa Tanzania</strong>.
            </p>
            <p>
              Mgogoro ukitokea, sote tunakubali kujaribu kuutatua kwa majadiliano kwanza. Kama hilo
              halitafanikiwa ndani ya siku 30, tunakubali kujaribu usuluhishi jijini Dar es Salaam
              kabla ya kuanzisha mashauri mahakamani. Ikishindikana, mahakama za Jamhuri ya Muungano
              wa Tanzania zina mamlaka.
            </p>
            <p>
              Hakuna kifungu chochote katika sera hii kinachopunguza haki yoyote uliyo nayo chini ya
              sheria za ulinzi wa mlaji za Tanzania.
            </p>
            <p>
              <strong>Lugha:</strong> Sera hii inatolewa kwa Kiswahili na Kiingereza. Pale tafsiri hizi
              mbili zinapotofautiana kwa maana,{' '}
              <strong>toleo la Kiswahili ndilo linalotumika</strong>.
            </p>
          </>
        ),
      },
      {
        id: 'changes',
        title: '21. Mabadiliko ya sera hii',
        body: (
          <p>
            Tunaweza kusasisha sera hii mara kwa mara. Toleo linalohusika na Oda yako ni{' '}
            <strong>toleo lililokuwa likitumika siku uliyoweka oda yako</strong>, na tutahifadhi
            matoleo ya awali yapatikane ukiyahitaji. Tutakujulisha kuhusu mabadiliko makubwa kabla
            hayajaanza kutumika.
          </p>
        ),
      },
      {
        id: 'contact',
        title: '22. Sisi ni nani, na jinsi ya kutufikia',
        body: (
          <>
            <div className="overflow-x-auto">
              <table>
                <tbody>
                  <tr>
                    <th scope="row" className="w-44">Jina lililosajiliwa</th>
                    <td>OpusFesta Company Limited</td>
                  </tr>
                  <tr>
                    <th scope="row">Anwani iliyosajiliwa</th>
                    <td>
                      Samaki Wabichi Annex, Mbezi Beach, S.L.P 7787, Dar es Salaam, Jamhuri ya
                      Muungano wa Tanzania
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Tovuti</th>
                    <td>{WEBSITE}</td>
                  </tr>
                  <tr>
                    <th scope="row">Barua pepe</th>
                    <td>
                      <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">WhatsApp</th>
                    <td>
                      <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer">
                        {PHONE}
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Simu</th>
                    <td>{PHONE}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[13px] text-gray-400">
              OP-CCS-POL-001-SW Toleo 1.0 &middot; OpusFesta Company Limited
            </p>
          </>
        ),
      },
    ],
  },
}

export default async function CancellationPage() {
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
