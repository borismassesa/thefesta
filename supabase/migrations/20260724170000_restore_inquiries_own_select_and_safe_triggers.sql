-- Restores schema drift found on `inquiries` that was applied to production
-- directly (outside git-tracked migrations) sometime between 2026-07-22 and
-- 2026-07-24, alongside a policy-naming pass (-> inq_public_create,
-- inq_vendor_read, inq_vendor_write).
--
-- 1. The "Users can view their own inquiries" SELECT policy was dropped.
--    `createBookingInquiry()` (apps/opus_pass_mobile) does
--    `.insert(...).select().single()`, which requires the couple to be able
--    to see the row it just inserted for the RETURNING clause. With no SELECT
--    policy granting that, Postgres raises "new row violates row-level
--    security policy for table \"inquiries\"" even though the INSERT itself
--    is permitted by inq_public_create.
--
-- 2. Two triggers on `inquiries` were also dropped in the same pass:
--    on_inquiry_created (increment_inquiry_count) and
--    update_inquiries_updated_at. Both target tables/columns that still
--    exist, so they're restored here.
--
--    NOT restored: sync_inquiry_availability and
--    trigger_create_message_thread_on_inquiry. Both reference tables that no
--    longer exist (vendor_availability; message_threads/messages, replaced by
--    inquiry_messages) — recreating them would break inquiry updates/inserts
--    rather than fix anything.

DROP POLICY IF EXISTS "inq_own_read" ON inquiries;
CREATE POLICY "inq_own_read" ON inquiries
  FOR SELECT
  USING (requesting_user_id() = user_id);

DROP TRIGGER IF EXISTS on_inquiry_created ON inquiries;
CREATE TRIGGER on_inquiry_created
  AFTER INSERT ON inquiries
  FOR EACH ROW
  EXECUTE FUNCTION increment_inquiry_count();

DROP TRIGGER IF EXISTS update_inquiries_updated_at ON inquiries;
CREATE TRIGGER update_inquiries_updated_at
  BEFORE UPDATE ON inquiries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
