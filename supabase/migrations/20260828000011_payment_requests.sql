CREATE TABLE public.payment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    client_note TEXT,
    admin_note TEXT,
    appointment_at TIMESTAMPTZ,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    processed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX payment_requests_pending_idx ON public.payment_requests(status, requested_at)
    WHERE status = 'pending';
CREATE INDEX payment_requests_tenant_idx ON public.payment_requests(tenant_id, requested_at DESC);

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Administrators can manage payment requests" ON public.payment_requests
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE ALL ON public.payment_requests FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.payment_requests TO authenticated;

CREATE TRIGGER payment_requests_touch_updated_at
BEFORE UPDATE ON public.payment_requests
FOR EACH ROW EXECUTE FUNCTION public.touch_beta_rental_updated_at();

CREATE OR REPLACE FUNCTION public.approve_payment_request(p_request_id UUID, p_admin_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE request_row public.payment_requests%ROWTYPE;
BEGIN
    SELECT * INTO request_row FROM public.payment_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND OR request_row.status <> 'pending' THEN RAISE EXCEPTION 'Pending payment request not found'; END IF;
    PERFORM public.record_tenant_payment(request_row.tenant_id, request_row.amount, CURRENT_DATE,
        CASE WHEN request_row.payment_method = 'cash' THEN 'Наличные · заявка ' || request_row.id::TEXT ELSE 'Банковская оплата · заявка ' || request_row.id::TEXT END);
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
    IF NULLIF(BTRIM(p_admin_note), '') IS NULL THEN RAISE EXCEPTION 'Rejection reason is required'; END IF;
    UPDATE public.payment_requests
    SET status = 'rejected', admin_note = BTRIM(p_admin_note), processed_at = NOW(), processed_by = auth.uid()
    WHERE id = p_request_id AND status = 'pending';
    IF NOT FOUND THEN RAISE EXCEPTION 'Pending payment request not found'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_payment_request(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_payment_request(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_payment_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_payment_request(UUID, TEXT) TO authenticated;
