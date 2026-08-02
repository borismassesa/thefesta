import { redirect } from 'next/navigation'

// The time clock moved to /workspace/timeclock when the attendance module
// replaced the flat punch log (Goal 2). This redirect exists because the old
// path is in people's history, in the sidebar of a cached page, and in the
// deep links of notifications sent before the move.
export default function LegacyTimeclockPage() {
  redirect('/workspace/timeclock')
}
