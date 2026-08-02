\set ON_ERROR_STOP on

INSERT INTO public.users (id, email, password, name)
VALUES (
  '02500000-0000-4000-8000-000000000001',
  'services-025@example.invalid',
  'test-only',
  'Migration 025 Test'
);

INSERT INTO public.vendors (
  id,
  slug,
  user_id,
  business_name,
  category,
  services_offered
)
VALUES
  (
    '02500000-0000-4000-8000-000000000011',
    'services-025-null',
    '02500000-0000-4000-8000-000000000001',
    'Null Services',
    'Venues',
    NULL
  ),
  (
    '02500000-0000-4000-8000-000000000012',
    'services-025-empty',
    '02500000-0000-4000-8000-000000000001',
    'Empty Services',
    'Venues',
    ARRAY[]::text[]
  ),
  (
    '02500000-0000-4000-8000-000000000013',
    'services-025-one',
    '02500000-0000-4000-8000-000000000001',
    'One Service',
    'Venues',
    ARRAY['Full Event Planning']
  ),
  (
    '02500000-0000-4000-8000-000000000014',
    'services-025-multiple',
    '02500000-0000-4000-8000-000000000001',
    'Multiple Services',
    'Venues',
    ARRAY['Décor & lighting', 'Guest transport', 'Day-of coordination']
  ),
  (
    '02500000-0000-4000-8000-000000000015',
    'services-025-permissive',
    '02500000-0000-4000-8000-000000000001',
    'Permissive Services',
    'Venues',
    ARRAY['DJ', 'dj', repeat('x', 61)]
  );
