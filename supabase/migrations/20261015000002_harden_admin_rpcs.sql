-- Defense in depth for admin-only RPCs.
--
-- Table RLS already restricts these operations to admin_users, but the
-- functions below are SECURITY INVOKER without an explicit role check, so a
-- non-admin caller gets a confusing RLS/oracle error instead of a clean 403.
-- The guards below fail fast with a permission error before any data access.
--
-- (Tenant slug uniqueness is already enforced by the baseline schema
-- `slug TEXT NOT NULL UNIQUE`, so the client-side uniqueSlug race resolves
-- to a constraint error rather than a duplicate row.)

-- Explicit admin guards on the money-moving approval RPCs.
CREATE OR REPLACE FUNCTION public.approve_payment_request(
    p_request_id UUID,
    p_payment_date DATE,
    p_admin_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE request_row public.payment_requests%ROWTYPE;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only admins can approve payment requests' USING ERRCODE = '42501';
    END IF;
    IF p_payment_date IS NULL OR p_payment_date > CURRENT_DATE THEN
        RAISE EXCEPTION 'Payment date must not be in the future';
    END IF;
    SELECT * INTO request_row FROM public.payment_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND OR request_row.status <> 'pending' THEN RAISE EXCEPTION 'Pending payment request not found'; END IF;

    PERFORM public.record_tenant_payment(
        request_row.tenant_id,
        request_row.amount,
        p_payment_date,
        CASE WHEN request_row.payment_method = 'cash'
            THEN 'Наличные · заявка ' || request_row.id::TEXT
            ELSE 'Банковская оплата · заявка ' || request_row.id::TEXT END
    );
    UPDATE public.payment_requests
    SET status = 'approved', admin_note = COALESCE(NULLIF(BTRIM(p_admin_note), ''), admin_note),
        processed_at = NOW(), processed_by = auth.uid()
    WHERE id = p_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_payment_request(p_request_id UUID, p_admin_note TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only admins can reject payment requests' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(BTRIM(p_admin_note), '') IS NULL THEN RAISE EXCEPTION 'Rejection reason is required'; END IF;
    UPDATE public.payment_requests
    SET status = 'rejected', admin_note = BTRIM(p_admin_note), processed_at = NOW(), processed_by = auth.uid()
    WHERE id = p_request_id AND status = 'pending';
    IF NOT FOUND THEN RAISE EXCEPTION 'Pending payment request not found'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_payment_request(UUID, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_payment_request(UUID, DATE, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.reject_payment_request(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_payment_request(UUID, TEXT) TO authenticated;
