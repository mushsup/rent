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
    v_days_until_payment INTEGER;
BEGIN
    SELECT * INTO tenant_row
    FROM tenants
    WHERE id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tenant not found';
    END IF;

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

        INSERT INTO tenant_payment_charges (tenant_id, due_date, amount, comment, is_automatic)
        VALUES (
            p_tenant_id,
            v_due_date,
            v_due_amount,
            COALESCE(
                CASE WHEN v_due_date = tenant_row.next_payment_date THEN tenant_row.next_payment_comment END,
                'Автоматически создано'
            ),
            TRUE
        )
        ON CONFLICT (tenant_id, due_date) DO NOTHING;

        v_days_until_payment := MOD(v_payment_day - EXTRACT(ISODOW FROM v_due_date)::INTEGER + 7, 7);
        IF v_days_until_payment = 0 THEN
            v_days_until_payment := 7;
        END IF;
        v_due_date := v_due_date + v_days_until_payment;
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

    INSERT INTO tenant_payment_charges (tenant_id, due_date, amount, comment, is_automatic)
    VALUES (p_tenant_id, v_next_due_date, v_due_amount, 'Автоматически создано', TRUE)
    ON CONFLICT (tenant_id, due_date) DO UPDATE
    SET amount = CASE
            WHEN tenant_payment_charges.is_automatic THEN EXCLUDED.amount
            ELSE tenant_payment_charges.amount
        END,
        comment = CASE
            WHEN tenant_payment_charges.is_automatic THEN COALESCE(tenant_payment_charges.comment, EXCLUDED.comment)
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
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero';
    END IF;

    IF p_payment_date IS NULL THEN
        RAISE EXCEPTION 'Payment date is required';
    END IF;

    PERFORM 1 FROM tenants WHERE id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tenant not found';
    END IF;

    PERFORM ensure_tenant_payment_charges(p_tenant_id);

    INSERT INTO payments (tenant_id, amount, payment_date, comment)
    VALUES (p_tenant_id, p_amount, p_payment_date, NULLIF(BTRIM(p_comment), ''))
    RETURNING id INTO created_payment_id;

    RETURN created_payment_id;
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

    SELECT * INTO tenant_row
    FROM tenants
    WHERE id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tenant not found';
    END IF;

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

    INSERT INTO tenant_payment_charges (tenant_id, due_date, amount, comment, is_automatic)
    VALUES (p_tenant_id, p_due_date, p_amount, NULLIF(BTRIM(p_comment), ''), FALSE)
    ON CONFLICT (tenant_id, due_date) DO UPDATE
    SET amount = EXCLUDED.amount,
        comment = EXCLUDED.comment,
        is_automatic = FALSE;
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
    SELECT * INTO tenant_row
    FROM tenants
    WHERE id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tenant not found';
    END IF;

    IF p_archived THEN
        IF tenant_row.bike_id IS NOT NULL THEN
            UPDATE bikes SET status = 'available' WHERE id = tenant_row.bike_id;
        END IF;

        UPDATE tenants
        SET is_archived = TRUE,
            bike_id = NULL,
            next_payment_date = NULL
        WHERE id = p_tenant_id;

        DELETE FROM tenant_payment_terms
        WHERE tenant_id = p_tenant_id
          AND effective_from > CURRENT_DATE;

        UPDATE tenant_payment_terms
        SET effective_to = CURRENT_DATE
        WHERE tenant_id = p_tenant_id
          AND effective_from <= CURRENT_DATE
          AND effective_to IS NULL;

        DELETE FROM tenant_payment_charges
        WHERE tenant_id = p_tenant_id
          AND due_date > CURRENT_DATE
          AND is_automatic = TRUE;
    ELSE
        UPDATE tenants
        SET is_archived = FALSE
        WHERE id = p_tenant_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION delete_tenant_with_relations(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    tenant_bike_id UUID;
BEGIN
    SELECT bike_id INTO tenant_bike_id
    FROM tenants
    WHERE id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tenant not found';
    END IF;

    IF tenant_bike_id IS NOT NULL THEN
        UPDATE bikes SET status = 'available' WHERE id = tenant_bike_id;
    END IF;

    DELETE FROM tenants WHERE id = p_tenant_id;
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

    SELECT * INTO tenant_row
    FROM tenants
    WHERE id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tenant not found';
    END IF;

    IF tenant_row.is_archived AND p_bike_id IS NOT NULL THEN
        RAISE EXCEPTION 'Unarchive tenant before assigning a bike';
    END IF;

    IF p_bike_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM tenants
        WHERE bike_id = p_bike_id AND id <> p_tenant_id
    ) THEN
        RAISE EXCEPTION 'Bike is already assigned to another tenant';
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
        next_payment_amount = p_weekly_payment,
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

    IF p_bike_id IS NULL THEN
        DELETE FROM tenant_payment_terms
        WHERE tenant_id = p_tenant_id
          AND effective_from > CURRENT_DATE;

        UPDATE tenant_payment_terms
        SET effective_to = CURRENT_DATE
        WHERE tenant_id = p_tenant_id
          AND effective_from <= CURRENT_DATE
          AND effective_to IS NULL;

        DELETE FROM tenant_payment_charges
        WHERE tenant_id = p_tenant_id
          AND due_date > CURRENT_DATE
          AND is_automatic = TRUE;
    ELSE
        PERFORM upsert_tenant_payment_terms(
            p_tenant_id,
            p_weekly_payment,
            p_payment_day,
            CURRENT_DATE
        );
        PERFORM ensure_tenant_payment_charges(p_tenant_id);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_all_tenant_payment_charges()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    tenant_id UUID;
BEGIN
    FOR tenant_id IN
        SELECT id
        FROM public.tenants
        WHERE COALESCE(is_archived, FALSE) = FALSE
          AND bike_id IS NOT NULL
          AND weekly_payment > 0
    LOOP
        PERFORM public.ensure_tenant_payment_charges(tenant_id);
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION ensure_tenant_payment_charges(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_tenant_payment_charges(UUID) TO authenticated;
REVOKE ALL ON FUNCTION record_tenant_payment(UUID, NUMERIC, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_tenant_payment(UUID, NUMERIC, DATE, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION update_tenant_expected_payment(UUID, DATE, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_tenant_expected_payment(UUID, DATE, NUMERIC, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION set_tenant_archived(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_tenant_archived(UUID, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION delete_tenant_with_relations(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_tenant_with_relations(UUID) TO authenticated;
REVOKE ALL ON FUNCTION update_tenant_profile(UUID, TEXT, TEXT, UUID, NUMERIC, INTEGER, DATE, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_tenant_profile(UUID, TEXT, TEXT, UUID, NUMERIC, INTEGER, DATE, NUMERIC, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.ensure_all_tenant_payment_charges() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_all_tenant_payment_charges() TO postgres;
