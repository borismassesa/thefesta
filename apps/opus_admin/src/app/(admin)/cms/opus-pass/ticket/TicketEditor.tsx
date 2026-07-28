'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { AlertTriangle, Download, Loader2, Save, Upload } from 'lucide-react'
import { ImageUploadField } from '@/components/cms/ImageUploadField'
import { PaletteEditor } from '@/components/cms/PaletteEditor'
import { SvgInspector } from '@/components/cms/SvgInspector'
import { SvgPreview } from '@/components/cms/SvgPreview'
import { uploadCmsMediaToFixedPath } from '@/lib/cms/upload-client'
import { upsertDigitalCardProduct } from '../digital-cards/products/actions'
import type { DigitalCardPalette, DigitalCardProductRecord } from '@/lib/cms/opus-pass-digital-cards-products'

const IMAGE_PREFIX = 'opus-pass/invitations/ticket'

const TICKET_QR_FRONT_PATH = 'invitation-svgs/model-wedding-package/ticket-front.svg'
const TICKET_BARCODE_FRONT_PATH = 'invitation-svgs/model-wedding-package/ticket-barcode-front.svg'
const STORAGE_BASE = 'https://ppdapuqehwlfwofbpbvb.supabase.co/storage/v1/object/public/website-media'

function fixedStorageUrl(storagePath: string, bust?: number) {
  return `${STORAGE_BASE}/${storagePath}${bust ? `?t=${bust}` : ''}`
}

const inputCls =
  'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all'

export default function TicketEditor({
  qr,
  barcode,
}: {
  qr: DigitalCardProductRecord
  barcode: DigitalCardProductRecord
}) {
  const [qrRecord, setQrRecord] = useState<DigitalCardProductRecord>(qr)
  const [barcodeRecord, setBarcodeRecord] = useState<DigitalCardProductRecord>(barcode)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Fixed-path front SVGs are always fetched from storage; bust is a timestamp
  // appended after upload to force the browser to re-fetch the new file.
  const [qrFrontBust, setQrFrontBust] = useState<number>(0)
  const [barcodeFrontBust, setBarcodeFrontBust] = useState<number>(0)

  // Back SVG previews come from the DB record URL.
  const [qrBackPreview, setQrBackPreview] = useState(qr.back_image_url)
  const [barcodeBackPreview, setBarcodeBackPreview] = useState(barcode.back_image_url)

  function setQr<K extends keyof DigitalCardProductRecord>(key: K, value: DigitalCardProductRecord[K]) {
    setQrRecord((p) => ({ ...p, [key]: value }))
    setSaved(false)
    if (key === 'back_image_url' && value) setQrBackPreview(value as string)
  }

  function setBarcode<K extends keyof DigitalCardProductRecord>(key: K, value: DigitalCardProductRecord[K]) {
    setBarcodeRecord((p) => ({ ...p, [key]: value }))
    setSaved(false)
    if (key === 'back_image_url' && value) setBarcodeBackPreview(value as string)
  }

  function save() {
    setError(null)
    setSaved(false)
    const qrPalettes = qrRecord.palettes ?? []
    const barcodePalettes = barcodeRecord.palettes ?? []
    const qrSwatches = qrPalettes.length > 0 ? qrPalettes.map((p) => p.accent) : qrRecord.swatches
    const barcodeSwatches = barcodePalettes.length > 0 ? barcodePalettes.map((p) => p.accent) : barcodeRecord.swatches

    startTransition(async () => {
      try {
        await Promise.all([
          upsertDigitalCardProduct({ ...qrRecord, swatches: qrSwatches }),
          upsertDigitalCardProduct({ ...barcodeRecord, swatches: barcodeSwatches }),
        ])
        setSaved(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  return (
    <div className="py-2 flex items-start gap-6">
      {/* Form column */}
      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex items-center justify-end gap-2">
          {error && (
            <span className="text-xs text-red-600 font-medium max-w-[280px] truncate" title={error}>
              {error}
            </span>
          )}
          {saved && !error && (
            <span className="text-xs text-emerald-600 font-medium">Saved</span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-[#C9A0DC] hover:bg-[#b97fd0] px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save both
          </button>
        </div>

        <TicketCard
          label="QR Code ticket (p23)"
          description="Boarding-pass layout with a QR code stub."
          record={qrRecord}
          setField={setQr}
          frontStoragePath={TICKET_QR_FRONT_PATH}
          onFrontUploaded={() => {
            const bust = Date.now()
            setQrFrontBust(bust)
            setQr('image_url', fixedStorageUrl(TICKET_QR_FRONT_PATH))
          }}
        />

        <TicketCard
          label="Barcode ticket (p24)"
          description="Boarding-pass layout with a classic linear barcode."
          record={barcodeRecord}
          setField={setBarcode}
          frontStoragePath={TICKET_BARCODE_FRONT_PATH}
          onFrontUploaded={() => {
            const bust = Date.now()
            setBarcodeFrontBust(bust)
            setBarcode('image_url', fixedStorageUrl(TICKET_BARCODE_FRONT_PATH))
          }}
        />
      </div>

      {/* Preview panel */}
      <aside className="w-[260px] shrink-0 sticky top-6 space-y-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-4">
          <p className="text-xs font-bold text-gray-700">Preview</p>
          <TicketPreviewCard label="QR ticket — front" previewUrl={fixedStorageUrl(TICKET_QR_FRONT_PATH, qrFrontBust)} palettes={qrRecord.palettes} />
          <TicketPreviewCard label="QR ticket — back" previewUrl={qrBackPreview} palettes={qrRecord.palettes} />
          <TicketPreviewCard label="Barcode ticket — front" previewUrl={fixedStorageUrl(TICKET_BARCODE_FRONT_PATH, barcodeFrontBust)} palettes={barcodeRecord.palettes} />
          <TicketPreviewCard label="Barcode ticket — back" previewUrl={barcodeBackPreview} palettes={barcodeRecord.palettes} />
        </div>
      </aside>
    </div>
  )
}

function TicketPreviewCard({
  label,
  previewUrl,
  palettes,
}: {
  label: string
  previewUrl: string
  palettes: DigitalCardPalette[]
}) {
  const [activeIdx, setActiveIdx] = useState(0)
  const safePalettes = palettes ?? []
  const palette: DigitalCardPalette | null = safePalettes[activeIdx] ?? null

  return (
    <div className="space-y-2">
      <SvgPreview url={previewUrl} palette={palette} aspect="aspect-[14/5]" label={label} />
      {safePalettes.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          {safePalettes.map((p, i) => (
            <button
              key={i}
              type="button"
              title={p.name || `Palette ${i + 1}`}
              onClick={() => setActiveIdx(i)}
              className="w-5 h-5 rounded-full border-2 transition-all"
              style={{
                backgroundColor: p.accent,
                borderColor: i === activeIdx ? '#7E5896' : 'transparent',
                outline: i === activeIdx ? '1px solid #7E5896' : 'none',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TicketCard({
  label,
  description,
  record,
  setField,
  frontStoragePath,
  onFrontUploaded,
}: {
  label: string
  description: string
  record: DigitalCardProductRecord
  setField: <K extends keyof DigitalCardProductRecord>(key: K, value: DigitalCardProductRecord[K]) => void
  frontStoragePath: string
  onFrontUploaded: () => void
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-5">
      <div>
        <h3 className="text-sm font-bold text-gray-900">{label}</h3>
        <p className="text-[11px] text-gray-500 mt-0.5">{description}</p>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div>
          <FixedSvgUploadField
            label="Ticket front SVG"
            storagePath={frontStoragePath}
            onUploaded={onFrontUploaded}
          />
        </div>
        <div>
          <ImageUploadField
            label="Ticket back SVG (optional)"
            value={record.back_image_url}
            onChange={(v) => setField('back_image_url', v)}
            pathPrefix={IMAGE_PREFIX}
            previewAspect="aspect-[14/5]"
            previewWidth="max-w-full"
            accept="svg"
          />
          <SvgInspector url={record.back_image_url} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-600">Accent colour options</span>
          <span className="text-[11px] text-gray-400">Max 5 — accent colour is shown as the stub swatch</span>
        </div>
        <PaletteEditor value={record.palettes} onChange={(v) => setField('palettes', v)} />
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-gray-600">Designer</span>
        <input
          value={record.designer}
          onChange={(e) => setField('designer', e.target.value)}
          className={inputCls}
          placeholder="Mzimbazi Studio"
        />
      </label>
    </div>
  )
}

function FixedSvgUploadField({
  label,
  storagePath,
  onUploaded,
}: {
  label: string
  storagePath: string
  onUploaded: () => void
}) {
  const id = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const currentUrl = fixedStorageUrl(storagePath)

  const handleFile = (file: File) => {
    setError(null)
    setDone(false)
    if (file.type !== 'image/svg+xml' && !file.name.toLowerCase().endsWith('.svg')) {
      setError('Please choose an SVG file.')
      return
    }
    startTransition(async () => {
      try {
        await uploadCmsMediaToFixedPath(file, storagePath)
        setDone(true)
        onUploaded()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-gray-600">{label}</span>
        {error && <span className="text-[11px] text-red-600 truncate max-w-[60%]" title={error}>{error}</span>}
        {done && !error && <span className="text-[11px] text-emerald-600 font-medium">Uploaded</span>}
      </div>

      {/* Warning banner */}
      <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-[11px] text-amber-800 font-medium leading-snug">
            Uploading overwrites the live file immediately and cannot be undone.
          </p>
          <a
            href={currentUrl}
            download
            className="inline-flex items-center gap-1 text-[11px] text-amber-700 underline underline-offset-2 hover:text-amber-900"
          >
            <Download className="w-3 h-3" />
            Download current file first
          </a>
        </div>
      </div>

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={pending}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#7E5896] hover:text-[#5d3a78] px-3 py-1.5 rounded-lg border border-[#C9A0DC] hover:bg-[#F0DFF6] transition-colors disabled:opacity-50"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        {pending ? 'Uploading…' : 'Replace SVG'}
      </button>

      <input
        ref={fileRef}
        id={id}
        type="file"
        accept="image/svg+xml,.svg"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />

      <p className="text-[10px] text-gray-400 break-all">{storagePath}</p>
    </div>
  )
}
