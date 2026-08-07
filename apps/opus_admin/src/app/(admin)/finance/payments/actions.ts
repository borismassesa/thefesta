'use server'

import { revalidatePath } from 'next/cache'
import { sendDesignBrief } from '@/lib/design-brief-email'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getCallerEmail, requirePermission } from '@/lib/admin-auth'
import { insertEntitlementAdjustment } from '@/lib/entitlements'
import { isEmailConfigured, sendEmail } from '@/lib/email'
import { renderEmail, plaintextLines } from '@/lib/email-shell'
import { fetchInvoiceAttachment } from '@/lib/opus-pass-invoice'
import { PAYMENT_CATEGORY_BADGE, toCategory, type DigitalCardPaymentStatus } from './queries'

type PaymentEmailRow = {
  id: string
  ref: string
  user_id: string | null
  status: DigitalCardPaymentStatus
  amount_total: string | number
  contact_name: string | null
  contact_email: string
  payment_reference: string | null
  kind: string
  category: string | null
  /** 'topup' orders inherit an already-released card, so approving one has to
   *  skip design entirely — see approveDigitalCardPayment. */
  order_kind: 'purchase' | 'topup' | null
}

/**
 * Product orders finalize through a shared DB function so stock decrement,
 * registry-claim confirmation and vendor earnings happen exactly once — the
 * same RPC opus_pass calls on a Selcom paid order (idempotent). Then a
 * best-effort call into opus_pass runs the couple notification + guest/couple
 * receipts (which live there, next to the WhatsApp/email providers).
 */
async function finalizeProductOrderSideEffects(orderId: string, ref: string): Promise<void> {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.rpc('finalize_product_order', { p_order_id: orderId })
  if (error) console.error('[product-payments] finalize_product_order RPC failed', error)

  const base = process.env.NEXT_PUBLIC_OPUS_PASS_URL
  const secret = process.env.OPUS_PASS_REVALIDATE_SECRET
  if (!base || !secret) return
  try {
    await fetch(`${base.replace(/\/$/, '')}/api/payments/notify-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ ref }),
    })
  } catch (error) {
    console.error('[product-payments] notify-paid call failed', error)
  }
}

async function releaseProductOrder(orderId: string): Promise<void> {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.rpc('release_product_order', { p_order_id: orderId })
  if (error) console.error('[product-payments] release_product_order RPC failed', error)
}

function clean(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : ''
}

function formatTzs(value: string | number): string {
  return `TZS ${Number(value).toLocaleString('en-US')}`
}

async function getPayment(id: string): Promise<PaymentEmailRow> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('invitation_orders')
    .select('id, ref, user_id, status, amount_total, contact_name, contact_email, payment_reference, kind, category, order_kind')
    .eq('id', id)
    .eq('provider', 'mpesa_lipa_namba')
    .single<PaymentEmailRow>()
  if (error) throw new Error(error.message)
  return data
}

async function createCustomerNotification(args: {
  userId: string | null
  type: 'payment_confirmed' | 'system'
  title: string
  body: string
}) {
  if (!args.userId) return
  try {
    const supabase = createSupabaseAdminClient()
    const { error } = await supabase.from('notifications').insert({
      user_id: args.userId,
      type: args.type,
      title: args.title,
      body: args.body,
      href: '/my/dashboard/orders',
    })
    if (error) console.error('[digital-card-payments] notification insert failed', error)
  } catch (error) {
    console.error('[digital-card-payments] notification insert threw', error)
  }
}

async function emailCustomer(args: {
  payment: PaymentEmailRow
  kind: 'approved' | 'rejected'
  note: string
}) {
  if (!isEmailConfigured()) return
  const approved = args.kind === 'approved'
  const label = PAYMENT_CATEGORY_BADGE[toCategory(args.payment.category)]
  const labelLower = label.toLowerCase()
  // A top-up commissions no design work, and this email carries the invoice
  // PDF — telling the couple their order is "moving into design" here would
  // promise a delivery that approveDigitalCardPayment deliberately never
  // schedules (it marks top-ups 'ready' on the spot).
  const isTopup = args.payment.order_kind === 'topup'
  const subject = approved
    ? `Payment approved - ${args.payment.ref}`
    : `Payment update - ${args.payment.ref}`
  const html = renderEmail({
    preheader: approved
      ? `Your ${labelLower} payment ${args.payment.ref} has been approved.`
      : `We need help reconciling ${labelLower} payment ${args.payment.ref}.`,
    eyebrow: isTopup ? `${label} Top-up` : `${label} Payment`,
    heading: approved ? 'Your payment is approved' : 'Payment needs review',
    referenceCode: args.payment.ref,
    sections: [
      {
        kind: 'paragraph',
        text: approved
          ? isTopup
            ? 'Finance has confirmed your Lipa Namba payment. Your extra digital cards have been added to your event and are ready to send now. They use the design you already approved, so there is nothing new to deliver.'
            : `Finance has confirmed your Lipa Namba payment. Your ${labelLower} order is now confirmed and moving into design.`
          : `Finance could not approve the payment details submitted for this ${labelLower} order. Please reply with the correct payment SMS/reference or contact OpusFesta support.`,
      },
      {
        kind: 'detailRows',
        label: 'Invoice',
        rows: [
          { label: 'Order', value: args.payment.ref },
          { label: 'Amount', value: formatTzs(args.payment.amount_total) },
          ...(args.payment.payment_reference
            ? [{ label: 'Reference', value: args.payment.payment_reference }]
            : []),
        ],
      },
      // The review note is an INTERNAL finance record — never surface it to the
      // customer. It stays on the order (review_note) and shows in the admin only.
    ],
    footerNote: `You received this because you placed a ${labelLower} order with OpusFesta. This is an automated message about your purchase.`,
  })
  // The paid/confirmed invoice PDF accompanies the approval email.
  const invoice = approved ? await fetchInvoiceAttachment(args.payment.ref) : null
  await sendEmail({
    to: args.payment.contact_email,
    subject,
    html,
    text: plaintextLines([
      subject,
      `Order: ${args.payment.ref}`,
      `Amount: ${formatTzs(args.payment.amount_total)}`,
      args.payment.payment_reference ? `Reference: ${args.payment.payment_reference}` : null,
    ]),
    attachments: invoice ? [invoice] : undefined,
  })
}

export async function approveDigitalCardPayment(formData: FormData): Promise<void> {
  await requirePermission('finance.write')

  const id = clean(formData.get('id'))
  const note = clean(formData.get('note'))
  if (!id) throw new Error('Missing payment id.')

  const payment = await getPayment(id)
  if (payment.status === 'paid') {
    revalidatePath('/finance/payments')
    return
  }
  if (payment.status !== 'processing' && payment.status !== 'pending') {
    throw new Error(`Cannot approve a payment with status "${payment.status}".`)
  }

  const reviewedBy = (await getCallerEmail()) ?? 'admin'
  const now = new Date().toISOString()
  const isTopup = payment.order_kind === 'topup'
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('invitation_orders')
    .update({
      status: 'paid',
      paid_at: now,
      reviewed_at: now,
      reviewed_by: reviewedBy,
      review_note: note || null,
      // A top-up has no card to design: it inherits a release that a human
      // already approved, pinned on the order at purchase. Approval IS its
      // fulfillment, so it goes straight to 'ready' and the couple's pool grows
      // the moment finance confirms the money. Leaving it 'not_started' would
      // park paid capacity behind design work that will never happen.
      ...(isTopup ? { fulfillment_status: 'ready', fulfillment_updated_at: now } : {}),
    })
    .eq('id', id)
    .eq('provider', 'mpesa_lipa_namba')
  if (error) throw new Error(error.message)

  if (isTopup) {
    // Deliberately no sendDesignBrief: briefing designers on a top-up would put
    // a job in front of them that does not exist.
    await Promise.all([
      emailCustomer({ payment, kind: 'approved', note }).catch((error) => {
        console.error('[digital-card-payments] top-up approval email failed', error)
      }),
      createCustomerNotification({
        userId: payment.user_id,
        type: 'payment_confirmed',
        title: 'Top-up approved',
        body: `${formatTzs(payment.amount_total)} confirmed. Your extra invitations are ready to send.`,
      }),
    ])
  } else if (payment.kind === 'product') {
    // Product order — the couple notification + guest/couple receipts run in
    // opus_pass via finalize; the invitation-flavoured customer email/notice
    // below doesn't apply (the buyer is an unauthenticated guest).
    await finalizeProductOrderSideEffects(payment.id, payment.ref)
  } else {
    await Promise.all([
      emailCustomer({ payment, kind: 'approved', note }).catch((error) => {
        console.error('[digital-card-payments] approval email failed', error)
      }),
      // Approval is when the couple's 48h design promise starts, so the design
      // team is told now rather than discovering the job in the queue. Failing
      // to send must never undo a confirmed payment.
      sendDesignBrief(payment.id, now).catch((error) => {
        console.error('[digital-card-payments] design brief email failed', error)
      }),
      createCustomerNotification({
        userId: payment.user_id,
        type: 'payment_confirmed',
        title: `${PAYMENT_CATEGORY_BADGE[toCategory(payment.category)]} payment approved`,
        body: `${formatTzs(payment.amount_total)} confirmed${payment.payment_reference ? ` · ref ${payment.payment_reference}` : ''}`,
      }),
    ])
  }
  revalidatePath('/finance/payments')
}

export async function rejectDigitalCardPayment(formData: FormData): Promise<void> {
  await requirePermission('finance.write')

  const id = clean(formData.get('id'))
  const note = clean(formData.get('note'))
  if (!id) throw new Error('Missing payment id.')
  if (!note) throw new Error('Add a short note before rejecting.')

  const payment = await getPayment(id)
  if (payment.status === 'paid') throw new Error('Paid payments cannot be rejected.')
  if (payment.status === 'failed') {
    revalidatePath('/finance/payments')
    return
  }

  const reviewedBy = (await getCallerEmail()) ?? 'admin'
  const now = new Date().toISOString()
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('invitation_orders')
    .update({
      status: 'failed',
      reviewed_at: now,
      reviewed_by: reviewedBy,
      review_note: note,
    })
    .eq('id', id)
    .eq('provider', 'mpesa_lipa_namba')
  if (error) throw new Error(error.message)

  // Free the registry units a rejected product purchase was holding.
  if (payment.kind === 'product') await releaseProductOrder(payment.id)

  await Promise.all([
    emailCustomer({ payment, kind: 'rejected', note }).catch((error) => {
      console.error('[digital-card-payments] rejection email failed', error)
    }),
    createCustomerNotification({
      userId: payment.user_id,
      type: 'system',
      title: `${PAYMENT_CATEGORY_BADGE[toCategory(payment.category)]} payment needs attention`,
      body: note,
    }),
  ])
  revalidatePath('/finance/payments')
}

/**
 * Grant or revoke send credits (invite or entrance-pass pool) for a couple's
 * event, on top of what they purchased. Validation and the insert itself live
 * in insertEntitlementAdjustment (@/lib/entitlements), shared with the Couple
 * Accounts console — this wrapper only owns the permission gate, the FormData
 * unpacking and the revalidation path.
 *
 * `direction` is a bound argument rather than a form field because React
 * overwrites the `name` of a submit button that carries `formAction` (it needs
 * that attribute to encode which action to invoke), so a `name="direction"`
 * button would send nothing and every adjustment would fail validation.
 */
export async function adjustEntitlementCredits(
  direction: 'grant' | 'revoke',
  formData: FormData,
): Promise<void> {
  await requirePermission('finance.write')

  await insertEntitlementAdjustment({
    userId: clean(formData.get('userId')),
    eventId: clean(formData.get('eventId')),
    kind: clean(formData.get('kind')),
    direction,
    quantity: Number(clean(formData.get('quantity'))),
    reason: clean(formData.get('reason')),
    adminEmail: (await getCallerEmail()) ?? 'admin',
  })

  revalidatePath('/finance/payments')
}
