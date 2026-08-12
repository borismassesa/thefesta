import BentoGrid from '@/components/shadcn-studio/blocks/bento-grid-13/bento-grid-13'
import { GUESTS_FEATURES_FALLBACK } from '@/lib/cms/guests-features'

const BentoGridPage = () => {
  return <BentoGrid content={GUESTS_FEATURES_FALLBACK} />
}

export default BentoGridPage
