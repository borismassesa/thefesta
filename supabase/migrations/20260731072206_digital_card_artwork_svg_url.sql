-- Separate public preview imagery from editable SVG artwork.
--
-- image_url is now the flattened public hero/cover preview used on the
-- catalogue and detail page. The layer mapper, designer preview and release
-- pipeline need the original SVG, because only the SVG carries named text and
-- colour layers.

ALTER TABLE public.website_invitations_products
  ADD COLUMN IF NOT EXISTS artwork_svg_url TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.website_invitations_products.artwork_svg_url IS
  'Editable front-card SVG used for field mapping and personalised rendering. Public preview imagery stays in image_url/designs.';

-- Preserve any cards that were created before the preview/artwork split.
UPDATE public.website_invitations_products
SET artwork_svg_url = image_url
WHERE artwork_svg_url = ''
  AND image_url ~* '\.svg([?#].*)?$';

DO $$
BEGIN
  ALTER TABLE public.website_invitations_products
    ADD CONSTRAINT website_invitations_products_artwork_svg_url_is_svg
    CHECK (artwork_svg_url = '' OR artwork_svg_url ~* '\.svg([?#].*)?$');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
