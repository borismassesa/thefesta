export interface GuestImportRow {
  full_name: string
  email: string | null
  phone: string | null
  max_party_size: number
}

function importedPartySize(ticketType: string | undefined): number {
  const value = ticketType?.trim().toLowerCase()
  return value === 'double' || value === 'couple' || value === 'mbili' ? 2 : 1
}

/** Parse the browser importer's positional transport format. */
export function parseGuestImportRows(text: string): GuestImportRow[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [full_name, email, phone, ticketType] = line.split(',').map((part) => part.trim())
      return {
        full_name,
        email: email || null,
        phone: phone || null,
        max_party_size: importedPartySize(ticketType),
      }
    })
    .filter((row) => row.full_name)
}
