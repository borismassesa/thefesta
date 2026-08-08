import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLERK_SECRET_KEY = Deno.env.get("CLERK_SECRET_KEY")!;

type ClerkApiUser = {
  id: string;
  email_addresses: { id: string; email_address: string }[];
  primary_email_address_id: string | null;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
  public_metadata?: Record<string, unknown>;
};

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

async function fetchClerkUser(clerkUserId: string): Promise<ClerkApiUser | null> {
  const res = await fetch(`https://api.clerk.com/v1/users/${clerkUserId}`, {
    headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` },
  });
  if (!res.ok) {
    console.error("Failed to fetch Clerk user:", await res.text());
    return null;
  }
  return await res.json();
}

function primaryEmail(user: ClerkApiUser): string | null {
  const primary = user.email_addresses.find((e) => e.id === user.primary_email_address_id);
  return primary?.email_address ?? user.email_addresses[0]?.email_address ?? null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Writes onboarding state to Clerk publicMetadata. This is the authoritative
 * source the mobile app gates its redirect on, so the write must not be
 * best-effort: we retry transient failures with backoff and let the caller
 * fail the whole request if it never lands, so the client can retry rather
 * than end up "complete" in our DB but not in Clerk.
 */
async function patchClerkMetadata(
  clerkUserId: string,
  publicMetadata: Record<string, unknown>,
  attempts = 4,
): Promise<boolean> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(`https://api.clerk.com/v1/users/${clerkUserId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${CLERK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ public_metadata: publicMetadata }),
      });

      if (res.ok) return true;

      // 4xx (other than 429) won't succeed on retry — stop early.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        console.error("Clerk metadata update rejected:", res.status, await res.text());
        return false;
      }
      console.error(`Clerk metadata update failed (attempt ${attempt}):`, res.status, await res.text());
    } catch (clerkErr) {
      console.error(`Clerk API error (attempt ${attempt}):`, clerkErr);
    }

    if (attempt < attempts) await sleep(250 * 2 ** (attempt - 1));
  }
  return false;
}

/**
 * Provisions a public.users row for a Clerk identity when the sync webhook
 * hasn't run yet, mirroring the fallback in apps/opus_pass's dashboard auth
 * (src/lib/dashboard/auth.ts) so mobile onboarding never has to wait on it.
 */
async function provisionUser(
  supabase: ReturnType<typeof createClient>,
  clerkUserId: string,
): Promise<string | null> {
  const clerkUser = await fetchClerkUser(clerkUserId);
  const email = clerkUser ? primaryEmail(clerkUser) : null;
  const name = clerkUser
    ? [clerkUser.first_name, clerkUser.last_name].filter(Boolean).join(" ") || null
    : null;

  const { data: inserted, error } = await supabase
    .from("users")
    .upsert(
      {
        id: crypto.randomUUID(),
        clerk_id: clerkUserId,
        email,
        name,
        avatar: clerkUser?.image_url ?? null,
        role: "user",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "clerk_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle<{ id: string }>();

  if (inserted) return inserted.id;

  // No row + no error: a concurrent request already provisioned this clerk_id.
  if (!error) {
    const { data: byClerk } = await supabase
      .from("users")
      .select("id")
      .eq("clerk_id", clerkUserId)
      .maybeSingle<{ id: string }>();
    if (byClerk) return byClerk.id;
  }

  // Email already belongs to a row (email is UNIQUE) — adopt it only if unclaimed,
  // otherwise return it read-only so we never hijack another app's binding.
  const isEmailConflict =
    (error as { code?: string } | null)?.code === "23505" &&
    (error?.message?.includes("email") ?? false);
  if (email && isEmailConflict) {
    const { data: byEmail } = await supabase
      .from("users")
      .select("id, clerk_id")
      .eq("email", email)
      .maybeSingle<{ id: string; clerk_id: string | null }>();
    if (byEmail) {
      if (!byEmail.clerk_id) {
        await supabase
          .from("users")
          .update({ clerk_id: clerkUserId, updated_at: new Date().toISOString() })
          .eq("id", byEmail.id)
          .is("clerk_id", null);
      }
      return byEmail.id;
    }
  }

  console.error("Failed to provision Clerk user", { clerkUserId, upsertError: error?.message ?? null });
  return null;
}

/**
 * Minimal account setup for a client that only needs a usable account, not a
 * finished onboarding wizard — currently OpusPass mobile sign-up.
 *
 * It exists as its own branch because reusing `type: "couple"` for this would
 * be destructive: that branch upserts couple_profiles with a full payload, so
 * PostgREST turns a conflict into DO UPDATE and blanks the preferences and
 * onboarding timestamp of anyone who already onboarded on the web. Everything
 * here is insert-if-absent, and no existing value is ever overwritten.
 *
 * Always answers 200 once the users row exists. The Clerk metadata write is
 * a convenience for other surfaces; the caller's own re-read of
 * requesting_user_id() is what actually tells it the account works, so a
 * failed PATCH must not read as "provisioning failed".
 */
async function handleProvision(
  supabase: ReturnType<typeof createClient>,
  clerkUserId: string,
  supabaseUserId: string,
  partner1Name: unknown,
): Promise<Response> {
  // partner1_name is NOT NULL. The client sends a real name; this is only a
  // guard against an empty string reaching the insert.
  const name = typeof partner1Name === "string" && partner1Name.trim().length > 0
    ? partner1Name.trim()
    : "Partner 1";

  // ignoreDuplicates => ON CONFLICT DO NOTHING: an existing profile is left
  // exactly as it is. A first insert fires ensure_couple_account_on_profile,
  // which is how the couple_accounts workspace row gets created.
  const { error: profileError } = await supabase
    .from("couple_profiles")
    .upsert({ user_id: supabaseUserId, partner1_name: name }, {
      onConflict: "user_id",
      ignoreDuplicates: true,
    });

  if (profileError) {
    // The users row is what unblocks the client, so a profile failure is
    // logged and reported, not fatal.
    console.error("Failed to insert couple profile during provision:", profileError);
  }

  // `role` is deliberately not written. It is a legacy enum (user_role) that
  // has no 'couple' member, so setting it fails the whole statement with
  // 22P02 and silently takes onboarding_complete down with it — which is how
  // this was found. The column's own comment says product code must not touch
  // it, and loadDashboardUser doesn't either.
  const { error: flagError } = await supabase
    .from("users")
    .update({ onboarding_complete: true })
    .eq("id", supabaseUserId);

  if (flagError) {
    console.error("Failed to set onboarding_complete during provision:", flagError);
  }

  // Merge rather than replace: patchClerkMetadata sends public_metadata
  // wholesale, so writing a bare object here would wipe flags another app set.
  const clerkUser = await fetchClerkUser(clerkUserId);
  const existing = clerkUser?.public_metadata ?? {};
  const metadataSynced = await patchClerkMetadata(clerkUserId, {
    ...existing,
    supabaseUserId,
    onboardingComplete: existing.onboardingComplete ?? true,
    userType: existing.userType ?? "couple",
  });

  return new Response(
    JSON.stringify({ success: true, supabaseUserId, metadataSynced, profileCreated: !profileError }),
    { status: 200, headers: JSON_HEADERS },
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Extract and verify JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const token = authHeader.slice(7);

    // Create authenticated Supabase client to get user from JWT
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Decode the JWT to get the user ID (Clerk JWT for Supabase includes sub claim)
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

    // For Clerk JWTs, we may need to decode manually
    // The JWT `sub` claim contains the Clerk user ID
    let clerkUserId: string;
    let supabaseUserId: string | null = null;

    if (user) {
      supabaseUserId = user.id;
      clerkUserId = user.user_metadata?.clerk_id || user.id;
    } else {
      // Decode JWT payload to get Clerk user ID
      const parts = token.split(".");
      if (parts.length !== 3) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      const payload = JSON.parse(atob(parts[1]));
      clerkUserId = payload.sub;

      // Look up user in our users table by clerk_id
      const { data: dbUser } = await supabaseAuth
        .from("users")
        .select("id")
        .eq("clerk_id", clerkUserId)
        .maybeSingle();

      supabaseUserId = dbUser?.id ?? (await provisionUser(supabaseAuth, clerkUserId));

      if (!supabaseUserId) {
        return new Response(
          JSON.stringify({ error: "Failed to provision account. Please try again." }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const { type, profile } = await req.json();

    if (type === "provision") {
      if (!supabaseUserId) {
        return new Response(
          JSON.stringify({ error: "Failed to provision account. Please try again." }),
          { status: 500, headers: JSON_HEADERS },
        );
      }
      return await handleProvision(supabaseAuth, clerkUserId, supabaseUserId, profile?.partner1_name);
    }

    if (type === "couple") {
      // Insert couple profile
      const { error: insertError } = await supabaseAuth
        .from("couple_profiles")
        .upsert(
          {
            user_id: supabaseUserId,
            partner1_name: profile.partner1_name,
            partner2_name: profile.partner2_name,
            wedding_date: profile.wedding_date,
            date_undecided: profile.date_undecided ?? false,
            budget_range: profile.budget_range,
            guest_count: profile.guest_count,
            city: profile.city,
            region: profile.region,
            preferred_categories: profile.preferred_categories ?? [],
            preferred_styles: profile.preferred_styles ?? [],
            preferred_designs: profile.preferred_designs ?? [],
            whatsapp_phone: profile.whatsapp_phone,
            avatar_url: profile.avatar_url,
            onboarding_completed_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (insertError) {
        console.error("Failed to insert couple profile:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to save profile" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    } else if (type === "vendor") {
      // Preserve existing slug — only generate a new one for first-time onboarding
      const { data: existingVendor } = await supabaseAuth
        .from("vendors")
        .select("id, slug")
        .eq("user_id", supabaseUserId)
        .maybeSingle();

      const baseSlug = profile.business_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const vendorSlug = existingVendor?.slug ?? `${baseSlug}-${Date.now().toString(36)}`;

      const { error: vendorError } = await supabaseAuth
        .from("vendors")
        .upsert(
          {
            user_id: supabaseUserId,
            slug: vendorSlug,
            business_name: profile.business_name,
            category: profile.category,
            description: profile.description,
            bio: profile.description,
            price_range: profile.price_range,
            location: {
              city: profile.city,
              address: profile.address,
            },
            contact_info: {
              whatsapp: profile.whatsapp_phone,
              phone: profile.phone,
              email: profile.email,
              instagram: profile.instagram,
            },
            gallery_urls: profile.portfolio_urls ?? [],
            onboarding_status: "active",
            onboarding_started_at: new Date().toISOString(),
            onboarding_completed_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (vendorError) {
        console.error("Failed to create vendor:", vendorError);
        return new Response(
          JSON.stringify({ error: "Failed to save vendor profile" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid onboarding type" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Mark onboarding complete and set correct role in users table
    await supabaseAuth
      .from("users")
      .update({
        onboarding_complete: true,
        role: type === "vendor" ? "vendor" : "couple",
      })
      .eq("id", supabaseUserId);

    // Update Clerk publicMetadata — the authoritative onboarding flag the
    // mobile app reads. This must succeed; if it can't, fail the request so
    // the client retries instead of being left inconsistent with our DB.
    if (!CLERK_SECRET_KEY || !clerkUserId) {
      console.error("Missing CLERK_SECRET_KEY or clerkUserId; cannot persist onboarding flag.");
      return new Response(
        JSON.stringify({ error: "Failed to finalize onboarding. Please try again." }),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const clerkUpdated = await patchClerkMetadata(clerkUserId, {
      onboardingComplete: true,
      userType: type,
      supabaseUserId,
    });

    if (!clerkUpdated) {
      return new Response(
        JSON.stringify({ error: "Failed to finalize onboarding. Please try again." }),
        { status: 502, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    console.error("Onboarding error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
