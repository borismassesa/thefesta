-- Correct the fsType half of the embeddable gate.
--
-- The original expression read:
--
--   licence_status IN ('open','webfont_licensed')
--   AND NOT fs_type_no_embedding
--   AND NOT fs_type_view_only        <-- wrong
--
-- That last term treats a PERMISSION as a prohibition. In the OpenType OS/2
-- spec the fsType bits are:
--
--   0x0000  Installable          no restriction
--   0x0002  Restricted License   must NOT be embedded          -> noEmbedding
--   0x0004  Preview & Print      MAY be embedded, no editing   -> viewOnly
--   0x0008  Editable             MAY be embedded and edited    -> editable
--
-- So `viewOnly` means the foundry has explicitly allowed embedding for viewing
-- and printing, which is exactly what a rendered and printed wedding card is.
-- Only `noEmbedding` is a refusal.
--
-- Caught on the first real delivery: Nexa Bold ships fsType Preview & Print, so
-- with a cleared licence it still reported as blocked, and the only control the
-- UI offered was a licence dropdown that could never change the outcome.
--
-- The human attestation remains the real gate. fsType stays an input to that
-- judgement, and `fs_type_view_only` is still recorded and surfaced so whoever
-- attests can see the font is preview-and-print rather than unrestricted.

-- A generated column's expression cannot be altered in place, and the column is
-- purely derived, so dropping and re-adding loses nothing.
ALTER TABLE public.card_fonts DROP COLUMN IF EXISTS embeddable;

ALTER TABLE public.card_fonts
  ADD COLUMN embeddable BOOLEAN GENERATED ALWAYS AS (
    licence_status IN ('open', 'webfont_licensed')
    AND NOT fs_type_no_embedding
  ) STORED;

COMMENT ON COLUMN public.card_fonts.embeddable IS
  'Generated gate. Only these fonts are ever injected into a card. Blocks on a cleared licence AND on fsType Restricted License; fsType Preview & Print is a permission, not a refusal.';

-- Recreate the index the dropped column took with it.
CREATE INDEX IF NOT EXISTS card_fonts_embeddable_idx
  ON public.card_fonts (embeddable) WHERE embeddable;
