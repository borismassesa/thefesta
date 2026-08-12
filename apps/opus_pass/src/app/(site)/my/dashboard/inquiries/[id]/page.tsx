import { redirect } from 'next/navigation'

// Inquiries are now a single two-pane inbox. Deep links (e.g. from emails or
// the old detail URL) resolve to the inbox with that conversation preselected.
export default async function InquiryDetailRedirect({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params
  redirect(`/my/dashboard/inquiries?id=${id}`)
}
