/**
 * Browser-only helpers that turn an uploaded guest spreadsheet into the
 * line-based `Name, email, phone` format that `bulkImportGuests` expects.
 *
 * Supports two formats:
 *  - `.csv` (and pasted text), parsed in-place.
 *  - `.xlsx`, the Office Open XML format. An `.xlsx` file is just a ZIP archive
 *    of XML parts; we read the archive with the browser's `DecompressionStream`
 *    (no third-party dependency) and pull every worksheet's cells out, then
 *    concatenate the guest rows from all sheets.
 *
 * These functions rely on browser APIs (`DOMParser`, `DecompressionStream`,
 * `File`), so this module must only ever be imported by client components.
 */

/** Friendly error surfaced to the user when a file can't be read. */
export class SpreadsheetError extends Error {}

/**
 * Read an uploaded file (`.csv` or `.xlsx`) and return the rows in the
 * `Name, email, phone` per-line format. Dispatches on the file's extension /
 * MIME type. Throws {@link SpreadsheetError} with a user-facing message on
 * unsupported or unreadable files.
 */
export async function fileToImportLines(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  const isXlsx =
    name.endsWith('.xlsx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

  // The legacy binary `.xls` (BIFF) format isn't supported by this parser.
  if (name.endsWith('.xls')) {
    throw new SpreadsheetError('Old .xls files aren’t supported — please re-save as .xlsx or .csv.')
  }

  if (isXlsx) {
    const sheets = await parseXlsx(file)
    return sheets
      .map((rows) => rowsToImportLines(rows))
      .filter((lines) => lines.length > 0)
      .join('\n')
  }

  const text = (await file.text()).replace(/\r\n?/g, '\n').trim()
  return rowsToImportLines(parseCsv(text))
}

/** A row is a header if any cell mentions name/email/phone. */
function isHeaderRow(cells: string[]): boolean {
  const lc = cells.map((c) => c.toLowerCase())
  return (
    lc.some((c) => /(^|\b)(name|full ?name)\b/.test(c)) ||
    lc.some((c) => c.includes('email')) ||
    lc.some((c) => c.includes('phone'))
  )
}

/**
 * Convert a table of cells into the line-based format `bulkImportGuests`
 * expects. Locates the header row — which may sit below title/description
 * preamble rows that real-world workbooks often carry — and maps the Name,
 * Email and Phone columns by their header text, ignoring any other columns
 * (Guest ID, Title, RSVP Status, …). Without a header it falls back to the
 * documented paste order: `Name, email, phone`.
 */
export function rowsToImportLines(rows: string[][]): string {
  if (rows.length === 0) return ''

  // Scan the first several rows for the header — spreadsheets frequently have
  // a title/description block above the actual column labels.
  let headerIdx = -1
  const scanLimit = Math.min(rows.length, 20)
  for (let i = 0; i < scanLimit; i++) {
    if (isHeaderRow(rows[i])) {
      headerIdx = i
      break
    }
  }

  let nameIdx = 0
  let emailIdx = 1
  let phoneIdx = 2
  let dataRows = rows
  if (headerIdx >= 0) {
    const header = rows[headerIdx].map((c) => c.toLowerCase())
    const colIndex = (matchers: RegExp[]) =>
      header.findIndex((c) => matchers.some((re) => re.test(c)))
    const n = colIndex([/(^|\b)name\b/, /full ?name/])
    // Only use columns we actually matched; -1 leaves the field blank rather
    // than grabbing an unrelated column (e.g. "Title" when there's no phone).
    nameIdx = n >= 0 ? n : 0
    emailIdx = colIndex([/email/])
    phoneIdx = colIndex([/phone|mobile|whatsapp/])
    dataRows = rows.slice(headerIdx + 1)
  }

  return dataRows
    .map((cols) => {
      const name = (cols[nameIdx] ?? '').trim()
      const email = (cols[emailIdx] ?? '').trim()
      const phone = (cols[phoneIdx] ?? '').trim()
      if (!name) return null
      // Keep positions intact — `bulkImportGuests` splits on comma into
      // [name, email, phone], so an empty email must stay an empty slot rather
      // than collapsing the phone into the email field. Only trailing empty
      // fields are trimmed off.
      const fields = [name, email, phone]
      while (fields.length > 1 && fields[fields.length - 1] === '') fields.pop()
      return fields.join(', ')
    })
    .filter((line): line is string => line !== null)
    .join('\n')
}

/** Parse RFC-4180-ish CSV. Tolerates quoted fields and `""` escapes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0))
}

// ---------------------------------------------------------------- XLSX

/**
 * Parse every worksheet of an `.xlsx` file into tables of cell strings — one
 * table per sheet, in workbook order. Reads the ZIP container by hand and
 * inflates entries with the browser's `DecompressionStream`, then reads the
 * shared-string table and each worksheet referenced by the workbook.
 */
async function parseXlsx(file: File): Promise<string[][][]> {
  if (typeof DecompressionStream === 'undefined') {
    throw new SpreadsheetError(
      'Your browser can’t read .xlsx files — please use a CSV, or paste the names instead.'
    )
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

  // Resolve every worksheet via the workbook → rels chain, falling back to
  // the conventional `xl/worksheets/sheet1.xml` path.
  const sheetPaths = await allSheetPaths(xml)
  const sharedStrings = await readSharedStrings(await xml('xl/sharedStrings.xml'))

  const sheets: string[][][] = []
  for (const sheetPath of sheetPaths) {
    const sheetDoc = await xml(sheetPath)
    if (sheetDoc) sheets.push(worksheetToRows(sheetDoc, sharedStrings))
  }
  if (sheets.length === 0) {
    throw new SpreadsheetError('Couldn’t find a worksheet in that .xlsx file.')
  }
  return sheets
}

/** Find the paths of every worksheet in the workbook, in workbook order. */
async function allSheetPaths(
  xml: (path: string) => Promise<Document | null>
): Promise<string[]> {
  const relationshipsNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const workbook = await xml('xl/workbook.xml')
  const rels = await xml('xl/_rels/workbook.xml.rels')
  if (workbook && rels) {
    const relByRid = new Map(
      Array.from(rels.getElementsByTagName('Relationship')).map((r) => [
        r.getAttribute('Id'),
        r.getAttribute('Target'),
      ])
    )
    const paths = Array.from(workbook.getElementsByTagName('sheet'))
      .map((sheet) => {
        const rid =
          sheet.getAttribute('r:id') ??
          sheet.getAttributeNS(relationshipsNs, 'id') ??
          sheet.getAttribute('id')
        const target = rid ? relByRid.get(rid) : null
        if (!target) return null
        return resolveWorkbookTarget(target)
      })
      .filter((p): p is string => p !== null)
    if (paths.length > 0) return paths
  }
  return ['xl/worksheets/sheet1.xml']
}

function resolveWorkbookTarget(target: string): string {
  const fromPackageRoot = target.replace(/^\//, '')
  const path =
    target.startsWith('/') || fromPackageRoot.startsWith('xl/')
      ? fromPackageRoot
      : `xl/${fromPackageRoot}`
  return normalizePackagePath(path)
}

function normalizePackagePath(path: string): string {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return parts.join('/')
}

/** Read the workbook's shared-string table into an indexable array. */
async function readSharedStrings(doc: Document | null): Promise<string[]> {
  if (!doc) return []
  return Array.from(doc.getElementsByTagName('si')).map((si) =>
    // A shared string is either a single <t> or several <r><t> runs.
    Array.from(si.getElementsByTagName('t'))
      .map((t) => t.textContent ?? '')
      .join('')
  )
}

/** Turn a worksheet document into a dense table of trimmed cell strings. */
function worksheetToRows(sheet: Document, sharedStrings: string[]): string[][] {
  const rows: string[][] = []
  for (const rowEl of Array.from(sheet.getElementsByTagName('row'))) {
    const cells: string[] = []
    for (const cell of Array.from(rowEl.getElementsByTagName('c'))) {
      const col = columnIndex(cell.getAttribute('r'))
      const value = cellValue(cell, sharedStrings)
      if (col >= 0) cells[col] = value
    }
    // Normalise sparse arrays (skipped columns) to empty strings.
    const dense = Array.from(cells, (c) => c ?? '')
    if (dense.some((c) => c.trim().length > 0)) rows.push(dense)
  }
  return rows
}

/** Extract a cell's display string, resolving shared-string references. */
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

/**
 * Read a ZIP archive into a map of `path → bytes`. Supports stored (method 0)
 * and deflate (method 8) entries, which is everything `.xlsx` uses.
 */
async function readZip(buf: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const eocd = findEocd(view, buf.length)
  if (eocd < 0) throw new Error('No EOCD record')

  const entryCount = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true) // start of central directory

  const decoder = new TextDecoder()
  const out = new Map<string, Uint8Array>()
  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break // central dir signature
    const method = view.getUint16(p + 10, true)
    const compSize = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen))

    // Jump to the local header to find where the entry's data actually starts.
    const localNameLen = view.getUint16(localOffset + 26, true)
    const localExtraLen = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    const data = buf.subarray(dataStart, dataStart + compSize)

    out.set(name, method === 0 ? data : await inflateRaw(data))
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

/** Locate the End Of Central Directory record by scanning backwards. */
function findEocd(view: DataView, len: number): number {
  // EOCD is 22 bytes + up to a 64KB comment; scan back from the end.
  const min = Math.max(0, len - 22 - 0xffff)
  for (let i = len - 22; i >= min; i--) {
    if (view.getUint32(i, true) === 0x06054b50) return i
  }
  return -1
}

/** Inflate a raw DEFLATE byte stream using the browser's DecompressionStream. */
async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(bytes).body!.pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
