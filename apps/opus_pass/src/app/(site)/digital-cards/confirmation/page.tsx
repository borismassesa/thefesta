import { getLocale } from '@/lib/cms/locale'
import { loadUiStrings } from '@/lib/cms/ui-strings'
import { UIStringsProvider } from '@/components/providers/UIStringsProvider'
import ConfirmationClient from './ConfirmationClient'

// Reads the per-visitor locale cookie to resolve bilingual microcopy, so the
// page must render dynamically (never baked into a shared cache entry).
export const dynamic = 'force-dynamic'

export default async function ConfirmationPage() {
  const locale = await getLocale()
  const confirmation = await loadUiStrings('confirmation', locale)
  return (
    <UIStringsProvider bundles={{ confirmation }}>
      <ConfirmationClient />
    </UIStringsProvider>
  )
}
