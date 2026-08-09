/**
 * The OpusFesta letterhead, in HTML.
 *
 * Every document the company files carries the same masthead: logo and
 * tagline left, registered-office block right, an accent rule, then a
 * title / date block — and the same two-column footer closed by an accent
 * bar. The server-rendered PDFs build it out of @react-pdf primitives
 * (lib/report-pdf.tsx, lib/tracker-pdf.tsx); this is that one design for
 * the reports that reach paper through the browser's Print / Save as PDF.
 * Any surface that prints uses these two components rather than inventing
 * a header of its own — keep them in step with the PDF files above.
 */

/** Letterhead purple. The same value the @react-pdf documents use. */
export const LETTERHEAD_ACCENT = '#6B4E8C'

const LOGO_URL = 'https://www.opusfesta.com/assets/logo/opusfesta-logo-black.png'

export interface LetterheadMeta {
  label: string
  value: string
}

/**
 * Long-form date for the meta block: "8 August 2026".
 *
 * A bare YYYY-MM-DD is read as a calendar date, not an instant — parsing it
 * through Date() would shift it a day west of UTC.
 */
export function formatLetterheadDate(value: string): string {
  if (!value) return '—'
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const d = dateOnly
    ? (() => {
        const [y, m, day] = value.split('-').map(Number)
        return new Date(y, m - 1, day)
      })()
    : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function CompanyBlock({ small }: { small?: boolean }) {
  return (
    <div className={`text-right ${small ? 'text-[10px] leading-tight' : 'text-[11px] leading-snug'} text-gray-600`}>
      <p className="font-bold" style={{ color: LETTERHEAD_ACCENT }}>
        OpusFesta Company Limited
      </p>
      <p>Samaki Wabichi Annex, Mbezi Beach,</p>
      <p>P.O.Box 7787 Dar es Salaam, Tanzania</p>
      <p>info@opusfesta.com | www.opusfesta.com</p>
    </div>
  )
}

/**
 * Masthead plus the title / date block every report opens with. `meta` is
 * rendered as "Label: value" lines in the order given — Date first, by
 * convention, so a filed report is identifiable from its first two lines.
 */
export function PrintLetterhead({
  title,
  subtitle,
  meta = [],
}: {
  title: string
  subtitle?: string
  meta?: LetterheadMeta[]
}) {
  return (
    <header className="print-letterhead">
      <div
        className="flex items-start justify-between gap-6 border-b-2 pb-4"
        style={{ borderColor: LETTERHEAD_ACCENT }}
      >
        <div className="flex flex-col">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_URL} alt="OpusFesta" className="h-12 w-auto object-contain" />
          <span
            className="mt-1 text-[8px] font-semibold tracking-[0.25em] uppercase"
            style={{ color: LETTERHEAD_ACCENT }}
          >
            Plan Less, Celebrate More
          </span>
        </div>
        <CompanyBlock />
      </div>

      <div className="mt-6">
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-gray-600">{subtitle}</p> : null}
        {meta.length > 0 ? (
          <dl className="mt-3 space-y-0.5 text-sm text-gray-700">
            {meta.map((row) => (
              <div key={row.label} className="flex gap-1.5">
                <dt className="font-semibold">{row.label}:</dt>
                <dd className="min-w-0">{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </header>
  )
}

/** Closing letterhead: office block, contact block, accent bar. */
export function PrintLetterheadFooter({ className = '' }: { className?: string }) {
  return (
    <footer className={`print-letterhead-footer ${className}`}>
      <div className="flex items-start justify-between gap-6 border-t border-gray-200 pt-3 pb-3 text-[10px] leading-snug text-gray-500">
        <div>
          <p className="font-bold" style={{ color: LETTERHEAD_ACCENT }}>
            OpusFesta Company Limited
          </p>
          <p>Samaki Wabichi Annex, Mbezi Beach</p>
          <p>P.O.Box 7787 Dar es Salaam, Tanzania</p>
        </div>
        <div className="text-right">
          <p className="font-bold" style={{ color: LETTERHEAD_ACCENT }}>
            www.opusfesta.com
          </p>
          <p>info@opusfesta.com | +255 799 242 475</p>
        </div>
      </div>
      <div className="h-1 rounded-full" style={{ background: LETTERHEAD_ACCENT }} />
    </footer>
  )
}
