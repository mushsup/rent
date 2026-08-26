CREATE OR REPLACE FUNCTION upsert_tenant_payment_terms(
    p_tenant_id UUID,
    p_weekly_payment NUMERIC,
    p_payment_day INTEGER,
    p_effective_from DATE DEFAULT CURRENT_DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    IF p_weekly_payment < 0 OR p_payment_day NOT BETWEEN 1 AND 7 THEN
        RAISE EXCEPTION 'Invalid payment terms';
    END IF;

    UPDATE tenant_payment_terms
    SET effective_to = p_effective_from - 1
    WHERE tenant_id = p_tenant_id
      AND effective_to IS NULL
      AND (weekly_payment <> p_weekly_payment OR payment_day <> p_payment_day);

    INSERT INTO tenant_payment_terms (tenant_id, weekly_payment, payment_day, effective_from)
    SELECT p_tenant_id, p_weekly_payment, p_payment_day, p_effective_from
    WHERE NOT EXISTS (
        SELECT 1
        FROM tenant_payment_terms
        WHERE tenant_id = p_tenant_id
          AND effective_to IS NULL
          AND weekly_payment = p_weekly_payment
          AND payment_day = p_payment_day
    );
END;
$$;

REVOKE ALL ON FUNCTION upsert_tenant_payment_terms(UUID, NUMERIC, INTEGER, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_tenant_payment_terms(UUID, NUMERIC, INTEGER, DATE) TO authenticated;
