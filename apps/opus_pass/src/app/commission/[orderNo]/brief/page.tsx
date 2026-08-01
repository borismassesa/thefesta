import { notFound } from 'next/navigation'
import { authorizeOrderAccess } from '@/lib/commission/access'
import { getBrief, getBriefQuestions } from '@/lib/commission/brief'
import BriefForm from './BriefForm'

export const dynamic = 'force-dynamic'

/**
 * The structured brief, as the buyer sees it.
 * Specs: OP-CCS-PRD-001 §7.3, §8.
 *
 * Served immediately after payment, reachable with only a claim token. This is
 * the screen that decides whether an order moves or stalls: PRD §9 targets 80%
 * of briefs completed within 24 hours of payment, and every extra required
 * field is a place someone on a patchy connection gives up.
 *
 * So: one question per row, answers saved as they are entered rather than only
 * on submit, and the required set kept deliberately small in the seed data.
 */
export default async function CommissionBriefPage(props: {
  params: Promise<{ orderNo: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const { orderNo } = await props.params
  const { t: token } = await props.searchParams

  const access = await authorizeOrderAccess(decodeURIComponent(orderNo), token ?? null)
  if (!access.ok) {
    if (access.status === 404) notFound()
    return (
      <main className="mx-auto max-w-lg px-5 py-16 text-center">
        <div className="rounded-2xl border border-[#E8DCC8] bg-[#FDF8F5] p-6">
          <h1 className="font-serif text-xl text-[#4A2D5C]">We could not open that brief</h1>
          <p className="mt-2 text-sm text-[#6B5B73]">{access.message}</p>
        </div>
      </main>
    )
  }

  const order = access.order
  const [questions, brief] = await Promise.all([
    getBriefQuestions(order.category_id),
    getBrief(order.id),
  ])
  const sw = order.locale === 'sw'

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <p className="font-mono text-xs uppercase tracking-widest text-[#C9A961]">{order.order_no}</p>
      <h1 className="mt-2 font-serif text-2xl text-[#4A2D5C]">
        {sw ? 'Tuambie kuhusu kadi yako' : 'Tell us about your card'}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[#6B5B73]">
        {sw
          ? 'Majibu haya huenda moja kwa moja kwa mbunifu wako. Kadiri unavyoeleza zaidi, ndivyo rasimu ya kwanza itakavyokuwa karibu na unachotaka.'
          : 'These answers go straight to your designer. The more you tell us, the closer the first draft will be to what you had in mind.'}
      </p>

      {brief.completedAt && (
        <p className="mt-4 rounded-xl border border-[#E8DCC8] bg-[#FDF8F5] px-4 py-3 text-sm text-[#6B5B73]">
          {sw
            ? 'Umeshakamilisha maelezo haya. Bado unaweza kuyabadilisha, na mbunifu wako ataona mabadiliko.'
            : 'You have already completed this. You can still change your answers and your designer will see the update.'}
        </p>
      )}

      <BriefForm
        orderKey={order.order_no}
        token={token ?? null}
        locale={sw ? 'sw' : 'en'}
        questions={questions}
        initialAnswers={brief.answers}
        initialAttachments={brief.attachments.map((a) => ({
          name: a.name,
          size: a.size,
          path: a.path,
        }))}
        alreadyComplete={Boolean(brief.completedAt)}
      />
    </main>
  )
}
