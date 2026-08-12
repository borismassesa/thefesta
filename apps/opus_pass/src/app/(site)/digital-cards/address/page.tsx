import { getLocale } from '@/lib/cms/locale'
import { loadUiStrings } from '@/lib/cms/ui-strings'
import { UIStringsProvider } from '@/components/providers/UIStringsProvider'
import AddressClient from './AddressClient'

// Reads the per-visitor locale cookie to resolve bilingual microcopy, so the
// page must render dynamically (never baked into a shared cache entry).
export const dynamic = 'force-dynamic'

export default async function AddressPage() {
  const locale = await getLocale()
  const address = await loadUiStrings('address', locale)
  return (
    <UIStringsProvider bundles={{ address }}>
      <AddressClient />
    </UIStringsProvider>
  )
}
