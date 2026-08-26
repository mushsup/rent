CREATE OR REPLACE FUNCTION record_tenant_payment(
    p_tenant_id UUID,
    p_amount NUMERIC,
    p_payment_date DATE,
    p_comment TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    tenant_row tenants%ROWTYPE;
    created_payment_id UUID;
    current_next_date DATE;
    payment_day INTEGER;
    days_until_payment INTEGER;
BEGIN
    IF p_amount < 0 THEN
        RAISE EXCEPTION 'Payment amount cannot be negative';
    END IF;

    SELECT * INTO tenant_row
    FROM tenants
    WHERE id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tenant not found';
    END IF;

    INSERT INTO payments (tenant_id, amount, payment_date, comment)
    VALUES (p_tenant_id, p_amount, p_payment_date, NULLIF(BTRIM(p_comment), ''))
    RETURNING id INTO created_payment_id;

    current_next_date := COALESCE(tenant_row.next_payment_date, p_payment_date);
    payment_day := COALESCE(tenant_row.payment_day, 1);
    days_until_payment := MOD(payment_day - EXTRACT(ISODOW FROM current_next_date)::INTEGER + 7, 7);
    IF days_until_payment = 0 THEN
        days_until_payment := 7;
    END IF;

    UPDATE tenants
    SET next_payment_date = current_next_date + days_until_payment
    WHERE id = p_tenant_id;

    RETURN created_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION record_tenant_payment(UUID, NUMERIC, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_tenant_payment(UUID, NUMERIC, DATE, TEXT) TO authenticated;
