-- Backfill structured add-ons onto historical order lines.
--
-- Order lines have always recorded add-ons as display strings
-- ("25 premium printed cards"). That is the copy the customer saw, and it stays
-- — but it is a bad source of truth for fulfilment: the quantity is a bare
-- prefix and the noun is a CMS title that has already drifted (the
-- 'paper-prints' add-on shipped as both "Paper prints" and "Premium printed
-- cards", so both spellings exist in live orders).
--
-- Checkout now writes `addOnItems: [{code,label,qty,amount}]` alongside the
-- strings. This adds the same structure to the rows that predate it, so the
-- Card Designer queue reads one shape for every order instead of parsing.
--
-- Deliberately conservative:
--   * `addOns` is never modified — the customer-facing record is untouched.
--   * A line is only rewritten when EVERY one of its labels is recognised.
--     A partial mapping would look authoritative while under-counting a print
--     run, which is worse than leaving the line to the app's fallback parser
--     (which reports what it couldn't read).
--   * No `amount` is written. A label carries no price, and a fabricated 0
--     would silently zero out any total summed from these entries.
--   * Lines that already have addOnItems are left alone, so this is re-runnable.
--
-- Verified before applying: all 41 live order lines, 11 with add-ons, produce
-- exactly 4 distinct labels and zero unmapped nouns.

WITH lines AS (
  SELECT o.id AS order_id, t.idx, t.item
  FROM public.invitation_orders o,
       jsonb_array_elements(o.items) WITH ORDINALITY t(item, idx)
  WHERE o.items IS NOT NULL
    AND jsonb_typeof(o.items) = 'array'
),
coded AS (
  SELECT
    l.order_id,
    l.idx,
    a.label,
    -- Leading integer, tolerating thousands separators; absent = a flat add-on.
    CASE
      WHEN a.label ~ '^\d'
        THEN (regexp_replace(substring(a.label FROM '^[\d,\s]+'), '[,\s]', '', 'g'))::int
      ELSE 1
    END AS qty,
    -- Keep this list in step with LABEL_ALIASES in
    -- apps/opus_admin/src/lib/cms/order-add-ons.ts.
    CASE lower(btrim(regexp_replace(a.label, '^\d[\d,\s]*\s+', '')))
      WHEN 'paper prints' THEN 'paper-prints'
      WHEN 'paper print' THEN 'paper-prints'
      WHEN 'premium printed cards' THEN 'paper-prints'
      WHEN 'premium printed card' THEN 'paper-prints'
      WHEN 'printed cards' THEN 'paper-prints'
      WHEN 'on-site attendant' THEN 'door-scan'
      WHEN 'on-site scanning attendant' THEN 'door-scan'
      WHEN 'onsite attendant' THEN 'door-scan'
      WHEN 'door scan' THEN 'door-scan'
      ELSE NULL
    END AS code
  FROM lines l,
       jsonb_array_elements_text(COALESCE(l.item -> 'addOns', '[]'::jsonb)) a(label)
),
per_line AS (
  SELECT
    order_id,
    idx,
    bool_and(code IS NOT NULL) AS all_recognised,
    jsonb_agg(
      jsonb_build_object('code', code, 'label', label, 'qty', qty)
      ORDER BY label
    ) AS add_on_items
  FROM coded
  GROUP BY order_id, idx
),
rebuilt AS (
  SELECT
    l.order_id,
    jsonb_agg(
      CASE
        WHEN p.all_recognised AND NOT (l.item ? 'addOnItems')
          THEN l.item || jsonb_build_object('addOnItems', p.add_on_items)
        ELSE l.item
      END
      ORDER BY l.idx
    ) AS items,
    bool_or(p.all_recognised AND NOT (l.item ? 'addOnItems')) AS changed
  FROM lines l
  LEFT JOIN per_line p ON p.order_id = l.order_id AND p.idx = l.idx
  GROUP BY l.order_id
)
UPDATE public.invitation_orders o
SET items = r.items
FROM rebuilt r
WHERE r.order_id = o.id
  AND r.changed;
