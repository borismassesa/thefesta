-- Cover uploads (pledge/collector page) now accept a short video, not just a
-- photo. Raise the bucket's size cap to fit video (25MB, vs 5MB for images —
-- enforced per-type in uploadPledgeCover()) and allow common video mimes.

UPDATE storage.buckets
SET
  file_size_limit = 26214400,
  allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/webp', 'image/avif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
WHERE id = 'pledge-covers';
