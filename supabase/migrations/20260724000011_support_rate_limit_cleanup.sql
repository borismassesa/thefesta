-- Keep support_rate_limits from growing unbounded.
--
-- The original support_rate_limit_hit() never removed old buckets, so every
-- unique IP / conversation key persisted forever. Mirror checkin_rate_limit's
-- self-cleaning behaviour: probabilistically prune rows whose window closed
-- over an hour ago (well past any 60-300s limit window), so the sweep cost is
-- amortised across calls instead of running on every hit.

CREATE OR REPLACE FUNCTION public.support_rate_limit_hit(
  p_bucket text,
  p_limit int,
  p_window_seconds int
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int;
BEGIN
  -- Amortised cleanup of long-expired buckets (~1% of calls).
  IF random() < 0.01 THEN
    DELETE FROM support_rate_limits WHERE window_start < now() - interval '1 hour';
  END IF;

  INSERT INTO support_rate_limits (bucket_key, window_start, count)
  VALUES (p_bucket, now(), 1)
  ON CONFLICT (bucket_key) DO UPDATE
    SET count = CASE
          WHEN support_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          THEN 1
          ELSE support_rate_limits.count + 1
        END,
        window_start = CASE
          WHEN support_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          THEN now()
          ELSE support_rate_limits.window_start
        END
  RETURNING count INTO v_count;
  RETURN v_count <= p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.support_rate_limit_hit(text, int, int) FROM PUBLIC;
