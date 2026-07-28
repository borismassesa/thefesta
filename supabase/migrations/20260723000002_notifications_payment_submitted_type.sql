-- Give manual "payment under review" notifications their own type so the bell
-- can show a payment icon instead of the generic system bell. Extends the
-- notifications type CHECK (last set in 20260716170000_opuspass_gift_registry).
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'rsvp_received',
    'pledge_received',
    'payment_confirmed',
    'payment_submitted',
    'guestbook_received',
    'gift_claimed',
    'system'
  ));
