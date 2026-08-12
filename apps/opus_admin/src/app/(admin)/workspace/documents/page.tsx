import { after } from 'next/server'
import { FileCheck2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { workspaceErrorCode } from '@/lib/workspace/errors'
import { requireWorkspaceCapability } from '@/lib/workspace/guards'
import { recordSensitiveWorkspaceAction } from '@/lib/workspace/activity'
import AccessNotice from '../_components/AccessNotice'
import WorkspaceHeading from '../_components/WorkspaceHeading'
import { getWorkspaceDocuments } from '../_lib/documents'

export const dynamic = 'force-dynamic'

// My Documents. The surface a resigned employee keeps, and the reason
// 'documents_only' is a real access state rather than a synonym for denied.
//
// Metadata only for now: status, whether it is signed, the file name on record.
// Serving the file itself needs a signed storage URL with its own expiry and
// its own audit line, which is deliberately not smuggled in here.

const STATUS_STYLES: Record<string, string> = {
  approved: 'border border-[#C9A0DC] bg-[#F0DFF6] text-[#5d3a78]',
  signed: 'border border-[#C9A0DC] bg-[#F0DFF6] text-[#5d3a78]',
  sent: 'bg-blue-50 text-blue-700',
  pending: 'bg-gray-100 text-gray-600',
  rejected: 'bg-rose-100 text-rose-700',
}

export default async function WorkspaceDocumentsPage() {
  let context
  try {
    context = await requireWorkspaceCapability('documents.read', {
      action: 'workspace.documents',
    })
  } catch (error) {
    return (
      <>
        <WorkspaceHeading title="My documents" />
        <AccessNotice code={workspaceErrorCode(error)} />
      </>
    )
  }

  const documents = await getWorkspaceDocuments(context.employee)

  // Opening an employment file is a sensitive action, so it is recorded in both
  // streams. Deferred via after() so the write stays off the render path.
  const { employee } = context
  after(() =>
    recordSensitiveWorkspaceAction({
      employeeId: employee.id,
      eventType: 'workspace.documents.viewed',
      summary: 'Viewed your employment documents',
      actorEmployeeId: employee.id,
      actorClerkId: employee.clerkUserId,
      targetResource: `workforce_employees:${employee.id}`,
      metadata: { documentCount: documents.length, accessState: context.access },
      auditMessage: `Employee ${employee.employeeCode} viewed their own documents`,
    }),
  )

  return (
    <>
      <WorkspaceHeading
        title="My documents"
        subtitle="Employment documents held on your record."
      />
      {documents.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center">
          <FileCheck2 className="mx-auto h-8 w-8 text-gray-300" strokeWidth={1.5} />
          <p className="mt-3 text-sm text-gray-500">
            No documents are on your record yet. People Ops adds them as they are issued.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{doc.label}</p>
                <p className="mt-0.5 text-[13px] text-gray-500">
                  {doc.fileName ?? 'No file uploaded'}
                  {doc.signedAt && ` · signed ${doc.signedAt.slice(0, 10)}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {doc.required && (
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600">
                    Required
                  </span>
                )}
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize',
                    STATUS_STYLES[doc.status] ?? 'bg-gray-100 text-gray-600',
                  )}
                >
                  {doc.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
