'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getCallerEmail, requirePermission } from '@/lib/admin-auth'
import { isEmailConfigured, sendEmail } from '@/lib/email'
import { renderEmail, plaintextLines } from '@/lib/email-shell'
import { fetchInvoiceAttachment } from '@/lib/opus-pass-invoice'
import type { FulfillmentStatus } from './queries'

const FULFILLMENT_STATUSES: FulfillmentStatus[] = ['not_started', 'in_progress', 'ready', 'delivered']

function formatTzs(value: string | number): string {
  return `TZS ${Number(value).toLocaleString('en-US')}`
}

type OrderEmailRow = {
  id: string
  ref: string
  user_id: string | null
  fulfillment_status: FulfillmentStatus
  amount_total: string | number
  contact_name: string | null
  contact_email: string
}

/**
 * Paid orders only. The list now also shows orders awaiting a Lipa Namba
 * approval, and those must not be advanced through fulfilment — the UI hides
 * the controls, and maybeSingle() turns the race (or a hand-crafted POST) into
 * a message a human can act on rather than a raw PostgREST "no rows" error.
 */
async function getOrder(id: string): Promise<OrderEmailRow> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('invitation_orders')
    .select('id, ref, user_id, fulfillment_status, amount_total, contact_name, contact_email')
    .eq('id', id)
    .eq('status', 'paid')
    .maybeSingle<OrderEmailRow>()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('This order is not paid yet. Approve the payment first.')
  return data
}

async function createCustomerNotification(args: { userId: string | null; title: string; body: string }) {
  if (!args.userId) return
  try {
    const supabase = createSupabaseAdminClient()
    const { error } = await supabase.from('notifications').insert({
      user_id: args.userId,
      type: 'system',
      title: args.title,
      body: args.body,
      href: '/my/dashboard/orders',
    })
    if (error) console.error('[fulfillment] notification insert failed', error)
  } catch (error) {
    console.error('[fulfillment] notification insert threw', error)
  }
}

async function sendDesignReadyEmail(order: OrderEmailRow, kind: 'ready' | 'delivered') {
  if (!isEmailConfigured()) return
  const subject = kind === 'ready' ? `Your design is ready — ${order.ref}` : `Your order is delivered — ${order.ref}`
  const html = renderEmail({
    preheader:
      kind === 'ready'
        ? `Your OpusFesta design for order ${order.ref} is ready.`
        : `Your OpusFesta order ${order.ref} has been delivered.`,
    eyebrow: 'OpusPass',
    heading: kind === 'ready' ? 'Your design is ready' : 'Your order is delivered',
    referenceCode: order.ref,
    sections: [
      {
        kind: 'paragraph',
        text:
          kind === 'ready'
            ? 'Great news — our team has finished personalising your design. It is ready to use.'
            : 'Your order is complete and delivered. Thank you for choosing OpusFesta.',
      },
      {
        kind: 'detailRows',
        label: 'Order',
        rows: [
          { label: 'Order', value: order.ref },
          { label: 'Amount', value: formatTzs(order.amount_total) },
        ],
      },
    ],
    footerNote: 'You received this because you placed an order with OpusFesta. This is an automated message about your purchase.',
  })

  const invoice = await fetchInvoiceAttachment(order.ref)
  await sendEmail({
    to: order.contact_email,
    subject,
    html,
    text: plaintextLines([subject, `Order: ${order.ref}`, `Amount: ${formatTzs(order.amount_total)}`]),
    attachments: invoice ? [invoice] : undefined,
  })
}

/**
 * `next` is a bound argument rather than a form field: React overwrites the
 * `name` of a submit button that carries `formAction` (it needs the attribute
 * to encode which action to invoke), so a `name="status"` button would send
 * nothing and every status change would fail validation.
 */
export async function updateFulfillmentStatus(
  next: FulfillmentStatus,
  formData: FormData,
): Promise<void> {
  await requirePermission('finance.write')

  const id = String(formData.get('id') ?? '').trim()
  if (!id) throw new Error('Missing order id.')
  if (!FULFILLMENT_STATUSES.includes(next)) throw new Error('Invalid fulfilment status.')

  const order = await getOrder(id)
  if (order.fulfillment_status === next) {
    revalidatePath('/finance/orders')
    return
  }

  const updatedBy = (await getCallerEmail()) ?? 'admin'
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('invitation_orders')
    .update({
      fulfillment_status: next,
      fulfillment_updated_at: new Date().toISOString(),
      fulfillment_updated_by: updatedBy,
    })
    .eq('id', id)
    .eq('status', 'paid')
  if (error) throw new Error(error.message)

  if (next === 'ready' || next === 'delivered') {
    await Promise.all([
      sendDesignReadyEmail(order, next).catch((error) => {
        console.error('[fulfillment] design-ready email failed', error)
      }),
      createCustomerNotification({
        userId: order.user_id,
        title: next === 'ready' ? 'Your design is ready' : 'Your order is delivered',
        body: `Order ${order.ref} — ${formatTzs(order.amount_total)}`,
      }),
    ])
  }

  revalidatePath('/finance/orders')
}
