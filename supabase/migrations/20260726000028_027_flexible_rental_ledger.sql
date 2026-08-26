ALTER TABLE tenant_payment_charges
    ADD COLUMN IF NOT EXISTS period_start DATE,
    ADD COLUMN IF NOT EXISTS period_end DATE;

UPDATE tenant_payment_charges
SET period_start = COALESCE(period_start, due_date - 6),
    period_end = COALESCE(period_end, due_date)
WHERE period_start IS NULL OR period_end IS NULL;

ALTER TABLE tenant_payment_charges
    ALTER COLUMN period_start SET NOT NULL,
    ALTER COLUMN period_end SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tenant_payment_charges_period_valid'
    ) THEN
        ALTER TABLE tenant_payment_charges
            ADD CONSTRAINT tenant_payment_charges_period_valid
            CHECK (period_end >= period_start);
    END IF;
END;
$$;

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

    v_payment_day := COALESCE(
        tenant_row.payment_day,
        EXTRACT(ISODOW FROM tenant_row.next_payment_date)::INTEGER,
        1
    );
    v_due_date := COALESCE(
        tenant_row.next_payment_date,
        CURRENT_DATE + MOD(v_payment_day - EXTRACT(ISODOW FROM CURRENT_DATE)::INTEGER + 7, 7)
    );

    WHILE v_due_date <= CURRENT_DATE LOOP
        v_due_amount := GREATEST(COALESCE(
            CASE WHEN v_due_date = tenant_row.next_payment_date THEN tenant_row.next_payment_amount END,
            (
                SELECT term.weekly_payment
                FROM tenant_payment_terms AS term
                WHERE term.tenant_id = p_tenant_id
                  AND term.effective_from <= v_due_date
                  AND (term.effective_to IS NULL OR term.effective_to >= v_due_date)
                ORDER BY term.effective_from DESC
                LIMIT 1
            ),
            tenant_row.weekly_payment,
            0
        ), 0);

        INSERT INTO tenant_payment_charges (
            tenant_id, due_date, period_start, period_end, amount, comment, is_automatic
        )
        VALUES (
            p_tenant_id, v_due_date, v_due_date - 6, v_due_date, v_due_amount,
            COALESCE(
                CASE WHEN v_due_date = tenant_row.next_payment_date THEN tenant_row.next_payment_comment END,
                'Автоматически создано'
            ),
            TRUE
        )
        ON CONFLICT (tenant_id, due_date) DO NOTHING;

        v_due_date := v_due_date + 7;
    END LOOP;

    v_next_due_date := v_due_date;
    v_due_amount := GREATEST(COALESCE(
        (
            SELECT term.weekly_payment
            FROM tenant_payment_terms AS term
            WHERE term.tenant_id = p_tenant_id
              AND term.effective_from <= v_next_due_date
              AND (term.effective_to IS NULL OR term.effective_to >= v_next_due_date)
            ORDER BY term.effective_from DESC
            LIMIT 1
        ),
        tenant_row.weekly_payment,
        0
    ), 0);

    INSERT INTO tenant_payment_charges (
        tenant_id, due_date, period_start, period_end, amount, comment, is_automatic
    )
    VALUES (
        p_tenant_id, v_next_due_date, v_next_due_date - 6, v_next_due_date,
        v_due_amount, 'Автоматически создано', TRUE
    )
    ON CONFLICT (tenant_id, due_date) DO UPDATE
    SET amount = CASE
            WHEN tenant_payment_charges.is_automatic THEN EXCLUDED.amount
            ELSE tenant_payment_charges.amount
        END,
        period_start = CASE
            WHEN tenant_payment_charges.is_automatic THEN EXCLUDED.period_start
            ELSE tenant_payment_charges.period_start
        END,
        period_end = CASE
            WHEN tenant_payment_charges.is_automatic THEN EXCLUDED.period_end
            ELSE tenant_payment_charges.period_end
        END,
        comment = CASE
            WHEN tenant_payment_charges.is_automatic
                THEN COALESCE(tenant_payment_charges.comment, EXCLUDED.comment)
            ELSE tenant_payment_charges.comment
        END;

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
    v_charge tenant_payment_charges%ROWTYPE;
    v_days INTEGER;
    v_total_days INTEGER;
    v_prorated_amount NUMERIC;
BEGIN
    IF p_end_date IS NULL THEN RAISE EXCEPTION 'Rental end date is required'; END IF;

    PERFORM 1 FROM tenants WHERE id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;

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
        v_total_days := (v_charge.period_end - v_charge.period_start) + 1;
        v_days := (p_end_date - v_charge.period_start) + 1;
        v_prorated_amount := ROUND(v_charge.amount * v_days / v_total_days, 2);

        UPDATE tenant_payment_charges
        SET amount = v_prorated_amount,
            period_end = p_end_date,
            is_automatic = FALSE,
            comment = CONCAT(
                'Досрочное завершение аренды: ',
                v_days,
                CASE WHEN v_days = 1 THEN ' день' ELSE ' дней' END
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

    UPDATE tenants
    SET next_payment_date = NULL,
        next_payment_amount = NULL,
        next_payment_comment = NULL
    WHERE id = p_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_tenant_expected_payment(
    p_tenant_id UUID,
    p_due_date DATE,
    p_amount NUMERIC,
    p_comment TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    tenant_row tenants%ROWTYPE;
BEGIN
    IF p_due_date IS NULL OR p_amount < 0 THEN
        RAISE EXCEPTION 'Invalid expected payment';
    END IF;

    SELECT * INTO tenant_row FROM tenants WHERE id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;

    IF tenant_row.next_payment_date IS DISTINCT FROM p_due_date THEN
        DELETE FROM tenant_payment_charges
        WHERE tenant_id = p_tenant_id
          AND due_date = tenant_row.next_payment_date
          AND due_date > CURRENT_DATE
          AND is_automatic = TRUE;
    END IF;

    UPDATE tenants
    SET next_payment_date = p_due_date,
        next_payment_amount = p_amount,
        next_payment_comment = NULLIF(BTRIM(p_comment), '')
    WHERE id = p_tenant_id;

    INSERT INTO tenant_payment_charges (
        tenant_id, due_date, period_start, period_end, amount, comment, is_automatic
    )
    VALUES (
        p_tenant_id, p_due_date, p_due_date - 6, p_due_date, p_amount,
        NULLIF(BTRIM(p_comment), ''), FALSE
    )
    ON CONFLICT (tenant_id, due_date) DO UPDATE
    SET amount = EXCLUDED.amount,
        comment = EXCLUDED.comment,
        is_automatic = FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION save_tenant_charge(
    p_tenant_id UUID,
    p_charge_id UUID,
    p_due_date DATE,
    p_period_start DATE,
    p_period_end DATE,
    p_amount NUMERIC,
    p_comment TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'open'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_charge_id UUID;
    v_old_due_date DATE;
BEGIN
    IF p_due_date IS NULL
       OR p_period_start IS NULL
       OR p_period_end < p_period_start
       OR p_amount < 0
       OR p_status NOT IN ('open', 'waived') THEN
        RAISE EXCEPTION 'Invalid charge';
    END IF;

    PERFORM 1 FROM tenants WHERE id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;

    IF p_charge_id IS NULL THEN
        INSERT INTO tenant_payment_charges (
            tenant_id, due_date, period_start, period_end, amount, comment, status, is_automatic
        )
        VALUES (
            p_tenant_id, p_due_date, p_period_start, p_period_end, p_amount,
            NULLIF(BTRIM(p_comment), ''), p_status, FALSE
        )
        RETURNING id INTO v_charge_id;
    ELSE
        SELECT due_date INTO v_old_due_date
        FROM tenant_payment_charges
        WHERE id = p_charge_id AND tenant_id = p_tenant_id
        FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Charge not found'; END IF;

        UPDATE tenant_payment_charges
        SET due_date = p_due_date,
            period_start = p_period_start,
            period_end = p_period_end,
            amount = p_amount,
            comment = NULLIF(BTRIM(p_comment), ''),
            status = p_status,
            is_automatic = FALSE
        WHERE id = p_charge_id
        RETURNING id INTO v_charge_id;

        UPDATE tenants
        SET next_payment_date = p_due_date,
            next_payment_amount = p_amount,
            next_payment_comment = NULLIF(BTRIM(p_comment), '')
        WHERE id = p_tenant_id
          AND next_payment_date = v_old_due_date;
    END IF;

    RETURN v_charge_id;
END;
$$;

CREATE OR REPLACE FUNCTION delete_tenant_charge(
    p_tenant_id UUID,
    p_charge_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_due_date DATE;
BEGIN
    PERFORM 1 FROM tenants WHERE id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;

    SELECT due_date INTO v_due_date
    FROM tenant_payment_charges
    WHERE id = p_charge_id AND tenant_id = p_tenant_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Charge not found'; END IF;

    DELETE FROM tenant_payment_charges WHERE id = p_charge_id;

    UPDATE tenants
    SET next_payment_date = v_due_date + 7,
        next_payment_amount = weekly_payment,
        next_payment_comment = NULL
    WHERE id = p_tenant_id
      AND bike_id IS NOT NULL
      AND next_payment_date = v_due_date;

    IF EXISTS (
        SELECT 1 FROM tenants
        WHERE id = p_tenant_id AND bike_id IS NOT NULL AND next_payment_date = v_due_date + 7
    ) THEN
        PERFORM ensure_tenant_payment_charges(p_tenant_id);
    END IF;
END;
$$;

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
    IF p_bike_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM tenants WHERE bike_id = p_bike_id AND id <> p_tenant_id
    ) THEN
        RAISE EXCEPTION 'Bike is already assigned to another tenant';
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

    IF tenant_row.bike_id IS DISTINCT FROM p_bike_id THEN
        IF tenant_row.bike_id IS NOT NULL THEN
            UPDATE bikes SET status = 'available' WHERE id = tenant_row.bike_id;
        END IF;
        IF p_bike_id IS NOT NULL THEN
            UPDATE bikes SET status = 'in_rent' WHERE id = p_bike_id;
        END IF;
    END IF;

    IF p_bike_id IS NOT NULL THEN
        PERFORM upsert_tenant_payment_terms(
            p_tenant_id, p_weekly_payment, p_payment_day, CURRENT_DATE
        );
        PERFORM ensure_tenant_payment_charges(p_tenant_id);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION set_tenant_archived(p_tenant_id UUID, p_archived BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    tenant_row tenants%ROWTYPE;
BEGIN
    SELECT * INTO tenant_row FROM tenants WHERE id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;

    IF p_archived THEN
        IF tenant_row.bike_id IS NOT NULL THEN
            PERFORM close_tenant_rental(p_tenant_id, CURRENT_DATE);
            UPDATE bikes SET status = 'available' WHERE id = tenant_row.bike_id;
        END IF;
        UPDATE tenants
        SET is_archived = TRUE, bike_id = NULL
        WHERE id = p_tenant_id;
    ELSE
        UPDATE tenants SET is_archived = FALSE WHERE id = p_tenant_id;
    END IF;
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
    IF NOT FOUND THEN RAISE EXCEPTION 'Bike not found'; END IF;

    SELECT id INTO assigned_tenant_id
    FROM tenants WHERE bike_id = p_bike_id FOR UPDATE;

    IF p_status = 'in_rent' AND assigned_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Assign the bike from a tenant profile';
    END IF;

    UPDATE bikes
    SET model = BTRIM(p_model), type = BTRIM(p_type), status = p_status
    WHERE id = p_bike_id;

    IF assigned_tenant_id IS NOT NULL AND p_status <> 'in_rent' THEN
        PERFORM close_tenant_rental(assigned_tenant_id, CURRENT_DATE);
        UPDATE tenants SET bike_id = NULL WHERE id = assigned_tenant_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION get_public_tenant_profile(p_slug TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'id', tenant.id,
        'name', tenant.name,
        'slug', tenant.slug,
        'bike_id', tenant.bike_id,
        'weekly_payment', tenant.weekly_payment,
        'payment_day', tenant.payment_day,
        'next_payment_date', tenant.next_payment_date,
        'next_payment_amount', tenant.next_payment_amount,
        'admin_comment', tenant.admin_comment,
        'bikes', CASE WHEN bike.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', bike.id, 'model', bike.model
        ) END,
        'payments', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', payment.id,
                'amount', payment.amount,
                'payment_date', payment.payment_date,
                'created_at', payment.created_at
            ) ORDER BY payment.payment_date, payment.id)
            FROM payments AS payment
            WHERE payment.tenant_id = tenant.id
        ), '[]'::jsonb),
        'payment_charges', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', charge.id,
                'due_date', charge.due_date,
                'period_start', charge.period_start,
                'period_end', charge.period_end,
                'amount', charge.amount,
                'status', charge.status,
                'is_automatic', charge.is_automatic,
                'created_at', charge.created_at
            ) ORDER BY charge.due_date, charge.id)
            FROM tenant_payment_charges AS charge
            WHERE charge.tenant_id = tenant.id
        ), '[]'::jsonb),
        'payment_adjustments', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', adjustment.id,
                'direction', adjustment.direction,
                'amount', adjustment.amount,
                'adjustment_date', adjustment.adjustment_date,
                'created_at', adjustment.created_at
            ) ORDER BY adjustment.adjustment_date, adjustment.id)
            FROM tenant_payment_adjustments AS adjustment
            WHERE adjustment.tenant_id = tenant.id
        ), '[]'::jsonb),
        'payment_terms', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', term.id,
                'weekly_payment', term.weekly_payment,
                'payment_day', term.payment_day,
                'effective_from', term.effective_from,
                'effective_to', term.effective_to
            ) ORDER BY term.effective_from, term.id)
            FROM tenant_payment_terms AS term
            WHERE term.tenant_id = tenant.id
        ), '[]'::jsonb)
    )
    FROM tenants AS tenant
    LEFT JOIN bikes AS bike ON bike.id = tenant.bike_id
    WHERE tenant.slug = p_slug
      AND tenant.is_archived = FALSE
    LIMIT 1;
$$;

DELETE FROM tenant_payment_charges AS charge
USING tenants AS tenant
WHERE charge.tenant_id = tenant.id
  AND charge.is_automatic = TRUE
  AND charge.due_date > CURRENT_DATE
  AND (tenant.is_archived = TRUE OR tenant.bike_id IS NULL);

UPDATE tenants
SET next_payment_date = NULL,
    next_payment_amount = NULL,
    next_payment_comment = NULL
WHERE bike_id IS NULL;

REVOKE ALL ON FUNCTION close_tenant_rental(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION close_tenant_rental(UUID, DATE) TO authenticated;
REVOKE ALL ON FUNCTION save_tenant_charge(UUID, UUID, DATE, DATE, DATE, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_tenant_charge(UUID, UUID, DATE, DATE, DATE, NUMERIC, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION delete_tenant_charge(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_tenant_charge(UUID, UUID) TO authenticated;
