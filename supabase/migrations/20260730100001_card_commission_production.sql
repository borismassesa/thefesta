-- Custom Card Commission Service — brief, production, revisions and remedies.
-- Specs: OP-CCS-PRD-001 §7.3, §7.6, §7.11; OP-CCS-TDD-001 §3.2.2, §3.3.
--
-- These tables exist in this migration rather than a later one because
-- refund_entitlement() is anchored to them. The policy in PRD §7.11.1 grades
-- entitlement by HOW MUCH DESIGN WORK HAS BEEN CONSUMED, and every tier is
-- anchored to a stored timestamp or a row count — never to an operator's
-- assessment of effort. So the function cannot be written until the rows it
-- counts exist, and no refund figure may be computed anywhere else.

-- ─────────────────────────────────────────────────────────────────────────────
--  Designers
-- ─────────────────────────────────────────────────────────────────────────────
-- Every card is produced by an OpusFesta employee on the OpusStudio ladder.
-- There is no freelance pool, no vendor design partner and no overflow capacity
-- to buy (PRD §4.1). The consequence encoded here: sum(capacity) across active
-- profiles IS the throughput ceiling of the whole feature. The assignment
-- engine cannot spill over, so Admin needs a visible warning as queued volume
-- approaches it.

CREATE TABLE IF NOT EXISTS public.designer_profiles (
  -- The employee, not a Clerk id: matches invitation_card_designs.assigned_to
  -- and keeps one identity for a designer across both design surfaces.
  employee_id  UUID PRIMARY KEY REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  -- OpusStudio ladder. Matters beyond load balancing: Signature and corporate
  -- orders route to associate or above, and assistant-grade work is QA'd by a
  -- lead before it reaches the customer.
  studio_grade TEXT NOT NULL DEFAULT 'assistant'
    CHECK (studio_grade IN ('assistant', 'operator', 'associate', 'senior_associate', 'lead', 'head')),
  -- card_categories ids this designer can take.
  categories   TEXT[] NOT NULL DEFAULT '{}',
  -- Concurrent open tasks, set by grade.
  capacity     INTEGER NOT NULL DEFAULT 5 CHECK (capacity >= 0),
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  -- Excluded from auto-assign while set.
  on_leave_until DATE,
  last_assigned_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.designer_profiles IS
  'In-house designers available to the commission queue. sum(capacity) where active is the hard throughput ceiling of the feature — there is no freelance overflow (PRD §4.1).';

CREATE INDEX IF NOT EXISTS designer_profiles_assignable_idx
  ON public.designer_profiles (active, last_assigned_at)
  WHERE active = TRUE;

-- ─────────────────────────────────────────────────────────────────────────────
--  Structured brief
-- ─────────────────────────────────────────────────────────────────────────────
-- "Designer requests information based on category" moves EARLIER than the
-- notebook flow had it, into a structured intake form served immediately after
-- payment, so the designer is never blocked waiting on an email.

CREATE TABLE IF NOT EXISTS public.brief_questions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id TEXT NOT NULL REFERENCES public.card_categories(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,   -- couple_names, venue, palette, motif…
  label_en    TEXT NOT NULL,
  label_sw    TEXT NOT NULL,
  help_en     TEXT,
  help_sw     TEXT,
  field_type  TEXT NOT NULL
    CHECK (field_type IN ('text', 'longtext', 'date', 'color', 'choice', 'file')),
  -- Choice options; also carries per-type config (e.g. max files).
  options     JSONB NOT NULL DEFAULT '[]'::jsonb,
  required    BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (category_id, key)
);

COMMENT ON TABLE public.brief_questions IS
  'Per-category question set for the structured brief. An order cannot enter queued until every active required question for its category is answered.';

CREATE TABLE IF NOT EXISTS public.order_briefs (
  order_id     UUID PRIMARY KEY REFERENCES public.card_orders(id) ON DELETE CASCADE,
  -- { question key -> answer }. Free-shaped because the question set is data,
  -- not schema; validated against brief_questions on write.
  answers      JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(answers) = 'object'),
  -- Uploaded reference material: [{ path, name, size, content_type }].
  -- Max 10 files, 15 MB each, images and PDF only, content-type sniffed
  -- server-side — never trusted from the client.
  attachments  JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(attachments) = 'array'
           AND jsonb_array_length(attachments) <= 10),
  -- The 100% refund tier is anchored to this being NULL: deposit confirmed but
  -- brief incomplete means we have not yet asked anyone to do any work.
  completed_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.order_briefs.completed_at IS
  'Anchors the 100% refund tier in refund_entitlement(). NULL means no design work has been commissioned yet.';

-- A designer may raise a clarification mid-design; it pauses the SLA clock
-- until answered, so a designer is never measured against time they spent
-- waiting on the customer.
CREATE TABLE IF NOT EXISTS public.brief_clarifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES public.card_orders(id) ON DELETE CASCADE,
  asked_by    UUID REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  question    TEXT NOT NULL CHECK (length(btrim(question)) > 0),
  answer      TEXT,
  asked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS brief_clarifications_open_idx
  ON public.brief_clarifications (order_id)
  WHERE answered_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
--  Versions and revisions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.design_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES public.card_orders(id) ON DELETE CASCADE,
  version_no      INTEGER NOT NULL CHECK (version_no >= 1),
  designer_id     UUID REFERENCES public.workforce_employees(id) ON DELETE SET NULL,

  -- Private bucket paths. No public URLs anywhere in this feature.
  svg_path        TEXT NOT NULL,
  -- Watermarked, reduced-resolution PNG. The ONLY thing the customer can see
  -- before settlement — the watermark is composited server-side across the
  -- artwork, not stamped in a corner (loophole L14).
  preview_path    TEXT NOT NULL,
  -- 1080x1350 clean master. Generated at SETTLED, never at approval, so an
  -- unpaid order has no releasable artefact sitting in storage at all.
  master_png_path TEXT,

  -- Extracted data-op-field map, so OpusPass can substitute guest names.
  layer_schema    JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- What the SVG validator found. Stored so QA and the designer see exactly
  -- what failed rather than a bare rejection.
  validator_report JSONB NOT NULL DEFAULT '{}'::jsonb,

  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  qa_passed_at    TIMESTAMPTZ,
  qa_by           UUID REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  qa_note         TEXT,
  approved_at     TIMESTAMPTZ,

  UNIQUE (order_id, version_no)
);

COMMENT ON COLUMN public.design_versions.master_png_path IS
  'Written only at settlement. Keeping the clean master out of storage until the balance is verified means a leaked signed URL cannot expose it (loophole L14).';

CREATE INDEX IF NOT EXISTS design_versions_order_idx
  ON public.design_versions (order_id, version_no DESC);

CREATE TABLE IF NOT EXISTS public.revision_rounds (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES public.card_orders(id) ON DELETE CASCADE,
  round_no      INTEGER NOT NULL CHECK (round_no >= 1),
  from_version  INTEGER NOT NULL,
  requested_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- [{ element, type, comment }] — the designer's task list for this round.
  items         JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(items) = 'array'),

  -- "Errors are not revisions" (PRD §7.11.6) has to be enforced in the product,
  -- not just written in the policy. The customer-facing revision form carries
  -- an explicit "this is a mistake, not a change" path; choosing it sets this
  -- flag and routes straight to rework WITHOUT touching the allowance. Support
  -- can also reclassify a round after the fact, which restores the allowance
  -- and writes an audit event.
  is_correction BOOLEAN NOT NULL DEFAULT FALSE,
  -- True when the allowance was already spent and the customer accepted a
  -- top-up charge to open this round.
  billable      BOOLEAN NOT NULL DEFAULT FALSE,
  -- The 'topup' payment row. It raises total_tzs and is collected WITH the
  -- balance rather than as a separate transaction — one payment at the end,
  -- which is how customers expect this to work.
  topup_payment_id UUID REFERENCES public.order_payments(id) ON DELETE SET NULL,

  opened_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at     TIMESTAMPTZ,

  UNIQUE (order_id, round_no),
  -- A correction is free by definition; it can never carry a charge.
  CONSTRAINT revision_rounds_correction_is_free
    CHECK (NOT is_correction OR (billable = FALSE AND topup_payment_id IS NULL))
);

COMMENT ON COLUMN public.revision_rounds.is_correction IS
  'TRUE = something we got wrong (misspelling, wrong date, broken file). Free, unlimited, and does NOT decrement the revision allowance. This distinction is enforced here so the policy is unenforceable-proof rather than aspirational.';

CREATE INDEX IF NOT EXISTS revision_rounds_order_idx
  ON public.revision_rounds (order_id, round_no DESC);

-- ─────────────────────────────────────────────────────────────────────────────
--  Refund entitlement — computed, never argued
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'card_refund_reason') THEN
    CREATE TYPE public.card_refund_reason AS ENUM (
      'customer_cancelled', 'event_cancelled', 'event_postponed_declined',
      'opusfesta_fault', 'sla_breach', 'defective_deliverable',
      'force_majeure', 'duplicate_payment', 'other'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'card_refund_state') THEN
    CREATE TYPE public.card_refund_state AS ENUM
      ('requested', 'approved', 'rejected', 'disbursed', 'failed');
  END IF;
END $$;

-- The tier table from PRD §7.11.1 lives in exactly one place, and nothing else
-- is allowed to decide entitlement. Every tier is anchored to a stored
-- timestamp or row count.
--
-- The CASE is evaluated from MOST work done to LEAST, deliberately: a status
-- label that lags reality must not be able to inflate entitlement. An order
-- still reading `in_design` after a QA bounce, but with a version already
-- shared, correctly returns 30 rather than 60.
CREATE OR REPLACE FUNCTION public.refund_entitlement(p_order_id UUID)
RETURNS INTEGER                       -- percentage of the DEPOSIT PAID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN o.approved_at IS NOT NULL                                          THEN 0
    WHEN (SELECT count(*) FROM public.revision_rounds r
            WHERE r.order_id = o.id) >= 1                                   THEN 10
    WHEN (SELECT count(*) FROM public.design_versions v
            WHERE v.order_id = o.id) >= 1                                   THEN 30
    WHEN o.accepted_at IS NOT NULL                                          THEN 60
    WHEN o.assigned_at IS NOT NULL                                          THEN 80
    WHEN b.completed_at IS NOT NULL                                         THEN 90
    WHEN o.status IN ('deposit_paid', 'intake_pending')                     THEN 100
    ELSE 0
  END
  FROM public.card_orders o
  LEFT JOIN public.order_briefs b ON b.order_id = o.id
  WHERE o.id = p_order_id;
$$;

COMMENT ON FUNCTION public.refund_entitlement(UUID) IS
  'PRD §7.11.1 tier table, in code. Percentage of the deposit paid. Anchored to timestamps and row counts only, so no operator can quietly grant a full refund at client_review under pressure (loophole L11).';

REVOKE ALL ON FUNCTION public.refund_entitlement(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_entitlement(UUID) TO service_role;

CREATE TABLE IF NOT EXISTS public.refund_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES public.card_orders(id) ON DELETE CASCADE,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Requests arrive in-app, by WhatsApp or by phone; all are logged against
  -- the order regardless of channel.
  requested_via   TEXT NOT NULL CHECK (requested_via IN ('app', 'whatsapp', 'phone', 'email')),
  requested_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- Snapshotted at REQUEST time so our own processing delay cannot devalue the
  -- claim. This is the single most important pair of columns in the table.
  status_at_request public.card_order_status NOT NULL,
  entitled_pct    INTEGER NOT NULL CHECK (entitled_pct BETWEEN 0 AND 100),
  entitled_tzs    INTEGER NOT NULL CHECK (entitled_tzs >= 0),

  reason          public.card_refund_reason NOT NULL,
  customer_note   TEXT,
  state           public.card_refund_state NOT NULL DEFAULT 'requested',
  resolution      TEXT CHECK (resolution IN ('cash', 'credit_note', 'rework', 'postponement')),

  approved_by     UUID REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  approver_note   TEXT,
  -- TRUE = granted outside the tier table. Requires the platform.admin
  -- permission and writes an admin-only audit event.
  policy_exception BOOLEAN NOT NULL DEFAULT FALSE,

  -- Verified against card_orders.buyer_phone before release; a change requires
  -- a second approver (loophole L20).
  payout_msisdn   TEXT,
  -- The negative ledger row. A refund is never a deletion or an edit of the
  -- original payment.
  payment_id      UUID REFERENCES public.order_payments(id) ON DELETE SET NULL,
  disbursed_at    TIMESTAMPTZ,
  failure_note    TEXT,

  -- Rejecting or excepting is a decision someone has to own and explain.
  CONSTRAINT refund_requests_decision_is_attributable CHECK (
    state IN ('requested')
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  ),
  CONSTRAINT refund_requests_exception_needs_note CHECK (
    NOT policy_exception OR length(btrim(coalesce(approver_note, ''))) > 0
  )
);

COMMENT ON COLUMN public.refund_requests.entitled_pct IS
  'Frozen from refund_entitlement() at the moment the request was logged, not when Finance got to it. Fault-based reasons bypass the tier entirely at 100%.';

CREATE INDEX IF NOT EXISTS refund_requests_open_idx
  ON public.refund_requests (state, requested_at)
  WHERE state IN ('requested', 'approved');
CREATE INDEX IF NOT EXISTS refund_requests_order_idx
  ON public.refund_requests (order_id);

-- ─────────────────────────────────────────────────────────────────────────────
--  Credit notes
-- ─────────────────────────────────────────────────────────────────────────────
-- Offered as an alternative to any cash refund at 110% of the refundable
-- amount. Protects cash flow and is usually more attractive to the customer
-- than the cash. Also the standing, no-questions-asked answer when an event is
-- called off (PRD §7.11.4) — documented as the default response so front-line
-- staff can offer it immediately without escalating.

CREATE TABLE IF NOT EXISTS public.credit_notes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  order_id      UUID REFERENCES public.card_orders(id) ON DELETE SET NULL,
  holder_phone  TEXT NOT NULL,
  value_tzs     INTEGER NOT NULL CHECK (value_tzs > 0),
  -- Supports partial redemption across several orders.
  balance_tzs   INTEGER NOT NULL CHECK (balance_tzs >= 0),
  -- Not extended by partial redemption.
  expires_at    TIMESTAMPTZ NOT NULL,
  transferable  BOOLEAN NOT NULL DEFAULT TRUE,
  transferred_at TIMESTAMPTZ,          -- one transfer only
  issued_by     UUID REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT credit_notes_balance_within_value CHECK (balance_tzs <= value_tzs)
);

CREATE TABLE IF NOT EXISTS public.credit_note_redemptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id UUID NOT NULL REFERENCES public.credit_notes(id) ON DELETE CASCADE,
  order_id       UUID NOT NULL REFERENCES public.card_orders(id) ON DELETE CASCADE,
  amount_tzs     INTEGER NOT NULL CHECK (amount_tzs > 0),
  -- The discount row this redemption created, so redeeming a credit note is
  -- visible in the same ledger as every other money movement.
  payment_id     UUID REFERENCES public.order_payments(id) ON DELETE SET NULL,
  redeemed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_notes_holder_idx
  ON public.credit_notes (holder_phone)
  WHERE balance_tzs > 0;
CREATE INDEX IF NOT EXISTS credit_note_redemptions_note_idx
  ON public.credit_note_redemptions (credit_note_id);

-- ─────────────────────────────────────────────────────────────────────────────
--  updated_at
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS designer_profiles_touch ON public.designer_profiles;
CREATE TRIGGER designer_profiles_touch
  BEFORE UPDATE ON public.designer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_card_commission_row();

DROP TRIGGER IF EXISTS order_briefs_touch ON public.order_briefs;
CREATE TRIGGER order_briefs_touch
  BEFORE UPDATE ON public.order_briefs
  FOR EACH ROW EXECUTE FUNCTION public.touch_card_commission_row();

NOTIFY pgrst, 'reload schema';
