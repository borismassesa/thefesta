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

### 4. Previews are downscaled and stamped

`lib/cards/preview-raster.ts`. Raster artwork is resized to `PREVIEW_WIDTH_PX`
(640) and composited with the viewer's trace mark in one pass. Measured on the
live catalogue: a 1.57 MB PNG becomes an 87 KB WebP at 640x853 — **128 DPI at
5x7in**, against the 300 DPI a press needs. A perfect capture is no longer
printable.

The mark is a tiled dot grid (`traceDotOverlaySvg`), one column per character of
the code plus a full-column orientation marker, drawn twice at ~4.5% opacity —
once dark, once light — so it lands on pale and dark artwork alike. Verified to
alter 2.8% of pixels.

**It is drawn with rectangles, never text.** A `<text>` element on a serverless
host with no fontconfig renders *nothing*, silently: the stamp would be missing
exactly where it matters and nobody would find out until a leak could not be
traced.

SVG artwork takes the other path — stamped with `traceWatermarkSvg` and served
as a vector. It is deliberately not rasterised: doing that correctly needs the
artwork's fonts pinned through the card font library, and an unpinned face
renders blank rather than wrong, so a card would silently lose its typography.

#### A dead end, recorded so it is not retried

The obvious way to avoid a new dependency was to wrap the raster in
`<svg><image href="data:...">` and render it with `@resvg/resvg-wasm`, which the
app already carries. **It does not work.** This build of resvg-wasm is compiled
without the `image` feature; an embedded raster renders to nothing, and the
output was byte-identical to an empty document. It fails silently. resvg still
draws SVG and text correctly — it simply cannot composite bitmaps.

`sharp` is used instead. That is safe here despite this repo's history with
platform-binary stripping: sharp is already a resolved optional dependency of
Next, and `package-lock.json` already carries every `@img/sharp-linux*` and
`-linuxmusl*` binary, so declaring it adds no new platform artefact. The lockfile
was edited by hand for the same reason — `npm install --package-lock-only`
rewrote 3341 lines and marked `apps/of_mobile` extraneous, so it was reverted.
Vercel runs `npm install` (not `npm ci`), so the one-line entry is sufficient.

It is imported dynamically and every failure returns the ORIGINAL bytes with
`protected: false`, because artwork nobody can see protects nothing.

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

`parseStorageUrl` already handles any bucket, so the proxy keeps working
unchanged once the objects move.

**A runnable script does all of it:**

```bash
node scripts/migrate-card-artwork-private.mjs --dry-run
```

```bash
node scripts/migrate-card-artwork-private.mjs
```

It creates the private bucket, copies only the two artwork prefixes (leaving the
category marketing photos public, where they belong), repoints `image_url`,
`back_image_url`, `designs` and `gallery`, and is safe to re-run. It deliberately
does **not** delete the originals: verify `/digital-cards` renders from the new
bucket first, because deleting first turns a mistake into an outage with no undo.
Until the originals are deleted, old URLs still resolve.

**2. The trace mark has no automated decoder.**

`readTraceWatermark()` reads the code back out of a leaked *SVG*. For a leaked
raster the dot grid must be read by eye: raise the levels in any image editor and
the grid appears; the full column marks the start, and each following column is
one character as five bits, least-significant row first, indexed into
`TRACE_ALPHABET`. Good enough to identify a leaker, not good enough to automate.
A real decoder has to deal with rescaling, rotation and JPEG re-encode, and that
work should wait until there is an actual leak to test it against.

**3. SVG artwork is still served as a vector.**

Gated and stamped, but a determined viewer gets scalable artwork. Closing it
needs the font-pinning pipeline described above. No live catalogue product
currently uses an SVG hero, so this is latent rather than active.

## Configuration

`CARD_ASSET_TOKEN_SECRET_CURRENT` must be set in production. It already is (the
guest-card delivery path uses it), but if it is ever unset, card artwork stops
being served and an error is logged. That is intentional.
