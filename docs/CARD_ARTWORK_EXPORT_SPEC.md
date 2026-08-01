# Card Artwork Export Spec

**Audience:** designers producing digital card artwork for OpusPass.
**Applies to:** every SVG uploaded as a card's front artwork in Admin → OpusPass → Digital Cards → Templates.

---

## Why this exists

When a couple orders a card, our renderer opens your SVG and rewrites the parts that
change: their names, their date, their venue, their five palette colours. It does this
by finding your **layer names**, which survive the Illustrator export as SVG group ids.

The renderer will never guess. If it cannot find a layer, or cannot safely rewrite it,
it leaves that field alone and reports it as blocked. A card with blocked customer
fields cannot take an order at all.

So the export is not a delivery format. It is the interface. Two settings in the
Export dialog decide whether a design is sellable or dead on arrival.

---

## The checklist

Pin this up. Everything below is the explanation.

1. Name every personalisable layer with its **exact role key** from the table below.
2. Every named field is a **group**, and the group carries the name.
3. Field text is **live text**, one point-text object, one line.
4. **No manual kerning or per-character tracking** on a field. Use uniform tracking.
5. Palette swatches are **plain vector shapes** with a **flat fill**, one group each.
6. Nothing that must change per couple may be **rasterised**. Check the Links panel.
7. Export with **Styling: Presentation Attributes** and **Object IDs: Layer Names**.
8. Upload, open the Layer Mapper, confirm the banner reads **"Ready to take orders."**

Rules 3 and 4 are the ones that bite hardest, because the artwork looks perfect and
the field is still unusable. Rules 2 and 7 are now tolerated by the pipeline if you
get them wrong, but stay in the list because they keep the file readable.

---

## 1. Layer names are the contract

Name the layer for the **role it plays**, never for the sample content it currently
holds. A layer named `Bi._Fabiola_Thomas` is a layer named after one guest who will
never receive this card again. The role is `guest_name`.

Use these keys verbatim, lowercase, underscores:

| Group | Keys |
|---|---|
| Hosts | `hosts_intro`, `hosts_names`, `invite_line`, `guest_name` |
| Couple | `event_intro_1`, `event_intro_2`, `couple_name_1`, `ampersand`, `couple_name_2` |
| Date | `date_intro`, `date_day`, `date_month`, `date_year` |
| Venue | `venue_1_title`, `venue_1_place`, `venue_1_time`, `venue_2_title`, `venue_2_place`, `venue_2_time` |
| Contacts | `contact_heading`, `contact_1`, `contact_2` |
| Design | `palette_heading`, `palette_1` … `palette_5` |

The source of truth is [`card-field-roles.ts`](../apps/opus_admin/src/lib/cms/card-field-roles.ts),
which also carries a hint and a real example for each key.

**Why exact keys matter at volume.** The Layer Mapper has a "Match by name" button. When
your layer names match the role keys exactly, one click maps the whole card and an admin
never touches a dropdown. When they do not, someone hand-maps 28 fields per card. Across
a thousand cards that is the difference between minutes and weeks.

Not every card uses every role. Omit what the design does not have. Anything decorative
stays unnamed, or keeps a name that matches no role, and the mapper will list it as
"not a field."

---

## 2. A field is a group, not a bare object

The renderer reads the name off the **enclosing group**. If you name a bare circle or a
bare text object, Illustrator writes that name onto the element itself rather than onto
a group.

The pipeline now reads both, so a bare named object still works. Group anyway. A bare
object named `palette_swatch_1` sitting loose inside `Wedding_card_Image` is legible to
the code but not to the next designer who opens the file, and it is one Illustrator
re-order away from ending up somewhere else entirely.

In Illustrator: select the field's contents, `Cmd+G` to group, then rename **the group**
in the Layers panel. Renaming the group and leaving the same name on the shape inside is
fine, since Illustrator dedupes the inner one to `palette_swatch_1-2` and we ignore it.

Correct:

```xml
<g id="palette_swatch_1"><circle fill="#024231" cx="456" cy="1087" r="18.79"/></g>
```

Broken:

```xml
<g id="Wedding_card_Image">
  <image .../>
  <circle id="palette_swatch_1" class="cls-2" .../>
</g>
```

---

## 3. Text fields must be live text

One point-text object per field. One line.

Two things break a text field even when it is not rasterised:

- **Multiple text objects in one group.** Three separately positioned words that read as
  one sentence cannot be replaced by one string without inventing a layout, so we skip
  the field rather than collapse the typesetting.
- **Multiple tspans in one text object.** Illustrator emits a tspan per line for area
  text, and sometimes per fragment when you have applied manual kerning or tracking to
  part of a line. Same outcome, same reason.

If a field genuinely needs two lines in the design, that is two roles, or a design
change. Talk to us before exporting.

Use **point text** (click, then type), not **area text** (drag a box, then type). Area
text is the usual source of surprise tspans.

### 3a. Manual kerning silently kills a field

This is the subtlest failure in the whole spec, because the artwork looks flawless.

When you letterspace a word by clicking between individual characters and adjusting,
Illustrator exports **one tspan per adjustment**. The month on Opus Royal Ivory came out
as four:

```xml
<text ...><tspan letter-spacing="-0.02em">A</tspan><tspan x="16.74" y="0">G</tspan>
<tspan x="33.51" y="0" letter-spacing="0.02em">O</tspan><tspan x="52.02" y="0">STI</tspan></text>
```

Each fragment now carries its own hard-coded x position. Writing "DESEMBA" over that
would need us to re-run the kerning, so we skip the field instead. The month and year on
that card were live, editable text and still could not be personalised.

**The fix:** select the whole text object and set **Tracking** in the Character panel to
one uniform value. Do not click between individual letters. Uniform tracking exports as
a single `letter-spacing` on the `<text>` with one tspan inside, which we can rewrite.

If you use `File > Save As > SVG`, also tick **Output fewer `<tspan>` elements**. It
merges what it can, though it cannot rescue genuinely per-character kerning.

---

## 4. Palette swatches

The five RANGI chips are the one part of the card that needs no font work to become
dynamic, because a colour is just a fill on a shape. Getting them right is cheap.

The role keys are `palette_1` … `palette_5`, but the artwork's long-standing name for
these layers is `palette_swatch_1` … `palette_swatch_5`. Both resolve, so use whichever
matches the rest of your file. The existing library uses `palette_swatch_N`.

Each swatch is:

- Its own group, named `palette_swatch_1` through `palette_swatch_5`.
- Containing one plain `circle`, `rect`, `ellipse`, `path` or `polygon`.
- With a **flat fill**. No gradient, no pattern, no opacity, no drop shadow, no blend
  mode, no rasterised effect.

Draw them with the Ellipse or Rectangle tool. Do not copy a swatch from another
document, because you inherit whatever appearance was on it.

Give each of the five a **distinct fill value**, even if the design shows two of them
the same. Identical colours make Illustrator collapse them onto one shared CSS class,
which the export settings below already prevent, but distinct values remove the risk
entirely and make the mapper's "currently #024231" readout readable.

---

## 5. Nothing customer-facing may be rasterised

Illustrator flattens a layer to a bitmap when it cannot embed what is on it, most often
an unembeddable script font, and appends `_Image` to the name when it does. That suffix
is your tell: if you see `couple_name_1_Image` in the export, that layer is a PNG and no
amount of text substitution will change it.

On the reference card this hit the couple's names and the wedding date, which are the two
things that must change on every single order. The card could not fulfil anything.

Before exporting:

- **Type → Find Fonts** to confirm every font used in a named field is embeddable. If a
  script face is not, either license an embeddable cut or convert that field to a
  different face. Do not outline it, because outlines are not editable text either.
- **Window → Links.** Anything listed there was placed, not drawn. Placed swatches and
  placed type must be deleted and redrawn natively.
- Do not run **Object → Rasterize** on anything you have named.

The decorative floral artwork is a different matter. It never changes per couple, so
leaving it as an embedded bitmap is correct and expected. Keep the file under 12 MB.

---

## 6. Export settings

**File → Export → Export As → SVG**, or **Save As → SVG**.

| Setting | Value | Why |
|---|---|---|
| Styling | **Presentation Attributes** | Emits `fill="#024231"` on the shape, which is what we rewrite. |
| Object IDs | **Layer Names** | Otherwise you get `_x35_` gibberish and nothing is mappable. |
| Font | **SVG** (keep as text) | Anything else outlines or rasterises your type. |
| Images | **Preserve** | Leaves the floral artwork alone. |
| Decimal | 2 | Keeps the file small without visible drift. |
| Minify | **Off** | Keeps ids readable. |
| Responsive | On | Emits a viewBox instead of fixed pixel dimensions. |

**Styling is the setting that catches everyone.** Illustrator defaults to **Internal
CSS**, which puts your fills in a `<style>` block as `.cls-2{fill:#024231;}` and leaves
only `class="cls-2"` on the shape.

The pipeline now handles all three options, including Internal CSS and Inline Style, and
resolves colours through the same precedence a browser uses. Set Presentation Attributes
anyway, for two reasons that still matter:

- Internal CSS **collapses identical colours onto one shared class**. Opus Royal Ivory's
  swatches 1 and 5 were both `cls-2`. Nothing breaks, but you cannot tell from reading
  the file which swatch is which.
- Presentation Attributes puts the colour on the shape, so the file is diffable and the
  mapper's "currently #024231" readout matches what you see in the markup.

---

## 7. Self-check before handing off

Upload the SVG to the card, open **Templates → [card] → Layer Mapper**, and click
**Match by name**. You are looking for three things:

1. The banner reads **"Ready to take orders"** in green. Amber means at least one field
   a couple supplies is blocked or unmapped, and the banner lists which.
2. The **Colour layers** table lists `palette_swatch_1` through `palette_swatch_5`, each
   showing `1 shape · currently #xxxxxx`. If they are missing, re-read section 2 and 4.
3. The **Image layers** table contains only decoration. Any role key appearing there
   with an `_Image` suffix is a rasterised field, so re-read section 5.

Then open a design job for the card and change a palette colour. The preview updates
live. If it does not, the export is wrong, and the field list will say why.

---

## Common traps

| Symptom in the mapper | Cause |
|---|---|
| Layer names like `_x35_`, `Path_1`, `Group_12` | Object IDs was not set to Layer Names |
| Colour layers table is empty | The swatches carry no fill at all, or are inside a group holding a bitmap and were never named |
| A role key appears under Image layers | That layer rasterised, almost always an unembeddable font |
| Text layer shows "3 text nodes" in amber | Three separate text objects in one group, split them into roles or merge into one |
| Field is live text but the render skips it as `complex_text` | Per-character kerning, see section 3a |
| Real content sitting under a layer named `Artboard_1...` | Those text objects were never named or grouped |
| "No named layers found" | Everything flattened, usually Minify on plus Object IDs set to Minimal |

### After a re-export

Re-uploading artwork does not re-map it. The Layer Mapper detects that layer names have
changed, shows a **"This artwork was re-exported since the last mapping"** notice listing
every id it cleared, and waits for you. Click **Match by name** and **Save mapping** or
the card keeps rendering against the previous export's layer names.

---

## Open items

- **Artboard proportion.** The storefront treats 5:7 as the canonical card proportion,
  while the Opus Royal Ivory reference artboard is 1062 × 1416, which is 3:4. Confirm
  which applies to a given product before starting, since it is not fixable at export.
- **Preflight automation.** At the volume we are planning, the checklist in section 7 is
  a manual gate on every card. An upload-time validator that rejects or flags a
  non-conforming export would move this from designer discipline to an enforced rule.
  Tracked separately.

---

## For engineers

The rules above are calibrated to what the pipeline accepts, and were verified by running
[`inspectCardArtwork`](../apps/opus_admin/src/lib/cms/card-svg-fields.ts) and
[`renderCardSvg`](../apps/opus_admin/src/lib/cms/card-render.ts) against both a conforming
fixture and the two real non-conforming exports of Opus Royal Ivory.

Colour resolution lives in
[`card-svg-shapes.ts`](../apps/opus_admin/src/lib/cms/card-svg-shapes.ts), shared by the
scanner and the renderer so they cannot drift. A shape the mapper offers but the renderer
cannot write is the worst outcome available, because the card silently keeps the
designer's placeholder colour and nothing downstream knows it is wrong.

Three tolerances were added there so an off-spec export degrades rather than fails:

- A shape is filed under its group **and** its own id when they differ, so a bare named
  object is still mappable.
- `class` is resolved against `<style>` blocks, following real SVG precedence
  (inline style > class rule > presentation attribute), so an Internal CSS export reads
  correctly and is overridden with an inline style that actually wins.
- `roleForLayerName` in
  [`card-field-roles.ts`](../apps/opus_admin/src/lib/cms/card-field-roles.ts) absorbs
  Illustrator's `_Image` and `-2` suffixes and the `palette_swatch_N` house name.

What is deliberately **not** tolerated is anything requiring us to guess at layout:
multi-layer roles, multiple text nodes, and per-character kerning are all skipped and
reported. A wedding invitation goes to hundreds of guests and cannot be recalled.

Still open: an upload-time validator, so section 7 stops being a manual gate.
