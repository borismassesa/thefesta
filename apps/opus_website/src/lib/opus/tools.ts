import 'server-only'
import { auth, currentUser } from '@clerk/nextjs/server'
import { createSupabaseServerClient } from '@/lib/supabase'

// Action tools that let Opus read the SIGNED-IN user's own account data.
//
// Security boundary: the caller's identity is resolved server-side from the
// Clerk session (email + the internal users.id) and is the ONLY thing used to
// scope queries. The model's tool arguments never carry identity, so Opus can
// never read another user's records. Tools are only offered to authenticated
// requests.

export type OpenAITool = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type AuthedContext = {
  email: string
  usersId: string | null
  name: string | null
  phone: string | null
}

/** Resolve the signed-in caller to {email, users.id, name, phone}, or null. */
export async function getAuthedContext(): Promise<AuthedContext | null> {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return null
    const user = await currentUser()
    const email =
      user?.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ||
      user?.emailAddresses[0]?.emailAddress
    if (!email) return null
    const lower = email.toLowerCase()
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || null
    const phone = user?.primaryPhoneNumber?.phoneNumber ?? null

    let usersId: string | null = null
    try {
      const sb = createSupabaseServerClient()
      const { data } = await sb
        .from('users')
        .select('id')
        .or(`clerk_id.eq.${clerkId},email.eq.${lower}`)
        .limit(1)
        .maybeSingle()
      usersId = (data?.id as string) ?? null
    } catch {
      /* users.id optional; email-scoped tools still work */
    }
    return { email: lower, usersId, name, phone }
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
  {
    type: 'function',
    function: {
      name: 'get_my_wedding_details',
      description:
        "Look up the signed-in user's own wedding profile: partner names, wedding date, city, guest count, budget range, and whether their wedding website is published. Use when they ask about their wedding date, their details, or their website.",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_saved_vendors',
      description:
        "List the vendors the signed-in user has saved / shortlisted. Use when they ask about their saved vendors, shortlist, or favourites.",
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
 * Execute a tool. `ctx` is the authenticated caller and is the sole scope key.
 * Returns a JSON string to hand back to the model as a tool result.
 */
export async function runTool(
  name: string,
  _args: unknown,
  ctx: AuthedContext,
): Promise<string> {
  try {
    const sb = createSupabaseServerClient()

    if (name === 'get_my_inquiries') {
      const { data, error } = await sb
        .from('inquiries')
        .select('vendor_name, status, created_at, event_date, location, guest_count')
        .eq('email', ctx.email)
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

    if (name === 'get_my_wedding_details') {
      if (!ctx.usersId) return JSON.stringify({ note: 'No wedding profile found for this account.' })
      const { data, error } = await sb
        .from('couple_profiles')
        .select(
          'partner1_name, partner2_name, wedding_date, date_undecided, guest_count, budget_range, city, region, public_slug, website_published_at',
        )
        .eq('user_id', ctx.usersId)
        .maybeSingle()
      if (error) return JSON.stringify({ error: 'Could not load your wedding profile right now.' })
      if (!data) return JSON.stringify({ note: 'No wedding profile found for this account.' })
      return JSON.stringify({
        partners: [data.partner1_name, data.partner2_name].filter(Boolean).join(' & ') || null,
        weddingDate: data.date_undecided ? 'Not decided yet' : data.wedding_date,
        guests: data.guest_count,
        budgetRange: data.budget_range,
        location: [data.city, data.region].filter(Boolean).join(', ') || null,
        websitePublished: Boolean(data.website_published_at),
        websiteSlug: data.public_slug,
      })
    }

    if (name === 'get_my_saved_vendors') {
      if (!ctx.usersId) return JSON.stringify({ saved: [], note: 'No saved vendors for this account.' })
      // Two plain queries instead of a PostgREST embed, so this never depends on
      // relationship auto-detection.
      const { data: rows, error } = await sb
        .from('saved_vendors')
        .select('vendor_id, status')
        .eq('user_id', ctx.usersId)
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) return JSON.stringify({ error: 'Could not load your saved vendors right now.' })
      if (!rows || rows.length === 0) {
        return JSON.stringify({ saved: [], note: 'No saved vendors for this account.' })
      }
      const ids = rows.map((r) => r.vendor_id as string).filter(Boolean)
      const { data: vendors } = await sb
        .from('vendors')
        .select('id, name, category, slug')
        .in('id', ids)
      const byId = new Map((vendors ?? []).map((v) => [v.id as string, v]))
      return JSON.stringify({
        saved: rows.map((r) => {
          const v = byId.get(r.vendor_id as string)
          return {
            vendor: (v?.name as string) ?? null,
            category: (v?.category as string) ?? null,
            url: v?.slug ? `/vendors/${v.slug}` : null,
            status: r.status,
          }
        }),
      })
    }

    return JSON.stringify({ error: `Unknown tool: ${name}` })
  } catch {
    return JSON.stringify({ error: 'Tool execution failed.' })
  }
}
