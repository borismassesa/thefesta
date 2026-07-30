-- Per-card mapping from SVG layer → editable field role.
--
-- A card's artwork carries its own field schema in its layer names, but those
-- names are whatever the designer happened to call them ('Bi._Fabiola_Thomas',
-- 'couple_name_1_Image'). The pipeline needs stable roles ('guest_name',
-- 'couple_name_1'), so an admin maps the two together once per card and every
-- order afterwards speaks in roles.
--
-- Shape (see apps/opus_admin/src/lib/cms/card-field-roles.ts):
--   [{ "role": "guest_name", "layerIds": ["Bi._Fabiola_Thomas"] },
--    { "role": "date_intro", "layerIds": ["Itakayofanyika","Jumamosi","tarehe"] },
--    { "role": "date_day",   "layerIds": ["date_day_Image"], "rasterised": true }]
--
-- layerIds is an array because one role can span several layers — the reference
-- card's date intro exports as three separate text layers reading as one
-- sentence. `rasterised` records that the layers are embedded bitmaps, so the
-- field cannot be personalised until the artwork is re-exported; storing it
-- lets the admin see WHY a field is unavailable instead of it just missing.
--
-- Empty array = not yet mapped, which is every existing card.

ALTER TABLE public.website_invitations_products
  ADD COLUMN IF NOT EXISTS field_bindings JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.website_invitations_products.field_bindings IS
  'SVG layer → field role mapping for this card. Array of {role, layerIds[], rasterised?}. Empty = unmapped.';

-- Guard the container shape only. Validating each entry belongs in the app,
-- where the role list lives and a bad mapping can be reported to the admin.
DO $$
BEGIN
  ALTER TABLE public.website_invitations_products
    ADD CONSTRAINT website_invitations_products_field_bindings_is_array
    CHECK (jsonb_typeof(field_bindings) = 'array');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Finding the cards still needing a mapping is the Card Designer's main query.
CREATE INDEX IF NOT EXISTS website_invitations_products_unmapped_idx
  ON public.website_invitations_products ((jsonb_array_length(field_bindings)))
  WHERE jsonb_array_length(field_bindings) = 0;
