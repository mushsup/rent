ALTER TABLE public.rental_contracts
    ADD COLUMN requested_bike_type TEXT;

CREATE UNIQUE INDEX rental_audit_events_idempotency_idx
    ON public.rental_audit_events (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.beta_create_booking(
    p_tenant_id UUID,
    p_bike_id UUID,
    p_starts_at TIMESTAMPTZ,
    p_planned_ends_at TIMESTAMPTZ,
    p_weekly_rate NUMERIC,
    p_payment_day INTEGER,
    p_deposit_amount NUMERIC,
    p_notes TEXT DEFAULT NULL,
    p_release_buffer_minutes INTEGER DEFAULT 0,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS public.rental_contracts
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
    tenant_row public.tenants%ROWTYPE;
    bike_row public.bikes%ROWTYPE;
    created_contract public.rental_contracts%ROWTYPE;
    booking_status TEXT;
    availability_end TIMESTAMPTZ;
    effective_date DATE;
BEGIN
    IF p_starts_at IS NULL OR p_weekly_rate < 0 OR p_deposit_amount < 0
       OR p_payment_day NOT BETWEEN 1 AND 7
       OR p_release_buffer_minutes < 0 OR p_release_buffer_minutes > 1440 THEN
        RAISE EXCEPTION 'Invalid booking terms';
    END IF;

    booking_status := CASE WHEN p_starts_at <= NOW() + INTERVAL '5 minutes' THEN 'active' ELSE 'reserved' END;
    IF booking_status = 'reserved' AND p_planned_ends_at IS NULL THEN
        RAISE EXCEPTION 'A future reservation requires an end date';
    END IF;
    IF p_planned_ends_at IS NOT NULL AND p_planned_ends_at <= p_starts_at THEN
        RAISE EXCEPTION 'Booking end must be after its start';
    END IF;

    SELECT * INTO tenant_row FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;
    IF tenant_row.is_archived THEN RAISE EXCEPTION 'Archived tenant cannot make a booking'; END IF;

    SELECT * INTO bike_row FROM public.bikes WHERE id = p_bike_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bike not found'; END IF;

    IF EXISTS (
        SELECT 1 FROM public.bike_availability_blocks AS block
        WHERE block.bike_id = p_bike_id
          AND block.blocks_booking
          AND block.status IN ('scheduled', 'in_progress')
          AND TSTZRANGE(block.starts_at, block.ends_at, '[)')
              && TSTZRANGE(p_starts_at, p_planned_ends_at, '[)')
    ) THEN
        RAISE EXCEPTION 'Bike is blocked for the selected period';
    END IF;

    IF booking_status = 'active' THEN
        IF tenant_row.bike_id IS NOT NULL THEN
            RAISE EXCEPTION 'Tenant already has an active bike';
        END IF;
        IF bike_row.status <> 'available' OR EXISTS (
            SELECT 1 FROM public.tenants WHERE bike_id = p_bike_id
        ) THEN
            RAISE EXCEPTION 'Bike is not available';
        END IF;
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        SELECT contract.* INTO created_contract
        FROM public.rental_audit_events AS event
        JOIN public.rental_contracts AS contract ON contract.id = event.contract_id
        WHERE event.idempotency_key = p_idempotency_key
        LIMIT 1;
        IF FOUND THEN RETURN created_contract; END IF;
    END IF;

    INSERT INTO public.rental_contracts (
        tenant_id, customer_name, status, starts_at, planned_ends_at,
        weekly_rate, payment_day, deposit_amount, notes, source,
        requested_bike_type, created_by
    ) VALUES (
        tenant_row.id, tenant_row.name, booking_status, p_starts_at,
        p_planned_ends_at, p_weekly_rate, p_payment_day, p_deposit_amount,
        NULLIF(BTRIM(p_notes), ''), 'beta', bike_row.type, auth.uid()
    ) RETURNING * INTO created_contract;

    availability_end := CASE WHEN p_planned_ends_at IS NULL THEN NULL
        ELSE p_planned_ends_at + MAKE_INTERVAL(mins => p_release_buffer_minutes) END;

    INSERT INTO public.rental_allocations (
        contract_id, bike_id, bike_model, state, starts_at, ends_at,
        release_buffer, availability_period
    ) VALUES (
        created_contract.id, bike_row.id, bike_row.model,
        CASE WHEN booking_status = 'active' THEN 'active' ELSE 'reserved' END,
        p_starts_at, p_planned_ends_at,
        MAKE_INTERVAL(mins => p_release_buffer_minutes),
        TSTZRANGE(p_starts_at, availability_end, '[)')
    );

    IF booking_status = 'active' THEN
        effective_date := (p_starts_at AT TIME ZONE 'Europe/Warsaw')::DATE;
        PERFORM public.update_tenant_profile(
            tenant_row.id,
            tenant_row.name,
            tenant_row.slug,
            bike_row.id,
            p_weekly_rate,
            p_payment_day,
            effective_date + 7,
            p_deposit_amount,
            tenant_row.admin_comment,
            tenant_row.phone,
            tenant_row.telegram_username,
            tenant_row.battery_config,
            0,
            effective_date
        );
    END IF;

    INSERT INTO public.rental_audit_events (
        contract_id, event_type, effective_at, details, actor_id, idempotency_key
    ) VALUES (
        created_contract.id,
        CASE WHEN booking_status = 'active' THEN 'rental_started' ELSE 'reservation_created' END,
        p_starts_at,
        JSONB_BUILD_OBJECT('bike_id', bike_row.id, 'bike_model', bike_row.model),
        auth.uid(),
        NULLIF(BTRIM(p_idempotency_key), '')
    );

    RETURN created_contract;
EXCEPTION
    WHEN exclusion_violation THEN
        RAISE EXCEPTION 'Bike is already reserved for the selected period';
END;
$$;

REVOKE ALL ON FUNCTION public.beta_create_booking(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, INTEGER, NUMERIC, TEXT, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.beta_create_booking(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, INTEGER, NUMERIC, TEXT, INTEGER, TEXT) TO authenticated;
