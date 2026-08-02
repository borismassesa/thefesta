import Link from 'next/link'
import { UserRoundX } from 'lucide-react'

/**
 * Shown when Workspace cannot resolve the caller to an employee record, or
 * when their access state closes it.
 *
 * The point is that nobody sees a stack trace or a bare 403. `message` comes
 * from selfIdentityMessage(), which already tailors the wording to whether the
 * caller holds organisation permissions.
 */
export default function WorkspaceUnavailable({
  message,
  showWorkforceLink,
}: {
  message: string
  showWorkforceLink: boolean
}) {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-[#F0DFF6] text-[#7E5896]">
          <UserRoundX className="h-6 w-6 stroke-[1.5]" />
        </span>
        <h1 className="text-lg font-semibold text-gray-900">
          Workspace is unavailable
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">{message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link
            href="/"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          >
            Back to dashboard
          </Link>
          {showWorkforceLink && (
            <Link
              href="/workforce"
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Go to Workforce
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
