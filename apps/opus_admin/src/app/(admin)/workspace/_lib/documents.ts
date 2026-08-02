import 'server-only'
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'
import { logDbError } from '@/lib/log-safe'
import type { WorkspaceEmployee } from '@/lib/workspace/identity'

// The employee's own employment documents.
//
// Same rule as home.ts: the function takes the resolved WorkspaceEmployee, not
// an id, so there is no signature through which a route could pass someone
// else's. This is the one surface a resigned employee keeps, which makes it the
// one most worth being strict about.

export type WorkspaceDocument = {
  id: string
  docType: string
  label: string
  status: string
  required: boolean
  fileName: string | null
  signedAt: string | null
  updatedAt: string
}

export async function getWorkspaceDocuments(
  employee: WorkspaceEmployee,
): Promise<WorkspaceDocument[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('workforce_employee_documents')
      .select('id, doc_type, doc_label, status, required, file_name, signed_at, updated_at')
      .eq('employee_id', employee.id)
      .order('required', { ascending: false })
      .order('doc_label', { ascending: true })
      .returns<
        {
          id: string
          doc_type: string
          doc_label: string
          status: string
          required: boolean
          file_name: string | null
          signed_at: string | null
          updated_at: string
        }[]
      >()
    if (error) {
      logDbError('workspace.documents.select', error, { employeeId: employee.id })
      return []
    }
    return (data ?? []).map((row) => ({
      id: row.id,
      docType: row.doc_type,
      label: row.doc_label,
      status: row.status,
      required: row.required,
      fileName: row.file_name,
      signedAt: row.signed_at,
      updatedAt: row.updated_at,
    }))
  } catch (error) {
    logDbError('workspace.documents.select', error, { employeeId: employee.id })
    return []
  }
}
