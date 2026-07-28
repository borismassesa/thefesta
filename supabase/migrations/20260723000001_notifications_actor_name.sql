-- Optional display name of the person a notification is ABOUT: the guest who
-- RSVP'd, pledged, claimed a gift, or left a guestbook note. Powers the initials
-- avatar in the navbar notification bell. NULL for actor-less notifications
-- (payment under review, system messages), which fall back to a type icon.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_name TEXT;
