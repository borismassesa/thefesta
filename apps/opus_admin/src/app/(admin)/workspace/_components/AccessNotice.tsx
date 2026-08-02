import Link from 'next/link'
import { AlertTriangle, Lock, UserX } from 'lucide-react'
import { workspaceMessage, type WorkspaceErrorCode } from '@/lib/workspace/errors'

// The one place Workspace explains why it did not open.
//
// Every message comes from lib/workspace/errors.ts, which holds fixed strings.
// Nothing here ever renders an error object: a PostgREST message can carry the
// value that caused it (a unique violation echoes the colliding email address
// straight back), so raw errors stop at the server boundary and only a code
// travels this far.

const ICONS: Record<WorkspaceErrorCode, typeof Lock> = {
  not_signed_in: Lock,
  no_employee_record: UserX,
  ambiguous_identity: AlertTriangle,
  identity_conflict: AlertTriangle,
  access_denied: Lock,
  read_only: Lock,
  documents_only: Lock,
  unavailable: AlertTriangle,
}

const TITLES: Record<WorkspaceErrorCode, string> = {
  not_signed_in: 'Sign in to continue',
  no_employee_record: 'No employee profile linked',
  ambiguous_identity: 'We could not tell which profile is yours',
  identity_conflict: 'This profile belongs to another sign-in',
  access_denied: 'Workspace is not available for your account',
  read_only: 'Your Workspace is read only',
  documents_only: 'Documents only',
  unavailable: 'Workspace could not load',
}

export default function AccessNotice({
  code,
  detail,
}: {
  code: WorkspaceErrorCode
  /** Optional extra line. Must be author-written text, never an error message. */
  detail?: string
}) {
  const Icon = ICONS[code]
  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 p-6">
      <div className="flex items-start gap-4">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-amber-900">{TITLES[code]}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-amber-900/90">
            {workspaceMessage(code)}
          </p>
          {detail && <p className="mt-2 text-sm text-amber-900/80">{detail}</p>}
          {code === 'documents_only' && (
            <Link
              href="/workspace/documents"
              className="mt-4 inline-flex items-center rounded-full bg-amber-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-amber-800"
            >
              Open my documents
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
