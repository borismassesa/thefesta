// Renders the light markdown Opus produces (**bold**, [label](url), bare URLs,
// and line breaks) as safe React nodes. No dependency, no dangerouslySetInnerHTML.

const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s)]+)/g

function Anchor({ href, children }: { href: string; children: React.ReactNode }) {
  const external = /^https?:\/\//i.test(href)
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className="font-semibold text-[#7E5896] underline underline-offset-2 hover:text-[#5f4270]"
    >
      {children}
    </a>
  )
}

function parseInline(line: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  INLINE.lastIndex = 0
  while ((m = INLINE.exec(line)) !== null) {
    if (m.index > last) out.push(line.slice(last, m.index))
    if (m[1] !== undefined) out.push(<strong key={key++}>{m[1]}</strong>)
    else if (m[2] !== undefined && m[3] !== undefined)
      out.push(
        <Anchor key={key++} href={m[3]}>
          {m[2]}
        </Anchor>,
      )
    else if (m[4] !== undefined)
      out.push(
        <Anchor key={key++} href={m[4]}>
          {m[4]}
        </Anchor>,
      )
    last = m.index + m[0].length
  }
  if (last < line.length) out.push(line.slice(last))
  return out
}

export default function RichText({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        const trimmed = line.trimStart()
        const bullet = /^[-*]\s+/.test(trimmed)
        const numbered = /^\d+\.\s+/.test(trimmed)
        if (bullet) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-current opacity-50" />
              <span>{parseInline(trimmed.replace(/^[-*]\s+/, ''))}</span>
            </div>
          )
        }
        if (numbered) {
          const n = trimmed.match(/^(\d+)\./)?.[1]
          return (
            <div key={i} className="flex gap-2">
              <span className="shrink-0 font-semibold opacity-60">{n}.</span>
              <span>{parseInline(trimmed.replace(/^\d+\.\s+/, ''))}</span>
            </div>
          )
        }
        if (trimmed === '') return <div key={i} className="h-1" />
        return <div key={i}>{parseInline(line)}</div>
      })}
    </div>
  )
}
