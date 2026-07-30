-- Custom Card Commission Service — the structured brief question sets.
-- Spec: OP-CCS-PRD-001 §7.3.
--
-- "Designer requests information based on category" from the notebook flow,
-- moved EARLIER: instead of a designer emailing the customer once work starts,
-- the question set is served immediately after payment. The designer is never
-- blocked, and the SLA clock cannot start until the answers are in, because
-- transition_order() refuses to queue an order with a required answer missing.
--
-- Bilingual on every field. The majority of buyers are on a phone in Kiswahili,
-- and a brief they cannot read is a brief they do not complete.
--
-- Required is used sparingly and deliberately. Every required question is a
-- point at which an order can stall in intake_pending, so only fields a
-- designer genuinely cannot start without are marked required.

INSERT INTO public.brief_questions
  (category_id, key, label_en, label_sw, help_en, help_sw, field_type, options, required, sort_order)
VALUES
  -- ── Wedding ───────────────────────────────────────────────────────────────
  ('wedding', 'couple_names', 'Names of the couple', 'Majina ya wanandoa',
   'Exactly as they should appear on the card.', 'Kama yanavyotakiwa kuonekana kwenye kadi.',
   'text', '[]', TRUE, 1),
  ('wedding', 'event_date', 'Wedding date', 'Tarehe ya harusi',
   NULL, NULL, 'date', '[]', TRUE, 2),
  ('wedding', 'venue', 'Venue name and area', 'Jina la ukumbi na eneo',
   NULL, NULL, 'text', '[]', TRUE, 3),
  ('wedding', 'start_time', 'Start time', 'Muda wa kuanza',
   NULL, NULL, 'text', '[]', FALSE, 4),
  ('wedding', 'style', 'Style you are drawn to', 'Mtindo unaoupenda',
   'Pick the closest — the designer will refine it with you.',
   'Chagua unaokaribiana zaidi. Mbunifu atauboresha pamoja nawe.',
   'choice',
   '["Classic and formal","Floral and romantic","Modern and minimal","Bold and colourful","Traditional Tanzanian"]',
   TRUE, 5),
  ('wedding', 'palette', 'Main colour', 'Rangi kuu',
   NULL, NULL, 'color', '[]', FALSE, 6),
  ('wedding', 'accent_color', 'Accent colour', 'Rangi ya ziada',
   NULL, NULL, 'color', '[]', FALSE, 7),
  ('wedding', 'hosts', 'Hosting line', 'Mstari wa wenyeji',
   'e.g. "Together with their families" or the parents'' names.',
   'Mfano: "Pamoja na familia zao" au majina ya wazazi.',
   'longtext', '[]', FALSE, 8),
  ('wedding', 'references', 'Designs you like', 'Mifano unayoipenda',
   'Screenshots or photos. Up to 10 files.', 'Picha au screenshots. Hadi faili 10.',
   'file', '[]', FALSE, 9),
  ('wedding', 'notes', 'Anything else the designer should know',
   'Kitu kingine chochote mbunifu anapaswa kujua',
   NULL, NULL, 'longtext', '[]', FALSE, 10),

  -- ── Send-off ──────────────────────────────────────────────────────────────
  ('send_off', 'guest_of_honour', 'Guest of honour', 'Mgeni rasmi',
   NULL, NULL, 'text', '[]', TRUE, 1),
  ('send_off', 'event_date', 'Send-off date', 'Tarehe ya send off',
   NULL, NULL, 'date', '[]', TRUE, 2),
  ('send_off', 'venue', 'Venue name and area', 'Jina la ukumbi na eneo',
   NULL, NULL, 'text', '[]', TRUE, 3),
  ('send_off', 'hosts', 'Hosted by', 'Imeandaliwa na',
   NULL, NULL, 'text', '[]', FALSE, 4),
  ('send_off', 'palette', 'Main colour', 'Rangi kuu', NULL, NULL, 'color', '[]', FALSE, 5),
  ('send_off', 'dress_code', 'Dress code', 'Mavazi', NULL, NULL, 'text', '[]', FALSE, 6),
  ('send_off', 'references', 'Designs you like', 'Mifano unayoipenda',
   NULL, NULL, 'file', '[]', FALSE, 7),
  ('send_off', 'notes', 'Anything else', 'Kitu kingine', NULL, NULL, 'longtext', '[]', FALSE, 8),

  -- ── Kitchen party ─────────────────────────────────────────────────────────
  ('kitchen_party', 'guest_of_honour', 'Guest of honour', 'Mgeni rasmi',
   NULL, NULL, 'text', '[]', TRUE, 1),
  ('kitchen_party', 'event_date', 'Date', 'Tarehe', NULL, NULL, 'date', '[]', TRUE, 2),
  ('kitchen_party', 'venue', 'Venue name and area', 'Jina la ukumbi na eneo',
   NULL, NULL, 'text', '[]', TRUE, 3),
  ('kitchen_party', 'hosts', 'Hosted by', 'Imeandaliwa na', NULL, NULL, 'text', '[]', FALSE, 4),
  ('kitchen_party', 'palette', 'Main colour', 'Rangi kuu', NULL, NULL, 'color', '[]', FALSE, 5),
  ('kitchen_party', 'dress_code', 'Dress code', 'Mavazi', NULL, NULL, 'text', '[]', FALSE, 6),
  ('kitchen_party', 'references', 'Designs you like', 'Mifano unayoipenda',
   NULL, NULL, 'file', '[]', FALSE, 7),
  ('kitchen_party', 'notes', 'Anything else', 'Kitu kingine', NULL, NULL, 'longtext', '[]', FALSE, 8),

  -- ── Corporate ─────────────────────────────────────────────────────────────
  -- The only category where brand assets are required: a corporate card
  -- without the correct logo file is a guaranteed revision round.
  ('corporate', 'organisation', 'Organisation name', 'Jina la taasisi',
   NULL, NULL, 'text', '[]', TRUE, 1),
  ('corporate', 'event_name', 'Event name', 'Jina la tukio', NULL, NULL, 'text', '[]', TRUE, 2),
  ('corporate', 'event_date', 'Date', 'Tarehe', NULL, NULL, 'date', '[]', TRUE, 3),
  ('corporate', 'venue', 'Venue', 'Ukumbi', NULL, NULL, 'text', '[]', TRUE, 4),
  ('corporate', 'logo', 'Logo file', 'Faili la nembo',
   'Vector (SVG/AI/PDF) if you have it, otherwise the highest-resolution PNG.',
   'Vector (SVG/AI/PDF) kama unayo, vinginevyo PNG yenye ubora wa juu.',
   'file', '[]', TRUE, 5),
  ('corporate', 'brand_colors', 'Brand colours', 'Rangi za chapa',
   'Hex codes if you have a brand guide.', 'Namba za hex kama una mwongozo wa chapa.',
   'text', '[]', FALSE, 6),
  ('corporate', 'rsvp_contact', 'RSVP contact', 'Mawasiliano ya RSVP',
   NULL, NULL, 'text', '[]', FALSE, 7),
  ('corporate', 'notes', 'Anything else', 'Kitu kingine', NULL, NULL, 'longtext', '[]', FALSE, 8),

  -- ── Birthday ──────────────────────────────────────────────────────────────
  ('birthday', 'celebrant', 'Whose birthday', 'Sherehe ya nani',
   NULL, NULL, 'text', '[]', TRUE, 1),
  ('birthday', 'age', 'Age or milestone', 'Umri au hatua',
   'Leave blank if you would rather not show it.', 'Acha wazi kama hutaki kuonyesha.',
   'text', '[]', FALSE, 2),
  ('birthday', 'event_date', 'Date', 'Tarehe', NULL, NULL, 'date', '[]', TRUE, 3),
  ('birthday', 'venue', 'Venue', 'Ukumbi', NULL, NULL, 'text', '[]', TRUE, 4),
  ('birthday', 'theme', 'Theme', 'Dhamira', NULL, NULL, 'text', '[]', FALSE, 5),
  ('birthday', 'palette', 'Main colour', 'Rangi kuu', NULL, NULL, 'color', '[]', FALSE, 6),
  ('birthday', 'references', 'Designs you like', 'Mifano unayoipenda',
   NULL, NULL, 'file', '[]', FALSE, 7),
  ('birthday', 'notes', 'Anything else', 'Kitu kingine', NULL, NULL, 'longtext', '[]', FALSE, 8),

  -- ── Graduation ────────────────────────────────────────────────────────────
  ('graduation', 'graduate_name', 'Graduate''s name', 'Jina la mhitimu',
   NULL, NULL, 'text', '[]', TRUE, 1),
  ('graduation', 'institution', 'Institution', 'Chuo', NULL, NULL, 'text', '[]', TRUE, 2),
  ('graduation', 'qualification', 'Qualification', 'Shahada / cheti',
   NULL, NULL, 'text', '[]', FALSE, 3),
  ('graduation', 'event_date', 'Date', 'Tarehe', NULL, NULL, 'date', '[]', TRUE, 4),
  ('graduation', 'venue', 'Venue', 'Ukumbi', NULL, NULL, 'text', '[]', TRUE, 5),
  ('graduation', 'palette', 'Main colour', 'Rangi kuu', NULL, NULL, 'color', '[]', FALSE, 6),
  ('graduation', 'photo', 'Photo of the graduate', 'Picha ya mhitimu',
   NULL, NULL, 'file', '[]', FALSE, 7),
  ('graduation', 'notes', 'Anything else', 'Kitu kingine', NULL, NULL, 'longtext', '[]', FALSE, 8)
ON CONFLICT (category_id, key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
