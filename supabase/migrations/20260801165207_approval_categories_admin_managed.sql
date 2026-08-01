-- CAPTURED FROM PRODUCTION. Applied to the live database as version
-- 20260801165207 via MCP apply_migration and never committed. Recovered from
-- supabase_migrations.schema_migrations and reproduced verbatim.
--
-- This was the Approvals release blocker: queries.ts, actions.ts and
-- category-actions.ts all read and write approval_categories, and several code
-- comments assert the foreign key created at the bottom of this file, but no
-- repo migration created either. A staging environment provisioned from
-- migrations had no catalog table, so listApprovalCategories() returned empty,
-- isValidCategory() rejected everything, and no request could be created at
-- all. Production was fine; only the repo could not reproduce it.

-- Admin-managed approval request types.
--
-- The catalog was a hardcoded array in data.ts AND a CHECK constraint listing
-- the same nine keys, so adding a request type meant a code change plus a
-- migration. Owner/admin now create them from the UI.
--
-- The field schema lives in `fields` as the same ApprovalField[] the form
-- already renders, so an admin-created type gets the identical form engine as
-- the built-in ones. There is no second rendering path.

CREATE TABLE IF NOT EXISTS approval_categories (
  -- URL-safe and stable. Referenced by approval_requests.category, so it is
  -- deliberately not editable once rows exist (enforced by the FK below).
  key text PRIMARY KEY CHECK (key ~ '^[a-z0-9][a-z0-9-]*$'),
  label text NOT NULL CHECK (length(btrim(label)) > 0),
  blurb text NOT NULL DEFAULT '',
  -- Must match ApprovalGroupKey in types.ts.
  group_key text NOT NULL CHECK (group_key IN
    ('travel', 'finance', 'procurement', 'hr', 'legal', 'workplace')),
  accent text NOT NULL DEFAULT '#5B2D8E' CHECK (accent ~ '^#[0-9A-Fa-f]{6}$'),
  tint   text NOT NULL DEFAULT '#EFE3F8' CHECK (tint   ~ '^#[0-9A-Fa-f]{6}$'),
  -- Constrained to the icons the client actually bundles. A free-text icon
  -- name would render nothing and look like a broken card.
  icon_key text NOT NULL DEFAULT 'FileCheck2' CHECK (icon_key IN
    ('Plane','PackageOpen','FileCheck2','FileSignature','Wallet','Car','UserPlus','ShoppingCart','FileText')),
  -- ApprovalField[]: [{ id, label, kind, required?, placeholder?, hint? }]
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Retire a type without deleting it. Existing requests keep resolving their
  -- label; the type just stops being offered in the Create catalog.
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_by_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_categories_listing
  ON approval_categories (group_key, sort_order, label);

DROP TRIGGER IF EXISTS trg_approval_categories_updated_at ON approval_categories;
CREATE TRIGGER trg_approval_categories_updated_at
  BEFORE UPDATE ON approval_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the nine built-ins so nothing in flight breaks. ON CONFLICT DO NOTHING
-- keeps this safe to re-run and stops it clobbering later admin edits.
INSERT INTO approval_categories (key, label, blurb, group_key, accent, tint, icon_key, sort_order, fields) VALUES
 ('business-trip','Business Trip','Travel auth, itinerary, location & dates.','travel','#7E5896','#F0DFF6','Plane',10,
  '[{"id":"subject","label":"Approval Subject","kind":"text","required":true,"placeholder":"Short summary, e.g. Q2 vendor visit"},{"id":"period","label":"Period","kind":"date-range","required":true},{"id":"location","label":"Location","kind":"text","required":true,"placeholder":"e.g. Brussels"},{"id":"description","label":"Description","kind":"textarea","required":true,"placeholder":"Provide context, business justification and any links…"}]'::jsonb),
 ('car-rental','Bolt Service','Bolt rides for client visits, events or staff travel.','travel','#205A9E','#E1ECF9','Car',20,
  '[{"id":"subject","label":"Approval Subject","kind":"text","required":true,"placeholder":"Short summary, e.g. Q2 vendor visit"},{"id":"period","label":"Period","kind":"date-range","required":true},{"id":"pickup","label":"Pickup location","kind":"text","placeholder":"e.g. JNIA Airport"},{"id":"dropoff","label":"Dropoff location","kind":"text","placeholder":"e.g. Serena Hotel"},{"id":"vehicle-type","label":"Bolt category","kind":"text","placeholder":"e.g. Bolt, Bolt XL, Bolt Lite"},{"id":"amount","label":"Estimated amount","kind":"amount"},{"id":"description","label":"Description","kind":"textarea","required":true,"placeholder":"Provide context, business justification and any links…"}]'::jsonb),
 ('payment-application','Payment Application','Request a payment to vendor, partner or staff.','finance','#9B1D4C','#FCE4EC','Wallet',10,
  '[{"id":"subject","label":"Approval Subject","kind":"text","required":true,"placeholder":"Short summary, e.g. Q2 vendor visit"},{"id":"payee","label":"Payee","kind":"text","required":true,"placeholder":"Beneficiary name"},{"id":"amount","label":"Amount","kind":"amount","required":true},{"id":"due-date","label":"Due date","kind":"date"},{"id":"reference","label":"Reference","kind":"text","placeholder":"Invoice #, PO #"},{"id":"description","label":"Description","kind":"textarea","required":true,"placeholder":"Provide context, business justification and any links…"}]'::jsonb),
 ('procurement','Procurement','Purchase request — goods or services.','procurement','#5B2D8E','#EFE3F8','ShoppingCart',10,
  '[{"id":"subject","label":"Approval Subject","kind":"text","required":true,"placeholder":"Short summary, e.g. Q2 vendor visit"},{"id":"vendor","label":"Preferred vendor","kind":"text","placeholder":"Supplier name"},{"id":"products","label":"Products / services","kind":"list","required":true},{"id":"amount","label":"Estimated amount","kind":"amount","required":true},{"id":"needed-by","label":"Needed by","kind":"date"},{"id":"description","label":"Description","kind":"textarea","required":true,"placeholder":"Provide context, business justification and any links…"}]'::jsonb),
 ('rfq','Create RFQ','Issue a request for quotation to vendors.','procurement','#1F5D8C','#E5F2FB','FileText',20,
  '[{"id":"subject","label":"Approval Subject","kind":"text","required":true,"placeholder":"Short summary, e.g. Q2 vendor visit"},{"id":"category-tag","label":"RFQ category","kind":"text","placeholder":"e.g. Catering, AV, Print"},{"id":"products","label":"Line items","kind":"list","required":true},{"id":"closing-date","label":"Quote closing date","kind":"date","required":true},{"id":"amount","label":"Budget ceiling","kind":"amount"},{"id":"description","label":"Description","kind":"textarea","required":true,"placeholder":"Provide context, business justification and any links…"}]'::jsonb),
 ('job-referral-award','Job Referral Award','Bonus payout when a referred hire passes probation.','hr','#7E5896','#F0DFF6','UserPlus',10,
  '[{"id":"subject","label":"Approval Subject","kind":"text","required":true,"placeholder":"Short summary, e.g. Q2 vendor visit"},{"id":"referrer","label":"Referrer (employee)","kind":"text","required":true},{"id":"candidate","label":"Hired candidate","kind":"text","required":true},{"id":"role","label":"Hired role","kind":"text"},{"id":"hire-date","label":"Hire date","kind":"date"},{"id":"amount","label":"Award amount","kind":"amount","required":true},{"id":"description","label":"Description","kind":"textarea","required":true,"placeholder":"Provide context, business justification and any links…"}]'::jsonb),
 ('contract-approval','Contract Approval','Vendor / partner / service contracts.','legal','#8A5A09','#FEF3DB','FileSignature',10,
  '[{"id":"subject","label":"Approval Subject","kind":"text","required":true,"placeholder":"Short summary, e.g. Q2 vendor visit"},{"id":"contact","label":"Contact","kind":"text","required":true,"placeholder":"Counterparty"},{"id":"amount","label":"Amount","kind":"amount","required":true},{"id":"reference","label":"Reference","kind":"text","placeholder":"Contract ref"},{"id":"description","label":"Description","kind":"textarea","required":true,"placeholder":"Provide context, business justification and any links…"}]'::jsonb),
 ('borrow-items','Borrow Items','Equipment or asset loans with return dates.','workplace','#1F5D8C','#E5F2FB','PackageOpen',10,
  '[{"id":"subject","label":"Approval Subject","kind":"text","required":true,"placeholder":"Short summary, e.g. Q2 vendor visit"},{"id":"period","label":"Period","kind":"date-range","required":true},{"id":"products","label":"Products","kind":"list","required":true,"placeholder":"Item, qty"},{"id":"description","label":"Description","kind":"textarea","required":true,"placeholder":"Provide context, business justification and any links…"}]'::jsonb),
 ('general-approval','General Approval','Anything that doesn''t fit a dedicated workflow.','workplace','#5B7F5B','#E6F1E6','FileCheck2',20,
  '[{"id":"subject","label":"Approval Subject","kind":"text","required":true,"placeholder":"Short summary, e.g. Q2 vendor visit"},{"id":"date","label":"Date","kind":"date"},{"id":"period","label":"Period","kind":"date-range"},{"id":"location","label":"Location","kind":"text","placeholder":"e.g. Dar es Salaam HQ"},{"id":"contact","label":"Contact","kind":"text","placeholder":"Counterparty or contact person"},{"id":"amount","label":"Amount","kind":"amount"},{"id":"reference","label":"Reference","kind":"text","placeholder":"PO #, contract ref, etc."},{"id":"products","label":"Products","kind":"list","placeholder":"Item, qty"},{"id":"description","label":"Description","kind":"textarea","required":true,"placeholder":"Provide context, business justification and any links…"}]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Only now that every existing value is seeded can the hardcoded CHECK go and
-- the FK come in. RESTRICT, not CASCADE: deleting a type that has requests
-- would orphan or destroy them, so it must be refused. Retire via active=false.
ALTER TABLE approval_requests DROP CONSTRAINT IF EXISTS approval_requests_category_check;
ALTER TABLE approval_requests DROP CONSTRAINT IF EXISTS approval_requests_category_fkey;
ALTER TABLE approval_requests
  ADD CONSTRAINT approval_requests_category_fkey
  FOREIGN KEY (category) REFERENCES approval_categories(key) ON DELETE RESTRICT ON UPDATE CASCADE;

-- The catalog is a menu of request types, not confidential data: any workforce
-- reader may read it. Writes are service-role only; the server actions gate on
-- owner/admin.
ALTER TABLE approval_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS approval_categories_read ON approval_categories;
CREATE POLICY approval_categories_read ON approval_categories
  FOR SELECT TO authenticated USING (is_workforce_reader());

COMMENT ON TABLE approval_categories IS
  'Admin-managed approval request types. `fields` is the ApprovalField[] schema the request form renders, so admin-created types use the same form engine as the built-ins. Retire with active=false; deletion is RESTRICTed while requests reference the key.';

NOTIFY pgrst, 'reload schema';
