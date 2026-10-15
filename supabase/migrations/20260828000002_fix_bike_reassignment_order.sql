CREATE OR REPLACE FUNCTION public.update_tenant_profile(
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

REVOKE ALL ON FUNCTION public.update_tenant_profile(UUID, TEXT, TEXT, UUID, NUMERIC, INTEGER, DATE, NUMERIC, TEXT, TEXT, TEXT, TEXT, NUMERIC, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_tenant_profile(UUID, TEXT, TEXT, UUID, NUMERIC, INTEGER, DATE, NUMERIC, TEXT, TEXT, TEXT, TEXT, NUMERIC, DATE) TO authenticated;
