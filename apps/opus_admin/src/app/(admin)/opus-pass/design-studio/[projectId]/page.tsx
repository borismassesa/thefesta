import { redirect } from 'next/navigation'

import { hasPermission } from '@/lib/admin-auth'
import { loadDesignStudio } from '@/lib/design-studio/actions'

import { DesignStudioEditor } from './DesignStudioEditor'

export const dynamic = 'force-dynamic'

export default async function DesignStudioProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const canRead = await hasPermission('digitalcards.read')
  if (!canRead) {
    const cms = await hasPermission('cms.read')
    if (!cms) redirect('/')
  }

  const load = await loadDesignStudio(projectId)
  if (!load) {
    redirect('/opus-pass/design-studio')
  }

  const canWrite = await hasPermission('digitalcards.write')
  const canPublish = await hasPermission('digitalcards.publish')

  return (
    <DesignStudioEditor
      initial={load}
      canWrite={canWrite}
      canPublish={canPublish}
    />
  )
}
