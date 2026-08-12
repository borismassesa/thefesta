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
        <button data-opus-button="primary" data-opus-button-size="medium" className="self-end rounded-xl bg-[#7E5896] px-4 py-2.5 font-semibold text-white hover:bg-[#6c4884]">
          Create
        </button>
        <label className="space-y-1 md:col-span-6">
          <span className="font-medium text-gray-600">Description</span>
          <input name="description" className="w-full rounded-md border border-gray-200 px-2 py-2" />
        </label>
      </form>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
        <table className="opus-table w-full">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Currency</th>
              <th>State</th>
              <th data-numeric="true">Order</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {units.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-500">No Growth business units have been created.</td></tr>
            ) : units.map((unit) => (
              <tr key={unit.id} className="align-top">
                <th scope="row" className="opus-table-cell--leading font-mono">{unit.code}</th>
                <td>
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
                    <button data-opus-button="control" disabled={Boolean(unit.archivedAt)} className="w-fit rounded-md border border-gray-200 px-2 py-1 font-medium text-gray-700 disabled:text-gray-300">
                      Save
                    </button>
                  </form>
                </td>
                <td className="font-mono">{unit.defaultCurrencyCode}</td>
                <td className="opus-table-cell--status">{unit.archivedAt ? 'Archived' : unit.isActive ? 'Active' : 'Inactive'}</td>
                <td data-numeric="true">{unit.displayOrder}</td>
                <td>
                  <form action={archiveBusinessUnitAction}>
                    <input type="hidden" name="id" value={unit.id} />
                    <button data-opus-button="control" disabled={Boolean(unit.archivedAt)} className="rounded-md border border-gray-200 px-2 py-1 font-medium text-gray-700 disabled:text-gray-300">
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
