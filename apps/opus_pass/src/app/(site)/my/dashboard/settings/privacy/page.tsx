import { SettingsShell } from '@/components/dashboard/SettingsNav'
import { getPublicShareInfo } from '@/lib/dashboard/queries'
import PrivacyForm from './PrivacyForm'

export const dynamic = 'force-dynamic'

export default async function PrivacySettingsPage() {
  const share = await getPublicShareInfo()
  return (
    <SettingsShell>
      <PrivacyForm initialEnabled={share.enabled} />
    </SettingsShell>
  )
}
