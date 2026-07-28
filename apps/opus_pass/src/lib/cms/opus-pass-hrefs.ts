const LEGACY_HREFS: Array<[RegExp, string]> = [
  [/^\/invitations(?=\/|[?#]|$)/, '/digital-cards'],
  [/^\/guests(?=\/|[?#]|$)/, '/guests-and-rsvp'],
  [/^\/my\/guests(?=\/|[?#]|$)/, '/my/dashboard/guests'],
  [/^\/my\/planning(?=\/|[?#]|$)/, '/my/dashboard'],
]

export function canonicalOpusPassHref(href: string | undefined, fallback: string): string {
  const raw = href?.trim()
  const value = raw || fallback

  if (
    value.startsWith('#') ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('mailto:') ||
    value.startsWith('tel:')
  ) {
    return value
  }

  const path = value.startsWith('/') ? value : `/${value}`
  for (const [from, to] of LEGACY_HREFS) {
    if (from.test(path)) {
      return path.replace(from, to)
    }
  }

  return path
}
