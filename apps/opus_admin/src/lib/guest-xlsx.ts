/**
 * Browser-only `.xlsx` reader for the guest-list import (Operations >
 * Event Check-in). Reads the ZIP container by hand and inflates entries
 * with the browser's `DecompressionStream` (no third-party dependency),
 * then pulls the first worksheet's cells out.
 *
 * DUPLICATED from apps/opus_pass/src/lib/dashboard/import-spreadsheet.ts's
 * XLSX support — same "no shared package yet" situation as the rest of
 * this feature. Uses `DOMParser`/`DecompressionStream`/`File`, so this
 * module must only ever be imported by a client component.
 */

export class SpreadsheetError extends Error {}

/** Parse the first worksheet of an `.xlsx` file into a table of cell strings. */
export async function parseXlsxFile(file: File): Promise<string[][]> {
  if (typeof DecompressionStream === 'undefined') {
    throw new SpreadsheetError('Your browser can’t read .xlsx files — please use a CSV, or paste the names instead.')
  }

  let entries: Map<string, Uint8Array>
  try {
    const buf = new Uint8Array(await file.arrayBuffer())
    entries = await readZip(buf)
  } catch {
    throw new SpreadsheetError('That .xlsx file looks corrupted and couldn’t be opened.')
  }

  const decoder = new TextDecoder()
  const xml = async (path: string): Promise<Document | null> => {
    const bytes = entries.get(path)
    if (!bytes) return null
    return new DOMParser().parseFromString(decoder.decode(bytes), 'application/xml')
  }

  const sheetPath = await firstSheetPath(xml)
  const sheetDoc = sheetPath ? await xml(sheetPath) : null
  if (!sheetDoc) {
    throw new SpreadsheetError('Couldn’t find a worksheet in that .xlsx file.')
  }

  const sharedStrings = await readSharedStrings(await xml('xl/sharedStrings.xml'))
  return worksheetToRows(sheetDoc, sharedStrings)
}

async function firstSheetPath(xml: (path: string) => Promise<Document | null>): Promise<string | null> {
  const workbook = await xml('xl/workbook.xml')
  const rels = await xml('xl/_rels/workbook.xml.rels')
  if (workbook && rels) {
    const firstSheet = workbook.getElementsByTagName('sheet')[0]
    const rid = firstSheet?.getAttribute('r:id') ?? firstSheet?.getAttributeNS(null, 'id') ?? null
    if (rid) {
      const rel = Array.from(rels.getElementsByTagName('Relationship')).find((r) => r.getAttribute('Id') === rid)
      const target = rel?.getAttribute('Target')
      if (target) {
        const clean = target.replace(/^\//, '').replace(/^xl\//, '')
        return `xl/${clean}`
      }
    }
  }
  return 'xl/worksheets/sheet1.xml'
}

async function readSharedStrings(doc: Document | null): Promise<string[]> {
  if (!doc) return []
  return Array.from(doc.getElementsByTagName('si')).map((si) =>
    Array.from(si.getElementsByTagName('t'))
      .map((t) => t.textContent ?? '')
      .join(''),
  )
}

function worksheetToRows(sheet: Document, sharedStrings: string[]): string[][] {
  const rows: string[][] = []
  for (const rowEl of Array.from(sheet.getElementsByTagName('row'))) {
    const cells: string[] = []
    for (const cell of Array.from(rowEl.getElementsByTagName('c'))) {
      const col = columnIndex(cell.getAttribute('r'))
      const value = cellValue(cell, sharedStrings)
      if (col >= 0) cells[col] = value
    }
    const dense = Array.from(cells, (c) => c ?? '')
    if (dense.some((c) => c.trim().length > 0)) rows.push(dense)
  }
  return rows
}

function cellValue(cell: Element, sharedStrings: string[]): string {
  const type = cell.getAttribute('t')
  if (type === 'inlineStr') {
    return Array.from(cell.getElementsByTagName('t'))
      .map((t) => t.textContent ?? '')
      .join('')
      .trim()
  }
  const v = cell.getElementsByTagName('v')[0]
  const raw = v?.textContent ?? ''
  if (type === 's') {
    const idx = Number(raw)
    return (sharedStrings[idx] ?? '').trim()
  }
  return raw.trim()
}

/** `"B7"` → zero-based column index `1`. Returns -1 when unparseable. */
function columnIndex(ref: string | null): number {
  if (!ref) return -1
  const letters = ref.replace(/[0-9]/g, '').toUpperCase()
  if (!letters) return -1
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

// ---------------------------------------------------------------- ZIP reader

async function readZip(buf: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const eocd = findEocd(view, buf.length)
  if (eocd < 0) throw new Error('No EOCD record')

  const entryCount = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true)

  const decoder = new TextDecoder()
  const out = new Map<string, Uint8Array>()
  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break
    const method = view.getUint16(p + 10, true)
    const compSize = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen))

    const localNameLen = view.getUint16(localOffset + 26, true)
    const localExtraLen = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    const data = buf.subarray(dataStart, dataStart + compSize)

    out.set(name, method === 0 ? data : await inflateRaw(data))
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

function findEocd(view: DataView, len: number): number {
  const min = Math.max(0, len - 22 - 0xffff)
  for (let i = len - 22; i >= min; i--) {
    if (view.getUint32(i, true) === 0x06054b50) return i
  }
  return -1
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const stream = new Response(body).body!.pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
