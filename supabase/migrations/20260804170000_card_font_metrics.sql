-- Advance widths for the card font library.
--
-- The Card Design Studio has to answer one question honestly: does this guest's
-- name fit the box the designer drew? Two places need that answer and they must
-- never disagree — the browser, so an admin sees the truth while they work, and
-- the server, so a release with an unfittable value is blocked before it can
-- reach a guest.
--
-- The obvious implementations both fail that test. Canvas measureText in the
-- browser measures whatever face the BROWSER resolved, which is not necessarily
-- the face resvg will pick when the card is rasterised. fontkit is a Node binary
-- parser and cannot run in the browser at all. Either way the preview would lie,
-- and an admin would sign off a card that goes out clipped.
--
-- So neither side measures a font. Both read this table and do arithmetic.
--
-- Design units, not pixels. Advances are stored in the face's own coordinate
-- system, so one extraction serves every size the face is ever set at: divide by
-- unitsPerEm, multiply by the font size.
--
-- Extracted at upload by extractFontMetrics() in
-- apps/opus_admin/src/lib/cms/font-metadata.ts, consumed by
-- packages/lib/card-font-metrics.ts. The covered code points are Latin plus the
-- accents, punctuation and currency marks that appear on Tanzanian invitations —
-- storing a CJK face's whole character set would mean shipping tens of thousands
-- of entries to the browser to measure text that is always Swahili or English.
-- A character outside that repertoire measures at fallbackAdvance and is
-- REPORTED as a gap, so the answer degrades to "cannot promise this fits".

alter table public.card_fonts
  add column if not exists metrics jsonb,
  add column if not exists metrics_extracted_at timestamptz;

-- Nullable on purpose. Every face already in the library predates this column,
-- and a font is still perfectly usable for rendering without it — it just cannot
-- be laid out by the fitter, which reports 'unmeasurable' and blocks rather than
-- guessing. The backfill fills them in; nothing has to wait for it.
comment on column public.card_fonts.metrics is
  'Advance widths in font design units: { unitsPerEm, ascender, descender, lineGap, advances: { "<codepoint>": <units> }, fallbackAdvance }. Null means this face cannot be measured yet, which blocks layout rather than being guessed at.';

comment on column public.card_fonts.metrics_extracted_at is
  'When metrics were last read out of the binary. Lets a backfill find faces registered before extraction existed, and re-extract if the repertoire widens.';

-- Finding the faces still to do. Partial, because once the backfill has run this
-- index is empty and costs nothing, exactly like the unmapped-cards index on
-- website_invitations_products.
create index if not exists card_fonts_without_metrics_idx
  on public.card_fonts (created_at)
  where metrics is null;
