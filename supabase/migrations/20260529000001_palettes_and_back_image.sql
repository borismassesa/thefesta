-- Add full palette objects and back-card image to invitation products.
-- Also seeds the ticket products (p23, p24) which were bundled-only until now.

-- The product-table migration was captured later (20260712000005) even though
-- production already had the table when this palette migration ran. Declare
-- that canonical base shape idempotently so a zero-state replay has the same
-- prerequisite. The later migration adds its indexes, trigger, RLS policy and
-- bundled catalog seed.
create table if not exists website_invitations_products (
  id text primary key,
  slug text unique not null,
  name text not null,
  designer text not null default '',
  category text not null default '',
  price_was int,
  price_now int not null default 0,
  digital_unit_price int not null default 0,
  free_sample boolean not null default false,
  swatches jsonb not null default '[]'::jsonb,
  treatment text not null default 'classic-serif',
  image_url text not null default '',
  gallery jsonb not null default '[]'::jsonb,
  published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table website_invitations_products
  add column if not exists palettes jsonb not null default '[]'::jsonb,
  add column if not exists back_image_url text not null default '';

-- Seed ticket products — ON CONFLICT DO NOTHING keeps admin edits intact.
insert into website_invitations_products
  (id, slug, name, designer, category, price_now, digital_unit_price, free_sample, swatches, treatment, sort_order, palettes)
values
  (
    'p23',
    'p23',
    'Heritage Script Wedding Event Ticket',
    'Mzimbazi Studio',
    'Event Tickets',
    85000,
    7000,
    true,
    '["#f5f0ea","#1A1208","#F5EFE3","#1A1A1A"]'::jsonb,
    'ticket',
    230,
    '[
      {"name":"Parchment & Gold","background":"#f5f0ea","surface":"#ffffff","accent":"#ab8d53","textPrimary":"#3a2d1f","textSecondary":"#ab8d53","muted":"rgba(106,86,64,0.8)"},
      {"name":"Midnight Gold","background":"#1A1208","surface":"#ffffff","accent":"#C8A35C","textPrimary":"#FBF5E8","textSecondary":"#C8A35C","muted":"rgba(200,163,92,0.75)"},
      {"name":"Ivory & Crimson","background":"#F5EFE3","surface":"#ffffff","accent":"#7A1F2B","textPrimary":"#1A1A1A","textSecondary":"#7A1F2B","muted":"rgba(122,31,43,0.7)"},
      {"name":"Onyx & Gold","background":"#1A1A1A","surface":"#ffffff","accent":"#C8A35C","textPrimary":"#F5EFE3","textSecondary":"#C8A35C","muted":"rgba(200,163,92,0.7)"}
    ]'::jsonb
  ),
  (
    'p24',
    'p24',
    'Heritage Script Wedding Event Ticket with Barcode',
    'Mzimbazi Studio',
    'Event Tickets',
    90000,
    7000,
    true,
    '["#f5f0ea","#1A1208","#F5EFE3","#1A1A1A"]'::jsonb,
    'ticket-barcode',
    240,
    '[
      {"name":"Parchment & Gold","background":"#f5f0ea","surface":"#ffffff","accent":"#ab8d53","textPrimary":"#3a2d1f","textSecondary":"#ab8d53","muted":"rgba(106,86,64,0.8)"},
      {"name":"Midnight Gold","background":"#1A1208","surface":"#ffffff","accent":"#C8A35C","textPrimary":"#FBF5E8","textSecondary":"#C8A35C","muted":"rgba(200,163,92,0.75)"},
      {"name":"Ivory & Crimson","background":"#F5EFE3","surface":"#ffffff","accent":"#7A1F2B","textPrimary":"#1A1A1A","textSecondary":"#7A1F2B","muted":"rgba(122,31,43,0.7)"},
      {"name":"Onyx & Gold","background":"#1A1A1A","surface":"#ffffff","accent":"#C8A35C","textPrimary":"#F5EFE3","textSecondary":"#C8A35C","muted":"rgba(200,163,92,0.7)"}
    ]'::jsonb
  )
on conflict (id) do nothing;
