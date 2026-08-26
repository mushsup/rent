-- Weekly rent is paid at the start of the covered week.
-- A due date is therefore the period start, not the period end.

UPDATE tenant_payment_charges
SET period_start = due_date,
    period_end = due_date + 6
WHERE is_automatic = TRUE;

CREATE OR REPLACE FUNCTION ensure_tenant_payment_charges(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    tenant_row tenants%ROWTYPE;
    v_due_date DATE;
    v_next_due_date DATE;
    v_due_amount NUMERIC;
    v_payment_day INTEGER;
BEGIN
    SELECT * INTO tenant_row FROM tenants WHERE id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;

    IF tenant_row.is_archived OR tenant_row.bike_id IS NULL OR tenant_row.weekly_payment <= 0 THEN
        DELETE FROM tenant_payment_charges
        WHERE tenant_id = p_tenant_id
          AND due_date > CURRENT_DATE
          AND is_automatic = TRUE;
        RETURN;
    END IF;

    v_payment_day := COALESCE(tenant_row.payment_day, EXTRACT(ISODOW FROM tenant_row.next_payment_date)::INTEGER, 1);
    v_due_date := COALESCE(
        tenant_row.next_payment_date,
        CURRENT_DATE + MOD(v_payment_day - EXTRACT(ISODOW FROM CURRENT_DATE)::INTEGER + 7, 7)
    );

    WHILE v_due_date <= CURRENT_DATE LOOP
        v_due_amount := GREATEST(COALESCE(
            CASE WHEN v_due_date = tenant_row.next_payment_date THEN tenant_row.next_payment_amount END,
            (SELECT term.weekly_payment
             FROM tenant_payment_terms AS term
             WHERE term.tenant_id = p_tenant_id
               AND term.effective_from <= v_due_date
               AND (term.effective_to IS NULL OR term.effective_to >= v_due_date)
             ORDER BY term.effective_from DESC LIMIT 1),
            tenant_row.weekly_payment, 0
        ), 0);

        INSERT INTO tenant_payment_charges (
            tenant_id, due_date, period_start, period_end, amount, comment, is_automatic
        ) VALUES (
            p_tenant_id, v_due_date, v_due_date, v_due_date + 6, v_due_amount,
            COALESCE(CASE WHEN v_due_date = tenant_row.next_payment_date THEN tenant_row.next_payment_comment END, 'Автоматически создано'),
            TRUE
        )
        ON CONFLICT (tenant_id, due_date) DO UPDATE
        SET period_start = EXCLUDED.period_start,
            period_end = EXCLUDED.period_end,
            amount = CASE WHEN tenant_payment_charges.is_automatic THEN EXCLUDED.amount ELSE tenant_payment_charges.amount END;

        v_due_date := v_due_date + 7;
    END LOOP;

    v_next_due_date := v_due_date;
    v_due_amount := GREATEST(COALESCE(
        (SELECT term.weekly_payment
         FROM tenant_payment_terms AS term
         WHERE term.tenant_id = p_tenant_id
           AND term.effective_from <= v_next_due_date
           AND (term.effective_to IS NULL OR term.effective_to >= v_next_due_date)
         ORDER BY term.effective_from DESC LIMIT 1),
        tenant_row.weekly_payment, 0
    ), 0);

    INSERT INTO tenant_payment_charges (
        tenant_id, due_date, period_start, period_end, amount, comment, is_automatic
    ) VALUES (
        p_tenant_id, v_next_due_date, v_next_due_date, v_next_due_date + 6,
        v_due_amount, 'Автоматически создано', TRUE
    )
    ON CONFLICT (tenant_id, due_date) DO UPDATE
    SET period_start = EXCLUDED.period_start,
        period_end = EXCLUDED.period_end,
        amount = CASE WHEN tenant_payment_charges.is_automatic THEN EXCLUDED.amount ELSE tenant_payment_charges.amount END;

    UPDATE tenants
    SET next_payment_date = v_next_due_date,
        next_payment_amount = v_due_amount
    WHERE id = p_tenant_id;

    DELETE FROM tenant_payment_charges
    WHERE tenant_id = p_tenant_id
      AND due_date > v_next_due_date
      AND is_automatic = TRUE;
END;
$$;
