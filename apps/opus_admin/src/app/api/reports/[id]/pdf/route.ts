import { NextResponse, type NextRequest } from 'next/server'
import { hasPermission } from '@/lib/admin-auth'
import { logDbError } from '@/lib/log-safe'
import { requireWorkspaceCapability } from '@/lib/workspace/guards'
import { recordSensitiveWorkspaceAction } from '@/lib/workspace/activity'
import { getReportDetail, getSubmissionVersion } from '@/lib/reports/queries'
import { renderReportVersionPdf } from '@/lib/reports/pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// PDF of one FILED VERSION.
//
// The document is generated from report_submission_versions: its stored content
// and the field structure snapshotted when it was filed. It is never generated
// from the live draft or the current template, which is what makes "the PDF
// matches the stored submission version" true rather than usually true. A
// template edited after filing cannot change what an already-filed report says.
//
// Authorization runs before anything is rendered: getReportDetail returns null
// unless the caller is the author or a named recipient, so an unauthorized id
// is a 404 rather than a document.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('documents.read', { action: 'reports.pdf' }))
  } catch {
    return NextResponse.json({ error: 'Not available' }, { status: 403 })
  }

  const isAdmin = await hasPermission('workforce.write')
  const detail = await getReportDetail(employee, id, { asAdmin: isAdmin })
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const requested = Number(request.nextUrl.searchParams.get('version'))
  const version = Number.isInteger(requested) && requested > 0
    ? requested
    : detail.submission.currentVersion
  if (!version) return NextResponse.json({ error: 'Nothing filed yet' }, { status: 404 })

  const stored = await getSubmissionVersion(id, version)
  if (!stored) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const pdf = await renderReportVersionPdf({
      templateName: detail.submission.templateName,
      periodLabel: detail.submission.periodLabel,
      authorName: detail.submission.employeeName ?? 'Unknown',
      state: detail.submission.state,
      version: stored,
    })

    // Exporting a report is a disclosure, so it is recorded against the author's
    // own activity feed as well as the audit stream.
    void recordSensitiveWorkspaceAction({
      employeeId: detail.submission.employeeId,
      eventType: 'workspace.report.exported',
      summary: `A PDF of ${detail.submission.templateName} (version ${version}) was generated`,
      actorEmployeeId: employee.id,
      actorClerkId: employee.clerkUserId,
      targetResource: `report_submissions:${id}`,
      metadata: { submissionId: id, version, byOwner: detail.isOwner },
    })

    const safeName = `${detail.submission.templateName}-${detail.submission.periodLabel}-v${version}`
      .replace(/[^a-zA-Z0-9-_ ]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase()

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${safeName}.pdf"`,
        // A filed report is confidential and immutable; caching it in a shared
        // proxy is how one person's report reaches another's browser.
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    logDbError('reports.pdf', error, { submissionId: id })
    return NextResponse.json({ error: 'Could not generate that PDF' }, { status: 500 })
  }
}
