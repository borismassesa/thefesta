import { redirect } from 'next/navigation'

// Leave used to have a second administration surface backed by the legacy
// workforce_leave_requests table. Workspace Leave is now the canonical,
// ledger-backed employee and approver workflow. Keep the old URL as a stable
// deep link, but never render or mutate the legacy workflow from it.
export default function LegacyWorkforceLeavePage() {
  redirect('/workspace/leave')
}
