import { SettingsShell } from '@/components/dashboard/SettingsNav'
import { getCoupleProfile } from '@/lib/dashboard/queries'
import InformationForm from './InformationForm'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const profile = await getCoupleProfile()
  return (
    <SettingsShell>
      <InformationForm profile={profile} />
    </SettingsShell>
  )
}
