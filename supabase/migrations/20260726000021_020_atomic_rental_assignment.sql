CREATE UNIQUE INDEX IF NOT EXISTS tenants_one_assignee_per_bike_idx
    ON tenants (bike_id)
    WHERE bike_id IS NOT NULL;

CREATE OR REPLACE FUNCTION create_tenant_with_rental(
    p_name TEXT,
    p_slug TEXT,
    p_bike_id UUID,
    p_weekly_payment NUMERIC,
    p_payment_day INTEGER,
    p_first_payment_date DATE,
    p_deposit NUMERIC,
    p_phone TEXT DEFAULT NULL,
    p_telegram_username TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    created_tenant_id UUID;
    v_first_payment_date DATE;
    v_days_until_payment INTEGER;
BEGIN
    IF NULLIF(BTRIM(p_name), '') IS NULL OR NULLIF(BTRIM(p_slug), '') IS NULL THEN
        RAISE EXCEPTION 'Tenant name and slug are required';
    END IF;
    IF p_weekly_payment < 0 OR p_payment_day NOT BETWEEN 1 AND 7 THEN
        RAISE EXCEPTION 'Invalid tenant payment terms';
    END IF;

    IF p_bike_id IS NOT NULL THEN
        PERFORM 1
        FROM bikes
        WHERE id = p_bike_id
          AND status = 'available'
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Bike is not available';
        END IF;

        IF p_first_payment_date IS NULL THEN
            RAISE EXCEPTION 'First payment date is required';
        END IF;

        v_days_until_payment := MOD(
            p_payment_day - EXTRACT(ISODOW FROM p_first_payment_date)::INTEGER + 7,
            7
        );
        v_first_payment_date := p_first_payment_date + v_days_until_payment;
    END IF;

    INSERT INTO tenants (
        name,
        slug,
        bike_id,
        weekly_payment,
        payment_day,
        next_payment_date,
        next_payment_amount,
        deposit,
        phone,
        telegram_username,
        is_archived
    )
    VALUES (
        BTRIM(p_name),
        p_slug,
        p_bike_id,
        p_weekly_payment,
        p_payment_day,
        v_first_payment_date,
        p_weekly_payment,
        COALESCE(p_deposit, 0),
        NULLIF(BTRIM(p_phone), ''),
        NULLIF(BTRIM(p_telegram_username), ''),
        FALSE
    )
    RETURNING id INTO created_tenant_id;

    IF p_bike_id IS NOT NULL THEN
        UPDATE bikes SET status = 'in_rent' WHERE id = p_bike_id;

        PERFORM upsert_tenant_payment_terms(
            created_tenant_id,
            p_weekly_payment,
            p_payment_day,
            v_first_payment_date
        );
        PERFORM ensure_tenant_payment_charges(created_tenant_id);
    END IF;

    RETURN created_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_bike_inventory(
    p_bike_id UUID,
    p_model TEXT,
    p_type TEXT,
    p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    assigned_tenant_id UUID;
BEGIN
    IF p_status NOT IN ('available', 'in_rent', 'maintenance') THEN
        RAISE EXCEPTION 'Invalid bike status';
    END IF;

    PERFORM 1 FROM bikes WHERE id = p_bike_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bike not found';
    END IF;

    SELECT id INTO assigned_tenant_id
    FROM tenants
    WHERE bike_id = p_bike_id
    FOR UPDATE;

    IF p_status = 'in_rent' AND assigned_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Assign the bike from a tenant profile';
    END IF;

    UPDATE bikes
    SET model = BTRIM(p_model),
        type = BTRIM(p_type),
        status = p_status
    WHERE id = p_bike_id;

    IF assigned_tenant_id IS NOT NULL AND p_status <> 'in_rent' THEN
        UPDATE tenants
        SET bike_id = NULL,
            next_payment_date = NULL
        WHERE id = assigned_tenant_id;

        DELETE FROM tenant_payment_terms
        WHERE tenant_id = assigned_tenant_id
          AND effective_from > CURRENT_DATE;

        UPDATE tenant_payment_terms
        SET effective_to = CURRENT_DATE
        WHERE tenant_id = assigned_tenant_id
          AND effective_from <= CURRENT_DATE
          AND effective_to IS NULL;

        DELETE FROM tenant_payment_charges
        WHERE tenant_id = assigned_tenant_id
          AND due_date > CURRENT_DATE
          AND is_automatic = TRUE;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION create_tenant_with_rental(TEXT, TEXT, UUID, NUMERIC, INTEGER, DATE, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_tenant_with_rental(TEXT, TEXT, UUID, NUMERIC, INTEGER, DATE, NUMERIC, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION update_bike_inventory(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_bike_inventory(UUID, TEXT, TEXT, TEXT) TO authenticated;
