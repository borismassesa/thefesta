import { hasAnyPermission } from '@/lib/admin-auth'
import GrowthFoundationsUnavailable from '../../_components/GrowthFoundationsUnavailable'
import SetGrowthHeading from '../../_components/SetGrowthHeading'
import { isGrowthFoundationsUnavailableError } from '../../_lib/foundation-availability'
import { archiveBusinessUnitAction, createBusinessUnitAction, updateBusinessUnitAction } from '../../foundations/actions'
import { listGrowthBusinessUnits } from '../../foundations/queries'

export const dynamic = 'force-dynamic'

export default async function GrowthBusinessUnitsPage() {
  const canManage = await hasAnyPermission(['growth.settings.manage', 'growth.admin'])
  if (!canManage) throw new Error("You don't have permission to manage Growth business units.")
  let units
  try {
    units = await listGrowthBusinessUnits(true)
  } catch (error) {
    if (!isGrowthFoundationsUnavailableError(error)) throw error
    return (
      <GrowthFoundationsUnavailable
        title="Growth Business Units"
        subtitle="Configurable reporting units for Growth KPIs."
      />
    )
  }

  return (
    <div className="space-y-6 pb-16">
      <SetGrowthHeading title="Growth Business Units" subtitle="Configurable reporting units for Growth KPIs." />

      <form action={createBusinessUnitAction} className="grid gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-[12px] shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)] md:grid-cols-6">
        <label className="space-y-1">
          <span className="font-medium text-gray-600">Code</span>
          <input name="code" required className="w-full rounded-md border border-gray-200 px-2 py-2" placeholder="OPUSFESTA" />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="font-medium text-gray-600">Name</span>
          <input name="name" required className="w-full rounded-md border border-gray-200 px-2 py-2" placeholder="OpusFesta" />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-gray-600">Currency</span>
          <input name="defaultCurrencyCode" defaultValue="TZS" required className="w-full rounded-md border border-gray-200 px-2 py-2" />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-gray-600">Order</span>
          <input name="displayOrder" type="number" defaultValue="40" className="w-full rounded-md border border-gray-200 px-2 py-2" />
        </label>
        <button className="self-end rounded-md bg-gray-900 px-3 py-2 font-semibold text-white hover:bg-gray-700">
          Create
        </button>
        <label className="space-y-1 md:col-span-6">
          <span className="font-medium text-gray-600">Description</span>
          <input name="description" className="w-full rounded-md border border-gray-200 px-2 py-2" />
        </label>
      </form>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
        <table className="w-full text-left text-[12px]">
          <thead className="border-b border-gray-100 text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-3 py-3 font-medium">Name</th>
              <th className="px-3 py-3 font-medium">Currency</th>
              <th className="px-3 py-3 font-medium">State</th>
              <th className="px-3 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {units.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No Growth business units have been created.</td></tr>
            ) : units.map((unit) => (
              <tr key={unit.id} className="border-b border-gray-50 align-top">
                <td className="px-4 py-3 font-mono font-semibold text-gray-800">{unit.code}</td>
                <td className="px-3 py-3">
                  <form action={updateBusinessUnitAction} className="grid gap-2">
                    <input type="hidden" name="id" value={unit.id} />
                    <input name="name" defaultValue={unit.name} className="rounded-md border border-gray-200 px-2 py-1.5 font-medium text-gray-800" aria-label={`${unit.code} name`} />
                    <input name="description" defaultValue={unit.description} className="rounded-md border border-gray-200 px-2 py-1.5 text-gray-600" aria-label={`${unit.code} description`} />
                    <input type="hidden" name="defaultCurrencyCode" value={unit.defaultCurrencyCode} />
                    <input type="hidden" name="displayOrder" value={unit.displayOrder} />
                    <label className="flex items-center gap-2 text-gray-500">
                      <input type="checkbox" name="isActive" defaultChecked={unit.isActive && !unit.archivedAt} disabled={Boolean(unit.archivedAt)} />
                      Active
                    </label>
                    <button disabled={Boolean(unit.archivedAt)} className="w-fit rounded-md border border-gray-200 px-2 py-1 font-medium text-gray-700 disabled:text-gray-300">
                      Save
                    </button>
                  </form>
                </td>
                <td className="px-3 py-3 font-mono text-gray-600">{unit.defaultCurrencyCode}</td>
                <td className="px-3 py-3 text-gray-600">{unit.archivedAt ? 'Archived' : unit.isActive ? 'Active' : 'Inactive'}</td>
                <td className="px-3 py-3 text-gray-600">{unit.displayOrder}</td>
                <td className="px-4 py-3">
                  <form action={archiveBusinessUnitAction}>
                    <input type="hidden" name="id" value={unit.id} />
                    <button disabled={Boolean(unit.archivedAt)} className="rounded-md border border-gray-200 px-2 py-1 font-medium text-gray-700 disabled:text-gray-300">
                      Archive
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
