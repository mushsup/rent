-- Make rental changes first-class ledger events and calculate weekly charges
-- from the exact daily rental state. Financial history remains append-only;
-- profile changes create snapshots instead of rewriting prior periods.

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_discount_amount_valid;
ALTER TABLE tenants
    ADD CONSTRAINT tenants_discount_amount_valid
    CHECK (discount_amount >= 0 AND discount_amount <= 20);

ALTER TABLE tenant_payment_terms
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE tenant_payment_terms DROP CONSTRAINT IF EXISTS tenant_payment_terms_discount_valid;
ALTER TABLE tenant_payment_terms
    ADD CONSTRAINT tenant_payment_terms_discount_valid
    CHECK (discount_amount >= 0 AND discount_amount <= 20);

ALTER TABLE tenant_payment_charges
    ADD COLUMN IF NOT EXISTS breakdown JSONB NOT NULL DEFAULT '[]'::JSONB;

CREATE TABLE IF NOT EXISTS tenant_rental_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'rental_started', 'bike_changed', 'battery_changed', 'rate_changed',
        'discount_changed', 'terms_changed', 'day_off', 'rental_ended'
    )),
    effective_date DATE NOT NULL,
    bike_id UUID REFERENCES bikes(id) ON DELETE SET NULL,
    bike_model TEXT,
    bike_type TEXT,
    battery_config TEXT,
    weekly_payment NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (weekly_payment >= 0),
    discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0 AND discount_amount <= 20),
    amount NUMERIC(10,2),
    reason TEXT,
    details JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_by UUID DEFAULT auth.uid(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tenant_rental_events_tenant_date_idx
    ON tenant_rental_events (tenant_id, effective_date, created_at);

ALTER TABLE tenant_rental_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Administrators can manage tenant_rental_events" ON tenant_rental_events;
CREATE POLICY "Administrators can manage tenant_rental_events"
    ON tenant_rental_events FOR ALL TO authenticated
    USING (is_admin()) WITH CHECK (is_admin());

REVOKE ALL ON TABLE tenant_rental_events FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tenant_rental_events TO authenticated;

ALTER TABLE tenant_payment_adjustments
    ADD COLUMN IF NOT EXISTS source_event_id UUID
    REFERENCES tenant_rental_events(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_payment_adjustments_source_event_idx
    ON tenant_payment_adjustments (source_event_id)
    WHERE source_event_id IS NOT NULL;

-- Existing tenants receive one initial snapshot. Later changes append snapshots.
INSERT INTO tenant_rental_events (
    tenant_id, event_type, effective_date, bike_id, bike_model, bike_type,
    battery_config, weekly_payment, discount_amount, reason
)
SELECT tenant.id,
       'rental_started',
       COALESCE(tenant.accounting_start_date, tenant.next_payment_date, CURRENT_DATE),
       tenant.bike_id,
       bike.model,
       bike.type,
       tenant.battery_config,
       tenant.weekly_payment,
       tenant.discount_amount,
       'Начальное состояние аренды'
FROM tenants AS tenant
LEFT JOIN bikes AS bike ON bike.id = tenant.bike_id
WHERE tenant.bike_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM tenant_rental_events AS existing
      WHERE existing.tenant_id = tenant.id
  );

DROP FUNCTION IF EXISTS upsert_tenant_payment_terms(UUID, NUMERIC, INTEGER, DATE);
CREATE OR REPLACE FUNCTION upsert_tenant_payment_terms(
    p_tenant_id UUID,
    p_weekly_payment NUMERIC,
    p_payment_day INTEGER,
    p_effective_from DATE DEFAULT CURRENT_DATE,
    p_discount_amount NUMERIC DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    IF p_weekly_payment < 0
       OR p_payment_day NOT BETWEEN 1 AND 7
       OR p_effective_from IS NULL
       OR p_discount_amount < 0
       OR p_discount_amount > 20 THEN
        RAISE EXCEPTION 'Invalid payment terms';
    END IF;

    IF EXISTS (
        SELECT 1 FROM tenant_payment_terms
        WHERE tenant_id = p_tenant_id
          AND weekly_payment = p_weekly_payment
          AND payment_day = p_payment_day
          AND discount_amount = p_discount_amount
          AND effective_from <= p_effective_from
          AND (effective_to IS NULL OR effective_to >= p_effective_from)
    ) THEN
        RETURN;
    END IF;

    DELETE FROM tenant_payment_terms
    WHERE tenant_id = p_tenant_id AND effective_from >= p_effective_from;

    UPDATE tenant_payment_terms
    SET effective_to = p_effective_from - 1
    WHERE tenant_id = p_tenant_id
      AND effective_from < p_effective_from
      AND (effective_to IS NULL OR effective_to >= p_effective_from);

    INSERT INTO tenant_payment_terms (
        tenant_id, weekly_payment, payment_day, discount_amount,
        effective_from, effective_to
    ) VALUES (
        p_tenant_id, p_weekly_payment, p_payment_day, p_discount_amount,
        p_effective_from, NULL
    );
END;
$$;

REVOKE ALL ON FUNCTION upsert_tenant_payment_terms(UUID, NUMERIC, INTEGER, DATE, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_tenant_payment_terms(UUID, NUMERIC, INTEGER, DATE, NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION calculate_tenant_rental_period(
    p_tenant_id UUID,
    p_period_start DATE,
    p_period_end DATE
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH rental_days AS (
        SELECT day_value::DATE AS rental_day
        FROM generate_series(p_period_start, p_period_end, INTERVAL '1 day') AS day_value
    ),
    daily_state AS (
        SELECT rental_day,
               COALESCE(event.bike_id, tenant.bike_id) AS bike_id,
               COALESCE(event.bike_model, bike.model) AS bike_model,
               COALESCE(event.bike_type, bike.type) AS bike_type,
               COALESCE(event.battery_config, tenant.battery_config) AS battery_config,
               COALESCE(term.weekly_payment, event.weekly_payment, tenant.weekly_payment, 0) AS weekly_payment,
               COALESCE(term.discount_amount, event.discount_amount, tenant.discount_amount, 0) AS discount_amount
        FROM rental_days
        JOIN tenants AS tenant ON tenant.id = p_tenant_id
        LEFT JOIN bikes AS bike ON bike.id = tenant.bike_id
        LEFT JOIN LATERAL (
            SELECT snapshot.*
            FROM tenant_rental_events AS snapshot
            WHERE snapshot.tenant_id = p_tenant_id
              AND snapshot.event_type NOT IN ('day_off', 'rental_ended')
              AND snapshot.effective_date <= rental_day
            ORDER BY snapshot.effective_date DESC, snapshot.created_at DESC, snapshot.id DESC
            LIMIT 1
        ) AS event ON TRUE
        LEFT JOIN LATERAL (
            SELECT payment_term.*
            FROM tenant_payment_terms AS payment_term
            WHERE payment_term.tenant_id = p_tenant_id
              AND payment_term.effective_from <= rental_day
              AND (payment_term.effective_to IS NULL OR payment_term.effective_to >= rental_day)
            ORDER BY payment_term.effective_from DESC, payment_term.created_at DESC
            LIMIT 1
        ) AS term ON TRUE
    ),
    marked AS (
        SELECT *,
               ROW_NUMBER() OVER (ORDER BY rental_day)
               - ROW_NUMBER() OVER (
                   PARTITION BY bike_id, bike_model, bike_type, battery_config,
                                weekly_payment, discount_amount
                   ORDER BY rental_day
               ) AS segment_group
        FROM daily_state
    ),
    segments AS (
        SELECT MIN(rental_day) AS segment_start,
               MAX(rental_day) AS segment_end,
               bike_id, bike_model, bike_type, battery_config,
               weekly_payment, discount_amount,
               COUNT(*)::INTEGER AS days,
               ROUND(GREATEST(weekly_payment - discount_amount, 0) * COUNT(*) / 7.0, 2) AS amount
        FROM marked
        GROUP BY segment_group, bike_id, bike_model, bike_type, battery_config,
                 weekly_payment, discount_amount
        ORDER BY segment_start
    )
    SELECT jsonb_build_object(
        'amount', COALESCE(ROUND(SUM(amount), 2), 0),
        'segments', COALESCE(jsonb_agg(jsonb_build_object(
            'period_start', segment_start,
            'period_end', segment_end,
            'days', days,
            'bike_id', bike_id,
            'bike_model', bike_model,
            'bike_type', bike_type,
            'battery_config', battery_config,
            'weekly_payment', weekly_payment,
            'discount_amount', discount_amount,
            'amount', amount
        ) ORDER BY segment_start), '[]'::JSONB)
    )
    FROM segments;
$$;

REVOKE ALL ON FUNCTION calculate_tenant_rental_period(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION calculate_tenant_rental_period(UUID, DATE, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION refresh_tenant_rental_charges(
    p_tenant_id UUID,
    p_effective_from DATE DEFAULT CURRENT_DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    charge_row RECORD;
    calculation JSONB;
BEGIN
    FOR charge_row IN
        SELECT id, period_start, period_end
        FROM tenant_payment_charges
        WHERE tenant_id = p_tenant_id
          AND is_automatic = TRUE
          AND period_end >= p_effective_from
        ORDER BY period_start
    LOOP
        calculation := calculate_tenant_rental_period(
            p_tenant_id, charge_row.period_start, charge_row.period_end
        );
        UPDATE tenant_payment_charges
        SET amount = COALESCE((calculation->>'amount')::NUMERIC, 0),
            breakdown = COALESCE(calculation->'segments', '[]'::JSONB)
        WHERE id = charge_row.id;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION refresh_tenant_rental_charges(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refresh_tenant_rental_charges(UUID, DATE) TO authenticated;

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
    v_payment_day INTEGER;
    calculation JSONB;
BEGIN
    SELECT * INTO tenant_row FROM tenants WHERE id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;

    IF tenant_row.is_archived OR tenant_row.bike_id IS NULL OR tenant_row.weekly_payment <= 0 THEN
        DELETE FROM tenant_payment_charges
        WHERE tenant_id = p_tenant_id AND due_date > CURRENT_DATE AND is_automatic = TRUE;
        RETURN;
    END IF;

    v_payment_day := COALESCE(
        tenant_row.payment_day,
        EXTRACT(ISODOW FROM tenant_row.next_payment_date)::INTEGER,
        EXTRACT(ISODOW FROM CURRENT_DATE)::INTEGER
    );
    v_due_date := COALESCE(tenant_row.next_payment_date, CURRENT_DATE);

    WHILE v_due_date <= CURRENT_DATE LOOP
        calculation := calculate_tenant_rental_period(p_tenant_id, v_due_date, v_due_date + 6);
        INSERT INTO tenant_payment_charges (
            tenant_id, due_date, period_start, period_end, amount, breakdown,
            comment, is_automatic
        ) VALUES (
            p_tenant_id, v_due_date, v_due_date, v_due_date + 6,
            COALESCE((calculation->>'amount')::NUMERIC, tenant_row.weekly_payment),
            COALESCE(calculation->'segments', '[]'::JSONB),
            COALESCE(CASE WHEN v_due_date = tenant_row.next_payment_date THEN tenant_row.next_payment_comment END, 'Автоматически создано'),
            TRUE
        )
        ON CONFLICT (tenant_id, due_date) DO UPDATE
        SET period_start = EXCLUDED.period_start,
            period_end = EXCLUDED.period_end,
            amount = CASE WHEN tenant_payment_charges.is_automatic THEN EXCLUDED.amount ELSE tenant_payment_charges.amount END,
            breakdown = CASE WHEN tenant_payment_charges.is_automatic THEN EXCLUDED.breakdown ELSE tenant_payment_charges.breakdown END;
        v_due_date := v_due_date + 7;
    END LOOP;

    v_next_due_date := v_due_date;
    calculation := calculate_tenant_rental_period(p_tenant_id, v_next_due_date, v_next_due_date + 6);
    INSERT INTO tenant_payment_charges (
        tenant_id, due_date, period_start, period_end, amount, breakdown,
        comment, is_automatic
    ) VALUES (
        p_tenant_id, v_next_due_date, v_next_due_date, v_next_due_date + 6,
        COALESCE((calculation->>'amount')::NUMERIC, tenant_row.weekly_payment),
        COALESCE(calculation->'segments', '[]'::JSONB),
        'Автоматически создано', TRUE
    )
    ON CONFLICT (tenant_id, due_date) DO UPDATE
    SET period_start = EXCLUDED.period_start,
        period_end = EXCLUDED.period_end,
        amount = CASE WHEN tenant_payment_charges.is_automatic THEN EXCLUDED.amount ELSE tenant_payment_charges.amount END,
        breakdown = CASE WHEN tenant_payment_charges.is_automatic THEN EXCLUDED.breakdown ELSE tenant_payment_charges.breakdown END;

    UPDATE tenants
    SET next_payment_date = v_next_due_date,
        next_payment_amount = COALESCE((calculation->>'amount')::NUMERIC, tenant_row.weekly_payment)
    WHERE id = p_tenant_id;

    DELETE FROM tenant_payment_charges
    WHERE tenant_id = p_tenant_id AND due_date > v_next_due_date AND is_automatic = TRUE;
END;
$$;

DROP FUNCTION IF EXISTS update_tenant_profile(UUID, TEXT, TEXT, UUID, NUMERIC, INTEGER, DATE, NUMERIC, TEXT, TEXT, TEXT, TEXT);
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
    p_discount_amount NUMERIC DEFAULT 0
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
       OR p_discount_amount < 0 OR p_discount_amount > 20 THEN
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
            PERFORM close_tenant_rental(previous_tenant_id, CURRENT_DATE);
            UPDATE tenants SET bike_id = NULL WHERE id = previous_tenant_id;
        END IF;
    END IF;

    IF p_bike_id IS NULL AND tenant_row.bike_id IS NOT NULL THEN
        PERFORM close_tenant_rental(p_tenant_id, CURRENT_DATE);
        UPDATE bikes SET status = 'available' WHERE id = tenant_row.bike_id;
    ELSIF tenant_row.bike_id IS DISTINCT FROM p_bike_id THEN
        UPDATE bikes SET status = 'available' WHERE id = tenant_row.bike_id;
        UPDATE bikes SET status = 'in_rent' WHERE id = p_bike_id;
    END IF;

    IF p_bike_id IS NULL THEN
        v_next_payment_date := NULL;
    ELSE
        v_next_payment_date := COALESCE(p_next_payment_date, tenant_row.next_payment_date, CURRENT_DATE);
        IF p_payment_day IS DISTINCT FROM tenant_row.payment_day THEN
            v_days_until_payment := MOD(p_payment_day - EXTRACT(ISODOW FROM v_next_payment_date)::INTEGER + 7, 7);
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
            p_tenant_id, p_weekly_payment, p_payment_day, CURRENT_DATE, p_discount_amount
        );

        IF v_event_type IS NOT NULL THEN
            INSERT INTO tenant_rental_events (
                tenant_id, event_type, effective_date, bike_id, bike_model, bike_type,
                battery_config, weekly_payment, discount_amount, reason, details
            ) VALUES (
                p_tenant_id, v_event_type, CURRENT_DATE, p_bike_id, new_bike.model, new_bike.type,
                NULLIF(BTRIM(p_battery_config), ''), p_weekly_payment, p_discount_amount,
                'Условия аренды изменены',
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

        PERFORM ensure_tenant_payment_charges(p_tenant_id);
        PERFORM refresh_tenant_rental_charges(p_tenant_id, CURRENT_DATE);
    END IF;
END;
$$;

DROP FUNCTION IF EXISTS create_tenant_with_rental(TEXT, TEXT, UUID, NUMERIC, INTEGER, DATE, NUMERIC, TEXT, TEXT, TEXT);
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
            PERFORM close_tenant_rental(previous_tenant_id, CURRENT_DATE);
            UPDATE tenants SET bike_id = NULL WHERE id = previous_tenant_id;
        END IF;
        IF p_first_payment_date IS NULL THEN RAISE EXCEPTION 'First payment date is required'; END IF;
    END IF;

    INSERT INTO tenants (
        name, slug, bike_id, weekly_payment, payment_day, next_payment_date,
        next_payment_amount, accounting_start_date, opening_balance, discount_amount,
        deposit, phone, telegram_username, battery_config, is_archived
    ) VALUES (
        BTRIM(p_name), p_slug, p_bike_id, p_weekly_payment, p_payment_day,
        p_first_payment_date, GREATEST(p_weekly_payment - p_discount_amount, 0),
        p_first_payment_date, 0, p_discount_amount, COALESCE(p_deposit, 0),
        NULLIF(BTRIM(p_phone), ''), NULLIF(BTRIM(p_telegram_username), ''),
        NULLIF(BTRIM(p_battery_config), ''), FALSE
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
            NULLIF(BTRIM(p_battery_config), ''), p_weekly_payment, p_discount_amount,
            'Аренда началась'
        );
        PERFORM ensure_tenant_payment_charges(created_tenant_id);
    END IF;

    RETURN created_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION add_tenant_day_off(
    p_tenant_id UUID,
    p_day_off_date DATE,
    p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    tenant_row tenants%ROWTYPE;
    state_event tenant_rental_events%ROWTYPE;
    created_event_id UUID;
    daily_credit NUMERIC;
BEGIN
    IF p_day_off_date IS NULL OR NULLIF(BTRIM(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'Day off date and reason are required';
    END IF;
    SELECT * INTO tenant_row FROM tenants WHERE id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;

    IF EXISTS (
        SELECT 1 FROM tenant_rental_events
        WHERE tenant_id = p_tenant_id
          AND event_type = 'day_off'
          AND effective_date = p_day_off_date
    ) THEN
        RAISE EXCEPTION 'Day off already exists for this date';
    END IF;

    SELECT * INTO state_event
    FROM tenant_rental_events
    WHERE tenant_id = p_tenant_id
      AND event_type NOT IN ('day_off', 'rental_ended')
      AND effective_date <= p_day_off_date
    ORDER BY effective_date DESC, created_at DESC, id DESC
    LIMIT 1;

    daily_credit := ROUND(GREATEST(
        COALESCE(state_event.weekly_payment, tenant_row.weekly_payment)
        - COALESCE(state_event.discount_amount, tenant_row.discount_amount), 0
    ) / 7.0, 2);

    INSERT INTO tenant_rental_events (
        tenant_id, event_type, effective_date, bike_id, bike_model, bike_type,
        battery_config, weekly_payment, discount_amount, amount, reason
    ) VALUES (
        p_tenant_id, 'day_off', p_day_off_date,
        COALESCE(state_event.bike_id, tenant_row.bike_id), state_event.bike_model, state_event.bike_type,
        COALESCE(state_event.battery_config, tenant_row.battery_config),
        COALESCE(state_event.weekly_payment, tenant_row.weekly_payment),
        COALESCE(state_event.discount_amount, tenant_row.discount_amount),
        daily_credit, BTRIM(p_reason)
    ) RETURNING id INTO created_event_id;

    INSERT INTO tenant_payment_adjustments (
        tenant_id, direction, amount, adjustment_date, comment, source_event_id
    ) VALUES (
        p_tenant_id, 'credit', daily_credit, p_day_off_date,
        CONCAT('Выходной: ', BTRIM(p_reason)), created_event_id
    );

    RETURN created_event_id;
END;
$$;

REVOKE ALL ON FUNCTION update_tenant_profile(UUID, TEXT, TEXT, UUID, NUMERIC, INTEGER, DATE, NUMERIC, TEXT, TEXT, TEXT, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_tenant_profile(UUID, TEXT, TEXT, UUID, NUMERIC, INTEGER, DATE, NUMERIC, TEXT, TEXT, TEXT, TEXT, NUMERIC) TO authenticated;
REVOKE ALL ON FUNCTION create_tenant_with_rental(TEXT, TEXT, UUID, NUMERIC, INTEGER, DATE, NUMERIC, TEXT, TEXT, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_tenant_with_rental(TEXT, TEXT, UUID, NUMERIC, INTEGER, DATE, NUMERIC, TEXT, TEXT, TEXT, NUMERIC) TO authenticated;
REVOKE ALL ON FUNCTION add_tenant_day_off(UUID, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_tenant_day_off(UUID, DATE, TEXT) TO authenticated;

-- Refresh all automatic periods and expose safe rental event snapshots in the
-- public tenant ledger.
DO $$
DECLARE tenant_record RECORD;
BEGIN
    FOR tenant_record IN SELECT id FROM tenants WHERE bike_id IS NOT NULL LOOP
        PERFORM ensure_tenant_payment_charges(tenant_record.id);
        PERFORM refresh_tenant_rental_charges(tenant_record.id, DATE '1900-01-01');
    END LOOP;
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
        'id', tenant.id, 'name', tenant.name, 'slug', tenant.slug,
        'weekly_payment', tenant.weekly_payment, 'discount_amount', tenant.discount_amount,
        'payment_day', tenant.payment_day, 'next_payment_date', tenant.next_payment_date,
        'next_payment_amount', tenant.next_payment_amount,
        'accounting_start_date', tenant.accounting_start_date, 'opening_balance', tenant.opening_balance,
        'battery_config', tenant.battery_config, 'admin_comment', tenant.admin_comment,
        'bikes', CASE WHEN bike.id IS NULL THEN NULL ELSE jsonb_build_object('id', bike.id, 'model', bike.model, 'type', bike.type) END,
        'payments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', payment.id, 'amount', payment.amount, 'payment_date', payment.payment_date, 'created_at', payment.created_at) ORDER BY payment.payment_date, payment.id) FROM payments AS payment WHERE payment.tenant_id = tenant.id), '[]'::jsonb),
        'payment_charges', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', charge.id, 'due_date', charge.due_date, 'period_start', charge.period_start, 'period_end', charge.period_end, 'amount', charge.amount, 'breakdown', charge.breakdown, 'status', charge.status, 'is_automatic', charge.is_automatic, 'created_at', charge.created_at) ORDER BY charge.due_date, charge.id) FROM tenant_payment_charges AS charge WHERE charge.tenant_id = tenant.id), '[]'::jsonb),
        'payment_adjustments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', adjustment.id, 'direction', adjustment.direction, 'amount', adjustment.amount, 'adjustment_date', adjustment.adjustment_date, 'comment', adjustment.comment, 'source_event_id', adjustment.source_event_id, 'created_at', adjustment.created_at) ORDER BY adjustment.adjustment_date, adjustment.id) FROM tenant_payment_adjustments AS adjustment WHERE adjustment.tenant_id = tenant.id), '[]'::jsonb),
        'payment_terms', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', term.id, 'weekly_payment', term.weekly_payment, 'discount_amount', term.discount_amount, 'payment_day', term.payment_day, 'effective_from', term.effective_from, 'effective_to', term.effective_to) ORDER BY term.effective_from, term.id) FROM tenant_payment_terms AS term WHERE term.tenant_id = tenant.id), '[]'::jsonb),
        'rental_events', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', event.id, 'event_type', event.event_type, 'effective_date', event.effective_date, 'bike_id', event.bike_id, 'bike_model', event.bike_model, 'bike_type', event.bike_type, 'battery_config', event.battery_config, 'weekly_payment', event.weekly_payment, 'discount_amount', event.discount_amount, 'amount', event.amount, 'reason', event.reason, 'details', event.details, 'created_at', event.created_at) ORDER BY event.effective_date, event.created_at, event.id) FROM tenant_rental_events AS event WHERE event.tenant_id = tenant.id), '[]'::jsonb)
    )
    FROM tenants AS tenant
    LEFT JOIN bikes AS bike ON bike.id = tenant.bike_id
    WHERE tenant.slug = p_slug AND tenant.is_archived = FALSE
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_public_tenant_profile(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_tenant_profile(TEXT) TO anon, authenticated;
