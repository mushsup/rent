CREATE OR REPLACE FUNCTION update_tenant_profile(
    p_tenant_id UUID,
    p_name TEXT,
    p_slug TEXT,
    p_bike_id UUID,
    p_weekly_payment NUMERIC,
    p_payment_day INTEGER,
    p_next_payment_date DATE,
    p_deposit NUMERIC,
    p_admin_comment TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    tenant_row tenants%ROWTYPE;
BEGIN
    IF p_weekly_payment < 0 OR p_payment_day NOT BETWEEN 1 AND 7 THEN
        RAISE EXCEPTION 'Invalid tenant payment terms';
    END IF;

    SELECT * INTO tenant_row
    FROM tenants
    WHERE id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tenant not found';
    END IF;

    IF p_bike_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM tenants
        WHERE bike_id = p_bike_id AND id <> p_tenant_id
    ) THEN
        RAISE EXCEPTION 'Bike is already assigned to another tenant';
    END IF;

    UPDATE tenants
    SET name = p_name,
        slug = p_slug,
        bike_id = p_bike_id,
        weekly_payment = p_weekly_payment,
        payment_day = p_payment_day,
        next_payment_date = p_next_payment_date,
        deposit = p_deposit,
        admin_comment = p_admin_comment
    WHERE id = p_tenant_id;

    IF tenant_row.bike_id IS DISTINCT FROM p_bike_id THEN
        IF tenant_row.bike_id IS NOT NULL THEN
            UPDATE bikes SET status = 'available' WHERE id = tenant_row.bike_id;
        END IF;
        IF p_bike_id IS NOT NULL THEN
            UPDATE bikes SET status = 'in_rent' WHERE id = p_bike_id;
        END IF;
    END IF;

    PERFORM upsert_tenant_payment_terms(
        p_tenant_id,
        p_weekly_payment,
        p_payment_day,
        CURRENT_DATE
    );
END;
$$;

REVOKE ALL ON FUNCTION update_tenant_profile(UUID, TEXT, TEXT, UUID, NUMERIC, INTEGER, DATE, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_tenant_profile(UUID, TEXT, TEXT, UUID, NUMERIC, INTEGER, DATE, NUMERIC, TEXT) TO authenticated;
