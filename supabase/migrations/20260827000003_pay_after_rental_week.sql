-- Rent is paid in arrears: a due date closes the preceding seven-day period.
-- Reference dates can be supplied by the client so accounting is not coupled
-- to the database host's calendar.

DO $$
DECLARE
    tenant_row RECORD;
BEGIN
    FOR tenant_row IN
        SELECT tenant.id, tenant.accounting_start_date
        FROM tenants AS tenant
        WHERE tenant.bike_id IS NOT NULL
          AND tenant.next_payment_date = tenant.accounting_start_date
          AND EXISTS (
              SELECT 1 FROM tenant_payment_charges AS charge
              WHERE charge.tenant_id = tenant.id
                AND charge.due_date = tenant.accounting_start_date
                AND charge.is_automatic = TRUE
          )
    LOOP
        IF EXISTS (
            SELECT 1 FROM tenant_payment_charges
            WHERE tenant_id = tenant_row.id
              AND due_date = tenant_row.accounting_start_date + 7
        ) THEN
            DELETE FROM tenant_payment_charges
            WHERE tenant_id = tenant_row.id
              AND due_date = tenant_row.accounting_start_date
              AND is_automatic = TRUE;
        ELSE
            UPDATE tenant_payment_charges
            SET due_date = tenant_row.accounting_start_date + 7,
                period_start = tenant_row.accounting_start_date,
                period_end = tenant_row.accounting_start_date + 6
            WHERE tenant_id = tenant_row.id
              AND due_date = tenant_row.accounting_start_date
              AND is_automatic = TRUE;
        END IF;

        UPDATE tenants
        SET next_payment_date = tenant_row.accounting_start_date + 7
        WHERE id = tenant_row.id;
    END LOOP;
END;
$$;

UPDATE tenant_payment_charges
SET period_start = due_date - 7,
    period_end = due_date - 1
WHERE is_automatic = TRUE;

DROP FUNCTION IF EXISTS ensure_tenant_payment_charges(UUID);
CREATE OR REPLACE FUNCTION ensure_tenant_payment_charges(
    p_tenant_id UUID,
    p_reference_date DATE DEFAULT CURRENT_DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    tenant_row tenants%ROWTYPE;
    v_due_date DATE;
    v_next_due_date DATE;
    calculation JSONB;
BEGIN
    IF p_reference_date IS NULL THEN RAISE EXCEPTION 'Reference date is required'; END IF;

    SELECT * INTO tenant_row FROM tenants WHERE id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;

    IF tenant_row.is_archived OR tenant_row.bike_id IS NULL OR tenant_row.weekly_payment <= 0 THEN
        DELETE FROM tenant_payment_charges
        WHERE tenant_id = p_tenant_id
          AND due_date > p_reference_date
          AND is_automatic = TRUE;
        RETURN;
    END IF;

    v_due_date := COALESCE(
        tenant_row.next_payment_date,
        tenant_row.accounting_start_date + 7,
        p_reference_date + 7
    );

    WHILE v_due_date <= p_reference_date LOOP
        calculation := calculate_tenant_rental_period(
            p_tenant_id, v_due_date - 7, v_due_date - 1
        );

        INSERT INTO tenant_payment_charges (
            tenant_id, due_date, period_start, period_end, amount, breakdown,
            comment, is_automatic
        ) VALUES (
            p_tenant_id, v_due_date, v_due_date - 7, v_due_date - 1,
            COALESCE((calculation->>'amount')::NUMERIC, tenant_row.weekly_payment),
            COALESCE(calculation->'segments', '[]'::JSONB),
            COALESCE(
                CASE WHEN v_due_date = tenant_row.next_payment_date
                    THEN tenant_row.next_payment_comment END,
                'Автоматически создано'
            ),
            TRUE
        )
        ON CONFLICT (tenant_id, due_date) DO UPDATE
        SET period_start = CASE WHEN tenant_payment_charges.is_automatic THEN EXCLUDED.period_start ELSE tenant_payment_charges.period_start END,
            period_end = CASE WHEN tenant_payment_charges.is_automatic THEN EXCLUDED.period_end ELSE tenant_payment_charges.period_end END,
            amount = CASE WHEN tenant_payment_charges.is_automatic THEN EXCLUDED.amount ELSE tenant_payment_charges.amount END,
            breakdown = CASE WHEN tenant_payment_charges.is_automatic THEN EXCLUDED.breakdown ELSE tenant_payment_charges.breakdown END;

        v_due_date := v_due_date + 7;
    END LOOP;

    v_next_due_date := v_due_date;
    calculation := calculate_tenant_rental_period(
        p_tenant_id, v_next_due_date - 7, v_next_due_date - 1
    );

    INSERT INTO tenant_payment_charges (
        tenant_id, due_date, period_start, period_end, amount, breakdown,
        comment, is_automatic
    ) VALUES (
        p_tenant_id, v_next_due_date, v_next_due_date - 7, v_next_due_date - 1,
        COALESCE((calculation->>'amount')::NUMERIC, tenant_row.weekly_payment),
        COALESCE(calculation->'segments', '[]'::JSONB),
        'Автоматически создано', TRUE
    )
    ON CONFLICT (tenant_id, due_date) DO UPDATE
    SET period_start = CASE WHEN tenant_payment_charges.is_automatic THEN EXCLUDED.period_start ELSE tenant_payment_charges.period_start END,
        period_end = CASE WHEN tenant_payment_charges.is_automatic THEN EXCLUDED.period_end ELSE tenant_payment_charges.period_end END,
        amount = CASE WHEN tenant_payment_charges.is_automatic THEN EXCLUDED.amount ELSE tenant_payment_charges.amount END,
        breakdown = CASE WHEN tenant_payment_charges.is_automatic THEN EXCLUDED.breakdown ELSE tenant_payment_charges.breakdown END;

    UPDATE tenants
    SET next_payment_date = v_next_due_date,
        next_payment_amount = COALESCE((calculation->>'amount')::NUMERIC, tenant_row.weekly_payment)
    WHERE id = p_tenant_id;

    DELETE FROM tenant_payment_charges
    WHERE tenant_id = p_tenant_id
      AND due_date > v_next_due_date
      AND is_automatic = TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION ensure_all_tenant_payment_charges(p_reference_date DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    tenant_id UUID;
BEGIN
    IF p_reference_date IS NULL THEN RAISE EXCEPTION 'Reference date is required'; END IF;
    FOR tenant_id IN
        SELECT id FROM tenants WHERE bike_id IS NOT NULL AND is_archived = FALSE
    LOOP
        PERFORM ensure_tenant_payment_charges(tenant_id, p_reference_date);
    END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS update_tenant_profile(UUID, TEXT, TEXT, UUID, NUMERIC, INTEGER, DATE, NUMERIC, TEXT, TEXT, TEXT, TEXT, NUMERIC);
CREATE OR REPLACE FUNCTION update_tenant_profile(
    p_tenant_id UUID,
    p_name TEXT,
    p_slug TEXT,
    p_bike_id UUID,
    p_weekly_payment NUMERIC,
    p_payment_day INTEGER,
    p_next_payment_date DATE,
    p_deposit NUMERIC,
    p_admin_comment TEXT,
    p_phone TEXT DEFAULT NULL,
    p_telegram_username TEXT DEFAULT NULL,
    p_battery_config TEXT DEFAULT NULL,
    p_discount_amount NUMERIC DEFAULT 0,
    p_effective_date DATE DEFAULT CURRENT_DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    tenant_row tenants%ROWTYPE;
    previous_tenant_id UUID;
    new_bike bikes%ROWTYPE;
    v_next_payment_date DATE;
    v_days_until_payment INTEGER;
    v_event_type TEXT;
    v_change_count INTEGER := 0;
BEGIN
    IF p_weekly_payment < 0 OR p_payment_day NOT BETWEEN 1 AND 7
       OR p_discount_amount < 0 OR p_discount_amount > 20
       OR p_effective_date IS NULL THEN
        RAISE EXCEPTION 'Invalid tenant payment terms';
    END IF;

    SELECT * INTO tenant_row FROM tenants WHERE id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;
    IF tenant_row.is_archived AND p_bike_id IS NOT NULL THEN
        RAISE EXCEPTION 'Unarchive tenant before assigning a bike';
    END IF;

    IF p_bike_id IS NOT NULL THEN
        SELECT * INTO new_bike FROM bikes WHERE id = p_bike_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Bike not found'; END IF;
        SELECT id INTO previous_tenant_id FROM tenants
        WHERE bike_id = p_bike_id AND id <> p_tenant_id FOR UPDATE;
        IF previous_tenant_id IS NOT NULL THEN
            PERFORM close_tenant_rental(previous_tenant_id, p_effective_date);
            UPDATE tenants SET bike_id = NULL WHERE id = previous_tenant_id;
        END IF;
    END IF;

    IF p_bike_id IS NULL AND tenant_row.bike_id IS NOT NULL THEN
        PERFORM close_tenant_rental(p_tenant_id, p_effective_date);
        UPDATE bikes SET status = 'available' WHERE id = tenant_row.bike_id;
    ELSIF tenant_row.bike_id IS DISTINCT FROM p_bike_id THEN
        UPDATE bikes SET status = 'available' WHERE id = tenant_row.bike_id;
        UPDATE bikes SET status = 'in_rent' WHERE id = p_bike_id;
    END IF;

    IF p_bike_id IS NULL THEN
        v_next_payment_date := NULL;
    ELSE
        v_next_payment_date := COALESCE(
            p_next_payment_date,
            tenant_row.next_payment_date,
            p_effective_date + 7
        );
        IF p_payment_day IS DISTINCT FROM tenant_row.payment_day THEN
            v_days_until_payment := MOD(
                p_payment_day - EXTRACT(ISODOW FROM v_next_payment_date)::INTEGER + 7, 7
            );
            v_next_payment_date := v_next_payment_date + v_days_until_payment;
        END IF;
    END IF;

    v_change_count :=
        (CASE WHEN tenant_row.bike_id IS DISTINCT FROM p_bike_id THEN 1 ELSE 0 END) +
        (CASE WHEN tenant_row.battery_config IS DISTINCT FROM NULLIF(BTRIM(p_battery_config), '') THEN 1 ELSE 0 END) +
        (CASE WHEN tenant_row.weekly_payment IS DISTINCT FROM p_weekly_payment THEN 1 ELSE 0 END) +
        (CASE WHEN tenant_row.discount_amount IS DISTINCT FROM p_discount_amount THEN 1 ELSE 0 END);

    v_event_type := CASE
        WHEN v_change_count > 1 THEN 'terms_changed'
        WHEN tenant_row.bike_id IS DISTINCT FROM p_bike_id THEN 'bike_changed'
        WHEN tenant_row.battery_config IS DISTINCT FROM NULLIF(BTRIM(p_battery_config), '') THEN 'battery_changed'
        WHEN tenant_row.weekly_payment IS DISTINCT FROM p_weekly_payment THEN 'rate_changed'
        WHEN tenant_row.discount_amount IS DISTINCT FROM p_discount_amount THEN 'discount_changed'
        ELSE NULL
    END;

    UPDATE tenants
    SET name = p_name,
        slug = p_slug,
        bike_id = p_bike_id,
        weekly_payment = p_weekly_payment,
        payment_day = p_payment_day,
        next_payment_date = v_next_payment_date,
        next_payment_amount = CASE WHEN p_bike_id IS NULL THEN NULL ELSE GREATEST(p_weekly_payment - p_discount_amount, 0) END,
        discount_amount = p_discount_amount,
        deposit = p_deposit,
        admin_comment = p_admin_comment,
        phone = NULLIF(BTRIM(p_phone), ''),
        telegram_username = NULLIF(BTRIM(p_telegram_username), ''),
        battery_config = NULLIF(BTRIM(p_battery_config), '')
    WHERE id = p_tenant_id;

    IF p_bike_id IS NOT NULL THEN
        PERFORM upsert_tenant_payment_terms(
            p_tenant_id, p_weekly_payment, p_payment_day,
            p_effective_date, p_discount_amount
        );

        IF v_event_type IS NOT NULL THEN
            INSERT INTO tenant_rental_events (
                tenant_id, event_type, effective_date, bike_id, bike_model, bike_type,
                battery_config, weekly_payment, discount_amount, reason, details
            ) VALUES (
                p_tenant_id, v_event_type, p_effective_date,
                p_bike_id, new_bike.model, new_bike.type,
                NULLIF(BTRIM(p_battery_config), ''), p_weekly_payment,
                p_discount_amount, 'Условия аренды изменены',
                jsonb_build_object(
                    'previous', jsonb_build_object(
                        'bike_id', tenant_row.bike_id,
                        'battery_config', tenant_row.battery_config,
                        'weekly_payment', tenant_row.weekly_payment,
                        'discount_amount', tenant_row.discount_amount
                    ),
                    'current', jsonb_build_object(
                        'bike_id', p_bike_id,
                        'battery_config', NULLIF(BTRIM(p_battery_config), ''),
                        'weekly_payment', p_weekly_payment,
                        'discount_amount', p_discount_amount
                    )
                )
            );
        END IF;

        PERFORM ensure_tenant_payment_charges(p_tenant_id, p_effective_date);
        PERFORM refresh_tenant_rental_charges(p_tenant_id, p_effective_date);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION create_tenant_with_rental(
    p_name TEXT,
    p_slug TEXT,
    p_bike_id UUID,
    p_weekly_payment NUMERIC,
    p_payment_day INTEGER,
    p_first_payment_date DATE,
    p_deposit NUMERIC,
    p_phone TEXT DEFAULT NULL,
    p_telegram_username TEXT DEFAULT NULL,
    p_battery_config TEXT DEFAULT NULL,
    p_discount_amount NUMERIC DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    created_tenant_id UUID;
    previous_tenant_id UUID;
    selected_bike bikes%ROWTYPE;
BEGIN
    IF NULLIF(BTRIM(p_name), '') IS NULL OR NULLIF(BTRIM(p_slug), '') IS NULL THEN
        RAISE EXCEPTION 'Tenant name and slug are required';
    END IF;
    IF p_weekly_payment < 0 OR p_payment_day NOT BETWEEN 1 AND 7
       OR p_discount_amount < 0 OR p_discount_amount > 20 THEN
        RAISE EXCEPTION 'Invalid tenant payment terms';
    END IF;

    IF p_bike_id IS NOT NULL THEN
        SELECT * INTO selected_bike FROM bikes WHERE id = p_bike_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Bike not found'; END IF;
        SELECT id INTO previous_tenant_id FROM tenants WHERE bike_id = p_bike_id FOR UPDATE;
        IF previous_tenant_id IS NOT NULL THEN
            PERFORM close_tenant_rental(previous_tenant_id, p_first_payment_date);
            UPDATE tenants SET bike_id = NULL WHERE id = previous_tenant_id;
        END IF;
        IF p_first_payment_date IS NULL THEN RAISE EXCEPTION 'Rental start date is required'; END IF;
    END IF;

    INSERT INTO tenants (
        name, slug, bike_id, weekly_payment, payment_day, next_payment_date,
        next_payment_amount, accounting_start_date, opening_balance, discount_amount,
        deposit, phone, telegram_username, battery_config, is_archived
    ) VALUES (
        BTRIM(p_name), p_slug, p_bike_id, p_weekly_payment, p_payment_day,
        CASE WHEN p_bike_id IS NULL THEN NULL ELSE p_first_payment_date + 7 END,
        CASE WHEN p_bike_id IS NULL THEN NULL ELSE GREATEST(p_weekly_payment - p_discount_amount, 0) END,
        COALESCE(p_first_payment_date, CURRENT_DATE), 0, p_discount_amount,
        COALESCE(p_deposit, 0), NULLIF(BTRIM(p_phone), ''),
        NULLIF(BTRIM(p_telegram_username), ''), NULLIF(BTRIM(p_battery_config), ''), FALSE
    ) RETURNING id INTO created_tenant_id;

    IF p_bike_id IS NOT NULL THEN
        UPDATE bikes SET status = 'in_rent' WHERE id = p_bike_id;
        PERFORM upsert_tenant_payment_terms(
            created_tenant_id, p_weekly_payment, p_payment_day,
            p_first_payment_date, p_discount_amount
        );
        INSERT INTO tenant_rental_events (
            tenant_id, event_type, effective_date, bike_id, bike_model, bike_type,
            battery_config, weekly_payment, discount_amount, reason
        ) VALUES (
            created_tenant_id, 'rental_started', p_first_payment_date,
            p_bike_id, selected_bike.model, selected_bike.type,
            NULLIF(BTRIM(p_battery_config), ''), p_weekly_payment,
            p_discount_amount, 'Аренда началась'
        );
        PERFORM ensure_tenant_payment_charges(created_tenant_id, p_first_payment_date);
    END IF;

    RETURN created_tenant_id;
END;
$$;

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
    created_payment_id UUID;
BEGIN
    IF p_amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;
    IF p_payment_date IS NULL THEN RAISE EXCEPTION 'Payment date is required'; END IF;
    PERFORM 1 FROM tenants WHERE id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;

    PERFORM ensure_tenant_payment_charges(p_tenant_id, p_payment_date);

    INSERT INTO payments (tenant_id, amount, payment_date, comment)
    VALUES (p_tenant_id, p_amount, p_payment_date, NULLIF(BTRIM(p_comment), ''))
    RETURNING id INTO created_payment_id;
    RETURN created_payment_id;
END;
$$;

-- The browser already prevents future end dates. Comparing to the database
-- host's date would reject valid local dates when their calendars differ.
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
    IF p_end_date IS NULL THEN RAISE EXCEPTION 'Rental end date is required'; END IF;
    IF p_final_amount IS NULL OR p_final_amount < 0 THEN RAISE EXCEPTION 'Final amount must not be negative'; END IF;
    IF NULLIF(BTRIM(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Rental end reason is required'; END IF;

    SELECT * INTO tenant_row FROM tenants WHERE id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;
    IF tenant_row.bike_id IS NULL THEN RAISE EXCEPTION 'Tenant has no active rental'; END IF;

    PERFORM close_tenant_rental(p_tenant_id, p_end_date);

    SELECT * INTO v_charge
    FROM tenant_payment_charges
    WHERE tenant_id = p_tenant_id
      AND period_start <= p_end_date
      AND period_end >= p_end_date
    ORDER BY is_automatic ASC, due_date DESC, created_at DESC
    LIMIT 1 FOR UPDATE;

    IF FOUND THEN
        v_due_date := CASE
            WHEN EXISTS (
                SELECT 1 FROM tenant_payment_charges AS other_charge
                WHERE other_charge.tenant_id = p_tenant_id
                  AND other_charge.due_date = p_end_date
                  AND other_charge.id <> v_charge.id
            ) THEN v_charge.due_date ELSE p_end_date END;
        UPDATE tenant_payment_charges
        SET due_date = v_due_date,
            period_end = p_end_date,
            amount = p_final_amount,
            status = CASE WHEN p_final_amount = 0 THEN 'waived' ELSE 'open' END,
            is_automatic = FALSE,
            comment = 'Завершение аренды: ' || BTRIM(p_reason)
        WHERE id = v_charge.id;
    ELSE
        calculation := calculate_tenant_rental_period(p_tenant_id, p_end_date, p_end_date);
        INSERT INTO tenant_payment_charges (
            tenant_id, due_date, period_start, period_end, amount, breakdown,
            comment, status, is_automatic
        ) VALUES (
            p_tenant_id, p_end_date, p_end_date, p_end_date, p_final_amount,
            COALESCE(calculation->'segments', '[]'::JSONB),
            'Завершение аренды: ' || BTRIM(p_reason),
            CASE WHEN p_final_amount = 0 THEN 'waived' ELSE 'open' END, FALSE
        );
    END IF;

    UPDATE tenant_rental_events
    SET amount = p_final_amount,
        reason = BTRIM(p_reason),
        details = details || jsonb_build_object('automatic_close', FALSE, 'final_amount', p_final_amount)
    WHERE tenant_id = p_tenant_id
      AND event_type = 'rental_ended'
      AND effective_date = p_end_date;

    UPDATE bikes SET status = 'available' WHERE id = tenant_row.bike_id;
    UPDATE tenants
    SET bike_id = NULL, next_payment_date = NULL,
        next_payment_amount = NULL, next_payment_comment = NULL
    WHERE id = p_tenant_id;
END;
$$;

DO $$
DECLARE
    charge_row RECORD;
    calculation JSONB;
BEGIN
    FOR charge_row IN
        SELECT id, tenant_id, period_start, period_end
        FROM tenant_payment_charges
        WHERE is_automatic = TRUE
    LOOP
        calculation := calculate_tenant_rental_period(
            charge_row.tenant_id, charge_row.period_start, charge_row.period_end
        );
        UPDATE tenant_payment_charges
        SET amount = COALESCE((calculation->>'amount')::NUMERIC, amount),
            breakdown = COALESCE(calculation->'segments', '[]'::JSONB)
        WHERE id = charge_row.id;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION ensure_tenant_payment_charges(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_tenant_payment_charges(UUID, DATE) TO authenticated;
REVOKE ALL ON FUNCTION ensure_all_tenant_payment_charges(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_all_tenant_payment_charges(DATE) TO authenticated;
REVOKE ALL ON FUNCTION update_tenant_profile(UUID, TEXT, TEXT, UUID, NUMERIC, INTEGER, DATE, NUMERIC, TEXT, TEXT, TEXT, TEXT, NUMERIC, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_tenant_profile(UUID, TEXT, TEXT, UUID, NUMERIC, INTEGER, DATE, NUMERIC, TEXT, TEXT, TEXT, TEXT, NUMERIC, DATE) TO authenticated;
REVOKE ALL ON FUNCTION create_tenant_with_rental(TEXT, TEXT, UUID, NUMERIC, INTEGER, DATE, NUMERIC, TEXT, TEXT, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_tenant_with_rental(TEXT, TEXT, UUID, NUMERIC, INTEGER, DATE, NUMERIC, TEXT, TEXT, TEXT, NUMERIC) TO authenticated;
REVOKE ALL ON FUNCTION record_tenant_payment(UUID, NUMERIC, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_tenant_payment(UUID, NUMERIC, DATE, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION finish_tenant_rental(UUID, DATE, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finish_tenant_rental(UUID, DATE, NUMERIC, TEXT) TO authenticated;
