import { getEvents, getEventOrderLinks } from '@/lib/dashboard/queries'
import { getLocale } from '@/lib/cms/locale'
import { loadUiStrings } from '@/lib/cms/ui-strings'
import EventsManager from './EventsManager'

export const dynamic = 'force-dynamic'

export default async function EventsPage() {
  const [events, orderLinks, locale] = await Promise.all([
    getEvents(),
    getEventOrderLinks(),
    getLocale(),
  ])
  const strings = await loadUiStrings('dashboard-events', locale)
  return <EventsManager initialEvents={events} orderLinks={orderLinks} strings={strings} />
}
