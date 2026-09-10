BEGIN;

CREATE OR REPLACE FUNCTION public.claim_payment_query(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
v_now timestamptz := clock_timestamp();
  v_count integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required';
END IF;

INSERT INTO public.payment_query_limits AS limits (
    user_id,
    next_allowed_at
  )
VALUES (
    p_user_id,
    v_now + interval '5 seconds'
    )
ON CONFLICT (user_id)
    DO UPDATE
           SET next_allowed_at = excluded.next_allowed_at
       WHERE limits.next_allowed_at <= v_now;

GET DIAGNOSTICS v_count = ROW_COUNT;

RETURN v_count = 1;
END;
$$;

REVOKE EXECUTE
    ON FUNCTION public.claim_payment_query(uuid)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.claim_payment_query(uuid)
  TO service_role;

COMMIT;