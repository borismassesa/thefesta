// Shared chrome for every transactional email the website sends.
//
// Mirrors apps/opus_admin/src/lib/email-shell.ts (the canonical brand shell):
// wordmark header, single lavender accent, dark-mode rules, Outlook-safe
// buttons and a tinted detail card. The argument shape is unchanged so the
// existing templates keep working; `intro` and `closing` are still raw HTML
// (callers escape their own interpolations), everything else is escaped here.

export const BRAND = {
  // Single lavender accent — matches `--accent` in the website + vendors_portal.
  accent: '#C9A0DC',
  onAccent: '#1A1A1A',
  accentTintWash: '#FCF7FF',
  accentTintPale: '#F0DFF6',
  ink: {
    primary: '#1A1A1A',
    secondary: '#333333',
    muted: '#666666',
    line: '#E6E6E6',
  },
  surface: {
    page: '#FAFAF8',
    card: '#FFFFFF',
  },
} as const

// Tones for the optional status pill. Sage is reserved for success states
// (the Emerald Principle), so an alert uses `warning` / `negative`.
const BADGE_TONES = {
  positive: { fg: '#3F8B5C', bg: '#E8FBDB', border: '#3F8B5C33' },
  negative: { fg: '#B91C1C', bg: '#FDECEC', border: '#B91C1C33' },
  warning: { fg: '#B07F2C', bg: '#FCE9C2', border: '#B07F2C33' },
  info: { fg: '#7E5896', bg: BRAND.accentTintWash, border: BRAND.accentTintPale },
} as const

export type BadgeTone = keyof typeof BADGE_TONES

// Coerces rather than trusting the annotation: these values come from DB rows
// and JSON payloads that are typed loosely upstream, and a thrown TypeError
// here loses the whole notification. Nullish renders as empty, not "null".
export function escapeHtml(value: string): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function plaintextLines(lines: Array<string | null | undefined>): string {
  return lines.filter((line): line is string => typeof line === 'string').join('\n')
}

// Recipients are external (Gmail, Apple Mail), so the wordmark must be on a
// publicly reachable URL — a localhost dev URL renders as a broken image.
function logoUrl(): string {
  return (
    process.env.EMAIL_LOGO_URL?.trim() ||
    'https://www.opusfesta.com/assets/logo/opusfesta-logo-black.png'
  )
}

// Hidden preheader: the grey snippet next to the subject in the inbox list.
// The trailing padding stops Gmail from pulling body HTML into the snippet.
function preheaderHtml(text: string): string {
  if (!text) return ''
  const padding = '&zwnj;&nbsp;'.repeat(120)
  return `<div style="display:none !important;visibility:hidden;mso-hide:all;font-size:1px;color:${BRAND.surface.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(text)}${padding}</div>`
}

// MSO conditional VML so Outlook 2007-2019 renders a pill instead of dropping
// the background and showing bare text.
function bulletproofButton(href: string, label: string): string {
  const h = escapeHtml(href)
  const l = escapeHtml(label)
  return `
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
      href="${h}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="50%" stroke="f"
      fillcolor="${BRAND.accent}">
      <w:anchorlock/>
      <center style="color:${BRAND.onAccent};font-family:sans-serif;font-size:14px;font-weight:700;">${l}</center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-- -->
    <a href="${h}" style="display:inline-block;background:${BRAND.accent};color:${BRAND.onAccent};text-decoration:none;font-weight:700;font-size:14px;line-height:1;padding:14px 26px;border-radius:999px;mso-padding-alt:0;">${l}</a>
    <!--<![endif]-->`
}

export function renderEmail(args: {
  heading: string
  preheader: string
  /** Raw HTML — callers escape their own interpolations. */
  intro: string
  /** Uppercase label in the header strip. Defaults to "Notification". */
  eyebrow?: string
  /** Status pill under the heading, e.g. urgency on a support alert. */
  badge?: { label: string; tone: BadgeTone }
  /** Someone else's words, rendered as a pull quote above the detail rows. */
  quote?: string
  /** Optional eyebrow above the pull quote, e.g. "Client message". */
  quoteLabel?: string
  rows?: Array<{ label: string; value: string }>
  cta?: { href: string; label: string }
  /** Raw HTML — callers escape their own interpolations. */
  closing?: string
  /** Overrides the default footer explanation line. */
  footerNote?: string
}): string {
  const badgeTone = args.badge ? BADGE_TONES[args.badge.tone] : null
  const badge =
    args.badge && badgeTone
      ? `<tr><td class="px-32" style="padding:14px 32px 0;"><span style="display:inline-block;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:700;color:${badgeTone.fg};background:${badgeTone.bg};border:1px solid ${badgeTone.border};padding:5px 12px;border-radius:999px;">${escapeHtml(args.badge.label)}</span></td></tr>`
      : ''

  const quoteLabel = args.quoteLabel
    ? `<p class="ink-muted" style="margin:0 0 8px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:700;color:${BRAND.ink.muted};">${escapeHtml(args.quoteLabel)}</p>`
    : ''
  // pre-line keeps the sender's own line breaks; the text is escaped, so it
  // cannot smuggle markup in through them.
  const quote = args.quote
    ? `<tr><td class="px-32" style="padding:18px 32px 0;">${quoteLabel}<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:2px 0 2px 16px;border-left:3px solid ${BRAND.accent};"><p class="ink-secondary" style="margin:0;font-size:16px;line-height:1.6;font-style:italic;white-space:pre-line;color:${BRAND.ink.secondary};">&ldquo;${escapeHtml(args.quote)}&rdquo;</p></td></tr></table></td></tr>`
    : ''

  // Two-column rows so the labels line up instead of running inline with the
  // values, wrapped in a tinted card so details read as a block, not a list.
  const rowsHtml = (args.rows ?? [])
    .map(
      (row) =>
        `<tr>
          <td valign="top" class="ink-muted" style="padding:5px 14px 5px 0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-weight:700;color:${BRAND.ink.muted};white-space:nowrap;">${escapeHtml(row.label)}</td>
          <td valign="top" class="ink-primary" style="padding:5px 0;font-size:14px;line-height:1.6;color:${BRAND.ink.primary};">${escapeHtml(row.value)}</td>
        </tr>`,
    )
    .join('')
  const rows = rowsHtml
    ? `<tr><td class="px-32" style="padding:18px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg-tint border-tint" style="background:${BRAND.accentTintWash};border:1px solid ${BRAND.accentTintPale};border-radius:12px;"><tr><td style="padding:14px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rowsHtml}</table></td></tr></table></td></tr>`
    : ''

  const cta = args.cta
    ? `<tr><td align="center" class="px-32" style="padding:24px 32px 0;">${bulletproofButton(args.cta.href, args.cta.label)}</td></tr>`
    : ''

  const closing = args.closing
    ? `<tr><td class="px-32" style="padding:20px 32px 0;"><p class="ink-secondary" style="margin:0;font-size:14px;line-height:1.65;color:${BRAND.ink.secondary};">${args.closing}</p></td></tr>`
    : ''

  const footerNote = args.footerNote ?? 'This is an automated message from OpusFesta.'

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>${escapeHtml(args.heading)}</title>
    <style>
      @media (prefers-color-scheme: dark) {
        body, .bg-page { background:#1A1718 !important; }
        .bg-card { background:#262122 !important; }
        .bg-tint { background:#2E2730 !important; }
        .border-tint { border-color:#3F3542 !important; }
        .ink-primary { color:#F5F2F4 !important; }
        .ink-secondary { color:#D7CFD3 !important; }
        .ink-muted { color:#A39CA0 !important; }
        .border-line { border-color:#3A3335 !important; }
      }
      @media (max-width: 600px) {
        .container { width:100% !important; max-width:100% !important; }
        .px-32 { padding-left:20px !important; padding-right:20px !important; }
      }
      a { color:${BRAND.ink.primary}; }
    </style>
  </head>
  <body class="bg-page" style="margin:0;padding:0;background:${BRAND.surface.page};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink.primary};">
    ${preheaderHtml(args.preheader)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg-page" style="background:${BRAND.surface.page};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" class="container bg-card" style="width:100%;max-width:560px;background:${BRAND.surface.card};border:1px solid ${BRAND.ink.line};border-radius:18px;overflow:hidden;">
            <tr>
              <!-- Letterhead strip stays light in both colour schemes: the only
                   wordmark asset is black, so a dark header would erase it. -->
              <td class="px-32" style="padding:24px 32px 18px;background:${BRAND.surface.card};border-bottom:1px solid ${BRAND.ink.line};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td valign="middle">
                      <img src="${escapeHtml(logoUrl())}" alt="OpusFesta" width="140" style="display:block;width:140px;max-width:140px;height:auto;border:0;outline:none;text-decoration:none;" />
                    </td>
                    <td valign="middle" align="right" style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:700;color:${BRAND.ink.muted};">${escapeHtml(args.eyebrow ?? 'Notification')}</td>
                  </tr>
                </table>
              </td>
            </tr>
            ${badge}
            <tr>
              <td class="px-32" style="padding:${args.badge ? '12px' : '24px'} 32px 0;">
                <h1 class="ink-primary" style="margin:0;font-size:23px;line-height:1.3;font-weight:600;letter-spacing:-0.01em;color:${BRAND.ink.primary};">${escapeHtml(args.heading)}</h1>
              </td>
            </tr>
            <tr>
              <td class="px-32 ink-secondary" style="padding:12px 32px 0;font-size:15px;line-height:1.65;color:${BRAND.ink.secondary};">${args.intro}</td>
            </tr>
            ${quote}
            ${rows}
            ${cta}
            ${closing}
            <tr><td style="font-size:0;line-height:0;height:28px;">&nbsp;</td></tr>
            <tr>
              <td class="px-32 border-line" style="padding:20px 32px 22px;border-top:1px solid ${BRAND.ink.line};">
                <p class="ink-muted" style="margin:0;font-size:12px;line-height:1.65;color:${BRAND.ink.muted};">OpusFesta &middot; Dar es Salaam, Tanzania</p>
                <p class="ink-muted" style="margin:6px 0 0;font-size:12px;line-height:1.65;color:${BRAND.ink.muted};">${escapeHtml(footerNote)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim()
}
