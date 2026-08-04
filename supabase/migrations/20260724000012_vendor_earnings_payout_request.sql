-- Self-serve payout requests. A product vendor can "cash out" their available
-- (pending) balance to flag it for the next weekly Monday payout batch. This is
-- a REQUEST stamp only — money still moves manually via finance (admin Vendor
-- Payouts) until an automated disbursement rail lands. Settling a row
-- (status -> 'paid_out') makes the stamp moot, so no cleanup is needed.

ALTER TABLE public.vendor_earnings
  ADD COLUMN IF NOT EXISTS payout_requested_at timestamptz;

-- Finance sorts the queue by who asked to be paid first.
CREATE INDEX IF NOT EXISTS idx_vendor_earnings_requested
  ON public.vendor_earnings (payout_requested_at)
  WHERE status = 'pending' AND payout_requested_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
