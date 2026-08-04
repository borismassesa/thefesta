import { DEMO_CASES } from './data'
import { InboxClient } from './InboxClient'

export default function InboxPage() {
  return (
    <div className="h-full -m-0">
      <InboxClient initial={DEMO_CASES} />
    </div>
  )
}
