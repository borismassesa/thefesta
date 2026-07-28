-- Studio Page Sections — CMS-editable content blocks for homepage and other pages

create table if not exists studio_page_sections (
  id uuid primary key default gen_random_uuid(),
  page_key text not null,
  section_key text not null,
  content jsonb not null default '{}',
  is_published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(page_key, section_key)
);

-- Updated-at trigger
create or replace function update_studio_page_sections_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_studio_page_sections_updated_at
  before update on studio_page_sections
  for each row execute function update_studio_page_sections_updated_at();

-- RLS
alter table studio_page_sections enable row level security;

create policy "Service role full access on studio_page_sections"
  on studio_page_sections for all
  using (true)
  with check (true);

-- Seed homepage sections with current hardcoded content
insert into studio_page_sections (page_key, section_key, content, sort_order) values
(
  'home', 'hero',
  '{
    "tagline": "Full-Service Production Studio",
    "heading_line1": "CINEMATIC",
    "heading_line2": "VISUAL STORIES",
    "description": "We produce commercial films, documentaries, music videos, and branded campaigns from concept through final delivery.",
    "video_url": "/videos/hero-bg.mp4",
    "cta1_text": "Explore Journal",
    "cta1_url": "/journal",
    "cta2_text": "View Services",
    "cta2_url": "/services",
    "client_count": "500+ Clients",
    "client_avatars": [
      "https://randomuser.me/api/portraits/men/32.jpg",
      "https://randomuser.me/api/portraits/women/44.jpg",
      "https://randomuser.me/api/portraits/men/75.jpg"
    ]
  }'::jsonb,
  1
),
(
  'home', 'stats',
  '{
    "items": [
      {"value": "200+", "label": "Projects Delivered"},
      {"value": "8+", "label": "Years Experience"},
      {"value": "4.9", "label": "Client Rating"},
      {"value": "50+", "label": "Awards & Features"}
    ]
  }'::jsonb,
  2
),
(
  'home', 'clients',
  '{
    "label": "Featured In",
    "names": ["Vogue", "Tatler", "Harper''s Bazaar", "The Ritz", "Claridge''s", "Harrods", "Fortnum & Mason", "Rolls-Royce"]
  }'::jsonb,
  3
),
(
  'home', 'about',
  '{
    "tagline": "About the Studio",
    "heading": "We don''t just document moments — we craft visual stories that live forever.",
    "description": "OpusStudio is a team of filmmakers, photographers, and creative directors who believe every milestone deserves a cinematic treatment. From intimate elopements to 500-guest galas, we bring the same obsessive attention to light, composition, and narrative.",
    "button_text": "Our Story",
    "button_url": "/about"
  }'::jsonb,
  4
),
(
  'home', 'process',
  '{
    "tagline": "How It Works",
    "description": "From first contact to final delivery. Four clear steps, zero surprises.",
    "steps": [
      {"title": "ENQUIRY", "description": "Tell us about your event, your vision, and the moments that matter most. We respond within 48-72 hours.", "detail": "Free consultation call"},
      {"title": "PLANNING", "description": "We build a custom timeline and shot list tailored to your day. Every angle, every detail, mapped out in advance.", "detail": "Bespoke creative brief"},
      {"title": "SHOOT DAY", "description": "Our team arrives early, captures everything — the quiet moments, the big reveals, the in-betweens nobody else notices.", "detail": "Full-day coverage"},
      {"title": "DELIVERY", "description": "Cinematic edits, colour-graded photos, and a private online gallery — delivered within 4–6 weeks.", "detail": "Private gallery access"}
    ]
  }'::jsonb,
  5
),
(
  'home', 'cta',
  '{
    "tagline": "Ready to Start?",
    "heading_line1": "LET''S MAKE",
    "heading_line2": "SOMETHING",
    "heading_line3": "UNFORGETTABLE.",
    "description": "Whether it''s a wedding, a product launch, or a milestone celebration — we''d love to hear about it."
  }'::jsonb,
  6
)
on conflict (page_key, section_key) do nothing;
