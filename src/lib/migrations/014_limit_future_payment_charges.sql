WITH ranked_future_charges AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY tenant_id
            ORDER BY due_date, id
        ) AS future_position
    FROM tenant_payment_charges
    WHERE due_date > CURRENT_DATE
)
DELETE FROM tenant_payment_charges AS charge
USING ranked_future_charges AS ranked
WHERE charge.id = ranked.id
  AND ranked.future_position > 1;

CREATE OR REPLACE FUNCTION ensure_tenant_payment_charges(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    tenant_row tenants%ROWTYPE;
    term_row tenant_payment_terms%ROWTYPE;
    period_start DATE;
    period_end DATE := CURRENT_DATE + 7;
    term_end DATE;
BEGIN
    SELECT * INTO tenant_row FROM tenants WHERE id = p_tenant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tenant not found';
    END IF;

    FOR term_row IN
        SELECT *
        FROM tenant_payment_terms
        WHERE tenant_id = p_tenant_id
        ORDER BY effective_from
    LOOP
        period_start := term_row.effective_from;
        term_end := period_end;
        IF term_row.effective_to IS NOT NULL THEN
            term_end := LEAST(term_end, term_row.effective_to);
        END IF;

        INSERT INTO tenant_payment_charges (tenant_id, due_date, amount)
        SELECT p_tenant_id, due_date::date, term_row.weekly_payment
        FROM generate_series(period_start, term_end, INTERVAL '1 day') AS due_date
        WHERE EXTRACT(ISODOW FROM due_date) = term_row.payment_day
        ON CONFLICT (tenant_id, due_date) DO NOTHING;
    END LOOP;

    IF tenant_row.next_payment_date IS NOT NULL THEN
        INSERT INTO tenant_payment_charges (tenant_id, due_date, amount, comment)
        VALUES (
            p_tenant_id,
            tenant_row.next_payment_date,
            COALESCE(tenant_row.next_payment_amount, tenant_row.weekly_payment, 0),
            tenant_row.next_payment_comment
        )
        ON CONFLICT (tenant_id, due_date) DO UPDATE
        SET amount = EXCLUDED.amount,
            comment = EXCLUDED.comment;
    END IF;

    WITH ranked_future_charges AS (
        SELECT
            id,
            ROW_NUMBER() OVER (ORDER BY due_date, id) AS future_position
        FROM tenant_payment_charges
        WHERE tenant_id = p_tenant_id
          AND due_date > CURRENT_DATE
    )
    DELETE FROM tenant_payment_charges AS charge
    USING ranked_future_charges AS ranked
    WHERE charge.id = ranked.id
      AND ranked.future_position > 1;
END;
$$;

REVOKE ALL ON FUNCTION ensure_tenant_payment_charges(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_tenant_payment_charges(UUID) TO authenticated;
