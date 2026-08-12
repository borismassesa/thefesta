import { getEvents, getRsvpQuestions } from '@/lib/dashboard/queries'
import RsvpSetupWizard from './RsvpSetupWizard'

export const dynamic = 'force-dynamic'

export default async function RsvpSetupPage() {
  const [events, questions] = await Promise.all([getEvents(), getRsvpQuestions()])
  return <RsvpSetupWizard events={events} questions={questions} />
}
