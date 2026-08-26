CREATE OR REPLACE FUNCTION finish_tenant_rental(
    p_tenant_id UUID,
    p_end_date DATE,
    p_final_amount NUMERIC,
    p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    tenant_row tenants%ROWTYPE;
    v_charge tenant_payment_charges%ROWTYPE;
    v_due_date DATE;
BEGIN
    IF p_end_date IS NULL OR p_end_date > CURRENT_DATE THEN
        RAISE EXCEPTION 'Rental end date must not be in the future';
    END IF;
    IF p_final_amount IS NULL OR p_final_amount < 0 THEN
        RAISE EXCEPTION 'Final amount must not be negative';
    END IF;
    IF NULLIF(BTRIM(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'Rental end reason is required';
    END IF;

    SELECT * INTO tenant_row
    FROM tenants
    WHERE id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;
    IF tenant_row.bike_id IS NULL THEN RAISE EXCEPTION 'Tenant has no active rental'; END IF;

    PERFORM close_tenant_rental(p_tenant_id, p_end_date);

    SELECT * INTO v_charge
    FROM tenant_payment_charges
    WHERE tenant_id = p_tenant_id
      AND period_start <= p_end_date
      AND period_end = p_end_date
    ORDER BY is_automatic ASC, due_date DESC, created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        v_due_date := CASE
            WHEN EXISTS (
                SELECT 1
                FROM tenant_payment_charges AS other_charge
                WHERE other_charge.tenant_id = p_tenant_id
                  AND other_charge.due_date = p_end_date
                  AND other_charge.id <> v_charge.id
            )
            THEN v_charge.due_date
            ELSE p_end_date
        END;

        UPDATE tenant_payment_charges
        SET due_date = v_due_date,
            amount = p_final_amount,
            status = CASE WHEN p_final_amount = 0 THEN 'waived' ELSE 'open' END,
            is_automatic = FALSE,
            comment = 'Завершение аренды: ' || BTRIM(p_reason)
        WHERE id = v_charge.id;
    ELSE
        INSERT INTO tenant_payment_charges (
            tenant_id,
            due_date,
            period_start,
            period_end,
            amount,
            comment,
            status,
            is_automatic
        )
        VALUES (
            p_tenant_id,
            p_end_date,
            p_end_date,
            p_end_date,
            p_final_amount,
            'Завершение аренды: ' || BTRIM(p_reason),
            CASE WHEN p_final_amount = 0 THEN 'waived' ELSE 'open' END,
            FALSE
        );
    END IF;

    UPDATE bikes
    SET status = 'available'
    WHERE id = tenant_row.bike_id;

    UPDATE tenants
    SET bike_id = NULL,
        next_payment_date = NULL,
        next_payment_amount = NULL,
        next_payment_comment = NULL
    WHERE id = p_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION finish_tenant_rental(UUID, DATE, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finish_tenant_rental(UUID, DATE, NUMERIC, TEXT) TO authenticated;
