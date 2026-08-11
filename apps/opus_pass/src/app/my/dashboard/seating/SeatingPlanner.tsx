'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Armchair,
  Check,
  Download,
  GripVertical,
  Pencil,
  Plus,
  Share2,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, EmptyState } from '@/components/dashboard/primitives'
import { Button, ConfirmDialog, Dialog, Field, inputClass } from '@/components/dashboard/controls'
import {
  assignGuestToTable,
  createSeatingTable,
  deleteSeatingTable,
  unassignGuest,
  updateSeatingTable,
} from '@/lib/dashboard/actions'
import type { SeatableGuest, SeatingData, SeatingTable } from '@/lib/dashboard/types'
import type { DashboardSeatingStrings } from '@/lib/cms/ui-strings-fallback'
import type { SeatingPlanPdfData } from '@/lib/seating-plan-pdf'
import { formatLongDate } from '@/lib/dashboard/share'

const EAT_TIME_ZONE = 'Africa/Dar_es_Salaam'

/** "17 July 2026 at 3:42 PM" in East Africa Time, regardless of where the
 *  couple happens to be viewing from when they generate the PDF. */
function formatGeneratedAt(d: Date): string {
  const date = d.toLocaleDateString('en-GB', { timeZone: EAT_TIME_ZONE, day: 'numeric', month: 'long', year: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { timeZone: EAT_TIME_ZONE, hour: 'numeric', minute: '2-digit' })
  return `${date} at ${time}`
}

/** Substitute {var} placeholders in a CMS template string. */
function fmt(t: string, v: Record<string, string | number>): string {
  return t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m))
}

/** Card chrome, as a class string so drop zones can be plain divs with drag handlers. */
const CARD_BASE = 'rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]'

/** Headcount a list of guest parties occupies. */
function seatsOf(list: SeatableGuest[]): number {
  return list.reduce((n, g) => n + g.seats, 0)
}

/** "Pilau · Halal" — meal choice and any dietary note, joined. */
function mealLine(g: SeatableGuest): string {
  return [g.meal_choice, g.dietary_notes].filter(Boolean).join(' · ')
}

export default function SeatingPlanner({
  data,
  strings,
}: {
  data: SeatingData
  strings: DashboardSeatingStrings
}) {
  const router = useRouter()
  const eventId = data.event.id

  // Local mirror of the plan for snappy drag-and-drop; resynced whenever the
  // server re-renders (after a table add/edit/delete -> router.refresh()).
  const [tables, setTables] = useState<SeatingTable[]>(data.tables)
  const [guests, setGuests] = useState<SeatableGuest[]>(data.guests)
  useEffect(() => {
    setTables(data.tables)
    setGuests(data.guests)
  }, [data])

  const [, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const draggedId = useRef<string | null>(null)
  const [dropZone, setDropZone] = useState<string | null>(null) // table id | 'pool'
  const [menuFor, setMenuFor] = useState<string | null>(null) // guest id with open move-menu
  const [editTable, setEditTable] = useState<SeatingTable | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)

  // ── Derived ──────────────────────────────────────────────────────────────
  const pool = useMemo(() => guests.filter((g) => g.table_id === null), [guests])
  const filteredPool = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return pool
    return pool.filter((g) => g.full_name.toLowerCase().includes(q))
  }, [pool, search])

  const seatedTotal = seatsOf(guests.filter((g) => g.table_id !== null))
  const toSeatTotal = seatsOf(pool)
  const totalCapacity = tables.reduce((n, t) => n + t.capacity, 0)

  function guestsAtTable(tableId: string): SeatableGuest[] {
    return guests.filter((g) => g.table_id === tableId)
  }

  // ── Assignment (optimistic) ────────────────────────────────────────────────
  function moveGuest(guestId: string, tableId: string | null) {
    setMenuFor(null)
    const snapshot = guests
    setGuests((gs) =>
      gs.map((g) => (g.guest_contact_id === guestId ? { ...g, table_id: tableId } : g)),
    )
    startTransition(async () => {
      try {
        if (tableId === null) {
          await unassignGuest({ eventId, guestContactId: guestId })
        } else {
          await assignGuestToTable({ eventId, guestContactId: guestId, tableId })
        }
      } catch {
        setGuests(snapshot) // revert
        toast.error(strings.toast_move_failed)
      }
    })
  }

  // ── Drag and drop ──────────────────────────────────────────────────────────
  function onDragStart(e: React.DragEvent, guestId: string) {
    draggedId.current = guestId
    e.dataTransfer.effectAllowed = 'move'
  }
  function onDragEnd() {
    draggedId.current = null
    setDropZone(null)
  }
  function onDropTo(target: string | null) {
    const id = draggedId.current
    draggedId.current = null
    setDropZone(null)
    if (!id) return
    const current = guests.find((g) => g.guest_contact_id === id)?.table_id ?? null
    if (current === target) return
    moveGuest(id, target)
  }

  // ── Table CRUD ──────────────────────────────────────────────────────────────
  function addTable() {
    setBusy(true)
    startTransition(async () => {
      try {
        await createSeatingTable({ eventId })
        router.refresh()
      } catch {
        toast.error(strings.toast_add_table_failed)
      } finally {
        setBusy(false)
      }
    })
  }

  function removeTable(tableId: string) {
    setConfirmDeleteId(null)
    setBusy(true)
    startTransition(async () => {
      try {
        await deleteSeatingTable(tableId)
        router.refresh()
      } catch {
        toast.error(strings.toast_remove_table_failed)
      } finally {
        setBusy(false)
      }
    })
  }

  // ── Share / export ───────────────────────────────────────────────────────────
  function buildPlanText(): string {
    const lines: string[] = [fmt(strings.plan_doc_title, { event: data.event.name }), '']
    for (const t of tables) {
      const gs = guestsAtTable(t.id)
      lines.push(`${t.is_head ? '★ ' : ''}${t.name}  (${seatsOf(gs)}/${t.capacity})`)
      if (gs.length === 0) {
        lines.push('   —')
      } else {
        for (const g of gs) {
          const meal = mealLine(g)
          lines.push(`   • ${g.full_name} ×${g.seats}${meal ? ` — ${meal}` : ''}`)
        }
      }
      lines.push('')
    }
    if (pool.length > 0) {
      lines.push(fmt(strings.plan_doc_not_seated, { count: toSeatTotal }))
      for (const g of pool) lines.push(`   • ${g.full_name} ×${g.seats}`)
    }
    return lines.join('\n')
  }

  /** Payload for /api/seating-plan — same data buildPlanText() summarizes as
   *  plain text, shaped for the @react-pdf/renderer document instead. */
  function buildPdfData(): SeatingPlanPdfData {
    const venue = [data.event.venue_name, data.event.city].filter(Boolean).join(', ') || null
    return {
      eventName: data.event.name,
      eventDate: data.event.starts_at ? formatLongDate(data.event.starts_at) : null,
      venue,
      generatedAt: formatGeneratedAt(new Date()),
      totalCapacity,
      seatedTotal,
      unassignedTotal: toSeatTotal,
      tables: tables.map((t) => {
        const gs = guestsAtTable(t.id)
        return {
          name: t.name,
          isHead: t.is_head,
          capacity: t.capacity,
          seated: seatsOf(gs),
          guests: gs.map((g) => ({ name: g.full_name, seats: g.seats, meal: mealLine(g) || null })),
        }
      }),
      unassigned: pool.map((g) => ({ name: g.full_name, seats: g.seats, meal: mealLine(g) || null })),
    }
  }

  async function fetchPdfBlob(): Promise<Blob> {
    const res = await fetch('/api/seating-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPdfData()),
    })
    if (!res.ok) throw new Error('PDF request failed')
    return res.blob()
  }

  const pdfFilename = `${data.event.name.replace(/[^A-Za-z0-9 _-]/g, '').trim() || 'OpusPass'}-Seating-Plan.pdf`

  async function downloadPdf() {
    setPdfBusy(true)
    try {
      const blob = await fetchPdfBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = pdfFilename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error(strings.toast_pdf_failed)
    } finally {
      setPdfBusy(false)
    }
  }

  /** Native share sheet with the actual PDF attached (WhatsApp, Files, email, …)
   *  where the browser supports sharing files; otherwise falls back to the
   *  original "copy a text summary" flow so venues without app support still
   *  get something pasteable into WhatsApp. */
  async function sharePdf() {
    setPdfBusy(true)
    try {
      const blob = await fetchPdfBlob()
      const file = new File([blob], pdfFilename, { type: 'application/pdf' })
      const canShareFile = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
      if (canShareFile && navigator.share) {
        await navigator.share({ files: [file], title: fmt(strings.plan_doc_title, { event: data.event.name }) })
        return
      }
      await navigator.clipboard.writeText(buildPlanText())
      toast.success(strings.toast_copied)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return // user cancelled the share sheet
      try {
        await navigator.clipboard.writeText(buildPlanText())
        toast.success(strings.toast_copied)
      } catch {
        toast.error(strings.toast_copy_failed)
      }
    } finally {
      setPdfBusy(false)
    }
  }

  const noGuests = guests.length === 0

  return (
    <div className="space-y-5">
      {/* Stats + actions — one row (the event selector lives in the page header, top right) */}
      <div className="flex flex-wrap items-center gap-3">
        <Card className="flex-1 px-5 py-4">
          <div className="grid grid-cols-2 divide-x divide-black/[0.12] text-center sm:grid-cols-4">
            <Stat label={strings.stat_seated} value={seatedTotal} />
            <Stat label={strings.stat_to_seat} value={toSeatTotal} />
            <Stat label={strings.stat_tables} value={tables.length} />
            <Stat label={strings.stat_seats_used} value={`${seatedTotal} / ${totalCapacity}`} />
          </div>
        </Card>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" onClick={downloadPdf} disabled={noGuests || pdfBusy}>
            <Download className="h-4 w-4" /> {strings.toolbar_export}
          </Button>
          <Button onClick={sharePdf} disabled={noGuests || pdfBusy}>
            <Share2 className="h-4 w-4" /> {strings.toolbar_share}
          </Button>
        </div>
      </div>

      {noGuests ? (
        <EmptyState
          icon={<Armchair className="h-7 w-7" />}
          title={strings.empty_no_guests_title}
          description={strings.empty_no_guests_description}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          {/* Pool */}
          <div
            className={
              CARD_BASE +
              ' flex max-h-[760px] flex-col overflow-hidden ' +
              (dropZone === 'pool' ? 'ring-2 ring-[#C9A0DC]/50' : '')
            }
            onDragOver={(e) => {
              e.preventDefault()
              setDropZone('pool')
            }}
            onDragLeave={() => setDropZone((z) => (z === 'pool' ? null : z))}
            onDrop={() => onDropTo(null)}
          >
            <div className="border-b border-black/[0.06] px-4 pb-3 pt-4">
              <h2 className="text-base font-semibold text-[#1A1A1A]">{strings.pool_title}</h2>
              <p className="mt-0.5 text-xs text-[#1A1A1A]/55">{strings.pool_description}</p>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={strings.pool_search_placeholder}
                className={inputClass + ' mt-3'}
              />
            </div>
            <div className="flex-1 space-y-2 overflow-auto p-3">
              {filteredPool.length === 0 ? (
                <p className="px-2 py-8 text-center text-xs text-[#1A1A1A]/40">
                  {pool.length === 0 ? strings.pool_all_seated : strings.pool_no_matches}
                </p>
              ) : (
                filteredPool.map((g) => (
                  <GuestChip
                    key={g.guest_contact_id}
                    guest={g}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    menuOpen={menuFor === g.guest_contact_id}
                    onToggleMenu={() =>
                      setMenuFor((m) => (m === g.guest_contact_id ? null : g.guest_contact_id))
                    }
                    tables={tables}
                    currentTableId={null}
                    onMove={moveGuest}
                    strings={strings}
                  />
                ))
              )}
            </div>
          </div>

          {/* Floor */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {tables.map((t) => {
              const gs = guestsAtTable(t.id)
              const used = seatsOf(gs)
              const full = used >= t.capacity
              const over = used > t.capacity
              return (
                <div
                  key={t.id}
                  className={
                    CARD_BASE +
                    ' flex min-h-[180px] flex-col ' +
                    (t.is_head ? 'border-[#C9A0DC]/50 bg-[#C9A0DC]/[0.06] ' : '') +
                    (dropZone === t.id ? 'ring-2 ring-[#C9A0DC]/60' : '')
                  }
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDropZone(t.id)
                  }}
                  onDragLeave={() => setDropZone((z) => (z === t.id ? null : z))}
                  onDrop={() => onDropTo(t.id)}
                >
                  <div className="flex items-center gap-2 border-b border-black/[0.06] px-3.5 py-3">
                    {t.is_head ? <Star className="h-3.5 w-3.5 fill-[#8e57b3] text-[#8e57b3]" /> : null}
                    <span className="truncate text-sm font-semibold text-[#1A1A1A]">{t.name}</span>
                    <span
                      className={
                        'ml-auto text-xs font-bold ' +
                        (over ? 'text-rose-600' : full ? 'text-emerald-600' : 'text-[#1A1A1A]/45')
                      }
                    >
                      {used} / {t.capacity}
                    </span>
                    <button data-opus-button="control"
                      type="button"
                      onClick={() => setEditTable(t)}
                      aria-label={fmt(strings.table_edit_aria, { table: t.name })}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-[#1A1A1A]/40 hover:bg-black/[0.05] hover:text-[#1A1A1A]"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex-1 space-y-2 p-3">
                    {gs.length === 0 ? (
                      <p className="flex h-full items-center justify-center px-2 py-6 text-center text-xs leading-relaxed text-[#1A1A1A]/35">
                        {strings.table_empty_line1}
                        <br />
                        {strings.table_empty_line2}
                      </p>
                    ) : (
                      gs.map((g) => (
                        <GuestChip
                          key={g.guest_contact_id}
                          guest={g}
                          seated
                          onDragStart={onDragStart}
                          onDragEnd={onDragEnd}
                          menuOpen={menuFor === g.guest_contact_id}
                          onToggleMenu={() =>
                            setMenuFor((m) =>
                              m === g.guest_contact_id ? null : g.guest_contact_id,
                            )
                          }
                          tables={tables}
                          currentTableId={t.id}
                          onMove={moveGuest}
                          strings={strings}
                        />
                      ))
                    )}
                  </div>
                </div>
              )
            })}

            {/* New table */}
            <button data-opus-button="neutral" data-opus-button-size="medium"
              type="button"
              onClick={addTable}
              disabled={busy}
              className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#C9A0DC]/60 bg-[#C9A0DC]/[0.06] text-sm font-semibold text-[#8e57b3] transition hover:bg-[#C9A0DC]/[0.12] disabled:opacity-50"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm">
                <Plus className="h-5 w-5" />
              </span>
              {strings.new_table}
            </button>
          </div>
        </div>
      )}

      <EditTableDialog
        table={editTable}
        onClose={() => setEditTable(null)}
        onAskDelete={(id) => {
          setEditTable(null)
          setConfirmDeleteId(id)
        }}
        onSaved={() => {
          setEditTable(null)
          router.refresh()
        }}
        strings={strings}
      />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => confirmDeleteId && removeTable(confirmDeleteId)}
        title={strings.delete_confirm_title}
        description={strings.delete_confirm_description}
        confirmLabel={strings.delete_confirm_label}
        pending={busy}
      />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-2xl leading-none font-semibold tracking-tight text-[#1A1A1A]">{value}</div>
      <div className="mt-1 text-xs font-medium text-[#1A1A1A]/55">{label}</div>
    </div>
  )
}

function GuestChip({
  guest,
  seated,
  onDragStart,
  onDragEnd,
  menuOpen,
  onToggleMenu,
  tables,
  currentTableId,
  onMove,
  strings,
}: {
  guest: SeatableGuest
  seated?: boolean
  onDragStart: (e: React.DragEvent, guestId: string) => void
  onDragEnd: () => void
  menuOpen: boolean
  onToggleMenu: () => void
  tables: SeatingTable[]
  currentTableId: string | null
  onMove: (guestId: string, tableId: string | null) => void
  strings: DashboardSeatingStrings
}) {
  const meal = mealLine(guest)
  return (
    <div className="relative">
      <div
        draggable
        onDragStart={(e) => onDragStart(e, guest.guest_contact_id)}
        onDragEnd={onDragEnd}
        className="flex cursor-grab items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-2.5 py-2 transition hover:border-[#C9A0DC]/60 active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-[#1A1A1A]/25" />
        <button data-opus-button="control"
          type="button"
          onClick={onToggleMenu}
          className="min-w-0 flex-1 text-left"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <span className="block truncate text-sm font-semibold text-[#1A1A1A]">
            {guest.full_name}
          </span>
          {meal ? (
            <span className="mt-0.5 block truncate text-[11px] text-[#1A1A1A]/50">{meal}</span>
          ) : guest.group_tag ? (
            <span className="mt-0.5 block truncate text-[11px] text-[#1A1A1A]/50">
              {guest.group_tag}
            </span>
          ) : null}
        </button>
        <span className="shrink-0 rounded-full bg-[#C9A0DC]/15 px-2 py-0.5 text-[11px] font-bold text-[#8e57b3]">
          ×{guest.seats}
        </span>
        {seated ? (
          <button data-opus-button="control"
            type="button"
            onClick={() => onMove(guest.guest_contact_id, null)}
            aria-label={fmt(strings.chip_remove_aria, { name: guest.full_name })}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#1A1A1A]/35 hover:bg-black/[0.05] hover:text-[#8e57b3]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {menuOpen ? (
        <>
          <div className="fixed inset-0 z-20" onClick={onToggleMenu} />
          <div
            role="menu"
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-xl border border-black/[0.08] bg-white p-1 shadow-xl"
          >
            <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#1A1A1A]/40">
              {strings.menu_move_to}
            </p>
            {tables.length === 0 ? (
              <p className="px-2.5 py-1.5 text-xs text-[#1A1A1A]/45">{strings.menu_add_table_first}</p>
            ) : (
              tables.map((t) => {
                const isCurrent = t.id === currentTableId
                return (
                  <button data-opus-button="control"
                    key={t.id}
                    type="button"
                    role="menuitem"
                    disabled={isCurrent}
                    onClick={() => onMove(guest.guest_contact_id, t.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-[#1A1A1A] hover:bg-black/[0.04] disabled:opacity-40"
                  >
                    {t.is_head ? <Star className="h-3 w-3 text-[#8e57b3]" /> : null}
                    <span className="flex-1 truncate">{t.name}</span>
                    {isCurrent ? <Check className="h-3.5 w-3.5 text-[#8e57b3]" /> : null}
                  </button>
                )
              })
            )}
            {currentTableId ? (
              <button data-opus-button="control"
                type="button"
                role="menuitem"
                onClick={() => onMove(guest.guest_contact_id, null)}
                className="mt-1 flex w-full items-center gap-2 border-t border-black/[0.06] px-2.5 py-1.5 text-left text-sm text-[#1A1A1A]/70 hover:bg-black/[0.04]"
              >
                <X className="h-3.5 w-3.5" /> {strings.menu_back_to_pool}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}

function EditTableDialog({
  table,
  onClose,
  onAskDelete,
  onSaved,
  strings,
}: {
  table: SeatingTable | null
  onClose: () => void
  onAskDelete: (id: string) => void
  onSaved: () => void
  strings: DashboardSeatingStrings
}) {
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState(10)
  const [isHead, setIsHead] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (table) {
      setName(table.name)
      setCapacity(table.capacity)
      setIsHead(table.is_head)
    }
  }, [table])

  if (!table) return null

  async function save() {
    if (!table) return
    setSaving(true)
    try {
      await updateSeatingTable(table.id, { name, capacity, isHead })
      onSaved()
    } catch {
      toast.error(strings.toast_save_table_failed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={table !== null}
      onClose={onClose}
      title={strings.edit_title}
      footer={
        <>
          <Button
            variant="ghost"
            className="mr-auto text-rose-600 hover:bg-rose-50"
            onClick={() => onAskDelete(table.id)}
          >
            <Trash2 className="h-4 w-4" /> {strings.edit_remove}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {strings.edit_cancel}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? strings.edit_saving : strings.edit_save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={strings.edit_name_label}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder={strings.edit_name_placeholder}
          />
        </Field>
        <Field label={strings.edit_capacity_label}>
          <input
            type="number"
            min={0}
            value={capacity}
            onChange={(e) => setCapacity(Math.max(0, Number(e.target.value) || 0))}
            className={inputClass}
          />
        </Field>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-black/[0.08] px-3.5 py-3">
          <input
            type="checkbox"
            checked={isHead}
            onChange={(e) => setIsHead(e.target.checked)}
            className="h-4 w-4 accent-[#8e57b3]"
          />
          <span className="text-sm">
            <span className="font-medium text-[#1A1A1A]">{strings.edit_top_table_label}</span>
            <span className="ml-1 text-[#1A1A1A]/55">{strings.edit_top_table_hint}</span>
          </span>
        </label>
      </div>
    </Dialog>
  )
}
