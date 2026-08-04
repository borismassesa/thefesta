/**
 * Browser-only helpers that turn an uploaded guest spreadsheet into the
 * line-based `Name, email, phone, ticket type` format that
 * `bulkImportGuests` expects.
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

export interface SpreadsheetImportResult {
  lines: string
  guestCount: number
  importedSheets: string[]
  skippedSheets: string[]
}

type ParsedSheet = { name: string; rows: string[][] }

function importResult(
  sheets: { name: string; lines: string }[],
): SpreadsheetImportResult {
  const imported = sheets.filter((sheet) => sheet.lines.length > 0)
  const lines = imported.map((sheet) => sheet.lines).join('\n')
  return {
    lines,
    guestCount: lines ? lines.split('\n').filter(Boolean).length : 0,
    importedSheets: imported.map((sheet) => sheet.name),
    skippedSheets: sheets.filter((sheet) => sheet.lines.length === 0).map((sheet) => sheet.name),
  }
}

/**
 * Read an uploaded file (`.csv` or `.xlsx`) and return the rows in the
 * `Name, email, phone, ticket type` per-line format. Dispatches on the file's extension /
 * MIME type. Throws {@link SpreadsheetError} with a user-facing message on
 * unsupported or unreadable files.
 */
export async function fileToImportLines(file: File): Promise<string> {
  return (await fileToImportResult(file)).lines
}

/** Read a file and report exactly which worksheets contributed guest rows. */
export async function fileToImportResult(file: File): Promise<SpreadsheetImportResult> {
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
    // A workbook with multiple sheets is often guest-list tabs alongside
    // unrelated ones (Budget, Instructions, Seating). The headerless
    // "column 0/1/2 = name/email/phone" fallback below is safe for a single
    // sheet a couple pasted/exported directly, but applying it to EVERY
    // sheet in a multi-tab workbook would misread a non-guest tab's rows as
    // guest names. Only merge sheets that declare themselves via a real
    // header row once there's more than one to choose from.
    const requireHeader = sheets.length > 1
    return importResult(
      sheets.map((sheet) => ({
        name: sheet.name,
        lines: rowsToImportLines(sheet.rows, requireHeader),
      })),
    )
  }

  const text = (await file.text()).replace(/\r\n?/g, '\n').trim()
  return importResult([{ name: file.name, lines: rowsToImportLines(parseCsv(text)) }])
}

type HeaderRole = 'name' | 'email' | 'phone' | 'ticket'

/** Accepted labels are deliberately exact after normalization. Prose such as
 * "Duplicate Name" and "With a phone number" belongs to review/summary
 * sheets and must never promote those sheets into guest lists. */
const HEADER_LABELS: Record<HeaderRole, ReadonlySet<string>> = {
  name: new Set(['name', 'full name', 'guest name', 'guest full name', 'jina', 'jina kamili', 'majina']),
  email: new Set(['email', 'email address', 'barua pepe', 'anwani ya barua pepe']),
  phone: new Set(['phone', 'phone number', 'mobile', 'mobile number', 'whatsapp', 'whatsapp number', 'simu', 'namba', 'namba ya simu', 'namba ya whatsapp']),
  ticket: new Set(['ticket', 'ticket type', 'invitation type', 'aina ya tiketi']),
}

/** Footer labels that close a guest list rather than name a guest. */
const TOTALS_LABEL = /^(jumla|total|totals|grand total|sum)\b/

/** Lowercase a cell and drop the decoration real headers carry: `WhatsApp (+255)` → `whatsapp`. */
function normalizeLabel(cell: string): string {
  return cell
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[?:*.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function headerRole(cell: string): HeaderRole | null {
  const label = normalizeLabel(cell)
  for (const role of Object.keys(HEADER_LABELS) as HeaderRole[]) {
    if (HEADER_LABELS[role].has(label)) return role
  }
  return null
}

/**
 * A guest header must contain a recognized Name/Jina column. Phone, email and
 * ticket type are optional, but cannot identify a guest sheet on their own.
 */
function isHeaderRow(cells: string[]): boolean {
  return cells.some((cell) => headerRole(cell) === 'name')
}

/**
 * Convert a table of cells into the line-based format `bulkImportGuests`
 * expects. Locates the header row — which may sit below title/description
 * preamble rows that real-world workbooks often carry — and maps the Name,
 * Email, Phone and Ticket Type columns by their header text, ignoring other columns
 * (Guest ID, Title, RSVP Status, …). Without a header it falls back to the
 * documented paste order: `Name, email, phone, ticket type`.
 */
export function rowsToImportLines(rows: string[][], requireHeader = false): string {
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

  // Called with requireHeader when merging multiple worksheets — a sheet
  // with no recognizable header is more likely an unrelated tab than a
  // genuine headerless guest list, so skip it rather than guessing.
  if (headerIdx === -1 && requireHeader) return ''

  let nameIdx = 0
  let emailIdx = 1
  let phoneIdx = 2
  let ticketIdx = -1
  let dataRows = rows
  if (headerIdx >= 0) {
    const header = rows[headerIdx]
    const colIndex = (role: HeaderRole) => header.findIndex((cell) => headerRole(cell) === role)
    const n = colIndex('name')
    // Only use columns we actually matched; -1 leaves the field blank rather
    // than grabbing an unrelated column (e.g. "Title" when there's no phone).
    nameIdx = n >= 0 ? n : 0
    emailIdx = colIndex('email')
    phoneIdx = colIndex('phone')
    ticketIdx = colIndex('ticket')
    dataRows = rows.slice(headerIdx + 1)
  }

  return dataRows
    .map((cols) => {
      const name = (cols[nameIdx] ?? '').trim()
      const email = (cols[emailIdx] ?? '').trim()
      const phone = (cols[phoneIdx] ?? '').trim()
      const ticket = (cols[ticketIdx] ?? '').trim()
      if (!name) return null
      // Guest lists usually close with a totals row ("JUMLA", "Total") whose
      // only other cell is a count — it would import as a guest named JUMLA.
      if (!email && !phone && TOTALS_LABEL.test(normalizeLabel(name))) return null
      // Keep positions intact — `bulkImportGuests` splits on comma into
      // [name, email, phone, ticket type], so an empty email must stay an empty slot rather
      // than collapsing the phone into the email field. Only trailing empty
      // fields are trimmed off.
      const fields = [name, email, phone, ticket]
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
async function parseXlsx(file: File): Promise<ParsedSheet[]> {
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
  const sheetRefs = await allSheetRefs(xml)
  const sharedStrings = await readSharedStrings(await xml('xl/sharedStrings.xml'))

  const sheets: ParsedSheet[] = []
  for (const sheetRef of sheetRefs) {
    const sheetDoc = await xml(sheetRef.path)
    if (sheetDoc) sheets.push({ name: sheetRef.name, rows: worksheetToRows(sheetDoc, sharedStrings) })
  }
  if (sheets.length === 0) {
    throw new SpreadsheetError('Couldn’t find a worksheet in that .xlsx file.')
  }
  return sheets
}

/** Find the paths of every worksheet in the workbook, in workbook order. */
async function allSheetRefs(
  xml: (path: string) => Promise<Document | null>
): Promise<{ name: string; path: string }[]> {
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
    const refs = Array.from(workbook.getElementsByTagName('sheet'))
      .map((sheet, index) => {
        const rid =
          sheet.getAttribute('r:id') ??
          sheet.getAttributeNS(relationshipsNs, 'id') ??
          sheet.getAttribute('id')
        const target = rid ? relByRid.get(rid) : null
        if (!target) return null
        return {
          name: sheet.getAttribute('name')?.trim() || `Sheet ${index + 1}`,
          path: resolveWorkbookTarget(target),
        }
      })
      .filter((ref): ref is { name: string; path: string } => ref !== null)
    if (refs.length > 0) return refs
  }
  return [{ name: 'Sheet 1', path: 'xl/worksheets/sheet1.xml' }]
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
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const stream = new Response(body).body!.pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
