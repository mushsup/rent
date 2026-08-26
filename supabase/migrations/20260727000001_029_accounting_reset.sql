ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS accounting_start_date DATE,
    ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(10,2) NOT NULL DEFAULT 0;

UPDATE tenants
SET accounting_start_date = COALESCE(accounting_start_date, next_payment_date, CURRENT_DATE)
WHERE accounting_start_date IS NULL;

ALTER TABLE tenants
    ALTER COLUMN accounting_start_date SET DEFAULT CURRENT_DATE,
    ALTER COLUMN accounting_start_date SET NOT NULL;

CREATE OR REPLACE FUNCTION reset_tenant_accounting(
    p_tenant_id UUID,
    p_opening_balance NUMERIC,
    p_accounting_start_date DATE,
    p_next_payment_date DATE,
    p_weekly_payment NUMERIC,
    p_payment_day INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    IF p_opening_balance < 0
       OR p_weekly_payment < 0
       OR p_accounting_start_date IS NULL
       OR p_next_payment_date IS NULL
       OR p_payment_day NOT BETWEEN 1 AND 7 THEN
        RAISE EXCEPTION 'Invalid accounting reset data';
    END IF;

    PERFORM 1 FROM tenants WHERE id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;

    DELETE FROM payments WHERE tenant_id = p_tenant_id;
    DELETE FROM tenant_payment_adjustments WHERE tenant_id = p_tenant_id;
    DELETE FROM tenant_payment_charges WHERE tenant_id = p_tenant_id;
    DELETE FROM tenant_payment_terms WHERE tenant_id = p_tenant_id;

    UPDATE tenants
    SET accounting_start_date = p_accounting_start_date,
        opening_balance = p_opening_balance,
        weekly_payment = p_weekly_payment,
        payment_day = p_payment_day,
        next_payment_date = p_next_payment_date,
        next_payment_amount = p_weekly_payment,
        next_payment_comment = NULL
    WHERE id = p_tenant_id;

    INSERT INTO tenant_payment_terms (tenant_id, weekly_payment, payment_day, effective_from)
    VALUES (p_tenant_id, p_weekly_payment, p_payment_day, p_accounting_start_date);

    PERFORM ensure_tenant_payment_charges(p_tenant_id);
END;
$$;

REVOKE ALL ON FUNCTION reset_tenant_accounting(UUID, NUMERIC, DATE, DATE, NUMERIC, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reset_tenant_accounting(UUID, NUMERIC, DATE, DATE, NUMERIC, INTEGER) TO authenticated;
