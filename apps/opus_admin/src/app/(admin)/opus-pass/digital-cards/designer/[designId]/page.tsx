import { notFound, redirect } from 'next/navigation'
import { hasPermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { requestableFields, type CardFieldBinding } from '@/lib/cms/card-field-roles'
import { resolveOpusPassAssetUrl } from '@/lib/cms/opus-pass-asset-url'
import DesignJobEditor from './DesignJobEditor'

export const dynamic = 'force-dynamic'

type DesignRow = {
  id: string
  order_id: string
  line_index: number
  product_id: string
  product_name: string
  digital_qty: number
  print_qty: number
  status: string
  field_values: Record<string, string> | null
  requested_fields: string[] | null
  notes: string
  info_requested_at: string | null
  info_received_at: string | null
  share_token: string | null
}

export default async function DesignJobPage({
  params,
}: {
  params: Promise<{ designId: string }>
}) {
  if (!(await hasPermission('cms.read'))) redirect('/')
  const { designId } = await params

  const supabase = createSupabaseAdminClient()
  const { data: design, error } = await supabase
    .from('invitation_card_designs')
    .select(
      'id, order_id, line_index, product_id, product_name, digital_qty, print_qty, status, field_values, requested_fields, notes, info_requested_at, info_received_at, share_token',
    )
    .eq('id', designId)
    .maybeSingle<DesignRow>()
  if (error) throw error
  if (!design) notFound()

  const [{ data: order }, { data: product }, canWrite] = await Promise.all([
    supabase
      .from('invitation_orders')
      .select('ref, contact_name, contact_email, contact_phone, event_date')
      .eq('id', design.order_id)
      .maybeSingle<{
        ref: string
        contact_name: string | null
        contact_email: string | null
        contact_phone: string | null
        event_date: string | null
      }>(),
    supabase
      .from('website_invitations_products')
      .select('field_bindings, image_url')
      .eq('id', design.product_id)
      .maybeSingle<{ field_bindings: CardFieldBinding[] | null; image_url: string | null }>(),
    hasPermission('cms.write'),
  ])

  const bindings = product?.field_bindings ?? []

  return (
    <DesignJobEditor
      designId={design.id}
      productName={design.product_name || design.product_id}
      cardImage={product?.image_url ? resolveOpusPassAssetUrl(product.image_url) : null}
      orderRef={order?.ref ?? ''}
      coupleName={order?.contact_name ?? null}
      coupleEmail={order?.contact_email ?? null}
      couplePhone={order?.contact_phone ?? null}
      eventDate={order?.event_date ?? null}
      digitalQty={design.digital_qty}
      printQty={design.print_qty}
      status={design.status}
      // Serialised for the client: the role objects carry only plain data.
      fields={requestableFields(bindings).map((f) => ({
        key: f.role.key,
        label: f.role.label,
        group: f.role.group,
        kind: f.role.kind ?? 'text',
        hint: f.role.hint ?? null,
        example: f.role.example ?? null,
        layerIds: f.layerIds,
        blockedReason: f.blockedReason ?? null,
      }))}
      values={design.field_values ?? {}}
      requested={design.requested_fields ?? []}
      infoRequestedAt={design.info_requested_at}
      infoReceivedAt={design.info_received_at}
      shareToken={design.share_token}
      opusPassUrl={process.env.NEXT_PUBLIC_OPUS_PASS_URL ?? 'https://opuspass.opusfesta.com'}
      bindings={bindings}
      cardIsMapped={bindings.length > 0}
      canWrite={canWrite}
    />
  )
}
