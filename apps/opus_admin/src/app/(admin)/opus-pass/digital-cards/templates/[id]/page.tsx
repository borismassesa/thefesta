import { redirect } from 'next/navigation'

/** Moved under the card it belongs to. See templates/page.tsx. */
export default async function TemplateDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/opus-pass/digital-cards/cards/${id}/artwork`)
}
