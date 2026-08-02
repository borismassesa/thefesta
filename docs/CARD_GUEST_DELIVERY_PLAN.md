# Guest card delivery: released design to WhatsApp

Vertical-slice plan for making the card a couple paid for the thing their guests
actually receive, personalised per guest.

Status: PR 1 landed (979302cc, shared renderer extraction). PR 2 in progress.

## The gap today

The admin pipeline is complete through release. `releaseApprovedDesign`
(`apps/opus_admin/src/lib/cms/release-card.ts`) renders the personalised SVG,
embeds the fonts, writes it to the private `card-releases` bucket, and rolls the
order to `fulfillment_status = 'ready'`. The couple can view and download it at
`/my/dashboard/cards`.

The send path never reads any of that. `getWhatsAppEntitlement`
(`apps/opus_pass/src/lib/dashboard/queries.ts:2114`) sets
`cardImageUrl = item.image`, the catalogue thumbnail off the order line, and
that value goes straight to Meta as `headerImageUrl`
(`apps/opus_pass/src/lib/dashboard/actions.ts:3255`). There are zero references
to `release_svg_path` anywhere in the send path.

Three things are missing between the two: a renderer `opus_pass` can call, a
per-guest raster artefact, and a public URL Meta can fetch.

## Architecture boundaries

### `@opusfesta/lib` holds deterministic rendering only

The package already carries the SVG-side primitives: `readRequiredFonts`,
`matchCardFonts`, `buildFontFaceCss`, `injectFontCss`, `categorySchema`,
`resolveShapeFill`. What moves in is the layer-writing core and the role
vocabulary it is typed against.

```
@opusfesta/lib
├── card-render.ts        renderCardSvg, renderCardForGuest, escapeXmlText
├── card-field-roles.ts   CARD_FIELD_ROLES, CardFieldBinding, assessBindings,
│                         assessGuestDelivery, requestableFields
└── (existing card-* font and shape modules)
```

Nothing in there may import a Supabase client, Clerk, a Next request API, a
storage bucket, an admin action, or environment config. Both are already pure
today, which is what makes this a mechanical move rather than a rewrite.

### `opus_admin` keeps release orchestration

`releaseApprovedDesign`, `freezeCardRelease`, storage reads and writes, release
auditing, and fulfilment transitions stay where they are. They import the
renderer from the package like any other consumer.

### `opus_pass` gets preparation and delivery

The guest asset service, the raster step, token issuance, and the public route
live in `opus_pass`. It never imports admin internals and never re-reads the
couple's mutable form data.

## Release as an immutable base artefact

The frozen SVG is the couple's card with couple-scope and order-scope values
written in, fonts embedded, artwork version fixed, and exactly one role left
replaceable:

```
Released design = immutable couple card + one permitted guest-scoped substitution
```

Guest delivery reads the frozen file and substitutes only `guest_name`. It never
touches `invitation_card_designs.field_values`, so editing couple data after
release cannot change a card already sent.

### Release identity is missing and has to be added

`release_svg_path` is a single column on `invitation_card_designs`, written as
`${design.id}/${Date.now()}.svg`. Re-releasing overwrites the column while
leaving the previous object in the bucket, so there is no stable identity for
"the release that produced this PNG" and no way to keep a sent URL pointing at
the artefact that was actually sent.

Add a release row per freeze:

```
invitation_card_design_releases
- id
- design_id
- svg_storage_path
- svg_sha256          content hash, so an identical re-render is recognisable
- artwork_svg_url     which source export this came from
- released_at
- released_by
- superseded_at       nullable, set when a newer release is approved
```

`invitation_card_designs.release_svg_path` stays as the pointer to the current
release, so nothing that reads it today breaks.

### One correctness bug to fix while we are here

`guest_name` is scope `guest`, so it is never in `field_values`, so
`renderCardSvg` skips it with reason `no_value`, and `isFatalSkip` treats
`no_value` as acceptable. The consequence is that the frozen SVG keeps the
artwork's original design text in that layer. On the reference card that means
the released card a couple downloads today reads "Bi. Fabiola Thomas", the
designer's sample guest.

DECIDED: a neutral placeholder in the frozen release, the real name per guest.

```
Frozen couple-facing release   guest_name = neutral placeholder
Per-guest delivery asset       guest_name = exact guest display name
```

The Swahili default is `Jina la Mgeni`. Blank text reads as a broken card and the
designer's sample name reads as a mistake we shipped, so neither is acceptable on
an artefact the couple downloads. The placeholder should become locale-aware
later; one safe default now beats either alternative.

Note this also means the role's `example` in `CARD_FIELD_ROLES` must not be
reused as the placeholder while it still reads `Bi. Fabiola Thomas`. An example
is designer-facing guidance, not customer-facing copy.

## Delivery asset model

```
invitation_card_delivery_assets
- id
- design_release_id      FK, so the asset is bound to a release, not a design
- guest_id
- render_variant         e.g. 'whatsapp_header_v1'
- token_hash             sha256 of the bearer token; raw token never stored
- png_storage_path       nullable until prepared
- status                 pending | ready | failed
- render_error_code      nullable
- created_at
- expires_at             nullable
- revoked_at             nullable

unique (design_release_id, guest_id, render_variant)
```

The unique constraint is the idempotency key. A retried send reuses the same
asset and the same token rather than minting a second PNG and a second URL. A
new approved release produces a new `design_release_id` and therefore a new
asset set, while URLs already sent keep resolving to what was sent.

Token properties: cryptographically random, unguessable, scoped to one guest and
one release, revocable, independent of Clerk, and stable enough for Meta to
fetch repeatedly.

## Prepare before sending, do not rasterise on Meta's fetch

Rendering inside Meta's fetch is the wrong failure boundary. Rasterisation can
time out, storage can fail transiently, fonts can fail to resolve, Meta may
fetch more than once, and a large send creates a spike. All of it would surface
after the operator has already clicked Send.

```
Prepare invites
  → resolve one released design for the event
  → for each guest: load frozen SVG, substitute guest_name, rasterise, store PNG
  → create or reuse the delivery asset and token
  → report per-guest preparation outcome

Send
  → only for guests whose asset is ready
  → per-guest token URL as headerImageUrl

Public route
  → validate token
  → stream the prepared PNG
```

First release may use lazy write-through generation on first token request, but
the preflight preparation stage is not optional: failures have to be visible
before we contact Meta.

## Rasterisation

`resvg`, not `ImageResponse`. Satori's SVG subset will not survive Illustrator
exports with embedded fonts, masks, clip paths, filters, and transforms. The
entrance-pass route uses `ImageResponse` legitimately because it composites a
known PNG template with text, which is a different problem.

Contract:

```
Output           PNG
Dimensions       derived from the SVG viewBox, longest edge capped
Max pixels       capped, to bound memory
Max SVG bytes    capped, the reference artwork is ~2 MB
Max duration     capped, with a failure recorded rather than a hang
Background       defined, not transparent, since WhatsApp composites on white
Colour           sRGB
```

Verify JPEG/PNG support and the current media byte ceiling in Meta's media
documentation before fixing the pixel cap. Do not size the raster from memory.

### Font spike: RESOLVED, run 2026-08-02 against the live Royal Ivory export

Run with `@resvg/resvg-js` against the real 2 MB artwork
(`website-media/opus-pass/invitations/artwork/1785615674060-…svg`) and two
deliberately unmistakable typefaces. Findings, all empirical:

**1. resvg ignores `@font-face` with `data:` URIs. Confirmed.** A card carrying
the exact block `buildFontFaceCss` produces rendered byte-identical to the same
card with no font information at all. So the fonts baked into the frozen release
are invisible to the rasteriser. They must still be baked in, because the frozen
SVG is also what the couple downloads and views in a browser, but the raster path
has to be handed the font FILES separately.

**2. resvg matches on FAMILY NAME plus weight, never on PostScript name, so the
raster step must pin the face explicitly.**

An earlier run of this spike concluded the opposite, that PostScript names
resolve fine and no rewriting is needed. That was a false positive: it used two
fonts of DIFFERENT families with one face each, so an unmatched name fell through
to resvg's silent fallback, which happened to be the font the test expected.
Finding 4 below is that same mechanism.

Retested with a real regular+bold pair of ONE family, which is Royal Ivory's
actual situation (`Bookman Old Style Regular` and `Bookman Old Style Bold`):

```
font-family="Arial"                             -> Regular   correct
font-family="Arial" font-weight="700"           -> Bold      correct
font-family="Arial-BoldMT, Arial" weight="700"  -> Bold      correct
font-family="Arial-BoldMT, Arial"  (no weight)  -> Regular   WRONG
font-family="ArialMT, Arial"                    -> Regular   correct
```

The PostScript-ish first entry Illustrator emits is ignored. Resolution runs off
the second entry, the real family, combined with `font-weight`.

Royal Ivory survives this only by luck: its one bold layer, `Bi._Fabiola_Thomas`,
does carry `font-weight="700"`, and every `font-family` list happens to name the
real family second. That layer is the GUEST NAME, the one field the delivery path
substitutes, so a wrong weight there would be wrong on every guest card. An
export that names a bold face without a weight attribute, or that omits the real
family from the list, renders in the wrong face with no error.

So the raster step does not trust the artwork's font naming. Before rasterising,
it rewrites each text element's `font-family` to the matched face's canonical
family and sets weight and style from that face. That rewrite is pure and belongs
in `@opusfesta/lib`; only the wasm call belongs in the app.

**3. WOFF is not supported. Renders blank.** The font library stores
`ttf|otf|woff|woff2` (see `FONT_MEDIA` in `card-font-match.ts`), so any face
uploaded as WOFF or WOFF2 cannot be rasterised. Audit the live `card_fonts` rows
and either convert at upload or reject the format for cards intended for guest
delivery.

**4. An unresolvable font silently falls back to an arbitrary loaded face.** No
error, no warning. Demonstrated on the real card: with only Dancing Script
supplied, the whole invitation rendered complete and plausible with every text
layer in the wrong typeface. Nobody would catch that by eye, and it would go to
two hundred guests.

**5. With no usable font at all, text silently vanishes.** The same card
rendered as florals, gold frame and colour swatches with every text layer simply
absent. Also no error.

**6. Mis-spelling an option key fails OPEN.** `font: { loadSystemFonts: false,
fontBuffers: [...] }` (there is no `fontBuffers`; it is `fontFiles`, and it takes
PATHS not buffers) makes the whole `font` object fail to deserialize, reverting
to `loadSystemFonts: true`. The result is a wrong-font render rather than a
crash. Found the hard way while writing this spike.

**7. Everything else is faithful.** The 2 MB export has zero masks, clip paths,
filters, gradients or `<use>` elements. Its 3 embedded PNG bitmaps decode
correctly. Output was 752 KB at 600 px wide.

Consequences, now requirements rather than options:

```
Raster step MUST
  read required fonts from the FROZEN svg   (readRequiredFonts)
  match them to library faces               (matchCardFonts)
  PIN each text element to the matched face's canonical family + weight + style,
    because resvg ignores the PostScript name Illustrator writes first
  download the face bytes and pass them as fontBuffers (wasm build takes buffers)
  build that options object in ONE typed place, never inline

Preparation MUST FAIL, not rasterise, when
  any required font does not resolve to a supplied face
  any matched face is woff/woff2
  the artwork asks for a font whose licence is not cleared

because every one of those failure modes is silent at the pixel level.
```

**Platform binaries on Vercel.** resvg ships native per-platform optional
dependencies. Installing it on macOS strips the Linux binary from the lockfile
and the Vercel build dies. Install with the Linux platform explicitly included
and verify the lockfile carries both before merging. Still outstanding.

## Per-recipient WhatsApp contract

The current shape supplies one `headerImageUrl` for the whole send operation.
It has to become per recipient:

```ts
type GuestInviteSend = {
  guestId: string
  recipientPhone: string
  headerImageUrl: string   // that guest's token URL
  // template parameters
}
```

Send pipeline:

```
load eligible guests
→ resolve one released design for the event
→ prepare one delivery asset per guest
→ send each guest with that guest's URL
→ persist per-guest preparation and send outcome
```

The guest name is never taken from a request parameter on the public route. The
token resolves the guest server-side.

## Public route

```
GET /invite-card/[token].png
```

```
Content-Type: image/png
X-Content-Type-Options: nosniff
Content-Disposition: inline
Referrer-Policy: no-referrer
```

The token is a bearer credential, so keep it out of analytics query capture,
verbose request logs, error breadcrumbs, referrers, and raw database errors.

Caching: `public, max-age=86400, immutable` is right for a prepared immutable
PNG and is only acceptable if revocation is allowed to lag. If revocation must
take effect immediately, drop the shared cache and authorise every fetch.

Return a generic 404 for invalid, expired, revoked, or unrelated tokens. Never
reveal which one it was.

## Card readiness

`assessBindings` (`card-field-roles.ts`) already computes ready, blocked,
unbound, and `canFulfilOrders` per category, so this is surfacing and extending
existing logic rather than writing a new engine.

The important subtlety: `guest_name` is in every category's `roles` but in no
category's `required`, so `canFulfilOrders` is true with `guest_name` unmapped.
That is correct for order taking and wrong for guest delivery. Adding
`guest_name` to `required` would retroactively block catalogue cards from taking
orders, so add a second, narrower gate instead:

```
assessGuestDelivery(bindings) → blocking[] / warnings[]

Blocking
- guest_name unmapped
- guest_name bound to rasterised text
- no release-capable source SVG
- unresolved required font
- duplicate canonical role bindings where unsupported

Warnings
- optional contacts unmapped
- long-text overflow risk
```

Admin card page states it plainly:

```
Cannot release

3 blocking issues:
• Guest name is not mapped
• Couple name 1 is rasterised
• Couple name 2 is rasterised
```

Every existing card has `field_bindings = []`. Those get an operational
remediation checklist, not a silent pass. See
`docs/CARD_ARTWORK_EXPORT_SPEC.md` for the re-export requirements.

## Delivery plan

**PR 1. Shared renderer extraction.** Move `card-render.ts` and
`card-field-roles.ts` into `@opusfesta/lib`, byte-for-byte output preserved.
Update admin imports. Extract the duplicated font-selection step shared by
`freezeCardRelease` and the designer fonts route into one helper, leaving the
storage download in admin. Add regression tests against representative SVG
fixtures. No product behaviour change.

**PR 2. Release identity, delivery assets, rasterisation.** Releases table and
delivery-assets schema. resvg raster step behind the contract above, after the
font spike. Idempotent preparation service that loads the frozen SVG,
substitutes only guest-scope roles, and writes the PNG to private storage.
Tests against real fonts and real Illustrator exports. No send-path switch yet.

**PR 3. Public token route.** Opaque token generation and hashing,
token-authenticated PNG route, cache and security headers, expiry and
revocation. Tests for invalid tokens, cross-design access, retries, and repeated
unauthenticated fetches.

**PR 4. WhatsApp integration.** Replace catalogue `item.image` with a per-guest
media URL. Block the send when preparation fails. Persist per-guest preparation
and send outcomes. Preserve retry idempotency. Feature-flagged rollout.

**PR 5. Readiness and catalogue remediation.** Surface blocking mappings and
rasterised text in the admin. Identify affected cards. Re-export artwork with
live text, complete mappings, and run the end-to-end test below.

## Acceptance test

One representative order:

1. Admin maps a live `guest_name` layer.
2. Couple details completed.
3. Designer approves and releases.
4. Frozen SVG stored, order becomes `ready`.
5. Two guests with different names selected.
6. Two separate PNG assets generated.
7. Both PNGs carry identical couple and event content.
8. Each PNG carries only its own guest's name.
9. Token A cannot retrieve guest B's asset.
10. Unauthenticated Meta-style GET returns `image/png`.
11. The two WhatsApp payloads carry different header URLs.
12. Retrying the send creates no duplicate assets.
13. Editing couple data after release changes neither PNG.
14. A new approved release creates a new asset identity, and previously sent
    URLs still resolve to what was sent.
