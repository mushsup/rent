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
    previous_tenant_id UUID;
    v_next_payment_date DATE;
    v_days_until_payment INTEGER;
BEGIN
    IF p_weekly_payment < 0 OR p_payment_day NOT BETWEEN 1 AND 7 THEN
        RAISE EXCEPTION 'Invalid tenant payment terms';
    END IF;

    SELECT * INTO tenant_row FROM tenants WHERE id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;
    IF tenant_row.is_archived AND p_bike_id IS NOT NULL THEN
        RAISE EXCEPTION 'Unarchive tenant before assigning a bike';
    END IF;

    IF p_bike_id IS NOT NULL AND p_bike_id IS DISTINCT FROM tenant_row.bike_id THEN
        PERFORM 1 FROM bikes WHERE id = p_bike_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Bike not found'; END IF;

        SELECT id INTO previous_tenant_id
        FROM tenants
        WHERE bike_id = p_bike_id AND id <> p_tenant_id
        FOR UPDATE;

        IF previous_tenant_id IS NOT NULL THEN
            PERFORM close_tenant_rental(previous_tenant_id, CURRENT_DATE);
            UPDATE tenants SET bike_id = NULL WHERE id = previous_tenant_id;
        END IF;
    END IF;

    IF tenant_row.bike_id IS NOT NULL
       AND tenant_row.bike_id IS DISTINCT FROM p_bike_id THEN
        PERFORM close_tenant_rental(p_tenant_id, CURRENT_DATE);
    END IF;

    IF p_bike_id IS NULL THEN
        v_next_payment_date := NULL;
    ELSE
        v_next_payment_date := COALESCE(p_next_payment_date, CURRENT_DATE);
        v_days_until_payment := MOD(
            p_payment_day - EXTRACT(ISODOW FROM v_next_payment_date)::INTEGER + 7,
            7
        );
        v_next_payment_date := v_next_payment_date + v_days_until_payment;
    END IF;

    UPDATE tenants
    SET name = p_name,
        slug = p_slug,
        bike_id = p_bike_id,
        weekly_payment = p_weekly_payment,
        payment_day = p_payment_day,
        next_payment_date = v_next_payment_date,
        next_payment_amount = CASE WHEN p_bike_id IS NULL THEN NULL ELSE p_weekly_payment END,
        deposit = p_deposit,
        admin_comment = p_admin_comment
    WHERE id = p_tenant_id;

    IF p_bike_id IS NOT NULL THEN
        PERFORM upsert_tenant_payment_terms(
            p_tenant_id, p_weekly_payment, p_payment_day, CURRENT_DATE
        );
        PERFORM ensure_tenant_payment_charges(p_tenant_id);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION sync_bike_status_from_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.bike_id IS NOT NULL THEN
            UPDATE bikes
            SET status = 'available'
            WHERE id = OLD.bike_id
              AND NOT EXISTS (SELECT 1 FROM tenants WHERE bike_id = OLD.bike_id);
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.bike_id IS DISTINCT FROM NEW.bike_id AND OLD.bike_id IS NOT NULL THEN
        UPDATE bikes
        SET status = 'available'
        WHERE id = OLD.bike_id
          AND NOT EXISTS (SELECT 1 FROM tenants WHERE bike_id = OLD.bike_id);
    END IF;

    IF NEW.bike_id IS NOT NULL THEN
        UPDATE bikes SET status = 'in_rent' WHERE id = NEW.bike_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_sync_bike_status ON tenants;
CREATE TRIGGER tenants_sync_bike_status
AFTER INSERT OR UPDATE OF bike_id OR DELETE ON tenants
FOR EACH ROW
EXECUTE FUNCTION sync_bike_status_from_tenant();

CREATE OR REPLACE FUNCTION prevent_unassigned_bike_in_rent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'in_rent'
       AND NOT EXISTS (SELECT 1 FROM tenants WHERE bike_id = NEW.id) THEN
        RAISE EXCEPTION 'Bike cannot be in rent without an assigned tenant';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bikes_require_tenant_for_rent ON bikes;
CREATE TRIGGER bikes_require_tenant_for_rent
BEFORE INSERT OR UPDATE OF status ON bikes
FOR EACH ROW
EXECUTE FUNCTION prevent_unassigned_bike_in_rent();

UPDATE bikes
SET status = 'available'
WHERE status = 'in_rent'
  AND NOT EXISTS (SELECT 1 FROM tenants WHERE bike_id = bikes.id);

UPDATE bikes
SET status = 'in_rent'
WHERE EXISTS (SELECT 1 FROM tenants WHERE bike_id = bikes.id)
  AND status <> 'in_rent';

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
    previous_tenant_id UUID;
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
        PERFORM 1 FROM bikes WHERE id = p_bike_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Bike not found'; END IF;

        SELECT id INTO previous_tenant_id
        FROM tenants
        WHERE bike_id = p_bike_id
        FOR UPDATE;

        IF previous_tenant_id IS NOT NULL THEN
            PERFORM close_tenant_rental(previous_tenant_id, CURRENT_DATE);
            UPDATE tenants SET bike_id = NULL WHERE id = previous_tenant_id;
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
        name, slug, bike_id, weekly_payment, payment_day, next_payment_date,
        next_payment_amount, accounting_start_date, opening_balance, deposit, phone, telegram_username, is_archived
    )
    VALUES (
        BTRIM(p_name), p_slug, p_bike_id, p_weekly_payment, p_payment_day,
        v_first_payment_date, p_weekly_payment, v_first_payment_date, 0, COALESCE(p_deposit, 0),
        NULLIF(BTRIM(p_phone), ''), NULLIF(BTRIM(p_telegram_username), ''), FALSE
    )
    RETURNING id INTO created_tenant_id;

    IF p_bike_id IS NOT NULL THEN
        PERFORM upsert_tenant_payment_terms(
            created_tenant_id, p_weekly_payment, p_payment_day, v_first_payment_date
        );
        PERFORM ensure_tenant_payment_charges(created_tenant_id);
    END IF;

    RETURN created_tenant_id;
END;
$$;
