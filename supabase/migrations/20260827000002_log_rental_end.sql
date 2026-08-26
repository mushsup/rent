-- Keep rental completion in the same event ledger as all other rental changes.
-- The original close workflow is preserved, while prorated charge breakdowns
-- and the end-state snapshot become available to the payment history UI.

CREATE OR REPLACE FUNCTION close_tenant_rental(
    p_tenant_id UUID,
    p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    tenant_row tenants%ROWTYPE;
    bike_row bikes%ROWTYPE;
    v_charge tenant_payment_charges%ROWTYPE;
    calculation JSONB;
BEGIN
    IF p_end_date IS NULL THEN RAISE EXCEPTION 'Rental end date is required'; END IF;

    SELECT * INTO tenant_row
    FROM tenants
    WHERE id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;

    IF tenant_row.bike_id IS NOT NULL THEN
        SELECT * INTO bike_row FROM bikes WHERE id = tenant_row.bike_id;
    END IF;

    SELECT * INTO v_charge
    FROM tenant_payment_charges
    WHERE tenant_id = p_tenant_id
      AND is_automatic = TRUE
      AND status = 'open'
      AND period_start <= p_end_date
      AND period_end > p_end_date
    ORDER BY period_end
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        calculation := calculate_tenant_rental_period(
            p_tenant_id, v_charge.period_start, p_end_date
        );

        UPDATE tenant_payment_charges
        SET amount = COALESCE((calculation->>'amount')::NUMERIC, 0),
            breakdown = COALESCE(calculation->'segments', '[]'::JSONB),
            period_end = p_end_date,
            is_automatic = FALSE,
            comment = CONCAT(
                'Досрочное завершение аренды: ',
                (p_end_date - v_charge.period_start) + 1,
                ' дн.'
            )
        WHERE id = v_charge.id;
    END IF;

    DELETE FROM tenant_payment_charges
    WHERE tenant_id = p_tenant_id
      AND is_automatic = TRUE
      AND period_start > p_end_date;

    DELETE FROM tenant_payment_terms
    WHERE tenant_id = p_tenant_id
      AND effective_from > p_end_date;

    UPDATE tenant_payment_terms
    SET effective_to = p_end_date
    WHERE tenant_id = p_tenant_id
      AND effective_from <= p_end_date
      AND (effective_to IS NULL OR effective_to > p_end_date);

    INSERT INTO tenant_rental_events (
        tenant_id, event_type, effective_date, bike_id, bike_model, bike_type,
        battery_config, weekly_payment, discount_amount, reason, details
    )
    SELECT tenant_row.id, 'rental_ended', p_end_date,
           tenant_row.bike_id, bike_row.model, bike_row.type,
           tenant_row.battery_config, tenant_row.weekly_payment,
           tenant_row.discount_amount, 'Аренда завершена',
           jsonb_build_object('automatic_close', TRUE)
    WHERE tenant_row.bike_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM tenant_rental_events AS event
          WHERE event.tenant_id = p_tenant_id
            AND event.event_type = 'rental_ended'
            AND event.effective_date = p_end_date
      );

    UPDATE tenants
    SET next_payment_date = NULL,
        next_payment_amount = NULL,
        next_payment_comment = NULL
    WHERE id = p_tenant_id;
END;
$$;

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
    calculation JSONB;
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
        calculation := calculate_tenant_rental_period(
            p_tenant_id, p_end_date, p_end_date
        );

        INSERT INTO tenant_payment_charges (
            tenant_id, due_date, period_start, period_end, amount, breakdown,
            comment, status, is_automatic
        )
        VALUES (
            p_tenant_id, p_end_date, p_end_date, p_end_date, p_final_amount,
            COALESCE(calculation->'segments', '[]'::JSONB),
            'Завершение аренды: ' || BTRIM(p_reason),
            CASE WHEN p_final_amount = 0 THEN 'waived' ELSE 'open' END,
            FALSE
        );
    END IF;

    UPDATE tenant_rental_events
    SET amount = p_final_amount,
        reason = BTRIM(p_reason),
        details = details || jsonb_build_object(
            'automatic_close', FALSE,
            'final_amount', p_final_amount
        )
    WHERE tenant_id = p_tenant_id
      AND event_type = 'rental_ended'
      AND effective_date = p_end_date;

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

REVOKE ALL ON FUNCTION close_tenant_rental(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION close_tenant_rental(UUID, DATE) TO authenticated;
REVOKE ALL ON FUNCTION finish_tenant_rental(UUID, DATE, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finish_tenant_rental(UUID, DATE, NUMERIC, TEXT) TO authenticated;
