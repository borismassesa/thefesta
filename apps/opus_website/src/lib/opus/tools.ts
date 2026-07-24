import 'server-only'
import { auth, currentUser } from '@clerk/nextjs/server'
import { createSupabaseServerClient } from '@/lib/supabase'

// Action tools that let Opus read the SIGNED-IN user's own account data.
//
// Security boundary: the caller's identity (email) is resolved server-side from
// the Clerk session and is the ONLY thing used to scope queries. The model's
// tool arguments never carry identity, so Opus can never read another user's
// records. Tools are only offered to authenticated requests.

export type OpenAITool = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** The signed-in user's primary email (lowercased), or null if signed out. */
export async function getAuthedEmail(): Promise<string | null> {
  try {
    const { userId } = await auth()
    if (!userId) return null
    const user = await currentUser()
    const email =
      user?.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ||
      user?.emailAddresses[0]?.emailAddress
    return email ? email.toLowerCase() : null
  } catch {
    return null
  }
}

export const OPUS_TOOLS: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'get_my_inquiries',
      description:
        "Look up the signed-in user's own vendor inquiries (quote requests) with their current status, the vendor, event date and location. Use when the user asks about their inquiries, quotes, requests, or the status of a vendor they contacted.",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
]

const INQUIRY_STATUS_LABEL: Record<string, string> = {
  pending: 'Sent, awaiting vendor',
  new: 'Sent, awaiting vendor',
  viewed: 'Viewed by vendor',
  responded: 'Vendor responded',
  quoted: 'Quote received',
  accepted: 'Accepted',
  declined: 'Declined',
  closed: 'Closed',
}

/**
 * Execute a tool. `email` is the authenticated caller and is the sole scope key.
 * Returns a JSON string suitable to hand back to the model as a tool result.
 */
export async function runTool(
  name: string,
  _args: unknown,
  email: string,
): Promise<string> {
  try {
    const sb = createSupabaseServerClient()
    if (name === 'get_my_inquiries') {
      const { data, error } = await sb
        .from('inquiries')
        .select('vendor_name, status, created_at, event_date, location, guest_count')
        .eq('email', email)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) return JSON.stringify({ error: 'Could not load inquiries right now.' })
      if (!data || data.length === 0) {
        return JSON.stringify({ inquiries: [], note: 'No inquiries found for this account.' })
      }
      return JSON.stringify({
        inquiries: data.map((r) => ({
          vendor: r.vendor_name,
          status: INQUIRY_STATUS_LABEL[(r.status as string) ?? ''] ?? r.status,
          sent: r.created_at,
          eventDate: r.event_date,
          location: r.location,
          guests: r.guest_count,
        })),
      })
    }
    return JSON.stringify({ error: `Unknown tool: ${name}` })
  } catch {
    return JSON.stringify({ error: 'Tool execution failed.' })
  }
}
