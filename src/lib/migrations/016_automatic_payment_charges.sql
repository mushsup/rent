ALTER TABLE tenant_payment_charges
    ADD COLUMN IF NOT EXISTS is_automatic BOOLEAN NOT NULL DEFAULT TRUE;

CREATE OR REPLACE FUNCTION ensure_tenant_payment_charges(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    tenant_row tenants%ROWTYPE;
    v_due_date DATE;
    v_charge_amount NUMERIC;
    v_next_due_date DATE;
BEGIN
    SELECT * INTO tenant_row
    FROM tenants
    WHERE id = p_tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tenant not found';
    END IF;

    v_due_date := COALESCE(tenant_row.next_payment_date, CURRENT_DATE);
    v_charge_amount := GREATEST(COALESCE(tenant_row.next_payment_amount, tenant_row.weekly_payment, 0), 0);

    -- Materialize every missed weekly charge and the next future charge.
    WHILE v_due_date <= CURRENT_DATE LOOP
        INSERT INTO tenant_payment_charges (tenant_id, due_date, amount, comment, is_automatic)
        VALUES (p_tenant_id, v_due_date, v_charge_amount, 'Автоматически создано', TRUE)
        ON CONFLICT (tenant_id, due_date) DO UPDATE
        SET amount = EXCLUDED.amount,
            is_automatic = TRUE,
            comment = COALESCE(tenant_payment_charges.comment, EXCLUDED.comment);

        v_due_date := v_due_date + 7;
    END LOOP;

    v_next_due_date := v_due_date;

    INSERT INTO tenant_payment_charges (tenant_id, due_date, amount, comment, is_automatic)
    VALUES (p_tenant_id, v_next_due_date, v_charge_amount, 'Автоматически создано', TRUE)
    ON CONFLICT (tenant_id, due_date) DO UPDATE
    SET amount = EXCLUDED.amount,
        is_automatic = TRUE,
        comment = COALESCE(tenant_payment_charges.comment, EXCLUDED.comment);

    UPDATE tenants
    SET next_payment_date = v_next_due_date,
        next_payment_amount = v_charge_amount
    WHERE id = p_tenant_id;

    DELETE FROM tenant_payment_charges
    WHERE tenant_id = p_tenant_id
      AND due_date > v_next_due_date;
END;
$$;

REVOKE ALL ON FUNCTION ensure_tenant_payment_charges(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_tenant_payment_charges(UUID) TO authenticated;
