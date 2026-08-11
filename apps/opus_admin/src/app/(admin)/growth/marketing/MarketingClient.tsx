'use client'

import { useMemo, useState, useTransition } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import SetGrowthHeading from '../_components/SetGrowthHeading'
import KpiMonthlyGrid from '../_components/KpiMonthlyGrid'
import StatsStrip from '../_components/StatsStrip'
import Tabs from '../_components/Tabs'
import type { KpiActual, KpiTarget } from '../_lib/queries'
import { addCampaign, deleteCampaign, updateCampaign, type CampaignInput } from './actions'

export type Campaign = {
  id: string
  startDate: string
  endDate: string | null
  campaignName: string
  channel: string
  ownerName: string
  spendTzs: number
  reach: number
  leads: number
  bookings: number
  revenueTzs: number
  notes: string
  roiPct: number | null
}

const CHANNELS = [
  'Meta Ads (FB+IG)',
  'TikTok Ads',
  'Google Ads',
  'Influencer',
  'Email',
  'WhatsApp Broadcast',
  'Event',
  'Partnership',
  'Organic Social',
  'Other',
]

function formatTzs(value: number): string {
  return `TZS ${Math.round(value).toLocaleString('en-US')}`
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function emptyForm(): CampaignInput {
  return {
    startDate: new Date().toISOString().slice(0, 10),
    endDate: null,
    campaignName: '',
    channel: CHANNELS[0],
    ownerName: '',
    spendTzs: 0,
    reach: 0,
    leads: 0,
    bookings: 0,
    revenueTzs: 0,
    notes: '',
  }
}

const TAB_HEADINGS: Record<string, { title: string; subtitle: string }> = {
  campaigns: {
    title: 'Sales & Marketing',
    subtitle: 'Targets set at a high-pressure level — marketing owns vendor acquisition.',
  },
  kpis: {
    title: 'Monthly Targets',
    subtitle: 'Track inbound leads, bookings, and cost per lead against this month’s targets.',
  },
}

export default function MarketingClient({
  targets,
  actuals,
  initialYear,
  canWrite,
  canAdmin,
  campaigns,
  employeeNames,
}: {
  targets: KpiTarget[]
  actuals: KpiActual[]
  initialYear: number
  canWrite: boolean
  canAdmin: boolean
  campaigns: Campaign[]
  employeeNames: string[]
}) {
  const [showDrawer, setShowDrawer] = useState(false)
  const [editing, setEditing] = useState<Campaign | null>(null)
  const [activeTab, setActiveTab] = useState<'campaigns' | 'kpis'>('campaigns')
  const heading = TAB_HEADINGS[activeTab]

  const totals = useMemo(() => {
    const spend = campaigns.reduce((s, c) => s + c.spendTzs, 0)
    const revenue = campaigns.reduce((s, c) => s + c.revenueTzs, 0)
    const leads = campaigns.reduce((s, c) => s + c.leads, 0)
    const bookings = campaigns.reduce((s, c) => s + c.bookings, 0)
    const roiPct = spend > 0 ? (revenue - spend) / spend : null
    return { spend, revenue, leads, bookings, roiPct }
  }, [campaigns])

  function openNew() {
    setEditing(null)
    setShowDrawer(true)
  }

  function openEdit(campaign: Campaign) {
    setEditing(campaign)
    setShowDrawer(true)
  }

  return (
    <div className="space-y-6 pb-16">
      <SetGrowthHeading
        title={heading.title}
        subtitle={heading.subtitle}
        back={{ href: '/growth', label: 'Growth Tracker' }}
      />

      <StatsStrip
        items={[
          { label: 'Total spend', value: formatTzs(totals.spend) },
          { label: 'Revenue attributed', value: formatTzs(totals.revenue) },
          { label: 'Leads generated', value: totals.leads.toLocaleString('en-US') },
          {
            label: 'Blended ROI',
            value: totals.roiPct === null ? '—' : `${(totals.roiPct * 100).toFixed(0)}%`,
            tone: totals.roiPct === null ? 'default' : totals.roiPct >= 0 ? 'positive' : 'negative',
          },
        ]}
      />

      <Tabs
        defaultKey="campaigns"
        onChange={(key) => setActiveTab(key as 'campaigns' | 'kpis')}
        tabs={[
          {
            key: 'campaigns',
            label: `Campaign log (${campaigns.length})`,
            content: (
              <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                  <p className="text-[12px] text-gray-500">
                    {totals.bookings.toLocaleString('en-US')} bookings attributed across all campaigns
                  </p>
                  {canWrite && (
                    <button data-opus-button="control"
                      type="button"
                      onClick={openNew}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#7E5896] px-3 py-2 text-sm font-semibold text-white hover:bg-[#6c4884]"
                    >
                      <Plus className="h-4 w-4" />
                      Add campaign
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="opus-table w-full min-w-[1100px] text-[13px]">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-gray-500">
                        <th className="px-4 py-2 text-[12px] font-medium">Campaign</th>
                        <th className="px-3 py-2 text-[12px] font-medium">Channel</th>
                        <th className="px-3 py-2 text-[12px] font-medium">Owner</th>
                        <th className="px-3 py-2 text-[12px] font-medium">Dates</th>
                        <th className="px-3 py-2 text-right text-[12px] font-medium">Spend</th>
                        <th className="px-3 py-2 text-right text-[12px] font-medium">Reach</th>
                        <th className="px-3 py-2 text-right text-[12px] font-medium">Leads</th>
                        <th className="px-3 py-2 text-right text-[12px] font-medium">Bookings</th>
                        <th className="px-3 py-2 text-right text-[12px] font-medium">Revenue</th>
                        <th className="px-3 py-2 text-right text-[12px] font-medium">ROI</th>
                        {canWrite && <th className="px-3 py-2 text-right text-[12px] font-medium">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.length === 0 && (
                        <tr>
                          <td colSpan={canWrite ? 11 : 10} className="px-4 py-10 text-center text-gray-400">
                            No campaigns logged yet.
                          </td>
                        </tr>
                      )}
                      {campaigns.map((c) => (
                        <CampaignRow key={c.id} campaign={c} canWrite={canWrite} onEdit={() => openEdit(c)} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ),
          },
          {
            key: 'kpis',
            label: 'Monthly targets',
            content: (
              <KpiMonthlyGrid targets={targets} actuals={actuals} initialYear={initialYear} canEdit={canWrite} canEditTargets={canAdmin} />
            ),
          },
        ]}
      />

      {showDrawer && (
        <CampaignDrawer
          campaign={editing}
          employeeNames={employeeNames}
          onClose={() => setShowDrawer(false)}
        />
      )}
    </div>
  )
}

function CampaignRow({
  campaign,
  canWrite,
  onEdit,
}: {
  campaign: Campaign
  canWrite: boolean
  onEdit: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function remove() {
    if (!window.confirm(`Delete "${campaign.campaignName}"? This cannot be undone.`)) return
    setError(null)
    startTransition(async () => {
      const res = await deleteCampaign(campaign.id)
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <tr className={cn('border-b border-gray-50', isPending && 'opacity-60')}>
      <td className="px-4 py-2.5">
        <div className="font-medium text-gray-900">{campaign.campaignName}</div>
        {campaign.notes && <div className="mt-0.5 truncate text-[11px] text-gray-500">{campaign.notes}</div>}
        {error && <div className="mt-0.5 text-[11px] font-semibold text-rose-700">{error}</div>}
      </td>
      <td className="px-3 py-2.5 text-gray-700">{campaign.channel}</td>
      <td className="px-3 py-2.5 text-gray-700">{campaign.ownerName || <span className="text-gray-400">—</span>}</td>
      <td className="px-3 py-2.5 text-gray-500">
        {formatDate(campaign.startDate)}
        {campaign.endDate ? ` – ${formatDate(campaign.endDate)}` : ''}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-gray-800">{formatTzs(campaign.spendTzs)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{campaign.reach.toLocaleString('en-US')}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{campaign.leads.toLocaleString('en-US')}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{campaign.bookings.toLocaleString('en-US')}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-gray-800">{formatTzs(campaign.revenueTzs)}</td>
      <td
        className={cn(
          'px-3 py-2.5 text-right tabular-nums font-semibold',
          campaign.roiPct === null
            ? 'text-gray-400'
            : campaign.roiPct >= 0
              ? 'text-emerald-700'
              : 'text-rose-700',
        )}
      >
        {campaign.roiPct === null ? '—' : `${(campaign.roiPct * 100).toFixed(0)}%`}
      </td>
      {canWrite && (
        <td className="px-3 py-2.5">
          <div className="flex items-center justify-end gap-1">
            <button data-opus-button="control"
              type="button"
              onClick={onEdit}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Edit campaign"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button data-opus-button="control"
              type="button"
              onClick={remove}
              disabled={isPending}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
              aria-label="Delete campaign"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      )}
    </tr>
  )
}

function CampaignDrawer({
  campaign,
  employeeNames,
  onClose,
}: {
  campaign: Campaign | null
  employeeNames: string[]
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<CampaignInput>(
    campaign
      ? {
          startDate: campaign.startDate,
          endDate: campaign.endDate,
          campaignName: campaign.campaignName,
          channel: campaign.channel,
          ownerName: campaign.ownerName,
          spendTzs: campaign.spendTzs,
          reach: campaign.reach,
          leads: campaign.leads,
          bookings: campaign.bookings,
          revenueTzs: campaign.revenueTzs,
          notes: campaign.notes,
        }
      : emptyForm(),
  )

  function set<K extends keyof CampaignInput>(key: K, value: CampaignInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = campaign ? await updateCampaign(campaign.id, form) : await addCampaign(form)
      if (!res.ok) {
        setError(res.error)
        return
      }
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Campaign">
      <button data-opus-button="control" type="button" aria-label="Close" className="flex-1 bg-gray-900/30" onClick={onClose} />
      <form
        onSubmit={submit}
        className="flex h-full w-full max-w-md flex-col border-l border-gray-100 bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {campaign ? 'Edit campaign' : 'New campaign'}
            </h2>
            <p className="text-xs text-gray-500">Log spend, reach and results attributed to this campaign.</p>
          </div>
          <button data-opus-button="control"
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <FormField label="Campaign name" required>
            <input
              required
              value={form.campaignName}
              onChange={(e) => set('campaignName', e.target.value)}
              placeholder="e.g. Wedding Season Push — March"
              className={INPUT_CLASS}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Start date" required>
              <input
                required
                type="date"
                value={form.startDate}
                onChange={(e) => set('startDate', e.target.value)}
                className={INPUT_CLASS}
              />
            </FormField>
            <FormField label="End date">
              <input
                type="date"
                value={form.endDate ?? ''}
                onChange={(e) => set('endDate', e.target.value || null)}
                className={INPUT_CLASS}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Channel">
              <select value={form.channel} onChange={(e) => set('channel', e.target.value)} className={INPUT_CLASS}>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Owner">
              <input
                list="growth-marketing-owner-options"
                value={form.ownerName}
                onChange={(e) => set('ownerName', e.target.value)}
                placeholder="Name"
                className={INPUT_CLASS}
              />
              <datalist id="growth-marketing-owner-options">
                {employeeNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Spend (TZS)">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={form.spendTzs}
                onChange={(e) => set('spendTzs', Number(e.target.value))}
                className={cn(INPUT_CLASS, 'text-right tabular-nums')}
              />
            </FormField>
            <FormField label="Revenue attributed (TZS)">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={form.revenueTzs}
                onChange={(e) => set('revenueTzs', Number(e.target.value))}
                className={cn(INPUT_CLASS, 'text-right tabular-nums')}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <FormField label="Reach">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={form.reach}
                onChange={(e) => set('reach', Number(e.target.value))}
                className={cn(INPUT_CLASS, 'text-right tabular-nums')}
              />
            </FormField>
            <FormField label="Leads">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={form.leads}
                onChange={(e) => set('leads', Number(e.target.value))}
                className={cn(INPUT_CLASS, 'text-right tabular-nums')}
              />
            </FormField>
            <FormField label="Bookings">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={form.bookings}
                onChange={(e) => set('bookings', Number(e.target.value))}
                className={cn(INPUT_CLASS, 'text-right tabular-nums')}
              />
            </FormField>
          </div>

          <FormField label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              placeholder="Anything worth remembering about this campaign…"
              className={INPUT_CLASS}
            />
          </FormField>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {error}
            </div>
          )}
        </div>

        <footer className="border-t border-gray-100 px-5 py-3">
          <div className="flex items-center justify-end gap-2">
            <button data-opus-button="control"
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button data-opus-button="primary" data-opus-button-size="medium"
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7E5896] px-3 py-2 text-sm font-semibold text-white hover:bg-[#6c4884] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {isPending ? 'Saving…' : campaign ? 'Save changes' : 'Add campaign'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  )
}

const INPUT_CLASS =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#7E5896] focus:outline-none focus:ring-2 focus:ring-[#F0DFF6]'

function FormField({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-gray-500">
        {label}
        {required && <span className="ml-1 text-rose-600">*</span>}
      </span>
      {children}
    </label>
  )
}
