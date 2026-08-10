# Card copy protection

How OpusPass card artwork is kept out of a stranger's hands, what that does and
does not achieve, and the one step still outstanding.

## The honest ceiling

**No web technique prevents a screenshot.** Anything rendered in a browser can be
captured by the operating system, and nothing in this document changes that.
What the work below changes is *what is available to capture* and *what a
captured copy is worth*: an anonymous, bulk, full-fidelity download of every
design in the catalogue is no longer possible, and that is the version of the
problem worth solving. Treat any claim stronger than that as false.

## What was actually wrong

`website_invitations_products.image_url` held a **public** Supabase storage URL,
and migration `20260528000001_storage_allow_svg.sql` added `image/svg+xml` to the
`website-media` bucket so designers could upload vector artwork. For any product
whose artwork was an SVG, the complete, editable, infinitely-scalable source of a
paid-for design was fetchable by anyone who could read the page HTML — no
session, no referer, nothing the application could refuse.

`DesignCarousel` made it worse by eagerly preloading every slide at full
resolution on mount, and `/digital-cards/p/[id]/customise` is a **public** page
that fetched the artwork as text and injected it into the DOM.

Blocking right-click did nothing about any of this, because nobody scraping a
catalogue uses right-click. That is why the bulk of this work is server-side.

## The layers, strongest first

### 1. Artwork is served only through a route we control

`lib/cards/protected-art.ts` + `app/api/card-art/[productId]/route.ts`.

Every artwork URL that reaches a browser is now
`/api/card-art/<productId>?t=<token>`. The route resolves the storage object
server-side with the service role and streams the bytes back. A signed URL is
deliberately *not* used: a signed URL is itself a shareable credential.

The rewrite happens in one place — `rowToProduct` in
`lib/cms/digital-cards-products.ts` — which every catalogue read already passes
through, so the storefront, product page, carousel, cart and customise editor are
all covered without nine components having to remember.

Verified in dev: the catalogue and product pages contain **zero**
`storage/v1/object/public/...` card URLs; a tampered token and a missing token
both 404.

### 2. Tokens expire, and are quantized

Six-hour window, HMAC over `(product, expiry)` with domain separation from the
guest-card token family. Expiries are **quantized to the window**, so the same
product yields the same URL for every viewer. That is load-bearing: `next/image`
keys its optimised-output cache on the source URL, so a token carrying
`Date.now()` would re-optimise the entire catalogue for every visitor.

The viewer is therefore *not* in the URL. The route reads it from the request's
own cookies instead — which a URL-editor cannot forge.

### 3. Fail closed, never fall over

`signingSecret()` returns `null` rather than throwing when
`CARD_ASSET_TOKEN_SECRET_CURRENT` is unset. Callers translate that into "serve no
artwork", so the tile falls back to its built-in `<InvitationVisual>` treatment.

This is not defensive padding. The first cut of this module threw, and it took
the **entire storefront to a 500** in local dev the moment the variable was
missing. A missing variable must cost the pictures on a page, never the page, and
never the artwork it was meant to protect. Outside production a non-secret
constant is used so a developer needs no configuration at all.

### 4. Per-viewer trace stamp (SVG only — see gaps)

`packages/lib/card-protection.ts`. A tiled, ~3%-opacity code derived by keyed
HMAC from the viewer, stamped across the artwork. Invisible in normal viewing; a
levels adjustment in any image editor pulls it out, so a leaked file names the
session it was served to. `readTraceWatermark()` is the forensic half.

### 5. Browser-side deterrents

`components/guests/ProtectedCard.tsx` and the `.op-protected` rules in
`globals.css`. Right-click, drag-to-desktop, long-press "Save Image", text
selection and print-to-PDF are all closed on card surfaces. The public "download
card" button on `/rsvp/[token]` is gone.

Deliberately **not** done, because the cost lands on real users and the benefit
does not exist: intercepting `Ctrl/Cmd+S` and `Ctrl/Cmd+P` (both are two clicks
away in the browser's own menu, and a document-level key trap breaks screen
readers), `preventDefault` on `touchstart` (would suppress every scroll gesture
starting on a card), and blanking the card when the tab loses focus (fires on
every alt-tab, so the card is missing exactly when a guest switches to WhatsApp).

### 6. Headers

The first response headers this app has ever set, scoped narrowly to the two card
routes: `X-Frame-Options: DENY`, `Cross-Origin-Resource-Policy: same-origin`
(refuses hotlinking onto a competitor's site), `nosniff`, and a `sandbox` CSP —
load-bearing, because an SVG opened as a top-level document executes its own
script in this origin.

`/invite-card/*` deliberately does **not** get `Cross-Origin-Resource-Policy`:
Meta's servers fetch that URL cross-origin when a WhatsApp template goes out, and
refusing them would break invitation delivery outright.

## Gaps — read before claiming this is finished

**1. The bucket is still public. This is the one that matters.**

Nothing above removes the *old* URLs. Anyone who already holds a
`storage/v1/object/public/website-media/...` link, or who guesses a path, can
still fetch the original. The proxy is what makes the fix *possible*; the flip is
what makes it *true*.

`website-media` cannot simply be set private: it also holds category marketing
photos and other site media, and Supabase's `public` flag is per-bucket, not
per-prefix. The correct move is a dedicated private bucket:

```sql
-- 1. Create a private bucket for card artwork only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-artwork', 'card-artwork', false, 20971520,
        array['image/png','image/webp','image/jpeg','image/svg+xml'])
on conflict (id) do nothing;

-- 2. Move the objects (storage API, not SQL) from
--    website-media/opus-pass/invitations/products/**  and
--    website-media/invitation-svgs/**
--    into card-artwork/, then repoint image_url / designs / gallery.
-- 3. Update opus_admin's upload path (lib/cms/upload-media.ts IMAGE_PREFIX).
```

`parseStorageUrl` already handles any bucket, so the proxy keeps working
unchanged once the objects move. Until this lands, treat the artwork as still
exposed to anyone who has collected the URLs.

**2. Raster artwork is not trace-stamped.**

The stamp is applied to SVG only. In live data every one of the 12 catalogue
heroes is a **PNG**, so today the stamp applies to nothing on the storefront.
Stamping a raster needs image processing; `sharp` is not a declared dependency of
opus_pass and adding a native one risks the Linux-binary stripping that has
broken Vercel builds here before. The workable route is to composite through
`@resvg/resvg-wasm` (already a dependency) with the mark drawn as **shapes rather
than text**, since resvg renders with no system fonts and text would vanish.

**3. Previews are served at full resolution.**

`PREVIEW_WIDTH_PX` (640) exists in `card-protection.ts` and is enforced by a test,
but nothing downscales yet — same dependency problem as (2). Until it is wired,
a screenshot of a card is as good as the original.

## Configuration

`CARD_ASSET_TOKEN_SECRET_CURRENT` must be set in production. It already is (the
guest-card delivery path uses it), but if it is ever unset, card artwork stops
being served and an error is logged. That is intentional.
