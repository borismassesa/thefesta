'use client'

import { useMemo, useState } from 'react'
import { Check, Link2, Search } from 'lucide-react'

import {
  CARD_TYPES,
  FIELD_SCOPE_LABELS,
  REGISTRY_EVENT_TYPES,
  TEST_DATA_PRESETS,
  coverageChecklist,
  findLayersForField,
  getFieldByKey,
  inventoryFields,
  resolveCardField,
  type CardFieldDef,
  type CardType,
  type DesignElement,
  type PreflightResult,
  type RegistryEventType,
  type TextElement,
} from '@opusfesta/design-engine'

type BoundLayer = {
  id: string
  name: string
  path: string
  preview: string
}

type Props = {
  testKey: string
  testData: Record<string, unknown>
  cardType: CardType | 'all'
  eventType: RegistryEventType | 'all'
  pageElements: DesignElement[]
  selectedText: TextElement | null
  boundLayers: BoundLayer[]
  preflight: PreflightResult | null
  onTestKeyChange: (key: string) => void
  onCardTypeChange: (type: CardType | 'all') => void
  onEventTypeChange: (type: RegistryEventType | 'all') => void
  onSampleChange: (path: string, value: string) => void
  onInsertField: (field: CardFieldDef) => void
  onBindSelection: (field: CardFieldDef) => void
  onSelectLayer: (id: string) => void
  onRunStressTest: () => void
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
      {children}
    </div>
  )
}

function ScopeTag({ scope }: { scope: CardFieldDef['scope'] }) {
  return (
    <span className="rounded bg-[#F0F0F0] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-500">
      {FIELD_SCOPE_LABELS[scope]}
    </span>
  )
}

function InventoryRow({
  field,
  sample,
  onCard,
  layerIds,
  canBind,
  onSampleChange,
  onAdd,
  onSelect,
  onBind,
}: {
  field: CardFieldDef
  sample: string
  onCard: boolean
  layerIds: string[]
  canBind: boolean
  onSampleChange: (value: string) => void
  onAdd: () => void
  onSelect: () => void
  onBind: () => void
}) {
  return (
    <div
      className={`rounded-xl border px-2.5 py-2.5 ${
        onCard ? 'border-[#0B99FF]/30 bg-[#F7FBFF]' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[9px] text-gray-400">{field.key}</div>
          <div className="text-[11px] font-medium text-gray-700">{field.label}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ScopeTag scope={field.scope} />
          {field.requiredForSend ? (
            <span className="rounded bg-[#FFF4E5] px-1.5 py-0.5 text-[9px] font-semibold text-[#9A6700]">
              Req
            </span>
          ) : null}
        </div>
      </div>

      <input
        value={sample}
        onChange={(e) => onSampleChange(e.target.value)}
        className="mt-2 w-full rounded-md bg-[#F5F5F5] px-2.5 py-2 text-[13px] font-semibold text-gray-900 outline-none ring-[#0B99FF] focus:bg-white focus:ring-1"
        placeholder={field.sample}
        title="Edit sample — updates canvas preview live"
      />

      <div className="mt-2 flex items-center justify-between gap-2">
        <span
          className={`text-[10px] font-semibold ${
            onCard ? 'text-[#0B6FBD]' : 'text-gray-400'
          }`}
        >
          {onCard ? `On card · ${layerIds.length}` : 'Not on card'}
        </span>
        <div className="flex gap-1">
          {canBind ? (
            <button
              type="button"
              onClick={onBind}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-700 hover:bg-gray-50"
              title={`Bind selection to ${field.key}`}
            >
              <Link2 className="h-3 w-3" />
              Bind
            </button>
          ) : null}
          {onCard ? (
            <button
              type="button"
              onClick={onSelect}
              className="rounded-md bg-gray-900 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-gray-800"
            >
              Select
            </button>
          ) : (
            <button
              type="button"
              onClick={onAdd}
              className="rounded-md bg-gray-900 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-gray-800"
            >
              Add
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function StudioDataPanel({
  testKey,
  testData,
  cardType,
  eventType,
  pageElements,
  selectedText,
  boundLayers,
  preflight,
  onTestKeyChange,
  onCardTypeChange,
  onEventTypeChange,
  onSampleChange,
  onInsertField,
  onBindSelection,
  onSelectLayer,
  onRunStressTest,
}: Props) {
  const [query, setQuery] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showMore, setShowMore] = useState(false)

  const canBind = selectedText != null && selectedText.type === 'text'
  const previewLabel =
    TEST_DATA_PRESETS.find((p) => p.key === testKey)?.label ?? 'Example guest'

  const primary = useMemo(
    () =>
      inventoryFields({
        cardType,
        eventType,
        query,
        includePass: false,
      }),
    [cardType, eventType, query],
  )

  const passFields = useMemo(
    () =>
      inventoryFields({
        cardType: 'pass',
        eventType,
        query,
        includePass: true,
      }).filter((f) => f.group === 'pass'),
    [eventType, query],
  )

  const coverage = useMemo(
    () =>
      coverageChecklist(pageElements, {
        cardType: cardType === 'all' ? 'invitation' : cardType,
        eventType,
      }),
    [pageElements, cardType, eventType],
  )
  const coverageReady = coverage.filter((c) => c.bound).length
  const guestOnCard = findLayersForField(
    pageElements,
    getFieldByKey('guest_name')!,
  ).length > 0

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-[#F8F8F8] p-2.5">
        <div className="text-[11px] font-semibold text-gray-800">
          Previewing: {previewLabel}
        </div>
        <p className="mt-0.5 text-[10px] leading-snug text-gray-500">
          Guest presets change guest fields. Edit samples below to update the card live.
        </p>
        <select
          value={testKey}
          onChange={(e) => onTestKeyChange(e.target.value)}
          className="mt-2 w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-gray-800 outline-none"
        >
          {TEST_DATA_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <SectionLabel>Ready for guest send?</SectionLabel>
        <div className="rounded-xl border border-gray-200 bg-white px-2.5 py-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-gray-800">
              {coverageReady}/{coverage.length} required roles
            </span>
            {coverageReady === coverage.length && coverage.length > 0 ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                <Check className="h-3 w-3" /> Ready
              </span>
            ) : (
              <span className="text-[10px] font-medium text-amber-700">Incomplete</span>
            )}
          </div>
          <ul className="mt-2 space-y-1">
            {coverage.map((item) => (
              <li key={item.field.key} className="flex items-center justify-between gap-2 text-[10px]">
                <span className="font-mono text-gray-500">{item.field.key}</span>
                <span className={item.bound ? 'font-semibold text-[#0B6FBD]' : 'text-gray-400'}>
                  {item.bound ? 'Bound' : 'missing'}
                </span>
              </li>
            ))}
          </ul>
          {!guestOnCard ? (
            <p className="mt-2 rounded-md bg-[#FFF4E5] px-2 py-1.5 text-[10px] leading-snug text-[#9A6700]">
              No guest field on this card yet — required for personalised sends.
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <SectionLabel>Card fields</SectionLabel>
        <div className="mb-2 flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => onCardTypeChange('all')}
            className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
              cardType === 'all' ? 'bg-gray-900 text-white' : 'bg-[#F5F5F5] text-gray-600'
            }`}
          >
            All
          </button>
          {CARD_TYPES.filter((t) => t.id !== 'pass').map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onCardTypeChange(t.id)}
              className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                cardType === t.id ? 'bg-gray-900 text-white' : 'bg-[#F5F5F5] text-gray-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mb-2 flex flex-wrap gap-1">
          {REGISTRY_EVENT_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onEventTypeChange(t.id)}
              className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                eventType === t.id ? 'bg-gray-800 text-white' : 'bg-[#F5F5F5] text-gray-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search roles…"
            className="w-full rounded-md border border-gray-200 bg-[#F5F5F5] py-1.5 pl-8 pr-2.5 text-[12px] outline-none focus:bg-white"
          />
        </div>

        {canBind ? (
          <div className="mb-2 rounded-lg border border-[#0B99FF]/25 bg-[#E8F4FF] px-2.5 py-1.5 text-[10px] text-[#0B6FBD]">
            Selected text · bind to a role below
            {selectedText.binding?.path ? (
              <span className="opacity-70"> · currently {selectedText.binding.path}</span>
            ) : (
              <span className="opacity-70"> · unbound</span>
            )}
          </div>
        ) : null}

        <div className="space-y-2">
          {primary.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-gray-400">No fields match</p>
          ) : (
            primary.map((field) => {
              const layerIds = findLayersForField(pageElements, field)
              const onCard = layerIds.length > 0
              return (
                <InventoryRow
                  key={field.key}
                  field={field}
                  sample={resolveCardField(testData, field.key)}
                  onCard={onCard}
                  layerIds={layerIds}
                  canBind={canBind}
                  onSampleChange={(value) => onSampleChange(field.path, value)}
                  onAdd={() => onInsertField(field)}
                  onSelect={() => onSelectLayer(layerIds[0]!)}
                  onBind={() => onBindSelection(field)}
                />
              )
            })
          )}
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowPass((v) => !v)}
          className="mb-2 flex w-full items-center justify-between text-left"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Entrance pass
          </span>
          <span className="text-[10px] text-gray-400">{showPass ? 'Hide' : 'Show'}</span>
        </button>
        {showPass ? (
          <div className="space-y-2">
            {passFields.map((field) => {
              const layerIds = findLayersForField(pageElements, field)
              return (
                <InventoryRow
                  key={field.key}
                  field={field}
                  sample={resolveCardField(testData, field.key)}
                  onCard={layerIds.length > 0}
                  layerIds={layerIds}
                  canBind={canBind}
                  onSampleChange={(value) => onSampleChange(field.path, value)}
                  onAdd={() => onInsertField(field)}
                  onSelect={() => layerIds[0] && onSelectLayer(layerIds[0])}
                  onBind={() => onBindSelection(field)}
                />
              )
            })}
          </div>
        ) : (
          <p className="text-[10px] text-gray-400">QR, ticket type & pass ID — parked here.</p>
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="mb-1 flex w-full items-center justify-between text-left"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            On this card ({boundLayers.length})
          </span>
          <span className="text-[10px] text-gray-400">{showMore ? 'Hide' : 'Show'}</span>
        </button>
        {showMore ? (
          boundLayers.length === 0 ? (
            <p className="rounded-lg bg-[#F5F5F5] px-2.5 py-3 text-[11px] text-gray-500">
              No bound layers yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {boundLayers.map((layer) => (
                <li key={layer.id}>
                  <button
                    type="button"
                    onClick={() => onSelectLayer(layer.id)}
                    className="flex w-full flex-col rounded-lg border border-gray-100 bg-white px-2.5 py-2 text-left hover:bg-gray-50"
                  >
                    <span className="truncate text-[11px] font-semibold text-gray-900">
                      {layer.name}
                    </span>
                    <span className="font-mono text-[9px] text-gray-400">{layer.path}</span>
                    <span className="truncate text-[11px] text-gray-600">{layer.preview}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>

      <div>
        <SectionLabel>Validation</SectionLabel>
        <button
          type="button"
          onClick={onRunStressTest}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] font-semibold text-gray-800 hover:bg-gray-50"
        >
          Run stress test
        </button>
        {preflight?.stress ? (
          <p className="mt-1.5 text-[11px] text-gray-500">
            {preflight.stress.pass} pass · {preflight.stress.warning} warn · {preflight.stress.failed}{' '}
            fail
          </p>
        ) : null}
      </div>
    </div>
  )
}

export function boundTextLayers(
  elements: DesignElement[],
  testData: Record<string, unknown>,
): BoundLayer[] {
  return elements
    .filter(
      (el): el is TextElement =>
        el.type === 'text' && el.binding?.type === 'variable' && !!el.binding.path,
    )
    .map((el) => ({
      id: el.id,
      name: el.name,
      path: el.binding!.path!,
      preview:
        resolveCardField(testData, el.binding!.path!) ||
        el.binding?.fallback ||
        el.content,
    }))
}
